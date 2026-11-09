import { Color, mix } from './vendor/spectral.js';
import { blend, totalWeight, toHex } from './color-utils.js';

export const MODEL_NOTES = {
  light: 'Digital light · weighted linear-light sRGB. Does not predict physical paint.',
  paint: 'Paint simulation · Kubelka–Munk with spectra estimated from HEX. No measured paint data; parts are artistic influence, not grams.',
  measured: 'Measured-data model · two-constant Kubelka–Munk, opaque dry layer, D65 / CIE 1931 2°. Predictions depend on the imported calibration and volume fractions.'
};

// Data must describe compatible formulations, measured on the same basis.
// 380–750 nm, 10 nm spacing matches the vendored colorimetric integration.
export function validatePigmentData(data) {
  if (!data || data.version !== 1 || data.basis !== 'volume'
    || typeof data.calibration !== 'string' || !data.calibration.trim()
    || !Array.isArray(data.pigments) || !data.pigments.length || data.pigments.length > 8) {
    throw new TypeError('Expected version 1, volume basis, calibration description and 1–8 pigments.');
  }
  const ids = new Set();
  for (const p of data.pigments) {
    if (!p || typeof p.id !== 'string' || !p.id.trim() || ids.has(p.id)
      || !['name', 'source', 'license', 'material'].every(key => typeof p[key] === 'string' && p[key].trim())
      || !Array.isArray(p.wavelengths) || p.wavelengths.length !== 38
      || p.wavelengths.some((v, i) => v !== 380 + i * 10)
      || !['K', 'S'].every(key => Array.isArray(p[key]) && p[key].length === 38
        && p[key].every(v => Number.isFinite(v) && (key === 'S' ? v > 0 : v >= 0)))) {
      throw new TypeError('Each pigment needs unique id, name, material, source, license and 38 valid K/S samples at 380–750 nm.');
    }
    ids.add(p.id);
  }
  return data;
}

// Stable inverse of F(R) = (1-R)^2 / (2R); avoids cancellation for dark paints.
export const reflectanceFromKS = ks => 1 / (1 + ks + Math.sqrt(ks) * Math.sqrt(ks + 2));

export function measuredReflectance(entries, data) {
  validatePigmentData(data);
  const total = totalWeight(entries);
  if (!total || !Number.isFinite(total)) throw new TypeError('Select weighted measured pigments.');
  const selected = entries.map(e => {
    const pigment = data.pigments.find(p => p.id === e.pigmentId);
    if (!pigment || !Number.isFinite(e.weight) || e.weight < 0) throw new TypeError('Invalid measured pigment recipe.');
    return { pigment, share: e.weight / total };
  });
  return Array.from({ length: 38 }, (_, i) => {
    const k = selected.reduce((sum, e) => sum + e.pigment.K[i] * e.share, 0);
    const s = selected.reduce((sum, e) => sum + e.pigment.S[i] * e.share, 0);
    const ratio = k / s;
    if (!Number.isFinite(ratio)) throw new RangeError('K/S coefficients exceed supported numeric range.');
    return reflectanceFromKS(ratio);
  });
}

export const spectralHex = reflectance => toHex(new Color(reflectance).sRGB);

export function calculateMix(entries, model = 'light', data = null) {
  if (!Object.hasOwn(MODEL_NOTES, model)) throw new TypeError('Unknown mixing model.');
  if (model === 'light') return blend(entries);
  if (model === 'measured') {
    validatePigmentData(data);
    if (!entries.length) return '#F0F1E8';
    return spectralHex(measuredReflectance(entries, data));
  }
  blend(entries); // Use the same HEX and weight validation as the light model.
  const active = entries.filter(e => e.weight > 0);
  if (!active.length) return '#F0F1E8';
  if (active.every(e => e.hex.toUpperCase() === active[0].hex.toUpperCase())) return active[0].hex.toUpperCase();
  const total = totalWeight(active);
  return mix(...active.map(e => [new Color(e.hex), e.weight / total])).toString();
}
