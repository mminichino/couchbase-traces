// Runs against the cluster started by port/couchbase-test/run.sh. Provisions
// its own metadata bucket with the cluster admin role, so it also covers
// setup idempotency, RBAC, startup verification, and the transaction probe.
import { ensureMetadataKeyspace } from '@couchbase-traces/common-utils/dist/couchbase/nodeMetadataProvision';
import { type Cluster, connect } from 'couchbase';

import { loadMetadataConfig } from '@/metadata/couchbase/config';
import { CouchbaseMetadataStore } from '@/metadata/couchbase/store';
import { newId } from '@/metadata/ids';
import { describeAlertRepos } from '@/metadata/testing/alertsContract';
import { describeContentRepos } from '@/metadata/testing/contentContract';
import { describeMetadataContract } from '@/metadata/testing/contract';

const REQUIRED = process.env.CBT_TEST_COUCHBASE_REQUIRED === '1';
const CONNSTR =
  process.env.CBT_TEST_COUCHBASE_CONNSTR || 'couchbase://localhost';
const ADMIN_USER =
  process.env.CBT_TEST_COUCHBASE_RBAC_ADMIN_USER || 'cbt_admin';
const ADMIN_PASSWORD =
  process.env.CBT_TEST_COUCHBASE_RBAC_ADMIN_PASSWORD || 'cbt-admin-password';
const BUCKET = 'cbt_meta_test';
const META_USER = 'cbt_meta_test';
const META_PASSWORD = 'cbt-meta-test-password';

jest.setTimeout(600_000);

const maybe = REQUIRED ? describe : describe.skip;
if (process.env.CBT_TEST_COUCHBASE_REQUIRED === '0') {
  console.log(
    'Metadata store contract: skipped on purpose (CBT_TEST_COUCHBASE_REQUIRED=0); it runs in port/couchbase-test/run.sh.',
  );
}

let admin: Cluster | undefined;
let store: CouchbaseMetadataStore | undefined;

async function provision() {
  return ensureMetadataKeyspace(admin!, {
    bucket: BUCKET,
    scope: 'app',
    ramMb: 256,
    replicas: 0,
    indexReplicas: 0,
    createBucket: true,
    user: {
      username: META_USER,
      password: META_PASSWORD,
      provisionRoles: false,
    },
    waitTimeoutS: 300,
    log: () => undefined,
  });
}

maybe('metadata on Couchbase', () => {
  beforeAll(async () => {
    admin = await connect(CONNSTR, {
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
    });
    await provision();
    store = new CouchbaseMetadataStore(
      loadMetadataConfig({
        CBT_METADATA_CONNSTR: CONNSTR,
        CBT_METADATA_BUCKET: BUCKET,
        CBT_METADATA_USER: META_USER,
        CBT_METADATA_PASSWORD: META_PASSWORD,
      }),
      { pollMs: 1000 },
    );
    await store.start();
  });

  afterAll(async () => {
    await store?.close();
    await admin?.close();
  });

  it('provisions idempotently: a second run creates nothing', async () => {
    expect((await provision()).created).toEqual([]);
  });

  it('starts ready with the least-privilege user (verify + tx probe)', () => {
    expect(store!.readiness()).toEqual({ ready: true, state: 'ready' });
  });

  // Nested so the outer beforeAll/afterAll bracket it.
  describeMetadataContract('couchbase', async () => ({
    kv: store!.kv,
    now: () => new Date(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  }));

  describeContentRepos('couchbase', async () => store!);
  describeAlertRepos('couchbase', async () => store!);

  // D13: the losing requests read the winner's invite by KV get while its
  // insert is in flight, so every caller gets the one invite.
  it('returns one invite to 20 concurrent creates, 30 times over', async () => {
    const team = newId();
    for (let round = 0; round < 30; round++) {
      const email = `race-${round}@x.io`;
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          store!.teamInvites.getOrCreate(team, { email }),
        ),
      );
      expect(results.filter(r => r.status === 'rejected')).toEqual([]);
      const ids = results.map(r => r.status === 'fulfilled' && r.value._id);
      expect(new Set(ids).size).toBe(1);
      const held = await store!.teamInvites.getByTeamEmail(team, email);
      expect(held?._id).toBe(ids[0]);
    }
  }, 120_000);
});
