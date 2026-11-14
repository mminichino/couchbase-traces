# Appearance (brand + color mode)

> How colors, logos, and light/dark mode work. Read this before changing
> anything in `packages/app/src/theme/`, adding a semantic CSS variable, or
> hard-coding a color, logo, or favicon path.
>
> For chart colors see [`data_viz_colors.md`](data_viz_colors.md).

## TL;DR

The product is Couchbase Traces. There is no brand switch, no `NEXT_PUBLIC_THEME`,
and no second palette.

| Concept        | Values                        | Who controls it           | Stored in                            | What it affects                                   |
| -------------- | ----------------------------- | ------------------------- | ------------------------------------ | ------------------------------------------------- |
| **Color mode** | `light` \| `dark` \| `system` | End user (preferences)    | `localStorage: hdx-user-preferences` | Backgrounds, text, borders                        |

The UI font is Inter. Mono faces (IBM Plex Mono, Roboto Mono) stay available
for logs and code. The preferences modal does not offer a font picker.

Color mode:

- Values: `'system' | 'light' | 'dark'`. Default `'system'`.
- `'system'` follows `window.matchMedia('(prefers-color-scheme: dark)')`.
- `SystemColorSchemeScript` sets `data-mantine-color-scheme` on `<html>`
  before React hydrates.
- `useResolvedColorScheme()` returns `'light' | 'dark'` for `ThemeWrapper`,
  which passes it to `MantineProvider` as `forceColorScheme`.

Older stored preferences used a `theme` key for light/dark. Migration in
`useUserPreferences.tsx` rewrites that to `colorMode`. Don't reintroduce
the old name.

```html
<html data-mantine-color-scheme="dark">
```

Tokens live in `packages/app/src/theme/_tokens.scss`, scoped to
`[data-mantine-color-scheme='dark']` and
`[data-mantine-color-scheme='light']`.
`packages/app/src/theme/_base-tokens.scss` imports that file.
Mantine component overrides are in `packages/app/src/theme/mantineTheme.ts`.

**Hard rules**:

- Don't hard-code a hex or named color in a component. Use a semantic CSS
  var (`var(--color-bg-surface)`, `var(--color-text-primary)`, …).
- Don't branch on color mode to pick a semantic color. The var already
  resolves. Branch only when a component truly needs a different asset
  (for example the heatmap palette).
- Don't confuse `IS_LEGACY_ENGINE_BUILD` with appearance. That flag gates
  features (embedded mode, managed cloud onboarding).

## Brand

Product name, page titles, and logos come from `packages/app/src/brand/`.
`useBrandDisplayName()` and `usePageTitle()` return `Couchbase Traces` (plus
`INSTANCE_TITLE_SUFFIX` on titles). `useWordmark()` and `useLogomark()`
return the marks. Call sites use those hooks; nothing else hard-codes the
name or an asset path.

```tsx
import { useLogomark, useWordmark } from '@/brand';

function TopBar() {
  const logo = useLogomark({ size: 24 });
  const wordmark = useWordmark();
  return (
    <Group>
      {logo}
      {wordmark}
    </Group>
  );
}
```

The marks are static SVGs in `packages/app/public/brand/`, copied from the
`branding/` folder at the repo root by `port/rebrand.sh apply assets`:

- `logomark.svg`: the Couchbase symbol. `Logomark` renders it as a
  decorative `<img>` (empty `alt`, `aria-hidden`) for the collapsed rail and
  other compact chrome. The box is square by default; `fit="symbol"` follows
  the symbol's `viewBox` ratio.
- `wordmark-light.svg` and `wordmark-dark.svg`: the full logo. `Wordmark`
  picks one with `useResolvedColorScheme()` and uses the product name as
  `alt`. Never split the lockup or set the mark beside text to recreate it.

Favicons are static links in `packages/app/pages/_document.tsx`, under
`packages/app/public/favicons/couchbase-traces/`. `favicon.svg` is the
logomark.

Couchbase Traces specifics:

- Mantine `primaryColor: 'yellow'`. The yellow slot holds the Couchbase red
  brand ramp (`--palette-brand-50` to `--palette-brand-900`, plus
  `--palette-brand-base`) from `theme/_tokens.scss`. The values come from
  `branding/tokens.json`; base is `#ec1218`.
- Accent `--palette-brand-300` is for links, outlines, and primary buttons,
  not chart series.
- Warning tokens use Mantine `orange`, so they stay distinct from the brand
  ramp.
- Most semantic vars reference Click UI globals (`--click-global-color-*`).
- Tabler icons use `stroke-width: 1.5`.

## How to consume colors

```scss
.sidenav {
  background: var(--color-bg-sidenav);
  color: var(--color-text-sidenav-link);
  border-right: 1px solid var(--color-border);
}
```

The list of semantic vars is in
`packages/app/src/theme/semanticColorsGrouped.ts`. In React, use the var
string in `style={{}}`. Use `useMantineColorScheme()` only when you must
branch on light vs dark.

### Semantic component variants

Prefer these over raw Mantine palette props (`color="yellow"`, `c="green"`):

- `<Alert variant="info|success|warning|danger">`
- `<Text variant="danger|warning|success">`
- `<Button|ActionIcon variant="danger">` — soft tint, not a solid red fill

The mapping is `packages/app/src/theme/semanticVariants.ts`
(`SEMANTIC_ALERT_VARS`, `SEMANTIC_TEXT_COLORS`, `SEMANTIC_CONTROL_COLORS`),
consumed by `theme/mantineTheme.ts`. Tokens only, never raw
`--mantine-color-*`.

Semantic text (`--color-text-{danger,warning,success,info}`) clears WCAG AA
(4.5:1) on its `-subtle` background in both schemes. Keep the light-mode
`color-mix` darkening on success and warning.

Storybook: `Components/Alert` and `Design tokens/Semantic variants`. Use the
light/dark toolbar.

## Adding a semantic CSS variable

1. Name it `--color-{category}-{role}[-{state}]`.
2. Add it to both scheme blocks in `theme/_tokens.scss` (dark and light).
3. Add it to the matching group in `theme/semanticColorsGrouped.ts`.
4. Consume it with `var(--color-…)`.

If it backs an Alert, Text, or danger control, wire it through
`semanticVariants.ts` and check the Semantic variants story in both schemes.

Chart vars (`--color-chart-*`) have extra steps in `data_viz_colors.md`.
The chart mixins are included inside both scheme selectors so specificity
stays the same when Mantine swaps `data-mantine-color-scheme`. Keep that
duplication.

## Where things live

```text
packages/app/src/brand/                           # display name, page titles, logos
packages/app/src/ThemeWrapper.tsx                 # MantineProvider + color mode
packages/app/src/theme/_tokens.scss               # light and dark color tokens
packages/app/src/theme/_base-tokens.scss
packages/app/src/theme/mantineTheme.ts
packages/app/src/theme/semanticVariants.ts
packages/app/src/theme/semanticColorsGrouped.ts
packages/app/public/brand/
packages/app/public/favicons/couchbase-traces/
```
