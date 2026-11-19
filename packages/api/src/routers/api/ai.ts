import { queryLanguageForConnection } from '@couchbase-traces/common-utils/dist/dataLayer';
import { APICallError, generateText, Output } from 'ai';
import express from 'express';
import { z } from 'zod';
import { validateRequest } from 'zod-express-middleware';

import {
  getAIMetadata,
  getAIModel,
  getChartConfigFromResolvedConfig,
} from '@/controllers/ai';
import {
  buildAssistantLineTableConfigSchema,
  buildChartAssistantPrompt,
} from '@/controllers/aiPrompts';
import { validateAiChartConfigForConnection } from '@/controllers/aiValidation';
import { getConnectionById } from '@/controllers/connection';
import { getSource } from '@/controllers/sources';
import { MCP_REQUEST_TIMEOUT } from '@/mcp/tools/query/helpers';
import { getNonNullUserWithTeam } from '@/middleware/auth';
import { DataClient } from '@/query';
import { llmTelemetry } from '@/utils/aiTelemetry';
import { couchbaseConsumerHttpResponse } from '@/utils/couchbaseConsumerErrors';
import {
  Api404Error,
  Api500Error,
  BaseError,
  StatusCode,
} from '@/utils/errors';
import { withOperationMetrics } from '@/utils/instrumentation';
import logger from '@/utils/logger';
import { idSchema } from '@/utils/zod';

const router = express.Router();

function mapCouchbaseError(
  err: unknown,
): { status: number; message: string } | null {
  const mapped = couchbaseConsumerHttpResponse(err, 'message');
  if (!mapped) return null;
  return { status: mapped.status, message: mapped.body.message };
}

router.post(
  '/assistant',
  validateRequest({
    body: z.object({
      text: z.string().min(1).max(10000),
      sourceId: idSchema,
    }),
  }),
  async (req, res, next) => {
    try {
      const model = getAIModel();

      const { teamId, userId } = getNonNullUserWithTeam(req);

      const { text, sourceId } = req.body;

      const source = await getSource(teamId.toString(), sourceId);

      if (source == null) {
        logger.error({ message: 'invalid source id', sourceId, teamId });
        throw new Api404Error('Invalid source');
      }

      const queryLanguage = await queryLanguageForConnection(
        source.connection.toString(),
      );

      const { allFieldsWithKeys, keyValues } = await getAIMetadata(source);

      const prompt = buildChartAssistantPrompt({
        text,
        source,
        queryLanguage,
        metadata: { allFieldsWithKeys, keyValues },
      });

      logger.info(prompt);

      const connection = await getConnectionById(
        teamId.toString(),
        source.connection.toString(),
        true,
      );
      if (connection == null) {
        throw new Api500Error('Invalid connection');
      }

      const dataClient = new DataClient({
        requestTimeout: MCP_REQUEST_TIMEOUT,
      });

      const chartConfig = await withOperationMetrics(
        'ai.assistant',
        async () => {
          try {
            const result = await generateText({
              model,
              output: Output.object({
                schema: buildAssistantLineTableConfigSchema(queryLanguage),
              }),
              ...llmTelemetry({
                teamId: teamId.toString(),
                userId: userId.toString(),
              }),
              prompt,
            });

            const resolved = getChartConfigFromResolvedConfig(
              result.output,
              source,
            );
            await validateAiChartConfigForConnection({
              chartConfig: resolved,
              source,
              client: dataClient,
              queryLanguage,
            });
            return resolved;
          } catch (err) {
            const couchbase = mapCouchbaseError(err);
            if (couchbase) {
              return Promise.reject(
                Object.assign(new Error(couchbase.message), {
                  statusCode: couchbase.status,
                }),
              );
            }
            if (err instanceof APICallError) {
              throw new Api500Error(
                `AI Provider Error. Status: ${err.statusCode}. Message: ${err.message}`,
              );
            }
            throw err;
          }
        },
        { source_kind: source.kind },
      );

      return res.json(chartConfig);
    } catch (e) {
      const couchbase = mapCouchbaseError(e);
      if (couchbase) {
        return res
          .status(couchbase.status)
          .json({ message: couchbase.message });
      }
      if (
        e != null &&
        typeof e === 'object' &&
        'statusCode' in e &&
        typeof (e as { statusCode: unknown }).statusCode === 'number'
      ) {
        const status = (e as { statusCode: number }).statusCode;
        const message =
          e instanceof Error
            ? e.message
            : StatusCode.INTERNAL_SERVER === status
              ? 'Something went wrong'
              : 'Bad Request';
        return res.status(status).json({ message });
      }
      if (e instanceof BaseError) {
        return res.status(e.statusCode).json({ message: e.name });
      }
      next(e);
    }
  },
);

export default router;
