// viewBox of branding/logomark.svg.
const VIEWBOX_WIDTH = 270.97;
const VIEWBOX_HEIGHT = 270.97;

export const LOGOMARK_SRC = '/brand/logomark.svg';

/**
 * Couchbase mark, served from public/brand.
 *
 * `size` is the box height. The default box is square, which is what the
 * collapsed rail and the other callers size against. `fit="symbol"` follows
 * the symbol's own aspect ratio.
 */
export default function Logomark({
  size = 16,
  fit = 'square',
}: {
  size?: number;
  fit?: 'square' | 'symbol';
}) {
  const width =
    fit === 'symbol' ? size * (VIEWBOX_WIDTH / VIEWBOX_HEIGHT) : size;

  return (
    <img src={LOGOMARK_SRC} alt="" aria-hidden width={width} height={size} />
  );
}
