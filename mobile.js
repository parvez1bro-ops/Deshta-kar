import './mobile.css';
import { icon } from './icons.js';
import { clamp } from './utils.js';

const LOOK_GAIN = 1.4;      // touch pixels -> "mouse pixels", so the sensitivity setting feels similar
const DEADZONE = 0.12;

/* ------------------------------ fullscreen ------------------------------ */
// Must be called from a user gesture (a tap / click). iPhone Safari has no Fullscreen API for pages:
// fullscreenSupported() is false there and the buttons are hidden / explained.
// The target is the game container (#gameRoot), so overlays injected outside it (e.g. a hosting badge) stay out of fullscreen.
export const gameRoot = () => document.getElementById('gameRoot') || document.documentElement;
export function fullscreenSupported() {
  const el = gameRoot();
  const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen) && enabled !== false;
}
export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
/** Calls cb() whenever fullscreen is entered or left (button, Esc, system back gesture) or a request fails. */
export function onFullscreenChange(cb) {
  for (const type of ['fullscreenchange', 'webkitfullscreenchange', 'fullscreenerror', 'webkitfullscreenerror']) {
    document.addEventListener(type, cb);
  }
}
/** Resolves true on success, false if the browser refused (never throws). */
export async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      try { screen.orientation?.unlock?.(); } catch { /* not supported */ }
    } else {
      const el = gameRoot();
      await (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
      try { await screen.orientation?.lock?.('landscape'); } catch { /* lock is only allowed on some phones */ }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Landscape only on touch devices: while the phone is upright, body.portrait-block shows the
 * "rotate your device" screen over everything (lobby, game, menus). onChange(blocked) lets the game pause.
 * Returns a function that re-checks (call it once after start-up).
 */
export function watchPortrait(isTouch, onChange = () => {}) {
  const mq = window.matchMedia('(orientation: portrait)');
  let last = null;
  const apply = () => {
    const block = !!isTouch && mq.matches;
    document.body.classList.toggle('portrait-block', block);
    if (block !== last) { last = block; onChange(block); }
  };
  mq.addEventListener('change', apply);
  return apply;
}

/** Touch controls are used when the primary pointer is a finger, or when the address has ?touch. */
export function detectTouchMode() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('touch')) return true;
    if (q.has('mouse')) return false;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    return coarse && (window.matchMedia('(hover: none)').matches || !window.matchMedia('(any-pointer: fine)').matches);
  } catch {
    return false;
  }
}

/**
 * On-screen controls. They write into the SAME Controls object the keyboard uses
 * (move axis, run, jump, look, interact), so Player and the camera have one input path.
 *  - left half: floating joystick (Pointer Events + pointer capture, one finger tracked)
 *  - right side: drag to rotate the camera; buttons sit on top of it
 *  - joystick, camera and buttons are different elements, so every finger is independent (multitouch)
 * Created once; listeners are never added again.
 */
export class MobileControls {
  /** @param {import('./controls.js').Controls} controls */
  constructor(controls, { onPause = () => {}, onFullscreen = () => {} } = {}) {
    this.controls = controls;
    this.enabled = false;
    this._shown = { act: false, veh: false };

    const root = (this.root = document.createElement('div'));
    root.className = 'touch-hud';
    root.id = 'touchHud';
    root.innerHTML = `
      <div class="tz tz-move" data-zone="move"></div>
      <div class="tz tz-look" data-zone="look"></div>
      <div class="joy" id="joy"><div class="joy-base"></div><div class="joy-knob" id="joyKnob"></div></div>
      <button class="t-pause" type="button" aria-label="Pause">${icon('pause')}</button>
      <button class="t-full" type="button" aria-label="Fullscreen">${icon('fullscreen')}</button>
      <button class="tbtn tb-run" type="button" data-btn="run" aria-pressed="false">${icon('run')}<span>RUN</span></button>
      <button class="tbtn tb-jump" type="button" data-btn="jump">${icon('jump')}<span>JUMP</span></button>
 <button class="tbtn tb-wave" type="button" data-btn="wave">${icon('hand')}<span>WAVE</span></button>
      <button class="tbtn tb-act hidden" type="button" data-btn="act">${icon('hand')}<span id="actLabel">USE</span></button>
      <button class="tbtn tb-veh hidden" type="button" data-btn="veh">${icon('bike')}<span id="vehLabel">RIDE</span></button>`;
    gameRoot().appendChild(root);   // inside #gameRoot so the touch controls stay visible in fullscreen

    // safe-area probe: lets JS know the notch / gesture-bar insets that CSS env() reports
    const probe = (this.probe = document.createElement('div'));
    probe.className = 'safe-probe';
    root.appendChild(probe);
    this.fullBtn = root.querySelector('.t-full');
    this.fullBtn.hidden = !fullscreenSupported();

    this.joy = root.querySelector('#joy');
    this.knob = root.querySelector('#joyKnob');
    this.actBtn = root.querySelector('[data-btn="act"]');
    this.vehBtn = root.querySelector('[data-btn="veh"]');
    this.actLabel = root.querySelector('#actLabel');
    this.vehLabel = root.querySelector('#vehLabel');
    this.runBtn = root.querySelector('[data-btn="run"]');
    this.runLabel = this.runBtn.querySelector('span');

    this._joyId = null;
    this._lookId = null;
    this._ox = 0; this._oy = 0;        // joystick origin
    this._lx = 0; this._ly = 0;        // last look position
    this._radius = 60;

    this._bindJoystick(root.querySelector('[data-zone="move"]'));
    this._bindLook(root.querySelector('[data-zone="look"]'));
    this._bindButtons();
    root.querySelector('.t-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); onPause(); });
    // fullscreen needs a real click (user activation), so it listens to 'click', not 'pointerdown'
    this.fullBtn.addEventListener('click', async (e) => { e.preventDefault(); await toggleFullscreen(); onFullscreen(); });

    // no browser scrolling / pinch-zoom / long-press menu while playing
    const stop = (e) => { if (this.enabled) e.preventDefault(); };
    root.addEventListener('contextmenu', stop);
    document.addEventListener('gesturestart', stop);
    document.addEventListener('gesturechange', stop);
    document.addEventListener('dblclick', stop);
    document.addEventListener('touchmove', stop, { passive: false });
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => this.layout());
    document.addEventListener('fullscreenchange', () => { this.layout(); });
    this.layout();
  }

  /** Switch the whole touch layer on or off (off = keyboard / mouse device). */
  setEnabled(on) {
    this.enabled = !!on;
    document.body.classList.toggle('touch', this.enabled);
    this.controls.setTouchMode(this.enabled);
    if (!this.enabled) this._release();
    this.layout();
  }

  layout() {
    const m = Math.min(window.innerWidth, window.innerHeight);
    this._radius = clamp(m * 0.13, 40, 72);
    const root = this.root.style;
    root.setProperty('--joy', `${this._radius * 2}px`);
    root.setProperty('--btn', `${clamp(m * 0.17, 50, 78)}px`);
    const cs = getComputedStyle(this.probe);
    this._safe = { l: parseFloat(cs.paddingLeft) || 0, b: parseFloat(cs.paddingBottom) || 0 };
    if (this._joyId === null) this._placeJoyIdle();
  }

  _placeJoyIdle() {
    const safe = this._safe || { l: 0, b: 0 };
    const x = Math.max(this._radius + 24 + safe.l, window.innerWidth * 0.12);
    const y = window.innerHeight - this._radius - 28 - safe.b;
    this.joy.style.left = `${x}px`;
    this.joy.style.top = `${y}px`;
    this.knob.style.transform = 'translate(0,0)';
    this.joy.classList.remove('active');
  }

  /** Call every frame (cheap): shows Interact / Ride buttons only when they would do something. */
  setPrompt(prompt) {
    const act = !!prompt && prompt.kind !== 'vehicle';
    const veh = !!prompt && prompt.kind === 'vehicle';
    if (act !== this._shown.act) { this._shown.act = act; this.actBtn.classList.toggle('hidden', !act); }
    if (veh !== this._shown.veh) { this._shown.veh = veh; this.vehBtn.classList.toggle('hidden', !veh); }
    if (act && this.actLabel.textContent !== prompt.short) this.actLabel.textContent = prompt.short;
    if (veh && this.vehLabel.textContent !== prompt.short) this.vehLabel.textContent = prompt.short;
  }

  /* ------------------------------- joystick ------------------------------- */
  _bindJoystick(zone) {
    zone.addEventListener('pointerdown', (e) => {
      if (this._joyId !== null) return;
      e.preventDefault();
      this._joyId = e.pointerId;
      this.controls.setAutoRun(false);                  // the stick takes over from auto-run
      try { zone.setPointerCapture(e.pointerId); } catch { /* pointer gone */ }
      this._ox = e.clientX; this._oy = e.clientY;
      this.joy.style.left = `${this._ox}px`;
      this.joy.style.top = `${this._oy}px`;
      this.joy.classList.add('active');
      this._moveJoy(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._joyId) return;
      e.preventDefault();
      this._moveJoy(e.clientX, e.clientY);
    });
    const end = (e) => {
      if (e.pointerId !== this._joyId) return;
      this._joyId = null;
      this.controls.setTouchMove(0, 0);
      this._placeJoyIdle();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  _moveJoy(x, y) {
    let dx = x - this._ox, dy = y - this._oy;
    const len = Math.hypot(dx, dy);
    const r = this._radius;
    if (len > r) { dx = (dx / len) * r; dy = (dy / len) * r; }     // the knob stays on the ring
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, len / r);
    if (m < DEADZONE) { this.controls.setTouchMove(0, 0); return; }
    // direction * rescaled magnitude; up on screen = forward
    const nx = dx / (Math.min(len, r) || 1), ny = dy / (Math.min(len, r) || 1);
    const mag = (m - DEADZONE) / (1 - DEADZONE);
    this.controls.setTouchMove(nx * mag, -ny * mag);
  }

  /* ----------------------------- camera look ------------------------------ */
  _bindLook(zone) {
    zone.addEventListener('pointerdown', (e) => {
      if (this._lookId !== null) return;
      e.preventDefault();
      this._lookId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch { /* pointer gone */ }
      this._lx = e.clientX; this._ly = e.clientY;
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._lookId) return;
      e.preventDefault();
      this.controls.addLook((e.clientX - this._lx) * LOOK_GAIN, (e.clientY - this._ly) * LOOK_GAIN);
      this._lx = e.clientX; this._ly = e.clientY;
    });
    const end = (e) => { if (e.pointerId === this._lookId) this._lookId = null; };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  /* -------------------------------- buttons ------------------------------- */
  _bindButtons() {
    const c = this.controls;
    const press = (btn, onDown, onUp) => {
      let id = null;
      btn.addEventListener('pointerdown', (e) => {
        if (id !== null) return;
        e.preventDefault();
        id = e.pointerId;
        try { btn.setPointerCapture(e.pointerId); } catch { /* pointer gone */ }
        btn.classList.add('down');
        onDown();
      });
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        btn.classList.remove('down');
        if (onUp) onUp();
      };
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
      btn.addEventListener('lostpointercapture', end);
    };
    press(this.root.querySelector('[data-btn="jump"]'), () => { c.pressJump(); c.touch.jumpHeld = true; }, () => { c.touch.jumpHeld = false; });
    // toggle auto-run: the thumb stays free for the camera. Highlight follows the real state (also when
    // the joystick or a pause cancels it)
    c.onAutoRunChange = (on) => {
      this.runBtn.classList.toggle('on', on);
      this.runBtn.setAttribute('aria-pressed', String(on));
      this.runLabel.textContent = on ? 'AUTO' : 'RUN';
    };
    press(this.runBtn, () => c.toggleAutoRun());
    press(this.root.querySelector('[data-btn="wave"]'), () => c.queueWave());
    press(this.actBtn, () => c.queueInteract());
    press(this.vehBtn, () => c.queueInteract());
  }

  _release() {
    this._joyId = null;
    this._lookId = null;
    this.controls.resetTouch();
    this._placeJoyIdle();
  }

  /** Let go of everything (pause, return to lobby) so no input stays "stuck". */
  releaseAll() {
    this._release();
  }
}
