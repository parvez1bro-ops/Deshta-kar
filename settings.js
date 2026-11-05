/**
 * Game settings: FPS limit, graphics quality and camera options.
 * Persisted in localStorage when available (wrapped in try/catch because it can
 * be blocked or empty in private windows). Anything can subscribe to changes;
 * listeners receive (settings, key) with key = 'fps' | 'quality' | 'camera'.
 */

export const FPS_OPTIONS = [30, 45, 60];
export const DEFAULT_FPS = 30;

export const CAMERA_LIMITS = {
  sensitivity: { min: 0.4, max: 2.5, step: 0.1, default: 1.0 }, // multiplier on the base mouse speed
  height: { min: 1.2, max: 2.4, step: 0.05, default: 1.5 },     // metres above the feet the camera orbits
  distance: { min: 2.5, max: 12, step: 0.5, default: 6.5 },     // metres behind the player
};

/** Graphics presets. Add new keys here and the UI/hotkeys pick them up. */
export const QUALITY_PRESETS = {
  low: {
    label: 'Low',
    pixelRatioMax: 1.0,   // render resolution cap (never above 1.5 anywhere)
    shadows: false,
    shadowMapSize: 512,
    clouds: false,
    skyline: false,       // distant silhouette buildings
    fogNear: 45,
    fogFar: 130,
    npc: { min: 4, start: 6, max: 8, cull: 42 },        // pedestrians: adaptive between min and max, drawn / animated within `cull` metres
  },
  medium: {
    label: 'Medium',
    pixelRatioMax: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    clouds: true,
    skyline: true,
    fogNear: 80,
    fogFar: 200,
    npc: { min: 8, start: 12, max: 16, cull: 62 },
  },
};
export const QUALITY_ORDER = ['low', 'medium'];

const STORAGE_KEY = 'deshta-kar.settings.v1';

function isMobileDevice() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

const clampTo = (v, lim) => Math.min(lim.max, Math.max(lim.min, v));

export class Settings {
  constructor() {
    this._fps = DEFAULT_FPS;
    // Desktop defaults to Medium; phones/tablets start on Low.
    this._quality = isMobileDevice() ? 'low' : 'medium';
    this.camera = {
      sensitivity: CAMERA_LIMITS.sensitivity.default,
      height: CAMERA_LIMITS.height.default,
      distance: CAMERA_LIMITS.distance.default,
    };
    this._listeners = new Set();
    this._load();
  }

  get fpsLimit() { return this._fps; }
  get quality() { return this._quality; }
  get preset() { return QUALITY_PRESETS[this._quality]; }

  setFpsLimit(value) {
    const v = Number(value);
    if (!FPS_OPTIONS.includes(v) || v === this._fps) return;
    this._fps = v;
    this._changed('fps');
  }

  setQuality(key) {
    if (!QUALITY_PRESETS[key] || key === this._quality) return;
    this._quality = key;
    this._changed('quality');
  }

  /** @param {'sensitivity'|'height'|'distance'} name  @param {{save?: boolean}} opts */
  setCamera(name, value, { save = true } = {}) {
    const lim = CAMERA_LIMITS[name];
    const v = Number(value);
    if (!lim || !Number.isFinite(v)) return;
    const c = clampTo(v, lim);
    if (c === this.camera[name]) return;
    this.camera[name] = c;
    this._changed('camera', save);
  }

  /** Persist current values (used after a slider drag ends). */
  commit() {
    this._save();
  }

  toggleFpsLimit() {
    const i = FPS_OPTIONS.indexOf(this._fps);
    this.setFpsLimit(FPS_OPTIONS[(i + 1) % FPS_OPTIONS.length]);
  }

  toggleQuality() {
    const i = QUALITY_ORDER.indexOf(this._quality);
    this.setQuality(QUALITY_ORDER[(i + 1) % QUALITY_ORDER.length]);
  }

  /** @returns {() => void} unsubscribe */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _changed(key, save = true) {
    if (save) this._save();
    for (const fn of this._listeners) fn(this, key);
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (FPS_OPTIONS.includes(data.fps)) this._fps = data.fps;
      if (QUALITY_PRESETS[data.quality]) this._quality = data.quality;
      if (data.camera && typeof data.camera === 'object') {
        for (const name of Object.keys(CAMERA_LIMITS)) {
          const v = Number(data.camera[name]);
          if (Number.isFinite(v)) this.camera[name] = clampTo(v, CAMERA_LIMITS[name]);
        }
      }
    } catch {
      /* storage unavailable or corrupted: keep defaults */
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ fps: this._fps, quality: this._quality, camera: this.camera }));
    } catch {
      /* ignore */
    }
  }
}
