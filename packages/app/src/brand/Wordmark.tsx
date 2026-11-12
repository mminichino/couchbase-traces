import { useResolvedColorScheme } from '@/useUserPreferences';

export const WORDMARK_LIGHT_SRC = '/brand/wordmark-light.svg';
export const WORDMARK_DARK_SRC = '/brand/wordmark-dark.svg';

// viewBox of branding/wordmark-light.svg and wordmark-dark.svg.
const VIEWBOX_WIDTH = 1436;
const VIEWBOX_HEIGHT = 270.97;
const HEIGHT = 23;

// The full logo as supplied. The brand rules forbid splitting the lockup and
// recombining the mark with text, so the name is only the image's alt text.
// The name is passed in so this file does not import the brand barrel, which
// imports this file.
export default function Wordmark({ name }: { name: string }) {
  const scheme = useResolvedColorScheme();
  const src = scheme === 'dark' ? WORDMARK_DARK_SRC : WORDMARK_LIGHT_SRC;
  return (
    <img
      src={src}
      alt={name}
      height={HEIGHT}
      width={Math.round(HEIGHT * (VIEWBOX_WIDTH / VIEWBOX_HEIGHT))}
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
    />
  );
}
