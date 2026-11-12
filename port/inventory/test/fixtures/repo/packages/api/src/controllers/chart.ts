import { renderChartConfig } from '@hyperdx/common-utils/dist/core';
import * as meta from '@hyperdx/common-utils/dist/core/metadata';

export function run() {
  renderChartConfig();
  renderChartConfig();
  const again = renderChartConfig;
  meta.getTables();
  meta.getColumns();
  meta.getTables();
  return again;
}
