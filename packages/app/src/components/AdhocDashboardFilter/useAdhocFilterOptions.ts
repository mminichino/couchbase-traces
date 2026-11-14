import { useMemo } from 'react';
import {
  Field,
  tcFromSource,
} from '@couchbase-traces/common-utils/dist/core/metadata';
import {
  getAdhocFilterSourceKinds,
  isAdhocComparableDataType,
  ResolvedFilterValuesQuery,
} from '@couchbase-traces/common-utils/dist/filters';
import {
  ColumnMeta,
  columnTypeToJSType,
  filterColumnMetaByType,
  isJSDataTypeScalar,
  JSDataType,
} from '@couchbase-traces/common-utils/dist/query';
import {
  AdhocDashboardFilter,
  TSource,
} from '@couchbase-traces/common-utils/dist/types';

import { toQuotedClickHouseKeyExpression } from '@/components/DBSearchPageFilters/utils';
import {
  Facet,
  SINGLE_KEY_VALUES_LIMIT,
  useMultipleAllFields,
  useMultipleGetKeyValues,
} from '@/hooks/useMetadata';
import { pickSourceConfigFields } from '@/ServicesDashboardPage/helpers';
import { useSources } from '@/source';
import { mergePath } from '@/utils';

const unionSorted = (lists: (string[] | undefined)[]) =>
  Array.from(new Set(lists.flatMap(list => list ?? []))).sort();

/**
 * Quote a column name that isn't a bare identifier (e.g. `log-attributes`), so
 * the stored key is SQL that broadcasting can use verbatim.
 */
const toQuotedKeys = (keys: string[], columns: ColumnMeta[]) => {
  const columnNames = new Set(columns.map(column => column.name));
  return keys.map(key => toQuotedClickHouseKeyExpression(key, columnNames));
};

/**
 * A SQL source's filterable keys, as SQL expressions in the search sidebar's
 * key format: scalar columns, and the keys inside its map and JSON columns.
 * `keepType` defaults to the ad hoc rule, which drops DateTime. Column and
 * sort pickers pass a predicate that keeps every type.
 */
export function getSqlSourceKeys(
  fields: Field[],
  columns: ColumnMeta[],
  keepType: (type: string) => boolean = isAdhocComparableDataType,
) {
  const columnNames = (types: JSDataType[]) =>
    filterColumnMetaByType(columns, types)?.map(column => column.name) ?? [];
  const jsonColumns = columnNames([JSDataType.JSON]);
  const mapColumns = columnNames([JSDataType.Map]);
  const keys = fields
    .filter(
      field =>
        (field.path.length > 1 || isJSDataTypeScalar(field.jsType)) &&
        keepType(field.type),
    )
    .map(field => mergePath(field.path, jsonColumns, mapColumns));
  return toQuotedKeys(keys, columns);
}

/** A SQL source's scalar columns, the only keys known without field metadata. */
export function getSqlSourceColumnKeys(
  columns: ColumnMeta[],
  keepType: (type: string) => boolean = isAdhocComparableDataType,
) {
  const keys = columns
    .filter(
      column =>
        isJSDataTypeScalar(columnTypeToJSType(column.type)) &&
        keepType(column.type),
    )
    .map(column => column.name);
  return toQuotedKeys(keys, columns);
}

/**
 * Suggestions from looked-up values. A key typed by hand can name a whole map
 * or JSON column, whose values are objects rather than suggestions.
 */
export function getValueSuggestions(facets: Facet[] | undefined) {
  return unionSorted(
    (facets ?? []).map(({ value }) =>
      value
        .filter((v: unknown) => v != null && typeof v !== 'object')
        .map(String),
    ),
  );
}

/**
 * The sources to look up `key`'s values in: those known to have it, so a source
 * without the column doesn't fail its query, or every source when none are
 * known to (a key typed by hand).
 */
export function getSourcesWithKey<T extends { id: string }>(
  sources: T[],
  keysBySourceId: ReadonlyMap<string, string[]>,
  key: string,
) {
  const withKey = sources.filter(source =>
    keysBySourceId.get(source.id)?.includes(key),
  );
  return withKey.length > 0 ? withKey : sources;
}

/** The filter's sources, limited to the kinds its source type reads. */
function useAdhocFilterSources(filter: AdhocDashboardFilter) {
  const { data: allSources } = useSources();
  return useMemo(() => {
    const kinds = getAdhocFilterSourceKinds(filter.sourceType);
    return (allSources ?? []).filter(
      source =>
        filter.sources.includes(source.id) && kinds.includes(source.kind),
    );
  }, [allSources, filter.sources, filter.sourceType]);
}

/** Suggestions for one input of the condition editor. */
type AdhocFilterSuggestions = {
  data: string[];
  isLoading: boolean;
  isError: boolean;
  /** Set when every source's lookup failed. */
  error?: Error | null;
};

type AdhocFilterKeys = AdhocFilterSuggestions & {
  keysBySourceId: ReadonlyMap<string, string[]>;
  /** Top-level column names across SQL sources, for quoting keys in SQL. */
  columnNames: Set<string>;
};

function useSqlSourceKeys(
  sources: TSource[],
  dateRange: [Date, Date],
  suggestionsWhere: ResolvedFilterValuesQuery | undefined,
): AdhocFilterKeys {
  const tableConnections = useMemo(() => sources.map(tcFromSource), [sources]);
  const where = suggestionsWhere?.where.trim()
    ? suggestionsWhere.where
    : undefined;
  const whereLanguage = suggestionsWhere?.whereLanguage;
  const conditions = useMemo(
    () =>
      where
        ? sources.map(source => ({
            ...pickSourceConfigFields(source),
            where,
            whereLanguage,
          }))
        : undefined,
    [sources, where, whereLanguage],
  );
  const {
    fieldsByTableConnection,
    columnsByTableConnection,
    isFieldMetadataDisabled,
    isLoading,
    isError,
    error,
  } = useMultipleAllFields(tableConnections, { dateRange, conditions });

  return useMemo(() => {
    const keysBySourceId = new Map<string, string[]>();
    const columnNames = new Set<string>();
    sources.forEach((source, index) => {
      const columns = columnsByTableConnection.get(index);
      if (!columns) return;
      columns.forEach(column => columnNames.add(column.name));
      keysBySourceId.set(
        source.id,
        isFieldMetadataDisabled
          ? getSqlSourceColumnKeys(columns)
          : getSqlSourceKeys(fieldsByTableConnection.get(index) ?? [], columns),
      );
    });
    return {
      data: unionSorted([...keysBySourceId.values()]),
      keysBySourceId,
      columnNames,
      isLoading,
      isError,
      error,
    };
  }, [
    sources,
    fieldsByTableConnection,
    columnsByTableConnection,
    isFieldMetadataDisabled,
    isLoading,
    isError,
    error,
  ]);
}

function useSqlSourceValues(
  sources: TSource[],
  key: string,
  dateRange: [Date, Date],
  columnNames: Set<string>,
  suggestionsWhere: ResolvedFilterValuesQuery | undefined,
): AdhocFilterSuggestions {
  const where = suggestionsWhere?.where ?? '';
  const whereLanguage = suggestionsWhere?.whereLanguage ?? 'sql';
  const chartConfigs = useMemo(
    () =>
      sources.map(source => ({
        ...pickSourceConfigFields(source),
        dateRange,
        source: source.id,
        select: '',
        where,
        whereLanguage,
      })),
    [sources, dateRange, where, whereLanguage],
  );
  // Quoted like the search sidebar does, so a column named e.g.
  // `log-attributes` isn't read as a subtraction.
  const keys = useMemo(
    () => (key ? [toQuotedClickHouseKeyExpression(key, columnNames)] : []),
    [key, columnNames],
  );
  const { data, isFetching, isError, error } = useMultipleGetKeyValues(
    { chartConfigs, keys, limit: SINGLE_KEY_VALUES_LIMIT },
    // The previous key's values aren't suggestions for this one.
    { placeholderData: undefined, retry: false, enabled: sources.length > 0 },
  );

  const values = useMemo(() => getValueSuggestions(data), [data]);
  return { data: values, isLoading: !!key && isFetching, isError, error };
}

/**
 * Suggestions for an ad hoc filter's condition editor, deduplicated across its
 * sources. Keys are the columns and map / JSON keys of its SQL sources, in the
 * search sidebar's key format, or the label names of its PromQL sources.
 * Values are those observed for `key`. For SQL sources, `suggestionsWhere` (the
 * filter's `where` with variables expanded) narrows the rows both are read from.
 */
export function useAdhocFilterOptions(
  filter: AdhocDashboardFilter,
  key: string,
  dateRange: [Date, Date],
  suggestionsWhere?: ResolvedFilterValuesQuery,
): { keys: AdhocFilterSuggestions; values: AdhocFilterSuggestions } {
  const sources = useAdhocFilterSources(filter);
  const keys = useSqlSourceKeys(sources, dateRange, suggestionsWhere);

  // Until keys load, every source would be queried, then the sources known to
  // have `key` queried again.
  const lookupKey = keys.isLoading ? '' : key;
  const sourcesWithKey = useMemo(
    () => getSourcesWithKey(sources, keys.keysBySourceId, lookupKey),
    [sources, keys.keysBySourceId, lookupKey],
  );
  const values = useSqlSourceValues(
    sourcesWithKey,
    lookupKey,
    dateRange,
    keys.columnNames,
    suggestionsWhere,
  );
  return {
    keys,
    values: key && keys.isLoading ? { ...values, isLoading: true } : values,
  };
}
