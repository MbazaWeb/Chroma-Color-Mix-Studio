import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blend,
  isHex,
  luma,
  mixRgb,
  shares,
  toHex,
  toRgb,
  totalWeight
} from '../public/assets/js/color-utils.js';

test('validates six-digit HEX colors', () => {
  assert.equal(isHex('#aBc123'), true);
  assert.equal(isHex('aBc123'), false);
  assert.equal(isHex('#abc'), false);
  assert.equal(isHex('#12345g'), false);
  assert.equal(isHex(null), false);
});

test('converts between HEX and RGB', () => {
  assert.deepEqual(toRgb('#12aBcF'), [18, 171, 207]);
  assert.equal(toHex([18, 171, 207]), '#12ABCF');
});

test('clamps and rounds RGB channels when converting to HEX', () => {
  assert.equal(toHex([-1, 12.6, 300]), '#000DFF');
});

test('mixes RGB channels by interpolation', () => {
  assert.deepEqual(mixRgb([0, 40, 100], [100, 80, 0], 0.25), [25, 50, 75]);
});

test('calculates luma for preview text contrast', () => {
  assert.equal(luma([255, 255, 255]), 255);
  assert.equal(luma([0, 0, 0]), 0);
});

test('blends colors according to their weights', () => {
  assert.equal(blend([
    { hex: '#000000', weight: 1 },
    { hex: '#FFFFFF', weight: 3 }
  ]), '#BFBFBF');
});

test('returns the neutral result for an empty or zero-weight blend', () => {
  assert.equal(blend([]), '#F0F1E8');
  assert.equal(blend([{ hex: '#000000', weight: 0 }]), '#F0F1E8');
  assert.equal(totalWeight([]), 0);
});

test('distributes rounded shares so they always total 100 percent', () => {
  const result = shares([
    { hex: '#000000', weight: 1 },
    { hex: '#FFFFFF', weight: 1 },
    { hex: '#FF0000', weight: 1 }
  ]);

  assert.deepEqual(result, [34, 33, 33]);
  assert.equal(result.reduce((sum, share) => sum + share, 0), 100);
});

test('returns no shares when there are no weighted colors', () => {
  assert.deepEqual(shares([]), []);
  assert.deepEqual(shares([{ hex: '#000000', weight: 0 }]), []);
});
