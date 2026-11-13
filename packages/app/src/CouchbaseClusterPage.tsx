import { useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Alert,
  Anchor,
  Button,
  Collapse,
  Container,
  Group,
  Select,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

import { usePageTitle } from '@/brand';
import {
  type InfrastructureResponse,
  type Section,
  type StatusResponse,
  useClusterInfrastructure,
  useClusterQueries,
  useClusterStatus,
} from '@/clusterApi';
import { useConnections } from '@/connection';
import { withAppNav } from '@/layout';
import { useSources } from '@/source';

const RANGES = [
  { value: '15m', label: 'Last 15 minutes', ms: 15 * 60 * 1000 },
  { value: '1h', label: 'Last hour', ms: 60 * 60 * 1000 },
  { value: '6h', label: 'Last 6 hours', ms: 6 * 60 * 60 * 1000 },
  { value: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
];

const LINE_COLORS = [
  '#4c6ef5',
  '#12b886',
  '#fab005',
  '#fa5252',
  '#7950f2',
  '#15aabf',
];

const NOT_CONFIGURED =
  'Add a monitoring user to this connection to see cluster status and infrastructure metrics.';
const RESTRICTED =
  'Not available for this cluster. Managed services such as Capella restrict some management APIs.';

function StatementText({ text }: { text: string }) {
  const shown = text.length > 500 ? `${text.slice(0, 500)}…` : text;
  return (
    <Tooltip label={text || ' '} multiline maw={480}>
      <Text size="sm" style={{ cursor: text ? 'help' : undefined }}>
        {shown || '—'}
      </Text>
    </Tooltip>
  );
}

function SectionNotice({ section }: { section: Section<unknown> }) {
  const [opened, { toggle }] = useDisclosure(false);
  if (section.available) return null;
  if (section.reason === 'not_configured') {
    return (
      <Stack gap={4}>
        <Text size="sm">{NOT_CONFIGURED}</Text>
        <Anchor component={Link} href="/team" size="sm">
          Connection settings
        </Anchor>
      </Stack>
    );
  }
  const detail = [
    section.detail.httpStatus,
    section.detail.code,
    section.detail.message,
  ]
    .filter(part => part != null && part !== '')
    .join(' · ');
  return (
    <Stack gap={4}>
      <Text size="sm">{RESTRICTED}</Text>
      <Anchor component="button" type="button" size="sm" onClick={toggle}>
        Details
      </Anchor>
      <Collapse expanded={opened}>
        <Text size="xs" c="dimmed">
          {detail}
        </Text>
      </Collapse>
    </Stack>
  );
}

function RequestError() {
  return (
    <Alert
      variant="danger"
      title="Failed to load cluster"
      data-testid="cluster-error"
    >
      Something went wrong fetching this page.
    </Alert>
  );
}

function SeriesChart({
  series,
}: {
  series: { node: string | null; points: [number, number][] }[];
}) {
  const data = useMemo(() => {
    const times = [
      ...new Set(series.flatMap(entry => entry.points.map(point => point[0]))),
    ].sort((a, b) => a - b);
    const lookups = series.map(entry => new Map(entry.points));
    return times.map(t => {
      const row: Record<string, number | null> = { t };
      lookups.forEach((lookup, index) => {
        row[`s${index}`] = lookup.get(t) ?? null;
      });
      return row;
    });
  }, [series]);
  if (data.length === 0) return <Text size="sm">No data in this range.</Text>;
  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            tickFormatter={value =>
              new Date(Number(value)).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })
            }
          />
          <YAxis />
          <ChartTooltip />
          <Legend />
          {series.map((entry, index) => (
            <Line
              key={entry.node ?? `series-${index}`}
              type="monotone"
              dataKey={`s${index}`}
              name={entry.node ?? 'cluster'}
              stroke={LINE_COLORS[index % LINE_COLORS.length]}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function QueriesTab({
  query,
}: {
  query: ReturnType<typeof useClusterQueries>;
}) {
  if (query.isLoading)
    return <Skeleton data-testid="cluster-skeleton" height={160} />;
  if (query.isError) return <RequestError />;
  const data = query.data;
  if (data == null) return null;
  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        {data.note}
      </Text>
      <div>
        <Text fw={500} mb="xs">
          Active requests
        </Text>
        <SectionNotice section={data.active} />
        {data.active.available && (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Request</Table.Th>
                <Table.Th>Statement</Table.Th>
                <Table.Th>State</Table.Th>
                <Table.Th>Elapsed</Table.Th>
                <Table.Th>User</Table.Th>
                <Table.Th>Node</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.active.data.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>No active requests.</Table.Td>
                </Table.Tr>
              ) : (
                data.active.data.map(row => (
                  <Table.Tr key={row.requestId || row.statement}>
                    <Table.Td>{row.requestId}</Table.Td>
                    <Table.Td>
                      <StatementText text={row.statement} />
                    </Table.Td>
                    <Table.Td>{row.state}</Table.Td>
                    <Table.Td>{row.elapsedTime}</Table.Td>
                    <Table.Td>{row.users}</Table.Td>
                    <Table.Td>{row.node}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        )}
      </div>
      <div>
        <Text fw={500} mb="xs">
          Completed requests
        </Text>
        <SectionNotice section={data.completedOverTime} />
        {data.completedOverTime.available && (
          <SeriesChart
            series={[
              {
                node: 'count',
                points: data.completedOverTime.data.map(bucket => [
                  bucket.t,
                  bucket.count,
                ]),
              },
              {
                node: 'errors',
                points: data.completedOverTime.data.map(bucket => [
                  bucket.t,
                  bucket.errors,
                ]),
              },
            ]}
          />
        )}
      </div>
      <div>
        <Text fw={500} mb="xs">
          Top statements
        </Text>
        <SectionNotice section={data.topStatements} />
        {data.topStatements.available && (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Statement</Table.Th>
                <Table.Th>Count</Table.Th>
                <Table.Th>Avg ms</Table.Th>
                <Table.Th>Max ms</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.topStatements.data.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>No data in this range.</Table.Td>
                </Table.Tr>
              ) : (
                data.topStatements.data.map(row => (
                  <Table.Tr key={row.statement}>
                    <Table.Td>
                      <StatementText text={row.statement} />
                    </Table.Td>
                    <Table.Td>{row.count}</Table.Td>
                    <Table.Td>{Math.round(row.avgMs)}</Table.Td>
                    <Table.Td>{Math.round(row.maxMs)}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        )}
      </div>
      <div>
        <Text fw={500} mb="xs">
          Slowest recent
        </Text>
        <SectionNotice section={data.recent} />
        {data.recent.available && (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Statement</Table.Th>
                <Table.Th>Elapsed</Table.Th>
                <Table.Th>Results</Table.Th>
                <Table.Th>Errors</Table.Th>
                <Table.Th>User</Table.Th>
                <Table.Th>Node</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.recent.data.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>No data in this range.</Table.Td>
                </Table.Tr>
              ) : (
                data.recent.data.map(row => (
                  <Table.Tr
                    key={`${row.node}-${row.elapsedTime}-${row.statement}`}
                  >
                    <Table.Td>
                      <StatementText text={row.statement} />
                    </Table.Td>
                    <Table.Td>{row.elapsedTime}</Table.Td>
                    <Table.Td>{row.resultCount ?? '—'}</Table.Td>
                    <Table.Td>{row.errorCount ?? '—'}</Table.Td>
                    <Table.Td>{row.users}</Table.Td>
                    <Table.Td>{row.node}</Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        )}
      </div>
      <div>
        <Text fw={500} mb="xs">
          Indexes
        </Text>
        <SectionNotice section={data.indexes} />
        {data.indexes.available && (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Keyspace</Table.Th>
                <Table.Th>State</Table.Th>
                <Table.Th>Using</Table.Th>
                <Table.Th>Primary</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.indexes.data.map(row => (
                <Table.Tr key={`${row.keyspace}-${row.name}`}>
                  <Table.Td>{row.name}</Table.Td>
                  <Table.Td>{row.keyspace}</Table.Td>
                  <Table.Td>{row.state}</Table.Td>
                  <Table.Td>{row.using}</Table.Td>
                  <Table.Td>{row.primary ? 'Yes' : 'No'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </div>
    </Stack>
  );
}

function InfrastructureTab({
  query,
}: {
  query: ReturnType<typeof useClusterInfrastructure>;
}) {
  if (query.isLoading)
    return <Skeleton data-testid="cluster-skeleton" height={160} />;
  if (query.isError) return <RequestError />;
  const data: InfrastructureResponse | undefined = query.data;
  if (data == null) return null;
  return (
    <Stack gap="lg">
      {Object.entries(data).map(([id, section]) => (
        <div key={id}>
          <Text fw={500} mb="xs">
            {section.available
              ? `${section.data.measure} (${section.data.unit})`
              : id}
          </Text>
          <SectionNotice section={section} />
          {section.available && <SeriesChart series={section.data.series} />}
        </div>
      ))}
    </Stack>
  );
}

function StatusTab({
  query,
  onRefresh,
}: {
  query: ReturnType<typeof useClusterStatus>;
  onRefresh: () => void;
}) {
  if (query.isLoading)
    return <Skeleton data-testid="cluster-skeleton" height={160} />;
  if (query.isError) return <RequestError />;
  const data: StatusResponse | undefined = query.data;
  if (data == null) return null;
  return (
    <Stack gap="lg">
      <Group>
        <Button variant="secondary" onClick={onRefresh}>
          Refresh
        </Button>
      </Group>
      <div>
        <Text fw={500} mb="xs">
          Cluster
        </Text>
        <SectionNotice section={data.cluster} />
        {data.cluster.available && (
          <Text size="sm">
            {data.cluster.data.name || 'Unnamed cluster'} ·{' '}
            {data.cluster.data.version || 'unknown version'} ·{' '}
            {data.cluster.data.nodeCount} nodes ·{' '}
            {data.cluster.data.balanced ? 'balanced' : 'not balanced'}
          </Text>
        )}
      </div>
      <div>
        <Text fw={500} mb="xs">
          Nodes
        </Text>
        <SectionNotice section={data.nodes} />
        {data.nodes.available && (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Host</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Membership</Table.Th>
                <Table.Th>Services</Table.Th>
                <Table.Th>CPU</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.nodes.data.map(node => (
                <Table.Tr key={node.hostname}>
                  <Table.Td>{node.hostname}</Table.Td>
                  <Table.Td>{node.status}</Table.Td>
                  <Table.Td>{node.membership}</Table.Td>
                  <Table.Td>{node.services.join(', ')}</Table.Td>
                  <Table.Td>{node.cpuUtilization ?? '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </div>
      <div>
        <Text fw={500} mb="xs">
          Buckets
        </Text>
        <SectionNotice section={data.buckets} />
        {data.buckets.available && (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Items</Table.Th>
                <Table.Th>Ops/s</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.buckets.data.map(bucket => (
                <Table.Tr key={bucket.name}>
                  <Table.Td>{bucket.name}</Table.Td>
                  <Table.Td>{bucket.type}</Table.Td>
                  <Table.Td>{bucket.itemCount}</Table.Td>
                  <Table.Td>{bucket.opsPerSec}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </div>
      <div>
        <Text fw={500} mb="xs">
          Tasks
        </Text>
        <SectionNotice section={data.tasks} />
        {data.tasks.available && (
          <Stack gap="xs">
            {data.tasks.data.length === 0 ? (
              <Text size="sm">No tasks.</Text>
            ) : (
              data.tasks.data.map(task => (
                <Text
                  key={`${task.type}-${task.status}-${task.detail}`}
                  size="sm"
                >
                  {task.type} · {task.status}
                  {task.progress != null
                    ? ` · ${Math.round(task.progress)}%`
                    : ''}
                  {task.detail ? ` · ${task.detail}` : ''}
                </Text>
              ))
            )}
          </Stack>
        )}
      </div>
    </Stack>
  );
}

export default function CouchbaseClusterPage() {
  const title = usePageTitle('Cluster');
  const { data: connections } = useConnections();
  const { data: sources } = useSources();
  const couchbase = (connections ?? []).filter(
    connection => connection.kind === 'couchbase',
  );
  const logConnection = sources?.find(
    source => source.kind === 'log',
  )?.connection;
  const preferred =
    couchbase.find(connection => connection.id === logConnection)?.id ??
    couchbase[0]?.id ??
    null;
  const [selected, setSelected] = useState<string | null>(null);
  const connectionId = selected ?? preferred;
  const [rangeKey, setRangeKey] = useState('1h');
  const [refresh, setRefresh] = useState(0);
  const range = RANGES.find(item => item.value === rangeKey) ?? RANGES[1];
  const spanMs = range?.ms ?? 60 * 60 * 1000;
  const status = useClusterStatus(connectionId, refresh);
  const infrastructure = useClusterInfrastructure(
    connectionId,
    spanMs,
    refresh,
  );
  const queries = useClusterQueries(connectionId, spanMs, refresh);

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <Container size="lg" py="lg">
        <Stack gap="md">
          <Text fw={600} size="xl">
            Cluster
          </Text>
          {couchbase.length === 0 ? (
            <Stack gap="xs" data-testid="cluster-empty">
              <Text size="sm">This team has no Couchbase connection.</Text>
              <Anchor component={Link} href="/team">
                Connections
              </Anchor>
            </Stack>
          ) : (
            <>
              <Group>
                <Select
                  label="Connection"
                  data={couchbase.map(connection => ({
                    value: connection.id,
                    label: connection.name || connection.host,
                  }))}
                  value={connectionId}
                  onChange={setSelected}
                  allowDeselect={false}
                />
                <Select
                  label="Time range"
                  data={RANGES.map(item => ({
                    value: item.value,
                    label: item.label,
                  }))}
                  value={rangeKey}
                  onChange={value => {
                    if (value) setRangeKey(value);
                  }}
                  allowDeselect={false}
                />
              </Group>
              <Tabs defaultValue="queries">
                <Tabs.List>
                  <Tabs.Tab value="queries">Queries</Tabs.Tab>
                  <Tabs.Tab value="infrastructure">Infrastructure</Tabs.Tab>
                  <Tabs.Tab value="status">Status</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="queries" pt="md">
                  <QueriesTab query={queries} />
                </Tabs.Panel>
                <Tabs.Panel value="infrastructure" pt="md">
                  <InfrastructureTab query={infrastructure} />
                </Tabs.Panel>
                <Tabs.Panel value="status" pt="md">
                  <StatusTab
                    query={status}
                    onRefresh={() => setRefresh(count => count + 1)}
                  />
                </Tabs.Panel>
              </Tabs>
            </>
          )}
        </Stack>
      </Container>
    </>
  );
}

CouchbaseClusterPage.getLayout = withAppNav;
