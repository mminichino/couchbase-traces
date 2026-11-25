import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  histogramQuantileValue,
  quantile,
  quantileValue,
  sortedArrayQuantile,
} from '@/couchbase/fn/quantile';
import * as scalar from '@/couchbase/fn/scalar';
import {
  MAPPINGS,
  renderMappingsMarkdown,
  unsupportedReason,
} from '@/couchbase/functions';
import { sqlpp } from '@/couchbase/sqlpp';

function text(value: string | { statement: string }): string {
  return typeof value === 'string' ? value : value.statement;
}

describe('function builders', () => {
  it('renders each documented mapping from its builder', () => {
    const rendered: Record<string, string> = {
      count: scalar.count(),
      countOf: scalar.countOf('x'),
      countIf: scalar.countIf('c'),
      sumIf: scalar.sumIf('x', 'c'),
      aggIf: scalar.aggIf('AVG', 'x', 'c'),
      uniq: scalar.uniq('x'),
      anyValue: scalar.anyValue('x'),
      argMax: scalar.argMax('x', 't'),
      argMin: scalar.argMin('x', 't'),
      toUnixSeconds: scalar.toUnixSeconds('millis'),
      toUnixMillis: scalar.toUnixMillis('millis'),
      nowIso: scalar.nowIso(),
      unnest: scalar.unnest('arr', 'alias'),
      has: scalar.has('arr', 'v'),
      hasAny: scalar.hasAny('a', 'b'),
      hasAll: scalar.hasAll('a', 'b'),
      arrayLength: scalar.arrayLength('arr'),
      stringLength: scalar.stringLength('s'),
      isEmpty: scalar.isEmpty('arr'),
      isNotEmpty: scalar.isNotEmpty('arr'),
      mapGet: scalar.mapGet('m', 'k'),
      mapKeys: scalar.mapKeys('m'),
      mapValues: scalar.mapValues('m'),
      mapContains: text(scalar.mapContains('m', 'k')),
      jsonPath: text(scalar.jsonPath('doc', ['a', 'b'])),
      ilike: text(scalar.ilike('x', '%a%')),
      containsCI: text(scalar.containsCI('x', 'a')),
      regexMatch: text(scalar.regexMatch('x', 'a.*')),
      hasToken: text(scalar.hasToken('x', 'err')),
      lower: scalar.lower('x'),
      upper: scalar.upper('x'),
      concat: scalar.concat('a', 'b'),
      round: scalar.round('x'),
      floor: scalar.floor('x'),
      abs: scalar.abs('x'),
      toString: scalar.toString('x'),
      toNumber: scalar.toNumber('x'),
      toInt: scalar.toInt('x'),
      ifThen: scalar.ifThen('c', 'a', 'b'),
      multiIf: scalar.multiIf([['c', 'a']], 'b'),
      intDiv: scalar.intDiv('a', 'b'),
      groupArray: scalar.groupArray('x'),
      groupUniqArray: scalar.groupUniqArray('x'),
      topK: text(scalar.topK(5, 'x')),
      lag: scalar.lag('x', 'p', 'o'),
      quantile: text(quantile(0.95, 'x')),
      cast: scalar.cast('x', 'Float64'),
    };
    for (const row of MAPPINGS) {
      if (
        row.builder === 'none' ||
        row.builder === 'sqlpp' ||
        row.builder === 'timeBucketExpr' ||
        row.builder === 'histogramQuantile'
      ) {
        expect(row.sqlpp.length).toBeGreaterThan(0);
        continue;
      }
      expect(rendered[row.builder]).toEqual(expect.any(String));
      expect(rendered[row.builder].length).toBeGreaterThan(0);
    }
    expect(scalar.cast('x', 'Float64')).toBe('TONUMBER(x)');
    expect(() => scalar.cast('x', 'UUID')).toThrow(
      /Not supported on Couchbase/,
    );
    expect(
      text(
        scalar.hasToken('Body', 'err', {
          alias: 'd',
          index: 'fts',
          field: 'Body',
        }),
      ),
    ).toContain('SEARCH');
  });

  it('matches the javascript quantile and histogram references', () => {
    expect(quantileValue([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantileValue([], 0.5)).toBeNull();
    const bounds = [0, 10, 20];
    const counts = [1, 1, 0];
    expect(histogramQuantileValue(0.5, bounds, counts)).toEqual(
      expect.any(Number),
    );
    expect(histogramQuantileValue(0.5, [], [])).toBeNull();
    const nested = sqlpp`SELECT ${quantile(0.9, 'd.`v`')}`;
    expect(nested.statement).toContain('$p0');
    expect(nested.parameters.p0).toBe(0.9);
  });

  it('shares one interpolation between quantile and sortedArrayQuantile', () => {
    const q = sortedArrayQuantile('a', '$lvl');
    expect(q).toBe(
      'CASE WHEN ARRAY_LENGTH(a) = 0 THEN NULL ELSE a[FLOOR(($lvl * (ARRAY_LENGTH(a) - 1)))] + (($lvl * (ARRAY_LENGTH(a) - 1)) - FLOOR(($lvl * (ARRAY_LENGTH(a) - 1)))) * (a[CEIL(($lvl * (ARRAY_LENGTH(a) - 1)))] - a[FLOOR(($lvl * (ARRAY_LENGTH(a) - 1)))]) END',
    );
    const sorted =
      'ARRAY_SORT(ARRAY v FOR v IN ARRAY_AGG(CASE WHEN TRUE AND ISNUMBER(x) THEN x END) WHEN v IS NOT NULL END)';
    expect(quantile(0.5, 'x').statement).toBe(
      sortedArrayQuantile(sorted, '$p0'),
    );
  });

  it('documents every catalog construct that appears outside tests', () => {
    const catalog = JSON.parse(
      readFileSync(
        join(__dirname, '../../../../../port/state/inventory/sql-catalog.json'),
        'utf8',
      ),
    ) as {
      constructs: {
        name: string;
        category: string;
        files?: { path: string }[];
      }[];
    };
    const extra: { clickhouse: string; reason: string }[] = [];
    const seen = new Set(MAPPINGS.map(row => row.clickhouse));
    for (const construct of catalog.constructs) {
      if (seen.has(construct.name)) continue;
      const live = (construct.files ?? []).some(
        file =>
          !file.path.includes('__tests__') && !file.path.includes('.test.'),
      );
      if (!live) continue;
      seen.add(construct.name);
      extra.push({
        clickhouse: construct.name,
        reason: unsupportedReason(construct.name, construct.category),
      });
    }
    extra.sort((a, b) => a.clickhouse.localeCompare(b.clickhouse));
    const markdown = renderMappingsMarkdown(extra);
    const docPath = join(__dirname, '../../../../../docs/sqlpp-mapping.md');
    if (process.env.WRITE_SQLPP_DOC === '1') writeFileSync(docPath, markdown);
    const committed = readFileSync(
      join(__dirname, '../../../../../docs/sqlpp-mapping.md'),
      'utf8',
    );
    expect(committed).toBe(markdown);
  });
});
