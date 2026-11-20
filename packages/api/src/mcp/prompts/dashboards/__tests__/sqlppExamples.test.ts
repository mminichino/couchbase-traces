import { findClickhouseOnlyConstructs } from '@couchbase-traces/common-utils/dist/couchbase/clickhouseOnly';

import {
  buildDashboardExamplesPrompt,
  buildQueryGuidePrompt,
} from '@/mcp/prompts/dashboards/content';

// Agents copy these examples verbatim into cbt_sql and raw SQL tiles, which
// run as SQL++ without translation.
const sqlTemplates = (text: string) =>
  [...text.matchAll(/sqlTemplate: "((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);

describe('dashboard prompt SQL examples', () => {
  const examples = buildDashboardExamplesPrompt('trace', 'log', 'conn');
  const guide = buildQueryGuidePrompt();

  it('writes every raw SQL template in SQL++', () => {
    const templates = [...sqlTemplates(examples), ...sqlTemplates(guide)];
    expect(templates.length).toBeGreaterThanOrEqual(4);
    for (const sql of templates) {
      expect(findClickhouseOnlyConstructs(sql)).toEqual([]);
      expect(sql).toContain('$__sourceTable');
    }
  });

  it.each([
    ['examples', examples],
    ['query guide', guide],
  ])('teaches no ClickHouse syntax in the %s', (_name, text) => {
    expect(text).not.toMatch(
      /countIf|fromUnixTimestamp|toStartOfInterval|DateTime64|\{\w+:Int64\}|\bmatch\(|TimestampTime/,
    );
  });
});
