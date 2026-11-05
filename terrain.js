import * as THREE from 'three';
import { hexToLinear } from './boxbatch.js';

/**
 * The lobby hill: a broad, low-poly hill just outside the south wall of the city.
 * The character stands on its flat summit and looks back (north) over the city, which stays
 * close and detailed below. Visible from the city too, as part of the scenery.
 */
export const HILL = { x: 0, z: 128, R: 30, r0: 7.5, H: 9 };

const smooth = (t) => t * t * (3 - 2 * t);

/** Terrain height at (x, z): flat summit, smooth shoulders, 0 outside the hill. */
export function hillHeight(x, z) {
  const d = Math.hypot(x - HILL.x, z - HILL.z);
  if (d >= HILL.R) return 0;
  if (d <= HILL.r0) return HILL.H;
  return HILL.H * smooth((HILL.R - d) / (HILL.R - HILL.r0));
}

const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Pure data for the hill surface (also used by tests). */
export function hillMeshData(segments = 30) {
  const rings = [1, 0.93, 0.85, 0.76, 0.66, 0.56, 0.46, 0.38, HILL.r0 / HILL.R, 0.15, 0].map((f) => f * HILL.R);
  const positions = [], colors = [], indices = [];
  const grass = [0x5b8c40, 0x6f9f4a, 0x7fae55, 0x8dbb62].map(hexToLinear);
  const path = hexToLinear(0xb59a6a);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  const vertex = (r, i, k) => {
    const a = (i / segments) * Math.PI * 2;
    const x = HILL.x + Math.cos(a) * r, z = HILL.z + Math.sin(a) * r;
    let y = hillHeight(x, z);
    const slope = r > HILL.r0 + 0.5 && r < HILL.R - 0.5;
    if (slope) y += (hash(i, k) - 0.5) * 0.7;               // gentle facets, never on the summit or the base
    positions.push(x, y, z);
    const t = Math.min(1, y / HILL.H);
    let col = mix(grass[0], grass[3], t);
    if (x > HILL.x - 1.8 && x < HILL.x + 1.8 && z < HILL.z && r > HILL.r0 * 0.9) col = path;   // footpath toward the city
    else col = mix(col, grass[1], hash(k, i) * 0.25);
    colors.push(col[0], col[1], col[2]);
    return positions.length / 3 - 1;
  };

  const ringIdx = rings.map((r, k) => {
    if (r === 0) return [vertex(0, 0, k)];
    const out = [];
    for (let i = 0; i < segments; i++) out.push(vertex(r, i, k));
    return out;
  });
  for (let k = 0; k < rings.length - 1; k++) {
    const o = ringIdx[k], n = ringIdx[k + 1];
    for (let i = 0; i < segments; i++) {
      const o0 = o[i], o1 = o[(i + 1) % segments];
      if (n.length === 1) { indices.push(o0, n[0], o1); continue; }
      const i0 = n[i], i1 = n[(i + 1) % segments];
      indices.push(o0, i0, o1, o1, i0, i1);
    }
  }
  return { positions, colors, indices };
}

/** Adds the hill mesh to `parent` and its trees / rocks to the world's instance pools. */
export function buildHill(ctx, parent) {
  const data = hillMeshData();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
  g.setIndex(data.indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.name = 'lobby-hill';
  mesh.receiveShadow = true;
  parent.add(mesh);

  // trees on the shoulders, keeping the view to the city (north) and the summit clear
  let n = 0;
  for (let k = 0; k < 40 && n < 16; k++) {
    const a = hash(k, 7) * Math.PI * 2;
    const r = 12 + hash(k, 3) * 12;
    const x = HILL.x + Math.cos(a) * r, z = HILL.z + Math.sin(a) * r;
    if (Math.abs(a - Math.PI * 1.5) < 0.7) continue;           // north: leave open
    if (Math.abs(x - HILL.x) < 3 && z < HILL.z) continue;      // footpath
    const y = hillHeight(x, z), s = 0.9 + hash(k, 11) * 0.7;
    ctx.cyl(x, y - 0.1, z, 0.14 * s, 1.3 * s, 0x6b4a2b);
    ctx.cone(x, y + 0.9 * s, z, 1.15 * s, 2.3 * s, hash(k, 5) > 0.5 ? 0x2f6b34 : 0x3a7d3a);
    n++;
  }
  for (let k = 0; k < 7; k++) {                                // rocks near the summit rim
    const a = hash(k, 21) * Math.PI * 2;
    const r = HILL.r0 + 1.2 + hash(k, 22) * 3;
    if (Math.abs(a - Math.PI * 0.5) < 0.9) continue;           // not behind the camera-facing side
    const x = HILL.x + Math.cos(a) * r, z = HILL.z + Math.sin(a) * r;
    ctx.pools.box.add(x, hillHeight(x, z) + 0.25, z, 0.9 + hash(k, 23), 0.6, 0.8 + hash(k, 24), hash(k, 25) * 3, 0x9a9a92);
  }
  return mesh;
}
