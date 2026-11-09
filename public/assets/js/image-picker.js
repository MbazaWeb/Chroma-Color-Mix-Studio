import { toHex } from './color-utils.js';

// Map pointer coordinates to the actual contained bitmap, excluding letterboxing.
export function imagePixelPoint(rect, width, height, clientX, clientY) {
  if (!rect.width || !rect.height || !width || !height) return null;
  const scale = Math.min(rect.width / width, rect.height / height);
  const x = (clientX - rect.left - (rect.width - width * scale) / 2) / scale;
  const y = (clientY - rect.top - (rect.height - height * scale) / 2) / scale;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return { x: Math.floor(x), y: Math.floor(y) };
}

export function opaquePixelHex(pixel) {
  return pixel[3] === 255 ? toHex(Array.from(pixel).slice(0, 3)) : null;
}

export function initImagePicker({ onUse, toast }) {
  const $ = id => document.getElementById(id);
  const canvas = $('imageCanvas');
  const context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  let selected = null;
  let point = { x: 0, y: 0 };
  let generation = 0;
  function sample(p, commit = false) {
    if (!p || !canvas.width || !context) return;
    point = p;
    const hex = opaquePixelHex(context.getImageData(p.x, p.y, 1, 1).data);
    $('imageLiveHex').textContent = hex || 'Transparent pixel';
    $('imageLiveSwatch').style.background = hex || 'transparent';
    if (!commit) return;
    selected = hex;
    $('imageUse').disabled = !hex;
    $('imageHex').textContent = hex || 'Choose an opaque pixel';
    $('imageSwatch').style.background = hex || 'transparent';
    $('imageNote').textContent = hex
      ? `Pixel ${p.x + 1}, ${p.y + 1} · decoded sRGB. Photo lighting and camera processing affect the color.`
      : 'Transparent pixels have no single opaque HEX color. Choose an opaque area.';
  }
  $('imageInput').addEventListener('change', async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const current = ++generation;
    let url;
    try {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Choose a JPG, PNG, WebP or GIF image.');
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
      url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await img.decode();
      if (current !== generation) return;
      if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 16000000) {
        throw new Error('Choose an image up to 16 megapixels. It will be sampled without resizing.');
      }
      if (!context) throw new Error('Image sampling is unavailable in this browser.');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.style.maxWidth = `min(100%, ${420 * img.naturalWidth / img.naturalHeight}px)`;
      context.drawImage(img, 0, 0);
      selected = null;
      point = { x: 0, y: 0 };
      $('imageUse').disabled = true;
      $('imageHex').textContent = 'No color selected';
      $('imageLiveHex').textContent = 'Move over the image';
      $('imageSwatch').style.background = 'transparent';
      $('imageLiveSwatch').style.background = 'transparent';
      $('imageMeta').textContent = `${file.name} · ${canvas.width} × ${canvas.height}`;
      $('imageStage').hidden = false;
      $('imageEmpty').hidden = true;
      $('imageNote').textContent = 'Click or tap a pixel. Keyboard: arrows move; Enter selects. Images stay on this device for this visit.';
    } catch (error) {
      if (current === generation) toast(error.message || 'Unable to decode this image.');
    } finally { if (url) URL.revokeObjectURL(url); }
  });
  const eventPoint = event => imagePixelPoint(canvas.getBoundingClientRect(), canvas.width, canvas.height, event.clientX, event.clientY);
  canvas.addEventListener('pointermove', event => sample(eventPoint(event)));
  canvas.addEventListener('click', event => sample(eventPoint(event), true));
  canvas.addEventListener('keydown', event => {
    if ($('imageStage').hidden) return;
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      sample({ x: Math.max(0, Math.min(canvas.width - 1, point.x + dx)), y: Math.max(0, Math.min(canvas.height - 1, point.y + dy)) });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); sample(point, true);
    }
  });
  $('imageUse').addEventListener('click', () => { if (selected) onUse(selected); });
}
