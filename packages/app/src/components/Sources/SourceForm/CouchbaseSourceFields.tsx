import { useState } from 'react';
import { Control, Controller, useWatch } from 'react-hook-form';
import { SourceKind, TSource } from '@couchbase-traces/common-utils/dist/types';
import { Button, Code, Group, Select, Stack, Text } from '@mantine/core';

import { InputControlled } from '@/components/InputControlled';
import {
  type CollectionTestResult,
  useTestCouchbaseCollection,
} from '@/connection';

import { FormRow } from './FormRow';

const TIMESTAMP_FORMAT_OPTIONS = [
  { value: 'iso8601', label: 'ISO-8601 string' },
  { value: 'epoch_millis', label: 'Epoch milliseconds' },
];

/** Bucket, scope, collection, and timestamp inputs for a Couchbase connection. */
export function CouchbaseSourceFields({
  control,
  kind,
  connectionId,
}: {
  control: Control<TSource>;
  kind: SourceKind;
  connectionId: string | undefined;
}) {
  const [bucket, scope, collection] = useWatch({
    control,
    name: ['from.databaseName', 'from.scopeName', 'from.tableName'],
  });
  const testCollection = useTestCouchbaseCollection();
  const [result, setResult] = useState<CollectionTestResult | null>(null);
  const isMetric = kind === SourceKind.Metric;

  const canTest = !!connectionId && !!bucket && !!scope && !!collection;

  return (
    <>
      <FormRow label="Bucket">
        <InputControlled
          data-testid="source-bucket-input"
          control={control}
          name="from.databaseName"
          placeholder="travel-sample"
          rules={{ required: 'Bucket is required' }}
        />
      </FormRow>
      <FormRow label="Scope">
        <InputControlled
          data-testid="source-scope-input"
          control={control}
          name="from.scopeName"
          placeholder="_default"
          rules={{ required: 'Scope is required' }}
        />
      </FormRow>
      {!isMetric && (
        <FormRow label="Collection">
          <InputControlled
            data-testid="source-collection-input"
            control={control}
            name="from.tableName"
            placeholder="_default"
            rules={{ required: 'Collection is required' }}
          />
        </FormRow>
      )}
      <FormRow label="Timestamp format">
        <Controller
          control={control}
          name="timestampFormat"
          rules={{ required: 'Timestamp format is required' }}
          render={({ field, fieldState: { error } }) => (
            <Select
              data-testid="source-timestamp-format-select"
              data={TIMESTAMP_FORMAT_OPTIONS}
              value={field.value ?? null}
              onChange={v => field.onChange(v ?? undefined)}
              error={error?.message}
              placeholder="Select a format"
            />
          )}
        />
      </FormRow>
      <FormRow label="Search index (optional)">
        <InputControlled
          data-testid="source-search-index-input"
          control={control}
          name="searchIndexName"
          maxLength={255}
        />
      </FormRow>
      {!isMetric && (
        <FormRow label="">
          <Stack gap="xs">
            <Group>
              <Button
                data-testid="source-test-collection-button"
                variant="secondary"
                size="xs"
                disabled={!canTest}
                loading={testCollection.isPending}
                onClick={async () => {
                  if (!canTest) return;
                  setResult(null);
                  try {
                    setResult(
                      await testCollection.mutateAsync({
                        connectionId,
                        bucket,
                        scope,
                        collection,
                      }),
                    );
                  } catch (e) {
                    setResult({
                      success: false,
                      error: e instanceof Error ? e.message : String(e),
                    });
                  }
                }}
              >
                Test collection
              </Button>
            </Group>
            {result?.success === true && (
              <Text size="xs" data-testid="source-test-collection-result">
                {result.sampleKeys.length === 0
                  ? 'Collection is reachable and has no documents yet.'
                  : 'Sample document ids: '}
                {result.sampleKeys.map(k => (
                  <Code key={k} mr="xs">
                    {k}
                  </Code>
                ))}
              </Text>
            )}
            {result?.success === false && (
              <Text
                size="xs"
                c="red"
                data-testid="source-test-collection-error"
              >
                {result.error}
              </Text>
            )}
          </Stack>
        </FormRow>
      )}
    </>
  );
}
