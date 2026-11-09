import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipePdf, hueFamily } from '../public/assets/js/recipe-pdf.js';

const decode = pdf => new TextDecoder().decode(pdf);

test('creates a print-ready recipe PDF with the blend and every ingredient portion', () => {
  const pdf = decode(createRecipePdf({
    result: '#BC00BC',
    model: 'light',
    entries: [
      { hex: '#FF0000', weight: 25 },
      { hex: '#0000FF', weight: 75 }
    ]
  }));

  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.match(pdf, /startxref\n\d+\n%%EOF/);
  assert.match(pdf, /\(chroma\)/);
  assert.equal((pdf.match(/cm 0 0 8 27 re f Q/g) || []).length, 3);
  assert.match(pdf, /Your custom hue/);
  assert.match(pdf, /#BC00BC/);
  assert.match(pdf, /RGB  188, 0, 188/);
  assert.match(pdf, /Hue  300 deg - Magenta/);
  assert.match(pdf, /#FF0000/);
  assert.match(pdf, /#0000FF/);
  assert.match(pdf, /25%/);
  assert.match(pdf, /75%/);
  assert.match(pdf, /25 parts/);
  assert.match(pdf, /75 parts/);
  assert.match(pdf, /Copyrights by/);
  assert.match(pdf, /\(Play\)/);
  assert.match(pdf, /\(GO\)/);
  assert.match(pdf, /Does not predict physical paint/);
});

test('supports user-supplied pigment names and clearly labels paint approximations', () => {
  const pdf = decode(createRecipePdf({
    result: '#AABBCC',
    model: 'paint',
    entries: [{ hex: '#123456', weight: 1, pigmentId: 'pigment-a' }],
    pigments: [{ id: 'pigment-a', name: 'Ultramarine Blue' }]
  }));

  assert.match(pdf, /Ultramarine Blue/);
  assert.match(pdf, /100%/);
  assert.match(pdf, /Estimated spectra only; no measured pigment data/);
  assert.match(pdf, /not a weight or volume measurement/);
});

test('keeps eight color portions together on one recipe page', () => {
  const entries = Array.from({ length: 8 }, (_, index) => ({
    hex: `#${index.toString(16).padStart(2, '0')}2233`,
    weight: index + 1
  }));
  const pdf = decode(createRecipePdf({
    result: '#223344',
    model: 'light',
    entries
  }));

  assert.equal((pdf.match(/Color 0[1-8]/g) || []).length, 8);
  assert.equal((pdf.match(/\(\d+ parts?\) Tj/g) || []).length, 8);
  assert.match(pdf, /startxref\n\d+\n%%EOF/);
  assert.match(pdf, /Copyrights by/);
});

test('describes digital hue families including neutral colors', () => {
  assert.equal(hueFamily('#FF0000'), 'Red');
  assert.equal(hueFamily('#00FF00'), 'Green');
  assert.equal(hueFamily('#0000FF'), 'Blue');
  assert.equal(hueFamily('#FFFFFF'), 'White');
  assert.equal(hueFamily('#000000'), 'Black');
});

test('rejects recipes without valid colors or positive portions', () => {
  assert.throws(() => createRecipePdf({ result: '#FFFFFF', entries: [] }), /valid color portions/);
  assert.throws(() => createRecipePdf({
    result: '#FFFFFF',
    entries: [{ hex: '#000000', weight: 0 }]
  }), /positive total portion/);
});
