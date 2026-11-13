'use strict';

// Jest mocks the upstream module ids (`dist/core/metadata`,
// `dist/core/renderChartConfig`). The seam bundle does not require those
// files, so a mock would never run. This shim is mapped only in Jest: a
// mocked upstream export is forwarded, and every other call stays on the seam.
const real = require('../../packages/common-utils/dist/dataLayer/index.js');

const out = { ...real };

Object.defineProperty(out, 'renderChartConfig', {
  enumerable: true,
  get() {
    const mod = require('../../packages/common-utils/dist/core/renderChartConfig.js');
    if (isJestMock(mod.renderChartConfig)) return mod.renderChartConfig;
    return real.renderChartConfig;
  },
});

Object.defineProperty(out, 'getMetadata', {
  enumerable: true,
  get() {
    const mod = require('../../packages/common-utils/dist/core/metadata.js');
    // A mock that replaces the whole module exports the factory and not the class.
    if (
      typeof mod.Metadata !== 'function' &&
      typeof mod.getMetadata === 'function'
    ) {
      return mod.getMetadata;
    }
    if (isJestMock(mod.getMetadata)) return mod.getMetadata;
    return real.getMetadata;
  },
});

function isJestMock(fn) {
  return typeof fn === 'function' && fn._isMockFunction === true;
}

module.exports = out;
