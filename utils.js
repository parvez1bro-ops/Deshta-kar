export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Frame-rate independent smoothing. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Interpolate angles along the shortest arc. */
export function lerpAngle(a, b, t) {
  const TWO_PI = Math.PI * 2;
  const d = ((((b - a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  return a + d * t;
}

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
export const range = (rng, min, max) => min + rng() * (max - min);
