import { clamp } from './utils.js';

const HANDLED = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight',
  'Minus', 'Equal', 'NumpadSubtract', 'NumpadAdd',
]);

/**
 * Keyboard + mouse input. Mouse look uses the Pointer Lock API:
 * click the overlay to start, Esc to pause.
 *
 * Input events fire between rendered frames, so everything is accumulated here
 * and consumed once per frame. This keeps it correct at any FPS limit.
 */
export class Controls {
  constructor(element, { onActiveChange = () => {}, onError = () => {}, onHotkey = () => {} } = {}) {
    this.element = element;
    this.onActiveChange = onActiveChange;
    this.onError = onError;
    this.onHotkey = onHotkey;
    this.active = false;

    this.keys = new Set();
    this._mouse = { dx: 0, dy: 0 };
    this._out = { dx: 0, dy: 0 }; // both reused every frame: no allocation in the loop
    this.wheel = 0;
    this.jumpTimer = 0;
    this._axis = { x: 0, y: 0 };

    // touch input is written by MobileControls; keyboard and touch share everything below
    this.touch = { x: 0, y: 0, run: false, jumpHeld: false };
    this.autoRun = false;                 // Run button toggle: keep running forward until cancelled
    this.onAutoRunChange = () => {};      // MobileControls hooks the button highlight here
    this.touchMode = false;
    this._interact = false;
    this._wave = false;

    window.addEventListener('keydown', (e) => {
      // only while playing: in the lobby Space / Enter must still press the focused button
      if (this.active && HANDLED.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (!this.active) return;
      if (e.code === 'Space') this.jumpTimer = 0.2; // jump buffer survives low FPS
      else if (e.code === 'KeyE') this._interact = true;
      else if (e.code === 'KeyH') this._wave = true;
      else if (e.code === 'KeyF' || e.code === 'KeyG') this.onHotkey(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      this._mouse.dx += clamp(e.movementX || 0, -150, 150);
      this._mouse.dy += clamp(e.movementY || 0, -150, 150);
    });
    document.addEventListener('wheel', (e) => {
      if (this.active) this.wheel += e.deltaY;
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.active = document.pointerLockElement === this.element;
      if (!this.active) {
        this.keys.clear();
        this._mouse.dx = this._mouse.dy = 0;
        this.wheel = 0;
        this.jumpTimer = 0;
      }
      this.onActiveChange(this.active);
    });
    document.addEventListener('pointerlockerror', () => {
      this.onError('Could not capture the mouse. Click again.');
    });
  }

  requestLock() {
    if (!this.element.requestPointerLock) {
      this.onError('Your browser does not support Pointer Lock.');
      return;
    }
    try {
      const p = this.element.requestPointerLock();
      if (p && p.catch) p.catch(() => this.onError('Could not capture the mouse. Click again in a moment.'));
    } catch {
      this.onError('Could not capture the mouse. Click again.');
    }
  }

  update(dt) {
    if (this.jumpTimer > 0) this.jumpTimer = Math.max(0, this.jumpTimer - dt);
  }

  /** x: right(+)/left(-), y: forward(+)/back(-) */
  getMoveAxis() {
    const k = this.keys, t = this.touch;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + t.x;
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + t.y;
    // auto-run: forward (relative to the camera) while nothing else is steering
    if (this.autoRun && y === 0 && x === 0) y = 1;
    this._axis.x = clamp(x, -1, 1);
    this._axis.y = clamp(y, -1, 1);
    return this._axis;
  }

  /** +1 zoom out, -1 zoom in (keyboard: "+" / "-"). */
  getZoomKey() {
    const k = this.keys;
    return (k.has('Minus') || k.has('NumpadSubtract') ? 1 : 0) - (k.has('Equal') || k.has('NumpadAdd') ? 1 : 0);
  }

  get running() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touch.run || this.autoRun;
  }

  /** Run button: tap = start running forward by itself, tap again = stop. */
  toggleAutoRun() {
    this.setAutoRun(!this.autoRun);
  }

  setAutoRun(on) {
    on = !!on;
    if (on === this.autoRun) return;
    this.autoRun = on;
    this.onAutoRunChange(on);
  }

  /** Space on PC / the Jump button on a phone: the handbrake while riding. */
  get brakeHeld() {
    return this.keys.has('Space') || this.touch.jumpHeld;
  }

  /* ---- called by MobileControls (same state the keyboard feeds) ---- */
  setTouchMode(on) {
    this.touchMode = !!on;
    if (!on) this.resetTouch();
  }

  setTouchMove(x, y) {
    this.touch.x = x;
    this.touch.y = y;
  }

  /** Touch look: same accumulator the mouse uses, so sensitivity settings apply to both. */
  addLook(dx, dy) {
    this._mouse.dx += clamp(dx, -150, 150);
    this._mouse.dy += clamp(dy, -150, 150);
  }

  pressJump() {
    this.jumpTimer = 0.2;
  }

  queueInteract() {
    this._interact = true;
  }

  /** true once per press of E / the Interact button. */
  consumeInteract() {
    const v = this._interact;
    this._interact = false;
    return v;
  }

  queueWave() {
    this._wave = true;
  }

  /** true once per press of H / the Hand Gesture button. */
  consumeWave() {
    const v = this._wave;
    this._wave = false;
    return v;
  }

  /** Drop every held movement input (used while a dialogue is open so nothing keeps pushing the player). */
  releaseMovement() {
    this.keys.clear();
    this.touch.x = this.touch.y = 0;
    this.touch.run = false;
    this.touch.jumpHeld = false;
    this.jumpTimer = 0;
    this.setAutoRun(false);
  }

  resetTouch() {
    this.touch.x = this.touch.y = 0;
    this.touch.run = false;
    this.setAutoRun(false);
    this.touch.jumpHeld = false;
    this._interact = false;
    this._wave = false;
  }

  wantsJump() {
    return this.jumpTimer > 0;
  }

  clearJump() {
    this.jumpTimer = 0;
  }

  /** Returns a shared object; read it immediately. */
  consumeMouse() {
    const m = this._mouse;
    this._out.dx = m.dx;
    this._out.dy = m.dy;
    m.dx = 0;
    m.dy = 0;
    return this._out;
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }
}
