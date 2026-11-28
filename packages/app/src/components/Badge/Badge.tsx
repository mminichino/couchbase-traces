import { type HTMLAttributes, type ReactNode, useState } from 'react';
import { Tooltip } from '@mantine/core';

import styles from './Badge.module.scss';

export type BadgeState =
  | 'default'
  | 'success'
  | 'neutral'
  | 'danger'
  | 'disabled'
  | 'warning'
  | 'info';

export type BadgeProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  text: ReactNode;
  state?: BadgeState;
  size?: 'sm' | 'md';
  /** `solid` fills the badge with the state color; `opaque` tints it. */
  type?: 'opaque' | 'solid';
  /** A leading or trailing dot, as on the "Pending invite" badge. */
  icon?: 'dot';
  iconDir?: 'start' | 'end';
  /** Truncates long text with an ellipsis and shows it in a tooltip. */
  ellipsisContent?: boolean;
};

/**
 * A pill-shaped status label. The API and look match the click-ui Badge it
 * replaces, so existing call sites only change their import.
 */
export function Badge({
  text,
  state = 'default',
  size = 'md',
  type = 'opaque',
  icon,
  iconDir = 'start',
  ellipsisContent = true,
  className,
  ...props
}: BadgeProps) {
  // Measured on hover, like click-ui: only cut-off text gets a tooltip.
  const [truncated, setTruncated] = useState<string | null>(null);
  const dot = icon === 'dot' && <span className={styles.dot} aria-hidden />;
  const label = (
    <span
      className={ellipsisContent ? styles.ellipsis : undefined}
      onMouseEnter={
        ellipsisContent
          ? e => {
              const el = e.currentTarget;
              setTruncated(
                el.scrollWidth > el.clientWidth ? el.innerText : null,
              );
            }
          : undefined
      }
    >
      {text}
    </span>
  );
  return (
    <div
      {...props}
      className={[styles.badge, className].filter(Boolean).join(' ')}
      data-state={state}
      data-size={size}
      data-type={type}
    >
      {iconDir === 'start' && dot}
      {ellipsisContent ? (
        <Tooltip label={truncated} disabled={!truncated} withinPortal>
          {label}
        </Tooltip>
      ) : (
        label
      )}
      {iconDir === 'end' && dot}
    </div>
  );
}
