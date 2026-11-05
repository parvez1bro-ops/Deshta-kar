import * as THREE from 'three';
import { clamp, damp } from './utils.js';

const MIN_PITCH = -0.25;
const MAX_PITCH = 1.35;
const MIN_CLEARANCE_DIST = 1.4;           // closest the camera may be pulled to the player
const LIFT_STEPS = [0.25, 0.5, 0.8, 1.1]; // extra pitch tried when a wall is behind the player
const INDOOR_MIN_DIST = 1.2;              // indoor camera may come even closer
const INDOOR_MAX_DIST = 3.2;              // indoor camera never pulls far back
const INDOOR_PITCH_MAX = 0.55;            // indoor camera stays low, never climbs over the roof

/**
 * Third-person orbit camera.
 * - Mouse changes yaw/pitch instantly (no input lag).
 * - The pivot (player's chest) is smoothed with frame-rate independent damping.
 * - Large buildings and walls never sit between the camera and the player: the camera
 *   first rises over the obstacle, and only moves closer if that is not enough, so
 *   the character stays visible.
 * - Distance (wheel, "-" / "+" keys, menu slider), height and mouse sensitivity are adjustable.
 */
export class ThirdPersonCamera {
  constructor(camera, world, {
    distance = 6.5, minDistance = 2.5, maxDistance = 12,
    pivotHeight = 1.5, sensitivity = 0.0025,
  } = {}) {
    this.camera = camera;
    this.world = world;
    this.minDistance = minDistance;
    this.maxDistance = maxDistance;
    this.pivotHeight = pivotHeight;
    this.sensitivity = sensitivity;      // radians per mouse pixel at scale 1
    this.sensitivityScale = 1;           // user setting multiplier (0.4 - 2.5)

    // yaw = angle of the camera around the player; 0 puts the camera on +z looking toward -z
    this.yaw = 0;
    this.pitch = 0.3;
    this.lift = 0;
    this.desiredDistance = distance;
    this.currentDistance = distance;
    this.pivot = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._end = new THREE.Vector3();
    this.baseFov = camera.fov;
    this.lookSmoothing = false;          // touch: spread each finger step over a few frames
    this._pdx = 0;
    this._pdy = 0;
    this.indoor = false;                 // true while the player is inside an enterable house
    this._indoorBlend = 0;               // 0 = outdoor, 1 = indoor (smoothed)
  }

  /**
   * Keep the horizontal field of view near 90 degrees on any screen: a tall 4:3 tablet gets a larger
   * vertical FOV, a very wide 20:9 phone a smaller one, so nothing looks stretched or fish-eyed.
   */
  setAspect(aspect) {
    const v = (2 * Math.atan(1 / Math.max(aspect, 0.5)) * 180) / Math.PI;
    this.baseFov = clamp(v, 50, 66);
  }

  setLookSmoothing(on) {
    this.lookSmoothing = !!on;
    this._pdx = this._pdy = 0;
  }

  setDistance(d) {
    this.desiredDistance = clamp(d, this.minDistance, this.maxDistance);
  }

  /** Multiplier on mouse look speed. */
  setSensitivity(scale) {
    this.sensitivityScale = clamp(scale, 0.1, 5);
  }

  /** Height (m above the feet) the camera orbits around; the pivot eases to it smoothly. */
  setHeight(h) {
    this.pivotHeight = clamp(h, 0.8, 3);
  }

  snapTo(target) {
    this.pivot.set(target.x, target.y + this.pivotHeight, target.z);
    this.currentDistance = this.desiredDistance;
  }

  /** Fresh gameplay view behind the player (used every time the game starts from the lobby). */
  reset(target) {
    this.yaw = 0;
    this.pitch = 0.3;
    this.lift = 0;
    this._pdx = this._pdy = 0;
    this.snapTo(target);
  }

  _setDir(pitch) {
    const cp = Math.cos(pitch);
    this._dir.set(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp);
  }

  /** Free distance along the camera ray for a pitch (before smoothing). */
  _freeDistance(pitch, maxDist = this.desiredDistance) {
    this._setDir(pitch);
    this._end.copy(this.pivot).addScaledVector(this._dir, maxDist);
    const t = this.world.raycastBlockers(this.pivot, this._end);
    if (t >= 1) return maxDist;
    const minD = this.indoor ? INDOOR_MIN_DIST : MIN_CLEARANCE_DIST;
    return clamp(t * maxDist - 0.25, minD, maxDist);
  }

  update(dt, controls, target, running) {
    const m = controls.consumeMouse();
    const k = this.sensitivity * this.sensitivityScale;
    let dx = m.dx, dy = m.dy;
    if (this.lookSmoothing) {
      // frame-rate independent: ~90 % of a finger step is applied within 3 frames at 30 FPS
      this._pdx += dx; this._pdy += dy;
      const f = 1 - Math.exp(-28 * dt);
      dx = this._pdx * f; dy = this._pdy * f;
      this._pdx -= dx; this._pdy -= dy;
    }
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch + dy * k, MIN_PITCH, MAX_PITCH);
    this.desiredDistance = clamp(
      this.desiredDistance + controls.consumeWheel() * 0.01 + controls.getZoomKey() * 6 * dt,
      this.minDistance, this.maxDistance
    );

    // smoothed pivot
    this.pivot.x = damp(this.pivot.x, target.x, 14, dt);
    this.pivot.z = damp(this.pivot.z, target.z, 14, dt);
    this.pivot.y = damp(this.pivot.y, target.y + this.pivotHeight, 9, dt);

    // indoor mode: blend toward a close, low camera so the player never sees through walls
    // and the camera never climbs above the roof. Outdoor behaviour is unchanged.
    this._indoorBlend = damp(this._indoorBlend, this.indoor ? 1 : 0, 6, dt);
    const indoorK = this._indoorBlend;
    const maxDist = this.desiredDistance * (1 - indoorK) + Math.min(this.desiredDistance, INDOOR_MAX_DIST) * indoorK;
    const pitchCap = MAX_PITCH * (1 - indoorK) + INDOOR_PITCH_MAX * indoorK;

    // look for a clear view; if a wall is behind the player, try looking down from higher up
    // (indoors the lift is capped so the camera stays inside the room)
    let free = this._freeDistance(this.pitch, maxDist);
    let wantedLift = 0;
    if (free < maxDist * 0.75) {
      for (let i = 0; i < LIFT_STEPS.length; i++) {
        const p = Math.min(this.pitch + LIFT_STEPS[i], pitchCap);
        const f = this._freeDistance(p, maxDist);
        if (f > free) { free = f; wantedLift = p - this.pitch; }
        if (f >= maxDist * 0.75) break;
      }
    }
    this.lift = damp(this.lift, wantedLift, wantedLift > this.lift ? 9 : 3, dt);

    const pitch = Math.min(this.pitch + this.lift, pitchCap);
    const allowed = this._freeDistance(pitch, maxDist);
    // shrink at once (never see through a wall), grow back smoothly
    if (allowed < this.currentDistance) this.currentDistance = allowed;
    else this.currentDistance = damp(this.currentDistance, allowed, 4, dt);

    this._setDir(pitch);
    const cam = this.camera;
    cam.position.copy(this.pivot).addScaledVector(this._dir, this.currentDistance);
    if (cam.position.y < 0.35) cam.position.y = 0.35;
    cam.lookAt(this.pivot.x, this.pivot.y + 0.1, this.pivot.z);

    // slight FOV kick while running
    const fov = damp(cam.fov, running ? this.baseFov + 6 : this.baseFov, 6, dt);
    if (Math.abs(fov - cam.fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
