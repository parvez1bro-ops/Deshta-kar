import { damp, clamp } from './utils.js';

/**
 * Procedural character animation: Idle / Walking / Running / Jumping.
 *
 * Each state is a *pose function* that fills a small array of joint channels.
 * The animator blends the poses with smoothed weights, so transitions are smooth,
 * then writes the result to the character's bones.
 *
 * ANIMATOR CONTRACT (so Mixamo/FBX/GLB clips can replace this later):
 *   animator.update(dt, { speed, grounded, verticalSpeed })
 *   animator.state  -> 'idle' | 'walk' | 'run' | 'jump' | 'land'
 * A future `MixerAnimator` only needs to expose the same two members; Player does
 * not care which implementation it holds. (npcModels.js has one for imported GLB characters.)
 *
 * NPC extras (optional, the player never uses them):
 *   loco.turn            yaw speed in rad/s; turning on the spot makes the feet shuffle a little
 *   animator.setTalking(amp)   0..1 talking gestures (hands, head nods) while standing
 *   animator.setIdleStyle(i)   0 relaxed, 1 hands behind back, 2 arms crossed, 3 hand on hip,
 *                              4 hands clasped in front, 5 looking at a phone
 *
 * Sign conventions (character faces +z, bones hang down -y):
 *   +rotation.x on a leg/arm swings it BACKWARD, -x swings it FORWARD
 *   +rotation.x on a shin bends the knee, -x on a forearm bends the elbow
 *   +rotation.z on a left arm (at +x) raises it outward, the right arm uses the negative
 */
export const ANIM_STATES = Object.freeze({ IDLE: 'idle', WALK: 'walk', RUN: 'run', JUMP: 'jump', LAND: 'land', WAVE: 'wave', RIDE: 'ride' });

/** Display names for the HUD. */
export const ANIM_LABELS = Object.freeze({ idle: 'Idle', walk: 'Walking', run: 'Running', jump: 'Jumping', land: 'Landing', wave: 'Waving', ride: 'Riding' });

const CHANNELS = [
  'hipsY', 'hipsRx', 'hipsRy', 'hipsRz',
  'spineRx', 'spineRy', 'spineRz',
  'neckRx', 'headRx', 'headRy',
  'armLx', 'armLz', 'foreLx',
  'armRx', 'armRz', 'foreRx',
  'thighLx', 'thighLz', 'shinLx', 'footLx',
  'thighRx', 'thighRz', 'shinRx', 'footRx',
];
const C = Object.fromEntries(CHANNELS.map((n, i) => [n, i]));
const N = CHANNELS.length;
const TWO_PI = Math.PI * 2;

// channel -> [bone name, property code] (0 = position.y, 1/2/3 = rotation x/y/z)
const BINDINGS = {
  hipsY: ['hips', 0], hipsRx: ['hips', 1], hipsRy: ['hips', 2], hipsRz: ['hips', 3],
  spineRx: ['spine', 1], spineRy: ['spine', 2], spineRz: ['spine', 3],
  neckRx: ['neck', 1], headRx: ['head', 1], headRy: ['head', 2],
  armLx: ['upperArmL', 1], armLz: ['upperArmL', 3], foreLx: ['lowerArmL', 1],
  armRx: ['upperArmR', 1], armRz: ['upperArmR', 3], foreRx: ['lowerArmR', 1],
  thighLx: ['thighL', 1], thighLz: ['thighL', 3], shinLx: ['shinL', 1], footLx: ['footL', 1],
  thighRx: ['thighR', 1], thighRz: ['thighR', 3], shinRx: ['shinR', 1], footRx: ['footR', 1],
};

const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ----------------------------- pose functions ----------------------------- */

function idlePose(t, o) {
  o.fill(0);
  const b = Math.sin(t * 1.7);       // breathing
  const sway = Math.sin(t * 0.55);   // slow weight shift
  o[C.hipsY] = -0.004 * b;
  o[C.hipsRz] = 0.012 * sway;
  o[C.spineRx] = 0.015 + 0.012 * b;
  o[C.spineRz] = -0.012 * sway;
  o[C.headRx] = -0.015 - 0.006 * b;
  o[C.headRy] = 0.05 * Math.sin(t * 0.37);
  o[C.armLx] = 0.03 + 0.01 * b;
  o[C.armRx] = 0.03 - 0.01 * b;
  o[C.armLz] = 0.07 + 0.01 * b;
  o[C.armRz] = -(0.07 + 0.01 * b);
  o[C.foreLx] = -0.14;
  o[C.foreRx] = -0.14;
  o[C.thighLx] = -0.02;
  o[C.thighRx] = -0.02;
  o[C.shinLx] = 0.03;
  o[C.shinRx] = 0.03;
}

function walkPose(p, o) {
  const s = Math.sin(p), c = Math.cos(p);
  o.fill(0);
  o[C.thighLx] = -0.55 * s;
  o[C.thighRx] = 0.55 * s;
  o[C.shinLx] = 0.08 + 0.7 * Math.max(0, c);
  o[C.shinRx] = 0.08 + 0.7 * Math.max(0, -c);
  o[C.footLx] = -(o[C.thighLx] + o[C.shinLx]) * 0.6;
  o[C.footRx] = -(o[C.thighRx] + o[C.shinRx]) * 0.6;
  o[C.armLx] = 0.5 * s;
  o[C.armRx] = -0.5 * s;
  o[C.armLz] = 0.06;
  o[C.armRz] = -0.06;
  o[C.foreLx] = -0.2 - 0.3 * Math.max(0, -s);
  o[C.foreRx] = -0.2 - 0.3 * Math.max(0, s);
  o[C.hipsY] = 0.03 * Math.cos(2 * p);
  o[C.hipsRy] = 0.12 * s;
  o[C.spineRy] = -0.18 * s;
  o[C.spineRx] = 0.05;
  o[C.headRy] = 0.06 * s;
  o[C.headRx] = -0.04;
}

function runPose(p, o) {
  const s = Math.sin(p), c = Math.cos(p);
  o.fill(0);
  o[C.thighLx] = -0.2 - 0.85 * s;
  o[C.thighRx] = -0.2 + 0.85 * s;
  o[C.shinLx] = 0.3 + 1.2 * Math.max(0, c);
  o[C.shinRx] = 0.3 + 1.2 * Math.max(0, -c);
  o[C.footLx] = -(o[C.thighLx] + o[C.shinLx]) * 0.5;
  o[C.footRx] = -(o[C.thighRx] + o[C.shinRx]) * 0.5;
  o[C.armLx] = 0.85 * s;
  o[C.armRx] = -0.85 * s;
  o[C.armLz] = 0.1;
  o[C.armRz] = -0.1;
  o[C.foreLx] = -1.3 - 0.25 * Math.max(0, -s);
  o[C.foreRx] = -1.3 - 0.25 * Math.max(0, s);
  o[C.hipsY] = -0.075 - 0.05 * Math.cos(2 * p);
  o[C.hipsRx] = 0.06;
  o[C.hipsRy] = 0.2 * s;
  o[C.spineRy] = -0.3 * s;
  o[C.spineRx] = 0.2;
  o[C.headRx] = -0.2;
  o[C.headRy] = 0.08 * s;
}

function jumpRisePose(o) {
  o.fill(0);
  o[C.thighLx] = -0.9;
  o[C.thighRx] = -0.3;
  o[C.shinLx] = 1.1;
  o[C.shinRx] = 0.5;
  o[C.footLx] = 0.25;
  o[C.footRx] = 0.2;
  o[C.armLx] = -1.25;
  o[C.armRx] = -1.0;
  o[C.armLz] = 0.35;
  o[C.armRz] = -0.35;
  o[C.foreLx] = -0.5;
  o[C.foreRx] = -0.6;
  o[C.spineRx] = -0.04;
  o[C.headRx] = -0.1;
}

function jumpFallPose(o) {
  o.fill(0);
  o[C.thighLx] = -0.45;
  o[C.thighRx] = 0.2;
  o[C.shinLx] = 0.35;
  o[C.shinRx] = 0.65;
  o[C.footLx] = 0.2;
  o[C.footRx] = 0.1;
  o[C.armLx] = -0.45;
  o[C.armRx] = -0.35;
  o[C.armLz] = 0.95;
  o[C.armRz] = -0.95;
  o[C.foreLx] = -0.2;
  o[C.foreRx] = -0.25;
  o[C.spineRx] = 0.06;
}

/** Seated on a motorcycle: thighs forward, hands on the handlebar. */
function seatPose(o) {
  o.fill(0);
  o[C.hipsY] = -0.1;
  o[C.thighLx] = -1.25; o[C.thighRx] = -1.25;
  o[C.thighLz] = 0.14; o[C.thighRz] = -0.14;
  o[C.shinLx] = 1.35; o[C.shinRx] = 1.35;
  o[C.footLx] = -0.15; o[C.footRx] = -0.15;
  o[C.armLx] = -0.95; o[C.armRx] = -0.95;
  o[C.armLz] = 0.18; o[C.armRz] = -0.18;
  o[C.foreLx] = -0.55; o[C.foreRx] = -0.55;
  o[C.spineRx] = 0.12; o[C.headRx] = -0.12;
}


/** Idle variations (blended over the plain idle by `setIdleStyle`). */
export const IDLE_STYLE_COUNT = 6;
function stylePose(idx, t, o) {
  idlePose(t, o);
  const b = Math.sin(t * 1.7);
  switch (idx) {
    case 1:   // hands behind the back
      o[C.armLx] = 0.5; o[C.armRx] = 0.5; o[C.armLz] = 0.03; o[C.armRz] = -0.03;
      o[C.foreLx] = -0.35; o[C.foreRx] = -0.35; o[C.spineRx] += 0.03;
      break;
    case 2:   // arms crossed
      o[C.armLx] = -0.5; o[C.armRx] = -0.5; o[C.armLz] = -0.28; o[C.armRz] = 0.28;
      o[C.foreLx] = -1.95; o[C.foreRx] = -1.95;
      break;
    case 3:   // right hand on the hip, weight on one leg
      o[C.armRz] = -0.62; o[C.armRx] = 0.15; o[C.foreRx] = -1.55;
      o[C.hipsRz] += 0.05; o[C.thighRx] = -0.06; o[C.shinRx] = 0.1;
      break;
    case 4:   // hands clasped in front
      o[C.armLx] = -0.38; o[C.armRx] = -0.38; o[C.armLz] = 0.1; o[C.armRz] = -0.1;
      o[C.foreLx] = -1.0; o[C.foreRx] = -1.0;
      break;
    case 5:   // looking at a phone
      o[C.armRx] = -0.55; o[C.armRz] = -0.12; o[C.foreRx] = -1.75;
      o[C.headRx] = 0.3 + 0.01 * b; o[C.neckRx] = 0.08; o[C.spineRx] += 0.04;
      break;
    default:
  }
}

/* -------------------------------- animator -------------------------------- */

export class CharacterAnimator {
  /**
   * @param {Record<string, import('three').Object3D>} bones from createCharacter()
   * @param {{walkCycle?: number, runCycle?: number, runStartSpeed?: number, runFullSpeed?: number}} opts
   *   walkCycle / runCycle = metres travelled per full gait cycle (two steps)
   */
  constructor(bones, opts = {}) {
    this.walkCycle = opts.walkCycle ?? 2.3;
    this.runCycle = opts.runCycle ?? 4.3;
    this.runStartSpeed = opts.runStartSpeed ?? 4.8;
    this.runFullSpeed = opts.runFullSpeed ?? 7.0;

    this.state = ANIM_STATES.IDLE;
    this.phase = 0;
    this.time = opts.timeOffset ?? 0;    // NPCs start at different times so they never move in sync
    this._seed = (opts.timeOffset ?? 0) * 1.7;
    this.air = 0.5;          // 1 = rising, 0 = falling
    this.minVy = 0;          // fastest fall seen while airborne
    this.landing = 0;        // brief landing crouch (0..1)
    this._wasGrounded = true;

    this.wIdle = 1;
    this.wWalk = 0;
    this.wRun = 0;
    this.wJump = 0;
    this.wWave = 0;          // hand-wave overlay weight
    this.waveTime = 0;       // seconds of waving left
    this.wSeat = 0;          // seated (motorcycle) weight
    this.seated = false;
    this.talkAmp = 0;        // target talking amount (0..1)
    this.wTalk = 0;
    this.idleStyle = 0;      // requested idle variation
    this._styleIdx = 0;      // the one currently shown
    this.wStyle = 0;
    this._blinkIn = 2.2;     // seconds until the next blink
    this._blink = 0;         // 0..1 blink progress (0 = not blinking)
    this._lids = bones.lids || null;

    // pre-allocated pose buffers (nothing is allocated inside update)
    this._idle = new Float32Array(N);
    this._walk = new Float32Array(N);
    this._run = new Float32Array(N);
    this._rise = new Float32Array(N);
    this._fall = new Float32Array(N);
    this._out = new Float32Array(N);
    this._seat = new Float32Array(N);
    this._style = new Float32Array(N);

    this._objs = new Array(N);
    this._codes = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const [boneName, code] = BINDINGS[CHANNELS[i]];
      const obj = bones[boneName];
      if (!obj) throw new Error(`CharacterAnimator: missing bone "${boneName}"`);
      this._objs[i] = obj;
      this._codes[i] = code;
    }
    this._hipsRestY = bones.hips.position.y;

    seatPose(this._seat);
    jumpRisePose(this._rise);
    jumpFallPose(this._fall);
  }

  /** Back to a clean standing idle (no blended leftovers from the last movement). */
  reset() {
    this.state = ANIM_STATES.IDLE;
    this.phase = 0;
    this.air = 0.5;
    this.minVy = 0;
    this.landing = 0;
    this._wasGrounded = true;
    this.wIdle = 1;
    this.wWalk = 0;
    this.wRun = 0;
    this.wJump = 0;
    this.wWave = 0;
    this.waveTime = 0;
    this.wSeat = 0;
    this.seated = false;
    this.talkAmp = 0; this.wTalk = 0;
    this.idleStyle = 0; this._styleIdx = 0; this.wStyle = 0;
  }

  /** Talking gestures while standing. 0 = silent, ~0.3 = listening (nods), 1 = talking. */
  setTalking(amp) {
    this.talkAmp = clamp(amp, 0, 1);
  }

  /** Idle variation (see the list at the top). Blends smoothly. */
  setIdleStyle(i) {
    this.idleStyle = i | 0;
  }

  /** Wave the right hand for `seconds` (cancelled automatically if the character moves or jumps). */
  wave(seconds = 2.6) {
    if (!this.seated) this.waveTime = seconds;
  }

  get isWaving() {
    return this.waveTime > 0;
  }

  /** Sit (true) or stand (false). Used by the motorcycle. */
  setSeated(on) {
    this.seated = !!on;
    if (on) this.waveTime = 0;
  }

  /**
   * @param {number} dt seconds
   * @param {{speed:number, grounded:boolean, verticalSpeed:number}} loco
   */
  update(dt, loco) {
    const realSpeed = loco.speed;
    const grounded = loco.grounded;
    // turning on the spot: a small stepping motion (NPCs only; the player passes no `turn`)
    const speed = loco.turn ? Math.max(realSpeed, Math.min(0.55, Math.abs(loco.turn) * 0.16)) : realSpeed;
    this.time += dt;

    // ---- landing detection ----
    if (!grounded) {
      if (this._wasGrounded) this.minVy = 0;
      if (loco.verticalSpeed < this.minVy) this.minVy = loco.verticalSpeed;
    } else if (!this._wasGrounded) {
      this.landing = clamp(-this.minVy / 11, 0, 1);
    }
    this._wasGrounded = grounded;
    this.landing = damp(this.landing, 0, 9, dt);

    // ---- target weights ----
    const moveT = smoothstep(0.25, 1.6, speed);
    const runT = smoothstep(this.runStartSpeed, this.runFullSpeed, speed);
    const tIdle = 1 - moveT;
    const tWalk = moveT * (1 - runT);
    const tRun = moveT * runT;
    const tJump = grounded ? 0 : 1;

    this.wIdle = damp(this.wIdle, tIdle, 11, dt);
    this.wWalk = damp(this.wWalk, tWalk, 11, dt);
    this.wRun = damp(this.wRun, tRun, 11, dt);
    this.wJump = damp(this.wJump, tJump, grounded ? 10 : 18, dt);

    const sumG = this.wIdle + this.wWalk + this.wRun || 1;
    const g = 1 - this.wJump;
    const wi = (this.wIdle / sumG) * g;
    const ww = (this.wWalk / sumG) * g;
    const wr = (this.wRun / sumG) * g;
    const wj = this.wJump;

    // ---- gait phase follows real speed, so feet do not skate ----
    const cycle = this.walkCycle + (this.runCycle - this.walkCycle) * (this.wRun / sumG);
    this.phase += (Math.PI * 2 * speed * dt) / cycle;
    if (this.phase > TWO_PI) this.phase -= TWO_PI; // poses are periodic; keeps precision high
    this.air = damp(this.air, clamp(0.5 + loco.verticalSpeed / 16, 0, 1), 14, dt);

    // ---- evaluate only the poses that matter ----
    const out = this._out;
    out.fill(0);
    if (wi > 0.001) {
      idlePose(this.time, this._idle);
      // idle variation (hands behind back, arms crossed ...) fades in / out; a new style first fades the old one out
      if (this.idleStyle !== this._styleIdx) {
        this.wStyle = damp(this.wStyle, 0, 9, dt);
        if (this.wStyle < 0.04) { this._styleIdx = this.idleStyle; this.wStyle = 0; }
      } else {
        this.wStyle = damp(this.wStyle, this._styleIdx > 0 ? 1 : 0, 6, dt);
      }
      if (this.wStyle > 0.01 && this._styleIdx > 0) {
        stylePose(this._styleIdx, this.time, this._style);
        const k = this.wStyle, id = this._idle, st = this._style;
        for (let i = 0; i < N; i++) id[i] += (st[i] - id[i]) * k;
      }
      this._add(out, this._idle, wi);
    }
    if (ww > 0.001) { walkPose(this.phase, this._walk); this._add(out, this._walk, ww); }
    if (wr > 0.001) { runPose(this.phase, this._run); this._add(out, this._run, wr); }
    if (wj > 0.001) {
      this._add(out, this._rise, wj * this.air);
      this._add(out, this._fall, wj * (1 - this.air));
    }

    // talking gestures: right hand moves with the words, left hand a little, head nods
    this.wTalk = damp(this.wTalk, this.talkAmp, 7, dt);
    const Tk = this.wTalk * (1 - moveT) * (1 - this.wJump);
    if (Tk > 0.001) {
      const t = this.time + this._seed;
      const g1 = Math.sin(t * 3.1), g2 = Math.sin(t * 1.9 + 1.3), g3 = Math.sin(t * 0.8 + 0.4);
      out[C.armRx] += Tk * (-0.6 + 0.32 * g1);
      out[C.foreRx] += Tk * (-0.55 - 0.5 * Math.max(0, g1));
      out[C.armRz] += Tk * (-0.18 + 0.14 * g2);
      out[C.armLx] += Tk * (-0.18 + 0.22 * g2) * 0.7;
      out[C.foreLx] += Tk * (-0.3 - 0.3 * Math.max(0, g2));
      out[C.headRx] += Tk * 0.07 * Math.sin(t * 4.4);
      out[C.headRy] += Tk * 0.14 * g3;
      out[C.spineRy] += Tk * 0.05 * g3;
    }

    // landing crouch (added on top)
    const L = this.landing;
    if (L > 0.001) {
      out[C.hipsY] -= 0.1 * L;
      out[C.thighLx] -= 0.55 * L;
      out[C.thighRx] -= 0.55 * L;
      out[C.shinLx] += 1.0 * L;
      out[C.shinRx] += 1.0 * L;
      out[C.spineRx] += 0.2 * L;
      out[C.armLx] -= 0.3 * L;
      out[C.armRx] -= 0.3 * L;
    }

    // ---- seated overlay (motorcycle) ----
    this.wSeat = damp(this.wSeat, this.seated ? 1 : 0, 12, dt);
    const S = this.wSeat;
    if (S > 0.001) {
      const sp = this._seat;
      for (let i = 0; i < N; i++) out[i] += (sp[i] - out[i]) * S;
    }

    // ---- hand-wave overlay: right arm up, swinging side to side ----
    if (this.waveTime > 0) {
      if (!grounded || realSpeed > 0.8) this.waveTime = 0;
      else this.waveTime -= dt;
    }
    this.wWave = damp(this.wWave, this.waveTime > 0 ? 1 : 0, 10, dt);
    const Wv = this.wWave;
    if (Wv > 0.001) {
      const sw = Math.sin(this.time * 9);
      out[C.armRx] += (-2.35 - out[C.armRx]) * Wv;
      out[C.armRz] += (-0.22 + 0.3 * sw - out[C.armRz]) * Wv;
      out[C.foreRx] += (-0.45 - out[C.foreRx]) * Wv;
      out[C.headRy] += (0.18 - out[C.headRy]) * Wv;
      out[C.spineRz] += 0.03 * Wv;
    }

    // ---- blinking (eyelids are a tiny separate mesh) ----
    if (this._lids) {
      this._blinkIn -= dt;
      if (this._blinkIn <= 0 && this._blink === 0) this._blink = 0.0001;
      if (this._blink > 0) {
        this._blink += dt / 0.16;
        if (this._blink >= 1) {
          this._blink = 0;
          this._blinkIn = 2.2 + ((this.time * 7.31) % 1) * 3.2;   // pseudo-random 2.2 - 5.4 s
        }
      }
      this._lids.scale.y = this._blink > 0 ? Math.max(0.001, Math.sin(this._blink * Math.PI)) : 0.001;
    }

    this._apply(out);

    // ---- report dominant state ----
    if (this.wSeat > 0.5) this.state = ANIM_STATES.RIDE;
    else if (this.wWave > 0.5) this.state = ANIM_STATES.WAVE;
    else if (wj > 0.5) this.state = ANIM_STATES.JUMP;
    else if (grounded && L > 0.2) this.state = ANIM_STATES.LAND;
    else if (wr >= ww && wr >= wi) this.state = ANIM_STATES.RUN;
    else if (ww >= wi) this.state = ANIM_STATES.WALK;
    else this.state = ANIM_STATES.IDLE;
  }

  _add(out, pose, w) {
    for (let i = 0; i < N; i++) out[i] += pose[i] * w;
  }

  _apply(out) {
    for (let i = 0; i < N; i++) {
      const obj = this._objs[i];
      switch (this._codes[i]) {
        case 0: obj.position.y = this._hipsRestY + out[i]; break;
        case 1: obj.rotation.x = out[i]; break;
        case 2: obj.rotation.y = out[i]; break;
        default: obj.rotation.z = out[i];
      }
    }
  }
}
