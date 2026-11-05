import * as THREE from 'three';
import { clamp, damp } from './utils.js';

/**
 * Optional realistic NPC characters (GLB / glTF 2.0, skinned, with animation clips).
 *
 * NOTHING here is required: if public/models/npc/manifest.json does not exist (the default), the
 * library stays empty and every NPC uses the procedural character from character.js. When you add
 * models later, no code change is needed: copy the .glb files and list them in the manifest.
 * See public/models/npc/README.md for the exact format.
 *
 * GLTFLoader and SkeletonUtils come with three.js (three/examples/jsm), no extra package. They are
 * imported dynamically, so players without models never download that code.
 *
 * A model instance has the same shape the NPC code expects from a procedural character:
 *   { kind:'glb', root, animator, height, setShadows(on), dispose() }
 * and `animator` follows the animator contract of animation.js (update(dt, loco), state, setTalking,
 * setIdleStyle, reset), so the rest of the NPC code does not care which one it holds.
 * Conventions for the models: feet at y = 0, the character FACES +z (glTF default), real-world scale
 * is not needed (the manifest gives the target height in metres).
 */

const CLIP_ALIASES = {
  idle: /idle|stand|breath/i,
  walk: /walk/i,
  run: /run|jog/i,
  talk: /talk|speak|gestur|chat/i,
};

const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ */
/* Animator for imported clips                                          */
/* ------------------------------------------------------------------ */
export class MixerAnimator {
  /**
   * @param {THREE.Object3D} root the cloned model
   * @param {Record<string, THREE.AnimationClip>} clips idle / walk / run / talk (idle is required)
   * @param {{walkSpeed?:number, runSpeed?:number}} opts metres per second the clips were authored for
   */
  constructor(root, clips, opts = {}) {
    this.mixer = new THREE.AnimationMixer(root);
    this.walkSpeed = opts.walkSpeed ?? 1.4;
    this.runSpeed = opts.runSpeed ?? 3.6;
    this.state = 'idle';
    this.actions = {};
    this.w = { idle: 1, walk: 0, run: 0, talk: 0 };
    this.talkAmp = 0;
    for (const key of ['idle', 'walk', 'run', 'talk']) {
      const clip = clips[key];
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.play();
      a.setEffectiveWeight(key === 'idle' ? 1 : 0);
      a.time = Math.random() * clip.duration;     // not in sync with the other NPCs
      this.actions[key] = a;
    }
  }

  setTalking(amp) { this.talkAmp = clamp(amp, 0, 1); }

  /** Imported rigs have their own idle; style variations are only available on the procedural character. */
  setIdleStyle() {}

  reset() {
    this.w.idle = 1; this.w.walk = 0; this.w.run = 0; this.w.talk = 0;
    this.talkAmp = 0;
    this.state = 'idle';
  }

  update(dt, loco) {
    const speed = loco.turn ? Math.max(loco.speed, Math.min(0.55, Math.abs(loco.turn) * 0.16)) : loco.speed;
    const A = this.actions;
    const moveT = smoothstep(0.25, 1.1, speed);
    const runT = A.run ? smoothstep(this.runSpeed * 0.75, this.runSpeed * 1.05, speed) : 0;
    const talkT = A.talk ? this.talkAmp * (1 - moveT) : 0;
    const tWalk = A.walk ? moveT * (1 - runT) : 0;
    const tRun = moveT * runT;
    const tIdle = Math.max(0, 1 - tWalk - tRun - talkT);

    const w = this.w;
    w.idle = damp(w.idle, tIdle, 10, dt);
    w.walk = damp(w.walk, tWalk, 10, dt);
    w.run = damp(w.run, tRun, 10, dt);
    w.talk = damp(w.talk, talkT, 8, dt);
    const sum = w.idle + w.walk + w.run + w.talk || 1;
    for (const k in A) A[k].setEffectiveWeight(w[k] / sum);

    // feet follow the real speed, so they do not skate
    if (A.walk) A.walk.setEffectiveTimeScale(clamp(speed / this.walkSpeed, 0.5, 1.7));
    if (A.run) A.run.setEffectiveTimeScale(clamp(speed / this.runSpeed, 0.7, 1.4));

    this.mixer.update(dt);
    this.state = w.run > 0.5 ? 'run' : w.walk > 0.4 ? 'walk' : 'idle';
  }
}

/* ------------------------------------------------------------------ */
/* Library                                                               */
/* ------------------------------------------------------------------ */
export class NpcModelLibrary {
  /** @param {string} baseUrl folder that holds manifest.json and the .glb files (ends with "/") */
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.templates = [];
    this.ready = false;
    this._tinted = new Map();
    this._listeners = [];
  }

  /** @param {() => void} fn called once when loading finished (also when nothing was found) */
  onReady(fn) {
    if (this.ready) fn();
    else this._listeners.push(fn);
  }

  get count() { return this.templates.length; }

  async load() {
    try {
      const res = await fetch(`${this.baseUrl}manifest.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`no manifest (${res.status})`);
      const type = res.headers.get('content-type') || '';
      if (type.includes('text/html')) throw new Error('no manifest (dev server fallback page)');
      const json = await res.json();
      const entries = Array.isArray(json?.models) ? json.models : [];
      if (entries.length) {
        const [{ GLTFLoader }, { clone }] = await Promise.all([
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/utils/SkeletonUtils.js'),
        ]);
        this._clone = clone;
        const loader = new GLTFLoader();
        const results = await Promise.allSettled(entries.map((e) => this._loadOne(loader, e)));
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value) this.templates.push(r.value);
          else console.warn(`[npc] model "${entries[i]?.file}" skipped:`, r.reason?.message || 'invalid entry');
        });
      }
    } catch (e) {
      console.info('[npc] no realistic character models installed, using the built-in characters.', e?.message || '');
    }
    this.ready = true;
    for (const fn of this._listeners) fn();
    this._listeners.length = 0;
  }

  async _loadOne(loader, entry) {
    if (!entry || typeof entry.file !== 'string') throw new Error('entry has no "file"');
    const gltf = await loader.loadAsync(`${this.baseUrl}${entry.file}`);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const rawHeight = box.max.y - box.min.y;
    if (!(rawHeight > 0.01)) throw new Error('model has no height');

    // map clip names to roles: explicit names from the manifest first, then name guessing
    const clips = {};
    for (const role of Object.keys(CLIP_ALIASES)) {
      const wanted = entry.clips?.[role];
      clips[role] = (wanted && gltf.animations.find((c) => c.name === wanted))
        || gltf.animations.find((c) => CLIP_ALIASES[role].test(c.name))
        || null;
    }
    if (!clips.idle) clips.idle = gltf.animations[0] || null;
    if (!clips.idle) throw new Error('model has no animation clips (at least an idle clip is needed)');

    const slots = {};
    for (const [slot, src] of Object.entries(entry.materials || {})) {
      try { slots[slot] = new RegExp(src, 'i'); } catch { /* bad pattern: ignore this slot */ }
    }
    return {
      id: entry.id || entry.file,
      entry,
      scene: gltf.scene,
      clips,
      slots,
      baseScale: (entry.height || 1.72) / rawHeight,
      baseY: -box.min.y,
      gender: entry.gender || 'any',
      personas: Array.isArray(entry.personas) ? entry.personas : null,
    };
  }

  /** Models usable for this identity (gender / persona filter), or [] when none. */
  candidates(identity) {
    return this.templates.filter((t) => (t.gender === 'any' || t.gender === identity.gender)
      && (!t.personas || t.personas.includes(identity.persona)));
  }

  /** Build one NPC visual from a template; the identity's colours tint the material slots from the manifest. */
  instantiate(template, identity) {
    const root = new THREE.Group();
    root.name = 'NpcModel';
    const model = this._clone(template.scene);
    const look = identity.look;
    const s = template.baseScale * (look.heightScale ?? 1);
    model.scale.setScalar(s);
    model.position.y = template.baseY * s;
    root.add(model);
    if (look.widthScale && look.widthScale !== 1) root.scale.set(look.widthScale, 1, look.widthScale);

    const colours = { skin: look.skin, hair: look.hair, top: look.shirt, bottom: look.trousers };
    const meshes = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      meshes.push(o);
      o.frustumCulled = true;
      const swap = (mat) => {
        for (const [slot, re] of Object.entries(template.slots)) {
          if (colours[slot] !== undefined && re.test(mat.name || '')) return this._tint(template, mat, slot, colours[slot]);
        }
        return mat;
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });

    const animator = new MixerAnimator(model, template.clips, { walkSpeed: template.entry.walkSpeed, runSpeed: template.entry.runSpeed });
    return {
      kind: 'glb',
      root,
      animator,
      height: template.entry.height || 1.72,
      setShadows: (on) => { for (const m of meshes) m.castShadow = on; },
      dispose: () => {
        animator.mixer.stopAllAction();
        animator.mixer.uncacheRoot(model);
        if (root.parent) root.parent.remove(root);
      },
    };
  }

  _tint(template, mat, slot, hex) {
    const key = `${template.id}|${mat.uuid}|${slot}|${hex}`;
    let m = this._tinted.get(key);
    if (!m) {
      m = mat.clone();
      if (template.entry.tint === 'replace') m.color.set(hex);
      else m.color.multiply(new THREE.Color(hex));
      this._tinted.set(key, m);
    }
    return m;
  }

  dispose() {
    for (const m of this._tinted.values()) m.dispose();
    this._tinted.clear();
    this.templates.length = 0;
  }
}
