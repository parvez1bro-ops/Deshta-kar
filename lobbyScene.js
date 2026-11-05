import * as THREE from 'three';

const LOBBY_FOV = 34;          // fairly narrow lens: portrait-like, but wide enough to show the city
const CHAR_HEIGHT = 1.8;       // metres the framing must contain (body + a little air)
const FILL = 0.6;              // fraction of the stage height the character fills (the rest shows hill + city)
const AZIMUTH = 0.35;          // camera angle around the character (radians); the city is straight behind (north)
const CAMERA_Y = 1.55;         // camera a little above eye level, looking slightly down at the city
const LOOK_Y = 1.0;            // roughly the body's centre
const FACE_OFFSET = -0.25;     // character turns slightly away from the lens (3/4 view)

/**
 * 3D side of the lobby, using the SAME scene, camera, renderer and player as the game:
 *  - frames the existing character in the middle of the stage element,
 *  - stands the character on the summit of the hill south of the city, camera looking north over it,
 *  - adds a warm key light and a cool rim light (intensity 0 outside the lobby),
 *  - pushes the fog back so the city stays crisp (restored when the game starts),
 *  - plays the idle animation and applies the turntable rotation to the character only,
 *    so the gameplay camera is never touched.
 */
export class LobbyScene {
  /**
   * @param {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera, player: object, hill: {x:number,z:number,top:number},
   *           stageEl: HTMLElement, turntable: { angle: number, update(dt:number): void },
   *           restoreFog?: () => void }} o
   */
  constructor({ scene, camera, player, stageEl, turntable, hill = { x: 0, z: 0, top: 0 }, restoreFog = () => {} }) {
    this.hill = hill;
    this.restoreFog = restoreFog;
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.stageEl = stageEl;
    this.turntable = turntable;

    this.fov = LOBBY_FOV;
    this.baseYaw = AZIMUTH + FACE_OFFSET;
    this.yaw = this.baseYaw;
    this.viewOffsetX = 0;
    this.viewOffsetY = 0;
    this.position = new THREE.Vector3();   // camera position in the lobby
    this.look = new THREE.Vector3();       // point the camera looks at
    this.active = false;

    // lights (always in the scene so toggling them never recompiles materials)
    this.key = new THREE.DirectionalLight(0xffe8c8, 0);
    this.rim = new THREE.DirectionalLight(0x9fd8ff, 0);
    this.scene.add(this.key, this.key.target, this.rim, this.rim.target);
  }

  /** Show the lobby presentation. */
  enter() {
    this.active = true;
    this.player.placeAt(this.hill.x, this.hill.top, this.hill.z);
    const p = this.player.position;
    this.key.position.set(p.x - 3.2, p.y + 3.6, p.z + 4.2);
    this.key.target.position.set(p.x, p.y + 0.9, p.z);
    this.rim.position.set(p.x + 3.4, p.y + 2.6, p.z - 4.2);
    this.rim.target.position.set(p.x, p.y + 0.9, p.z);
    this.key.intensity = 1.5;
    this.rim.intensity = 1.2;
    this.setFog(true);
    this.camera.fov = this.fov;
    this.layout();
  }

  /** Back to normal lighting (used when the game starts). */
  leave() {
    this.active = false;
    this.key.intensity = 0;
    this.rim.intensity = 0;
    this.setFog(false);
  }

  /** The lobby wants a clear view of the city; gameplay uses the graphics preset's fog. */
  setFog(on) {
    if (on) {
      const f = this.scene.fog;
      if (f) { f.near = 110; f.far = 340; }
    } else {
      this.restoreFog();
    }
  }

  /**
   * Work out camera distance and the view shift so the whole body fills the stage
   * and sits in its exact centre. Call on enter and whenever the stage / window resizes.
   */
  layout() {
    const W = window.innerWidth, H = window.innerHeight;
    const r = this.stageEl.getBoundingClientRect();
    if (r.height < 40 || W < 1 || H < 1) return;          // lobby hidden: keep the last layout

    const tan = Math.tan((this.fov * Math.PI) / 360);
    const pxPerMetre = (r.height * FILL) / CHAR_HEIGHT;
    const d = Math.min(12, Math.max(3, H / (2 * tan * pxPerMetre)));

    this.viewOffsetX = W / 2 - (r.left + r.width / 2);
    this.viewOffsetY = H / 2 - (r.top + r.height / 2);

    const c = this.player.position;
    this.position.set(c.x + Math.sin(AZIMUTH) * d, c.y + CAMERA_Y, c.z + Math.cos(AZIMUTH) * d);
    this.look.set(c.x, c.y + LOOK_Y, c.z);
    this.apply();
  }

  /** Put the real camera into the lobby pose. */
  apply() {
    const cam = this.camera;
    cam.fov = this.fov;
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.position.copy(this.position);
    cam.lookAt(this.look);
    this.applyViewOffset(1);
  }

  /** scale 1 = full lobby shift, 0 = none (used while gliding into the game). */
  applyViewOffset(scale) {
    const cam = this.camera;
    const W = window.innerWidth, H = window.innerHeight;
    const ox = this.viewOffsetX * scale, oy = this.viewOffsetY * scale;
    if (Math.abs(ox) < 0.5 && Math.abs(oy) < 0.5) cam.clearViewOffset();
    else cam.setViewOffset(W, H, ox, oy, W, H);
    cam.updateProjectionMatrix();
  }

  /** Character rotation + idle animation. Never moves the camera. */
  update(dt) {
    this.turntable.update(dt);
    this.yaw = this.baseYaw + this.turntable.angle;
    this.player.presentIdle(dt, this.yaw);
  }

  dispose() {
    this.scene.remove(this.key, this.key.target, this.rim, this.rim.target);
  }
}
