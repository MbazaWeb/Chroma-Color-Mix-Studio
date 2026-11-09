import { calculateMix, MODEL_NOTES, validatePigmentData, spectralHex, reflectanceFromKS } from './pigment-utils.js';
/* Chroma — Color Mix Studio
 * Dependency-free. Palette and recipe state, a canvas blending animation,
 * 2D result view, and device-local session restore. */
import {
  blend,
  isHex,
  luma,
  mixRgb,
  shares,
  toneFrequency,
  toHex,
  toRgb,
  totalWeight
} from './color-utils.js';

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
  const SOUND_KEY = 'chroma-sound-enabled';
  const TABS = ['studio', 'bold', 'earth'];
  const MIX_DURATION = 1800;
  const GATHER_START = 350;
  const GATHER_END = 1300;

  const STEPS = [
    {
      title: 'Pick your starting colors.'
    },
    {
      title: 'Find your perfect balance.'
    },
    {
      title: 'Meet your new hue.'
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

  const rgba = (c, a = 1) =>
    `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a, 0, 1).toFixed(3)})`;

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

  let soundEnabled = storage.read(SOUND_KEY) !== false;
  let audioContext = null;
  let masterGain = null;

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
    model: 'light',
    pigmentData: null,
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

  function updateSoundToggle() {
    const button = $('soundToggle');

    button.textContent = soundEnabled ? 'Sound on' : 'Sound off';
    button.setAttribute('aria-pressed', String(soundEnabled));
    button.setAttribute(
      'aria-label',
      soundEnabled ? 'Mute color sounds' : 'Enable color sounds'
    );
  }

  function getAudioContext() {
    if (!soundEnabled) return null;

    const AudioContextConstructor =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextConstructor) {
      toast('Sound effects are not supported by this browser');
      return null;
    }

    try {
      if (!audioContext) {
        audioContext = new AudioContextConstructor();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.45;
        masterGain.connect(audioContext.destination);
      }

      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(error => {
          console.error('Unable to resume audio playback.', error);
        });
      }

      return audioContext;
    } catch (error) {
      console.error('Unable to initialize audio playback.', error);
      toast('Sound effects could not be started');
      return null;
    }
  }

  function playTone(context, frequency, startAt, duration, volume, type) {
    try {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const endAt = startAt + duration;

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startAt);
      envelope.gain.setValueAtTime(0.0001, startAt);
      envelope.gain.exponentialRampToValueAtTime(volume, startAt + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);

      oscillator.connect(envelope);
      envelope.connect(masterGain);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.03);
    } catch (error) {
      console.error('Unable to play a color sound.', error);
    }
  }

  function playColorSound(hex) {
    const context = getAudioContext();

    if (!context) return;

    const frequency = toneFrequency(hex);
    const saturation = Math.max(...toRgb(hex)) - Math.min(...toRgb(hex));
    const startAt = context.currentTime;

    playTone(
      context,
      frequency,
      startAt,
      0.22,
      0.075,
      saturation > 90 ? 'triangle' : 'sine'
    );
    playTone(context, frequency * 2, startAt, 0.16, 0.018, 'sine');
  }

  function startMixSound(hex) {
    const context = getAudioContext();

    if (!context) return () => {};

    const startAt = context.currentTime;
    const endAt = startAt + MIX_DURATION / 1000;
    const envelopes = [];
    const baseFrequency = toneFrequency(hex) / 2;

    try {
      for (const [ratio, volume] of [[1, 0.022], [1.5, 0.009]]) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(baseFrequency * ratio, startAt);
        oscillator.frequency.linearRampToValueAtTime(
          baseFrequency * ratio * 1.12,
          endAt
        );
        envelope.gain.setValueAtTime(0.0001, startAt);
        envelope.gain.linearRampToValueAtTime(volume, startAt + 0.2);
        envelope.gain.setValueAtTime(volume, endAt - 0.2);
        envelope.gain.linearRampToValueAtTime(0.0001, endAt);

        oscillator.connect(envelope);
        envelope.connect(masterGain);
        oscillator.start(startAt);
        oscillator.stop(endAt + 0.03);
        envelopes.push(envelope);
      }
    } catch (error) {
      console.error('Unable to play the mixing sound.', error);
      return () => {};
    }

    return () => {
      const stopAt = context.currentTime;

      if (stopAt < endAt) {
        envelopes.forEach(envelope => {
          envelope.gain.cancelScheduledValues(stopAt);
          envelope.gain.setTargetAtTime(0.0001, stopAt, 0.04);
        });
      }
    };
  }

  function playMixComplete(hex) {
    const context = getAudioContext();

    if (!context) return;

    const startAt = context.currentTime;
    const root = toneFrequency(hex);

    [1, 1.25, 1.5].forEach((ratio, index) => {
      playTone(
        context,
        root * ratio,
        startAt + index * 0.11,
        0.38,
        0.065,
        'sine'
      );
    });
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    storage.write(SOUND_KEY, soundEnabled);

    if (audioContext && masterGain) {
      const target = soundEnabled ? 0.45 : 0;
      masterGain.gain.setTargetAtTime(
        target,
        audioContext.currentTime,
        0.025
      );
    }

    updateSoundToggle();

    if (soundEnabled) getAudioContext();
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

    if (state.model === 'measured') {
      list.querySelectorAll('.ingredient strong').forEach((label, i) => {
        const p = state.pigmentData.pigments.find(p => p.id === state.entries[i].pigmentId);
        label.textContent = p.name;
        label.title = `${p.material} · ${p.source} · ${p.license}`;
      });
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
    renderModel();
    if (state.model === 'measured') {
      document.querySelectorAll('#recipe [data-range]').forEach((input, i) => {
        input.setAttribute('aria-label', state.pigmentData.pigments.find(p => p.id === state.entries[i].pigmentId)?.name || 'Pigment parts');
      });
    }
    const live = calculateMix(state.entries, state.model, state.pigmentData);

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

  function renderModel() {
    $('mixModel').value = state.model;
    $('modelNote').textContent = MODEL_NOTES[state.model];
    $('resultModel').textContent = MODEL_NOTES[state.model];
    $('measuredOption').disabled = !state.pigmentData;
  }

  function renderResult() {
    renderModel();
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
    if (state.model === 'measured') {
      state.model = 'light';
      state.entries = [];
      recipeChanged();
      renderModel();
    }
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

    playColorSound(color);
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
    if (state.model === 'measured') state.model = 'light';
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
      { length: 90 },
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

    const mixed = calculateMix(state.entries, state.model, state.pigmentData);
    const stopMixSound = startMixSound(mixed);

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

    stopMixSound();
    playMixComplete(mixed);
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
      version: 3,
      model: state.model,
      pigmentData: state.pigmentData,
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
      || ![1, 2, 3].includes(s.version)
      || !isValidEntries(s.entries)
    ) return false;

    const entries = s.entries.map(e => ({
      hex: e.hex.toUpperCase(),
      weight: e.weight,
      ...(typeof e.pigmentId === 'string' ? { pigmentId: e.pigmentId } : {})
    }));
    const model = s.version === 3 && Object.hasOwn(MODEL_NOTES, s.model) ? s.model : 'light';
    try {
      if (s.pigmentData) validatePigmentData(s.pigmentData);
      if (model === 'measured') calculateMix(entries, model, s.pigmentData);
    } catch { return false; }
    state.model = model;
    state.pigmentData = s.pigmentData || null;

    const hexes = entries.map(e => e.hex);

    if (state.model !== 'measured' && new Set(hexes).size !== hexes.length) {
      return false;
    }

    state.entries = entries;

    state.result = entries.length ? calculateMix(entries, state.model, state.pigmentData) : NEUTRAL_RESULT;

    state.mixed = s.mixed === true && entries.length > 0;
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
    $('soundToggle').addEventListener('click', toggleSound);

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

    $('mixModel').addEventListener('change', () => {
      if (busy) return;
      const next = $('mixModel').value;
      if (next === 'measured') {
        state.entries = state.pigmentData.pigments.map(p => ({
          hex: spectralHex(p.K.map((k, i) => reflectanceFromKS(k / p.S[i]))),
          weight: START_WEIGHT,
          pigmentId: p.id
        }));
      } else if (state.model === 'measured') {
        state.entries = [];
        state.mixed = false;
        state.result = NEUTRAL_RESULT;
      }
      state.model = next;
      recipeChanged();
      renderAll();
      renderModel();
      persist();
    });

    $('pigmentImport').addEventListener('change', async event => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        if (file.size > 100000) throw new Error('Use a dataset smaller than 100 KB.');
        const data = validatePigmentData(JSON.parse(await file.text()));
        // Verify every individual spectrum can be evaluated before accepting it.
        for (const p of data.pigments) calculateMix([{ pigmentId: p.id, weight: 1 }], 'measured', data);
        state.pigmentData = data;
        $('measuredOption').disabled = false;
        $('mixModel').value = 'measured';
        $('mixModel').dispatchEvent(new Event('change'));
        toast('Imported pigment calibration. Source claims have not been independently verified.');
      } catch (error) { toast(error.message); }
      event.target.value = '';
    });

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
          mixing: state.model,
          modelVersion: 3,
          description: MODEL_NOTES[state.model],
          pigmentData: state.model === 'measured' ? state.pigmentData : null,
          exactShares: state.entries.map(entry => entry.weight / totalWeight(state.entries))
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
      clear: clearSaved
    };

    Object.entries(actions).forEach(([id, fn]) => {
      $(id).addEventListener('click', fn);
    });

    window.addEventListener('pagehide', persist);

    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) persist();
      }
    );
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
    restoreSession();

    state.saved = readSavedColors();

    setupInstallPrompt();
    registerServiceWorker();
    updateSoundToggle();
    bindEvents();
    renderTabs();
    renderAll();
    renderSaved();
    renderResult();
    [1, 2, 3].forEach(n => {
      screenEl(n).hidden = n !== state.step;
    });

    showMixing(false);

    persist();
  }

  init();
})();