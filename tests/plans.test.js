import test from 'node:test';
import assert from 'node:assert/strict';
import { colorLimitFor, formatTzs, PLANS } from '../public/assets/js/plans.js';

test('free and Pro plans have the intended color limits and prices', () => {
  assert.equal(colorLimitFor('free'), 3);
  assert.equal(colorLimitFor('pro'), 8);
  assert.equal(PLANS.pro.monthlyPriceTzs, 9900);
  assert.equal(PLANS.pro.yearlyPriceTzs, 118800);
});

test('formats Tanzanian shilling prices for the upgrade screen', () => {
  assert.equal(formatTzs(9900), 'TZS 9,900');
  assert.equal(formatTzs(118800), 'TZS 118,800');
});

test('rejects unknown plans and invalid prices', () => {
  assert.throws(() => colorLimitFor('enterprise'), /Unknown Chroma plan/);
  assert.throws(() => formatTzs(-1), /non-negative integer/);
  assert.throws(() => formatTzs(1.5), /non-negative integer/);
});
