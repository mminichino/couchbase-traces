export function isLowCardinality(type: string) {
  if (type.startsWith('LowCardinality(')) {
    return true;
  }
  return false;
}
