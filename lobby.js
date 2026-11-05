import { icon, avatarSvg } from './icons.js';
import { damp, clamp } from './utils.js';

/**
 * Drag-to-rotate for the character preview (mouse and touch, via Pointer Events).
 * - Only the stage element listens, so a drag can never press a menu button
 *   (the stage captures the pointer for the whole gesture).
 * - Rotation is an unbounded angle (no wrapping), eased with damping, and keeps a
 *   little inertia after release: smooth, full 360 degrees, no jumps.
 */
export class Turntable {
  constructor(element, { radiansPerPixel = 0.009, onFirstDrag = () => {} } = {}) {
    this.element = element;
    this.radiansPerPixel = radiansPerPixel;
    this.onFirstDrag = onFirstDrag;
    this.angle = 0;        // what is shown (eased)
    this.target = 0;       // where the finger / mouse says it should be
    this.velocity = 0;     // rad/s, for inertia after release
    this.dragging = false;
    this._pointerId = null;
    this._lastX = 0;
    this._lastT = 0;
    this._used = false;

    element.addEventListener('pointerdown', (e) => this._down(e));
    element.addEventListener('pointermove', (e) => this._move(e));
    element.addEventListener('pointerup', (e) => this._up(e));
    element.addEventListener('pointercancel', (e) => this._up(e));
    element.addEventListener('lostpointercapture', (e) => this._up(e));
  }

  _down(e) {
    if (this._pointerId !== null) return;               // ignore a second finger
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this._pointerId = e.pointerId;
    this.dragging = true;
    this.velocity = 0;
    this._lastX = e.clientX;
    this._lastT = e.timeStamp;
    try { this.element.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    this.element.classList.add('dragging');
  }

  _move(e) {
    if (e.pointerId !== this._pointerId) return;
    const dx = e.clientX - this._lastX;
    const dt = (e.timeStamp - this._lastT) / 1000;
    this.target += dx * this.radiansPerPixel;
    if (dt > 0) {
      const v = (dx * this.radiansPerPixel) / dt;
      this.velocity = clamp(this.velocity * 0.4 + v * 0.6, -9, 9);
    }
    this._lastX = e.clientX;
    this._lastT = e.timeStamp;
    if (!this._used && Math.abs(dx) > 0) {
      this._used = true;
      this.onFirstDrag();
    }
  }

  _up(e) {
    if (e.pointerId !== this._pointerId) return;
    this._pointerId = null;
    this.dragging = false;
    this.element.classList.remove('dragging');
    if (e.timeStamp - this._lastT > 90) this.velocity = 0;   // held still before letting go: no fling
  }

  update(dt) {
    if (!this.dragging && this.velocity !== 0) {
      this.target += this.velocity * dt;
      this.velocity *= Math.exp(-3.5 * dt);
      if (Math.abs(this.velocity) < 0.02) this.velocity = 0;
    }
    this.angle = damp(this.angle, this.target, 18, dt);
  }
}

/**
 * Lobby DOM: fills the profile card, injects the icons, wires the buttons.
 * Visibility is driven by CSS from <body data-state="...">, so this class has no
 * show/hide logic to get out of sync with the game state.
 */
export class Lobby {
  /**
   * @param {{ profile: object, modal: import('./modal.js').Modal, outfit: object,
   *           onPlay: () => void, onOpenProfile: (opts: {edit: boolean}) => void }} opts
   */
  constructor({ profile, modal, outfit, onPlay, onOpenProfile }) {
    this.modal = modal;
    this.stage = document.getElementById('stage');
    this.playBtn = document.getElementById('playBtn');
    this.toastEl = document.getElementById('toast');
    this._toastTimer = 0;

    // icons
    for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon);

    this.setProfile(profile, outfit);

    // every [data-panel] button opens its panel
    for (const btn of document.querySelectorAll('#lobby [data-panel]')) {
      btn.addEventListener('click', () => this.modal.open(btn.dataset.panel));
    }

    // profile card -> full-screen profile; the pencil opens it straight in name-edit mode
    const card = document.getElementById('profileCard');
    card.addEventListener('click', () => onOpenProfile({ edit: false }));
    card.addEventListener('keydown', (e) => {
      if (e.target === card && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); onOpenProfile({ edit: false }); }
    });
    document.getElementById('profileEditBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      onOpenProfile({ edit: true });
    });

    this.playBtn.addEventListener('click', () => onPlay());

    const hint = document.getElementById('dragHint');
    this.turntable = new Turntable(this.stage, { onFirstDrag: () => hint.classList.add('gone') });
  }

  setProfile(p, outfit) {
    if (outfit) document.getElementById('avatar').innerHTML = avatarSvg(outfit);
    document.getElementById('profileName').textContent = p.name;
    document.getElementById('profileLevel').textContent = String(p.level);
    const pct = clamp((p.xp / p.xpToNext) * 100, 0, 100);
    document.getElementById('xpFill').style.width = `${pct}%`;
    document.getElementById('xpText').textContent = `${p.xp} / ${p.xpToNext} XP`;
    document.getElementById('xpBar').setAttribute('aria-valuenow', String(Math.round(pct)));
    document.getElementById('coinValue').textContent = p.coins.toLocaleString('en-US');
    document.getElementById('diamondValue').textContent = p.diamonds.toLocaleString('en-US');
  }

  setPlayEnabled(enabled) {
    this.playBtn.disabled = !enabled;
  }

  toast(message, ms = 3500) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}
