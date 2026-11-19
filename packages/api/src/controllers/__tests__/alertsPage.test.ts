import { MAX_TAGS } from '@couchbase-traces/common-utils/dist/types';

import {
  alertsPageQuerySchema,
  buildAlertsPageFilter,
} from '@/controllers/alertsPage';
import { AlertSource, AlertState } from '@/metadata/schemas/alert';
import { encodeCursor } from '@/utils/pagination';

const ALERT_ID = '6500000000000000000000bb';

const parse = (query: Record<string, unknown>) =>
  alertsPageQuerySchema.parse(query);

const buildFilter = (query: Record<string, unknown> = {}) =>
  buildAlertsPageFilter(parse(query));

describe('alertsPageQuerySchema', () => {
  it('accepts an empty query', () => {
    expect(parse({})).toEqual({});
  });

  it('normalizes a repeatable param whether it arrives once or many times', () => {
    expect(parse({ tag: 'prod' }).tag).toEqual(['prod']);
    expect(parse({ tag: ['prod', 'web'] }).tag).toEqual(['prod', 'web']);
    expect(parse({ tag: '' }).tag).toBeUndefined();
  });

  it('rejects more tags than an alert can carry', () => {
    expect(() => parse({ tag: Array(MAX_TAGS + 1).fill('t') })).toThrow();
  });

  it('coerces limit and rejects out-of-range values', () => {
    expect(parse({ limit: '25' }).limit).toBe(25);
    expect(() => parse({ limit: '0' })).toThrow();
    expect(() => parse({ limit: '501' })).toThrow();
    expect(() => parse({ limit: '1.5' })).toThrow();
  });

  it('accepts limit and tag count at their inclusive bounds', () => {
    expect(parse({ limit: '1' }).limit).toBe(1);
    expect(parse({ limit: '500' }).limit).toBe(500);
    expect(parse({ tag: Array(MAX_TAGS).fill('t') }).tag).toHaveLength(
      MAX_TAGS,
    );
  });

  it('trims search and rejects an overlong one', () => {
    expect(parse({ search: '  errors ' }).search).toBe('errors');
    expect(() => parse({ search: 'x'.repeat(513) })).toThrow();
  });

  it('rejects values outside the source and state enums', () => {
    expect(parse({ source: 'tile' }).source).toEqual([AlertSource.TILE]);
    expect(() => parse({ source: 'nope' })).toThrow();
    expect(() => parse({ state: 'nope' })).toThrow();
  });

  it('rejects a malformed createdBy', () => {
    expect(() => parse({ createdBy: 'not-an-id' })).toThrow();
  });

  it('survives re-parsing its own output', () => {
    // processRequest writes the parsed query back onto req.query, and the
    // handler parses that again to recover the coerced types.
    const once = parse({
      limit: '2',
      tag: ['prod', 'web'],
      source: 'tile',
      state: 'OK',
      search: ' errors ',
      createdBy: ALERT_ID,
    });
    expect(alertsPageQuerySchema.parse(once)).toEqual(once);
  });

  it('rejects a cursor with no limit to continue', () => {
    const cursor = encodeCursor({ n: 'a', id: ALERT_ID });
    expect(() => parse({ cursor })).toThrow('cursor requires limit');
    expect(parse({ cursor, limit: '2' }).cursor).toBe(cursor);
  });

  it.each([
    ['garbage', 'not a cursor!'],
    ['a malformed id', encodeCursor({ n: 'a', id: 'nope' })],
    // JSON.stringify drops an undefined value, so a writer that doesn't
    // normalize a missing displayName to null issues a cursor like this.
    ['a missing name', encodeCursor({ id: ALERT_ID })],
  ])('rejects a cursor with %s', (_label, cursor) => {
    expect(() => parse({ cursor, limit: '2' })).toThrow('invalid cursor');
  });
});

// The store filter-shape assertions that lived here (`$in: [..., null]`,
// `$regex`, the `$or` tie-break) move to the repository: the
// missing-means-default rules and the (displayName, id) keyset are SQL++ and
// are covered by metadata/testing/alertsContract.ts on both backends. What is
// left to check here is how the request maps onto that repository filter.
describe('buildAlertsPageFilter', () => {
  it('passes nothing but the team scope when unfiltered', () => {
    expect(buildFilter()).toEqual({ filter: {} });
  });

  it('maps tags, states, sources, search, and createdBy one to one', () => {
    expect(
      buildFilter({
        tag: ['prod', 'web'],
        state: [AlertState.OK, AlertState.ALERT],
        source: [AlertSource.SAVED_SEARCH, AlertSource.TILE],
        search: 'a.b(c',
        createdBy: ALERT_ID,
      }),
    ).toEqual({
      filter: {
        tags: ['prod', 'web'],
        states: [AlertState.OK, AlertState.ALERT],
        sources: [AlertSource.SAVED_SEARCH, AlertSource.TILE],
        search: 'a.b(c',
        createdBy: ALERT_ID,
      },
    });
  });

  it('adds no search predicate for a blank search', () => {
    // A cleared search box sends `search=`, and trimming a whitespace-only one
    // lands in the same place. Neither may become a match-everything filter.
    expect(buildFilter({ search: '' }).filter.search).toBeUndefined();
    expect(buildFilter({ search: '   ' }).filter.search).toBeUndefined();
  });

  it('turns a named cursor into the keyset position', () => {
    expect(
      buildFilter({
        limit: '2',
        cursor: encodeCursor({ n: 'Checkout', id: ALERT_ID }),
      }).after,
    ).toEqual({ name: 'Checkout', id: ALERT_ID });
  });

  it('turns an unnamed cursor into a null-name position', () => {
    expect(
      buildFilter({
        limit: '2',
        cursor: encodeCursor({ n: null, id: ALERT_ID }),
      }).after,
    ).toEqual({ name: null, id: ALERT_ID });
  });

  it('keeps the filters alongside a cursor', () => {
    const { filter, after } = buildFilter({
      limit: '2',
      search: 'err',
      source: AlertSource.SAVED_SEARCH,
      state: AlertState.OK,
      cursor: encodeCursor({ n: null, id: ALERT_ID }),
    });
    expect(filter).toEqual({
      search: 'err',
      sources: [AlertSource.SAVED_SEARCH],
      states: [AlertState.OK],
    });
    expect(after).toEqual({ name: null, id: ALERT_ID });
  });
});
