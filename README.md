# DESHTA KAR (দেশটা কার) — Update 06

Bangladesh-inspired low-poly city you can walk around in third person.
Three.js + Vite, ES modules, no external assets, no new dependencies.

## Run it (VS Code, Windows)

1. Install **Node.js LTS** and **VS Code**.
2. `File > Open Folder...` -> the `deshta-kar` folder, then open the terminal (`` Ctrl+` ``).
3. `npm install` (once), then `npm run dev`. The browser opens at http://localhost:5173.
4. Click **Click to play**.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move (relative to the camera) |
| Shift | Run |
| Space | Jump |
| Mouse | Rotate camera |
| Mouse wheel, `-` / `+` | Camera distance |
| F | Cycle FPS limit 30 → 45 → 60 |
| G | Switch Low / Medium graphics |
| Esc | Menu |

The top-right panel always shows **measured FPS, the FPS limit, graphics quality and the
player's movement state** (Idle / Walking / Running / Jumping / Landing). The pause menu
(Esc) has the settings: FPS 30/45/60, Low/Medium graphics, mouse sensitivity, camera height,
camera distance. Everything is remembered in the browser (localStorage).

## Update 06 — Living NPC System 2.0

- **Identities** (`src/npcData.js`, `src/npc.js`): 22 unique local NPCs (ID, name, gender, persona/job, look, speed, dialogue, current activity), stable for the session.
- **Looks** (`src/character.js`): male/female, panjabi, lungi, kameez, saree, hair styles, hijab, prayer cap, beard, heights and widths. The player is unchanged. Identical looks share geometry.
- **Behaviour**: states IDLE, WALKING, TALKING, WAITING, MOVING_TO_DESTINATION. Sidewalk/crossing/market waypoint network, stops at shops, kerbs and the hospital, workers at their posts, friends who meet and chat, lanes, separation and keep-right steering, stuck recovery.
- **Animation** (`src/animation.js`): six idle styles, talking gestures, stepping when turning on the spot, jogging. Imported clips are played by `MixerAnimator` (`src/npcModels.js`).
- **Talk**: walk up to a person, "Talk — Name" appears, press E / tap the TALK button. Next and Close, questions menu, Esc closes (and opens the pause menu). All local, works offline (`src/dialogue.js`, `src/dialogue.css`).
- **Population** (`src/npcPopulation.js`): Low 4-8, Medium 8-16 NPCs (`npc` entry of each preset in `settings.js`), adjusted from the measured frame time with hysteresis. Sleeping NPCs keep their meshes (no create/destroy while playing). Distance LOD: near every frame, farther every 2nd/3rd, hidden ones a few times a second.
- **Realistic models**: none are included. Put licensed `.glb` files in `public/models/npc/` and a `manifest.json` (see `public/models/npc/README.md`). Without them the procedural characters are used.

Modified: character.js, animation.js, npc.js, interaction.js, controls.js, settings.js, main.js, index.html, info.js, package.json. New: npcData.js, npcPopulation.js, npcModels.js, dialogue.js, dialogue.css, public/models/npc/*.

## Update 05 — Realistic city detail + toggle auto-run

**Touch controls**
- **RUN is now a toggle auto-run:** tap once and the character runs forward (relative to the camera) without holding anything; tap again to stop. Touching the joystick cancels auto-run and the stick takes over. The button glows gold, pulses and reads AUTO while active. Walk / run / stop are eased (no snapping). Auto-run is dropped when you get on the motorcycle, pause or return to the lobby.
- Joystick, right-side camera drag and every button already used independent pointer IDs; this was kept and verified with 3 simultaneous touches (stick + camera + Run), releasing one finger never cancels another, and `pointercancel` clears the stick.
- Keyboard and mouse are unchanged (Shift still runs, now eased in over ~0.2 s).

**Graphics (no new textures, no libraries, same draw calls)**
- `src/surfaceDetail.js` (new): a small shader patch on the existing instanced materials adds plaster mottling, damp/dirt at wall bases, asphalt grain, sidewalk paving joints and corrugated-tin ribbing on roofs, plus large-scale lush/dry colour variation on the ground. Fine detail fades out with distance.
- Buildings: window sills, lintels, AC units, cornices and door frames on apartments; door/window frames, eave boards, water drums, stove pipes and washing lines on tin houses; sills, frames, coping, roof band and gate lamps on the middle-class houses.
- Roads/surroundings: lane edge lines, manholes, street trees with brick guards, shrubs along the sidewalks, overhead wires between the utility poles, fuller trees and palms (coconuts).
- Lighting: Khronos neutral tone mapping (soft highlight roll-off, colours preserved).
- All new decoration uses its own random stream (`ctx.detailRng`) so the city layout, vegetation and spawn are exactly as before. Pool usage: boxes 1313 -> 2730 of 6000, cones 186 -> 458 of 800; these are instanced, so draw calls did not change.

Modified: controls.js, mobile.js, mobile.css, player.js, main.js, instancing.js, builders.js, world.js, info.js, package.json. New: surfaceDetail.js.

## Update 04 — Mobile landscape, touch polish, 3D depth

- **Landscape only on phones/tablets:** while the device is upright a full-screen "Please rotate your device" message covers the lobby, the game and every menu, and a running game pauses. Layouts were checked from 568x320 to 1180x820.
- **Fullscreen (always started by a tap):** a button on the touch HUD (next to Pause) and a row in Settings > Performance. It also asks for landscape orientation where the browser allows it. iPhone Safari has no Fullscreen API for web pages, so the button is hidden/disabled there (use Share > Add to Home Screen).
- **Touch HUD:** left floating joystick (analog: a light push walks slowly, full push walks at full speed; RUN toggle runs), right side: JUMP, RUN, WAVE (hand gesture, also key **H** on PC), USE / RIDE (appears near doors, the balcony or the motorcycle). Dragging anywhere else on the right rotates the camera (lightly smoothed). Stick, camera and buttons are independent fingers.
- **No browser interference:** no scrolling, pinch/double-tap zoom, text selection or long-press menu (`touch-action`, `user-select`, cancelled gesture events, `maximum-scale=1`). Safe-area insets (notch, rounded corners, gesture bar) are applied to the buttons and the joystick.
- **3D:** field of view follows the screen shape (about 90 degrees horizontal, 50-66 vertical); a slightly warmer, stronger sun over less flat ambient light; tiling grass texture on the ground (generated, 128 px, no file); soft **contact shadows** under the player, every pedestrian and the motorcycle (one instanced mesh = one draw call, works on Low where sun shadows are off, shrinks while jumping, follows stairs and the hill). The HUD now shows **Draw calls** so you can see the cost on your own PC.
- Keyboard and mouse controls are unchanged. The analog scaling gives the same speed as before for keys.

New file: `src/contactShadow.js`. Modified: index.html, lobby.css, mobile.js, mobile.css, controls.js, player.js, camera.js, world.js, ui.js, icons.js, main.js, package.json and info.js (version 0.4.0).

Update 04 limitations: building/wall textures were not added (instanced boxes would stretch a texture; needs UV work); no post-processing and no new materials; safe-area handling and the orientation lock could not be tested with a real notch phone; FPS and draw-call numbers must be read from the HUD on your own devices (Medium graphics plus shadows is heavier than Low).

## Update 03 — Living City

**Lobby:** the character stands on a hill south of the city wall, the Dhaka-style skyline behind and below.
No platform, no title. Drag to rotate 360 degrees (mouse or touch). Left: smaller profile card (pencil = edit name),
Store, Groups, Updates banner (demo content), Belt button. Right: Real Coin / Diamond, Settings, Mailbox, Friends,
Friends "+" shortcut, PLAY. Entering the game fades out and in (no page reload).

**Phone / tablet controls** (auto-detected; force with `?touch` or `?mouse` in the address):
left stick = move, right side drag = camera, JUMP, RUN (toggle), USE / RIDE appear near a door, the balcony or the motorcycle,
pause button top-left. Stick and camera work at the same time. Keyboard and touch feed one shared input object (`controls.js`).

**Profile:** click the card for a full-screen profile: picture, name (2-16 characters, editable), 8-digit UID
(81000001, 81000002, ... with Copy), level, XP, Like. UID and name persist in localStorage.
`LocalUidService` in `profile.js` is the single place to swap for an atomic Firebase allocation (transaction on a counter);
localStorage can only give uniqueness inside one browser, **not** across devices or players. Likes are local only for now.

**Buildings (walk up, press E / USE):** tin-roof house, ordinary house, brick house with a veranda, and a modern two-storey house
(stairs, upper floor, balcony, furniture, windows). Roofs hide while you are inside. Wave from the balcony with E.

**Motorcycle:** near it press E / RIDE. W/S accelerate/brake-reverse, A/D steer, Space = handbrake, E = get off.
Max 15 m/s (19 with Shift). It does not fit through house doors.

**NPCs:** 6 pedestrians walk sidewalks between fixed destinations, stop, turn, and are skipped when far away.

**Settings** (full screen): Performance (FPS 30/45/60, Low/Medium), Camera (sensitivity, height, distance), Information. Saved on "Save & Close".

State flow: `lobby -> transition -> playing <-> paused -> lobby` (src/gamestate.js).

New files: info.js, profileScreen.js, mobile.js, mobile.css, boxbatch.js, buildings.js, terrain.js, interaction.js, vehicle.js, npc.js, .vscode/tasks.json, .vscode/launch.json.
Rewritten/modified: index.html, lobby.css, lobby.js, lobbyScene.js, modal.js, profile.js, main.js, world.js, player.js, animation.js, character.js, controls.js, icons.js.
Untouched: builders.js, instancing.js, settings.js, camera.js, ui.js, gamestate.js, utils.js.

**VS Code:** `Ctrl+Shift+B` runs the task "Start DESHTA KAR (npm run dev)"; F5 -> "Play in Edge/Chrome" starts it and opens the browser.
Phone preview: use "Phone test layout" or the browser's device toolbar with `?touch`; on a real phone use `npm run dev -- --host` and open the PC's LAN address.

### Update 03 testing checklist
Keyboard walk/run/jump; mouse look; stick + camera together; JUMP/RUN/USE buttons; page never scrolls while playing;
profile open/edit name/copy UID/like/reload keeps UID; each of 4 doors open/enter/exit; stairs up and down; balcony wave (E, cancelled by moving);
ride, steer, brake, reverse, exit; NPCs walk and stop; Settings values survive reload.

### Update 03 limitations
- UID/likes are local, not global (Firebase later). Store, Groups, Mailbox, Friends, Belt panels say "Coming soon".
- Wave only on the balcony; no lip-sync, only blinking eyelids. NPCs stay on sidewalks. House spots are chosen automatically (nearest free ground).
- Stair treads follow a smooth ramp, so feet may slightly clip. Hill/buildings/bike visuals were checked by logic tests, not by looking at them: please report framing or look problems.

## Modified files in this update

New: `settings.js`, `character.js`, `animation.js`, `ui.js`
Modified: `main.js`, `player.js`, `camera.js`, `controls.js`, `world.js`, `instancing.js`, `index.html`
Not touched: `builders.js`, `utils.js`, `package.json`, `vite.config.js` (city, roads, buildings unchanged)

## Project layout

```
src/
  main.js        renderer, game loop, FPS limiter, wiring
  settings.js    FPS limit, Low/Medium presets, camera settings; saved in localStorage
  world.js       sky, lights, city, collision queries, quality application
  builders.js    low-poly buildings and props
  instancing.js  InstancedMesh pools + Frame helper
  character.js   procedural humanoid with named bones, merged meshes, dispose()
  animation.js   Idle / Walk / Run / Jump / Land procedural skeletal animator
  player.js      acceleration, gravity, jump, sub-stepped collision, owns character + animator
  camera.js      smooth orbit camera, wall avoidance, sensitivity / height / distance
  controls.js    keyboard, pointer-lock mouse, wheel, hotkeys (input only, no game logic)
  ui.js          HUD + settings panel bindings
  utils.js       seeded RNG, clamp / damp / lerpAngle
```

## How the FPS limiter works

`requestAnimationFrame` runs at the monitor's refresh rate. The loop keeps a time base and only
does work once a whole frame interval (1000 / limit ms) has passed, advancing the base by exactly
one interval per frame so the long-term rate equals the limit (30 / 45 / 60). Skipped ticks do no
update and no render. Every system uses the measured `deltaTime` (capped at 0.1 s), so walking and
running cover the same distance at any limit, and animation phase follows speed. The FPS number is
frames actually rendered per 0.5 s of wall-clock time. While the menu is open the loop is stopped
and the scene is drawn once.

## Graphics presets

| | Low | Medium |
| --- | --- | --- |
| Resolution cap (devicePixelRatio) | 1.0 | 1.5 (global max is 1.5) |
| Real-time shadows | off | 1024 px map following the player |
| Clouds / distant skyline | off | on |
| Fog distance | 45 – 130 | 80 – 200 |

No post-processing is used. Desktop starts on Medium; phones/tablets start on Low.

## Character, animation and future GLB / FBX / Mixamo

- `createCharacter()` returns `{ root, bones, height, dispose }`; front = +z, feet at y = 0.
  Parts that belong to one bone are merged into a single vertex-coloured mesh sharing one
  material: 14 draw calls per character.
- Animation: each state is a pose function over 24 joint channels; the animator blends them with
  smoothed weights (jump overrides ground states, landing crouch decays back to idle/walk).
- Contract with the player: `animator.update(dt, { speed, grounded, verticalSpeed })` and
  `animator.state`. To use an imported model, build a `{ root, bones, dispose }` from its skeleton
  and call `player.setCharacter(character, animator)`; the old model's GPU geometry is released.
  A Mixamo `AnimationMixer` wrapper only has to expose the same two members.
- Input is isolated in `controls.js` (`getMoveAxis()`, `running`, `wantsJump()`), so a touch
  joystick can later feed the same methods.

## Testing checklist

1. City, roads and buildings load as before.
2. Stand still: idle breathing, legs not moving. WASD: walking; hold Shift: faster run animation.
3. Space: jump pose in the air, then a short landing crouch.
4. Walk into a house, a fence or the boundary wall: you stop / slide; the camera stays in front of walls.
5. Press Esc: set 30, 45, 60 FPS and check the HUD number follows (should read within ~1-2 of the limit; if your monitor is 60 Hz, 60 is the maximum).
6. Switch Low / Medium: shadows and clouds disappear / return.
7. Move the sensitivity, height and distance sliders and resume.

## Known limitations

- 45 FPS on a 60 Hz monitor alternates between 1 and 2 refreshes per frame (slightly uneven
  pacing). 30 and 60 are perfectly even. Movement speed is still correct.
- A browser cannot render faster than the monitor, so 60 is the ceiling on a 60 Hz display.
- Hands are simplified (palm, fingers, thumb); no finger animation.
- Low graphics reduces resolution, shadows, fog distance and extras; it does not swap geometry.
