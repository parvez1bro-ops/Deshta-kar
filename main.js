import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { ThirdPersonCamera } from './camera.js';
import { Controls } from './controls.js';
import { Settings, CAMERA_LIMITS } from './settings.js';
import { ANIM_LABELS } from './animation.js';
import { DEFAULT_OUTFIT } from './character.js';
import { UI } from './ui.js';
import { GameState, STATES } from './gamestate.js';
import { loadProfile } from './profile.js';
import { Modal } from './modal.js';
import { Lobby } from './lobby.js';
import { LobbyScene } from './lobbyScene.js';
import { lerpAngle } from './utils.js';
import { ProfileScreen } from './profileScreen.js';
import { MobileControls, detectTouchMode, fullscreenSupported, isFullscreen, onFullscreenChange, toggleFullscreen, watchPortrait } from './mobile.js';
import { icon } from './icons.js';
import { ContactShadows } from './contactShadow.js';
import { Interactions } from './interaction.js';
import { Motorcycle } from './vehicle.js';
import { NpcManager } from './npc.js';
import { DialogueUI } from './dialogue.js';
import { GAME_VERSION } from './info.js';

const canvas = document.getElementById('game');
const pauseMsg = document.getElementById('pauseMsg');

const settings = new Settings();
const state = new GameState(STATES.LOBBY);

// ---- renderer ----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(0xd6ebf5);
renderer.shadowMap.enabled = true; // kept on; the sun's castShadow is what Low graphics switches off
renderer.shadowMap.type = THREE.PCFShadowMap;
// gentle highlight roll-off that keeps the existing colours (Khronos neutral): sunlit walls and the sun-lit road no longer clip to flat white
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

// ---- scene, camera, world, player (one of each, shared by lobby and gameplay) ----
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.2, 700);
const world = new World(scene, { shadowMapSize: settings.preset.shadowMapSize });

const player = new Player(world, world.spawn);
scene.add(player.object);

const tpc = new ThirdPersonCamera(camera, world, {
  minDistance: CAMERA_LIMITS.distance.min,
  maxDistance: CAMERA_LIMITS.distance.max,
});

/** Push the saved camera settings into the gameplay camera. */
function applyCameraSettings() {
  const c = settings.camera;
  tpc.setSensitivity(c.sensitivity);
  tpc.setHeight(c.height);
  tpc.setDistance(c.distance);
}
applyCameraSettings();
tpc.setAspect(window.innerWidth / window.innerHeight);
camera.fov = tpc.baseFov;
camera.updateProjectionMatrix();
tpc.snapTo(player.position);

/** Apply the current graphics preset: resolution cap + world features. */
function applyGraphics() {
  const preset = settings.preset;
  const ratio = Math.min(window.devicePixelRatio || 1, preset.pixelRatioMax, 1.5);
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  world.applyQuality(preset);
}
applyGraphics();

// ---- UI ----
const ui = new UI(settings, {
  cameraLimits: CAMERA_LIMITS,
  getCameraDistance: () => tpc.desiredDistance,
  stateLabels: ANIM_LABELS,
});
const modal = new Modal(document.getElementById('modal'));
const profile = loadProfile();
let profileScreen = null;
const lobby = new Lobby({
  profile, modal, outfit: DEFAULT_OUTFIT, onPlay: requestPlay,
  onOpenProfile: (opts) => profileScreen.open(opts),
});
profileScreen = new ProfileScreen({
  profile, outfit: DEFAULT_OUTFIT,
  onChange: (p) => lobby.setProfile(p),
  toast: (m) => lobby.toast(m),
  beforeOpen: () => modal.close(),
});
const lobbyScene = new LobbyScene({
  scene, camera, player, stageEl: lobby.stage, turntable: lobby.turntable, hill: world.hill,
  restoreFog: () => world.applyQuality(settings.preset),
});
document.getElementById('gameVersion').textContent = GAME_VERSION;
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  settings.commit();
  modal.close();
  lobby.toast('Settings saved');
});

// ---- living city: motorcycle, pedestrians, interactions ----
const bike = new Motorcycle(world, 6.5, 3.4, Math.PI / 2);
scene.add(bike.group);
world.interactables.push(bike.interactable);
const npcs = new NpcManager(scene, world);
npcs.applyQuality(settings.preset);
world.interactables.push(...npcs.interactables);     // "Talk — Name" uses the same Interactions list as doors and the bike

// soft contact shadows (one draw call): player, motorcycle and every pedestrian
const contact = new ContactShadows(scene, 2 + npcs.npcs.length);
const shPlayer = contact.add();
const shBike = contact.add();
const shNpc = npcs.npcs.map(() => contact.add());
const interactions = new Interactions(world.interactables, {
  el: document.getElementById('prompt'),
  textEl: document.getElementById('promptText'),
});
const interactCtx = {
  player,
  talk: (npc) => dialogue.open(npc),
  mount: () => bike.mount(player),
  dismount: () => bike.dismount(),
};

// CSS shows / hides lobby, HUD, hint and pause menu from this one attribute
document.body.dataset.state = state.current;
state.subscribe((next) => {
  document.body.dataset.state = next;
  lobby.setPlayEnabled(next === STATES.LOBBY);
});

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */
const touchMode = detectTouchMode();       // finger device (or ?touch): on-screen controls instead of pointer lock
const controls = new Controls(canvas, {
  onActiveChange: (active) => {
    if (active) {
      if (state.is(STATES.PAUSED)) resumePlaying();
    } else if (dialogue.isOpen) {
      // the mouse was released on purpose for the dialogue
    } else if (state.is(STATES.PLAYING)) {
      enterPaused();
    } else if (state.is(STATES.TRANSITION)) {
      abortToLobby('Mouse capture was cancelled. Click PLAY to try again.');
    }
  },
  onError: (text) => {
    if (state.is(STATES.TRANSITION)) abortToLobby(text);
    else if (state.is(STATES.PAUSED)) pauseMsg.textContent = text;
    else if (state.is(STATES.PLAYING) && !touchMode) enterPaused();    // could not take the mouse back after a dialogue
    else lobby.toast(text);
  },
  onHotkey: (code) => {
    if (code === 'KeyF') settings.toggleFpsLimit();
    else if (code === 'KeyG') settings.toggleQuality();
  },
});

// ---- NPC conversations ----
// On PC the mouse is released while a dialogue is open (so the buttons can be clicked); closing it with a
// click / key takes the mouse back. Esc closes the dialogue and opens the pause menu.
const dialogue = new DialogueUI({
  npcs, root: document.getElementById('gameRoot'), getFocus: () => player.position,
  onOpen: () => {
    mobile.releaseAll();
    controls.releaseMovement();
    controls.consumeInteract();
    if (!touchMode && document.pointerLockElement) document.exitPointerLock();
  },
  onClose: (reason) => {
    controls.releaseMovement();
    controls.consumeInteract();
    if (!state.is(STATES.PLAYING)) return;
    if (touchMode) return;
    if (reason === 'esc') enterPaused();      // Esc is not a click: the browser would refuse to re-capture the mouse
    else controls.requestLock();
  },
});

const mobile = new MobileControls(controls, { onPause: () => { if (state.is(STATES.PLAYING)) enterPaused(); } });
mobile.setEnabled(touchMode);
tpc.setLookSmoothing(touchMode);

// ---- fullscreen (always started by a tap / click) ----
const fsBtn = document.getElementById('fullscreenBtn');            // Settings > Performance
const fsNote = document.getElementById('fullscreenNote');
const lobbyFsBtn = document.getElementById('lobbyFullscreenBtn');  // lobby, next to Friends
const lobbyFsIcon = lobbyFsBtn.querySelector('.ico');
function refreshFullscreen() {
  const on = isFullscreen();
  const label = on ? 'Exit fullscreen' : 'Enter fullscreen';
  fsBtn.textContent = label;
  lobbyFsIcon.innerHTML = icon(on ? 'fullscreenExit' : 'fullscreen');
  lobbyFsBtn.title = label;
  lobbyFsBtn.setAttribute('aria-label', label);
  lobbyFsBtn.setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('is-fullscreen', on);
}
async function onFullscreenTap() {
  const ok = await toggleFullscreen();   // called straight from the click, so the browser accepts it
  refreshFullscreen();
  if (!ok) lobby.toast('Fullscreen is not available right now.');
}
if (fullscreenSupported()) {
  fsBtn.addEventListener('click', onFullscreenTap);
  lobbyFsBtn.addEventListener('click', onFullscreenTap);
  onFullscreenChange(refreshFullscreen);
  refreshFullscreen();
} else {
  fsBtn.disabled = true;
  lobbyFsBtn.hidden = true;
  fsNote.textContent = 'This browser cannot go fullscreen (iPhone Safari). Use Share → Add to Home Screen for a full-screen app.';
}

// ---- landscape only on touch devices: upright phone = rotate message, game pauses ----
const applyOrientation = watchPortrait(touchMode, (blocked) => {
  if (!blocked) return;
  mobile.releaseAll();
  if (state.is(STATES.PLAYING)) enterPaused();
});

document.getElementById('resumeBtn').addEventListener('click', () => {
  if (touchMode) resumePlaying();
  else controls.requestLock();
});
document.getElementById('pauseSettingsBtn').addEventListener('click', () => modal.open('settings'));
document.getElementById('toLobbyBtn').addEventListener('click', () => enterLobby());

settings.subscribe((_, key) => {
  if (key === 'quality') {
    applyGraphics();
    npcs.applyQuality(settings.preset);
    if (state.is(STATES.LOBBY)) lobbyScene.setFog(true);
    if (!looping) renderOnce();
  } else if (key === 'camera') {
    applyCameraSettings();
  }
  // 'fps' needs nothing: the loop reads settings.fpsLimit every tick
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  tpc.setAspect(camera.aspect);
  if (!state.is(STATES.LOBBY)) camera.fov = tpc.baseFov;   // the lobby keeps its own fixed FOV
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (state.is(STATES.LOBBY)) lobbyScene.layout();
  if (!looping) renderOnce();
});
// the stage (centre of the lobby) changes size with the window / orientation: re-frame the character
new ResizeObserver(() => { if (state.is(STATES.LOBBY)) lobbyScene.layout(); }).observe(lobby.stage);

/* ------------------------------------------------------------------ */
/* Game states                                                         */
/* ------------------------------------------------------------------ */
// Lobby -> game: the screen fades to dark, the character and camera are moved from the hilltop to the
// city (spawn point), then the screen fades back in on the normal third-person view. No page reload.
const TRANSITION_SECONDS = 1.1;
const SWITCH_AT = 0.5;                       // fraction of the transition at which the scene is swapped
const trans = { t: 0, switched: false };
const fadeEl = document.getElementById('fade');

/** Touch devices use the on-screen controls; everything else needs Pointer Lock for mouse look. */
function canPlayHere() {
  if (touchMode) return true;
  return typeof canvas.requestPointerLock === 'function' && window.matchMedia('(any-pointer: fine)').matches;
}

function requestPlay() {
  if (!state.is(STATES.LOBBY)) return;
  if (!canPlayHere()) {
    lobby.toast('This browser cannot capture the mouse. Try Chrome or Edge, or add ?touch to the address for touch controls.', 5000);
    return;
  }
  beginTransition();
  if (!touchMode) controls.requestLock(); // must run inside the click handler (browser rule)
}

function beginTransition() {
  state.set(STATES.TRANSITION);
  modal.close();
  profileScreen.close();
  trans.t = 0;
  trans.switched = false;
  fadeEl.classList.add('on');
}

/** Halfway through the fade: leave the hill, stand at the spawn point, place the gameplay camera. */
function switchToGameScene() {
  trans.switched = true;
  lobbyScene.leave();
  camera.clearViewOffset();
  camera.fov = tpc.baseFov;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  player.resetToSpawn();
  tpc.reset(player.position);
  fadeEl.classList.remove('on');
}

function stepTransition(dt) {
  trans.t = Math.min(1, trans.t + dt / TRANSITION_SECONDS);
  controls.consumeMouse(); // nothing the mouse does during the transition may turn the camera
  controls.consumeWheel();

  if (!trans.switched) {
    lobbyScene.update(dt);                  // the character keeps idling while the screen darkens
    if (trans.t >= SWITCH_AT) switchToGameScene();
  } else {
    player.presentIdle(dt, Math.PI);        // facing away from the camera, ready to walk
    tpc.update(dt, controls, player.position, false);
  }
  if (trans.t >= 1) finishTransition();
}

function finishTransition() {
  if (!trans.switched) switchToGameScene();
  if (!touchMode && !controls.active) {
    abortToLobby('Could not capture the mouse. Click PLAY again.');
    return;
  }
  if (touchMode) controls.active = true;    // touch input is "locked in" for the whole game session
  controls.consumeMouse();
  controls.consumeWheel();
  state.set(STATES.PLAYING);
}

function enterPaused() {
  if (dialogue.isOpen) dialogue.close('pause');
  state.set(STATES.PAUSED);
  stopLoop();
  mobile.releaseAll();                      // no stuck joystick / run toggle while the menu is open
  if (touchMode) controls.active = false;
  interactions.hide();
  pauseMsg.textContent = '';
  ui.setFps(null);
  // the wheel may have changed the distance while playing: store it and show it in the menu
  settings.setCamera('distance', tpc.desiredDistance);
  renderOnce();
}

function resumePlaying() {
  modal.close();
  if (touchMode) controls.active = true;
  state.set(STATES.PLAYING);
  startLoop();
}

/** Show the lobby (first start, "Back to Lobby", or a failed Play). */
function enterLobby() {
  if (dialogue.isOpen) dialogue.close('lobby');
  modal.close();
  profileScreen.close();
  pauseMsg.textContent = '';
  fadeEl.classList.remove('on');
  if (bike.riding) bike.dismount();
  mobile.releaseAll();
  if (touchMode) controls.active = false;
  interactions.hide();
  player.resetToSpawn();
  tpc.reset(player.position);
  camera.clearViewOffset();
  state.set(STATES.LOBBY);
  lobbyScene.enter();                       // puts the character on the hill and frames the camera
  startLoop();
}

function abortToLobby(message) {
  enterLobby();
  lobby.toast(message);
}

// phones: leaving the tab / locking the screen pauses the game (the mouse path pauses through pointer lock)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && touchMode && state.is(STATES.PLAYING)) enterPaused();
});

/* ------------------------------------------------------------------ */
/* Game loop with FPS limiter                                          */
/* ------------------------------------------------------------------ */
// requestAnimationFrame fires at the display's refresh rate (60, 144 ...).
// The limiter keeps a time accumulator: it skips ticks until a full frame interval
// has passed and carries the remainder over, so the average rate matches the limit
// (30 / 45 / 60) without drifting. Skipped ticks do no update and no rendering at all.
// A small tolerance absorbs timer jitter so a 60 Hz display really delivers 60 FPS.
// Note: 45 FPS on a 60 Hz monitor cannot be perfectly even (frames alternate between
// 1 and 2 display refreshes); deltaTime is measured per frame, so speed stays correct.
const TOLERANCE_MS = 2.5;
const MAX_DT = 0.1; // seconds; a long stall (alt-tab) must not teleport the player

let rafId = 0;
let looping = false;
let lastFrame = 0;       // limiter time base (drift-corrected)
let lastRenderTime = 0;  // real time of the previous rendered frame, used for deltaTime
let fpsFrames = 0;
let fpsWindowStart = 0;

function startLoop() {
  if (looping) return;
  looping = true;
  const now = performance.now();
  lastFrame = lastRenderTime = fpsWindowStart = now;
  fpsFrames = 0;
  rafId = requestAnimationFrame(frame);
}

function stopLoop() {
  looping = false;
  cancelAnimationFrame(rafId);
  rafId = 0;
}

function frame(now) {
  if (!looping) return;
  rafId = requestAnimationFrame(frame);

  const interval = 1000 / settings.fpsLimit;
  const elapsed = now - lastFrame;
  if (elapsed < interval - TOLERANCE_MS) return; // too early: do no work at all

  // Advance the time base by exactly one interval, so the long-term rate equals the limit
  // (an early tick accepted via the tolerance is paid back on the next frame).
  // If we fell more than a frame behind (heavy frame, alt-tab), restart the cadence from
  // now instead of rendering several frames in a row to catch up.
  lastFrame += interval;
  if (now - lastFrame >= interval) lastFrame = now;

  const dt = Math.min((now - lastRenderTime) / 1000, MAX_DT);
  lastRenderTime = now;

  switch (state.current) {
    case STATES.LOBBY:
      lobbyScene.update(dt);
      break;
    case STATES.TRANSITION:
      stepTransition(dt);
      break;
    case STATES.PLAYING:
      updatePlaying(dt);
      break;
    default:
      break;
  }
  world.update(dt, player.position, camera);
  updateContactShadows();
  renderer.render(scene, camera);

  // real measured FPS: frames actually rendered per ~0.5 s of wall-clock time
  fpsFrames++;
  const span = now - fpsWindowStart;
  if (span >= 500) {
    ui.setFps(Math.round((fpsFrames * 1000) / span));
    ui.setCalls(renderer.info.render.calls);
    fpsFrames = 0;
    fpsWindowStart = now;
  }
}

let lookIdle = 0;
function updatePlaying(dt) {
  if (dialogue.isOpen) controls.releaseMovement();      // nothing moves the player during a conversation
  controls.update(dt);
  const riding = bike.riding;
  if (riding) {
    controls.setAutoRun(false);          // auto-run is for walking; the bike has its own throttle
    bike.update(dt, controls);
    player.updateSeated(dt);
    // the camera drifts back behind the bike when the player is not looking around
    const m = controls._mouse;
    lookIdle = Math.abs(m.dx) + Math.abs(m.dy) > 0.5 ? 0 : lookIdle + dt;
    if (lookIdle > 1.5 && Math.abs(bike.speed) > 2) tpc.yaw = lerpAngle(tpc.yaw, bike.yaw + (bike.speed >= 0 ? Math.PI : 0), 1 - Math.exp(-1.8 * dt));
  } else {
    player.update(dt, controls, tpc.yaw);
    lookIdle = 0;
  }
  const talking = dialogue.isOpen;
  if (talking) controls.consumeWave();
  if (controls.consumeWave() && !riding) player.wave();      // H key / Hand Gesture button
  tpc.update(dt, controls, player.position, riding ? bike.speed > 12 : player.isRunning);
  npcs.update(dt, player.position, settings.fpsLimit);
  let prompt = null;
  if (talking) {
    controls.consumeInteract();            // E belongs to the dialogue; never start a second conversation
    interactions.hide();
  } else {
    prompt = interactions.update(player, controls, interactCtx, { riding });
  }
  if (touchMode) mobile.setPrompt(prompt);
  ui.setState(player.animationState);
}

/** Lay each contact shadow on the real ground under its owner. */
function updateContactShadows() {
  const p = player.position;
  const onHill = state.is(STATES.LOBBY) || (state.is(STATES.TRANSITION) && !trans.switched);
  if (bike.riding) {
    contact.hide(shPlayer);
  } else {
    const gy = onHill ? p.y : world.getGroundY(p.x, p.z, p.y);
    contact.set(shPlayer, p.x, gy, p.z, player.yaw, 0.95, 0.95, p.y - gy);
  }
  const bp = bike.group.position;
  contact.set(shBike, bp.x, world.getGroundY(bp.x, bp.z, bp.y + 0.3), bp.z, bike.yaw, 0.75, 2.1);
  const list = npcs.npcs;
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n.visible) contact.set(shNpc[i], n.obj.position.x, n.obj.position.y, n.obj.position.z, n.yaw, 0.85, 0.85);
    else contact.hide(shNpc[i]);
  }
  contact.flush();
}

/** One static render, used while paused so nothing keeps running. */
function renderOnce() {
  world.update(0, player.position, camera);
  updateContactShadows();
  renderer.render(scene, camera);
}

// start in the lobby
ui.setFps(null);
ui.setState(player.animationState);
enterLobby();
applyOrientation();

// handy for console debugging during development only
if (import.meta.env?.DEV) window.__deshta = { dialogue, settings, state, player, world, tpc, lobbyScene, renderer, controls, bike, npcs, profile };
