/**
 * Choose an alert threshold so the condition is true for `value`.
 * @param {'above'|'below'|'above_exclusive'|'below_or_equal'|'equal'|'not_equal'|'between'|'not_between'} type
 * @param {number} value
 * @returns {{ threshold: number, thresholdMax?: number }}
 */
export function chooseThreshold(type, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) {
    throw new Error(`Measured value is not finite: ${value}`);
  }
  switch (type) {
    case 'above':
      // condition: measured > threshold  → threshold = v - 1 (or v/2)
      return { threshold: v === 0 ? -1 : v - Math.max(1, Math.abs(v) * 0.1) };
    case 'above_exclusive':
      // same semantics as above for chooser purposes
      return { threshold: v === 0 ? -1 : v - Math.max(1, Math.abs(v) * 0.1) };
    case 'below':
      return { threshold: v === 0 ? 1 : v + Math.max(1, Math.abs(v) * 0.1) };
    case 'below_or_equal':
      return { threshold: v };
    case 'equal':
      return { threshold: v };
    case 'not_equal':
      return { threshold: v === 0 ? 1 : v + 1 };
    case 'between': {
      const pad = Math.max(1, Math.abs(v) * 0.1);
      return { threshold: v - pad, thresholdMax: v + pad };
    }
    case 'not_between': {
      const pad = Math.max(1, Math.abs(v) * 0.1);
      return { threshold: v + pad, thresholdMax: v + pad * 2 };
    }
    default:
      throw new Error(`Unknown threshold type: ${type}`);
  }
}

/**
 * Evaluate whether measured satisfies the threshold condition.
 * @param {'above'|'below'|'above_exclusive'|'below_or_equal'|'equal'|'not_equal'|'between'|'not_between'} type
 * @param {number} measured
 * @param {{ threshold: number, thresholdMax?: number }} t
 * @returns {boolean}
 */
export function evaluateThreshold(type, measured, t) {
  const m = Number(measured);
  const th = t.threshold;
  const max = t.thresholdMax;
  switch (type) {
    case 'above':
      return m >= th;
    case 'above_exclusive':
      return m > th;
    case 'below':
      return m < th;
    case 'below_or_equal':
      return m <= th;
    case 'equal':
      return m === th;
    case 'not_equal':
      return m !== th;
    case 'between':
      return m >= th && m <= /** @type {number} */ (max);
    case 'not_between':
      return m < th || m > /** @type {number} */ (max);
    default:
      return false;
  }
}

/**
 * Threshold that makes the condition false for control alerts.
 * @param {'above'|'below'|'above_exclusive'|'below_or_equal'|'equal'|'not_equal'|'between'|'not_between'} type
 * @param {number} value
 */
export function chooseControlThreshold(type, value) {
  const v = Number(value);
  switch (type) {
    case 'above':
    case 'above_exclusive':
      return { threshold: v + Math.max(1, Math.abs(v) * 0.1) };
    case 'below':
      return { threshold: v - Math.max(1, Math.abs(v) * 0.1 || 1) };
    case 'below_or_equal':
      return { threshold: v - Math.max(1, Math.abs(v) * 0.1 || 1) };
    case 'equal':
      return { threshold: v === 0 ? 1 : v + 1 };
    case 'not_equal':
      return { threshold: v };
    case 'between': {
      const pad = Math.max(1, Math.abs(v) * 0.1);
      return { threshold: v + pad, thresholdMax: v + pad * 2 };
    }
    case 'not_between': {
      const pad = Math.max(1, Math.abs(v) * 0.1);
      return { threshold: v - pad, thresholdMax: v + pad };
    }
    default:
      throw new Error(`Unknown threshold type: ${type}`);
  }
}
