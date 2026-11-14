import { AdhocFilterOperator } from '@couchbase-traces/common-utils/dist/types';

import type { FilterOperatorOption } from './FilterConditionEditor';

export type FilterLanguage = 'sql';

/** One spelling for both languages; each preset's labels show its own wording. */
export type FilterOperator = AdhocFilterOperator;

const REGEX_VALUE = {
  valueLabel: 'Pattern',
  valuePlaceholder: 'Regular expression',
};
const LIKE_VALUE = { valuePlaceholder: 'Pattern, e.g. %error%' };

export const SQL_FILTER_OPERATORS: FilterOperatorOption<FilterOperator>[] = [
  { value: '=', label: '=' },
  { value: '!=', label: '!=', negated: true },
  { value: '=~', label: 'regex', ...REGEX_VALUE },
  { value: '!~', label: 'not regex', negated: true, ...REGEX_VALUE },
  { value: 'LIKE', label: 'like', ...LIKE_VALUE },
  { value: 'NOT LIKE', label: 'not like', negated: true, ...LIKE_VALUE },
];

/** @deprecated PromQL filters removed; alias kept for tests and stories. */
export const PROMQL_FILTER_OPERATORS = SQL_FILTER_OPERATORS;

export function getFilterOperators(
  _language: FilterLanguage,
): FilterOperatorOption<FilterOperator>[] {
  return SQL_FILTER_OPERATORS;
}

/** How a pill shows `operator`: its label, and whether it excludes values. */
export function getFilterOperatorDisplay(
  language: FilterLanguage,
  operator: string,
): { label: string; isExcluded: boolean } {
  const option = getFilterOperators(language).find(op => op.value === operator);
  return { label: option?.label ?? operator, isExcluded: !!option?.negated };
}
