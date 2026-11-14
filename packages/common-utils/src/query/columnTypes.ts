import { splitAndTrimWithBracket } from '@/core/utils';

export enum JSDataType {
  Array = 'array',
  Date = 'date',
  Map = 'map',
  Number = 'number',
  String = 'string',
  Tuple = 'tuple',
  Bool = 'bool',
  JSON = 'json',
  Dynamic = 'dynamic', // json type will store anything as Dynamic type by default
}

export function isCHIntegerType(dataType: string): boolean {
  return (
    /^(Nullable\()?Int/.test(dataType) || /^(Nullable\()?UInt/.test(dataType)
  );
}

export const columnTypeToJSType = (dataType: string): JSDataType | null => {
  if (dataType.startsWith('Date')) {
    return JSDataType.Date;
  } else if (dataType.startsWith('Tuple')) {
    return JSDataType.Tuple;
  } else if (dataType.startsWith('Map')) {
    return JSDataType.Map;
  } else if (dataType.startsWith('Array')) {
    return JSDataType.Array;
  } else if (
    dataType.startsWith('Int') ||
    dataType.startsWith('UInt') ||
    dataType.startsWith('Float') ||
    // Nullable types are possible (charts)
    dataType.startsWith('Nullable(Int') ||
    dataType.startsWith('Nullable(UInt') ||
    dataType.startsWith('Nullable(Float')
  ) {
    return JSDataType.Number;
  } else if (
    dataType.startsWith('String') ||
    dataType.startsWith('Nullable(String)') ||
    dataType.startsWith('FixedString') ||
    dataType.startsWith('Enum') ||
    dataType.startsWith('UUID') ||
    dataType.startsWith('IPv4') ||
    dataType.startsWith('IPv6')
  ) {
    return JSDataType.String;
  } else if (dataType === 'Bool') {
    return JSDataType.Bool;
  } else if (dataType.startsWith('JSON')) {
    return JSDataType.JSON;
  } else if (dataType.startsWith('Dynamic')) {
    return JSDataType.Dynamic;
  } else if (dataType.startsWith('LowCardinality')) {
    return columnTypeToJSType(dataType.slice(15, -1));
  } else if (dataType.startsWith('Nullable(')) {
    return columnTypeToJSType(dataType.slice(9, -1));
  } else if (dataType.startsWith('Variant(') && dataType.endsWith(')')) {
    // A UNION ALL over branches whose column types have no least supertype
    // (e.g. Float64 and Int64) unifies as Variant(...) when the server runs
    // with use_variant_as_common_type = 1 (the modern default). Treat an
    // all-numeric Variant as numeric so such columns still chart; mixed
    // variants stay unclassified.
    const memberTypes = splitAndTrimWithBracket(dataType.slice(8, -1));
    if (
      memberTypes.length > 0 &&
      memberTypes.every(
        memberType => columnTypeToJSType(memberType) === JSDataType.Number,
      )
    ) {
      return JSDataType.Number;
    }
  }

  return null;
};

export const isJSDataTypeJSONStringifiable = (
  dataType: JSDataType | null | undefined,
) => {
  return (
    dataType === JSDataType.Map ||
    dataType === JSDataType.Array ||
    dataType === JSDataType.JSON ||
    dataType === JSDataType.Tuple ||
    dataType === JSDataType.Dynamic
  );
};

/** Types that hold structure rather than a filterable value. */
const NON_SCALAR_JS_DATA_TYPES = [
  JSDataType.Map,
  JSDataType.JSON,
  JSDataType.Array,
  JSDataType.Tuple,
];

/**
 * Unlike !isJSDataTypeJSONStringifiable, Dynamic (JSON subfields) and
 * unrecognized (null) types count as scalar.
 */
export const isJSDataTypeScalar = (dataType: JSDataType | null) =>
  dataType == null || !NON_SCALAR_JS_DATA_TYPES.includes(dataType);

export const extractInnerArrayJSType = (
  dataType: string,
): JSDataType | null => {
  if (dataType.trim().startsWith('Array(') && dataType.trim().endsWith(')')) {
    const innerType = dataType.trim().slice(6, -1);
    return columnTypeToJSType(innerType);
  }

  return null;
};

export const columnTypeToLuceneSearchType = (
  dataType: string,
): {
  type: JSDataType | null;
  isArray: boolean;
} => {
  let jsType = columnTypeToJSType(dataType);
  const isArray = jsType === JSDataType.Array;

  if (jsType === JSDataType.Map || jsType === JSDataType.Tuple) {
    throw new Error('Map or Tuple types cannot be searched with Lucene.');
  } else if (jsType === JSDataType.Date) {
    jsType = JSDataType.Number;
  } else if (jsType === JSDataType.Array && extractInnerArrayJSType(dataType)) {
    jsType = extractInnerArrayJSType(dataType);
  }

  return { type: jsType, isArray };
};

export type ColumnMetaType = { name: string; type: string };
export function filterColumnMetaByType(
  meta: Array<ColumnMetaType>,
  types: JSDataType[],
): Array<ColumnMetaType> | undefined {
  return meta.filter(column => {
    const jsType = columnTypeToJSType(column.type);
    return jsType != null && types.includes(jsType);
  });
}

export function inferTimestampColumn(
  // from: https://github.com/legacy store/the previous JS client/blob/442392c83834f313a964f9e5bd7ff44474631755/packages/client-common/src/clickhouse_types.ts#L8C3-L8C47
  meta: Array<ColumnMetaType>,
) {
  return filterColumnMetaByType(meta, [JSDataType.Date])?.[0];
}

export function inferNumericColumn(meta: Array<ColumnMetaType>) {
  return filterColumnMetaByType(meta, [JSDataType.Number]);
}
