import type { HeatmapMode } from '@/types';

/** A heatmap's mode; tiles saved before modes existed are distribution heatmaps. */
export function getHeatmapMode<M extends HeatmapMode>(config: {
  heatmap?: { mode?: M };
}): M | 'distribution' {
  return config.heatmap?.mode ?? 'distribution';
}
