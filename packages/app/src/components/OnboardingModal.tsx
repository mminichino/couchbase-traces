import { memo, useCallback, useEffect, useState } from 'react';
import {
  MetricsDataType,
  MetricTable,
  SourceKind,
  TSource,
} from '@couchbase-traces/common-utils/dist/types';
import { Button, Flex, Loader, Modal, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';

import { useBrandDisplayName } from '@/brand';
import { ConnectionForm } from '@/components/ConnectionForm';
import { useConnections } from '@/connection';
import { useMetadataWithSettings } from '@/hooks/useMetadata';
import {
  inferTableSourceConfig,
  useCreateSource,
  useSources,
  useUpdateSource,
} from '@/source';

import { TableSourceForm } from './Sources/SourceForm';
import { SourcesList } from './Sources/SourcesList';

function OnboardingModalComponent({
  requireSource = true,
}: {
  requireSource?: boolean;
}) {
  const brandName = useBrandDisplayName();
  const { data: sources } = useSources();
  const { data: connections } = useConnections();

  const startStep =
    connections?.length === 0
      ? 'connection'
      : sources?.length === 0 && requireSource
        ? 'auto-detect'
        : undefined;

  const [_step, setStep] = useState<
    'connection' | 'auto-detect' | 'source' | 'closed' | undefined
  >(undefined);

  const step = _step;

  useEffect(() => {
    if (startStep != null && step == null) {
      setStep(startStep);
    }
  }, [startStep, step]);
  useEffect(() => {
    if (
      (step === 'auto-detect' || step === 'source') &&
      sources &&
      sources.length > 0
    ) {
      // Sources may load in late once a connection is defined.
      // If this happens, close the modal, we don't want to bother the user
      // by forcing redefining their sources
      setStep('closed');
    }
  }, [step, sources]);

  const createSourceMutation = useCreateSource();
  const updateSourceMutation = useUpdateSource();
  const metadata = useMetadataWithSettings();

  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  // We should only try to auto-detect once
  const [hasAutodetected, setHasAutodetected] = useState(false);
  const [autoDetectedSources, setAutoDetectedSources] = useState<TSource[]>([]);

  const handleAutoDetectSources = useCallback(
    async (connectionId: string) => {
      try {
        setIsAutoDetecting(true);
        setHasAutodetected(true);

        const otelTables = await metadata.getOtelTables({ connectionId });

        if (!otelTables) {
          // No tables detected, go to manual source setup
          setStep('source');
          return;
        }

        const createdSources: TSource[] = [];

        // Create Log Source if available
        if (otelTables?.tables.logs) {
          const inferredConfig = await inferTableSourceConfig({
            kind: SourceKind.Log,
            databaseName: otelTables.database,
            tableName: otelTables.tables.logs,
            connectionId,
            metadata,
          });

          if (
            inferredConfig.kind === SourceKind.Log &&
            inferredConfig.timestampValueExpression != null
          ) {
            const logSource = await createSourceMutation.mutateAsync({
              source: {
                name: 'Logs',
                connection: connectionId,
                from: {
                  databaseName: otelTables.database,
                  tableName: otelTables.tables.logs,
                },
                ...inferredConfig,
                timestampValueExpression:
                  inferredConfig.timestampValueExpression,
                defaultTableSelectExpression:
                  inferredConfig.defaultTableSelectExpression ?? '',
              },
            });
            createdSources.push(logSource);
          } else {
            console.error(
              'Log source was found but missing required fields',
              inferredConfig,
            );
          }
        }

        // Create Trace Source if available
        if (otelTables?.tables.traces) {
          const inferredConfig = await inferTableSourceConfig({
            kind: SourceKind.Trace,
            databaseName: otelTables.database,
            tableName: otelTables.tables.traces,
            connectionId,
            metadata,
          });

          if (
            inferredConfig.kind === SourceKind.Trace &&
            inferredConfig.timestampValueExpression != null
          ) {
            const traceSource = await createSourceMutation.mutateAsync({
              source: {
                name: 'Traces',
                connection: connectionId,
                from: {
                  databaseName: otelTables.database,
                  tableName: otelTables.tables.traces,
                },
                ...inferredConfig,
                // Help typescript understand it's not null
                defaultTableSelectExpression:
                  inferredConfig.defaultTableSelectExpression ?? '',
                timestampValueExpression:
                  inferredConfig.timestampValueExpression,
                durationExpression: inferredConfig.durationExpression ?? '',
                durationPrecision: inferredConfig.durationPrecision ?? 9,
                traceIdExpression: inferredConfig.traceIdExpression ?? '',
                spanIdExpression: inferredConfig.spanIdExpression ?? '',
                parentSpanIdExpression:
                  inferredConfig.parentSpanIdExpression ?? '',
                spanNameExpression: inferredConfig.spanNameExpression ?? '',
                spanKindExpression: inferredConfig.spanKindExpression ?? '',
              },
            });
            createdSources.push(traceSource);
          } else {
            console.error(
              'Trace source was found but missing required fields',
              inferredConfig,
            );
          }
        }

        // Create Metrics Source if any metrics tables are available
        const hasMetrics =
          otelTables != null &&
          Object.values(otelTables.tables.metrics).some(t => t != null);
        if (hasMetrics) {
          const metricTables: MetricTable = {
            [MetricsDataType.Gauge]: '',
            [MetricsDataType.Histogram]: '',
            [MetricsDataType.Sum]: '',
            [MetricsDataType.Summary]: '',
            [MetricsDataType.ExponentialHistogram]: '',
          };
          if (otelTables.tables.metrics.gauge) {
            metricTables[MetricsDataType.Gauge] =
              otelTables.tables.metrics.gauge;
          }
          if (otelTables.tables.metrics.histogram) {
            metricTables[MetricsDataType.Histogram] =
              otelTables.tables.metrics.histogram;
          }
          if (otelTables.tables.metrics.sum) {
            metricTables[MetricsDataType.Sum] = otelTables.tables.metrics.sum;
          }
          if (otelTables.tables.metrics.summary) {
            metricTables[MetricsDataType.Summary] =
              otelTables.tables.metrics.summary;
          }
          if (otelTables.tables.metrics.expHistogram) {
            metricTables[MetricsDataType.ExponentialHistogram] =
              otelTables.tables.metrics.expHistogram;
          }

          const metricsSource = await createSourceMutation.mutateAsync({
            source: {
              kind: SourceKind.Metric,
              name: 'Metrics',
              connection: connectionId,
              from: {
                databaseName: otelTables.database,
                tableName: '',
              },
              timestampValueExpression: 'TimeUnix',
              metricTables,
              resourceAttributesExpression: 'ResourceAttributes',
            },
          });
          createdSources.push(metricsSource);
        }

        // Create Session Source if available
        if (otelTables?.tables.sessions) {
          const inferredConfig = await inferTableSourceConfig({
            kind: SourceKind.Session,
            databaseName: otelTables.database,
            tableName: otelTables.tables.sessions,
            connectionId,
            metadata,
          });
          const traceSource = createdSources.find(
            s => s.kind === SourceKind.Trace,
          );

          if (
            inferredConfig.kind === SourceKind.Session &&
            inferredConfig.timestampValueExpression != null &&
            traceSource != null
          ) {
            const sessionSource = await createSourceMutation.mutateAsync({
              source: {
                name: 'Sessions',
                connection: connectionId,
                from: {
                  databaseName: otelTables.database,
                  tableName: otelTables.tables.sessions,
                },
                ...inferredConfig,
                timestampValueExpression:
                  inferredConfig.timestampValueExpression,
                traceSourceId: traceSource.id, // this is required for session source creation
              },
            });
            createdSources.push(sessionSource);
          } else {
            console.error(
              'Session source was found but missing required fields',
              inferredConfig,
            );
          }
        }

        if (createdSources.length === 0) {
          console.error('No sources created due to missing required fields');
          // No sources created, go to manual source setup
          setStep('source');
          return;
        }

        // Update sources to link them together
        const logSource = createdSources.find(s => s.kind === SourceKind.Log);
        const traceSource = createdSources.find(
          s => s.kind === SourceKind.Trace,
        );
        const metricsSource = createdSources.find(
          s => s.kind === SourceKind.Metric,
        );
        const sessionSource = createdSources.find(
          s => s.kind === SourceKind.Session,
        );

        const updatePromises = [];

        if (logSource) {
          updatePromises.push(
            updateSourceMutation.mutateAsync({
              source: {
                ...logSource,
                ...(traceSource ? { traceSourceId: traceSource.id } : {}),
                ...(metricsSource ? { metricSourceId: metricsSource.id } : {}),
              },
            }),
          );
        }

        if (traceSource) {
          updatePromises.push(
            updateSourceMutation.mutateAsync({
              source: {
                ...traceSource,
                ...(logSource ? { logSourceId: logSource.id } : {}),
                ...(metricsSource ? { metricSourceId: metricsSource.id } : {}),
                ...(sessionSource ? { sessionSourceId: sessionSource.id } : {}),
              },
            }),
          );
        }

        await Promise.all(updatePromises);

        setAutoDetectedSources(createdSources);
        notifications.show({
          title: 'Success',
          message: `Automatically detected and created ${createdSources.length} source${createdSources.length > 1 ? 's' : ''}.`,
        });
        setStep('closed');
      } catch (err) {
        console.error('Error auto-detecting sources:', err);
        notifications.show({
          color: 'red',
          title: 'Error',
          message:
            'Failed to auto-detect telemetry sources. Please set up manually.',
        });
        // Fall back to manual source setup
        setStep('source');
      } finally {
        setIsAutoDetecting(false);
      }
    },
    [
      metadata,
      createSourceMutation,
      updateSourceMutation,
      setStep,
      setAutoDetectedSources,
    ],
  );

  // Trigger auto-detection when entering the auto-detect step
  useEffect(() => {
    if (
      step === 'auto-detect' && // we should be trying to auto detect
      sources?.length === 0 && // no sources yet
      connections && // we need connections
      connections.length > 0 &&
      isAutoDetecting === false && // make sure we aren't currently auto detecting
      hasAutodetected === false // only call it once
    ) {
      handleAutoDetectSources(connections[0].id);
    }
  }, [
    step,
    connections,
    handleAutoDetectSources,
    isAutoDetecting,
    sources,
    hasAutodetected,
  ]);

  return (
    <Modal
      data-testid="onboarding-modal"
      opened={step != null && step !== 'closed'}
      onClose={() => {}}
      title={`Welcome to ${brandName}`}
      size="xl"
      withCloseButton={false}
    >
      {step === 'connection' && connections != null && (
        <>
          <Text size="sm" mb="md">
            Let's set up your Couchbase connection
          </Text>
          {connections.length === 0 ? (
            <ConnectionForm
              connection={{
                id: '',
                kind: 'couchbase',
                name: 'Default',
                host: 'couchbase://localhost',
                username: 'Administrator',
                password: '',
              }}
              onSave={() => {
                if (hasAutodetected) {
                  setStep('source');
                } else {
                  setStep('auto-detect');
                }
              }}
              isNew={true}
            />
          ) : (
            <ConnectionForm
              connection={connections[0]}
              isNew={false}
              onSave={() => {
                // If we've already auto-detected, just go to manual source setup
                if (hasAutodetected) {
                  setStep('source');
                } else {
                  setStep('auto-detect');
                }
              }}
              showCancelButton={false}
              showDeleteButton={false}
            />
          )}
          <Text size="xs" mt="md">
            You can always add and edit connections later.
          </Text>
        </>
      )}
      {step === 'auto-detect' && (
        <>
          {isAutoDetecting ? (
            <>
              <Flex justify="center" align="center" direction="column" py="xl">
                <Loader size="md" mb="md" />
                <Text size="sm" c="dimmed" mb="md">
                  Detecting available tables...
                </Text>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => {
                    setIsAutoDetecting(false);
                    setStep('source');
                  }}
                >
                  Skip and setup manually
                </Button>
              </Flex>
            </>
          ) : autoDetectedSources.length > 0 ? (
            <>
              <Button
                variant="subtle"
                onClick={() => setStep('connection')}
                p="xs"
                mb="md"
              >
                <IconArrowLeft size={14} className="me-2" /> Back
              </Button>
              <Text size="sm" mb="md">
                We automatically detected and created{' '}
                {autoDetectedSources.length} source
                {autoDetectedSources.length > 1 ? 's' : ''} from your
                connection. You can review, edit, or continue.
              </Text>
              <SourcesList
                withCard={false}
                variant="default"
                showEmptyState={false}
              />
              <Flex justify="space-between" mt="md">
                <Button
                  variant="subtle"
                  onClick={() => {
                    setStep('source');
                  }}
                >
                  Add more sources
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setStep('closed');
                  }}
                >
                  Continue
                </Button>
              </Flex>
            </>
          ) : (
            <Flex justify="center" align="center" direction="column" py="xl">
              {/* We don't expect users to hit this - but this allows them to get unstuck if they do */}
              <Text size="sm" c="dimmed" mb="md">
                No OTel tables detected automatically, please setup sources
                manually.
              </Text>
              <Button
                variant="primary"
                onClick={() => {
                  setStep('source');
                }}
              >
                Continue
              </Button>
            </Flex>
          )}
        </>
      )}
      {step === 'source' && (
        <>
          <Button
            variant="subtle"
            onClick={() => setStep('connection')}
            p="xs"
            mb="md"
          >
            <IconArrowLeft size={14} className="me-2" /> Back
          </Button>
          <Text size="sm" mb="md">
            Lets set up a source table to query telemetry from.
          </Text>
          <TableSourceForm
            isNew
            defaultName="Logs"
            onCreate={() => {
              setStep('closed');
            }}
          />
          <Text size="xs" mt="lg">
            You can always add and edit sources later.
          </Text>
        </>
      )}
    </Modal>
  );
}
const OnboardingModal = memo(OnboardingModalComponent);
export default OnboardingModal;
