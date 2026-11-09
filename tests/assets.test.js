import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const root = new URL('../public/', import.meta.url);

test('every offline-cached asset exists in the deployed public directory', async () => {
  const sw = await readFile(new URL('sw.js', root), 'utf8');
  const list = sw.match(/const APP_FILES = (\[[\s\S]*?\]);/)[1];
  for (const match of list.matchAll(/'([^']+)'/g)) {
    await access(new URL(match[1] === '/' ? 'index.html' : match[1].slice(1), root));
  }
});

test('application module imports resolve to shipped local modules', async () => {
  const visited = new Set();
  async function visit(file) {
    if (visited.has(file.href)) return;
    visited.add(file.href);
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('.'), `Unexpected external import: ${match[1]}`);
      await visit(new URL(match[1], file));
    }
  }
  await visit(new URL('assets/js/index.js', root));
});

test('pick-colors step keeps photo sampling without the removed reference sections', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const app = await readFile(new URL('assets/js/index.js', root), 'utf8');
  assert.match(html, /id="imageInput"/);
  assert.doesNotMatch(html, /class="reference-library"|Shade reference library|Learn about paint mixing/);
  assert.doesNotMatch(app, /reference-library\.js|initReferenceLibrary/);
});

test('calibration schema and third-party license are shipped', async () => {
  const schema = JSON.parse(await readFile(new URL('pigment-data.schema.json', root), 'utf8'));
  assert.equal(schema.properties.pigments.items.properties.wavelengths.const.length, 38);
  assert.ok(schema.properties.pigments.items.required.includes('source'));
  const license = await readFile(new URL('assets/js/vendor/spectral.LICENSE.txt', root), 'utf8');
  assert.match(license, /MIT License/);
});
