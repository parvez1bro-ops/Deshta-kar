import { Frame } from './instancing.js';
import { pick, range } from './utils.js';

const WINDOW_TINTS = [0x9fd0e8, 0xb7dbec, 0xffe7a0, 0x8fc3de];
const LAUNDRY = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xf06292, 0xffffff];
const TIN_WALLS = [0x5f8ea0, 0x7fa38a, 0xb08968, 0x9aa5a8, 0xc9a66b, 0x6f8f72, 0x8f7a9a];
const TIN_ROOFS = [0x8d9296, 0x9c6a4c, 0xa6aaae, 0x7d6b5e];
const PASTELS = [0xf2e3b3, 0xe8c9c1, 0xcfe0c3, 0xf5d7a1, 0xd8e2ec, 0xf0d4e4];
const TILE_ROOFS = [0xa5482f, 0x8c3b2a, 0x9a5a3a];
const RICKSHAW_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0xff7043, 0x8e24aa];
const CANOPY_COLORS = [0xd84315, 0x1565c0, 0x2e7d32, 0xf9a825, 0x6a1b9a, 0xc62828];
const PRODUCE = [0xd9382c, 0x4caf50, 0xf29b24, 0xe8c547, 0x7b3f8f, 0xeeeeee];
const GREENS = [0x3f8f3a, 0x4c9a3f, 0x5aa845, 0x2f7d32];

/* ------------------------------------------------------------------ */
/* Modern apartment block                                              */
/* ------------------------------------------------------------------ */
export function buildApartment(ctx, cx, cz, quarter, opt = {}) {
  const { w = 12, d = 12, floors = 7, color = 0xd8c7a6, accent = 0x9b8b73 } = opt;
  const r = ctx.rng;
  const f = new Frame(ctx, cx, cz, quarter);
  const fh = 3.2;
  const h = floors * fh;

  f.box(0, 0, 0, w, h, d, color, true);
  f.box(0, 0, 0, w + 0.2, 0.6, d + 0.2, accent);
  for (let i = 1; i <= floors; i++) f.box(0, i * fh - 0.15, 0, w + 0.12, 0.3, d + 0.12, accent);

  // rooftop: parapet, stair head, water tanks
  const pc = 0xb9ab92;
  f.box(0, h, d / 2 - 0.15, w, 0.8, 0.3, pc);
  f.box(0, h, -d / 2 + 0.15, w, 0.8, 0.3, pc);
  f.box(-w / 2 + 0.15, h, 0, 0.3, 0.8, d - 0.6, pc);
  f.box(w / 2 - 0.15, h, 0, 0.3, 0.8, d - 0.6, pc);
  f.box(w / 2 - 2.4, h, -d / 2 + 2.4, 3.4, 2.6, 3.4, color);
  f.box(-w / 2 + 2.6, h, 0, 2.4, 0.6, 2.4, 0x777777);
  f.cyl(-w / 2 + 2.6, h + 0.6, 0, 1.0, 1.5, 0x3a6fa6);

  // windows
  const cols = Math.max(2, Math.floor(w / 3));
  const sx = w / cols;
  const dcols = Math.max(2, Math.floor(d / 3));
  const sz = d / dcols;
  for (let i = 0; i < floors; i++) {
    const wy = i * fh + 1.7;
    for (let j = 0; j < cols; j++) {
      const x = (j - (cols - 1) / 2) * sx;
      const tint = pick(r, WINDOW_TINTS);
      f.glow(x, wy - 0.7, -d / 2 - 0.03, 1.4, 1.4, 0.08, tint);
      if (i === 0) {
        if (Math.abs(x) >= 2) f.glow(x, wy - 0.7, d / 2 + 0.03, 1.4, 1.4, 0.08, tint);
      } else {
        f.glow(x, wy - 0.7, d / 2 + 0.03, 1.4, 1.4, 0.08, tint);
        // balcony
        f.box(x, i * fh, d / 2 + 0.55, 2.0, 0.15, 1.1, 0xa8a193);
        f.box(x, i * fh + 0.15, d / 2 + 1.05, 2.0, 0.85, 0.08, 0xcfcfcf);
        if (r() < 0.35) f.box(x + range(r, -0.5, 0.5), i * fh + 0.4, d / 2 + 1.1, 0.6, 0.8, 0.04, pick(r, LAUNDRY));
      }
    }
    for (let j = 0; j < dcols; j++) {
      const z = (j - (dcols - 1) / 2) * sz;
      const tint = pick(r, WINDOW_TINTS);
      f.glow(w / 2 + 0.03, wy - 0.7, z, 0.08, 1.4, 1.4, tint);
      f.glow(-w / 2 - 0.03, wy - 0.7, z, 0.08, 1.4, 1.4, tint);
    }
  }

  // facade relief: a recessed dark frame behind every window row, sills, a cornice and split-type AC units
  const dr = ctx.detailRng;
  for (let i = 0; i < floors; i++) {
    const wy = i * fh + 1.7;
    f.box(0, wy - 0.78, -d / 2 - 0.02, w - 0.8, 0.07, 0.14, 0xe9e4d8);             // sill strip, back
    f.box(w / 2 + 0.02, wy - 0.78, 0, 0.14, 0.07, d - 0.8, 0xe9e4d8);               // sill strip, sides
    f.box(-w / 2 - 0.02, wy - 0.78, 0, 0.14, 0.07, d - 0.8, 0xe9e4d8);
    for (let j = 0; j < cols; j++) {
      const x = (j - (cols - 1) / 2) * sx;
      if (i > 0) {
        f.box(x, wy - 0.78, d / 2 + 0.02, 1.7, 0.07, 0.14, 0xe9e4d8);                // front sill
        f.box(x, wy + 0.72, d / 2 + 0.03, 1.7, 0.08, 0.1, 0x8d877a);                 // front lintel / shade
        if (dr() < 0.3) f.box(x + 0.95, wy - 0.15, d / 2 + 0.25, 0.7, 0.45, 0.4, 0xe8ecef);   // AC unit
      }
      f.box(x, wy + 0.72, -d / 2 - 0.03, 1.7, 0.08, 0.1, 0x8d877a);
    }
  }
  f.box(0, h - 0.5, 0, w + 0.35, 0.5, d + 0.35, accent);                          // heavy roof cornice
  f.box(0, 0, d / 2 + 0.04, w, 0.35, 0.06, 0x7c7467);                             // plinth

  // entrance
  f.box(0, 0, d / 2 + 0.1, 1.8, 2.3, 0.2, 0x4b3524);
  f.box(0, 2.3, d / 2 + 0.12, 2.2, 0.12, 0.24, 0x3a2a1c);                          // door frame head
  f.box(-0.98, 0, d / 2 + 0.12, 0.14, 2.3, 0.24, 0x3a2a1c);
  f.box(0.98, 0, d / 2 + 0.12, 0.14, 2.3, 0.24, 0x3a2a1c);
  f.box(0, 2.5, d / 2 + 0.7, 3.4, 0.15, 1.4, 0x8f3a2e);
  f.box(-1.6, 0, d / 2 + 1.3, 0.14, 2.5, 0.14, 0xcfcfcf);
  f.box(1.6, 0, d / 2 + 1.3, 0.14, 2.5, 0.14, 0xcfcfcf);
}

/* ------------------------------------------------------------------ */
/* Small office building                                               */
/* ------------------------------------------------------------------ */
export function buildOffice(ctx, cx, cz, quarter, opt = {}) {
  const { w = 12, d = 12, floors = 4 } = opt;
  const f = new Frame(ctx, cx, cz, quarter);
  const fh = 3.6;
  const h = floors * fh;

  f.box(0, 0, 0, w, h, d, 0x6f879f, true);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(sx * (w / 2), 0, sz * (d / 2), 0.7, h + 0.4, 0.7, 0xb9bcc0);
  for (let i = 1; i <= floors; i++) f.box(0, i * fh - 0.2, 0, w + 0.1, 0.4, d + 0.1, 0xc9ccd0);

  const glass = 0x8fc9e4;
  for (let i = 0; i < floors; i++) {
    const y = i * fh + 0.7;
    // back + sides: continuous strips
    f.glow(0, y, -d / 2 - 0.04, w - 1.8, 2.0, 0.08, glass);
    f.glow(w / 2 + 0.04, y, 0, 0.08, 2.0, d - 1.8, glass);
    f.glow(-w / 2 - 0.04, y, 0, 0.08, 2.0, d - 1.8, glass);
    // front
    if (i === 0) {
      const sw = (w - 1.8 - 3.6) / 2;
      f.glow(-(1.8 + sw / 2), y, d / 2 + 0.04, sw, 2.0, 0.08, glass);
      f.glow(1.8 + sw / 2, y, d / 2 + 0.04, sw, 2.0, 0.08, glass);
    } else {
      f.glow(0, y, d / 2 + 0.04, w - 1.8, 2.0, 0.08, glass);
    }
  }

  // entrance
  f.glow(0, 0.05, d / 2 + 0.04, 3.0, 2.5, 0.08, 0xaee3f7);
  f.box(0, 2.7, d / 2 + 0.8, 5, 0.2, 1.6, 0x2a3f5c);
  f.box(-2.3, 0, d / 2 + 1.4, 0.18, 2.7, 0.18, 0xdddddd);
  f.box(2.3, 0, d / 2 + 1.4, 0.18, 2.7, 0.18, 0xdddddd);
  f.box(0, h - 1.2, d / 2 + 0.08, 8, 1.0, 0.16, 0x1b4f8a);
  f.box(0, h - 0.75, d / 2 + 0.18, 6, 0.14, 0.04, 0xffffff);

  // roof
  const pc = 0xa5a8ac;
  f.box(0, h, d / 2 - 0.15, w, 0.6, 0.3, pc);
  f.box(0, h, -d / 2 + 0.15, w, 0.6, 0.3, pc);
  f.box(-w / 2 + 0.15, h, 0, 0.3, 0.6, d - 0.6, pc);
  f.box(w / 2 - 0.15, h, 0, 0.3, 0.6, d - 0.6, pc);
  f.box(-2, h, -2, 2, 1, 1.4, 0x9a9a9a);
  f.box(1.5, h, -1, 2, 1, 1.4, 0x9a9a9a);
  f.cyl(3, h, 3, 0.06, 5, 0x555555);
  f.glow(3, h + 5, 3, 0.2, 0.2, 0.2, 0xff3030);
}

/* ------------------------------------------------------------------ */
/* Hospital                                                            */
/* ------------------------------------------------------------------ */
export function buildHospital(ctx, cx, cz, quarter) {
  const r = ctx.rng;
  const f = new Frame(ctx, cx, cz, quarter);
  const w = 22, d = 14, fh = 3.4;
  const h = 3 * fh;
  const tw = 8, th = 4 * fh, td = d + 1.4, tlz = 0.5;
  const tf = tlz + td / 2; // tower front face (local z)
  const red = 0xd32f2f;

  f.box(0, 0, 0, w, h, d, 0xeeebe3, true);
  f.box(0, 0, tlz, tw, th, td, 0xf8f6f0, true);

  // red cross + stripes
  f.box(0, 9.9, tf + 0.04, 1.0, 3.4, 0.1, red);
  f.box(0, 11.1, tf + 0.04, 3.4, 1.0, 0.1, red);
  f.box(-7.5, 2.7, d / 2 + 0.04, 7.2, 0.45, 0.08, red);
  f.box(7.5, 2.7, d / 2 + 0.04, 7.2, 0.45, 0.08, red);

  // wing windows (front/back/sides)
  for (let i = 0; i < 3; i++) {
    const y = i * fh + 1.0;
    for (const sgn of [-1, 1]) {
      for (const off of [-2.3, 0, 2.3]) {
        const x = sgn * (7.5 + off);
        const t = pick(r, WINDOW_TINTS);
        f.glow(x, y, d / 2 + 0.03, 1.3, 1.4, 0.08, t);
        f.glow(x, y, -d / 2 - 0.03, 1.3, 1.4, 0.08, t);
      }
    }
    for (const z of [-3, 0, 3]) {
      f.glow(w / 2 + 0.03, y, z, 0.08, 1.4, 1.3, pick(r, WINDOW_TINTS));
      f.glow(-w / 2 - 0.03, y, z, 0.08, 1.4, 1.3, pick(r, WINDOW_TINTS));
    }
  }
  // tower windows
  for (let i = 1; i <= 3; i++) {
    for (const x of [-2, 2]) f.glow(x, i * fh + 1.0, tf + 0.03, 1.3, 1.4, 0.08, pick(r, WINDOW_TINTS));
  }

  // entrance
  f.glow(0, 0.05, tf + 0.04, 3.4, 2.6, 0.08, 0xaee3f7);
  f.box(0, 3.2, tf + 1.2, 7, 0.25, 2.6, red);
  f.box(-3.2, 0, tf + 2.3, 0.25, 3.2, 0.25, 0xffffff);
  f.box(3.2, 0, tf + 2.3, 0.25, 3.2, 0.25, 0xffffff);

  // roof: helipad + units
  f.box(-8, h, -3, 3, 1.2, 2.5, 0xb0b0b0);
  f.box(8, h, 0, 6, 0.08, 6, 0x3a3a3a);
  f.box(7, h + 0.08, 0, 0.4, 0.03, 3, 0xffffff);
  f.box(9, h + 0.08, 0, 0.4, 0.03, 3, 0xffffff);
  f.box(8, h + 0.08, 0, 2.0, 0.03, 0.4, 0xffffff);

  buildAmbulance(ctx, ...f.toWorld(-7, d / 2 + 4.5), quarter);
}

export function buildAmbulance(ctx, cx, cz, quarter) {
  const f = new Frame(ctx, cx, cz, quarter);
  const white = 0xffffff;
  f.box(0, 0.35, 0, 1.9, 0.3, 4.4, 0x333333);
  f.box(0, 0.65, -0.5, 2.0, 1.6, 3.2, white, true);
  f.box(0, 0.65, 1.8, 2.0, 1.1, 1.4, white, true);
  f.box(0, 1.25, -0.5, 2.04, 0.3, 3.0, 0xd32f2f);
  f.glow(0, 1.0, 2.53, 1.7, 0.6, 0.06, 0x8fc3de);
  f.glow(-0.4, 2.25, 0.8, 0.5, 0.15, 0.3, 0xff3030);
  f.glow(0.4, 2.25, 0.8, 0.5, 0.15, 0.3, 0x3070ff);
  for (const sx of [-1, 1]) {
    f.wheel(sx * 1.0, 0.4, -1.2, 0.4, 0.25, 0x1a1a1a);
    f.wheel(sx * 1.0, 0.4, 1.7, 0.4, 0.25, 0x1a1a1a);
  }
}

/* ------------------------------------------------------------------ */
/* Tea stall (cha dokan)                                               */
/* ------------------------------------------------------------------ */
export function buildTeaStall(ctx, cx, cz, quarter) {
  const f = new Frame(ctx, cx, cz, quarter);
  const wood = 0x8a6a45;
  for (const px of [-1.8, 1.8]) for (const pz of [-1.3, 1.3]) f.box(px, 0, pz, 0.12, 2.5, 0.12, 0x6b4a2b);
  f.roof(0, 2.5, 0, 3.2, 0.7, 4.6, 0x8d9296, 1);
  f.box(0, 2.05, 1.5, 3.8, 0.4, 0.06, 0xd9473a);

  f.box(0, 0, 0.3, 3.2, 1.0, 1.0, wood, true);
  f.box(0, 1.0, 0.3, 3.4, 0.08, 1.2, 0xb08a5a);
  f.box(0, 0, -1.25, 3.4, 1.9, 0.35, 0x6b4a2b, true);

  f.cyl(-1.0, 1.08, 0.3, 0.3, 0.5, 0xc0c0c0);
  f.cyl(-0.4, 1.08, 0.3, 0.25, 0.4, 0x2b2b2b);
  for (const k of [0.3, 0.9, 1.4]) f.box(k, 1.08, 0.5, 0.32, 0.5, 0.32, 0xe9b872);
  for (const k of [-1.2, -0.9, -0.6]) f.box(k, 1.75, 1.25, 0.12, 0.5, 0.1, 0xe8c547);

  f.cyl(-1.0, 0, 2.3, 0.27, 0.45, 0xc0612b, true);
  f.cyl(0.4, 0, 2.3, 0.27, 0.45, 0xc0612b, true);
  f.box(1.4, 0, 2.9, 1.8, 0.45, 0.5, 0x7a5a3a, true);
}

/* ------------------------------------------------------------------ */
/* Rickshaw                                                            */
/* ------------------------------------------------------------------ */
export function buildRickshaw(ctx, cx, cz, quarter) {
  const r = ctx.rng;
  const f = new Frame(ctx, cx, cz, quarter);
  const body = pick(r, RICKSHAW_COLORS);
  const trim = pick(r, RICKSHAW_COLORS);
  const dark = 0x222222;

  f.collider(0, 0.1, 1.2, 2.4, 1.5);
  f.box(0, 0.4, -0.35, 1.0, 0.12, 1.1, body);
  f.box(0, 0.52, -0.3, 0.9, 0.18, 0.8, 0x2a3140);
  f.box(0, 0.62, -0.78, 0.9, 0.7, 0.1, trim);
  f.box(-0.5, 0.4, -0.35, 0.06, 0.5, 1.1, body);
  f.box(0.5, 0.4, -0.35, 0.06, 0.5, 1.1, body);
  f.box(0, 1.45, -0.45, 1.05, 0.07, 1.2, trim);
  for (const sx of [-0.45, 0.45]) {
    f.box(sx, 0.95, -0.9, 0.05, 0.55, 0.05, dark);
    f.box(sx, 1.0, 0.1, 0.05, 0.5, 0.05, dark);
  }
  f.box(0, 0.55, 0.75, 0.06, 0.06, 1.2, dark);
  f.box(0, 0.98, 1.3, 0.7, 0.05, 0.05, dark);
  f.box(0, 0.4, 1.3, 0.05, 0.6, 0.05, dark);
  f.box(0, 0.85, 0.8, 0.3, 0.06, 0.3, dark);
  f.wheel(-0.62, 0.34, -0.55, 0.34, 0.06, 0x151515);
  f.wheel(0.62, 0.34, -0.55, 0.34, 0.06, 0x151515);
  f.wheel(0, 0.32, 1.35, 0.32, 0.06, 0x151515);
}

/* ------------------------------------------------------------------ */
/* Market                                                              */
/* ------------------------------------------------------------------ */
export function buildMarketStall(ctx, cx, cz, quarter) {
  const r = ctx.rng;
  const f = new Frame(ctx, cx, cz, quarter);
  const canopy = pick(r, CANOPY_COLORS);
  f.box(0, 0, 0, 2.6, 0.9, 1.3, 0x7a5a3a, true);
  f.box(0, 0.9, 0, 2.7, 0.05, 1.4, pick(r, CANOPY_COLORS));
  for (const px of [-1.5, 1.5]) for (const pz of [-1.0, 1.0]) f.box(px, 0, pz, 0.1, 2.4, 0.1, 0x6b4a2b);
  f.box(0, 2.4, 0.05, 3.4, 0.1, 2.5, canopy);
  f.box(0, 2.1, 1.28, 3.4, 0.3, 0.06, canopy);
  for (let k = -1.1; k <= 1.11; k += 0.45) {
    f.box(k, 0.95, range(r, -0.3, 0.3), 0.35, 0.22, 0.35, pick(r, PRODUCE));
  }
  f.cyl(-0.9, 0.95, 0.55, 0.2, 0.25, pick(r, PRODUCE));
  f.cyl(0.9, 0.95, -0.5, 0.2, 0.25, pick(r, PRODUCE));
  for (const k of [-1.0, 0, 1.0]) f.box(k, 1.7, 1.15, 0.12, 0.5, 0.1, 0xe8c547);
}

export function buildMarketGate(ctx, cx, cz, quarter) {
  const r = ctx.rng;
  const f = new Frame(ctx, cx, cz, quarter);
  f.box(-3, 0, 0, 0.35, 4, 0.35, 0x7a1f1f, true);
  f.box(3, 0, 0, 0.35, 4, 0.35, 0x7a1f1f, true);
  f.box(0, 3.4, 0, 6.7, 1.0, 0.2, 0xc62828);
  f.box(0, 3.85, 0.11, 6.7, 0.12, 0.02, 0xffd54f);
  for (let k = -5; k <= 5; k++) f.box(k * 0.55, 3.0, 0, 0.3, 0.4, 0.03, pick(r, CANOPY_COLORS));
}

/* ------------------------------------------------------------------ */
/* Tin-roof house (slum / low-income housing)                          */
/* ------------------------------------------------------------------ */
export function buildTinHouse(ctx, cx, cz, quarter) {
  const r = ctx.rng;
  const f = new Frame(ctx, cx, cz, quarter);
  const w = range(r, 3.4, 4.6), d = range(r, 3.4, 4.6), h = range(r, 2.3, 2.9);
  f.box(0, 0, 0, w, h, d, pick(r, TIN_WALLS), true);
  f.roof(0, h, 0, w + 0.7, range(r, 0.8, 1.2), d + 0.7, pick(r, TIN_ROOFS));
  const side = r() < 0.5 ? -1 : 1;
  f.box(side * w * 0.2, 0, d / 2 + 0.03, 0.9, 1.9, 0.1, 0x4a3320);
  f.glow(-side * w * 0.27, 0.8, d / 2 + 0.03, 0.7, 0.7, 0.08, pick(r, WINDOW_TINTS));
  f.glow(w / 2 + 0.03, 0.9, 0, 0.08, 0.7, 0.7, pick(r, WINDOW_TINTS));
  if (r() < 0.5) f.glow(-w / 2 - 0.03, 0.9, 0, 0.08, 0.7, 0.7, pick(r, WINDOW_TINTS));
  if (r() < 0.25) f.box(w * 0.25, h + 0.3, -d * 0.2, 0.4, 1.2, 0.4, 0x8a6a55);

  // extra detail (separate random stream so house positions / colours stay as they were)
  const dr = ctx.detailRng;
  f.box(side * w * 0.2, 1.9, d / 2 + 0.05, 1.1, 0.1, 0.16, 0x3a2a1c);               // door lintel
  f.box(side * w * 0.2 - 0.52, 0, d / 2 + 0.05, 0.08, 1.9, 0.14, 0x3a2a1c);          // door jambs
  f.box(side * w * 0.2 + 0.52, 0, d / 2 + 0.05, 0.08, 1.9, 0.14, 0x3a2a1c);
  f.box(-side * w * 0.27, 0.42, d / 2 + 0.06, 0.9, 0.08, 0.14, 0x6b5a45);            // window sill
  f.box(-side * w * 0.27, 1.5, d / 2 + 0.05, 0.9, 0.06, 0.12, 0x3a2a1c);             // window head
  f.box(0, 0, d / 2 + 0.03, w, 0.3, 0.05, 0x4a4036);                                // damp mud plinth
  f.box(0, h - 0.12, d / 2 + 0.03, w, 0.12, 0.06, 0x7d6b5e);                         // eave board
  if (dr() < 0.55) f.cyl(w / 2 + 0.45, 0, d * 0.25, 0.28, 0.7, 0x1f5a8a);            // blue water drum
  if (dr() < 0.4) f.box(-w / 2 - 0.35, 0, -d * 0.1, 0.5, 0.5, 0.9, 0x8a6a45);        // firewood / bench
  if (dr() < 0.35) f.cyl(w * 0.1, h + 0.5, -d * 0.25, 0.09, 0.9, 0x6a6e72);          // stove pipe
  if (dr() < 0.5) f.box(-side * w * 0.3, 1.2, d / 2 + 0.32, 0.9, 0.04, 0.5, pick(dr, LAUNDRY)); // cloth on a line
}

/* ------------------------------------------------------------------ */
/* Small middle-class house with a boundary wall                       */
/* ------------------------------------------------------------------ */
export function buildMiddleClassHouse(ctx, cx, cz, quarter, opt = {}) {
  const { path = true } = opt;
  const r = ctx.rng;
  const f = new Frame(ctx, cx, cz, quarter);
  const PW = 10, PD = 11;
  const bw = 6.4, bd = 5.8, bh = 3.3, bz = -1.0;
  const fz = bz + bd / 2;
  const wall = pick(r, PASTELS);
  const fence = 0xcdbfa8;

  f.box(0, 0, bz, bw, bh, bd, wall, true);
  f.box(0, 0, bz, bw + 0.1, 0.5, bd + 0.1, 0x9b9487);
  f.roof(0, bh, bz, bw + 0.8, 1.5, bd + 0.8, pick(r, TILE_ROOFS));

  // door, windows, porch
  f.box(-1.2, 0, fz + 0.1, 1.0, 2.1, 0.2, 0x5b3a24);
  f.glow(1.6, 0.9, fz + 0.07, 1.3, 1.2, 0.08, pick(r, WINDOW_TINTS));
  f.glow(bw / 2 + 0.07, 0.9, bz, 0.08, 1.2, 1.3, pick(r, WINDOW_TINTS));
  f.glow(-bw / 2 - 0.07, 0.9, bz, 0.08, 1.2, 1.3, pick(r, WINDOW_TINTS));
  f.box(-1.2, 2.5, fz + 0.8, 2.6, 0.12, 1.6, 0xb9a98c);
  f.box(-2.3, 0, fz + 1.5, 0.15, 2.5, 0.15, 0xe8e0d0);
  f.box(-0.1, 0, fz + 1.5, 0.15, 2.5, 0.15, 0xe8e0d0);

  // boundary wall (1.8 m) with a gate gap in front
  const hz = PD / 2 - 0.125;
  f.box(-PW / 2 + 0.125, 0, 0, 0.25, 1.8, PD, fence, true);
  f.box(PW / 2 - 0.125, 0, 0, 0.25, 1.8, PD, fence, true);
  f.box(0, 0, -hz, PW, 1.8, 0.25, fence, true);
  f.box(-3.7, 0, hz, 2.6, 1.8, 0.25, fence, true);
  f.box(2.5, 0, hz, 5.0, 1.8, 0.25, fence, true);
  f.box(-2.5, 0, hz, 0.5, 2.2, 0.5, 0xbfb29a, true);
  f.box(0.1, 0, hz, 0.5, 2.2, 0.5, 0xbfb29a, true);

  // extra detail (separate random stream)
  f.box(1.6, 0.28, fz + 0.06, 1.6, 0.08, 0.16, 0xe9e4d8);                             // window sill
  f.box(1.6, 2.1, fz + 0.05, 1.6, 0.08, 0.12, 0x8d877a);                              // lintel
  f.box(0.78, 0.9, fz + 0.04, 0.08, 1.2, 0.1, 0xe9e4d8);                              // window frame sides
  f.box(2.42, 0.9, fz + 0.04, 0.08, 1.2, 0.1, 0xe9e4d8);
  f.box(-1.2, 2.1, fz + 0.12, 1.3, 0.1, 0.24, 0x3a2a1c);                              // door head
  f.box(0, 3.2, bz, bw + 0.15, 0.14, bd + 0.15, 0xefe9dc);                            // roof-line band
  f.box(-3.7, 1.8, hz, 2.7, 0.1, 0.35, 0xbfb29a);                                     // wall coping
  f.box(2.5, 1.8, hz, 5.1, 0.1, 0.35, 0xbfb29a);
  f.box(-PW / 2 + 0.125, 1.8, 0, 0.35, 0.1, PD + 0.1, 0xbfb29a);
  f.box(PW / 2 - 0.125, 1.8, 0, 0.35, 0.1, PD + 0.1, 0xbfb29a);
  f.box(0, 1.8, -hz, PW + 0.1, 0.1, 0.35, 0xbfb29a);
  f.glow(-2.5, 2.0, hz + 0.28, 0.14, 0.14, 0.1, 0xfff2b3);                            // gate lamps
  f.glow(0.1, 2.0, hz + 0.28, 0.14, 0.14, 0.1, 0xfff2b3);

  if (path) f.slab(-1.2, 4.95, 2.4, 6.1, 0.03, 0xb8b3a6);

  // yard plants
  f.cone(-3.8, 0, 3.5, 0.6, 1.0, 0x4c8c3c);
  if (r() < 0.6) {
    const [tx, tz] = f.toWorld(3.2, 3.4);
    buildTree(ctx, tx, tz, 0.8);
  }
}

/* ------------------------------------------------------------------ */
/* Street furniture                                                    */
/* ------------------------------------------------------------------ */
export function buildStreetLight(ctx, x, z, quarter) {
  const f = new Frame(ctx, x, z, quarter);
  f.cyl(0, 0, 0, 0.14, 0.4, 0x555555);
  f.cyl(0, 0, 0, 0.07, 5.2, 0x3d4247, true);
  f.box(0, 5.1, 0.55, 0.08, 0.08, 1.2, 0x3d4247);
  f.box(0, 5.12, 1.1, 0.55, 0.08, 0.34, 0x444444);
  f.glow(0, 4.98, 1.1, 0.5, 0.14, 0.28, 0xfff2b3);
}

export function buildUtilityPole(ctx, x, z, quarter) {
  const f = new Frame(ctx, x, z, quarter);
  f.cyl(0, 0, 0, 0.13, 8, 0x8b8b86, true);
  f.box(0, 7.4, 0, 1.9, 0.1, 0.1, 0x5a4a3a);
  f.box(0, 6.7, 0, 1.5, 0.1, 0.1, 0x5a4a3a);
}

export function buildBench(ctx, x, z, quarter) {
  const f = new Frame(ctx, x, z, quarter);
  f.box(0, 0.42, 0, 1.8, 0.08, 0.5, 0x8a5a2b);
  f.box(0, 0.5, -0.22, 1.8, 0.45, 0.06, 0x8a5a2b);
  f.box(-0.8, 0, 0, 0.1, 0.42, 0.4, 0x444444);
  f.box(0.8, 0, 0, 0.1, 0.42, 0.4, 0x444444);
  f.collider(0, 0, 1.8, 0.6, 0.95);
}

/* ------------------------------------------------------------------ */
/* Vegetation                                                          */
/* ------------------------------------------------------------------ */
export function buildTree(ctx, x, z, scale = 1) {
  const r = ctx.rng;
  const s = scale * range(r, 0.85, 1.25);
  ctx.cyl(x, 0, z, 0.2 * s, 2.2 * s, 0x6b4a2f, true);
  ctx.cone(x, 1.6 * s, z, 1.7 * s, 2.8 * s, pick(r, GREENS));
  ctx.cone(x, 3.2 * s, z, 1.25 * s, 2.2 * s, pick(r, GREENS));
  // extra detail: a third, lighter canopy tier, a root flare and a low skirt of leaves (separate random stream)
  const dr = ctx.detailRng;
  ctx.cone(x, 4.5 * s, z, 0.8 * s, 1.5 * s, pick(dr, GREENS));
  ctx.cone(x, 0, z, 0.34 * s, 0.35 * s, 0x5a3f27);
  ctx.cone(x + 0.5 * s, 1.3 * s, z - 0.3 * s, 0.9 * s, 1.5 * s, pick(dr, GREENS));
}

/** Street tree: round-ish crown on a bare trunk, with a low brick guard. Uses the detail stream only. */
export function buildStreetTree(ctx, x, z) {
  const dr = ctx.detailRng;
  const s = range(dr, 0.9, 1.2);
  ctx.box(x, 0, z, 1.1, 0.35, 1.1, 0x9a6a55);                       // brick tree guard
  ctx.box(x, 0.3, z, 0.9, 0.06, 0.9, 0x5a4a35);                     // soil
  ctx.cyl(x, 0.3, z, 0.17 * s, 2.6 * s, 0x5f4631, true);
  ctx.cone(x, 2.0 * s, z, 1.6 * s, 1.2 * s, pick(dr, GREENS));
  ctx.cone(x, 2.9 * s, z, 1.45 * s, 1.1 * s, pick(dr, GREENS));
  ctx.cone(x, 3.7 * s, z, 1.0 * s, 1.2 * s, pick(dr, GREENS));
}

/** Low roadside shrub: two overlapping leaf cones. Uses the detail stream only. */
export function buildShrub(ctx, x, z) {
  const dr = ctx.detailRng;
  const s = range(dr, 0.7, 1.2);
  ctx.cone(x, 0, z, 0.62 * s, 0.9 * s, pick(dr, GREENS));
  ctx.cone(x + 0.35 * s, 0, z + 0.2 * s, 0.45 * s, 0.7 * s, pick(dr, GREENS));
}

export function buildPalm(ctx, x, z) {
  const r = ctx.rng;
  const h = range(r, 6, 8);
  ctx.cyl(x, 0, z, 0.14, h, 0x7a6244, true);
  const L = 2.6, a = 0.45;
  const base = r() * Math.PI;
  for (let k = 0; k < 6; k++) {
    const yaw = base + (k * Math.PI) / 3;
    const px = x + Math.sin(yaw) * (L / 2) * Math.cos(a);
    const pz = z + Math.cos(yaw) * (L / 2) * Math.cos(a);
    const py = h - (L / 2) * Math.sin(a);
    ctx.pools.box.add(px, py, pz, 0.4, 0.06, L, yaw, 0x3d8b3d, a);
  }
  // extra detail: coconut cluster + shaded trunk base (detail stream)
  ctx.cyl(x, h - 0.5, z, 0.3, 0.5, 0x4f7d34);
  for (let k = 0; k < 3; k++) ctx.cyl(x + Math.cos(k * 2.1) * 0.25, h - 0.9, z + Math.sin(k * 2.1) * 0.25, 0.16, 0.3, 0x7a5a2a);
  ctx.cyl(x, 0, z, 0.2, 0.6, 0x5f4d33);
}
