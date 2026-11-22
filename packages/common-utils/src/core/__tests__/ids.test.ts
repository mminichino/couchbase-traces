import { isMetadataId } from '@/core/ids';

describe('isMetadataId', () => {
  it.each(['0123456789abcdef01234567', '0123456789ABCDEF01234567'])(
    'accepts %s',
    id => {
      expect(isMetadataId(id)).toBe(true);
    },
  );

  it.each([
    'smoke-alert',
    '',
    '0123456789abcdef0123456',
    '0123456789abcdef012345678',
    '0123456789abcdef0123456g',
    undefined,
    null,
    12,
  ])('rejects %p', id => {
    expect(isMetadataId(id)).toBe(false);
  });
});
