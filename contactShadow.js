import * as THREE from 'three';

/**
 * Soft "contact" shadows under characters and the motorcycle.
 * ONE InstancedMesh (a single draw call, no matter how many blobs) with one tiny shared gradient
 * texture. It works on Low graphics too, where the sun's shadow map is switched off, and it grounds
 * a character on stairs, slopes and the hill because every blob is laid on the real ground height.
 * A blob shrinks and fades while its owner is in the air.
 */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
const _ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function gradientTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.34)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ContactShadows {
  constructor(scene, capacity = 16) {
    this.capacity = capacity;
    this.count = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.texture = gradientTexture();
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    this.mesh.name = 'contact-shadows';
    scene.add(this.mesh);
    this.scene = scene;
    this._dirty = false;
  }

  /** Reserve a slot. Returns its id. */
  add() {
    if (this.count >= this.capacity) return -1;
    const id = this.count++;
    this.mesh.count = this.count;
    this.mesh.setMatrixAt(id, _ZERO);
    this._dirty = true;
    return id;
  }

  /**
   * @param {number} id  slot from add()
   * @param {number} x @param {number} groundY @param {number} z  point on the ground under the owner
   * @param {number} yaw rotation about Y (long axis = local +z)
   * @param {number} width @param {number} length size in metres
   * @param {number} height how far the owner is above the ground (m): the blob shrinks with it
   */
  set(id, x, groundY, z, yaw, width, length, height = 0) {
    if (id < 0) return;
    const k = 1 - Math.min(Math.max(height, 0) / 2.5, 0.7);
    _p.set(x, groundY + 0.035, z);
    _q.setFromAxisAngle(_UP, yaw);
    _s.set(width * k, 1, length * k);
    this.mesh.setMatrixAt(id, _m.compose(_p, _q, _s));
    this._dirty = true;
  }

  hide(id) {
    if (id < 0) return;
    this.mesh.setMatrixAt(id, _ZERO);
    this._dirty = true;
  }

  /** Call once per frame after all set()/hide() calls. */
  flush() {
    if (!this._dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this._dirty = false;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.mesh.dispose();
  }
}
