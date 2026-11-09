import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMix, measuredReflectance, validatePigmentData, reflectanceFromKS } from '../public/assets/js/pigment-utils.js';
const samples = v => Array(38).fill(v);
// Analytical fixtures, not measured pigment data.
const data = { version: 1, basis: 'volume', calibration: 'Synthetic constant spectra for tests only', pigments: [
  { id: 'a', name: 'Synthetic A', material: 'Test fixture', source: 'Analytical fixture', license: 'Test only', wavelengths: Array.from({ length: 38 }, (_, i) => 380 + i * 10), K: samples(1), S: samples(1) },
  { id: 'b', name: 'Synthetic B', material: 'Test fixture', source: 'Analytical fixture', license: 'Test only', wavelengths: Array.from({ length: 38 }, (_, i) => 380 + i * 10), K: samples(3), S: samples(2) }
] };

test('two-constant model averages K and S separately with volume fractions', () => {
  const r = measuredReflectance([{ pigmentId: 'a', weight: 1 }, { pigmentId: 'b', weight: 3 }], data);
  const ks = 2.5 / 1.75;
  assert.ok(r.every(v => Math.abs(v - (1 + ks - Math.sqrt(ks * ks + 2 * ks))) < 1e-12));
});

test('measured model preserves endpoints, ordering and scale', () => {
  const entries = [{ pigmentId: 'a', weight: 2 }, { pigmentId: 'b', weight: 7 }];
  assert.deepEqual(measuredReflectance(entries, data), measuredReflectance([...entries].reverse(), data));
  assert.deepEqual(measuredReflectance(entries, data), measuredReflectance(entries.map(e => ({ ...e, weight: e.weight * 10 })), data));
  assert.ok(measuredReflectance([{ pigmentId: 'a', weight: 1 }], data).every(v => v === reflectanceFromKS(1)));
  assert.match(calculateMix(entries, 'measured', data), /^#[A-F0-9]{6}$/);
});

test('import rejects missing provenance, grids, invalid coefficients and unknown pigments', () => {
  for (const mutate of [d => d.basis = 'mass', d => d.pigments[0].source = '',
    d => d.pigments[0].S[0] = 0, d => d.pigments[0].K[0] = -1,
    d => d.pigments[0].wavelengths[0] = 390, d => d.pigments[1].id = 'a']) {
    const invalid = structuredClone(data); mutate(invalid);
    assert.throws(() => validatePigmentData(invalid));
  }
  assert.throws(() => calculateMix([{ pigmentId: 'missing', weight: 1 }], 'measured', data));
});

test('paint simulation is deterministic, multi-color and order independent', () => {
  const entries = [{ hex: '#002185', weight: 1 }, { hex: '#FCD200', weight: 1 }];
  const result = calculateMix(entries, 'paint');
  assert.match(result, /^#[A-F0-9]{6}$/);
  assert.equal(result, calculateMix([...entries].reverse(), 'paint'));
  assert.equal(result, calculateMix(entries.map(e => ({ ...e, weight: 10 })), 'paint'));
  assert.notEqual(result, calculateMix(entries, 'light'));
  assert.equal(calculateMix([{ hex: '#123456', weight: 2 }], 'paint'), '#123456');
  assert.match(calculateMix([...entries, { hex: '#AA2222', weight: 3 }], 'paint'), /^#[A-F0-9]{6}$/);
});

test('dark inverse KM remains positive and white endpoint equals one', () => {
  assert.equal(reflectanceFromKS(0), 1);
  assert.ok(reflectanceFromKS(1e12) > 0);
});

test('empty measured recipe stays an empty UI placeholder', () => {
  assert.equal(calculateMix([], 'measured', data), '#F0F1E8');
});
