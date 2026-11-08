export const isHex = value =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export const toRgb = hex =>
  [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));

export const toHex = rgb => '#' + rgb
  .map(value => Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, '0'))
  .join('')
  .toUpperCase();

export const mixRgb = (a, b, t) =>
  a.map((value, index) => value + (b[index] - value) * t);

export const luma = ([r, g, b]) =>
  r * 0.299 + g * 0.587 + b * 0.114;

export function toneFrequency(hex) {
  const rgb = toRgb(hex);
  const [r, g, b] = rgb.map(value => value / 255);
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;

  if (delta) {
    if (maximum === r) {
      hue = ((g - b) / delta) % 6;
    } else if (maximum === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }

    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const brightness = luma(rgb) / 255;

  return 174.61 * 2 ** (hue / 360 * 1.5) * (0.85 + brightness * 0.45);
}

export const totalWeight = entries =>
  entries.reduce((sum, entry) => sum + entry.weight, 0);

export function blend(entries) {
  const total = totalWeight(entries);

  if (!total) return '#F0F1E8';

  return toHex([0, 1, 2].map(channel =>
    entries.reduce(
      (sum, entry) => sum + toRgb(entry.hex)[channel] * entry.weight,
      0
    ) / total
  ));
}

export function shares(entries) {
  const total = totalWeight(entries);

  if (!total) return [];

  const exact = entries.map(entry => entry.weight / total * 100);
  const values = exact.map(Math.floor);

  const order = exact
    .map((value, index) => ({
      index,
      remainder: value - values[index]
    }))
    .sort((a, b) => b.remainder - a.remainder);

  const remaining = 100 - values.reduce((sum, value) => sum + value, 0);

  for (let index = 0; index < remaining; index++) {
    values[order[index].index]++;
  }

  return values;
}
