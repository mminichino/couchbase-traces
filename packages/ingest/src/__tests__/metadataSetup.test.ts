import { runSetup } from '@/setup/cli';
import { metadataCapellaAccess, metadataSetupConfig } from '@/setup/metadata';

describe('metadata setup', () => {
  it('defaults to the cbt_meta bucket and app scope', () => {
    expect(metadataSetupConfig({}, 1)).toEqual({
      bucket: 'cbt_meta',
      scope: 'app',
      ramMb: 256,
      replicas: 0,
      indexReplicas: 1,
      user: undefined,
      password: undefined,
      provisionRoles: false,
    });
  });

  it('reads CBT_METADATA_* overrides', () => {
    const cfg = metadataSetupConfig(
      {
        CBT_METADATA_BUCKET: 'meta2',
        CBT_METADATA_SCOPE: 's',
        CBT_METADATA_RAM_MB: '512',
        CBT_METADATA_REPLICAS: '1',
        CBT_METADATA_INDEX_REPLICAS: '2',
        CBT_METADATA_USER: 'u',
        CBT_METADATA_PASSWORD: 'p',
        CBT_METADATA_AUTO_PROVISION: 'true',
      },
      0,
    );
    expect(cfg).toMatchObject({
      bucket: 'meta2',
      ramMb: 512,
      replicas: 1,
      indexReplicas: 2,
      provisionRoles: true,
    });
  });

  it('rejects a non-numeric RAM quota', () => {
    expect(() =>
      metadataSetupConfig({ CBT_METADATA_RAM_MB: 'lots' }, 0),
    ).toThrow(/CBT_METADATA_RAM_MB/);
  });

  it('prints the Capella bucket and role requirements', () => {
    const lines = metadataCapellaAccess(metadataSetupConfig({}, 0));
    expect(lines[0]).toContain('cbt_meta');
    expect(lines[1]).toContain('data_writer[cbt_meta]');
  });

  it('includes metadata DDL in the dry run unless --no-metadata', async () => {
    const env = { CBT_COUCHBASE_CONNSTR: 'couchbase://localhost' };
    const lines: string[] = [];
    expect(await runSetup(['--dry-run'], env, l => lines.push(l))).toBe(0);
    expect(lines).toContain('skipped bucket cbt_meta');
    expect(lines.some(l => l.includes('`cbt_meta`.`app`.`users`'))).toBe(true);

    const skipped: string[] = [];
    await runSetup(['--dry-run', '--no-metadata'], env, l => skipped.push(l));
    expect(skipped).toContain('skipped metadata');
    expect(skipped.some(l => l.includes('cbt_meta'))).toBe(false);
  });
});
