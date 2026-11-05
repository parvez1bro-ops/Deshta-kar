import * as THREE from 'three';
import { createCharacter } from './character.js';
import { CharacterAnimator, IDLE_STYLE_COUNT } from './animation.js';
import { mulberry32, lerpAngle, damp, clamp } from './utils.js';
import { PopulationController } from './npcPopulation.js';
import { NpcModelLibrary } from './npcModels.js';
import * as D from './npcData.js';

/**
 * Living NPC system.
 *
 *   identities   unique name / look / persona per NPC, generated once from a seed (stable all session)
 *   behaviour    a small state machine: IDLE, WALKING, TALKING, WAITING, MOVING_TO_DESTINATION
 *   navigation   a tiny waypoint network on the sidewalks / crossings / market (npcData.js), plain BFS,
 *                plus the same collision grid the player uses (world.resolveCollisions)
 *   population   how many NPCs are awake follows the graphics preset and the measured frame time
 *                (npcPopulation.js). Sleeping NPCs keep their meshes, so nothing is created or destroyed
 *                while playing.
 *   LOD          near NPCs update every frame, far ones every 2nd / 3rd frame, very far ones are hidden
 *                and only simulated a few times per second
 *   models       procedural characters by default; realistic GLB models are used automatically when
 *                public/models/npc/manifest.json exists (npcModels.js)
 *   interaction  every NPC owns one entry in world.interactables (kind 'npc'), so the existing
 *                Interactions class picks the nearest one and shows "Talk — Name"
 */

export const NPC_STATES = Object.freeze({
  IDLE: 'IDLE', WALKING: 'WALKING', TALKING: 'TALKING', WAITING: 'WAITING', MOVING: 'MOVING_TO_DESTINATION',
});
const S = NPC_STATES;

const NPC_RADIUS = 0.35;
const JOG_SPEED = 3.4;
const ARRIVE_NODE = 0.7;
const ARRIVE_SPOT = 0.22;
const SEPARATION = 1.15;
const TALK_RANGE = 2.2;          // interaction radius (m) for people on the street
const TALK_RANGE_STALL = 3.0;    // workers stand behind a counter
const FAR_START = 9;             // frames-per-update table is built from these distances
const MID_START = 18;
const NEAR_START = 36;

const lighten = (hex, k) => {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const f = (v) => Math.min(255, Math.round(v + (255 - v) * k));
  return (f(r) << 16) | (f(g) << 8) | f(b);
};
const darken = (hex, k) => {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const f = (v) => Math.round(v * (1 - k));
  return (f(r) << 16) | (f(g) << 8) | f(b);
};
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
const between = (rng, a, b) => a + (b - a) * rng();
const angleTo = (dx, dz) => Math.atan2(dx, dz);
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
function shuffled(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ------------------------------------------------------------------ */
/* Identities                                                            */
/* ------------------------------------------------------------------ */
function makeIdentities(rng, count) {
  const male = shuffled(rng, D.MALE_NAMES);
  const female = shuffled(rng, D.FEMALE_NAMES);
  let mi = 0, fi = 0;
  const out = [];
  for (let i = 0; i < count; i++) {
    const slot = D.SLOTS[i % D.SLOTS.length];
    const persona = D.PERSONAS[slot.persona];
    const isF = slot.g === 'f';
    // names are unique: the lists are drawn without repeats (a numeric suffix only if the list ever runs out)
    let name = isF ? female[fi++] : male[mi++];
    if (!name) name = `${(isF ? D.FEMALE_NAMES : D.MALE_NAMES)[i % 10]} ${i}`;

    const garment = pick(rng, persona.garments);
    const look = {
      gender: isF ? 'female' : 'male',
      garment,
      skin: pick(rng, D.SKIN_TONES),
      hair: persona.grey ? D.GREY_HAIR : pick(rng, D.HAIR_COLORS),
      hairStyle: isF ? pick(rng, persona.fHair || ['bun']) : pick(rng, persona.mHair || ['short']),
      moustache: !isF && rng() < (persona.moustache ?? 0.3),
      beard: !isF && rng() < (persona.beard ?? 0),
      cap: !isF && rng() < (persona.cap ?? 0),
      sandals: pick(rng, [0x6b4a2b, 0x2a2a2a, 0x8a6a3b]),
      heightScale: persona.height ? between(rng, persona.height[0], persona.height[1]) : (isF ? between(rng, 0.9, 0.97) : between(rng, 0.97, 1.06)),
      widthScale: isF ? between(rng, 0.9, 0.98) : between(rng, 0.95, 1.08),
    };
    if (isF) {
      const cloth = persona.uniformF ?? pick(rng, D.FEMALE_CLOTH);
      look.shirt = cloth;
      look.shirtTrim = lighten(cloth, 0.25);
      if (garment === 'saree') {
        let sari = pick(rng, D.FEMALE_CLOTH);
        if (sari === cloth) sari = darken(sari, 0.3);
        look.trousers = sari;
        look.gamchha = sari;
      } else {
        look.trousers = pick(rng, D.FEMALE_TROUSERS);
        look.gamchha = pick(rng, D.FEMALE_CLOTH);
      }
    } else {
      look.shirt = persona.uniform ?? (garment === 'panjabi' ? pick(rng, D.MALE_PANJABI) : pick(rng, D.MALE_SHIRTS));
      look.shirtTrim = lighten(look.shirt, 0.22);
      look.trousers = garment === 'lungi' ? pick(rng, D.LUNGI_COLORS) : pick(rng, D.TROUSER_COLORS);
      look.gamchha = persona.gamchha ? pick(rng, D.GAMCHHA_COLORS) : look.shirtTrim;
    }
    look.trouserHem = darken(look.trousers, 0.2);

    const sp = persona.speed;
    out.push({
      id: `npc_${String(i + 1).padStart(3, '0')}`,
      index: i,
      name,
      gender: look.gender,
      persona: slot.persona,
      role: persona.role,
      dialogKey: persona.dialog,
      behavior: slot.behavior,
      home: slot.home || null,
      pairIndex: slot.pair ?? -1,
      hurry: slot.hurry || 0,
      walkSpeed: between(rng, sp[0], sp[1]),
      idleStyles: persona.idle,
      look,
      cacheKey: [look.gender, look.garment, look.skin, look.hair, look.hairStyle, +look.moustache, +look.beard, +look.cap,
        look.shirt, look.trousers, look.gamchha, look.sandals].join('.'),
      activity: '',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Manager                                                               */
/* ------------------------------------------------------------------ */
export class NpcManager {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./world.js').World} world
   * @param {{seed?: number, modelsUrl?: string|null}} opts modelsUrl: folder with manifest.json (null = never look for models)
   */
  constructor(scene, world, { seed = 4242, modelsUrl } = {}) {
    this.scene = scene;
    this.world = world;
    this.rng = mulberry32(seed);
    this.npcs = [];                 // the whole pool, awake or not (main.js sizes the contact shadows from this)
    this.interactables = [];        // one per NPC, main.js appends them to world.interactables
    this.group = new THREE.Group();
    this.group.name = 'npcs';
    scene.add(this.group);

    this.preset = null;
    this.pop = new PopulationController({ min: 6, start: 10, max: 14 });
    this.cull = 50;
    this.pressure = 0;
    this._frame = 0;
    this._actives = [];
    this._geomCache = new Map();
    this._tmp = new THREE.Vector3();
    this._avoid = { x: 0, z: 0 };
    this._wp = { x: 0, z: 0 };
    this._syncClock = 0;
    this._focus = null;
    this.lastRatio = 1;

    this._buildNetwork();
    this._buildPlaces();
    this._validatePlaces();

    const ids = makeIdentities(this.rng, D.NPC_POOL_SIZE);
    for (const identity of ids) this._createRecord(identity);

    // optional realistic models (silently absent by default)
    const base = modelsUrl === undefined ? `${import.meta.env?.BASE_URL || '/'}models/npc/` : modelsUrl;
    this.models = null;
    if (base && typeof fetch === 'function') {
      this.models = new NpcModelLibrary(base);
      this.models.onReady(() => this._upgradeVisuals());
      this.models.load();
    }
  }

  /* ----------------------------- network & places ----------------------------- */

  _buildNetwork() {
    const { nodes, links } = D.buildNetwork();
    this.nodes = nodes.map((n, i) => ({ ...n, idx: i, links: [], jit: n.side !== 0 || n.id.startsWith('ss_') }));
    this.nodeIdx = new Map(this.nodes.map((n) => [n.id, n.idx]));
    for (const [a, b] of links) {
      const ia = this.nodeIdx.get(a), ib = this.nodeIdx.get(b);
      if (ia === undefined || ib === undefined) { console.warn('[npc] bad link', a, b); continue; }
      this.nodes[ia].links.push(ib);
      this.nodes[ib].links.push(ia);
    }
    this.sidewalkNodes = this.nodes.filter((n) => n.side !== 0).map((n) => n.idx);
  }

  _buildPlaces() {
    const id = (s) => {
      const i = this.nodeIdx.get(s);
      if (i === undefined) throw new Error(`[npc] unknown node ${s}`);
      return i;
    };
    this.homes = {};
    for (const [key, h] of Object.entries(D.HOMES)) this.homes[key] = { ...h, node: id(h.node) };
    this.stops = D.STOPS.map((s) => ({
      ...s, node: id(s.node), slots: s.slots.map(([x, z, yaw]) => ({ x, z, yaw, occ: -1 })),
    }));
    this.socials = D.SOCIAL_SPOTS.map((s) => {
      const dx = Math.cos(s.axis), dz = Math.sin(s.axis);
      const a = { x: s.x - dx * 0.55, z: s.z - dz * 0.55 };
      const b = { x: s.x + dx * 0.55, z: s.z + dz * 0.55 };
      a.yaw = angleTo(b.x - a.x, b.z - a.z);
      b.yaw = angleTo(a.x - b.x, a.z - b.z);
      return { ...s, node: id(s.node), a, b, last: -1000 };
    });
  }

  /** Nudge every hand-placed point out of walls / props; drop anything that would have to move far. */
  _validatePlaces() {
    const w = this.world;
    const p = new THREE.Vector3();
    const fix = (o, label) => {
      p.set(o.x, 0, o.z);
      const gy = w.getGroundY(o.x, o.z, 0);
      w.resolveCollisions(p, NPC_RADIUS + 0.05, gy);
      const moved = Math.hypot(p.x - o.x, p.z - o.z);
      if (moved > 0.02) { o.x = p.x; o.z = p.z; }
      if (moved > 1.5) { console.warn(`[npc] ${label} was inside a collider (moved ${moved.toFixed(1)} m)`); return false; }
      return true;
    };
    for (const n of this.nodes) if (n.side === 0) fix(n, `node ${n.id}`);
    for (const h of Object.values(this.homes)) fix(h, 'home');
    for (const s of this.stops) s.slots = s.slots.filter((sl) => fix(sl, `stop ${s.id}`));
    this.stops = this.stops.filter((s) => s.slots.length > 0);
    for (const s of this.socials) { fix(s.a, `social ${s.id}`); fix(s.b, `social ${s.id}`); }
  }

  /** Position of a network node for this NPC (sidewalk nodes depend on the NPC's lane). */
  _nodePos(node, n, out) {
    if (node.side !== 0) {
      out.x = node.x + (node.jit ? n.jx : 0);
      out.z = node.side * (D.LANE_Z[n.lane] + n.jz);
    } else {
      out.x = node.x + (node.jit ? n.jx : 0);
      out.z = node.z;
    }
    return out;
  }

  _nearestNode(x, z) {
    let best = 0, bd = Infinity;
    for (const n of this.nodes) {
      const dz = n.side !== 0 ? n.side * D.LANE_Z[0] - z : n.z - z;
      const d = (n.x - x) * (n.x - x) + dz * dz;
      if (d < bd) { bd = d; best = n.idx; }
    }
    return best;
  }

  _bfs(from, to) {
    if (from === to) return [];
    const prev = new Int16Array(this.nodes.length).fill(-2);
    prev[from] = -1;
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const cur = q[h];
      if (cur === to) break;
      for (const nb of this.nodes[cur].links) {
        if (prev[nb] !== -2) continue;
        prev[nb] = cur;
        q.push(nb);
      }
    }
    if (prev[to] === -2) return null;
    const path = [];
    for (let c = to; c !== from; c = prev[c]) path.push(c);
    return path.reverse();
  }

  /* ----------------------------- records / visuals ----------------------------- */

  _createRecord(identity) {
    const obj = new THREE.Group();
    obj.name = identity.id;
    obj.visible = false;
    this.group.add(obj);
    const home = identity.home ? this.homes[identity.home] : null;
    const n = {
      index: identity.index, id: identity.id, name: identity.name, identity,
      obj, visual: null, glbTemplate: undefined,
      active: false, visible: false,
      state: S.IDLE, timer: 0, activity: '',
      yaw: 0, faceYaw: 0, baseYaw: 0, speed: 0, turnRate: 0, speedOverride: 0,
      lane: 0, jx: 0, jz: 0,
      node: 0, path: [], pi: 0, goal: null, slot: null,
      lookAt: null, glanceT: 1, glanceOff: 0, glanceHold: 0,
      chat: null, converse: false, talkAmp: 0, talkCount: 0,
      stuckT: 0, stuckMoved: 0, stuckN: 0, detourT: 0, detourDir: 1, waitPartnerT: 0, hurrying: false,
      acc: 0, home,
      loco: { speed: 0, grounded: true, verticalSpeed: 0, turn: 0 },
      _last: { x: 0, z: 0 },
    };
    const self = this;
    n.interactable = {
      kind: 'npc',
      short: 'TALK',
      scorePenalty: 0.12,                                     // doors and the motorcycle win a tie
      radius: home ? TALK_RANGE_STALL : TALK_RANGE,
      shortLabel: () => 'TALK',
      get x() { return n.obj.position.x; },
      get z() { return n.obj.position.z; },
      label: () => `Talk — ${n.name}`,
      available: (p) => n.active && n.visible && !n.converse && !self.talkLocked && Math.abs(p.y - n.obj.position.y) < 1.5,
      act: (player, ctx) => { if (ctx && ctx.talk) ctx.talk(n); },
    };
    this.npcs.push(n);
    this.interactables.push(n.interactable);
    return n;
  }

  _buildProceduralVisual(n) {
    const look = n.identity.look;
    const hs = look.heightScale;
    const character = createCharacter(look, {
      lids: false,
      gender: look.gender, garment: look.garment, hairStyle: look.hairStyle,
      moustache: look.moustache, beard: look.beard, cap: look.cap,
      heightScale: hs, widthScale: look.widthScale,
      cache: this._geomCache, cacheKey: n.identity.cacheKey,
    });
    const animator = new CharacterAnimator(character.bones, {
      walkCycle: 2.3 * hs, runCycle: 4.0 * hs, runStartSpeed: 2.6, runFullSpeed: 3.6,
      timeOffset: this.rng() * 40,
    });
    return {
      kind: 'procedural',
      root: character.root,
      animator,
      height: character.height,
      setShadows: (on) => character.root.traverse((o) => { if (o.isMesh) o.castShadow = on; }),
      dispose: () => character.dispose(),
    };
  }

  _ensureVisual(n) {
    if (n.visual) return;
    let visual = null;
    if (this.models && this.models.ready && this.models.count) {
      if (n.glbTemplate === undefined) {
        const list = this.models.candidates(n.identity);
        n.glbTemplate = list.length ? list[n.index % list.length] : null;
      }
      if (n.glbTemplate) {
        try { visual = this.models.instantiate(n.glbTemplate, n.identity); } catch (e) { console.warn('[npc] model failed, using fallback', e); }
      }
    }
    if (!visual) visual = this._buildProceduralVisual(n);
    n.visual = visual;
    n.obj.add(visual.root);
    if (this.preset) visual.setShadows(!!this.preset.shadows);
  }

  /** The model library finished loading: swap procedural characters for realistic ones where a model fits. */
  _upgradeVisuals() {
    if (!this.models || !this.models.count) return;
    for (const n of this.npcs) {
      if (!n.visual || n.visual.kind === 'glb') continue;      // not built yet: _ensureVisual will pick a model itself
      const list = this.models.candidates(n.identity);
      if (!list.length) continue;
      n.glbTemplate = list[n.index % list.length];
      const old = n.visual;
      n.visual = null;
      this._ensureVisual(n);
      n.visual.root.rotation.y = n.yaw;
      old.dispose();
    }
  }

  /* ----------------------------- quality & population ----------------------------- */

  /** Called at start-up and whenever the graphics preset changes. Preset may carry `npc: {min,start,max,cull}`. */
  applyQuality(preset) {
    const first = !this.preset;
    this.preset = preset;
    const key = (preset.label || 'medium').toLowerCase();
    const limits = preset.npc || D.DEFAULT_POPULATION[key] || D.DEFAULT_POPULATION.medium;
    this.limits = limits;
    this.pop.setLimits({ min: limits.min, start: limits.start, max: Math.min(limits.max, this.npcs.length) }, first);
    for (const n of this.npcs) if (n.visual) n.visual.setShadows(!!preset.shadows);
    this._syncPopulation(first, this._focus);
  }

  get activeCount() { return this._actives.length; }

  stats() {
    return { active: this._actives.length, target: this.pop.target, pool: this.npcs.length, ratio: +this.pop.ratio.toFixed(2),
      pressure: this.pop.pressure, ceiling: this.pop.ceiling, visible: this._actives.filter((n) => n.visible).length, cull: Math.round(this.cull) };
  }

  _syncPopulation(initial, focus) {
    const want = this.pop.target;
    while (this._actives.length < want) {
      const n = this.npcs.find((m) => !m.active);
      if (!n) break;
      if (!this._activate(n, initial, focus)) break;
    }
    while (this._actives.length > want) {
      const n = this._pickToRemove(focus);
      if (!n) break;
      this._deactivate(n);
    }
  }

  _pickToRemove(focus) {
    let best = null, bs = -Infinity;
    for (const n of this._actives) {
      if (n.converse) continue;
      let s = n.index * 0.01;
      if (focus) {
        const d = Math.hypot(n.obj.position.x - focus.x, n.obj.position.z - focus.z);
        s += d + (d > this.cull ? 1000 : 0);
      }
      if (s > bs) { bs = s; best = n; }
    }
    return best;
  }

  _activate(n, initial, focus) {
    const id = n.identity;
    const partner = id.pairIndex >= 0 ? this.npcs[id.pairIndex] : null;
    let x, z, yaw = 0;
    let chatAt = null;

    n.lane = this.rng() < 0.5 ? 0 : 1;
    n.jx = between(this.rng, -0.3, 0.3);
    n.jz = between(this.rng, -0.25, 0.25);

    if (n.home) {
      x = n.home.x; z = n.home.z; yaw = n.home.yaw; n.node = n.home.node;
    } else if (id.behavior === 'chatter' && partner && initial && partner.index > n.index && !partner.active && this._actives.length + 2 <= this.pop.target) {
      // a pair that exists from the start: stand at a meeting spot, already chatting (the leader places both)
      const spot = this.socials[(id.index >> 1) % this.socials.length];
      chatAt = { spot, partner };
      x = spot.a.x; z = spot.a.z; yaw = spot.a.yaw; n.node = spot.node;
    } else if (id.behavior === 'chatter' && partner && partner.active && partner.index < n.index) {
      // the partner is already out there: appear next to their place on the network
      x = partner.obj.position.x + 0.9; z = partner.obj.position.z; n.node = partner.node;
    } else {
      // anywhere on the network, but not on top of / in front of the player
      let tries = 0, ok = false;
      const idx = this.sidewalkNodes;
      do {
        const nd = this.nodes[idx[Math.floor(this.rng() * idx.length)]];
        const p = this._nodePos(nd, n, this._wp);
        x = p.x; z = p.z; n.node = nd.idx;
        const far = initial ? 10 : 38;
        const dd = focus ? Math.hypot(x - focus.x, z - focus.z) : far + 1;
        ok = dd >= far && this._spotFree(x, z);
        tries++;
      } while (!ok && tries < 30);
      if (!ok) return false;
      yaw = this.rng() * Math.PI * 2;
    }

    if (!initial && focus && n.home && Math.hypot(x - focus.x, z - focus.z) < 22) return false;   // never pop in front of the player
    if (!n.home) {                                    // make sure nobody appears inside a wall or prop
      const q = this._tmp.set(x, 0, z);
      this.world.resolveCollisions(q, NPC_RADIUS + 0.05, this.world.getGroundY(x, z, 0));
      x = q.x; z = q.z;
    }

    this._ensureVisual(n);
    n.visual.animator.reset();
    n.active = true;
    n.speed = 0; n.turnRate = 0; n.path = []; n.pi = 0; n.goal = null; n.chat = null;
    n.converse = false; n.lookAt = null; n.talkAmp = 0; n.speedOverride = 0; n.stuckT = n.stuckMoved = n.stuckN = 0;
    n.obj.position.set(x, this.world.getGroundY(x, z, 0), z);
    n._last.x = x; n._last.z = z;
    n.yaw = n.faceYaw = n.baseYaw = yaw;
    n.visual.root.rotation.y = yaw;
    n.visible = false; n.obj.visible = false;
    n.acc = 0;
    this._actives.push(n);

    if (chatAt) this._startChatPair(n, chatAt.partner, chatAt.spot, true);
    else this._think(n, true);
    return true;
  }

  _spotFree(x, z) {
    for (const m of this._actives) if (Math.hypot(m.obj.position.x - x, m.obj.position.z - z) < 1.2) return false;
    return true;
  }

  _deactivate(n) {
    this._releaseSlot(n);
    const i = this._actives.indexOf(n);
    if (i >= 0) this._actives.splice(i, 1);
    n.active = false; n.visible = false; n.obj.visible = false;
    n.converse = false; n.chat = null; n.goal = null; n.path = [];
    for (const m of this._actives) if (m.chat && m.chat.partner === n) m.chat = null;   // their chat simply ends
  }

  /* ----------------------------- decisions ----------------------------- */

  _setState(n, state, timer, activity) {
    n.state = state;
    n.timer = timer;
    if (activity !== undefined) { n.activity = activity; n.identity.activity = activity; }
    n.glanceT = between(this.rng, 1.5, 4);
    n.glanceOff = 0;
    n.glanceHold = 0;
    if (state !== S.TALKING && !n.converse) n.lookAt = null;
    const st = n.identity.idleStyles;
    if (state === S.IDLE || state === S.WAITING) {
      const idx = st[Math.floor(this.rng() * st.length)] % IDLE_STYLE_COUNT;
      n.visual && n.visual.animator.setIdleStyle(idx);
    } else if (n.visual) {
      n.visual.animator.setIdleStyle(0);
    }
  }

  _stand(n, yaw, state, seconds, activity) {
    n.path = []; n.pi = 0;
    n.baseYaw = yaw;
    this._setState(n, state, seconds, activity);
  }

  /** Follow `path` (node indices and/or {x,z,yaw} points). */
  _go(n, path, state, activity, goal = null, jog = false) {
    n.path = path; n.pi = 0; n.goal = goal; n.resume = null;
    n.hurrying = jog;
    n.stuckT = n.stuckMoved = n.stuckN = 0;
    this._setState(n, state, 0, activity);
  }

  _think(n, first = false) {
    const id = n.identity;
    const rng = this.rng;
    this._releaseSlot(n);
    n.goal = null;
    n.resume = null;
    n.hurrying = false;
    n.speedOverride = 0;

    if (n.home) {
      const h = n.home;
      const d = Math.hypot(n.obj.position.x - h.x, n.obj.position.z - h.z);
      if (d > 1.2) {
        const path = this._pathTo(n, h.node, { x: h.x, z: h.z, yaw: h.yaw, spot: true });
        if (path) { this._go(n, path, S.MOVING, 'heading back to work', { kind: 'home' }); return; }
      }
      if (rng() < 0.6) this._stand(n, h.yaw, S.IDLE, between(rng, 6, 16), h.label);
      else this._stand(n, h.yaw, S.WAITING, between(rng, 4, 10), 'waiting for customers');
      return;
    }

    if (id.behavior === 'chatter') {
      const partner = this.npcs[id.pairIndex];
      if (partner && partner.active && !partner.converse && !partner.home) {
        if (n.index < partner.index) {                                     // the lower index leads
          const spot = this._pickSocial();
          if (this._sendPair(n, partner, spot)) return;
        } else if (!first) {
          this._stand(n, n.yaw, S.WAITING, between(rng, 1.5, 3.5), 'waiting for ' + partner.name);   // the leader will call
          return;
        }
      }
      // no partner out here: behave like an ordinary walker
    }

    const r = rng();
    if (r < 0.42 || first) {
      const path = this._randomWalk(n, 3 + Math.floor(rng() * 5));
      if (path.length) { this._go(n, path, S.WALKING, 'walking along the road'); return; }
    }
    if (r < 0.80) {
      const stop = this._pickStop();
      if (stop) {
        const slot = stop.slot;
        const path = this._pathTo(n, stop.stop.node, { x: slot.x, z: slot.z, yaw: slot.yaw, spot: true });
        if (path) {
          slot.occ = n.index; n.slot = slot;
          this._go(n, path, S.MOVING, 'heading to ' + stop.stop.where, { kind: 'stop', stop: stop.stop, slot });
          n.goal.label = stop.stop.label;
          return;
        }
      }
    }
    if (r < 0.9 && id.hurry && rng() < 0.7) {
      const far = this.sidewalkNodes[Math.floor(rng() * this.sidewalkNodes.length)];
      const path = this._bfs(n.node, far);
      if (path && path.length > 3) { this._go(n, path, S.MOVING, 'hurrying somewhere', { kind: 'wander' }, true); return; }
    }
    this._stand(n, n.yaw + between(rng, -0.8, 0.8), S.IDLE, between(rng, 2, 6), pick(rng, ['taking a short break', 'looking around', 'checking the time']));
  }

  _pathTo(n, nodeIdx, endPoint) {
    const p = this._bfs(n.node, nodeIdx);
    if (!p) return null;
    if (endPoint) p.push(endPoint);
    return p;
  }

  _randomWalk(n, hops) {
    const out = [];
    let cur = n.node, prev = -1;
    for (let i = 0; i < hops; i++) {
      const opts = this.nodes[cur].links.filter((l) => l !== prev);
      if (!opts.length) break;
      const sidewalk = opts.filter((l) => this.nodes[l].side !== 0);
      const list = sidewalk.length && this.rng() < 0.85 ? sidewalk : opts;
      let nxt = list[Math.floor(this.rng() * list.length)];
      // keep going the same way along a sidewalk most of the time (people do not zig-zag)
      if (prev >= 0 && this.rng() < 0.7) {
        const dir = Math.sign(this.nodes[cur].x - this.nodes[prev].x);
        const same = list.find((l) => Math.sign(this.nodes[l].x - this.nodes[cur].x) === dir && dir !== 0);
        if (same !== undefined) nxt = same;
      }
      out.push(nxt);
      prev = cur; cur = nxt;
    }
    return out;
  }

  _pickStop() {
    const rng = this.rng;
    const list = this.stops.filter((s) => s.slots.some((sl) => sl.occ < 0));
    if (!list.length) return null;
    const stop = list[Math.floor(rng() * list.length)];
    const free = stop.slots.filter((sl) => sl.occ < 0);
    return { stop, slot: free[Math.floor(rng() * free.length)] };
  }

  _releaseSlot(n) {
    if (n.slot) { n.slot.occ = -1; n.slot = null; }
  }

  _pickSocial() {
    let best = null, bs = -1;
    for (const s of this.socials) {
      const score = this.rng() + (this._socialBusy(s) ? -5 : 0) + Math.min(1, (this._frame - s.last) / 3000) * 0.5;
      if (score > bs) { bs = score; best = s; }
    }
    return best;
  }

  _socialBusy(s) {
    for (const m of this._actives) if (m.goal && m.goal.spot === s) return true;
    return false;
  }

  /** Leader and follower both walk to the two sides of a meeting spot. */
  _sendPair(a, b, spot) {
    const pa = this._pathTo(a, spot.node, { x: spot.a.x, z: spot.a.z, yaw: spot.a.yaw, spot: true });
    const pb = this._pathTo(b, spot.node, { x: spot.b.x, z: spot.b.z, yaw: spot.b.yaw, spot: true });
    if (!pa || !pb) return false;
    this._releaseSlot(b);
    spot.last = this._frame;
    const sp = Math.min(a.identity.walkSpeed, b.identity.walkSpeed);
    a.speedOverride = b.speedOverride = sp;
    this._go(a, pa, S.MOVING, 'going to meet ' + b.name, { kind: 'social', spot, side: 'a', partner: b });
    this._go(b, pb, S.MOVING, 'going to meet ' + a.name, { kind: 'social', spot, side: 'b', partner: a });
    a.chat = b.chat = null;
    a.speedOverride = b.speedOverride = sp;
    return true;
  }

  _startChatPair(a, b, spot, teleport = false) {
    const dur = between(this.rng, 14, 34);
    if (teleport) {                                  // game start: place the second person too
      if (!b.active) {
        const ok = this._activateAt(b, spot.b.x, spot.b.z, spot.b.yaw, spot.node);
        if (!ok) { this._think(a, true); return; }
      }
    }
    for (const [m, o] of [[a, b], [b, a]]) {
      m.chat = { partner: o, speaker: m === a, switchT: between(this.rng, 2.5, 5.5) };
      m.goal = { kind: 'social', spot, partner: o };
      this._stand(m, m.yaw, S.TALKING, dur, 'chatting with ' + o.name);
      m.lookAt = o.obj.position;
    }
  }

  _activateAt(n, x, z, yaw, node) {
    n.lane = this.rng() < 0.5 ? 0 : 1;
    n.jx = between(this.rng, -0.3, 0.3);
    n.jz = between(this.rng, -0.25, 0.25);
    this._ensureVisual(n);
    n.visual.animator.reset();
    n.active = true;
    n.speed = 0; n.turnRate = 0; n.path = []; n.pi = 0; n.goal = null; n.chat = null;
    n.converse = false; n.lookAt = null; n.talkAmp = 0; n.speedOverride = 0; n.stuckT = n.stuckMoved = n.stuckN = 0;
    n.node = node;
    n.obj.position.set(x, this.world.getGroundY(x, z, 0), z);
    n._last.x = x; n._last.z = z;
    n.yaw = n.faceYaw = n.baseYaw = yaw;
    n.visual.root.rotation.y = yaw;
    n.visible = false; n.obj.visible = false;
    n.acc = 0;
    this._actives.push(n);
    return true;
  }

  /* ----------------------------- conversation with the player ----------------------------- */

  /** The dialogue opened: stop, face the player, talk. */
  beginConversation(n, focus) {
    n.converse = true;
    n.lookAt = focus;
    n.talkAmp = 1;
    n.talkCount++;
  }

  /** @param {boolean} npcSpeaking true while an NPC line is on screen, false for the player's lines */
  setConversationSpeaker(n, npcSpeaking) {
    n.talkAmp = npcSpeaking ? 1 : 0.25;
  }

  endConversation(n) {
    n.converse = false;
    n.talkAmp = 0;
    n.lookAt = n.chat ? n.chat.partner.obj.position : null;
    n.glanceT = 1.5;
    n.stuckT = n.stuckMoved = n.stuckN = 0;
    if (n.state === S.IDLE || n.state === S.WAITING) n.timer = Math.max(n.timer, 1.2);
  }

  /** Everything the dialogue needs to know about an NPC right now. */
  describe(n) {
    const partner = n.chat ? n.chat.partner : (n.identity.pairIndex >= 0 ? this.npcs[n.identity.pairIndex] : null);
    return {
      id: n.id, name: n.name, role: n.identity.role, gender: n.identity.gender, dialogKey: n.identity.dialogKey,
      activity: n.activity || 'standing here', partner: partner ? partner.name : null, look: n.identity.look,
      talkCount: n.talkCount, index: n.index,
    };
  }

  /* ----------------------------- per-frame ----------------------------- */

  /**
   * @param {number} dt seconds
   * @param {THREE.Vector3} focus the player
   * @param {number} fpsLimit the FPS limit from the settings (used to judge performance)
   */
  update(dt, focus, fpsLimit = 30) {
    this._focus = focus;
    this._frame++;

    // adaptive population: follows the measured frame time (see npcPopulation.js)
    const before = this.pop.target;
    this.pop.update(dt, 1 / Math.max(15, fpsLimit));
    this.lastRatio = this.pop.ratio;
    if (this.pop.pressure !== this.pressure) this.pressure = this.pop.pressure;
    this.cull = (this.limits ? this.limits.cull : 50) * (this.pressure === 0 ? 1 : this.pressure === 1 ? 0.78 : 0.6);
    this._syncClock += dt;
    if (this.pop.target !== before || this._actives.length !== this.pop.target) {
      if (this.pop.target !== before || this._syncClock > 1) { this._syncClock = 0; this._syncPopulation(false, focus); }
    }

    const list = this._actives;
    const cull2 = this.cull * this.cull;
    const extra = this.pressure;                      // under pressure everyone updates a little less often
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const p = n.obj.position;
      const dx = p.x - focus.x, dz = p.z - focus.z;
      const d2 = dx * dx + dz * dz;
      const show = d2 < cull2;
      if (show !== n.visible) { n.visible = show; n.obj.visible = show; }

      let every;
      if (!show) every = 6;
      else if (d2 < MID_START * MID_START) every = 1;
      else if (d2 < NEAR_START * NEAR_START) every = 2;
      else every = 3;
      if (every > 1) every += extra;
      n.acc += dt;
      if (every > 1 && (this._frame + n.index) % every !== 0) continue;
      const step = Math.min(n.acc, 0.3);
      n.acc = 0;
      this._step(n, step, focus);
    }
  }

  _step(n, dt, focus) {
    const p = n.obj.position;
    let wantSpeed = 0;
    let tx = 0, tz = 0, moving = false, isFinal = false;

    if (n.converse) {
      // in a conversation with the player: stand still and face them (logic and timers are paused)
    } else {
      switch (n.state) {
        case S.IDLE:
        case S.WAITING:
          n.timer -= dt;
          this._glance(n, dt, focus);
          if (n.state === S.WAITING && n.goal && n.goal.kind === 'social') this._waitForPartner(n, dt);
          else if (n.timer <= 0) {
            if (n.resume) {                                        // end of a short stop inside a walk: carry on
              n.path = n.resume.path; n.pi = n.resume.pi; n.resume = null;
              this._setState(n, S.WALKING, 0, 'walking along the road');
            } else this._think(n);
          }
          break;
        case S.TALKING:
          this._chat(n, dt);
          break;
        default: {   // WALKING | MOVING
          const item = n.path[n.pi];
          if (item === undefined) { this._arrived(n); break; }
          const w = this._wp;
          if (typeof item === 'number') this._nodePos(this.nodes[item], n, w);
          else { w.x = item.x; w.z = item.z; }
          tx = w.x; tz = w.z;
          const dist = Math.hypot(tx - p.x, tz - p.z);
          const final = typeof item !== 'number';
          if (dist < (final ? ARRIVE_SPOT : ARRIVE_NODE) || (final && dist < 0.9 && n.stuckN > 0)) {
            if (typeof item === 'number') {
              n.node = item;
              n.pi++;
              // walking people stop now and then, then carry on with the same route
              if (n.state === S.WALKING && n.pi < n.path.length && this.rng() < 0.12) {
                const keep = { path: n.path, pi: n.pi };
                this._stand(n, n.yaw + between(this.rng, -0.6, 0.6), S.IDLE, between(this.rng, 1.5, 5), pick(this.rng, ['looking around', 'catching their breath', 'checking a phone']));
                n.resume = keep;
              }
            } else {
              n.pi++;
            }
            break;
          }
          moving = true;
          isFinal = final && dist < 1.6;
        }
      }
    }

    // ---- steering ----
    let heading = n.yaw;
    if (moving) {
      const dx = tx - p.x, dz = tz - p.z;
      const dist = Math.hypot(dx, dz) || 1;
      let vx = dx / dist, vz = dz / dist;
      if (!isFinal) {
        const av = this._avoidance(n, focus);
        vx += av.x; vz += av.z;
      }
      if (n.detourT > 0) {                       // sidestep after being blocked
        n.detourT -= dt;
        const c = Math.cos(1.1 * n.detourDir), s = Math.sin(1.1 * n.detourDir);
        const rx = vx * c - vz * s, rz = vx * s + vz * c;
        vx = rx; vz = rz;
      }
      heading = angleTo(vx, vz);
      const diff = Math.abs(angleDiff(n.yaw, heading));
      const base = n.speedOverride || n.identity.walkSpeed;
      const top = n.hurrying ? JOG_SPEED : base;
      wantSpeed = top * Math.max(0.12, Math.cos(Math.min(diff, 1.4)));
    }
    n.speed = damp(n.speed, wantSpeed, 6, dt);

    // ---- yaw ----
    const prevYaw = n.yaw;
    let aim;
    if (moving) aim = heading;
    else if (n.lookAt) aim = angleTo(n.lookAt.x - p.x, n.lookAt.z - p.z);
    else aim = n.baseYaw + n.glanceOff;
    const rate = moving ? 6 : 4.5;
    n.yaw = lerpAngle(n.yaw, aim, 1 - Math.exp(-rate * dt));
    n.turnRate = damp(n.turnRate, angleDiff(prevYaw, n.yaw) / Math.max(dt, 1e-4), 10, dt);

    // ---- move ----
    if (n.speed > 0.02) {
      const sx = p.x, sz = p.z;
      p.x += Math.sin(n.yaw) * n.speed * dt;
      p.z += Math.cos(n.yaw) * n.speed * dt;
      this.world.resolveCollisions(p, NPC_RADIUS, p.y);
      p.y = damp(p.y, this.world.getGroundY(p.x, p.z, p.y), 15, dt);
      if (moving) this._watchStuck(n, dt, Math.hypot(p.x - sx, p.z - sz));
    } else if (n.visible) {
      p.y = damp(p.y, this.world.getGroundY(p.x, p.z, p.y), 15, dt);
    }

    // ---- animation (only what can be seen) ----
    if (n.visible) {
      const v = n.visual;
      v.root.rotation.y = n.yaw;
      let amp = 0;
      if (n.converse) amp = n.talkAmp;
      else if (n.state === S.TALKING && n.chat) amp = n.chat.speaker ? 1 : 0.3;
      v.animator.setTalking(amp);
      n.loco.speed = n.speed;
      n.loco.turn = n.turnRate;
      v.animator.update(dt, n.loco);
    }
  }

  /** IDLE / WAITING: now and then look somewhere else, at a neighbour or at the player. */
  _glance(n, dt, focus) {
    n.glanceT -= dt;
    if (n.glanceHold > 0) {
      n.glanceHold -= dt;
      if (n.glanceHold <= 0) { n.glanceOff = 0; n.lookAt = null; }
    }
    if (n.glanceT > 0) return;
    n.glanceT = between(this.rng, 2.5, 7);
    const pl = Math.hypot(n.obj.position.x - focus.x, n.obj.position.z - focus.z);
    const r = this.rng();
    if (pl < 7 && r < 0.45) {                                         // somebody came close: look at the player
      n.lookAt = focus; n.glanceHold = between(this.rng, 1.5, 3.5);
      return;
    }
    if (r < 0.7) {                                                    // look at a neighbour (so they sometimes face each other)
      for (const m of this._actives) {
        if (m === n) continue;
        if (Math.hypot(m.obj.position.x - n.obj.position.x, m.obj.position.z - n.obj.position.z) < 4.5) {
          n.lookAt = m.obj.position; n.glanceHold = between(this.rng, 1.5, 3); return;
        }
      }
    }
    n.glanceOff = between(this.rng, -0.9, 0.9);
    n.glanceHold = between(this.rng, 1, 2.5);
  }

  _waitForPartner(n, dt) {
    const g = n.goal;
    const o = g.partner;
    n.waitPartnerT += dt;
    if (o && o.active && !o.home) {
      const there = (o.state === S.WAITING || o.state === S.TALKING) && o.goal && o.goal.spot === g.spot && o.goal.kind === 'social';
      if (there && n.index < o.index) { n.waitPartnerT = 0; this._startChatPair(n, o, g.spot); return; }
      if (there) return;                                               // the leader will start the chat
    }
    if (n.waitPartnerT > 70 || !o || !o.active) { n.waitPartnerT = 0; this._think(n); }
  }

  /** TALKING between two NPCs: take turns "speaking", then walk to another meeting spot together. */
  _chat(n, dt) {
    const c = n.chat;
    const o = c && c.partner;
    if (!o || !o.active || !o.chat || o.chat.partner !== n) {          // partner left: end the chat
      n.chat = null; n.lookAt = null; this._think(n); return;
    }
    if (o.converse) return;                                            // partner is busy with the player: just listen
    n.timer -= dt;
    n.lookAt = o.obj.position;
    if (n.index < o.index) {                                           // the leader runs the schedule for both
      c.switchT -= dt;
      if (c.switchT <= 0) {
        c.speaker = !c.speaker;
        o.chat.speaker = !c.speaker;
        c.switchT = between(this.rng, 2.2, 6);
      }
      if (n.timer <= 0) {
        n.chat = null; o.chat = null;
        n.lookAt = null; o.lookAt = null;
        if (!this._sendPair(n, o, this._pickSocial())) { this._think(n); this._think(o); }
      }
    } else if (n.timer < -8) {                                         // safety: the leader never ended it
      n.chat = null; n.lookAt = null; this._think(n);
    }
  }

  _arrived(n) {
    const g = n.goal;
    const rng = this.rng;
    n.path = []; n.pi = 0; n.hurrying = false;
    if (!g) { this._think(n); return; }
    switch (g.kind) {
      case 'stop': {
        const wait = g.stop.kind === 'roadside';
        this._stand(n, g.slot.yaw, wait ? S.WAITING : S.IDLE, between(rng, 8, 24), g.label);
        n.goal = null;
        break;
      }
      case 'social': {
        const spot = g.spot;
        const side = g.side === 'b' ? spot.b : spot.a;
        n.waitPartnerT = 0;
        this._stand(n, side.yaw, S.WAITING, 80, 'waiting for ' + (g.partner ? g.partner.name : 'a friend'));
        n.goal = g;                                         // keep it: _waitForPartner needs it
        break;
      }
      case 'home':
        this._think(n);
        break;
      default:
        this._think(n);
    }
  }

  /** Soft separation from other NPCs and the player, with a slight keep-right bias when meeting head on. */
  _avoidance(n, focus) {
    const out = this._avoid;
    out.x = 0; out.z = 0;
    const p = n.obj.position;
    const fx = Math.sin(n.yaw), fz = Math.cos(n.yaw);
    const list = this._actives;
    const R = SEPARATION;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m === n) continue;
      if (n.chat && n.chat.partner === m) continue;
      const q = m.obj.position;
      const dx = p.x - q.x, dz = p.z - q.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > R * R || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const w = (R - d) / R;
      out.x += (dx / d) * w * 1.2;
      out.z += (dz / d) * w * 1.2;
      const ahead = -(dx * fx + dz * fz) / d;                            // 1 = directly in front of me
      if (ahead > 0.3) { out.x += -fz * w * 0.9; out.z += fx * w * 0.9; }   // step to my right
    }
    const dx = p.x - focus.x, dz = p.z - focus.z;                        // the player is an obstacle too
    const d2 = dx * dx + dz * dz;
    if (d2 < R * R && d2 > 1e-6) {
      const d = Math.sqrt(d2), w = (R - d) / R;
      out.x += (dx / d) * w * 1.2;
      out.z += (dz / d) * w * 1.2;
    }
    return out;
  }

  /** Blocked by a prop for ~1 s: sidestep; again: re-plan; again: give up and decide something else. */
  _watchStuck(n, dt, moved) {
    n.stuckT += dt;
    n.stuckMoved += moved;
    if (n.stuckT < 1.2) return;
    const expected = n.speed * n.stuckT;
    if (n.stuckMoved < expected * 0.3) {
      n.stuckN++;
      if (n.stuckN === 1) {
        n.detourT = 0.9;
        n.detourDir = this.rng() < 0.5 ? 1 : -1;
      } else if (n.stuckN === 2) {
        const g = n.goal;
        n.node = this._nearestNode(n.obj.position.x, n.obj.position.z);
        if (g && g.kind === 'stop') { this._releaseSlot(n); this._think(n); } else this._think(n);
      } else {
        n.stuckN = 0;
        n.node = this._nearestNode(n.obj.position.x, n.obj.position.z);
        const nd = this.nodes[n.node];
        if (!n.visible) {                                               // far away and wedged: put them back on the sidewalk
          const w = this._nodePos(nd, n, this._wp);
          n.obj.position.set(w.x, this.world.getGroundY(w.x, w.z, 0), w.z);
        }
        this._stand(n, n.yaw, S.IDLE, 1.5, 'looking around');
      }
    } else {
      n.stuckN = Math.max(0, n.stuckN - 1);
    }
    n.stuckT = 0;
    n.stuckMoved = 0;
  }

  dispose() {
    for (const n of this.npcs) {
      if (n.visual) n.visual.dispose();
    }
    for (const g of this._geomCache.values()) g.dispose();
    this._geomCache.clear();
    if (this.models) this.models.dispose();
    this.npcs.length = 0;
    this._actives.length = 0;
    this.scene.remove(this.group);
  }
}
