import { createWireNormalizer } from '@/metadata/testing/wire';

describe('createWireNormalizer', () => {
  it('maps ids to stable placeholders in first-seen order', () => {
    const n = createWireNormalizer();
    const a = '65a1b2c3d4e5f60718293a4b';
    const b = '65a1b2c3d4e5f60718293a4c';
    expect(n({ _id: a, team: b, ref: a.toUpperCase() })).toEqual({
      _id: '<id:1>',
      ref: '<id:1>',
      team: '<id:2>',
    });
    expect(n.idOf(b)).toBe('<id:2>');
  });

  it('replaces ids embedded in strings, dates, uuids, and secrets', () => {
    const n = createWireNormalizer();
    expect(
      n({
        url: '/dashboards/65a1b2c3d4e5f60718293a4b?x=1',
        invite: `/join-team?token=${'ab'.repeat(32)}`,
        createdAt: '2026-11-18T12:00:00.000Z',
        tileId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
        accessKey: 'abc',
        apiKey: '',
        count: 3,
        none: null,
      }),
    ).toEqual({
      accessKey: '<secret>',
      apiKey: '',
      count: 3,
      createdAt: '<date>',
      invite: '/join-team?token=<token>',
      none: null,
      tileId: '<uuid>',
      url: '/dashboards/<id:1>?x=1',
    });
  });

  it('sorts object keys and keeps array order', () => {
    const out = createWireNormalizer()({ b: [2, 1], a: { d: 1, c: 2 } });
    expect(JSON.stringify(out)).toBe('{"a":{"c":2,"d":1},"b":[2,1]}');
  });
});
