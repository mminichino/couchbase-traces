import {
  BuilderChartConfigWithDateRange,
  SourceKind,
  TSource,
} from '@couchbase-traces/common-utils/dist/types';

import {
  ChartKeyJoiner,
  convertToNumberChartConfig,
  convertToTimeChartConfig,
  formatResponseForTimeChart,
} from '@/ChartUtils';
import {
  MAX_RENDERED_TIME_CHART_SERIES,
  resolveRenderedSeriesCap,
} from '@/defaults';
import { COLORS } from '@/utils';
// Anchor info/error to concrete hexes rather than `getChartColorInfo()` /
// `getChartColorError()` so a regression that breaks the helpers can't
// move expected and actual in lockstep. Keep in sync with
// `_chart-categorical-tokens.scss` (`chart-semantic-tokens` mixin) and
// `SEMANTIC_CHART_PALETTE` in `packages/app/src/utils.ts`.
const SEMANTIC_INFO_HEX = '#437eef';
const SEMANTIC_ERROR_HEX = '#ff725c';

describe('ChartUtils', () => {
  describe('formatResponseForTimeChart', () => {
    it('should throw an error if there is no timestamp column', () => {
      const res = {
        data: [
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 167783540.53459233,
          },
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 182291463.92714182,
          },
        ],
        meta: [
          {
            name: 'AVG(toFloat64OrDefault(toString(Duration)))',
            type: 'Float64',
          },
        ],
      };

      expect(() =>
        formatResponseForTimeChart({
          currentPeriodResponse: res,
          dateRange: [new Date(), new Date()],
          granularity: '1 minute',
          generateEmptyBuckets: false,
        }),
      ).toThrow(
        'No timestamp column found in result column metadata. Make sure a Date/DateTime column exists in the result set.\n\nResult column metadata: [{"name":"AVG(toFloat64OrDefault(toString(Duration)))","type":"Float64"}]',
      );
    });

    it('should return empty results for an empty response', () => {
      const res = {
        data: [],
        meta: [
          {
            name: 'AVG(toFloat64OrDefault(toString(Duration)))',
            type: 'Float64',
          },
          {
            name: '__hdx_time_bucket',
            type: 'DateTime',
          },
        ],
      };

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: res,
        dateRange: [new Date(), new Date()],
        granularity: '1 minute',
        generateEmptyBuckets: false,
      });

      expect(actual.graphResults).toEqual([]);

      expect(actual.timestampColumn).toEqual({
        name: '__hdx_time_bucket',
        type: 'DateTime',
      });
      expect(actual.lineData).toEqual([]);
    });

    it('returns empty results when an empty response cannot type its value columns', () => {
      // A Couchbase result with no rows has no values to infer a type from, so
      // a plain-SQL value column reads as String; ClickHouse would report it
      // from the schema. With no rows there are no series either way.
      const res = {
        data: [],
        meta: [
          { name: 'Calls', type: 'Nullable(String)' },
          { name: '__hdx_time_bucket', type: "DateTime64(9, 'UTC')" },
        ],
      };
      const actual = formatResponseForTimeChart({
        currentPeriodResponse: res,
        dateRange: [new Date(), new Date()],
        granularity: '1 minute',
        generateEmptyBuckets: false,
      });
      expect(actual.graphResults).toEqual([]);
      expect(actual.lineData).toEqual([]);
    });

    it('still rejects rows without a numeric value column', () => {
      const res = {
        data: [{ Calls: 'x', __hdx_time_bucket: '2025-11-26T11:12:00Z' }],
        meta: [
          { name: 'Calls', type: 'String' },
          { name: '__hdx_time_bucket', type: 'DateTime' },
        ],
      };
      expect(() =>
        formatResponseForTimeChart({
          currentPeriodResponse: res,
          dateRange: [new Date(), new Date()],
          granularity: '1 minute',
          generateEmptyBuckets: false,
        }),
      ).toThrow('No value columns found in result column metadata');
    });

    it('should format a response with a single value column and no group by', () => {
      const res = {
        data: [
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 167783540.53459233,
            __hdx_time_bucket: '2025-11-26T11:12:00Z',
          },
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 182291463.92714182,
            __hdx_time_bucket: '2025-11-26T11:13:00Z',
          },
        ],
        meta: [
          {
            name: 'AVG(toFloat64OrDefault(toString(Duration)))',
            type: 'Float64',
          },
          {
            name: '__hdx_time_bucket',
            type: 'DateTime',
          },
        ],
      };

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: res,
        dateRange: [new Date(), new Date()],
        granularity: '1 minute',
        generateEmptyBuckets: false,
      });

      expect(actual.graphResults).toEqual([
        {
          __hdx_time_bucket: 1764155520,
          'AVG(toFloat64OrDefault(toString(Duration)))': 167783540.53459233,
        },
        {
          __hdx_time_bucket: 1764155580,
          'AVG(toFloat64OrDefault(toString(Duration)))': 182291463.92714182,
        },
      ]);

      expect(actual.timestampColumn).toEqual({
        name: '__hdx_time_bucket',
        type: 'DateTime',
      });
      expect(actual.lineData).toEqual([
        {
          color: COLORS[0],
          dataKey: 'AVG(toFloat64OrDefault(toString(Duration)))',
          currentPeriodKey: 'AVG(toFloat64OrDefault(toString(Duration)))',
          previousPeriodKey:
            'AVG(toFloat64OrDefault(toString(Duration))) (previous)',
          displayName: 'AVG(toFloat64OrDefault(toString(Duration)))',
          valueColumnName: 'AVG(toFloat64OrDefault(toString(Duration)))',
          groupValues: [],
          isDashed: false,
        },
      ]);
    });

    it('should format a response with multiple value columns and a group by', () => {
      const res = {
        data: [
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 43828228.21181263,
            max: 563518061,
            ServiceName: 'checkout',
            __hdx_time_bucket: '2025-11-26T12:23:00Z',
          },
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 6759697.6283185845,
            max: 42092944,
            ServiceName: 'shipping',
            __hdx_time_bucket: '2025-11-26T12:23:00Z',
          },
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 36209980.6533264,
            max: 795111023,
            ServiceName: 'checkout',
            __hdx_time_bucket: '2025-11-26T12:24:00Z',
          },
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 6479038.598323171,
            max: 63136666,
            ServiceName: 'shipping',
            __hdx_time_bucket: '2025-11-26T12:24:00Z',
          },
        ],
        meta: [
          {
            name: 'AVG(toFloat64OrDefault(toString(Duration)))',
            type: 'Float64',
          },
          {
            name: 'max',
            type: 'Float64',
          },
          {
            name: 'ServiceName',
            type: 'LowCardinality(String)',
          },
          {
            name: '__hdx_time_bucket',
            type: 'DateTime',
          },
        ],
      };

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: res,
        dateRange: [new Date(), new Date()],
        granularity: '1 minute',
        generateEmptyBuckets: false,
      });

      expect(actual.graphResults).toEqual([
        {
          __hdx_time_bucket: 1764159780,
          'AVG(toFloat64OrDefault(toString(Duration))) · checkout': 43828228.21181263,
          'AVG(toFloat64OrDefault(toString(Duration))) · shipping': 6759697.6283185845,
          'max · checkout': 563518061,
          'max · shipping': 42092944,
        },
        {
          __hdx_time_bucket: 1764159840,
          'AVG(toFloat64OrDefault(toString(Duration))) · checkout': 36209980.6533264,
          'AVG(toFloat64OrDefault(toString(Duration))) · shipping': 6479038.598323171,
          'max · checkout': 795111023,
          'max · shipping': 63136666,
        },
      ]);

      expect(actual.timestampColumn).toEqual({
        name: '__hdx_time_bucket',
        type: 'DateTime',
      });
      expect(actual.lineData).toEqual([
        {
          color: COLORS[0],
          dataKey: 'AVG(toFloat64OrDefault(toString(Duration))) · checkout',
          currentPeriodKey:
            'AVG(toFloat64OrDefault(toString(Duration))) · checkout',
          previousPeriodKey:
            'AVG(toFloat64OrDefault(toString(Duration))) · checkout (previous)',
          displayName: 'AVG(toFloat64OrDefault(toString(Duration))) · checkout',
          valueColumnName: 'AVG(toFloat64OrDefault(toString(Duration)))',
          groupValues: ['checkout'],
          isDashed: false,
        },
        {
          color: COLORS[1],
          dataKey: 'max · checkout',
          currentPeriodKey: 'max · checkout',
          previousPeriodKey: 'max · checkout (previous)',
          displayName: 'max · checkout',
          valueColumnName: 'max',
          groupValues: ['checkout'],
          isDashed: false,
        },
        {
          color: COLORS[2],
          dataKey: 'AVG(toFloat64OrDefault(toString(Duration))) · shipping',
          currentPeriodKey:
            'AVG(toFloat64OrDefault(toString(Duration))) · shipping',
          previousPeriodKey:
            'AVG(toFloat64OrDefault(toString(Duration))) · shipping (previous)',
          displayName: 'AVG(toFloat64OrDefault(toString(Duration))) · shipping',
          valueColumnName: 'AVG(toFloat64OrDefault(toString(Duration)))',
          groupValues: ['shipping'],
          isDashed: false,
        },
        {
          color: COLORS[3],
          dataKey: 'max · shipping',
          currentPeriodKey: 'max · shipping',
          previousPeriodKey: 'max · shipping (previous)',
          displayName: 'max · shipping',
          valueColumnName: 'max',
          groupValues: ['shipping'],
          isDashed: false,
        },
      ]);
    });

    it('should assign colors to log levels', () => {
      const res = {
        data: [
          {
            'count()': '1',
            SeverityText: 'info',
            __hdx_time_bucket: '2025-11-26T12:23:00Z',
          },
          {
            'count()': '3',
            SeverityText: 'debug',
            __hdx_time_bucket: '2025-11-26T12:23:00Z',
          },
          {
            'count()': '1',
            SeverityText: 'error',
            __hdx_time_bucket: '2025-11-26T12:24:00Z',
          },
        ],
        meta: [
          {
            name: 'count()',
            type: 'UInt64',
          },
          {
            name: 'SeverityText',
            type: 'LowCardinality(String)',
          },
          {
            name: '__hdx_time_bucket',
            type: 'DateTime',
          },
        ],
      };

      const source = {
        kind: SourceKind.Log,
        severityTextExpression: 'SeverityText',
      } as TSource;

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: res,
        dateRange: [new Date(), new Date()],
        granularity: '1 minute',
        generateEmptyBuckets: false,
        source,
      });

      expect(actual.lineData).toEqual([
        {
          color: SEMANTIC_INFO_HEX,
          dataKey: 'info',
          currentPeriodKey: 'info',
          previousPeriodKey: 'info (previous)',
          displayName: 'info',
          valueColumnName: 'count()',
          groupValues: ['info'],
          isDashed: false,
        },
        {
          color: SEMANTIC_INFO_HEX,
          dataKey: 'debug',
          currentPeriodKey: 'debug',
          previousPeriodKey: 'debug (previous)',
          displayName: 'debug',
          valueColumnName: 'count()',
          groupValues: ['debug'],
          isDashed: false,
        },
        {
          color: SEMANTIC_ERROR_HEX,
          dataKey: 'error',
          currentPeriodKey: 'error',
          previousPeriodKey: 'error (previous)',
          displayName: 'error',
          valueColumnName: 'count()',
          groupValues: ['error'],
          isDashed: false,
        },
      ]);
    });

    it('should zero-fill missing time buckets when generateEmptyBuckets is undefined', () => {
      const res = {
        data: [
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 43828228.21181263,
            max: 563518061,
            ServiceName: 'checkout',
            __hdx_time_bucket: '2025-11-26T12:23:00Z',
          },
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 6759697.6283185845,
            max: 42092944,
            ServiceName: 'shipping',
            __hdx_time_bucket: '2025-11-26T12:23:00Z',
          },
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 6479038.598323171,
            max: 63136666,
            ServiceName: 'shipping',
            __hdx_time_bucket: '2025-11-26T12:25:00Z',
          },
        ],
        meta: [
          {
            name: 'AVG(toFloat64OrDefault(toString(Duration)))',
            type: 'Float64',
          },
          {
            name: 'max',
            type: 'Float64',
          },
          {
            name: 'ServiceName',
            type: 'LowCardinality(String)',
          },
          {
            name: '__hdx_time_bucket',
            type: 'DateTime',
          },
        ],
      };

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: res,
        dateRange: [new Date(1764159780000), new Date(1764159900000)],
        granularity: '1 minute',
      });

      expect(actual.graphResults).toEqual([
        {
          __hdx_time_bucket: 1764159780,
          'AVG(toFloat64OrDefault(toString(Duration))) · checkout': 43828228.21181263,
          'AVG(toFloat64OrDefault(toString(Duration))) · shipping': 6759697.6283185845,
          'max · checkout': 563518061,
          'max · shipping': 42092944,
        },
        // Generated bucket with zeros
        {
          __hdx_time_bucket: 1764159840,
          'AVG(toFloat64OrDefault(toString(Duration))) · checkout': 0,
          'AVG(toFloat64OrDefault(toString(Duration))) · shipping': 0,
          'max · checkout': 0,
          'max · shipping': 0,
        },
        {
          __hdx_time_bucket: 1764159900,
          'AVG(toFloat64OrDefault(toString(Duration))) · shipping': 6479038.598323171,
          'max · shipping': 63136666,
        },
      ]);

      expect(actual.timestampColumn).toEqual({
        name: '__hdx_time_bucket',
        type: 'DateTime',
      });
      expect(actual.lineData).toEqual([
        {
          color: COLORS[0],
          dataKey: 'AVG(toFloat64OrDefault(toString(Duration))) · checkout',
          currentPeriodKey:
            'AVG(toFloat64OrDefault(toString(Duration))) · checkout',
          previousPeriodKey:
            'AVG(toFloat64OrDefault(toString(Duration))) · checkout (previous)',
          displayName: 'AVG(toFloat64OrDefault(toString(Duration))) · checkout',
          valueColumnName: 'AVG(toFloat64OrDefault(toString(Duration)))',
          groupValues: ['checkout'],
          isDashed: false,
        },
        {
          color: COLORS[1],
          dataKey: 'max · checkout',
          currentPeriodKey: 'max · checkout',
          previousPeriodKey: 'max · checkout (previous)',
          displayName: 'max · checkout',
          valueColumnName: 'max',
          groupValues: ['checkout'],
          isDashed: false,
        },
        {
          color: COLORS[2],
          dataKey: 'AVG(toFloat64OrDefault(toString(Duration))) · shipping',
          currentPeriodKey:
            'AVG(toFloat64OrDefault(toString(Duration))) · shipping',
          previousPeriodKey:
            'AVG(toFloat64OrDefault(toString(Duration))) · shipping (previous)',
          displayName: 'AVG(toFloat64OrDefault(toString(Duration))) · shipping',
          valueColumnName: 'AVG(toFloat64OrDefault(toString(Duration)))',
          groupValues: ['shipping'],
          isDashed: false,
        },
        {
          color: COLORS[3],
          dataKey: 'max · shipping',
          currentPeriodKey: 'max · shipping',
          previousPeriodKey: 'max · shipping (previous)',
          displayName: 'max · shipping',
          valueColumnName: 'max',
          groupValues: ['shipping'],
          isDashed: false,
        },
      ]);
    });

    it('should fill missing time buckets with zero when generateEmptyBuckets is true', () => {
      const res = {
        data: [
          {
            'count()': 10,
            __hdx_time_bucket: '2025-11-26T12:23:00Z',
          },
          {
            'count()': 20,
            __hdx_time_bucket: '2025-11-26T12:25:00Z',
          },
        ],
        meta: [
          {
            name: 'count()',
            type: 'UInt64',
          },
          {
            name: '__hdx_time_bucket',
            type: 'DateTime',
          },
        ],
      };

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: res,
        dateRange: [new Date(1764159780000), new Date(1764159900000)],
        granularity: '1 minute',
        generateEmptyBuckets: true,
      });

      expect(actual.graphResults).toEqual([
        {
          __hdx_time_bucket: 1764159780,
          'count()': 10,
        },
        {
          __hdx_time_bucket: 1764159840,
          'count()': 0,
        },
        {
          __hdx_time_bucket: 1764159900,
          'count()': 20,
        },
      ]);
    });

    it('should not fill missing time buckets when generateEmptyBuckets is false', () => {
      const res = {
        data: [
          {
            'count()': 10,
            __hdx_time_bucket: '2025-11-26T12:23:00Z',
          },
          {
            'count()': 20,
            __hdx_time_bucket: '2025-11-26T12:25:00Z',
          },
        ],
        meta: [
          {
            name: 'count()',
            type: 'UInt64',
          },
          {
            name: '__hdx_time_bucket',
            type: 'DateTime',
          },
        ],
      };

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: res,
        dateRange: [new Date(1764159780000), new Date(1764159900000)],
        granularity: '1 minute',
        generateEmptyBuckets: false,
      });

      // Should only have the two data points, no filled buckets
      expect(actual.graphResults).toEqual([
        {
          __hdx_time_bucket: 1764159780,
          'count()': 10,
        },
        {
          __hdx_time_bucket: 1764159900,
          'count()': 20,
        },
      ]);
    });

    it('should use only the first timestamp column when multiple are present', () => {
      const res = {
        data: [
          {
            'count()': 10,
            first_timestamp: '2025-11-26T11:12:00Z',
            other_timestamp: '2025-11-26T11:13:00Z',
          },
        ],
        meta: [
          {
            name: 'count()',
            type: 'UInt64',
          },
          {
            name: 'first_timestamp',
            type: 'DateTime',
          },
          {
            name: 'other_timestamp',
            type: 'DateTime',
          },
        ],
      };

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: res,
        dateRange: [new Date(), new Date()],
        granularity: '1 minute',
        generateEmptyBuckets: false,
      });

      expect(actual.timestampColumn).toEqual({
        name: 'first_timestamp',
        type: 'DateTime',
      });
      expect(actual.graphResults).toEqual([
        {
          first_timestamp: 1764155520,
          'count()': 10,
        },
      ]);
    });

    it('should treat Map, String, and Array type columns as group columns', () => {
      const res = {
        data: [
          {
            'count()': 5,
            string_col: 'foo',
            map_col: { key: 'val' },
            array_col: [1, 2, 3],
            __hdx_time_bucket: '2025-11-26T11:12:00Z',
          },
        ],
        meta: [
          {
            name: 'count()',
            type: 'UInt64',
          },
          {
            name: 'string_col',
            type: 'String',
          },
          {
            name: 'map_col',
            type: 'Map(String, String)',
          },
          {
            name: 'array_col',
            type: 'Array(UInt64)',
          },
          {
            name: '__hdx_time_bucket',
            type: 'DateTime',
          },
        ],
      };

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: res,
        dateRange: [new Date(), new Date()],
        granularity: '1 minute',
        generateEmptyBuckets: false,
      });

      // All three non-numeric, non-timestamp columns form the group key.
      // With a single value column, the value column name is omitted from the key.
      // Map and Array values are serialized as JSON strings.
      expect(actual.graphResults).toEqual([
        {
          __hdx_time_bucket: 1764155520,
          'foo · {"key":"val"} · [1,2,3]': 5,
        },
      ]);
      expect(actual.lineData).toEqual([
        {
          color: COLORS[0],
          dataKey: 'foo · {"key":"val"} · [1,2,3]',
          currentPeriodKey: 'foo · {"key":"val"} · [1,2,3]',
          previousPeriodKey: 'foo · {"key":"val"} · [1,2,3] (previous)',
          displayName: 'foo · {"key":"val"} · [1,2,3]',
          valueColumnName: 'count()',
          groupValues: ['foo', { key: 'val' }, [1, 2, 3]],
          isDashed: false,
        },
      ]);
    });

    it('keeps raw group values, including nulls and values containing the key joiner', () => {
      const path = `GET${ChartKeyJoiner}/api`;
      const actual = formatResponseForTimeChart({
        currentPeriodResponse: {
          data: [
            {
              'count()': 5,
              severity: null,
              span_name: path,
              __hdx_time_bucket: '2025-11-26T11:12:00Z',
            },
          ],
          meta: [
            { name: 'count()', type: 'UInt64' },
            { name: 'severity', type: 'Nullable(String)' },
            { name: 'span_name', type: 'String' },
            { name: '__hdx_time_bucket', type: 'DateTime' },
          ],
        },
        dateRange: [new Date(), new Date()],
        granularity: '1 minute',
        generateEmptyBuckets: false,
      });

      expect(actual.lineData).toHaveLength(1);
      expect(actual.lineData[0].dataKey).toBe(`${ChartKeyJoiner}${path}`);
      expect(actual.lineData[0].groupValues).toEqual([null, path]);
    });

    it('should plot previous period data when provided, shifted to align with current period', () => {
      const currentPeriodResponse = {
        data: [
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 167783540.53459233,
            __hdx_time_bucket: '2025-11-26T11:12:00Z',
          },
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 182291463.92714182,
            __hdx_time_bucket: '2025-11-26T11:13:00Z',
          },
        ],
        meta: [
          {
            name: 'AVG(toFloat64OrDefault(toString(Duration)))',
            type: 'Float64',
          },
          {
            name: '__hdx_time_bucket',
            type: 'DateTime',
          },
        ],
      };

      const previousPeriodResponse = {
        data: [
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 123.45,
            __hdx_time_bucket: '2025-11-26T11:10:00Z',
          },
          {
            'AVG(toFloat64OrDefault(toString(Duration)))': 678.9,
            __hdx_time_bucket: '2025-11-26T11:11:00Z',
          },
        ],
        meta: [
          {
            name: 'AVG(toFloat64OrDefault(toString(Duration)))',
            type: 'Float64',
          },
          {
            name: '__hdx_time_bucket',
            type: 'DateTime',
          },
        ],
      };

      const actual = formatResponseForTimeChart({
        currentPeriodResponse,
        previousPeriodResponse,
        dateRange: [
          new Date('2025-11-26T11:12:00Z'),
          new Date('2025-11-26T11:14:00Z'),
        ],
        granularity: '1 minute',
        generateEmptyBuckets: false,
        previousPeriodOffsetSeconds: 120,
      });

      expect(actual.graphResults).toEqual([
        {
          __hdx_time_bucket: 1764155520,
          'AVG(toFloat64OrDefault(toString(Duration)))': 167783540.53459233,
          'AVG(toFloat64OrDefault(toString(Duration))) (previous)': 123.45,
        },
        {
          __hdx_time_bucket: 1764155580,
          'AVG(toFloat64OrDefault(toString(Duration)))': 182291463.92714182,
          'AVG(toFloat64OrDefault(toString(Duration))) (previous)': 678.9,
        },
      ]);

      expect(actual.timestampColumn).toEqual({
        name: '__hdx_time_bucket',
        type: 'DateTime',
      });
      expect(actual.lineData).toEqual([
        {
          color: COLORS[0],
          currentPeriodKey: 'AVG(toFloat64OrDefault(toString(Duration)))',
          previousPeriodKey:
            'AVG(toFloat64OrDefault(toString(Duration))) (previous)',
          dataKey: 'AVG(toFloat64OrDefault(toString(Duration)))',
          displayName: 'AVG(toFloat64OrDefault(toString(Duration)))',
          valueColumnName: 'AVG(toFloat64OrDefault(toString(Duration)))',
          groupValues: [],
          isDashed: false,
        },
        {
          color: COLORS[0],
          currentPeriodKey: 'AVG(toFloat64OrDefault(toString(Duration)))',
          previousPeriodKey:
            'AVG(toFloat64OrDefault(toString(Duration))) (previous)',
          dataKey: 'AVG(toFloat64OrDefault(toString(Duration))) (previous)',
          displayName: 'AVG(toFloat64OrDefault(toString(Duration))) (previous)',
          valueColumnName: 'AVG(toFloat64OrDefault(toString(Duration)))',
          groupValues: [],
          isDashed: true,
        },
      ]);
    });

    it('does not cap series when the group count is within the limit', () => {
      const groupCount = MAX_RENDERED_TIME_CHART_SERIES;
      const data = Array.from({ length: groupCount }, (_, i) => ({
        value: i + 1,
        group: `g${i}`,
        __hdx_time_bucket: '2025-11-26T11:12:00Z',
      }));
      const meta = [
        { name: 'value', type: 'Float64' },
        { name: 'group', type: 'String' },
        { name: '__hdx_time_bucket', type: 'DateTime' },
      ];

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: { data, meta },
        dateRange: [
          new Date('2025-11-26T11:12:00Z'),
          new Date('2025-11-26T11:13:00Z'),
        ],
        granularity: '1 minute',
        generateEmptyBuckets: false,
      });

      expect(actual.hiddenSeriesCount).toBe(0);
      expect(actual.lineData).toHaveLength(groupCount);
    });

    it('caps high-cardinality group-bys and keeps the highest-peak series', () => {
      // One extra group over the cap so exactly one series should be dropped —
      // and it should be the lowest-value one (value 0).
      const groupCount = MAX_RENDERED_TIME_CHART_SERIES + 1;
      const data = Array.from({ length: groupCount }, (_, i) => ({
        // group 0 has the smallest peak, so it is the one that gets dropped.
        value: i,
        group: `g${i}`,
        __hdx_time_bucket: '2025-11-26T11:12:00Z',
      }));
      const meta = [
        { name: 'value', type: 'Float64' },
        { name: 'group', type: 'String' },
        { name: '__hdx_time_bucket', type: 'DateTime' },
      ];

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: { data, meta },
        dateRange: [
          new Date('2025-11-26T11:12:00Z'),
          new Date('2025-11-26T11:13:00Z'),
        ],
        granularity: '1 minute',
        generateEmptyBuckets: false,
      });

      // Exactly the overflow is hidden and the rendered set is capped.
      expect(actual.hiddenSeriesCount).toBe(1);
      expect(actual.lineData).toHaveLength(MAX_RENDERED_TIME_CHART_SERIES);

      // The lowest-peak series (value 0) is dropped from both lineData and the
      // materialized bucket objects; a high-peak one survives.
      const keptKeys = new Set(actual.lineData.map(l => l.dataKey));
      expect(keptKeys.has('g0')).toBe(false);
      expect(keptKeys.has(`g${groupCount - 1}`)).toBe(true);
      for (const bucket of actual.graphResults) {
        expect(bucket).not.toHaveProperty('g0');
      }
    });

    it('renders every series when maxSeries is Infinity (load-all escape hatch)', () => {
      const groupCount = MAX_RENDERED_TIME_CHART_SERIES + 50;
      const data = Array.from({ length: groupCount }, (_, i) => ({
        value: i,
        group: `g${i}`,
        __hdx_time_bucket: '2025-11-26T11:12:00Z',
      }));
      const meta = [
        { name: 'value', type: 'Float64' },
        { name: 'group', type: 'String' },
        { name: '__hdx_time_bucket', type: 'DateTime' },
      ];

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: { data, meta },
        dateRange: [
          new Date('2025-11-26T11:12:00Z'),
          new Date('2025-11-26T11:13:00Z'),
        ],
        granularity: '1 minute',
        generateEmptyBuckets: false,
        maxSeries: Number.POSITIVE_INFINITY,
      });

      expect(actual.hiddenSeriesCount).toBe(0);
      expect(actual.lineData).toHaveLength(groupCount);
    });

    it('ranks by peak magnitude across all buckets (not just the last)', () => {
      // g0 peaks high in bucket 1 then drops to 0; a naive "last value" ranking
      // would drop it, but peak-across-buckets must keep it over a flat-low g1.
      const meta = [
        { name: 'value', type: 'Float64' },
        { name: 'group', type: 'String' },
        { name: '__hdx_time_bucket', type: 'DateTime' },
      ];
      // Cap to 1 so exactly the single highest-peak series survives.
      const data = [
        { value: 999, group: 'g0', __hdx_time_bucket: '2025-11-26T11:12:00Z' },
        { value: 0, group: 'g0', __hdx_time_bucket: '2025-11-26T11:13:00Z' },
        { value: 5, group: 'g1', __hdx_time_bucket: '2025-11-26T11:12:00Z' },
        { value: 5, group: 'g1', __hdx_time_bucket: '2025-11-26T11:13:00Z' },
      ];

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: { data, meta },
        dateRange: [
          new Date('2025-11-26T11:12:00Z'),
          new Date('2025-11-26T11:14:00Z'),
        ],
        granularity: '1 minute',
        generateEmptyBuckets: false,
        maxSeries: 1,
      });

      expect(actual.lineData).toHaveLength(1);
      expect(actual.lineData[0].dataKey).toBe('g0');
      expect(actual.hiddenSeriesCount).toBe(1);
    });

    it('breaks peak ties deterministically by first-seen (insertion) order', () => {
      // Three series with identical peaks; capping to 2 must keep the first two
      // encountered (g0, g1) and drop g2 — stable, order-independent of hashing.
      const meta = [
        { name: 'value', type: 'Float64' },
        { name: 'group', type: 'String' },
        { name: '__hdx_time_bucket', type: 'DateTime' },
      ];
      const data = [
        { value: 7, group: 'g0', __hdx_time_bucket: '2025-11-26T11:12:00Z' },
        { value: 7, group: 'g1', __hdx_time_bucket: '2025-11-26T11:12:00Z' },
        { value: 7, group: 'g2', __hdx_time_bucket: '2025-11-26T11:12:00Z' },
      ];

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: { data, meta },
        dateRange: [
          new Date('2025-11-26T11:12:00Z'),
          new Date('2025-11-26T11:13:00Z'),
        ],
        granularity: '1 minute',
        generateEmptyBuckets: false,
        maxSeries: 2,
      });

      const keptKeys = new Set(actual.lineData.map(l => l.dataKey));
      expect(keptKeys.has('g0')).toBe(true);
      expect(keptKeys.has('g1')).toBe(true);
      expect(keptKeys.has('g2')).toBe(false);
    });

    it('caps by logical series so comparison pairs are kept together', () => {
      // Comparison mode: each group yields a current + previous-period entry
      // that share a currentPeriodKey. Capping to 2 must keep 2 *logical*
      // series (4 entries: 2 current + 2 previous), not slice the flat 6-entry
      // list down to 2 and orphan a current line from its dashed partner.
      const PREVIOUS_SUFFIX = ' (previous)';
      const meta = [
        { name: 'value', type: 'Float64' },
        { name: 'group', type: 'String' },
        { name: '__hdx_time_bucket', type: 'DateTime' },
      ];
      const bucket = '2025-11-26T11:12:00Z';
      // g2 has the lowest peak, so it is the logical series that gets dropped.
      const currentData = [
        { value: 30, group: 'g0', __hdx_time_bucket: bucket },
        { value: 20, group: 'g1', __hdx_time_bucket: bucket },
        { value: 10, group: 'g2', __hdx_time_bucket: bucket },
      ];
      const previousData = [
        { value: 29, group: 'g0', __hdx_time_bucket: bucket },
        { value: 19, group: 'g1', __hdx_time_bucket: bucket },
        { value: 9, group: 'g2', __hdx_time_bucket: bucket },
      ];

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: { data: currentData, meta },
        previousPeriodResponse: { data: previousData, meta },
        dateRange: [
          new Date('2025-11-26T11:12:00Z'),
          new Date('2025-11-26T11:13:00Z'),
        ],
        granularity: '1 minute',
        generateEmptyBuckets: false,
        maxSeries: 2,
      });

      // One logical series (g2 and its previous twin) is hidden.
      expect(actual.hiddenSeriesCount).toBe(1);
      // renderedSeriesCount counts LOGICAL series (2), not the 4 lineData
      // entries (2 groups × current+previous).
      expect(actual.renderedSeriesCount).toBe(2);
      expect(actual.renderedSeriesCount + actual.hiddenSeriesCount).toBe(3);

      const keptKeys = new Set(actual.lineData.map(l => l.dataKey));
      // Both kept logical series retain BOTH halves of the pair.
      expect(keptKeys.has('g0')).toBe(true);
      expect(keptKeys.has(`g0${PREVIOUS_SUFFIX}`)).toBe(true);
      expect(keptKeys.has('g1')).toBe(true);
      expect(keptKeys.has(`g1${PREVIOUS_SUFFIX}`)).toBe(true);
      // The dropped logical series is gone entirely (no orphaned half).
      expect(keptKeys.has('g2')).toBe(false);
      expect(keptKeys.has(`g2${PREVIOUS_SUFFIX}`)).toBe(false);
    });

    it('gives current-period groups priority but still bounds the total by the cap', () => {
      // A high-peak previous-only group (g3) must NOT evict a current-period
      // series, and previous-only groups must still count toward the cap so a
      // disjoint comparison result can't exceed maxSeries. Current: g0,g1,g2;
      // previous adds g3 (peak 999). Cap 2 -> current priority keeps g0,g1;
      // g2 and g3 both drop; hidden = 4 total groups - 2 = 2.
      const PREVIOUS_SUFFIX = ' (previous)';
      const meta = [
        { name: 'value', type: 'Float64' },
        { name: 'group', type: 'String' },
        { name: '__hdx_time_bucket', type: 'DateTime' },
      ];
      const bucket = '2025-11-26T11:12:00Z';
      const currentData = [
        { value: 30, group: 'g0', __hdx_time_bucket: bucket },
        { value: 20, group: 'g1', __hdx_time_bucket: bucket },
        { value: 10, group: 'g2', __hdx_time_bucket: bucket },
      ];
      const previousData = [
        { value: 29, group: 'g0', __hdx_time_bucket: bucket },
        { value: 19, group: 'g1', __hdx_time_bucket: bucket },
        { value: 999, group: 'g3', __hdx_time_bucket: bucket },
      ];

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: { data: currentData, meta },
        previousPeriodResponse: { data: previousData, meta },
        dateRange: [
          new Date('2025-11-26T11:12:00Z'),
          new Date('2025-11-26T11:13:00Z'),
        ],
        granularity: '1 minute',
        generateEmptyBuckets: false,
        maxSeries: 2,
      });

      const keptKeys = new Set(actual.lineData.map(l => l.dataKey));
      // Current-period top-2 kept with their previous twins.
      expect(keptKeys.has('g0')).toBe(true);
      expect(keptKeys.has('g1')).toBe(true);
      // g3's peak of 999 did NOT evict a current-period series...
      expect(keptKeys.has(`g3${PREVIOUS_SUFFIX}`)).toBe(false);
      // ...and the lowest current group is dropped too.
      expect(keptKeys.has('g2')).toBe(false);
      // Total is bounded: 4 logical groups, cap 2 -> 2 hidden (g2 + g3).
      expect(actual.hiddenSeriesCount).toBe(2);
    });

    it('keeps a previous-only group when there is room under the cap', () => {
      // Current: g0,g1. Previous adds g3. 3 logical groups, cap 3 -> nothing
      // hidden, and the previous-only g3 survives rather than being dropped.
      const PREVIOUS_SUFFIX = ' (previous)';
      const meta = [
        { name: 'value', type: 'Float64' },
        { name: 'group', type: 'String' },
        { name: '__hdx_time_bucket', type: 'DateTime' },
      ];
      const bucket = '2025-11-26T11:12:00Z';
      const currentData = [
        { value: 30, group: 'g0', __hdx_time_bucket: bucket },
        { value: 20, group: 'g1', __hdx_time_bucket: bucket },
      ];
      const previousData = [
        { value: 29, group: 'g0', __hdx_time_bucket: bucket },
        { value: 5, group: 'g3', __hdx_time_bucket: bucket },
      ];

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: { data: currentData, meta },
        previousPeriodResponse: { data: previousData, meta },
        dateRange: [
          new Date('2025-11-26T11:12:00Z'),
          new Date('2025-11-26T11:13:00Z'),
        ],
        granularity: '1 minute',
        generateEmptyBuckets: false,
        maxSeries: 3,
      });

      const keptKeys = new Set(actual.lineData.map(l => l.dataKey));
      expect(keptKeys.has('g0')).toBe(true);
      expect(keptKeys.has('g1')).toBe(true);
      expect(keptKeys.has(`g3${PREVIOUS_SUFFIX}`)).toBe(true);
      expect(actual.hiddenSeriesCount).toBe(0);
    });

    it('caps by group so all value columns of a kept group survive together', () => {
      // Two value columns (avg + max) with a group-by: each group yields one
      // series per value column, keyed `<valueColumn> · <group>`. max >> avg in
      // magnitude, so ranking each key independently by peak would keep the two
      // max series and evict BOTH avg series. Capping by GROUP must instead keep
      // both value columns of the surviving groups together.
      const meta = [
        { name: 'avg', type: 'Float64' },
        { name: 'max', type: 'Float64' },
        { name: 'group', type: 'String' },
        { name: '__hdx_time_bucket', type: 'DateTime' },
      ];
      const bucket = '2025-11-26T11:12:00Z';
      // 3 groups, cap to 2 logical groups -> g2 (lowest) hidden.
      const data = [
        { avg: 30, max: 300, group: 'g0', __hdx_time_bucket: bucket },
        { avg: 20, max: 200, group: 'g1', __hdx_time_bucket: bucket },
        { avg: 10, max: 100, group: 'g2', __hdx_time_bucket: bucket },
      ];

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: { data, meta },
        dateRange: [
          new Date('2025-11-26T11:12:00Z'),
          new Date('2025-11-26T11:13:00Z'),
        ],
        granularity: '1 minute',
        generateEmptyBuckets: false,
        maxSeries: 2,
      });

      const keptKeys = new Set(actual.lineData.map(l => l.dataKey));
      // Both value columns of the two kept groups survive together.
      expect(keptKeys.has('avg · g0')).toBe(true);
      expect(keptKeys.has('max · g0')).toBe(true);
      expect(keptKeys.has('avg · g1')).toBe(true);
      expect(keptKeys.has('max · g1')).toBe(true);
      // The whole g2 group is dropped (both columns), and counted once.
      expect(keptKeys.has('avg · g2')).toBe(false);
      expect(keptKeys.has('max · g2')).toBe(false);
      expect(actual.hiddenSeriesCount).toBe(1);
      // renderedSeriesCount is a LOGICAL group count (2 kept groups), not the
      // flat lineData length (4 entries: 2 groups × 2 value columns). A
      // regression to lineData.length would break this.
      expect(actual.renderedSeriesCount).toBe(2);
      expect(actual.renderedSeriesCount + actual.hiddenSeriesCount).toBe(3);
    });

    it('does not collapse single-value groups whose name starts with the value-column prefix', () => {
      // Single-value charts add NO value-column prefix to the key, so a group
      // literally named `value · x` must stay distinct from a group `x`. A
      // naive prefix-strip would merge them and miscount series.
      const meta = [
        { name: 'value', type: 'Float64' },
        { name: 'group', type: 'String' },
        { name: '__hdx_time_bucket', type: 'DateTime' },
      ];
      const bucket = '2025-11-26T11:12:00Z';
      // Two distinct groups; one collides with the strip pattern `value · `.
      const data = [
        { value: 30, group: 'value · x', __hdx_time_bucket: bucket },
        { value: 20, group: 'x', __hdx_time_bucket: bucket },
      ];

      const actual = formatResponseForTimeChart({
        currentPeriodResponse: { data, meta },
        dateRange: [
          new Date('2025-11-26T11:12:00Z'),
          new Date('2025-11-26T11:13:00Z'),
        ],
        granularity: '1 minute',
        generateEmptyBuckets: false,
        // Cap high enough that nothing is dropped: this is about the group
        // IDENTITY, not eviction.
        maxSeries: 100,
      });

      // Both groups are kept as separate series (not collapsed into one).
      const keptKeys = new Set(actual.lineData.map(l => l.dataKey));
      expect(keptKeys.has('value · x')).toBe(true);
      expect(keptKeys.has('x')).toBe(true);
      expect(actual.renderedSeriesCount).toBe(2);
      expect(actual.hiddenSeriesCount).toBe(0);
    });
  });

  describe('resolveRenderedSeriesCap', () => {
    it('returns the default cap for null/undefined', () => {
      expect(resolveRenderedSeriesCap(null)).toBe(
        MAX_RENDERED_TIME_CHART_SERIES,
      );
      expect(resolveRenderedSeriesCap(undefined)).toBe(
        MAX_RENDERED_TIME_CHART_SERIES,
      );
    });

    it('returns Infinity for 0 (unlimited)', () => {
      expect(resolveRenderedSeriesCap(0)).toBe(Number.POSITIVE_INFINITY);
    });

    it('returns the value for a positive limit', () => {
      expect(resolveRenderedSeriesCap(25)).toBe(25);
    });

    it('falls back to the default cap for malformed values (never disables the guard)', () => {
      // Zod blocks these on persist, but untyped storage + unvalidated form
      // state can still reach here. None must resolve to Infinity (unlimited).
      expect(resolveRenderedSeriesCap(NaN)).toBe(
        MAX_RENDERED_TIME_CHART_SERIES,
      );
      expect(resolveRenderedSeriesCap(-5)).toBe(MAX_RENDERED_TIME_CHART_SERIES);
      expect(resolveRenderedSeriesCap(12.5)).toBe(
        MAX_RENDERED_TIME_CHART_SERIES,
      );
    });
  });

  describe('convertToTimeChartConfig', () => {
    it('should set granularity when granularity is auto', () => {
      const config = {
        granularity: 'auto',
        dateRange: [
          new Date('2025-11-26T00:00:00Z'),
          new Date('2025-11-27T00:00:00Z'),
        ],
      } as BuilderChartConfigWithDateRange;

      const granularityFromFunction =
        convertToTimeChartConfig(config).granularity;

      expect(granularityFromFunction).toBe('30 minute');
    });

    it('should set granularity when granularity is undefined', () => {
      const config = {
        dateRange: [
          new Date('2025-11-26T00:00:00Z'),
          new Date('2025-11-27T00:00:00Z'),
        ],
      } as BuilderChartConfigWithDateRange;

      const granularityFromFunction =
        convertToTimeChartConfig(config).granularity;

      expect(granularityFromFunction).toBe('30 minute');
    });

    it('should retain the specified granularity when not auto', () => {
      const config = {
        granularity: '5 minute',
        dateRange: [
          new Date('2025-11-26T00:00:00Z'),
          new Date('2025-11-27T00:00:00Z'),
        ],
      } as BuilderChartConfigWithDateRange;

      const granularityFromFunction =
        convertToTimeChartConfig(config).granularity;

      expect(granularityFromFunction).toBe('5 minute');
    });

    // seriesLimit lives on the builder member of the ChartConfigWithDateRange
    // union, so narrow the result before reading it. The per-tile value is
    // read from the config itself (no team override anymore).
    const seriesLimitOf = (seriesLimit?: number | null) =>
      (
        convertToTimeChartConfig({
          granularity: '5 minute',
          dateRange: [
            new Date('2025-11-26T00:00:00Z'),
            new Date('2025-11-27T00:00:00Z'),
          ],
          ...(seriesLimit !== undefined ? { seriesLimit } : {}),
        } as BuilderChartConfigWithDateRange) as BuilderChartConfigWithDateRange
      ).seriesLimit;

    it('omits seriesLimit (capping disabled) when the tile has no limit', () => {
      expect(seriesLimitOf()).toBeUndefined();
    });

    it('normalizes a cleared (null) seriesLimit to undefined (disabled)', () => {
      expect(seriesLimitOf(null)).toBeUndefined();
    });

    it('uses the tile seriesLimit when provided', () => {
      expect(seriesLimitOf(5)).toBe(5);
    });

    it('passes a large tile seriesLimit through unbounded', () => {
      expect(seriesLimitOf(100000)).toBe(100000);
    });
  });

  describe('convertToNumberChartConfig', () => {
    it('should remove granularity and groupBy from the config', () => {
      const config = {
        granularity: '5 minute',
        groupBy: 'ServiceName',
        dateRange: [
          new Date('2025-11-26T00:00:00Z'),
          new Date('2025-11-27T00:00:00Z'),
        ],
      } as BuilderChartConfigWithDateRange;

      const convertedConfig = convertToNumberChartConfig(config);

      expect(convertedConfig.granularity).toBeUndefined();
      expect(convertedConfig.groupBy).toBeUndefined();
    });
  });
});
