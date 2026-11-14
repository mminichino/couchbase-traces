import type { Metadata } from '@couchbase-traces/common-utils/dist/core/metadata';
import { getMetadata as _getMetadata } from '@couchbase-traces/common-utils/dist/dataLayer';

import { getClickhouseClient } from '@/query';

import { DEFAULT_QUERY_TIMEOUT } from './defaults';

// TODO: Get rid of this function and convert to singleton
//
// This instance is shared across pages, so it cannot know which page caused a
// lookup. Labelling it at least separates field lookups and autocomplete from
// a user's chart queries, and there are a lot of them.
export const getMetadata = (): Metadata =>
  _getMetadata(
    getClickhouseClient({
      requestTimeout: DEFAULT_QUERY_TIMEOUT,
      attribution: { surface: 'metadata' },
    }),
  );
