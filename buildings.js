import * as THREE from 'three';
import { BoxBatch } from './boxbatch.js';

/**
 * Four enterable buildings: tin-roof house, residential house, modern two-storey house with
 * stairs + balcony, and a brick house with a veranda.
 *
 * Everything for one building is built in LOCAL coordinates (front = +z, origin = footprint centre)
 * and converted to the world with the same quarter-turn maths as instancing.js `Frame`.
 * Visuals are merged into two meshes per building (body + roof). The roof is hidden while the
 * player is inside so the camera can see the interior. Doors are the only moving parts.
 *
 * COLLISION MODEL (extends world.js): every collider is an axis-aligned box with `top` and an
 * optional `bottom`. It blocks a walker only while  feetY < top - step  AND  feetY + height > bottom,
 * so floors and balconies can be walked on from above and walked under from below.
 */
const WALL = 0.2;
const DOOR_W = 1.0;
const DOOR_H = 2.15;
const PLINTH = 0.12;
const RISE = 0.25;       // stair rise (exact in binary floating point, keeps the walker snapped to steps)
const RUN = 0.32;

const C = {
  trim: 0x3d4650, glass: 0x7fb6d8, wood: 0x6b4a2b, darkWood: 0x4a3322, fabric: 0x3f7ca8, fabric2: 0xb04a3a, bed: 0xe8d9b5,
  floor: 0xcbbf9f, tile: 0xdad6c8, white: 0xece8de, stair: 0xbdb7a8, rail: 0x2f3a42,
};

let _bodyMat = null, _doorMat = null;
const bodyMaterial = () => (_bodyMat ??= new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
const doorMaterial = () => (_doorMat ??= new THREE.MeshLambertMaterial({ color: 0x6b4a2b, flatShading: true }));
let _doorGeo = null;
const doorGeometry = () => {
  if (!_doorGeo) { _doorGeo = new THREE.BoxGeometry(DOOR_W - 0.04, DOOR_H, 0.08); _doorGeo.translate((DOOR_W - 0.04) / 2, DOOR_H / 2, 0); }
  return _doorGeo;
};

class House {
  constructor(ctx, name, cx, cz, quarter, w, d) {
    this.ctx = ctx;
    this.name = name;
    this.cx = cx; this.cz = cz;
    this.ry = (quarter * Math.PI) / 2;
    this.cos = Math.round(Math.cos(this.ry));
    this.sin = Math.round(Math.sin(this.ry));
    this.odd = ((quarter % 2) + 2) % 2 === 1;
    this.w = w; this.d = d;
    this.body = new BoxBatch();
    this.roof = new BoxBatch();
    this.doors = [];
    this.interactables = [];
    this.colliders = [];
    this.hideRoofInside = true;
  }

  toWorld(lx, lz) {
    return [this.cx + lx * this.cos + lz * this.sin, this.cz - lx * this.sin + lz * this.cos];
  }

  /** World-space footprint test (with margin), used to hide the roof. */
  contains(x, z, margin = 0) {
    const hw = (this.odd ? this.d : this.w) / 2 + margin, hd = (this.odd ? this.w : this.d) / 2 + margin;
    return Math.abs(x - this.cx) <= hw && Math.abs(z - this.cz) <= hd;
  }

  vis(batch, lx, y0, lz, w, h, d, color) {
    const [x, z] = this.toWorld(lx, lz);
    (batch === 'roof' ? this.roof : this.body).box(x, y0 + h / 2, z, w, h, d, color, this.ry);
  }

  collide(lx, lz, w, d, top, bottom = 0, camera = false) {
    const [x, z] = this.toWorld(lx, lz);
    const ww = this.odd ? d : w, dd = this.odd ? w : d;
    const c = { minX: x - ww / 2, maxX: x + ww / 2, minZ: z - dd / 2, maxZ: z + dd / 2, top, bottom, blocksCamera: camera };
    this.ctx.colliders.push(c);
    this.colliders.push(c);
    return c;
  }

  /** visible + solid */
  solid(lx, y0, lz, w, h, d, color, { camera = false, bottom = y0 } = {}) {
    this.vis('body', lx, y0, lz, w, h, d, color);
    return this.collide(lx, lz, w, d, y0 + h, bottom, camera);
  }

  /** Wall along local x from x1 to x2 at z = lz, from y0 to y1, with optional openings [{x0,x1,top}] */
  wallX(x1, x2, lz, y0, y1, color, gaps = []) {
    this._wall(x1, x2, y0, y1, color, gaps, (a, b, ya, yb) => {
      this.solid((a + b) / 2, ya, lz, b - a, yb - ya, WALL, color, { camera: yb - ya > 1.5 && b - a > 1, bottom: ya });
    });
  }

  /** Wall along local z from z1 to z2 at x = lx. */
  wallZ(z1, z2, lx, y0, y1, color, gaps = []) {
    this._wall(z1, z2, y0, y1, color, gaps, (a, b, ya, yb) => {
      this.solid(lx, ya, (a + b) / 2, WALL, yb - ya, b - a, color, { camera: yb - ya > 1.5 && b - a > 1, bottom: ya });
    });
  }

  _wall(a0, a1, y0, y1, color, gaps, put) {
    const sorted = [...gaps].sort((p, q) => p.x0 - q.x0);
    let a = a0;
    for (const g of sorted) {
      if (g.x0 > a) put(a, g.x0, y0, y1);
      const top = g.top ?? y0 + DOOR_H;
      if (top < y1) put(g.x0, g.x1, top, y1);        // lintel above the opening
      a = g.x1;
    }
    if (a < a1) put(a, a1, y0, y1);
  }

  /** Window: glass pane + frame on both faces of a wall (visual only). axis 'x' = wall runs along x. */
  window(axis, at, lz, y0 = 1.1, w = 1.0, h = 0.9) {
    const T = 0.05;
    for (const side of [-1, 1]) {
      const off = side * (WALL / 2 + T / 2);
      if (axis === 'x') {
        this.vis('body', at, y0 - 0.06, lz + off, w + 0.16, h + 0.12, T, C.trim);
        this.vis('body', at, y0, lz + off + side * 0.012, w, h, T, C.glass);
      } else {
        this.vis('body', lz + off, y0 - 0.06, at, T, h + 0.12, w + 0.16, C.trim);
        this.vis('body', lz + off + side * 0.012, y0, at, T, h, w, C.glass);
      }
    }
  }

  /** Hinged door in the front wall (z = lz). The doorway is closed by a collider until opened. */
  frontDoor(lx0, lz) {
    const hinge = this.toWorld(lx0, lz);
    const group = new THREE.Group();
    group.position.set(hinge[0], 0, hinge[1]);
    group.rotation.y = this.ry;
    const mesh = new THREE.Mesh(doorGeometry(), doorMaterial());
    mesh.castShadow = true;
    group.add(mesh);

    const blocker = this.collide(lx0 + DOOR_W / 2, lz, DOOR_W, WALL * 1.4, DOOR_H, 0, false);
    const centre = this.toWorld(lx0 + DOOR_W / 2, lz);
    const out = [this.sin, this.cos];                     // outward (local +z) in the world
    const door = {
      group, collider: blocker, open: false, t: 0, x: centre[0], z: centre[1], out,
    };
    this.doors.push(door);
    this.interactables.push({
      kind: 'door', short: 'DOOR', x: centre[0], z: centre[1], radius: 1.7,
      label: () => (door.open ? 'Close door' : 'Open door'),
      available: (p) => !(door.open && Math.hypot(p.x - door.x, p.z - door.z) < 0.9) && Math.abs(p.y - (this.floorY ?? 0)) < 1.5,
      act: () => { door.open = !door.open; blocker.disabled = door.open; },
    });
    return door;
  }

  /* ------------------------------ furniture ------------------------------ */
  bed(lx, lz, alongZ = true, y0 = PLINTH) {
    const [w, d] = alongZ ? [0.95, 1.95] : [1.95, 0.95];
    this.solid(lx, y0, lz, w, 0.35, d, C.wood);
    this.vis('body', lx, y0 + 0.35, lz, w - 0.06, 0.18, d - 0.06, C.bed);
    this.vis('body', lx + (alongZ ? 0 : 0.8), y0 + 0.53, lz + (alongZ ? 0.78 : 0), alongZ ? w - 0.2 : 0.3, 0.1, alongZ ? 0.3 : w - 0.2, 0xffffff);
    this.collide(lx, lz, w, d, y0 + 0.55, y0);
  }
  table(lx, lz, w = 1.0, d = 0.7, y0 = PLINTH) {
    this.vis('body', lx, y0 + 0.7, lz, w, 0.06, d, C.wood);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.vis('body', lx + sx * (w / 2 - 0.06), y0, lz + sz * (d / 2 - 0.06), 0.06, 0.7, 0.06, C.darkWood);
    this.collide(lx, lz, w, d, y0 + 0.76, y0);
  }
  chair(lx, lz, y0 = PLINTH) {
    this.vis('body', lx, y0 + 0.42, lz, 0.4, 0.05, 0.4, C.wood);
    this.vis('body', lx, y0 + 0.47, lz - 0.18, 0.4, 0.45, 0.05, C.wood);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.vis('body', lx + sx * 0.16, y0, lz + sz * 0.16, 0.05, 0.42, 0.05, C.darkWood);
    this.collide(lx, lz, 0.4, 0.4, y0 + 0.5, y0);
  }
  sofa(lx, lz, color = C.fabric, y0 = PLINTH, w = 1.9) {
    this.solid(lx, y0, lz, w, 0.45, 0.8, color);
    this.vis('body', lx, y0 + 0.45, lz - 0.32, w, 0.4, 0.16, color);
    this.vis('body', lx - w / 2 + 0.1, y0 + 0.45, lz, 0.2, 0.22, 0.8, color);
    this.vis('body', lx + w / 2 - 0.1, y0 + 0.45, lz, 0.2, 0.22, 0.8, color);
  }
  wardrobe(lx, lz, y0 = PLINTH, alongX = true) {
    const [w, d] = alongX ? [1.1, 0.55] : [0.55, 1.1];
    this.solid(lx, y0, lz, w, 1.9, d, C.darkWood);
    this.vis('body', lx, y0 + 0.1, lz + 0.28, 0.04, 1.7, 0.02, 0x2a1d12);   // door seam
  }
  counter(lx, lz, w, d, y0 = PLINTH) {
    this.solid(lx, y0, lz, w, 0.9, d, C.white);
    this.vis('body', lx, y0 + 0.9, lz, w + 0.04, 0.05, d + 0.04, 0x55606a);
  }

  /** Floor slab on the ground (walkable surface). */
  groundFloor(color = C.floor) {
    this.vis('body', 0, 0, 0, this.w, PLINTH, this.d, color);
    const [x, z] = this.toWorld(0, 0);
    const hw = (this.odd ? this.d : this.w) / 2, hd = (this.odd ? this.w : this.d) / 2;
    this.ctx.surfaces.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, y: PLINTH });
  }

  /** Raised floor / balcony slab (walkable from above, passable from below). */
  slabAt(lx0, lx1, lz0, lz1, y, color = C.floor, thick = 0.2) {
    this.solid((lx0 + lx1) / 2, y - thick, (lz0 + lz1) / 2, lx1 - lx0, thick, lz1 - lz0, color, { bottom: y - thick });
  }

  railing(lx0, lx1, lz0, lz1, y, h = 1.05) {
    const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2, w = Math.max(0.08, lx1 - lx0), d = Math.max(0.08, lz1 - lz0);
    this.vis('body', cx, y, cz, w, 0.07, d, C.rail);                       // top rail
    this.vis('body', cx, y + h * 0.5, cz, w * (w > d ? 1 : 0.5), 0.05, d * (d > w ? 1 : 0.5), C.rail); // mid rail
    const n = Math.max(2, Math.round(Math.max(w, d) / 0.45));
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      this.vis('body', w > d ? lx0 + t * (lx1 - lx0) : cx, y, w > d ? cz : lz0 + t * (lz1 - lz0), 0.05, h, 0.05, C.rail);
    }
    this.collide(cx, cz, w, d, y + h, y, false);
  }

  /**
   * Straight staircase climbing toward local -z. VISUAL: 12 solid steps. PHYSICS: a smooth ramp for the
   * walker's feet (a round collision body cannot climb 0.32 m deep treads reliably) plus step-shaped
   * colliders whose tops sit one half rise below the tread, which keep the player out of the stair block
   * from the side but never trap it when it walks up from the front.
   */
  stairs(lx, zStart, width, count, rise = RISE, run = RUN) {
    for (let i = 0; i < count; i++) {
      const zc = zStart - (i + 0.5) * run;
      this.vis('body', lx, 0, zc, width, (i + 1) * rise, run, C.stair);
      this.vis('body', lx, (i + 1) * rise - 0.02, zc + 0.02, width, 0.02, run, 0x9d978a);       // tread edge shading
      this.collide(lx, zc, width, run, i * rise + rise / 2, 0);
    }
    const zEnd = zStart - (count - 0.5) * run;                 // middle of the top tread
    const [x0, z0] = this.toWorld(lx, zStart), [x1, z1] = this.toWorld(lx, zEnd);
    const len = Math.hypot(x1 - x0, z1 - z0);
    (this.ctx.ramps ??= []).push({
      minX: Math.min(x0, x1) - (this.odd ? 0 : width / 2), maxX: Math.max(x0, x1) + (this.odd ? 0 : width / 2),
      minZ: Math.min(z0, z1) - (this.odd ? width / 2 : 0), maxZ: Math.max(z0, z1) + (this.odd ? width / 2 : 0),
      ox: x0, oz: z0, dx: (x1 - x0) / len, dz: (z1 - z0) / len,
      y0: rise / 2, slope: rise / run, yMax: count * rise,
    });
  }

  /** True when (x,z) is inside this house's footprint (with margin). */
  isInside(x, z, margin = 0.3) {
    return this.contains(x, z, margin);
  }

  /** Meshes: body + roof (roof toggled when the player is inside). */
  finish(group) {
    const mk = (batch, name, cast) => {
      if (batch.isEmpty) return null;
      const m = new THREE.Mesh(batch.build(), bodyMaterial());
      m.name = `${this.name}:${name}`;
      m.castShadow = cast;
      m.receiveShadow = true;
      m.frustumCulled = true;
      group.add(m);
      return m;
    };
    this.bodyMesh = mk(this.body, 'body', true);
    this.roofMesh = mk(this.roof, 'roof', true);
    for (const d of this.doors) group.add(d.group);
  }
}

/* ============================== the four buildings ============================== */

/** Gable roof over a footprint (ridge along local x or z). */
function roofOver(h, y0, w, d, rise, color, ridgeAlongX) {
  const [x, z] = h.toWorld(0, 0);
  if (ridgeAlongX) h.roof.prism(x, y0, z, d, rise, w, color, h.ry + Math.PI / 2);
  else h.roof.prism(x, y0, z, w, rise, d, color, h.ry);
}

export function buildTinHouse(ctx, cx, cz, q) {
  const h = new House(ctx, 'tin-house', cx, cz, q, 5.0, 4.2);
  const W = h.w, D = h.d, H = 2.2, wall = 0x9c8b6b;
  h.groundFloor(0x8e7a5c);
  h.wallX(-W / 2, W / 2, D / 2, 0, H, wall, [{ x0: -1.5, x1: -0.5 }]);
  h.wallX(-W / 2, W / 2, -D / 2, 0, H, wall);
  h.wallZ(-D / 2, D / 2, -W / 2, 0, H, wall);
  h.wallZ(-D / 2, D / 2, W / 2, 0, H, wall);
  h.window('x', 1.2, D / 2); h.window('z', -0.4, -W / 2); h.window('z', 0.5, W / 2); h.window('x', 0.4, -D / 2);
  h.frontDoor(-1.5, D / 2);
  h.bed(1.6, -1.0); h.table(-1.4, -1.2, 0.9, 0.6); h.chair(-1.4, -0.6);
  h.solid(0.1, PLINTH, -1.7, 0.8, 0.5, 0.5, C.darkWood);                 // trunk
  h.wardrobe(-2.1, -1.6, PLINTH, true); h.sofa(0.6, 1.2, C.fabric2, PLINTH, 1.4);
  roofOver(h, H, W + 0.8, D + 0.8, 0.95, 0x8f989f, false);               // corrugated tin
  return h;
}

export function buildResidentialHouse(ctx, cx, cz, q) {
  const h = new House(ctx, 'house', cx, cz, q, 7.6, 6.4);
  const W = h.w, D = h.d, H = 2.8, wall = 0xcaa68a;
  h.groundFloor(C.tile);
  h.wallX(-W / 2, W / 2, D / 2, 0, H, wall, [{ x0: -2.3, x1: -1.3 }]);
  h.wallX(-W / 2, W / 2, -D / 2, 0, H, wall);
  h.wallZ(-D / 2, D / 2, -W / 2, 0, H, wall);
  h.wallZ(-D / 2, D / 2, W / 2, 0, H, wall);
  h.wallZ(-D / 2 + 0.1, D / 2 - 0.1, 1.2, 0, H, 0xd9c3a8, [{ x0: -1.0, x1: 0.0, top: 2.2 }]);   // partition with a doorway
  h.window('x', 0.2, D / 2); h.window('x', 2.6, D / 2); h.window('z', 0.0, -W / 2); h.window('z', -1.8, W / 2);
  h.window('x', -1.8, -D / 2); h.window('x', 2.6, -D / 2);
  h.frontDoor(-2.3, D / 2);
  // living room
  h.sofa(-2.4, -2.5); h.table(-2.4, -0.9, 1.1, 0.7); h.chair(-3.1, 0.0); h.chair(-1.7, 0.0);
  h.counter(-2.6, 2.6, 1.6, 0.6); h.chair(-1.6, 2.6);
  // bedroom
  h.bed(2.7, -1.9); h.wardrobe(3.15, 1.8, PLINTH, true); h.table(2.3, 1.5, 0.7, 0.5); h.chair(2.3, 0.9);
  roofOver(h, H, W + 0.9, D + 0.9, 1.35, 0xb5523b, true);
  return h;
}

export function buildBrickHouse(ctx, cx, cz, q) {
  const h = new House(ctx, 'brick-house', cx, cz, q, 6.4, 5.6);
  const W = h.w, D = h.d, H = 2.7, wall = 0xb5694a;
  h.groundFloor(0xc4b89a);
  h.wallX(-W / 2, W / 2, D / 2, 0, H, wall, [{ x0: -0.5, x1: 0.5 }]);
  h.wallX(-W / 2, W / 2, -D / 2, 0, H, wall);
  h.wallZ(-D / 2, D / 2, -W / 2, 0, H, wall);
  h.wallZ(-D / 2, D / 2, W / 2, 0, H, wall);
  h.window('x', -2.0, D / 2); h.window('x', 2.0, D / 2); h.window('z', 0, -W / 2); h.window('z', 0, W / 2); h.window('x', 0, -D / 2);
  h.frontDoor(-0.5, D / 2);
  // veranda: floor, two posts, a small roof
  const pz = D / 2 + 0.85;
  h.vis('body', 0, 0, pz, W, PLINTH, 1.7, 0xb8ad90);
  const [px, pzz] = h.toWorld(0, pz);
  const hw = (h.odd ? 1.7 : W) / 2, hd = (h.odd ? W : 1.7) / 2;
  ctx.surfaces.push({ minX: px - hw, maxX: px + hw, minZ: pzz - hd, maxZ: pzz + hd, y: PLINTH });
  for (const sx of [-1, 1]) h.solid(sx * (W / 2 - 0.2), PLINTH, D / 2 + 1.55, 0.2, 2.35, 0.2, 0xe8e0cc);
  { const [x, z] = h.toWorld(0, pz); h.roof.box(x, 2.55, z, W + 0.2, 0.15, 1.9, 0x7b4a3a, h.ry); }   // veranda roof
  h.bed(-2.0, -1.5); h.table(1.8, -1.4, 1.0, 0.7); h.chair(1.8, -0.7); h.wardrobe(2.5, -2.3, PLINTH, true); h.sofa(-1.6, 1.4, C.fabric2, PLINTH, 1.5);
  h.counter(0.2, -2.2, 1.4, 0.6); h.chair(-0.6, -2.2);
  roofOver(h, H, W + 0.8, D + 0.8, 1.2, 0x7b4a3a, true);
  return h;
}

export function buildModernHouse(ctx, cx, cz, q) {
  const h = new House(ctx, 'modern-house', cx, cz, q, 9.0, 8.0);
  const W = h.w, D = h.d, F = 3.0, wall = 0xe9e6dd;
  const hx = W / 2, hz = D / 2;
  h.groundFloor(C.tile);

  // ground floor walls (front has the door)
  h.wallX(-hx, hx, hz, 0, F, wall, [{ x0: 1.1, x1: 2.1 }]);
  h.wallX(-hx, hx, -hz, 0, F, wall);
  h.wallZ(-hz, hz, -hx, 0, F, wall);
  h.wallZ(-hz, hz, hx, 0, F, wall);
  h.window('x', -1.2, hz); h.window('x', 3.5, hz); h.window('z', -1.0, hx); h.window('z', 1.5, -hx); h.window('x', 0, -hz);
  h.frontDoor(1.1, hz);

  // upper floor walls (the front has the balcony doorway)
  h.wallX(-hx, hx, hz, F, 2 * F, wall, [{ x0: -0.8, x1: 0.8, top: F + 2.3 }]);
  h.wallX(-hx, hx, -hz, F, 2 * F, wall);
  h.wallZ(-hz, hz, -hx, F, 2 * F, wall);
  h.wallZ(-hz, hz, hx, F, 2 * F, wall);
  h.window('x', -2.8, hz, F + 1.0, 1.2, 1.1); h.window('x', 2.8, hz, F + 1.0, 1.2, 1.1);
  h.window('z', -1.0, hx, F + 1.0, 1.2, 1.1); h.window('z', 1.5, -hx, F + 1.0, 1.2, 1.1); h.window('x', 0, -hz, F + 1.0, 1.4, 1.1);

  // upper floor: a slab with a hole over the stairs
  h.slabAt(-3.1, hx + 0.1, -hz - 0.1, hz + 0.1, F, 0xcfc4a8);
  h.slabAt(-hx - 0.1, -3.1, -hz - 0.1, -3.64, F, 0xcfc4a8);     // behind the top tread
  h.slabAt(-hx - 0.1, -3.1, 0.36, hz + 0.1, F, 0xcfc4a8);
  h.railing(-3.12, -3.04, -3.1, 0.36, F);           // edge of the stairwell (leaves the top tread open)
  h.railing(-hx + 0.1, -3.1, 0.3, 0.38, F);

  // stairs: 12 steps x 0.25 m, going up toward the back wall along the left wall
  h.stairs(-3.75, 0.2, 1.3, 12);

  // balcony
  h.slabAt(-2.4, 2.4, hz, hz + 2.1, F, 0xcfc4a8);
  h.railing(-2.4, 2.4, hz + 2.0, hz + 2.1, F);
  h.railing(-2.4, -2.32, hz + 0.1, hz + 2.0, F);
  h.railing(2.32, 2.4, hz + 0.1, hz + 2.0, F);
  for (const sx of [-1, 1]) h.solid(sx * 2.25, 0, hz + 1.95, 0.2, F - 0.2, 0.2, 0xe8e0cc);
  const [bx, bz] = h.toWorld(0, hz + 1.1);
  h.interactables.push({
    kind: 'wave', short: 'WAVE', x: bx, z: bz, radius: 1.35, minY: F - 0.4,
    label: () => 'Wave from the balcony',
    available: (p) => p.y > F - 0.4,
    act: (p, ctxo) => ctxo.player.wave(),
  });

  // furniture
  h.sofa(1.2, -2.7); h.table(2.6, -0.4, 1.3, 0.8); h.chair(2.0, 0.5); h.chair(3.2, 0.5);
  h.counter(2.6, -3.5, 3.4, 0.7); h.chair(1.4, -3.5); h.chair(3.8, -3.5);
  h.bed(2.9, -2.4, true, F); h.wardrobe(-1.6, -3.55, F, true); h.table(-1.2, 2.2, 1.2, 0.6, F); h.chair(-1.2, 1.5, F);
  h.sofa(1.3, 0.8, C.fabric2, F, 1.6);

  // flat roof with a parapet
  { const [x, z] = h.toWorld(0, 0); h.roof.box(x, 2 * F + 0.1, z, W + 0.6, 0.25, D + 0.6, 0xd6d1c4, h.ry); }
  for (const [lx, lz, w, d] of [[0, hz + 0.25, W + 0.6, 0.15], [0, -hz - 0.25, W + 0.6, 0.15], [-hx - 0.25, 0, 0.15, D + 0.6], [hx + 0.25, 0, 0.15, D + 0.6]]) {
    const [x, z] = h.toWorld(lx, lz);
    h.roof.box(x, 2 * F + 0.35, z, h.odd ? d : w, 0.5, h.odd ? w : d, 0x9aa3a8, 0);
  }
  h.floorY = 0;
  return h;
}

/* =============================== placement =============================== */

function overlaps(ctx, minX, maxX, minZ, maxZ) {
  for (const s of ctx.surfaces) if (maxX > s.minX && minX < s.maxX && maxZ > s.minZ && minZ < s.maxZ) return true;
  for (const c of ctx.colliders) if (maxX > c.minX && minX < c.maxX && maxZ > c.minZ && minZ < c.maxZ) return true;
  return false;
}

/** Nearest free rectangle to (ax, az); keeps `margin` metres of space around it. */
export function findSpot(ctx, w, d, ax, az, { margin = 2.5, limit = 86 } = {}) {
  const ok = (x, z) => {
    if (Math.abs(x) + w / 2 > limit || Math.abs(z) + d / 2 > limit) return false;
    return !overlaps(ctx, x - w / 2 - margin, x + w / 2 + margin, z - d / 2 - margin, z + d / 2 + margin);
  };
  if (ok(ax, az)) return { x: ax, z: az };
  for (let r = 2; r < 140; r += 2) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / 2));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = Math.round(ax + Math.cos(a) * r), z = Math.round(az + Math.sin(a) * r);
      if (ok(x, z)) return { x, z };
    }
  }
  return null;
}

/**
 * Build all four buildings. Returns the meshes (add `group` to the scene), the interactables and an
 * update() that animates doors and hides roofs.
 * @param {{colliders: object[], surfaces: object[]}} ctx  the world's BuildContext
 */
export function buildEnterables(ctx, anchors = {}) {
  const group = new THREE.Group();
  group.name = 'enterables';
  const specs = [
    ['modern', buildModernHouse, 9.0, 8.0, anchors.modern ?? [-16, 40], 3.2],
    ['house', buildResidentialHouse, 7.6, 6.4, anchors.house ?? [-2, 38], 2.8],
    ['tin', buildTinHouse, 5.0, 4.2, anchors.tin ?? [9, 33], 2.2],
    ['brick', buildBrickHouse, 6.4, 5.6, anchors.brick ?? [-30, 40], 2.5],
  ];
  const houses = [];
  const interactables = [];
  for (const [id, make, w, d, [ax, az], pad] of specs) {
    const spot = findSpot(ctx, w, d + (id === 'modern' ? 2.2 : id === 'brick' ? 1.7 : 0), ax, az, { margin: pad });
    if (!spot) { console.warn(`[buildings] no free spot for ${id}`); continue; }
    const q = spot.z > 0 ? 2 : 0;                                  // door faces the main road
    // modern / brick have a balcony / veranda in front: move the centre away from the road a little
    const shift = id === 'modern' ? 1.05 : id === 'brick' ? 0.85 : 0;
    const cz = spot.z + (q === 0 ? -shift : shift);
    const house = make(ctx, spot.x, cz, q);
    house.id = id;
    house.finish(group);
    houses.push(house);
    interactables.push(...house.interactables);
  }

  const update = (dt, player) => {
    let anyInside = false;
    for (const h of houses) {
      for (const door of h.doors) {
        const target = door.open ? 1 : 0;
        if (door.t !== target) {
          door.t += Math.sign(target - door.t) * Math.min(Math.abs(target - door.t), dt * 3.5);
          door.group.rotation.y = h.ry + door.t * (Math.PI / 2) * 0.96;
        }
      }
      if (h.roofMesh) {
        const inside = h.contains(player.x, player.z, 0.25) && player.y < 5.5;
        if (inside) anyInside = true;
        if (h.roofMesh.visible === inside) h.roofMesh.visible = !inside;
      }
    }
    // UPDATE 07: tell the camera we are indoors so it stays close and low.
    // Only the roof of the house we are in is hidden (selective ceiling hiding);
    // every other building stays fully visible.
    if (ctx.camera) ctx.camera.indoor = anyInside;
  };

  const dispose = () => {
    group.traverse((o) => { if (o.geometry && o.geometry !== _doorGeo) o.geometry.dispose(); });
    if (group.parent) group.parent.remove(group);
  };
  return { group, houses, interactables, update, dispose };
}
