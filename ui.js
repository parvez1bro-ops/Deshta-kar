const $ = (id) => document.getElementById(id);

/**
 * Binds the HUD and the pause-menu settings panel to the Settings object.
 * Every control here is wired to real behaviour; nothing is decorative.
 * Created once at start-up, so listeners are never duplicated.
 */
export class UI {
  /**
   * @param {import('./settings.js').Settings} settings
   * @param {{ cameraLimits: object, getCameraDistance: () => number, stateLabels: Record<string,string> }} opts
   */
  constructor(settings, { cameraLimits, getCameraDistance, stateLabels }) {
    this.settings = settings;
    this.limits = cameraLimits;
    this.getCameraDistance = getCameraDistance;
    this.stateLabels = stateLabels;

    this.fpsEl = $('fps');
    this.limitEl = $('hudLimit');
    this.qualityEl = $('hudQuality');
    this.stateEl = $('hudState');
    this.callsEl = $('hudCalls');
    this._state = '';

    this.fpsButtons = [...document.querySelectorAll('[data-fps]')];
    this.qualityButtons = [...document.querySelectorAll('[data-quality]')];

    for (const b of this.fpsButtons) b.addEventListener('click', () => settings.setFpsLimit(Number(b.dataset.fps)));
    for (const b of this.qualityButtons) b.addEventListener('click', () => settings.setQuality(b.dataset.quality));

    // camera sliders: live while dragging, saved when released
    this.sliders = {};
    for (const [name, id] of [['sensitivity', 'sensSlider'], ['height', 'heightSlider'], ['distance', 'zoomSlider']]) {
      const input = $(id), out = $(`${id}Value`);
      const lim = this.limits[name];
      input.min = String(lim.min);
      input.max = String(lim.max);
      input.step = String(lim.step);
      input.addEventListener('input', () => settings.setCamera(name, Number(input.value), { save: false }));
      input.addEventListener('change', () => settings.commit());
      this.sliders[name] = { input, out };
    }

    settings.subscribe(() => this.refreshSettings());
    this.refreshSettings();
  }

  fmt(name, v) {
    return name === 'sensitivity' ? `${v.toFixed(1)}×` : `${v.toFixed(name === 'height' ? 2 : 1)} m`;
  }

  /** Refresh button states, slider positions and HUD text. */
  refreshSettings() {
    const s = this.settings;
    for (const b of this.fpsButtons) b.classList.toggle('on', Number(b.dataset.fps) === s.fpsLimit);
    for (const b of this.qualityButtons) b.classList.toggle('on', b.dataset.quality === s.quality);
    this.limitEl.textContent = `${s.fpsLimit}`;
    this.qualityEl.textContent = s.preset.label;
    for (const name of Object.keys(this.sliders)) {
      const { input, out } = this.sliders[name];
      const v = s.camera[name];
      if (Number(input.value) !== v) input.value = String(v);
      out.textContent = this.fmt(name, v);
    }
  }

  setFps(value) {
    this.fpsEl.textContent = value === null ? 'PAUSED' : `${value} FPS`;
  }

  setCalls(n) {
    this.callsEl.textContent = String(n);
  }

  /** Only touches the DOM when the state actually changes. */
  setState(state) {
    if (state === this._state) return;
    this._state = state;
    this.stateEl.textContent = this.stateLabels[state] || state;
  }
}
