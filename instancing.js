import * as THREE from 'three';
import { applySurfaceDetail } from './surfaceDetail.js';
import { mulberry32 } from './utils.js';

const _obj = new THREE.Object3D();
_obj.rotation.order = 'YXZ';
const _col = new THREE.Color();

/** Triangular prism (gable roof). Base on y=0, ridge at y=1 along local z, 1x1 footprint. */
export function createPrismGeometry() {
  const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5];
  const E = [0, 1, -0.5], F = [0, 1, 0.5];
  const tris = [
    [D, C, F], [B, A, E],          // gable ends
    [B, E, F], [B, F, C],          // right slope
    [A, D, F], [A, F, E],          // left slope
    [A, B, C], [A, C, D],          // underside
  ];
  const pos = [];
  for (const t of tris) for (const v of t) pos.push(v[0], v[1], v[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** One InstancedMesh = one draw call for thousands of repeated pieces. */
export class InstancePool {
  constructor(name, geometry, material, capacity, { castShadow = true, receiveShadow = true } = {}) {
    this.name = name;
    this.capacity = capacity;
    this.count = 0;
    this._warned = false;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.name = `pool:${name}`;
    this.mesh.count = 0;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = receiveShadow;
    this.mesh.frustumCulled = false;
  }

  add(x, y, z, sx, sy, sz, ry, color, rx = 0, rz = 0) {
    if (this.count >= this.capacity) {
      if (!this._warned) {
        console.warn(`[InstancePool:${this.name}] capacity ${this.capacity} reached`);
        this._warned = true;
      }
      return;
    }
    _obj.position.set(x, y, z);
    _obj.rotation.set(rx, ry, rz);
    _obj.scale.set(sx, sy, sz);
    _obj.updateMatrix();
    this.mesh.setMatrixAt(this.count, _obj.matrix);
    this.mesh.setColorAt(this.count, _col.set(color));
    this.count++;
  }

  finalize() {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/**
 * Collects everything the city is built from: instanced pools, colliders and
 * walkable surfaces. Builders only talk to this object.
 */
export class BuildContext {
  constructor(rng) {
    this.rng = rng;
    this.detailRng = mulberry32(90210);   // separate stream: extra decoration never shifts the city layout
    this.colliders = [];
    this.surfaces = [];

    // procedural plaster / asphalt / tin detail (see surfaceDetail.js); the far skyline stays plain (cheaper, it is fogged)
    const lambert = (roof = false) => applySurfaceDetail(new THREE.MeshLambertMaterial({ flatShading: true }), { roof });
    const plain = () => new THREE.MeshLambertMaterial({ flatShading: true });
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.pools = {
      box: new InstancePool('box', unitBox, lambert(), 6000),
      glow: new InstancePool('glow', unitBox, new THREE.MeshBasicMaterial(), 2500, { castShadow: false, receiveShadow: false }),
      cyl: new InstancePool('cyl', new THREE.CylinderGeometry(1, 1, 1, 8, 1), lambert(), 1500),
      cone: new InstancePool('cone', new THREE.ConeGeometry(1, 1, 7, 1), lambert(), 800),
      roof: new InstancePool('roof', createPrismGeometry(), lambert(true), 700),
      far: new InstancePool('far', unitBox, plain(), 200, { castShadow: false, receiveShadow: false }),
    };
  }

  addCollider(wx, wz, w, d, ry, top) {
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    const hw = (c * w + s * d) / 2, hd = (s * w + c * d) / 2;
    this.colliders.push({
      minX: wx - hw, maxX: wx + hw, minZ: wz - hd, maxZ: wz + hd, top,
      // big enough to hide the player from the camera (buildings, long walls), not poles or props
      blocksCamera: Math.max(hw, hd) * 2 > 1.0 && top > 1.5,
    });
  }

  box(wx, y, wz, w, h, d, ry, color, collide = false) {
    this.pools.box.add(wx, y + h / 2, wz, w, h, d, ry, color);
    if (collide) this.addCollider(wx, wz, w, d, ry, y + h);
  }

  glow(wx, y, wz, w, h, d, ry, color) {
    this.pools.glow.add(wx, y + h / 2, wz, w, h, d, ry, color);
  }

  cyl(wx, y, wz, r, h, color, collide = false) {
    this.pools.cyl.add(wx, y + h / 2, wz, r, h, r, 0, color);
    if (collide) this.addCollider(wx, wz, r * 2, r * 2, 0, y + h);
  }

  cone(wx, y, wz, r, h, color) {
    this.pools.cone.add(wx, y + h / 2, wz, r, h, r, 0, color);
  }

  roof(wx, y, wz, w, h, d, ry, color) {
    this.pools.roof.add(wx, y, wz, w, h, d, ry, color);
  }

  /** Cylinder lying with its axis along the local x axis (wheels). */
  wheel(wx, cy, wz, r, thick, ry, color) {
    this.pools.cyl.add(wx, cy, wz, r, thick, r, ry, color, 0, Math.PI / 2);
  }

  /** Flat walkable slab (roads, sidewalks, plazas). Registers a ground surface. */
  slab(cx, cz, w, d, y, color) {
    this.box(cx, 0, cz, w, y, d, 0, color, false);
    this.surfaces.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, y });
  }

  finalize() {
    for (const p of Object.values(this.pools)) p.finalize();
  }
}

/**
 * A local coordinate system for a building: position + quarter-turn rotation.
 * Local +z is the "front" of the building.
 */
export class Frame {
  constructor(ctx, cx = 0, cz = 0, quarter = 0) {
    this.ctx = ctx;
    this.cx = cx;
    this.cz = cz;
    this.q = quarter;
    this.ry = (quarter * Math.PI) / 2;
    this.cos = Math.round(Math.cos(this.ry));
    this.sin = Math.round(Math.sin(this.ry));
    this.odd = ((quarter % 2) + 2) % 2 === 1;
  }

  toWorld(lx, lz) {
    return [this.cx + lx * this.cos + lz * this.sin, this.cz - lx * this.sin + lz * this.cos];
  }

  child(lx, lz, dq = 0) {
    const [x, z] = this.toWorld(lx, lz);
    return new Frame(this.ctx, x, z, this.q + dq);
  }

  box(lx, y, lz, w, h, d, color, collide = false) {
    const [x, z] = this.toWorld(lx, lz);
    this.ctx.box(x, y, z, w, h, d, this.ry, color, collide);
  }

  glow(lx, y, lz, w, h, d, color) {
    const [x, z] = this.toWorld(lx, lz);
    this.ctx.glow(x, y, z, w, h, d, this.ry, color);
  }

  cyl(lx, y, lz, r, h, color, collide = false) {
    const [x, z] = this.toWorld(lx, lz);
    this.ctx.cyl(x, y, z, r, h, color, collide);
  }

  cone(lx, y, lz, r, h, color) {
    const [x, z] = this.toWorld(lx, lz);
    this.ctx.cone(x, y, z, r, h, color);
  }

  /** Gable roof. extraQ=1 turns the ridge 90 degrees. */
  roof(lx, y, lz, w, h, d, color, extraQ = 0) {
    const [x, z] = this.toWorld(lx, lz);
    this.ctx.roof(x, y, z, w, h, d, this.ry + (extraQ * Math.PI) / 2, color);
  }

  wheel(lx, cy, lz, r, thick, color) {
    const [x, z] = this.toWorld(lx, lz);
    this.ctx.wheel(x, cy, z, r, thick, this.ry, color);
  }

  slab(lx, lz, w, d, y, color) {
    const [x, z] = this.toWorld(lx, lz);
    this.ctx.slab(x, z, this.odd ? d : w, this.odd ? w : d, y, color);
  }

  /** Invisible collision box (for things whose visuals are many thin parts). */
  collider(lx, lz, w, d, top) {
    const [x, z] = this.toWorld(lx, lz);
    this.ctx.addCollider(x, z, w, d, this.ry, top);
  }
}
