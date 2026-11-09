import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blend,
  isHex,
  luma,
  mixRgb,
  shares,
  toneFrequency,
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

test('assigns different pitches to different color hues and shades', () => {
  const tones = [
    toneFrequency('#E54C4C'),
    toneFrequency('#4CA66B'),
    toneFrequency('#417DD1'),
    toneFrequency('#202020'),
    toneFrequency('#FFFFFF')
  ];

  assert.equal(new Set(tones).size, tones.length);
});

test('blends colors according to their weights', () => {
  assert.equal(blend([
    { hex: '#000000', weight: 1 },
    { hex: '#FFFFFF', weight: 3 }
  ]), '#E1E1E1');
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

test('linear-light reference mixtures match known sRGB values', () => {
  const mix = (a, b) => blend([{ hex: a, weight: 1 }, { hex: b, weight: 1 }]);
  assert.equal(mix('#000000', '#FFFFFF'), '#BCBCBC');
  assert.equal(mix('#FF0000', '#00FF00'), '#BCBC00');
  assert.equal(mix('#0000FF', '#FFFF00'), '#BCBCBC');
  assert.equal(mix('#010101', '#030303'), '#020202');
});

test('mixing preserves endpoints and is invariant to order and weight scale', () => {
  const entries = [{ hex: '#123456', weight: 2 }, { hex: '#ABCDEF', weight: 7 }];
  assert.equal(blend(entries), blend([...entries].reverse()));
  assert.equal(blend(entries), blend(entries.map(e => ({ ...e, weight: e.weight * 10 }))));
  assert.equal(blend([{ hex: '#123456', weight: 1 }, { hex: '#FFFFFF', weight: 0 }]), '#123456');
  for (let channel = 0; channel < 256; channel++) {
    const hex = toHex([channel, channel, channel]);
    assert.equal(blend([{ hex, weight: 1 }, { hex, weight: 3 }]), hex);
  }
});

test('invalid recipes fail explicitly instead of producing a false color', () => {
  for (const entry of [null, { hex: '#xyzxyz', weight: 1 },
    { hex: '#FFFFFF', weight: -1 }, { hex: '#FFFFFF', weight: NaN },
    { hex: '#FFFFFF', weight: Infinity }]) {
    assert.throws(() => blend([entry]), TypeError);
  }
});
