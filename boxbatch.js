import * as THREE from 'three';

/**
 * Collects boxes and gable prisms (with vertex colours) as plain numbers and turns them into ONE
 * BufferGeometry. A whole house body is therefore a single draw call, and the data side has no
 * dependency on three.js (easy to test).
 */
const srgbToLinear = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
export function hexToLinear(hex) {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
}

// outward normal n, tangents u, v with u x v = n (counter-clockwise when seen from outside)
const FACES = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];
const SIGNS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

// gable prism: base 1x1 at y = 0, ridge at y = 1 along z (same shape as createPrismGeometry)
const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5], E = [0, 1, -0.5], F = [0, 1, 0.5];
const PRISM = [[D, C, F], [B, A, E], [B, E, F], [B, F, C], [A, D, F], [A, F, E], [A, B, C], [A, C, D]];

export class BoxBatch {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.indices = [];
    this.vertexCount = 0;
    this.boxCount = 0;
  }

  _vert(x, y, z, nx, ny, nz, c) {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.colors.push(c[0], c[1], c[2]);
    return this.vertexCount++;
  }

  /** Box centred at (cx,cy,cz), size w x h x d, turned by ry around the y axis. */
  box(cx, cy, cz, w, h, d, color, ry = 0) {
    const c = hexToLinear(color), cs = Math.cos(ry), sn = Math.sin(ry);
    const hs = [w / 2, h / 2, d / 2];
    for (const f of FACES) {
      const base = this.vertexCount;
      const nx = f.n[0] * cs + f.n[2] * sn, nz = -f.n[0] * sn + f.n[2] * cs;
      for (const [s1, s2] of SIGNS) {
        const lx = f.n[0] * hs[0] + f.u[0] * hs[0] * s1 + f.v[0] * hs[0] * s2;
        const ly = f.n[1] * hs[1] + f.u[1] * hs[1] * s1 + f.v[1] * hs[1] * s2;
        const lz = f.n[2] * hs[2] + f.u[2] * hs[2] * s1 + f.v[2] * hs[2] * s2;
        this._vert(cx + lx * cs + lz * sn, cy + ly, cz - lx * sn + lz * cs, nx, f.n[1], nz, c);
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    this.boxCount++;
  }

  /** Gable roof: base on y0, ridge along local z (turn ry by PI/2 to run it along x). */
  prism(cx, y0, cz, w, h, d, color, ry = 0) {
    const c = hexToLinear(color), cs = Math.cos(ry), sn = Math.sin(ry);
    const tx = (p) => { const lx = p[0] * w, lz = p[2] * d; return [cx + lx * cs + lz * sn, y0 + p[1] * h, cz - lx * sn + lz * cs]; };
    for (const tri of PRISM) {
      const [p, q, r] = tri.map(tx);
      const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
      const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const base = this.vertexCount;
      for (const v of [p, q, r]) this._vert(v[0], v[1], v[2], nx, ny, nz, c);
      this.indices.push(base, base + 1, base + 2);
    }
    this.boxCount++;
  }

  get isEmpty() {
    return this.vertexCount === 0;
  }

  /** @returns {THREE.BufferGeometry} */
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    return g;
  }
}
