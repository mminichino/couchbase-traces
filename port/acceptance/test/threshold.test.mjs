import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  chooseControlThreshold,
  chooseThreshold,
  evaluateThreshold,
} from '../lib/threshold.mjs';

const TYPES = [
  'above',
  'below',
  'above_exclusive',
  'below_or_equal',
  'equal',
  'not_equal',
  'between',
  'not_between',
];

describe('threshold chooser', () => {
  for (const type of TYPES) {
    it(`firing threshold for ${type} is true at measured value`, () => {
      const measured = 10;
      const t = chooseThreshold(type, measured);
      assert.equal(
        evaluateThreshold(type, measured, t),
        true,
        `${type} firing should hold for ${JSON.stringify(t)}`,
      );
    });

    it(`control threshold for ${type} is false at measured value`, () => {
      const measured = 10;
      const t = chooseControlThreshold(type, measured);
      assert.equal(
        evaluateThreshold(type, measured, t),
        false,
        `${type} control should not hold for ${JSON.stringify(t)}`,
      );
    });
  }
});
