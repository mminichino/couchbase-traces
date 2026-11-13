import type { SerializerMetadata } from '@/couchbase/serializer';

export function couchbaseMetadataRef(metadata: unknown): SerializerMetadata {
  if (
    metadata != null &&
    typeof metadata === 'object' &&
    'getColumns' in metadata &&
    typeof metadata.getColumns === 'function'
  ) {
    const read = metadata.getColumns.bind(metadata);
    return {
      async getColumns(args) {
        const columns: unknown = await read(args);
        if (!Array.isArray(columns)) return [];
        const out: { name: string; type: string }[] = [];
        for (const column of columns) {
          if (column == null || typeof column !== 'object') continue;
          if (!('name' in column) || typeof column.name !== 'string') continue;
          const type =
            'type' in column && typeof column.type === 'string'
              ? column.type
              : '';
          out.push({ name: column.name, type });
        }
        return out;
      },
    };
  }
  return {
    async getColumns() {
      return [];
    },
  };
}
