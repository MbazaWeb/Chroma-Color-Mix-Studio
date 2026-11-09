import { shares, toRgb, totalWeight } from './color-utils.js';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const COLORS = {
  ink: [0.13, 0.16, 0.13],
  muted: [0.42, 0.45, 0.41],
  line: [0.88, 0.90, 0.86],
  paper: [1, 1, 1],
  panel: [0.96, 0.97, 0.94],
  accent: [0.28, 0.37, 0.25],
  play: [0.13, 0.16, 0.13],
  go: [0.82, 0.20, 0.19]
};

const clamp = value => Math.min(1, Math.max(0, value));
const rgbUnit = hex => toRgb(hex).map(value => value / 255);

function hueInfo(hex) {
  const [red, green, blue] = toRgb(hex).map(value => value / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;

  if (delta < 0.055) {
    if (lightness >= 0.94) return { family: 'White', degrees: null };
    if (lightness <= 0.12) return { family: 'Black', degrees: null };
    if (lightness >= 0.76) return { family: 'Light neutral', degrees: null };
    if (lightness <= 0.28) return { family: 'Dark neutral', degrees: null };
    return { family: 'Gray', degrees: null };
  }

  let hue;
  if (maximum === red) hue = ((green - blue) / delta) % 6;
  else if (maximum === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue = (hue * 60 + 360) % 360;

  let family;
  if (hue < 18 || hue >= 345) family = 'Red';
  else if (hue < 42) family = 'Orange';
  else if (hue < 68) family = 'Yellow';
  else if (hue < 155) family = 'Green';
  else if (hue < 195) family = 'Cyan';
  else if (hue < 255) family = 'Blue';
  else if (hue < 290) family = 'Violet';
  else family = 'Magenta';
  return { family, degrees: Math.round(hue) % 360 };
}

function pdfText(value) {
  return String(value)
    .replace(/[^\x20-\x7E]/g, '?')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

const pdfColor = color => color.map(value => clamp(value).toFixed(3)).join(' ');
const rgbColor = hex => pdfColor(rgbUnit(hex));
const pointY = top => PAGE_HEIGHT - top;

function text(x, top, size, value, font = 'F1', color = COLORS.ink) {
  return `BT /${font} ${size} Tf ${pdfColor(color)} rg 1 0 0 1 ${x} ${pointY(top + size)} Tm (${pdfText(value)}) Tj ET\n`;
}

function rect(x, top, width, height, color) {
  return `${pdfColor(color)} rg ${x} ${PAGE_HEIGHT - top - height} ${width} ${height} re f\n`;
}

function strokeRect(x, top, width, height, color, lineWidth = 0.8) {
  return `${pdfColor(color)} RG ${lineWidth} w ${x} ${PAGE_HEIGHT - top - height} ${width} ${height} re S\n`;
}

function line(x1, top1, x2, top2, color = COLORS.line, width = 0.8) {
  return `${pdfColor(color)} RG ${width} w ${x1} ${pointY(top1)} m ${x2} ${pointY(top2)} l S\n`;
}

function drawLogo() {
  let stream = '';
  for (const [index, color] of [
    [0, [0.72, 0.81, 0.45]],
    [1, [0.93, 0.63, 0.50]],
    [2, [0.64, 0.65, 0.84]]
  ]) {
    stream += `q ${pdfColor(color)} rg 0.951 -0.309 0.309 0.951 ${48 + index * 12} ${PAGE_HEIGHT - 67} cm 0 0 8 27 re f Q\n`;
  }
  return stream;
}

function makePdf(content) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

export function createRecipePdf({ result, entries, model, pigments = [] }) {
  if (!/^#[0-9A-F]{6}$/i.test(result) || !Array.isArray(entries) || !entries.length
    || entries.some(entry => !/^#[0-9A-F]{6}$/i.test(entry.hex)
      || !Number.isFinite(entry.weight) || entry.weight < 0)) {
    throw new TypeError('A PDF recipe needs a result HEX and valid color portions.');
  }

  const total = totalWeight(entries);
  if (!Number.isFinite(total) || total <= 0) {
    throw new RangeError('A PDF recipe needs a positive total portion.');
  }

  const percentages = shares(entries);
  const resultRgb = toRgb(result);
  const hue = hueInfo(result);
  const activePigments = new Map(pigments.map(pigment => [pigment.id, pigment.name]));
  const titleNames = entries.map((entry, index) =>
    entry.pigmentId && activePigments.has(entry.pigmentId)
      ? activePigments.get(entry.pigmentId)
      : `Color ${String(index + 1).padStart(2, '0')}`);
  const modelNote = {
    light: 'Digital screen blend only. Does not predict physical paint.',
    paint: 'Estimated spectra only; no measured pigment data. Portions show artistic influence, not grams.',
    measured: 'Uses user-supplied measured data. Results depend on the imported calibration.'
  }[model] || 'Digital screen blend only. Does not predict physical paint.';

  let content = '1 J 1 j\n';
  content += rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, COLORS.paper);
  content += drawLogo();
  content += text(94, 37, 25, 'chroma', 'F2');
  content += text(194, 48, 10, 'COLOR MIX STUDIO', 'F1', COLORS.muted);
  content += text(420, 46, 9, 'COLOR RECIPE', 'F2', COLORS.accent);
  content += line(42, 82, 553, 82, COLORS.line, 1);
  content += text(42, 96, 22, 'Your custom hue', 'F2');
  content += text(42, 123, 10, 'A clear record of your color and its recipe.', 'F1', COLORS.muted);

  content += rect(42, 153, 511, 151, COLORS.panel);
  content += rect(58, 169, 132, 119, rgbUnit(result));
  content += strokeRect(58, 169, 132, 119, [0.84, 0.86, 0.82]);
  content += text(210, 170, 9, 'FINAL BLEND', 'F2', COLORS.accent);
  content += text(210, 190, 25, result.toUpperCase(), 'F2');
  content += text(210, 224, 11, `RGB  ${resultRgb.join(', ')}`, 'F1');
  content += text(210, 249, 11, `Hue  ${hue.degrees === null ? 'N/A' : `${hue.degrees} deg`} - ${hue.family}`, 'F1');
  content += text(210, 274, 9, 'Digital sRGB color', 'F1', COLORS.muted);

  content += text(42, 324, 14, 'Recipe portions', 'F2');
  content += text(42, 345, 9, 'Relative parts and percentage share of the total mix', 'F1', COLORS.muted);
  content += text(58, 371, 8, 'COLOR', 'F2', COLORS.muted);
  content += text(294, 371, 8, 'SHARE', 'F2', COLORS.muted);
  content += text(394, 371, 8, 'PORTION', 'F2', COLORS.muted);
  content += line(42, 389, 553, 389, COLORS.line);

  entries.forEach((entry, index) => {
    const top = 397 + index * 42;
    const hex = entry.hex.toUpperCase();
    const label = pdfText(titleNames[index]);
    content += rect(58, top + 8, 24, 24, rgbUnit(hex));
    content += strokeRect(58, top + 8, 24, 24, COLORS.line, 0.6);
    content += text(94, top + 4, 10, label, 'F2');
    content += text(94, top + 19, 8, hex, 'F1', COLORS.muted);
    content += text(294, top + 9, 10, `${percentages[index]}%`, 'F2');
    content += text(394, top + 9, 10, `${entry.weight} ${entry.weight === 1 ? 'part' : 'parts'}`, 'F1');
    content += rect(294, top + 29, 215, 4, COLORS.line);
    if (percentages[index]) {
      content += rect(294, top + 29, 215 * percentages[index] / 100, 4, COLORS.accent);
    }
    content += line(42, top + 41, 553, top + 41, COLORS.line, 0.5);
  });

  const noteTop = 407 + entries.length * 42;
  content += text(42, noteTop, 8, modelNote, 'F1', COLORS.muted);
  content += text(42, noteTop + 14, 8, 'Parts are relative recipe units, not a weight or volume measurement.', 'F1', COLORS.muted);
  content += line(42, 779, 553, 779, COLORS.line, 1);
  content += text(42, 792, 9, 'Copyrights by', 'F1', COLORS.play);
  content += text(105, 792, 9, 'Play', 'F2', COLORS.play);
  content += text(124, 792, 9, 'GO', 'F2', COLORS.go);
  content += text(440, 792, 8, 'CHROMA COLOR MIX STUDIO', 'F1', COLORS.muted);

  return makePdf(content);
}

export const hueFamily = hex => hueInfo(hex).family;
