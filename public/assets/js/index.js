/* Chroma — Color Mix Studio
 * Dependency-free. Palette and recipe state, a canvas blending animation,
 * 2D result view and device-local
 * session restore. */
(() => {
  'use strict';

  /* ---------- Configuration ---------- */

  const MAX_COLORS = 8;
  const MAX_SAVED = 12;
  const START_WEIGHT = 50;
  const DEFAULT_RESULT = '#B7B59C';
  const NEUTRAL_RESULT = '#F0F1E8';
  const SESSION_KEY = 'chroma-session-v1';
  const SAVED_KEY = 'chroma-colors';
  const INSTALL_PROMPT_KEY = 'chroma-install-prompt-dismissed';
  const TABS = ['studio', 'bold', 'earth'];
  const MIX_DURATION = 3000;
  const GATHER_START = 1500;
  const GATHER_END = 2600;

  const STEPS = [
    {
      title: 'Pick your starting colors.',
      text: 'Choose up to 8 shades. Your next favorite color starts with a little curiosity.'
    },
    {
      title: 'Find your perfect balance.',
      text: 'Give each color its share, then watch them come together.'
    },
    {
      title: 'Meet your new hue.',
      text: 'A color made by you. Copy it, save it, or fine-tune it.'
    }
  ];

  const STUDIO_BASES = [
    '#e5d6ca', '#d7baa6', '#d6b079', '#beca9c', '#90afa1',
    '#9bb8bf', '#a7b6d0', '#b5a9c8', '#ccadbb', '#d9a497'
  ];

  const BOLD = [
    '#ffffff', '#202020', '#e54c4c', '#e58c40', '#edc84d',
    '#bace55', '#4ca66b', '#4baeba', '#417dd1', '#9858ba'
  ];

  const EARTH = [
    '#f0e8db', '#d6c7a6', '#bea582', '#a98262', '#94765d',
    '#b3b58d', '#8a9a77', '#6b826d', '#55675b', '#4c5550'
  ];

  /* ---------- Color and data helpers ---------- */

  const $ = id => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const easeInOutCubic = t => (
    t < 0.5
      ? 4 * t * t * t
      : 1 - ((-2 * t + 2) ** 3) / 2
  );

  const prefersReduced = () =>
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isHex = v =>
    typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

  const toRgb = hex =>
    [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

  const toHex = rgb => '#' + rgb
    .map(v => Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, '0'))
    .join('')
    .toUpperCase();

  const mixRgb = (a, b, t) =>
    a.map((v, i) => lerp(v, b[i], t));

  const rgba = (c, a = 1) =>
    `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a, 0, 1).toFixed(3)})`;

  const luma = ([r, g, b]) =>
    r * 0.299 + g * 0.587 + b * 0.114;

  const totalWeight = entries =>
    entries.reduce((sum, e) => sum + e.weight, 0);

  function blend(entries) {
    const total = totalWeight(entries);

    if (!total) return NEUTRAL_RESULT;

    return toHex([0, 1, 2].map(ch =>
      entries.reduce(
        (sum, e) => sum + toRgb(e.hex)[ch] * e.weight,
        0
      ) / total
    ));
  }

  // Distribute rounding fairly while keeping the total at 100%.
  function shares(entries) {
    const total = totalWeight(entries);

    if (!total) return [];

    const exact = entries.map(e => e.weight / total * 100);
    const values = exact.map(Math.floor);

    const order = exact
      .map((v, i) => ({
        i,
        remainder: v - values[i]
      }))
      .sort((a, b) => b.remainder - a.remainder);

    const remaining =
      100 - values.reduce((a, b) => a + b, 0);

    for (let i = 0; i < remaining; i++) {
      values[order[i].i]++;
    }

    return values;
  }

  function buildStudioPalette() {
    return Array.from({ length: 6 }, (_, row) =>
      STUDIO_BASES.map(base =>
        toHex(toRgb(base).map(v =>
          row < 3
            ? v + (255 - v) * (2 - row) * 0.21
            : v * (1 - (row - 2) * 0.17)
        ))
      )
    ).flat();
  }

  const PALETTES = {
    studio: buildStudioPalette(),
    bold: BOLD,
    earth: EARTH
  };

  const storage = {
    read(key) {
      try {
        return JSON.parse(
          localStorage.getItem(key) ?? 'null'
        );
      } catch {
        return null;
      }
    },

    write(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
  };

  const isValidEntries = list =>
    Array.isArray(list)
    && list.length <= MAX_COLORS
    && list.every(e =>
      e
      && isHex(e.hex)
      && Number.isInteger(e.weight)
      && e.weight >= 1
      && e.weight <= 100
    );

  /* ---------- State ---------- */

  const state = {
    step: 1,
    tab: 'studio',
    entries: [],
    result: DEFAULT_RESULT,
    mixed: false,
    dirty: false,
    saved: []
  };

  let busy = false;
  let deferredInstallPrompt = null;

  const canEnter = step =>
    step === 1
    || (step === 2 && state.entries.length > 0)
    || (step === 3 && state.mixed && !state.dirty);

  const recipeChanged = () => {
    if (state.mixed) state.dirty = true;
    renderProgress();
  };

  function statusText() {
    if (state.dirty) {
      return 'Recipe changed · blend to update';
    }

    if (state.mixed) {
      return 'Your blend is ready';
    }

    return 'Start fresh · pick your first color';
  }

  /* ---------- Feedback ---------- */

  let toastTimer = 0;

  function toast(message) {
    const el = $('toast');

    el.textContent = message;
    el.classList.add('show');

    clearTimeout(toastTimer);

    toastTimer = setTimeout(
      () => el.classList.remove('show'),
      2300
    );
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`Copied ${text}`);
    } catch {
      toast(
        'Copy unavailable. Select the code to copy manually.'
      );
    }
  }

  /* ---------- Rendering ---------- */

  function renderAll() {
    renderPalette();
    renderRecipe();
    renderSelection();
    renderProgress();

    $('mix').disabled = !state.entries.length;
    $('equal').disabled = !state.entries.length;
  }

  function renderPalette() {
    const colors = PALETTES[state.tab];
    const chosen = new Set(
      state.entries.map(e => e.hex)
    );

    $('colorCount').textContent = `${colors.length} shades`;

    $('palette').innerHTML = colors.map(hex => {
      const on = chosen.has(hex);

      return `
        <button
          class="swatch${on ? ' selected' : ''}"
          style="background:${hex}"
          data-color="${hex}"
          title="${hex}"
          aria-label="${on ? 'Remove' : 'Add'} ${hex}"
          aria-pressed="${on}"
        ></button>
      `;
    }).join('');
  }

  function renderTabs() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      const on = btn.dataset.tab === state.tab;

      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
  }

  function renderRecipe() {
    const list = $('recipe');

    if (!state.entries.length) {
      list.innerHTML = `
        <div class="empty">
          Your recipe is empty. Go back to pick some colors.
        </div>
      `;
    } else {
      const share = shares(state.entries);

      list.innerHTML = state.entries.map((e, i) => `
        <div class="ingredient" data-index="${i}">
          <div class="ingredient-top">
            <span
              class="dot"
              style="background:${e.hex}"
            ></span>

            <strong>${e.hex}</strong>

            <span class="share">
              ${share[i]}% of mix
            </span>

            <button
              class="remove"
              data-remove="${i}"
              aria-label="Remove ${e.hex}"
            >×</button>
          </div>

          <div class="range-row">
            <input
              type="range"
              min="1"
              max="100"
              value="${e.weight}"
              aria-label="Parts of ${e.hex}"
              data-range="${i}"
            >

            <span class="parts">
              ${e.weight} parts
            </span>
          </div>
        </div>
      `).join('');
    }

    renderComposition();
  }

  function refreshRecipeValues() {
    const share = shares(state.entries);

    state.entries.forEach((e, i) => {
      const row = document.querySelector(
        `.ingredient[data-index="${i}"]`
      );

      if (!row) return;

      row.querySelector('.share').textContent =
        `${share[i]}% of mix`;

      row.querySelector('.parts').textContent =
        `${e.weight} parts`;
    });

    renderComposition();
  }

  function renderComposition() {
    const total = totalWeight(state.entries);
    const live = blend(state.entries);

    $('liveColor').style.background = live;
    $('liveHex').textContent =
      state.entries.length ? live : '—';

    $('composition').innerHTML = state.entries
      .map(e => `
        <i style="
          width:${(e.weight / total) * 100}%;
          background:${e.hex}
        "></i>
      `)
      .join('');
  }

  function renderSelection() {
    const n = state.entries.length;

    $('selectionCount').textContent = n
      ? `${n} of ${MAX_COLORS} colors selected`
      : 'Choose a color to start';

    $('next').disabled = !n;

    $('selectionTray').innerHTML =
      state.entries.map((e, i) => `
        <span class="selection-chip">
          <i style="background:${e.hex}"></i>
          ${e.hex}

          <button
            data-chip="${i}"
            aria-label="Remove selected ${e.hex}"
          >×</button>
        </span>
      `).join('');
  }

  function renderProgress() {
    document
      .querySelectorAll('#progress [data-step]')
      .forEach(btn => {
        const n = Number(btn.dataset.step);
        const current = n === state.step;

        btn.classList.toggle('active', current);
        btn.classList.toggle('done', n < state.step);

        btn.disabled = !current && !canEnter(n);

        if (current) {
          btn.setAttribute('aria-current', 'step');
        } else {
          btn.removeAttribute('aria-current');
        }
      });

    $('heading').textContent =
      STEPS[state.step - 1].title;

    $('subheading').textContent =
      STEPS[state.step - 1].text;
  }

  function renderSaved() {
    $('saved').innerHTML = state.saved.length
      ? state.saved.map(c => `
          <button
            class="saved-color"
            style="background:${c}"
            data-hex="${c}"
            aria-label="Load saved color ${c}"
            title="Load ${c}"
          ></button>
        `).join('')
      : `
        <div class="empty">
          Save a blend you love. Come back to it anytime.
        </div>
      `;

    $('clear').disabled = !state.saved.length;
  }

  function renderResult() {
    const rgb = toRgb(state.result);
    const preview = $('preview');

    preview.style.background = state.result;
    preview.style.color =
      luma(rgb) > 145 ? '#293226' : '#ffffff';

    $('hex').textContent = state.result;
    $('rgb').textContent = rgb.join(', ');
    $('status').textContent = statusText();

  }

  /* ---------- Recipe actions ---------- */

  function addColor(hex) {
    const color = hex.toUpperCase();

    const existing = state.entries.findIndex(
      e => e.hex === color
    );

    if (existing !== -1) {
      removeColor(existing);
      return;
    }

    if (state.entries.length >= MAX_COLORS) {
      return toast(
        `Keep your recipe to ${MAX_COLORS} colors or fewer`
      );
    }

    state.entries.push({
      hex: color,
      weight: START_WEIGHT
    });

    recipeChanged();
    renderAll();
    persist();
  }

  function removeColor(index) {
    state.entries.splice(index, 1);

    recipeChanged();
    renderAll();

    if (!state.entries.length && state.step === 2) {
      goTo(1);
    }

    persist();
  }

  function equalParts() {
    state.entries.forEach(e => {
      e.weight = START_WEIGHT;
    });

    recipeChanged();
    renderRecipe();
    persist();
  }

  function setTab(tab) {
    if (!TABS.includes(tab) || tab === state.tab) return;

    state.tab = tab;

    renderTabs();
    renderPalette();
    persist();
  }

  function saveCurrent() {
    if (!state.entries.length) {
      return toast('Blend some colors first');
    }

    if (!state.mixed) {
      return toast('Blend your colors first');
    }

    if (state.dirty) {
      return toast(
        'Blend your updated recipe before saving'
      );
    }

    if (state.saved.includes(state.result)) {
      return toast('Already in your collection');
    }

    if (state.saved.length >= MAX_SAVED) {
      return toast(
        'Collection full. Clear it to start a new one.'
      );
    }

    const next = [...state.saved, state.result];

    if (!storage.write(SAVED_KEY, next)) {
      return toast(
        'Unable to save. Your browser storage may be full or disabled.'
      );
    }

    state.saved = next;

    renderSaved();

    $('saved').lastElementChild?.animate(
      [
        { opacity: 0, transform: 'scale(0.4)' },
        { opacity: 1, transform: 'scale(1)' }
      ],
      {
        duration: prefersReduced() ? 0 : 420,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
      }
    );

    toast('Added to your collection');
  }

  function clearSaved() {
    if (!storage.write(SAVED_KEY, [])) {
      return toast(
        'Unable to clear saved colors on this device.'
      );
    }

    state.saved = [];
    renderSaved();
    toast('Collection cleared');
  }

  function openSaved(hex) {
    state.entries = [{ hex, weight: 100 }];
    state.result = hex;
    state.mixed = true;
    state.dirty = false;

    renderAll();
    renderResult();
    persist();
  }

  async function startOver() {
    if (busy) return;

    state.entries = [];
    state.mixed = false;
    state.dirty = false;
    state.result = NEUTRAL_RESULT;

    renderAll();

    await goTo(1);

    persist();
  }

  /* ---------- Step navigation ---------- */

  const screenEl = step => $('screen' + step);

  function showMixing(on) {
    $('recipeView').hidden = on;
    $('backPick').hidden = on;
    $('mixView').hidden = !on;
  }

  async function goTo(step) {
    if (
      busy
      || step === state.step
      || !canEnter(step)
    ) return;

    busy = true;
    document.querySelector('.workspace').inert = true;

    const forward = step > state.step;
    const from = screenEl(state.step);
    const to = screenEl(step);
    const reduced = prefersReduced();

    await from.animate(
      [
        {
          opacity: 1,
          transform: 'translateY(0)'
        },
        {
          opacity: 0,
          transform: `translateY(${forward ? -14 : 14}px)`
        }
      ],
      {
        duration: reduced ? 0 : 180,
        easing: 'ease-in'
      }
    ).finished;

    from.hidden = true;
    state.step = step;

    if (step === 2) {
      showMixing(false);
      renderRecipe();
    }

    to.hidden = false;

    to.animate(
      [
        {
          opacity: 0,
          transform: `translateY(${forward ? 24 : -24}px)`
        },
        {
          opacity: 1,
          transform: 'translateY(0)'
        }
      ],
      {
        duration: reduced ? 0 : 520,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
      }
    );

    renderProgress();

    if (step === 3) renderResult();

    window.scrollTo({
      top: 0,
      behavior: reduced ? 'auto' : 'smooth'
    });

    $('heading').focus({ preventScroll: true });

    persist();

    document.querySelector('.workspace').inert = false;
    busy = false;
  }

  /* ---------- Mixing animation ---------- */

  function playMix(entries, mixed, onGather) {
    const canvas = $('mixCanvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      onGather();
      return Promise.resolve();
    }

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      2
    );

    const size = canvas.clientWidth || 260;

    canvas.width = Math.round(size * dpr);
    canvas.height = canvas.width;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const c = size / 2;
    const target = toRgb(mixed);
    const neutral = [244, 245, 238];
    const origins = entries.map(e => toRgb(e.hex));
    const total = totalWeight(entries);
    const cumulative = [];

    let acc = 0;

    for (const e of entries) {
      acc += e.weight / total;
      cumulative.push(acc);
    }

    const particles = Array.from(
      { length: 140 },
      () => {
        const r = Math.random();

        let idx = cumulative.findIndex(v => r <= v);

        if (idx < 0) idx = entries.length - 1;

        return {
          color: origins[idx],
          angle: Math.random() * Math.PI * 2,
          spin:
            (0.6 + Math.random() * 0.9)
            * (Math.random() < 0.5 ? -1 : 1),
          orbit: (0.3 + Math.random() * 0.65) * c,
          size: (0.09 + Math.random() * 0.1) * c,
          core: (0.04 + Math.random() * 0.06) * c,
          wobble: Math.random() * Math.PI * 2
        };
      }
    );

    const draw = elapsed => {
      const gather = easeInOutCubic(
        clamp(
          (elapsed - GATHER_START)
          / (GATHER_END - GATHER_START),
          0,
          1
        )
      );

      const settle = clamp(
        (elapsed - GATHER_END)
        / (MIX_DURATION - GATHER_END),
        0,
        1
      );

      const time = elapsed / 1000;

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, c, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = rgba(
        mixRgb(neutral, target, gather)
      );

      ctx.fillRect(0, 0, size, size);

      for (const p of particles) {
        const angle =
          p.angle
          + p.spin * time * 1.8 * (1 - gather * 0.6);

        const wobble =
          Math.sin(time * 3 + p.wobble)
          * c * 0.05 * (1 - gather);

        const radius = lerp(
          p.orbit + wobble,
          p.core,
          gather
        );

        const x = c + Math.cos(angle) * radius;
        const y = c + Math.sin(angle) * radius;
        const r = lerp(p.size, c * 0.55, gather);
        const color = mixRgb(p.color, target, gather);
        const alpha = 1 - settle;

        const glow = ctx.createRadialGradient(
          x, y, 0,
          x, y, r
        );

        glow.addColorStop(
          0,
          rgba(color, 0.95 * alpha)
        );

        glow.addColorStop(
          0.6,
          rgba(color, 0.55 * alpha)
        );

        glow.addColorStop(1, rgba(color, 0));

        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (settle > 0) {
        const sheen = ctx.createRadialGradient(
          c * 0.7,
          c * 0.55,
          0,
          c * 0.7,
          c * 0.55,
          c * 1.1
        );

        sheen.addColorStop(
          0,
          `rgba(255,255,255,${(0.35 * settle).toFixed(3)})`
        );

        sheen.addColorStop(
          1,
          'rgba(255,255,255,0)'
        );

        ctx.fillStyle = sheen;
        ctx.fillRect(0, 0, size, size);
      }

      ctx.restore();
    };

    return new Promise(resolve => {
      if (prefersReduced()) {
        draw(MIX_DURATION);
        onGather();
        setTimeout(resolve, 200);
        return;
      }

      const start = performance.now();
      let gathered = false;

      const frame = now => {
        const elapsed = Math.min(
          now - start,
          MIX_DURATION
        );

        if (!gathered && elapsed >= GATHER_START) {
          gathered = true;
          onGather();
        }

        draw(elapsed);

        if (elapsed < MIX_DURATION) {
          requestAnimationFrame(frame);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(frame);
    });
  }

  async function blendColors() {
    if (busy || !state.entries.length) return;

    busy = true;
    $('progress').inert = true;

    const mixed = blend(state.entries);

    showMixing(true);

    $('mixMessage').textContent =
      'Bringing your colors together…';

    window.scrollTo({
      top: 0,
      behavior: prefersReduced() ? 'auto' : 'smooth'
    });

    await playMix(state.entries, mixed, () => {
      $('mixMessage').textContent =
        'Finding a happy medium…';
    });

    state.result = mixed;
    state.mixed = true;
    state.dirty = false;

    showMixing(false);

    $('progress').inert = false;
    busy = false;

    await goTo(3);
  }

  /* ---------- Session persistence ---------- */

  function persist() {
    const ok = storage.write(SESSION_KEY, {
      version: 1,
      step: state.step,
      tab: state.tab,
      entries: state.entries,
      result: state.result,
      mixed: state.mixed,
      dirty: state.dirty,
      custom: $('custom').value,
      updatedAt: Date.now()
    });

    const indicator = $('deviceStatus');

    indicator.textContent = ok
      ? ''
      : 'Progress kept for this visit only';

    indicator.classList.toggle(
      'unavailable',
      !ok
    );
  }

  function restoreSession() {
    const s = storage.read(SESSION_KEY);

    if (
      !s
      || s.version !== 1
      || !isValidEntries(s.entries)
    ) return false;

    const entries = s.entries.map(e => ({
      hex: e.hex.toUpperCase(),
      weight: e.weight
    }));

    const hexes = entries.map(e => e.hex);

    if (new Set(hexes).size !== hexes.length) {
      return false;
    }

    state.entries = entries;

    state.result = isHex(s.result)
      ? s.result.toUpperCase()
      : DEFAULT_RESULT;

    state.mixed = s.mixed === true;
    state.dirty = state.mixed && s.dirty === true;

    state.tab = TABS.includes(s.tab)
      ? s.tab
      : 'studio';

    if (isHex(s.custom)) {
      $('custom').value = s.custom;
    }

    let step = [1, 2, 3].includes(s.step)
      ? s.step
      : 1;

    if (!state.entries.length) {
      step = 1;
    } else if (step === 3 && !canEnter(3)) {
      step = 2;
    }

    state.step = step;

    return true;
  }

  function readSavedColors() {
    const list = storage.read(SAVED_KEY);

    return Array.isArray(list)
      ? list
        .filter(isHex)
        .map(c => c.toUpperCase())
        .slice(0, MAX_SAVED)
      : [];
  }

  /* ---------- Event wiring ---------- */

  function bindEvents() {
    $('palette').addEventListener('click', e => {
      const swatch = e.target.closest('[data-color]');

      if (swatch && !busy) {
        addColor(swatch.dataset.color);
      }
    });

    $('selectionTray').addEventListener('click', e => {
      const btn = e.target.closest('[data-chip]');

      if (btn) {
        removeColor(Number(btn.dataset.chip));
      }
    });

    $('recipe').addEventListener('click', e => {
      const btn = e.target.closest('[data-remove]');

      if (btn) {
        removeColor(Number(btn.dataset.remove));
      }
    });

    $('recipe').addEventListener('input', e => {
      if (e.target.dataset.range === undefined) {
        return;
      }

      state.entries[
        Number(e.target.dataset.range)
      ].weight = Number(e.target.value);

      recipeChanged();
      refreshRecipeValues();
    });

    $('recipe').addEventListener('change', persist);

    $('saved').addEventListener('click', e => {
      const btn = e.target.closest('[data-hex]');

      if (btn) {
        openSaved(btn.dataset.hex);
      }
    });

    $('progress').addEventListener('click', e => {
      const btn = e.target.closest('[data-step]');

      if (btn) {
        goTo(Number(btn.dataset.step));
      }
    });

    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        setTab(btn.dataset.tab);
      });
    });

    $('hexForm').addEventListener('submit', e => {
      e.preventDefault();

      const value = $('hexInput').value.trim();

      const hex = value.startsWith('#')
        ? value
        : '#' + value;

      if (!isHex(hex)) {
        return toast(
          'Enter a valid six-digit HEX color'
        );
      }

      addColor(hex);
      $('hexInput').value = '';
    });

    document
      .querySelector('.tabs')
      .addEventListener('keydown', e => {
        if (![
          'ArrowLeft',
          'ArrowRight',
          'Home',
          'End'
        ].includes(e.key)) return;

        e.preventDefault();

        const index = TABS.indexOf(state.tab);

        const next = e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? TABS.length - 1
            : (
              index
              + (e.key === 'ArrowRight' ? 1 : -1)
              + TABS.length
            ) % TABS.length;

        setTab(TABS[next]);

        document
          .querySelector(`[data-tab="${state.tab}"]`)
          .focus();
      });

    $('custom').addEventListener('change', e => {
      addColor(e.target.value);
    });

    const actions = {
      next: () => goTo(2),
      backPick: () => goTo(1),
      backMix: () => goTo(2),
      equal: equalParts,
      mix: blendColors,
      reset: startOver,
      newMix: startOver,

      hexCopy: () => copyText(state.result),

      rgbCopy: () => copyText(
        `rgb(${toRgb(state.result).join(', ')})`
      ),

      export: () => {
        const payload = {
          name: 'Chroma color recipe',
          hex: state.result,
          rgb: toRgb(state.result),
          ingredients: state.entries,
          shares: shares(state.entries),
          mixing: 'Weighted RGB channel average'
        };

        const url = URL.createObjectURL(
          new Blob(
            [JSON.stringify(payload, null, 2)],
            { type: 'application/json' }
          )
        );

        const link = document.createElement('a');

        link.href = url;
        link.download =
          `chroma-${state.result.slice(1)}.json`;

        document.body.append(link);
        link.click();
        link.remove();

        setTimeout(
          () => URL.revokeObjectURL(url),
          1000
        );
      },

      save: saveCurrent,
      clear: clearSaved,
      help: () => $('info').showModal(),
      close: () => $('info').close()
    };

    Object.entries(actions).forEach(([id, fn]) => {
      $(id).addEventListener('click', fn);
    });

    $('info').addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        e.currentTarget.close();
      }
    });

    window.addEventListener('pagehide', persist);

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) persist();
      }
    );
  }

  /* ---------- Splash ---------- */

  function dismissSplash() {
    const splash = $('splash');

    const surfaces = [
      document.querySelector('header'),
      document.querySelector('main')
    ];

    surfaces.forEach(el => {
      el.inert = true;
    });

    setTimeout(() => {
      splash.classList.add('dismiss');

      surfaces.forEach(el => {
        el.inert = false;
      });

      setTimeout(() => splash.remove(), 450);
    }, prefersReduced() ? 250 : 1450);
  }

  function isStandalone() {
    return matchMedia('(display-mode: standalone)').matches
      || navigator.standalone === true;
  }

  function showInstallInstructions() {
    const isAppleMobile =
      /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (
        navigator.platform === 'MacIntel'
        && navigator.maxTouchPoints > 1
      );

    const instructions = isAppleMobile
      ? 'In Safari, tap Share, then choose “Add to Home Screen”.'
      : /Android/.test(navigator.userAgent)
        ? 'Open your browser menu and choose “Install app” or “Add to Home screen”.'
        : 'Open your browser menu and choose “Install Chroma” or “Install this site as an app”.';

    $('installDescription').textContent = instructions;
    $('installApp').textContent = 'Got it';
  }

  function setupInstallPrompt() {
    const dialog = $('installPrompt');

    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      $('installApp').textContent = 'Install Chroma';
      $('installDescription').textContent =
        'Add Chroma to your device for quick access and a focused, app-like experience.';
    });

    window.addEventListener('appinstalled', () => {
      storage.write(INSTALL_PROMPT_KEY, true);
      deferredInstallPrompt = null;

      if (dialog.open) dialog.close();
    });

    $('installApp').addEventListener('click', async () => {
      if (!deferredInstallPrompt) {
        if ($('installApp').textContent === 'Got it') {
          storage.write(INSTALL_PROMPT_KEY, true);
          dialog.close();
        } else {
          showInstallInstructions();
        }

        return;
      }

      const installEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;

      try {
        await installEvent.prompt();

        const { outcome } = await installEvent.userChoice;

        if (outcome === 'accepted') {
          storage.write(INSTALL_PROMPT_KEY, true);
          dialog.close();
        } else {
          $('installApp').textContent = 'How to install';
        }
      } catch (error) {
        console.error('Unable to open the app install prompt.', error);
        showInstallInstructions();
      }
    });

    $('dismissInstall').addEventListener('click', () => {
      storage.write(INSTALL_PROMPT_KEY, true);
      dialog.close();
    });

    dialog.addEventListener('cancel', () => {
      storage.write(INSTALL_PROMPT_KEY, true);
    });

    setTimeout(() => {
      if (
        !isStandalone()
        && storage.read(INSTALL_PROMPT_KEY) !== true
      ) {
        dialog.showModal();
      }
    }, 2000);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .catch(error => {
        console.error('Unable to register the Chroma service worker.', error);
      });
  }

  /* ---------- Initialization ---------- */

  function init() {
    const restored = restoreSession();

    state.saved = readSavedColors();

    $('splashNote').textContent =
      restored && state.entries.length
        ? 'Your last mix is ready to resume'
        : 'Opening your color studio';

    setupInstallPrompt();
    registerServiceWorker();
    bindEvents();
    renderTabs();
    renderAll();
    renderSaved();
    renderResult();
    [1, 2, 3].forEach(n => {
      screenEl(n).hidden = n !== state.step;
    });

    showMixing(false);

    dismissSplash();
    persist();
  }

  init();
})();