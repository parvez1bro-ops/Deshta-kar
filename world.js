import * as THREE from 'three';
import { clamp, mulberry32, range } from './utils.js';
import { BuildContext } from './instancing.js';
import * as B from './builders.js';
import { buildEnterables } from './buildings.js';
import { HILL, buildHill, hillHeight } from './terrain.js';
import { applyGroundVariation } from './surfaceDetail.js';

export const WORLD_HALF = 96;
const CELL = 8;
const STEP_HEIGHT = 0.35;
const BODY_HEIGHT = 1.8;   // head room needed under a floor / ceiling collider
const STREET_A = -30;
const STREET_B = 28;
const CROSSINGS = [-9, 14];

const _right = new THREE.Vector3();
const _up2 = new THREE.Vector3();
const _target = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

/** Soft light/dark grass blotches + fine speckle, tileable, mean brightness ~0.93 (the material colour tints it). */
function makeGrassTexture() {
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#ededed';
  g.fillRect(0, 0, N, N);
  const rnd = mulberry32(7);
  const dot = (x, y, r, v, a) => {
    g.fillStyle = `rgba(${v},${v},${v},${a})`;
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {   // wrap at the edges so tiles join invisibly
      g.beginPath(); g.arc(x + ox, y + oy, r, 0, 6.2832); g.fill();
    }
  };
  for (let i = 0; i < 46; i++) dot(rnd() * N, rnd() * N, 6 + rnd() * 14, rnd() < 0.5 ? 205 : 255, 0.16);
  for (let i = 0; i < 260; i++) dot(rnd() * N, rnd() * N, 0.6 + rnd() * 1.1, rnd() < 0.5 ? 200 : 255, 0.35);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;                       // keeps the ground sharp at grazing angles (cheap on any GPU)
  return t;
}

export class World {
  constructor(scene, { shadowMapSize = 1024 } = {}) {
    this.scene = scene;
    this.rng = mulberry32(20261101);
    this.colliders = [];
    this.surfaces = [];
    this.blockers = [];
    this._grid = new Map();
    this._tmp = [];
    this.sunDir = new THREE.Vector3(-0.5, 0.85, 0.45).normalize();
    this._texel = 80 / shadowMapSize;
    this.spawn = { x: 0, z: 2.5 };
    this.hill = { x: HILL.x, z: HILL.z, top: HILL.H };
    this.interactables = [];   // doors, balcony, (the motorcycle adds its own)
    this.enterables = null;
    this.ramps = [];
    this.camera = null;        // set by main.js: lets enterables report indoor state to the camera

    this._createSky();
    this._createLights(shadowMapSize);
    this._createGround();
    this._buildCity();
    this._buildGrid();
  }

  /* ------------------------------ sky / light ------------------------------ */

  _createSky() {
    const horizon = 0xd6ebf5;
    this.scene.fog = new THREE.Fog(horizon, 80, 200);
    this.skyGroup = new THREE.Group();

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(450, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          topColor: { value: new THREE.Color(0x4f98e0) },
          horizonColor: { value: new THREE.Color(horizon) },
        },
        vertexShader: `
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 topColor;
          uniform vec3 horizonColor;
          varying vec3 vPos;
          void main() {
            float h = normalize(vPos).y;
            float t = smoothstep(0.0, 0.65, h);
            gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
            #include <colorspace_fragment>
          }`,
      })
    );
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.skyGroup.add(dome);

    const sun = new THREE.Mesh(new THREE.SphereGeometry(22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
    sun.position.copy(this.sunDir).multiplyScalar(400);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(40, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false, transparent: true, opacity: 0.25, depthWrite: false })
    );
    glow.position.copy(sun.position);
    this.skyGroup.add(sun, glow);
    this.scene.add(this.skyGroup);

    // slow-drifting low-poly clouds
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.92 });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Mesh(unit, cloudMat);
        m.scale.set(range(this.rng, 18, 36), range(this.rng, 4, 8), range(this.rng, 12, 22));
        m.position.set(range(this.rng, -14, 14), range(this.rng, -1, 3), range(this.rng, -8, 8));
        g.add(m);
      }
      g.position.set(range(this.rng, -300, 300), range(this.rng, 90, 130), range(this.rng, -300, 300));
      g.userData.speed = range(this.rng, 2, 4);
      this.clouds.add(g);
    }
    this.scene.add(this.clouds);
  }

  _createLights(size) {
    // a little less flat ambient and a slightly stronger, warmer sun: walls and characters get clearer
    // light / shade sides (depth) without adding any extra light or post-processing
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6d8f4e, 1.5);
    const sun = new THREE.DirectionalLight(0xffefd0, 2.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(size, size);
    const c = sun.shadow.camera;
    c.left = -40; c.right = 40; c.top = 40; c.bottom = -40; c.near = 1; c.far = 220;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
    this.sun = sun;
    this.scene.add(hemi, sun, sun.target);
  }

  _createGround() {
    const geo = new THREE.PlaneGeometry(600, 600);
    geo.rotateX(-Math.PI / 2);
    // one small tiling noise texture (128 px, generated here, no file): grass patches give the eye
    // a surface to judge distance and walking speed by. Repeats every 8 m.
    const tex = makeGrassTexture();
    tex.repeat.set(75, 75);
    this._groundTexture = tex;
    const ground = new THREE.Mesh(geo, applyGroundVariation(new THREE.MeshLambertMaterial({ color: 0x7cae57, map: tex })));
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  /* --------------------------------- city ---------------------------------- */

  _buildCity() {
    const ctx = (this.ctx = new BuildContext(this.rng));
    const rng = this.rng;

    this._buildRoads(ctx);

    // ---- centre: apartments, office, hospital, market, tea stall ----
    B.buildApartment(ctx, -14, -22, 0, { floors: 7 });
    B.buildApartment(ctx, 2, -22, 0, { floors: 9, color: 0xc9d3c0 });
    B.buildOffice(ctx, 18, -21, 0, { floors: 4 });
    B.buildApartment(ctx, -12, -42, 0, { floors: 5, color: 0xe0cfae });
    B.buildApartment(ctx, 8, -42, 0, { floors: 6, color: 0xd2c0c0 });
    B.buildApartment(ctx, 10, 44, 2, { floors: 6, color: 0xcfd6dc });

    ctx.slab(-11, 11, 22, 8, 0.03, 0xb9b6ac); // hospital apron (x -22..0, z 7..15)
    B.buildHospital(ctx, -9, 22, 2);

    ctx.slab(-25.25, 10, 5.5, 6, 0.02, 0x9a8460);
    B.buildTeaStall(ctx, -25.2, 10.2, 2);

    ctx.slab(14, 18, 22, 20, 0.03, 0x9c9a92); // market floor
    for (const x of [5.5, 10.5, 15.5, 20.5]) {
      B.buildMarketStall(ctx, x, 13, 0);
      B.buildMarketStall(ctx, x, 21, 2);
    }
    B.buildMarketGate(ctx, 14, 9, 0);

    B.buildRickshaw(ctx, -22, 3.6, 1);
    B.buildRickshaw(ctx, -19.5, 3.6, 1);
    B.buildRickshaw(ctx, 12, -3.7, 3);

    // ---- west: tin-roof neighbourhood with narrow alleys ----
    ctx.slab(-61, -31.5, 54, 45, 0.02, 0x8e7a5c);
    ctx.slab(-61, 31.5, 54, 45, 0.02, 0x8e7a5c);
    const pitch = 6.8;
    for (const side of [-1, 1]) {
      for (let j = 0; j < 6; j++) {
        for (let i = 0; i < 8; i++) {
          if (rng() < 0.1) continue;
          const x = -84 + i * pitch + (rng() - 0.5) * 0.5;
          const z = side * (13 + j * pitch) + (rng() - 0.5) * 0.5;
          B.buildTinHouse(ctx, x, z, Math.floor(rng() * 4));
        }
      }
    }

    // ---- east: middle-class houses ----
    for (let i = 0; i < 5; i++) {
      const x = 40 + 12 * i;
      B.buildMiddleClassHouse(ctx, x, -15, 0);
      B.buildMiddleClassHouse(ctx, x, 15, 2);
    }
    for (let k = 0; k < 3; k++) {
      const z = 28 + 11 * k;
      B.buildMiddleClassHouse(ctx, 37, -z, 3, { path: false });
      B.buildMiddleClassHouse(ctx, 37, z, 3, { path: false });
    }

    // ---- street furniture ----
    const inGap = (x) => (x > -34 && x < -26) || (x > 24 && x < 32);
    for (let x = -80; x <= 80; x += 16) {
      if (inGap(x)) continue;
      B.buildStreetLight(ctx, x, -6, 0);
      B.buildStreetLight(ctx, x, 6, 2);
    }
    for (const zz of [20, 40, 60, 80]) {
      for (const s of [-1, 1]) {
        B.buildStreetLight(ctx, -27.5, s * zz, 3);
        B.buildStreetLight(ctx, 30.6, s * zz, 3);
      }
    }
    for (const x of [-56, -8, 40, 72]) B.buildUtilityPole(ctx, x, -6.7, 0);
    B.buildBench(ctx, -4, 6.3, 2);
    B.buildBench(ctx, 22, -6, 0);
    B.buildBench(ctx, -40, 6.3, 2);
    B.buildBench(ctx, 50, -6, 0);

    // ---- enterable buildings (no random numbers used, so the rest of the city is unchanged) ----
    ctx.camera = this.camera;
    this.enterables = buildEnterables(ctx);
    this.scene.add(this.enterables.group);
    this.interactables.push(...this.enterables.interactables);

    this._buildBoundary(ctx);
    buildHill(ctx, this.scene);
    this._scatterVegetation(ctx);
    this._buildRoadside(ctx);
    this._buildSkyline(ctx);

    ctx.finalize();
    for (const p of Object.values(ctx.pools)) this.scene.add(p.mesh);
    this.colliders = ctx.colliders;
    this.surfaces = ctx.surfaces;
    this.ramps = ctx.ramps || [];
    this.blockers = this.colliders.filter((c) => c.blocksCamera);
  }

  _buildRoads(ctx) {
    const roadY = 0.04;
    ctx.slab(0, 0, 194, 10, roadY, 0x3b3e42);
    for (const sx of [STREET_A, STREET_B]) {
      ctx.slab(sx, -51, 4, 92, roadY, 0x5d5f62);
      ctx.slab(sx, 51, 4, 92, roadY, 0x5d5f62);
    }
    // sidewalks interrupted by the narrow streets
    const segs = [[-97, -32], [-28, 26], [30, 97]];
    for (const [a, b] of segs) {
      for (const z of [-6, 6]) ctx.slab((a + b) / 2, z, b - a, 2, 0.15, 0xb4b1a8);
    }
    // dashed centre line
    for (let x = -94; x < 94; x += 6) {
      const cx = x + 1.5;
      if (CROSSINGS.some((c) => Math.abs(cx - c) < 3)) continue;
      ctx.box(cx, roadY, 0, 3, 0.012, 0.18, 0, 0xe8d44d);
    }
    // zebra crossings
    for (const xc of CROSSINGS) {
      for (let k = -4; k <= 4; k++) ctx.box(xc, roadY, k, 3, 0.012, 0.5, 0, 0xf2f2f2);
    }
  }

  _buildBoundary(ctx) {
    const c = 0xc2baa9;
    ctx.box(0, 0, -98, 198, 3.5, 1, 0, c, true);
    ctx.box(0, 0, 98, 198, 3.5, 1, 0, c, true);
    ctx.box(-98, 0, 0, 1, 3.5, 198, 0, c, true);
    ctx.box(98, 0, 0, 1, 3.5, 198, 0, c, true);
  }

  _isFree(x, z, margin) {
    for (const s of this.ctx.surfaces) {
      if (x > s.minX - 0.5 && x < s.maxX + 0.5 && z > s.minZ - 0.5 && z < s.maxZ + 0.5) return false;
    }
    for (const c of this.ctx.colliders) {
      if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) return false;
    }
    return true;
  }

  _scatterVegetation(ctx) {
    const rng = this.rng;
    const lim = WORLD_HALF - 3;
    let trees = 0, palms = 0, tries = 0;
    while ((trees < 70 || palms < 22) && tries < 3000) {
      tries++;
      const x = range(rng, -lim, lim);
      const z = range(rng, -lim, lim);
      if (Math.hypot(x - this.spawn.x, z - this.spawn.z) < 6) continue;
      if (!this._isFree(x, z, 2.0)) continue;
      if (palms < 22 && (trees >= 70 || rng() < 0.25)) {
        B.buildPalm(ctx, x, z);
        palms++;
      } else if (trees < 70) {
        B.buildTree(ctx, x, z, 1);
        trees++;
      }
    }
  }

  /**
   * Extra roadside dressing: lane edge lines, manhole covers, street trees, shrubs along the sidewalks and
   * overhead wires between the utility poles. Everything here uses ctx.detailRng and adds no colliders except
   * tree trunks, so the original layout (buildings, vegetation, spawn) is untouched.
   */
  _buildRoadside(ctx) {
    const dr = ctx.detailRng;
    const roadY = 0.04;
    const segs = [[-97, -32], [-28, 26], [30, 97]];
    for (const [a, b] of segs) {
      for (const z of [-4.55, 4.55]) ctx.box((a + b) / 2, roadY, z, b - a, 0.012, 0.12, 0, 0xe9e6dc);   // solid edge lines
    }
    for (const [x, z] of [[-60, 2.2], [-22, -2.4], [6, 2.6], [36, -2.2], [64, 2.4], [-80, -2.6]]) {
      ctx.cyl(x, roadY, z, 0.42, 0.012, 0x2a2c2f);                                                      // manhole covers
    }
    const inGap = (x) => (x > -35 && x < -25) || (x > 23 && x < 33);
    let n = 0;
    for (let x = -88; x <= 88; x += 8) {
      if (inGap(x)) continue;
      for (const side of [-1, 1]) {
        const z = side * 7.7;
        const jx = x + (dr() - 0.5) * 2;
        if (!this._isFree(jx, z, 1.2)) continue;
        const roll = dr();
        if (roll < 0.22 && n < 16) { B.buildStreetTree(ctx, jx, z); n++; }
        else if (roll < 0.6) B.buildShrub(ctx, jx, z);
      }
    }
    // overhead wires between the utility poles (three lines, slightly sagging look from the arm heights)
    const poles = [-56, -8, 40, 72];
    for (let i = 0; i < poles.length - 1; i++) {
      const cx = (poles[i] + poles[i + 1]) / 2, len = poles[i + 1] - poles[i];
      for (const [y, dz] of [[7.42, 0], [7.42, 0.05], [6.72, 0]]) ctx.box(cx, y, -6.7 + dz, len, 0.025, 0.025, 0, 0x1b1b1b);
    }
  }

  _buildSkyline(ctx) {
    const rng = this.rng;
    const cols = [0x9aa7b4, 0xa9b3bd, 0x8f9ba8];
    for (let i = 0; i < 40; i++) {
      const a = rng() * Math.PI * 2;
      const r = range(rng, 118, 175);
      const w = range(rng, 10, 22), d = range(rng, 10, 22), h = range(rng, 14, 48);
      if (Math.hypot(Math.cos(a) * r - HILL.x, Math.sin(a) * r - HILL.z) < HILL.R + 25) continue;   // keep the hill clear
      ctx.pools.far.add(Math.cos(a) * r, h / 2, Math.sin(a) * r, w, h, d, a, cols[i % 3]);
    }
  }

  /* ------------------------------ spatial queries --------------------------- */

  _buildGrid() {
    for (const c of this.colliders) {
      const i0 = Math.floor(c.minX / CELL), i1 = Math.floor(c.maxX / CELL);
      const j0 = Math.floor(c.minZ / CELL), j1 = Math.floor(c.maxZ / CELL);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const key = (i + 500) * 1000 + (j + 500);
          let arr = this._grid.get(key);
          if (!arr) this._grid.set(key, (arr = []));
          arr.push(c);
        }
      }
    }
  }

  _query(x, z, r) {
    const out = this._tmp;
    out.length = 0;
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = this._grid.get((i + 500) * 1000 + (j + 500));
        if (arr) for (let k = 0; k < arr.length; k++) out.push(arr[k]);
      }
    }
    return out;
  }

  /** Height of the walkable surface under (x,z) for something whose feet are at feetY. */
  getGroundY(x, z, feetY) {
    let y = 0;
    const S = this.surfaces;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ && s.y > y) y = s.y;
    }
    const R = this.ramps;
    for (let i = 0; i < R.length; i++) {          // staircases: a smooth slope under the walker's feet
      const r = R[i];
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      let ry = r.y0 + r.slope * ((x - r.ox) * r.dx + (z - r.oz) * r.dz);
      if (ry > r.yMax) ry = r.yMax;
      if (ry <= feetY + STEP_HEIGHT && ry > y) y = ry;
    }
    const list = this._query(x, z, 0);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.disabled) continue;
      if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.top <= feetY + STEP_HEIGHT && c.top > y) y = c.top;
    }
    return y;
  }

  /** Push a circle (pos, radius) out of every collider it overlaps. Mutates pos. */
  resolveCollisions(pos, radius, feetY) {
    const r = radius;
    for (let iter = 0; iter < 3; iter++) {
      const list = this._query(pos.x, pos.z, r);
      let moved = false;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.disabled) continue;
        if (feetY >= c.top - STEP_HEIGHT) continue;
        if (c.bottom && feetY + BODY_HEIGHT <= c.bottom) continue;   // walking under a floor / balcony
        const nx = clamp(pos.x, c.minX, c.maxX);
        const nz = clamp(pos.z, c.minZ, c.maxZ);
        const dx = pos.x - nx, dz = pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const k = (r - d) / d;
          pos.x += dx * k;
          pos.z += dz * k;
        } else {
          const l = pos.x - c.minX, rr = c.maxX - pos.x, t = pos.z - c.minZ, b = c.maxZ - pos.z;
          const m = Math.min(l, rr, t, b);
          if (m === l) pos.x = c.minX - r;
          else if (m === rr) pos.x = c.maxX + r;
          else if (m === t) pos.z = c.minZ - r;
          else pos.z = c.maxZ + r;
        }
        moved = true;
      }
      if (!moved) break;
    }
    const lim = WORLD_HALF - 0.5;
    pos.x = clamp(pos.x, -lim, lim);
    pos.z = clamp(pos.z, -lim, lim);
  }

  /**
   * Fraction (0..1) along from->to at which the segment first hits a large building or wall.
   * Slab test against each blocker's box; allocation-free (called several times per frame).
   */
  raycastBlockers(from, to, pad = 0.25) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    let best = 1;
    const list = this.blockers;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.disabled) continue;
      const lo = c.bottom || 0;
      let t0 = 0, t1 = best;

      // x slab
      if (Math.abs(dx) < 1e-9) {
        if (from.x < c.minX - pad || from.x > c.maxX + pad) continue;
      } else {
        let ta = (c.minX - pad - from.x) / dx, tb = (c.maxX + pad - from.x) / dx;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) continue;
      }
      // y slab (ground to roof)
      if (Math.abs(dy) < 1e-9) {
        if (from.y < lo - pad || from.y > c.top + pad) continue;
      } else {
        let ta = (lo - pad - from.y) / dy, tb = (c.top + pad - from.y) / dy;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) continue;
      }
      // z slab
      if (Math.abs(dz) < 1e-9) {
        if (from.z < c.minZ - pad || from.z > c.maxZ + pad) continue;
      } else {
        let ta = (c.minZ - pad - from.z) / dz, tb = (c.maxZ + pad - from.z) / dz;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) continue;
      }
      if (t0 < best) best = t0;
    }
    return best;
  }

  /* ------------------------------ graphics quality -------------------------- */

  /**
   * Apply a QUALITY_PRESETS entry. Cheap to call at runtime: only toggles
   * shadows, fog distance and a few optional meshes. Materials are untouched.
   */
  applyQuality(preset) {
    const sun = this.sun;
    sun.castShadow = preset.shadows;
    if (sun.shadow.mapSize.x !== preset.shadowMapSize) {
      sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      if (sun.shadow.map) {            // force three.js to rebuild the shadow target at the new size
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    this._texel = 80 / preset.shadowMapSize;
    this.scene.fog.near = preset.fogNear;
    this.scene.fog.far = preset.fogFar;
    this.clouds.visible = preset.clouds;
    this.ctx.pools.far.mesh.visible = preset.skyline;
  }

  /** Terrain height under (x, z): only the lobby hill rises above 0 (buildings use colliders). */
  hillY(x, z) {
    return hillHeight(x, z);
  }

  /* --------------------------------- update -------------------------------- */

  update(dt, focus, camera) {
    // keep the shadow frustum centred on the player, snapped to texels to avoid shimmer
    const dir = this.sunDir;
    _right.crossVectors(_UP, dir).normalize();
    _up2.crossVectors(dir, _right);
    let a = focus.dot(_right), b = focus.dot(_up2);
    const c = focus.dot(dir);
    a = Math.round(a / this._texel) * this._texel;
    b = Math.round(b / this._texel) * this._texel;
    _target.set(0, 0, 0).addScaledVector(_right, a).addScaledVector(_up2, b).addScaledVector(dir, c);
    this.sun.target.position.copy(_target);
    this.sun.position.copy(_target).addScaledVector(dir, 100);

    if (this.enterables) this.enterables.update(dt, focus);
    this.skyGroup.position.copy(camera.position);
    if (this.clouds.visible && dt > 0) {
      for (const g of this.clouds.children) {
        g.position.x += g.userData.speed * dt;
        if (g.position.x > 320) g.position.x = -320;
      }
    }
  }
}
