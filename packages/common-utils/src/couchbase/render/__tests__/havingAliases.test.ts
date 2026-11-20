import { splitOnAliasRefs } from '@/couchbase/render/havingAliases';

const split = (text: string, ...aliases: string[]) =>
  splitOnAliasRefs(text, new Set(aliases));

describe('splitOnAliasRefs', () => {
  it('finds bare and backtick-quoted aliases', () => {
    expect(split('n > 1 AND `Line Count` < 5', 'n', 'Line Count')).toEqual([
      { alias: 'n' },
      { text: ' > 1 AND ' },
      { alias: 'Line Count' },
      { text: ' < 5' },
    ]);
  });

  it('skips string literals, including escaped quotes', () => {
    expect(split("x = 'it''s n' OR y = \"n\\\"n\"", 'n')).toEqual([
      { text: "x = 'it''s n' OR y = \"n\\\"n\"" },
    ]);
  });

  it('skips paths, function calls, parameters and numbers', () => {
    expect(split('d.n + n.x + n (1) + $n + 1n + n_1', 'n')).toEqual([
      { text: 'd.n + n.x + n (1) + $n + 1n + n_1' },
    ]);
  });

  it('is case sensitive like SQL++ identifiers', () => {
    expect(split('N > 1', 'n')).toEqual([{ text: 'N > 1' }]);
  });

  it('handles an alias at the very end and an unterminated quote', () => {
    expect(split('1 < n', 'n')).toEqual([{ text: '1 < ' }, { alias: 'n' }]);
    expect(split("n > 'open", 'n')).toEqual([
      { alias: 'n' },
      { text: " > 'open" },
    ]);
  });

  it('returns no pieces for an empty condition', () => {
    expect(split('', 'n')).toEqual([]);
  });
});
