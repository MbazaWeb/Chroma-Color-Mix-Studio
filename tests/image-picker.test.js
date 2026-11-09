import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { imagePixelPoint, opaquePixelHex } from '../public/assets/js/image-picker.js';

test('sampling maps CSS coordinates onto original pixels without downscaling', () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };
  assert.deepEqual(imagePixelPoint(rect, 1000, 500, 110, 70), { x: 500, y: 250 });
  assert.equal(imagePixelPoint(rect, 1000, 500, 210, 70), null);
});

test('contain letterboxing is excluded from sampling', () => {
  const rect = { left: 0, top: 0, width: 300, height: 200 };
  assert.equal(imagePixelPoint(rect, 100, 200, 50, 100), null);
  assert.deepEqual(imagePixelPoint(rect, 100, 200, 100, 0), { x: 0, y: 0 });
  assert.deepEqual(imagePixelPoint(rect, 100, 200, 199, 199), { x: 99, y: 199 });
  assert.equal(imagePixelPoint({ ...rect, width: 0 }, 100, 200, 0, 0), null);
});

test('opaque sRGB pixels produce HEX and transparency is never silently discarded', () => {
  assert.equal(opaquePixelHex(new Uint8ClampedArray([18, 171, 207, 255])), '#12ABCF');
  assert.equal(opaquePixelHex([255, 0, 0, 128]), null);
  assert.equal(opaquePixelHex([0, 0, 0, 0]), null);
});

test('all 45 PDF shade references have unique codes and traceable page numbers', async () => {
  const data = JSON.parse(await readFile(new URL('../public/assets/data/shade-references.json', import.meta.url), 'utf8'));
  assert.equal(data.shades.length, 45);
  assert.equal(new Set(data.shades.map(s => s.code)).size, 45);
  for (const s of data.shades) {
    assert.match(s.hex, /^#[0-9A-F]{6}$/);
    assert.ok(s.page >= 3 && s.page <= 7);
  }
  assert.equal(data.shades.find(s => s.code === 'L152').name, 'Cream Pie');
  assert.equal(data.shades.find(s => s.code === 'L152').hex, '#F8F6F4');
});
