import * as THREE from 'three';
import { BoxBatch } from './boxbatch.js';
import { clamp, damp } from './utils.js';

const MAX_FORWARD = 15;      // m/s  (about 54 km/h)
const MAX_BOOST = 19;        // while Run / Shift is held
const MAX_REVERSE = 4;
const ACCEL = 9;
const BRAKE = 22;
const RADIUS = 0.65;         // wider than a doorway: the bike cannot be ridden into a house
const WHEEL_R = 0.34;
const SEAT_OFFSET = -0.2;

/**
 * One lightweight motorcycle: 6 draw calls (frame, headlight, two wheels + a marker each).
 * Simple arcade physics: speed along the heading, a turn rate that shrinks with speed,
 * braking, reverse, drag, a speed limit and wall collisions through the world's collider grid.
 */
export class Motorcycle {
  constructor(world, x, z, yaw) {
    this.world = world;
    this.position = new THREE.Vector3(x, 0, z);
    this.position.y = world.getGroundY(x, z, 0);
    this.yaw = yaw;
    this.speed = 0;
    this.lean = 0;
    this.steer = 0;
    this.wheelAngle = 0;
    this.rider = null;

    this.group = new THREE.Group();
    this.group.name = 'motorcycle';
    this.body = new THREE.Group();            // leans in corners
    this.group.add(this.body);
    this.seatAnchor = new THREE.Group();      // the rider is parented here while riding
    this.seatAnchor.position.set(0, 0.0, SEAT_OFFSET);
    this.body.add(this.seatAnchor);

    this._build();
    this._sync();

    // enter / exit prompt
    const self = this;
    this.interactable = {
      kind: 'vehicle',
      get x() { return self.position.x; },
      get z() { return self.position.z; },
      radius: 2.2,
      get short() { return self.rider ? 'EXIT' : 'RIDE'; },
      label: () => (self.rider ? 'Get off the motorcycle' : 'Ride the motorcycle'),
      available: (p) => !!self.rider || (Math.abs(self.speed) < 0.5 && Math.abs(p.y - self.position.y) < 1.5),
      act: (player, ctx) => (self.rider ? ctx.dismount() : ctx.mount()),
    };
  }

  _build() {
    const b = new BoxBatch();
    const red = 0xc4312f, black = 0x1d1f22, steel = 0x9aa1a8, seat = 0x2a211b;
    b.box(0, 0.42, 0.0, 0.16, 0.2, 1.0, black);               // lower frame / engine
    b.box(0, 0.58, 0.1, 0.34, 0.2, 0.42, red);                // tank
    b.box(0, 0.72, -0.28, 0.3, 0.1, 0.62, seat);              // seat
    b.box(0, 0.5, -0.62, 0.22, 0.34, 0.3, red);               // rear body
    b.box(0, 0.62, -0.88, 0.2, 0.1, 0.22, red);               // tail
    b.box(0.17, 0.3, -0.05, 0.1, 0.1, 0.6, steel);            // exhaust
    b.box(0, 0.62, 0.62, 0.08, 0.7, 0.08, steel, 0);          // fork (visually straight)
    b.box(0, 1.0, 0.5, 0.78, 0.05, 0.06, black);              // handlebar
    b.box(-0.39, 1.0, 0.5, 0.06, 0.06, 0.14, 0x555b61);       // grips
    b.box(0.39, 1.0, 0.5, 0.06, 0.06, 0.14, 0x555b61);
    b.box(0, 0.78, 0.7, 0.2, 0.06, 0.24, red);                // front fender
    b.box(0, 0.78, -0.72, 0.2, 0.06, 0.3, red);               // rear fender
    b.box(-0.2, 0.2, -0.05, 0.08, 0.04, 0.2, steel);          // foot pegs
    b.box(0.2, 0.2, -0.05, 0.08, 0.04, 0.2, steel);
    this.frameMesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.frameMesh.castShadow = true;
    this.body.add(this.frameMesh);

    this.headlight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff4c2 }));
    this.headlight.position.set(0, 0.95, 0.76);
    this.body.add(this.headlight);

    const tire = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.13, 12);
    tire.rotateZ(Math.PI / 2);
    const marker = new THREE.BoxGeometry(0.16, 0.1, 0.1);
    marker.translate(0, WHEEL_R - 0.07, 0);
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1d, flatShading: true });
    const markerMat = new THREE.MeshLambertMaterial({ color: 0xc9ced3, flatShading: true });
    this._shared = [tire, marker, tireMat, markerMat];
    const wheel = (z) => {
      const g = new THREE.Group();
      g.position.set(0, WHEEL_R, z);
      const t = new THREE.Mesh(tire, tireMat); t.castShadow = true;
      g.add(t, new THREE.Mesh(marker, markerMat));
      this.body.add(g);
      return g;
    };
    this.frontWheel = wheel(0.62);
    this.rearWheel = wheel(-0.62);
  }

  get riding() {
    return !!this.rider;
  }

  mount(player) {
    this.rider = player;
    this.speed = 0;
    player.mountedOn = this;
    player.setSeated(true);
    player.object.remove(player.character.root);
    this.seatAnchor.add(player.character.root);
    player.character.root.position.set(0, 0, 0);
    player.character.root.rotation.y = 0;
    player.vx = player.vz = player.vy = 0;
    player.grounded = true;
    this.followRider();
  }

  /** Put the rider back on the ground beside the bike. Returns false if there is no room. */
  dismount() {
    const player = this.rider;
    if (!player) return false;
    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);   // the bike's left-hand side
    const tries = [[1.1, 1], [1.1, -1], [-1.1, 1], [0, 1.6]];
    let spot = null;
    for (const [d, s] of tries) {
      const test = { x: this.position.x + lx * d * s, z: this.position.z + lz * d * s };
      const before = { x: test.x, z: test.z };
      this.world.resolveCollisions(test, player.radius, this.position.y);
      if (Math.hypot(test.x - before.x, test.z - before.z) < 0.05) { spot = test; break; }
    }
    if (!spot) spot = { x: this.position.x + lx * 1.4, z: this.position.z + lz * 1.4 };
    this.seatAnchor.remove(player.character.root);
    player.object.add(player.character.root);
    player.character.root.position.set(0, 0, 0);
    player.setSeated(false);
    player.mountedOn = null;
    player.position.set(spot.x, this.world.getGroundY(spot.x, spot.z, this.position.y), spot.z);
    player.yaw = this.yaw;
    player.character.root.rotation.y = this.yaw;
    player.vx = player.vz = player.vy = 0;
    player.grounded = true;
    this.rider = null;
    this.speed = 0;
    return true;
  }

  /** Keep the rider's invisible "player body" on the bike so the camera and prompts follow. */
  followRider() {
    if (!this.rider) return;
    this.rider.position.copy(this.position);
  }

  update(dt, controls) {
    const axis = controls.getMoveAxis();
    let v = this.speed;
    const vmax = controls.running ? MAX_BOOST : MAX_FORWARD;
    if (this.rider) {
      const throttle = Math.max(0, axis.y), back = Math.max(0, -axis.y);
      if (throttle > 0) v += ACCEL * throttle * Math.max(0.12, 1 - Math.max(0, v) / vmax) * dt;
      if (back > 0) {
        if (v > 0.3) v -= BRAKE * 0.6 * back * dt;               // S brakes while rolling forward ...
        else v -= 5 * back * dt;                                  // ... then reverses
      }
      if (controls.brakeHeld) v -= Math.sign(v) * Math.min(Math.abs(v), BRAKE * dt);   // hand brake
    }
    if (!this.rider || (axis.y === 0 && !controls.brakeHeld)) {   // coasting: rolling resistance + drag
      const drag = (0.9 + 0.1 * Math.abs(v)) * dt;
      v -= Math.sign(v) * Math.min(Math.abs(v), drag);
    }
    v = clamp(v, -MAX_REVERSE, v > MAX_FORWARD ? vmax : MAX_FORWARD);
    if (v > vmax) v = Math.max(vmax, v - 12 * dt);               // letting go of boost eases back to the limit

    // steering: D = right turn (yaw decreases); turning gets gentler with speed and flips in reverse
    const steerIn = this.rider ? axis.x : 0;
    this.steer = damp(this.steer, steerIn, 10, dt);
    const speedFrac = Math.min(1, Math.abs(v) / 8);
    const turnRate = (2.4 / (1 + Math.abs(v) / 9)) * speedFrac;
    this.yaw -= this.steer * turnRate * dt * (v >= 0 ? 1 : -1);

    // move in small sub-steps so a fast bike cannot tunnel through a wall
    const p = this.position;
    const sx = Math.sin(this.yaw), sz = Math.cos(this.yaw);
    const startX = p.x, startZ = p.z;
    const dist = v * dt;
    const steps = Math.max(1, Math.ceil(Math.abs(dist) / 0.25));
    for (let i = 0; i < steps; i++) {
      p.x += (sx * dist) / steps;
      p.z += (sz * dist) / steps;
      this.world.resolveCollisions(p, RADIUS, p.y);
    }
    const achieved = ((p.x - startX) * sx + (p.z - startZ) * sz) / Math.max(dt, 1e-4);
    if (Math.abs(achieved) < Math.abs(v) * 0.6) v = achieved * 0.5;   // hit something: lose most of the speed
    this.speed = v;
    p.y = damp(p.y, this.world.getGroundY(p.x, p.z, p.y), 18, dt);

    this.wheelAngle += (v / WHEEL_R) * dt;
    this.lean = damp(this.lean, steerIn * speedFrac * 0.32, 6, dt);
    this._sync();
    this.followRider();
  }

  _sync() {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    this.body.rotation.z = this.lean;
    this.frontWheel.rotation.x = this.wheelAngle;
    this.rearWheel.rotation.x = this.wheelAngle;
    this.frontWheel.rotation.y = 0;
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    this.frameMesh.geometry.dispose();
    this.frameMesh.material.dispose();
    this.headlight.geometry.dispose();
    this.headlight.material.dispose();
    for (const s of this._shared) s.dispose();
  }
}
