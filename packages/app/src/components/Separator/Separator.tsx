import { type HTMLAttributes } from 'react';

import styles from './Separator.module.scss';

export type SeparatorProps = HTMLAttributes<HTMLDivElement> & {
  /** Space around the line: xs adds none, up to xxl (2rem). */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  orientation?: 'horizontal' | 'vertical';
  /** Purely visual lines are hidden from assistive technology. */
  decorative?: boolean;
};

/**
 * A 1px rule between sections. Replaces the click-ui Separator with the same
 * props and spacing scale.
 */
export function Separator({
  size = 'xs',
  orientation = 'horizontal',
  decorative = false,
  className,
  ...props
}: SeparatorProps) {
  const semantic = decorative
    ? { role: 'none' }
    : {
        role: 'separator',
        // Horizontal is the ARIA default and is left implicit.
        ...(orientation === 'vertical'
          ? { 'aria-orientation': 'vertical' as const }
          : {}),
      };
  return (
    <div
      {...semantic}
      {...props}
      className={[styles.separator, className].filter(Boolean).join(' ')}
      data-orientation={orientation}
      data-size={size}
    />
  );
}
