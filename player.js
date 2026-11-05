import * as THREE from 'three';
import { damp, lerpAngle } from './utils.js';
import { createCharacter } from './character.js';
import { CharacterAnimator } from './animation.js';

const MAX_STEP = 0.2; // metres per collision sub-step (thinner than any wall, so no tunnelling)

export class Player {
  constructor(world, spawn) {
    this.world = world;
    this.radius = 0.38;
    this.walkSpeed = 4.2;
    this.runSpeed = 8.0;
    this.jumpSpeed = 7.6;
    this.gravity = 22;

    this.spawn = { x: spawn.x, z: spawn.z };
    this.object = new THREE.Group();
    this.position = this.object.position;

    // Visual model + animation. Replace these two lines to use a GLB/FBX character later
    // (anything exposing { root, bones } plus an animator with update(dt, loco)).
    this.character = createCharacter();
    this.animator = new CharacterAnimator(this.character.bones);
    this.object.add(this.character.root);

    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.grounded = true;
    this.yaw = Math.PI; // facing -z, away from the default camera
    this.isRunning = false;
    this.speed = 0;
    this._gait = this.walkSpeed;   // smoothed walk<->run top speed (no sudden jump when Run is tapped)
    this._loco = { speed: 0, grounded: true, verticalSpeed: 0 };

    this.respawn();
  }

  get animationState() {
    return this.animator.state;
  }

  /**
   * Lobby presentation: stand still on the spot, face `yaw`, play the idle animation.
   * No input, physics or collision runs.
   */
  presentIdle(dt, yaw) {
    this.yaw = yaw;
    this.character.root.rotation.y = yaw;
    const loco = this._loco;
    loco.speed = 0;
    loco.grounded = true;
    loco.verticalSpeed = 0;
    this.animator.update(dt, loco);
  }

  /** Put the character at a world position (used for the hilltop lobby). */
  placeAt(x, y, z) {
    this.position.set(x, y, z);
    this.vx = this.vz = this.vy = 0;
    this.grounded = true;
  }

  /** Hand-wave (balcony). Cancelled by moving or jumping. */
  wave() {
    if (this.animator.wave) this.animator.wave(2.8);
  }

  setSeated(on) {
    if (this.animator.setSeated) this.animator.setSeated(on);
  }

  /** While on the motorcycle only the animation runs (the bike moves the player). */
  updateSeated(dt) {
    const loco = this._loco;
    loco.speed = 0;
    loco.grounded = true;
    loco.verticalSpeed = 0;
    this.animator.update(dt, loco);
  }

  /** Back to the spawn point with a clean idle pose (used when returning to the lobby). */
  resetToSpawn() {
    this.respawn();
    this.speed = 0;
    this.isRunning = false;
    if (this.animator.reset) this.animator.reset();
  }

  /**
   * Swap the visual model (e.g. an imported GLB rig). The old character's GPU
   * geometry is released. `animator` must expose update(dt, loco) and .state.
   */
  setCharacter(character, animator) {
    const old = this.character;
    this.object.remove(old.root);
    if (old.dispose) old.dispose();
    this.character = character;
    this.animator = animator;
    this.object.add(character.root);
    character.root.rotation.y = this.yaw;
  }

  dispose() {
    this.object.remove(this.character.root);
    if (this.character.dispose) this.character.dispose();
  }

  respawn() {
    this.position.set(this.spawn.x, 0, this.spawn.z);
    this.position.y = this.world.getGroundY(this.spawn.x, this.spawn.z, 0);
    this.vx = this.vz = this.vy = 0;
    this.grounded = true;
    this.character.root.rotation.y = this.yaw;
  }

  /** camYaw: the camera's orbit yaw. Forward = away from the camera. */
  update(dt, controls, camYaw) {
    const axis = controls.getMoveAxis();
    let ix = axis.x, iz = axis.y;
    const hasInput = ix !== 0 || iz !== 0;
    let dirX = 0, dirZ = 0;
    let analog = 1;                                   // 0..1 stick push; keyboard is always 1
    if (hasInput) {
      const len = Math.hypot(ix, iz);
      analog = Math.min(1, len);
      ix /= len;
      iz /= len;
      const s = Math.sin(camYaw), c = Math.cos(camYaw);
      dirX = -s * iz + c * ix;
      dirZ = -c * iz - s * ix;
    }
    this.isRunning = hasInput && controls.running;
    this._gait = damp(this._gait, this.isRunning ? this.runSpeed : this.walkSpeed, 5, dt);
    const speed = hasInput ? this._gait * Math.max(0.3, analog) : 0;

    // horizontal velocity, smoothed (frame-rate independent); stopping is a little softer than starting
    const lambda = this.grounded ? (hasInput ? 12 : 9) : 3.5;
    this.vx = damp(this.vx, dirX * speed, lambda, dt);
    this.vz = damp(this.vz, dirZ * speed, lambda, dt);

    // move in small sub-steps so a low FPS / long frame can never skip through a wall
    const p = this.position;
    const startX = p.x, startZ = p.z;
    const dx = this.vx * dt, dz = this.vz * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_STEP));
    const sx = dx / steps, sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      p.x += sx;
      p.z += sz;
      this.world.resolveCollisions(p, this.radius, p.y);
    }
    const safeDt = Math.max(dt, 1e-4);
    // velocity actually achieved: sliding along a wall keeps its parallel part, loses the rest
    this.vx = (p.x - startX) / safeDt;
    this.vz = (p.z - startZ) / safeDt;
    const moved = Math.hypot(this.vx, this.vz);

    // vertical movement
    const gy = this.world.getGroundY(p.x, p.z, p.y);
    if (this.grounded) {
      if (controls.wantsJump()) {
        controls.clearJump();
        this.vy = this.jumpSpeed;
        this.grounded = false;
      } else if (gy >= p.y - 0.25) {
        p.y = gy;
      } else {
        this.grounded = false;
        this.vy = 0;
      }
    }
    if (!this.grounded) {
      this.vy -= this.gravity * dt;
      p.y += this.vy * dt;
      const gy2 = this.world.getGroundY(p.x, p.z, p.y);
      if (this.vy <= 0 && p.y <= gy2) {
        p.y = gy2;
        this.vy = 0;
        this.grounded = true;
      }
    }
    if (p.y < -20) this.respawn();

    // face the movement direction
    if (hasInput) {
      const target = Math.atan2(dirX, dirZ);
      this.yaw = lerpAngle(this.yaw, target, 1 - Math.exp(-14 * dt));
    }
    this.character.root.rotation.y = this.yaw;

    // animation: smoothed measured speed drives idle / walk / run, airborne -> jump
    this.speed = damp(this.speed, moved, 15, dt);
    const loco = this._loco;
    loco.speed = this.speed;
    loco.grounded = this.grounded;
    loco.verticalSpeed = this.vy;
    this.animator.update(dt, loco);
  }
}
