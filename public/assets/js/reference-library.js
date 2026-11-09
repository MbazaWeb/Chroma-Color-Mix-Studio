export function initReferenceLibrary({ onUse }) {
  const list = document.getElementById('shadeLibrary');
  const search = document.getElementById('shadeSearch');
  const status = document.getElementById('shadeStatus');
  let shades = [];
  function render() {
    const query = search.value.trim().toLowerCase();
    const matches = shades.filter(s => `${s.name} ${s.code} ${s.category}`.toLowerCase().includes(query));
    list.replaceChildren();
    for (const shade of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shade-card';
      const swatch = document.createElement('i');
      swatch.style.background = shade.hex;
      swatch.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.textContent = shade.name;
      const code = document.createElement('small');
      code.textContent = `${shade.code} · ${shade.hex}`;
      button.append(swatch, name, code);
      button.title = `Add approximate PDF color · source page ${shade.page}`;
      button.addEventListener('click', () => onUse(shade.hex));
      list.append(button);
    }
    status.textContent = `${matches.length} shade references`;
  }
  search.addEventListener('input', render);
  const details = list.closest('details');
  details.addEventListener('toggle', async () => {
    if (!details.open || shades.length || details.dataset.loading) return;
    details.dataset.loading = 'true';
    status.textContent = 'Loading shade references…';
    try {
      const response = await fetch('/assets/data/shade-references.json');
      if (!response.ok) throw new Error('Reference file unavailable. Close and reopen to retry.');
      const data = await response.json();
      if (!Array.isArray(data.shades) || data.shades.some(s =>
        typeof s.name !== 'string' || typeof s.code !== 'string' || !/^#[0-9A-F]{6}$/i.test(s.hex))) {
        throw new Error('Unable to read the shade reference file.');
      }
      shades = data.shades;
      render();
    } catch (error) { status.textContent = error.message; }
    finally { delete details.dataset.loading; }
  });
}
