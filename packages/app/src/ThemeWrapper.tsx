import React from 'react';
import { MantineProvider, MantineThemeOverride } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

import { theme as baseTheme } from './theme/mantineTheme';

export const ThemeWrapper = ({
  fontFamily,
  colorScheme = 'dark',
  children,
}: {
  fontFamily?: string;
  colorScheme?: 'dark' | 'light';
  children: React.ReactNode;
}) => {
  const mantineTheme = React.useMemo<MantineThemeOverride>(() => {
    if (fontFamily) {
      return {
        ...baseTheme,
        fontFamily,
        headings: {
          ...baseTheme.headings,
          fontFamily,
        },
      };
    }

    return baseTheme;
  }, [fontFamily]);

  return (
    <MantineProvider forceColorScheme={colorScheme} theme={mantineTheme}>
      <Notifications zIndex={999999} />
      {children}
    </MantineProvider>
  );
};
