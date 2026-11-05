import * as THREE from 'three';

/**
 * Low-poly humanoid, built procedurally (no external assets).
 *
 * RIG CONTRACT (keep this stable so a GLB/GLTF/FBX model can replace the mesh later):
 *   createCharacter() -> {
 *     root,     // THREE.Group, feet at y = 0, FRONT of the character = local +z
 *     bones,    // named THREE.Object3D joints, see BONE_NAMES; all at rest pose = rotation 0
 *     height,   // metres
 *     dispose,  // () => void, frees this character's GPU geometry
 *   }
 * The animator only talks to `bones`. To use an imported model, build the same
 * `bones` dictionary from the model's skeleton (e.g. Mixamo "mixamorigLeftArm" -> upperArmL)
 * and either keep the procedural animator or drive the model with an AnimationMixer.
 *
 * Rendering cost: all the small parts that belong to one bone (e.g. palm + fingers + thumb
 * + forearm + elbow) are merged into ONE mesh with per-vertex colours, and every character
 * shares ONE material. That is 14 draw calls per character instead of ~60.
 */
export const BONE_NAMES = [
  'hips', 'spine', 'neck', 'head',
  'upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
];

export const DEFAULT_OUTFIT = {
  skin: 0xa8734a,
  hair: 0x16110e,
  shirt: 0x3f7ca8,       // casual half-sleeve shirt
  shirtTrim: 0x5b95bd,   // placket / sleeve edge, a lighter tone of the shirt
  trousers: 0x3a3b3d,
  trouserHem: 0x2c2d2f,
  belt: 0x4a3322,
  sandals: 0x6b4a2b,     // chappal
  gamchha: 0xc62828,     // checked cotton scarf, very common in Bangladesh
  eyes: 0x0d0d0d,
};

/* ---------------------------- shared resources ---------------------------- */

// One material for every character (colours live in the vertex data).
let _material = null;
function characterMaterial() {
  if (!_material) _material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return _material;
}

// Primitive shapes are only used as templates that get cloned into the merged mesh.
const _prims = new Map();
function prim(key, make) {
  let g = _prims.get(key);
  if (!g) { g = make(); _prims.set(key, g); }
  return g;
}

/** Top face at y = 0, extends down by h (limb segments pivot at their top). */
const taper = (rTop, rBottom, h, seg = 7) => prim(`taper:${rTop}:${rBottom}:${h}:${seg}`, () => {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1);
  g.translate(0, -h / 2, 0);
  return g;
});
const column = (rTop, rBottom, h, seg = 8) => prim(`column:${rTop}:${rBottom}:${h}:${seg}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1));
const cube = (w, h, d) => prim(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
const ball = (r, ws = 8, hs = 6) => prim(`sphere:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const dome = (r) => prim(`dome:${r}`, () => new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2));
const ring = (r, tube) => prim(`ring:${r}:${tube}`, () => new THREE.TorusGeometry(r, tube, 5, 10));

/** Free the template shapes and the shared material (call on full shutdown only). */
export function disposeSharedCharacterResources() {
  for (const g of _prims.values()) g.dispose();
  _prims.clear();
  if (_material) { _material.dispose(); _material = null; }
}

/* ------------------------------ merge helpers ----------------------------- */

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Merge parts [{geo,color,x,y,z,sx,sy,sz,rx,ry,rz}] into one coloured BufferGeometry. */
function mergeParts(parts) {
  const positions = [], normals = [], colors = [], indices = [];
  let offset = 0;
  for (const p of parts) {
    const g = p.geo.clone();
    _e.set(p.rx, p.ry, p.rz);
    _q.setFromEuler(_e);
    _p.set(p.x, p.y, p.z);
    _s.set(p.sx, p.sy, p.sz);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);

    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const idx = g.getIndex();
    _c.set(p.color);
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      colors.push(_c.r, _c.g, _c.b);
    }
    if (idx) for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
    else for (let i = 0; i < pos.count; i++) indices.push(i + offset);
    offset += pos.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  out.setIndex(indices);
  return out;
}

/* -------------------------------- character -------------------------------- */

/**
 * @param {Partial<typeof DEFAULT_OUTFIT>} outfit
 * @param {object} opts
 *   lids / castShadow       as before
 *   gender                  'male' (default) | 'female'
 *   garment                 'shirt' (default) | 'panjabi' | 'lungi' | 'kameez' | 'saree'
 *   hairStyle               'short' (default) | 'bald' | 'long' | 'bun' | 'hijab'
 *   moustache (default true) / beard (false) / cap (false: white prayer cap)
 *   heightScale / widthScale  body proportions (1 = the player's size)
 *   cache + cacheKey        a Map shared by characters with the SAME look: they then share their geometry
 *                           (no extra GPU memory). The player does not pass these.
 */
export function createCharacter(outfit = {}, opts = {}) {
  const c = { ...DEFAULT_OUTFIT, ...outfit };
  const female = opts.gender === 'female';
  const garment = opts.garment || 'shirt';
  const hairStyle = opts.hairStyle || 'short';
  const longTop = garment === 'panjabi' || garment === 'kameez';

  const root = new THREE.Group();
  root.name = 'CharacterRoot';
  const bones = {};
  const partsByBone = {};

  const joint = (name, parent, x, y, z) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    bones[name] = g;
    partsByBone[name] = [];
    return g;
  };

  /** Add a shape to a bone. o: { sx, sy, sz, rx, ry, rz } */
  const part = (bone, geo, color, x, y, z, o = {}) => {
    partsByBone[bone].push({
      geo, color, x, y, z,
      sx: o.sx ?? 1, sy: o.sy ?? 1, sz: o.sz ?? 1,
      rx: o.rx ?? 0, ry: o.ry ?? 0, rz: o.rz ?? 0,
    });
  };

  // ---------------- hips / pelvis (y = 0.95 m) ----------------
  const hips = joint('hips', root, 0, 0.95, 0);
  part('hips', column(0.165, 0.165, 0.2), c.trousers, 0, 0, 0, { sz: 0.68 });
  part('hips', column(0.17, 0.17, 0.035), c.belt, 0, 0.085, 0, { sz: 0.7 });

  // ---------------- spine / torso ----------------
  const spine = joint('spine', hips, 0, 0.08, 0);
  part('spine', column(0.2, 0.165, 0.44), c.shirt, 0, 0.22, 0, { sz: 0.62 });
  part('spine', column(0.172, 0.19, 0.16), c.shirt, 0, -0.01, 0, { sz: 0.7 });      // untucked hem
  if (longTop) part('spine', column(0.19, 0.235, 0.5), c.shirt, 0, -0.28, 0, { sz: 0.72 });   // panjabi / kameez reaches the knees
  if (garment === 'saree') {
    part('hips', taper(0.185, 0.235, 0.9), c.trousers, 0, 0.0, 0, { sz: 0.8 });                // saree wrapped to the ankles
    part('spine', cube(0.11, 0.5, 0.03), c.trousers, 0.04, 0.2, 0.13, { rz: 0.45 });           // pallu across the chest
    part('spine', cube(0.2, 0.45, 0.03), c.trousers, -0.12, 0.15, -0.13);                       // pallu hanging down the back
  }
  if (female) {
    part('spine', ball(0.065, 6, 4), c.shirt, -0.055, 0.34, 0.1, { sx: 1.2, sy: 0.9 });        // softer chest line
    part('spine', ball(0.065, 6, 4), c.shirt, 0.055, 0.34, 0.1, { sx: 1.2, sy: 0.9 });
  }
  part('spine', cube(0.028, 0.38, 0.012), c.shirtTrim, 0, 0.23, 0.118);              // button placket
  part('spine', cube(0.085, 0.03, 0.05), c.shirtTrim, -0.05, 0.43, 0.075, { rz: 0.5 });  // collar flaps
  part('spine', cube(0.085, 0.03, 0.05), c.shirtTrim, 0.05, 0.43, 0.075, { rz: -0.5 });

  // ---------------- neck + head ----------------
  const neck = joint('neck', spine, 0, 0.44, 0);
  part('neck', column(0.048, 0.054, 0.1, 6), c.skin, 0, 0.03, 0);
  if (garment === 'kameez') {
    part('neck', ring(0.092, 0.03), c.gamchha, 0, -0.01, 0.01, { rx: Math.PI / 2 });               // orna (dupatta)
    part('neck', cube(0.3, 0.1, 0.03), c.gamchha, 0, -0.06, 0.12, { rx: 0.1 });
    part('neck', cube(0.12, 0.55, 0.03), c.gamchha, 0.1, -0.33, 0.11);
  } else if (garment !== 'saree' || !female) {
    part('neck', ring(0.085, 0.03), c.gamchha, 0, -0.01, 0.01, { rx: Math.PI / 2 }); // gamchha scarf
  }

  const head = joint('head', neck, 0, 0.08, 0);
  part('head', ball(0.105), c.skin, 0, 0.105, 0, { sx: 0.88, sy: 1.12, sz: 0.98 });
  part('head', ball(0.075, 7, 5), c.skin, 0, 0.055, 0.012, { sx: 0.95, sy: 0.8, sz: 0.95 }); // jaw
  if (hairStyle === 'short') {
    part('head', dome(0.112), c.hair, 0, 0.14, -0.018, { sx: 0.95, sz: 0.95 });              // hair
    part('head', ball(0.1, 7, 5), c.hair, 0, 0.115, -0.035, { sx: 0.88, sy: 0.95, sz: 0.85 });
  } else if (hairStyle === 'bald') {
    part('head', dome(0.108), c.hair, 0, 0.133, -0.03, { sx: 0.95, sy: 0.35, sz: 0.9 });     // thin hair at the sides only
  } else if (hairStyle === 'hijab') {
    part('head', dome(0.122), c.gamchha, 0, 0.134, -0.012, { sx: 1.0, sy: 1.05, sz: 1.02 });  // head scarf
    part('head', ball(0.115, 7, 5), c.gamchha, 0, 0.09, -0.04, { sx: 0.95, sy: 1.0, sz: 0.85 });
    part('head', cube(0.2, 0.2, 0.1), c.gamchha, 0, -0.02, -0.04);                           // falls over the shoulders
  } else {                                                                                    // 'long' | 'bun'
    part('head', dome(0.114), c.hair, 0, 0.14, -0.012, { sx: 0.97, sz: 0.97 });
    part('head', ball(0.102, 7, 5), c.hair, 0, 0.112, -0.04, { sx: 0.9, sy: 0.95, sz: 0.88 });
    if (hairStyle === 'long') part('head', cube(0.19, 0.4, 0.07), c.hair, 0, -0.04, -0.085);  // hair down the back
    else part('head', ball(0.06, 6, 5), c.hair, 0, 0.15, -0.1);                              // bun
  }
  if (opts.cap) part('head', dome(0.118), 0xf1ede2, 0, 0.158, 0, { sx: 0.95, sy: 0.7, sz: 0.97 });   // white prayer cap (topi)
  part('head', cube(0.03, 0.045, 0.04), c.skin, 0, 0.088, 0.108);                           // nose
  part('head', cube(0.022, 0.022, 0.02), c.eyes, -0.038, 0.118, 0.094);                     // eyes
  part('head', cube(0.022, 0.022, 0.02), c.eyes, 0.038, 0.118, 0.094);
  part('head', cube(0.04, 0.01, 0.012), c.hair, -0.038, 0.145, 0.097);                      // eyebrows
  part('head', cube(0.04, 0.01, 0.012), c.hair, 0.038, 0.145, 0.097);
  if (opts.lids !== false) {
    // eyelids: skin-coloured flaps hanging from the top of each eye; scale.y 0 = open, 1 = closed (blink)
    joint('lids', head, 0, 0.1295, 0);
    part('lids', cube(0.03, 0.026, 0.024), c.skin, -0.038, -0.013, 0.1);
    part('lids', cube(0.03, 0.026, 0.024), c.skin, 0.038, -0.013, 0.1);
  }
  part('head', cube(0.015, 0.04, 0.03), c.skin, -0.092, 0.105, 0);                          // ears
  part('head', cube(0.015, 0.04, 0.03), c.skin, 0.092, 0.105, 0);
  if (!female && opts.moustache !== false) part('head', cube(0.05, 0.012, 0.015), c.hair, 0, 0.055, 0.1);   // moustache
  if (!female && opts.beard) part('head', ball(0.066, 6, 4), c.hair, 0, 0.028, 0.062, { sx: 0.95, sy: 0.9, sz: 0.8 });   // beard
  if (female) part('head', cube(0.026, 0.008, 0.012), 0xa23b3b, 0, 0.056, 0.104);                              // lips

  // ---------------- arms ----------------
  // The character faces +z, so its left-hand side is +x.
  for (const [side, sgn] of [['L', 1], ['R', -1]]) {
    const U = `upperArm${side}`, F = `lowerArm${side}`;
    joint(U, spine, sgn * 0.235, 0.39, 0);
    part(U, ball(0.062, 6, 4), c.shirt, 0, 0, 0);                    // shoulder cap
    part(U, taper(0.05, 0.043, 0.29), c.skin, 0, 0, 0);
    part(U, taper(0.058, 0.056, 0.16), c.shirt, 0, 0.005, 0);        // short sleeve
    part(U, taper(0.06, 0.06, 0.018), c.shirtTrim, 0, -0.145, 0);    // sleeve edge

    joint(F, bones[U], 0, -0.29, 0);
    part(F, ball(0.04, 6, 4), c.skin, 0, 0, 0);                      // elbow
    part(F, taper(0.042, 0.033, 0.26), c.skin, 0, 0, 0);
    // hand: palm, curled fingers, thumb
    part(F, cube(0.07, 0.08, 0.034), c.skin, 0, -0.3, 0);
    part(F, cube(0.066, 0.06, 0.028), c.skin, 0, -0.365, 0.01, { rx: -0.25 });
    part(F, cube(0.02, 0.055, 0.022), c.skin, 0, -0.295, 0.033, { rx: -0.35 });
  }

  // ---------------- legs ----------------
  for (const [side, sgn] of [['L', 1], ['R', -1]]) {
    const T = `thigh${side}`, S = `shin${side}`, Ft = `foot${side}`;
    joint(T, hips, sgn * 0.095, -0.03, 0);
    if (garment === 'lungi') {
      part(T, taper(0.115, 0.104, 0.44), c.trousers, 0, 0, 0);       // lungi: wide cloth to the shin
      joint(S, bones[T], 0, -0.44, 0);
      part(S, taper(0.104, 0.098, 0.22), c.trousers, 0, 0, 0);
      part(S, taper(0.101, 0.103, 0.035), c.trouserHem, 0, -0.2, 0);
      part(S, taper(0.044, 0.04, 0.18), c.skin, 0, -0.22, 0);        // bare lower leg
    } else {
      part(T, taper(0.088, 0.066, 0.44), c.trousers, 0, 0, 0);

      joint(S, bones[T], 0, -0.44, 0);
      part(S, ball(0.068, 6, 4), c.trousers, 0, 0, 0);                 // knee
      part(S, taper(0.066, 0.046, 0.4), c.trousers, 0, 0, 0);
      part(S, taper(0.052, 0.058, 0.07), c.trouserHem, 0, -0.33, 0);   // trouser hem
    }

    joint(Ft, bones[S], 0, -0.4, 0);                                 // ankle: 0.08 m above the ground
    part(Ft, taper(0.04, 0.036, 0.05), c.skin, 0, 0, 0);
    part(Ft, ball(0.05, 6, 4), c.skin, 0, -0.045, 0.05, { sx: 0.95, sy: 0.55, sz: 1.9 });  // foot
    part(Ft, cube(0.1, 0.025, 0.275), c.sandals, 0, -0.0675, 0.06);                         // sole
    part(Ft, cube(0.095, 0.014, 0.04), c.sandals, 0, -0.052, 0.07);                         // strap
  }

  if (bones.lids) bones.lids.scale.y = 0.001;

  // ---------------- build one merged mesh per bone ----------------
  const meshes = [];
  const material = characterMaterial();
  const cache = opts.cache && opts.cacheKey ? opts.cache : null;
  const shared = new Set();
  for (const name of Object.keys(partsByBone)) {
    const ck = cache ? `${opts.cacheKey}|${name}` : null;
    let geometry = ck ? cache.get(ck) : null;
    if (geometry) shared.add(geometry);
    else {
      geometry = mergeParts(partsByBone[name]);
      if (ck) { cache.set(ck, geometry); shared.add(geometry); }
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${name}:mesh`;
    mesh.castShadow = opts.castShadow !== false && name !== 'lids';
    bones[name].add(mesh);
    meshes.push(mesh);
  }

  const hs = opts.heightScale ?? 1, ws = opts.widthScale ?? 1;
  if (hs !== 1 || ws !== 1) root.scale.set(ws, hs, ws);

  return {
    root,
    bones,
    height: 1.77 * hs,
    dispose() {
      for (const m of meshes) {
        if (m.parent) m.parent.remove(m);
        if (!shared.has(m.geometry)) m.geometry.dispose();   // geometry from a shared cache is freed by its owner
      }
      meshes.length = 0;
      if (root.parent) root.parent.remove(root);
    },
  };
}
