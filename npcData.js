/**
 * Local data for the Living NPC System (no network, no Firebase, nothing to download):
 *   - names, personas (job / role), outfits and who is who in the city
 *   - offline dialogue (scripts + topic questions)
 *   - the walking network (sidewalks, zebra crossings, market aisle ...) and the places NPCs use
 *
 * Coordinates are world metres and match world.js:
 *   main road: z -5 .. 5, sidewalks z +-5 .. +-7, side streets at x = -30 and x = 28,
 *   zebra crossings x = -9 and x = 14, market floor x 3..25 / z 8..28, hospital apron z 7..15.
 * Every coordinate is checked against the real colliders when the manager starts (see
 * NpcManager._validateSpots), so a slightly misplaced point is nudged out of a wall, not walked into.
 */

/* ------------------------------------------------------------------ */
/* Population presets (used when settings.js has no `npc` entry)        */
/* ------------------------------------------------------------------ */
export const DEFAULT_POPULATION = {
  low: { min: 4, start: 6, max: 8, cull: 42 },
  medium: { min: 8, start: 12, max: 16, cull: 62 },
  high: { min: 12, start: 16, max: 22, cull: 80 },
};
/** Number of identities generated. Everything above the active count just sleeps (no meshes drawn, no updates). */
export const NPC_POOL_SIZE = 22;

/* ------------------------------------------------------------------ */
/* Names                                                                */
/* ------------------------------------------------------------------ */
export const MALE_NAMES = ['Rahim', 'Karim', 'Sumon', 'Jamal', 'Rafiq', 'Hasan', 'Kamal', 'Abul', 'Nasir', 'Sohel', 'Tarek', 'Mizan',
  'Faruk', 'Babul', 'Shahin', 'Imran', 'Alamgir', 'Monir', 'Liton', 'Masud'];
export const FEMALE_NAMES = ['Salma', 'Fatema', 'Rina', 'Nasrin', 'Shirin', 'Rokeya', 'Jesmin', 'Taslima', 'Moyna', 'Shapla', 'Rubina', 'Farzana'];

/* ------------------------------------------------------------------ */
/* Appearance palettes                                                  */
/* ------------------------------------------------------------------ */
export const SKIN_TONES = [0xc08a5e, 0xa8734a, 0x8d5a34, 0xb27c52, 0x9a6a44, 0xd0a073, 0x7d4e2d, 0xb98258];
export const HAIR_COLORS = [0x16110e, 0x1d140f, 0x2b1d14, 0x3a2a1c];
export const GREY_HAIR = 0x9a9a98;
export const MALE_SHIRTS = [0xb23a3a, 0x2f6f4f, 0xd9a441, 0x5a4a8a, 0x2a6f97, 0x6b7f3a, 0x8a5a3a, 0x3c8a8a, 0xc4764a, 0x556677];
export const MALE_PANJABI = [0xeeeeee, 0xf4efe0, 0xcfe3d8, 0xd7d0e8, 0xe7d8b8, 0x9fb7c9];
export const LUNGI_COLORS = [0xcfc6a8, 0x2c4a7a, 0x5c3b6b, 0x2f6f4f, 0x8a3a3a, 0x3f3f6f];
export const TROUSER_COLORS = [0x3a3b3d, 0x2c3a52, 0x4a3f36, 0x25282b, 0x5a5a52, 0x3b4a3a];
export const FEMALE_CLOTH = [0xd1495b, 0x00798c, 0x7a3b69, 0x2a9d8f, 0xe9c46a, 0xf4a261, 0x6a994e, 0xbc4749, 0x4a6fa5, 0xc25a8c];
export const FEMALE_TROUSERS = [0xeeeeee, 0x3a3b3d, 0xd9c9a8, 0x4a4f6a];
export const GAMCHHA_COLORS = [0xc62828, 0x2a6f97, 0xe0c040, 0x1c6b3c, 0x7a3b3b];

/* ------------------------------------------------------------------ */
/* Personas: role label + look + walking speed + dialogue key            */
/* ------------------------------------------------------------------ */
/**
 * garments: pool for this persona ('shirt' | 'panjabi' | 'lungi' | 'kameez' | 'saree')
 * look: moustache / beard / cap probabilities, hair style pool, grey hair
 */
export const PERSONAS = {
  office:       { role: 'Office worker',  garments: ['shirt'], mHair: ['short'], moustache: 0.35, beard: 0, cap: 0, speed: [1.25, 1.5], idle: [0, 4, 5], dialog: 'office' },
  tea_seller:   { role: 'Tea seller',     garments: ['lungi', 'shirt'], mHair: ['short'], moustache: 0.7, beard: 0.1, cap: 0.2, gamchha: true, speed: [1.0, 1.2], idle: [0, 1, 2], dialog: 'tea' },
  teacher:      { role: 'School teacher', garments: ['panjabi', 'shirt'], mHair: ['short'], moustache: 0.5, beard: 0.1, cap: 0.3, speed: [1.0, 1.2], idle: [0, 1, 4], dialog: 'teacher' },
  elder:        { role: 'Retired clerk',  garments: ['panjabi'], mHair: ['short', 'bald'], moustache: 0.6, beard: 0.7, cap: 0.85, grey: true, height: [0.95, 1.0], speed: [0.75, 0.95], idle: [1, 4, 0], dialog: 'elder' },
  student_f:    { role: 'College student', garments: ['kameez'], fHair: ['long', 'bun'], speed: [1.3, 1.55], idle: [3, 5, 0], dialog: 'student' },
  student_m:    { role: 'University student', garments: ['shirt'], mHair: ['short'], moustache: 0.1, beard: 0, cap: 0, speed: [1.4, 1.65], idle: [5, 3, 0], dialog: 'student' },
  rickshaw:     { role: 'Rickshaw puller', garments: ['lungi'], mHair: ['short'], moustache: 0.6, beard: 0.15, cap: 0.1, gamchha: true, height: [0.95, 1.02], speed: [1.0, 1.2], idle: [0, 1, 2], dialog: 'rickshaw' },
  housewife:    { role: 'Homemaker',      garments: ['saree', 'kameez'], fHair: ['bun', 'hijab'], speed: [0.95, 1.15], idle: [4, 0, 3], dialog: 'homemaker' },
  neighbour_f:  { role: 'Neighbour',      garments: ['kameez', 'saree'], fHair: ['hijab', 'long', 'bun'], speed: [0.95, 1.15], idle: [4, 3, 0], dialog: 'homemaker' },
  vendor:       { role: 'Vegetable seller', garments: ['lungi', 'shirt'], mHair: ['short'], moustache: 0.6, beard: 0.2, cap: 0.3, gamchha: true, speed: [1.0, 1.2], idle: [0, 1, 4], dialog: 'vendor' },
  vendor_f:     { role: 'Fish seller',    garments: ['saree'], fHair: ['bun', 'hijab'], speed: [0.95, 1.1], idle: [3, 4, 0], dialog: 'vendor' },
  fruit_seller: { role: 'Fruit seller',   garments: ['shirt', 'lungi'], mHair: ['short'], moustache: 0.5, beard: 0.1, cap: 0.4, speed: [1.0, 1.2], idle: [0, 1, 4], dialog: 'vendor' },
  guard:        { role: 'Security guard', garments: ['shirt'], mHair: ['short'], moustache: 0.8, beard: 0, cap: 0, height: [1.0, 1.06], uniform: 0x3b4a5a, speed: [1.0, 1.2], idle: [1, 0, 2], dialog: 'guard' },
  nurse:        { role: 'Nurse',          garments: ['kameez'], fHair: ['hijab', 'bun'], speed: [1.3, 1.5], idle: [4, 0, 5], dialog: 'nurse', uniformF: 0xdfeff0 },
  labourer:     { role: 'Day labourer',   garments: ['lungi', 'shirt'], mHair: ['short'], moustache: 0.5, beard: 0.2, cap: 0.2, gamchha: true, speed: [1.2, 1.45], idle: [2, 0, 1], dialog: 'labourer' },
  shopper_f:    { role: 'Shopper',        garments: ['saree', 'kameez'], fHair: ['bun', 'long', 'hijab'], speed: [1.1, 1.3], idle: [4, 0, 5], dialog: 'shopper' },
  driver:       { role: 'Bus driver',     garments: ['shirt'], mHair: ['short'], moustache: 0.7, beard: 0.1, cap: 0.1, speed: [1.1, 1.3], idle: [2, 0, 1], dialog: 'driver' },
  roadside:     { role: 'Commuter',       garments: ['shirt', 'panjabi'], mHair: ['short'], moustache: 0.4, beard: 0.1, cap: 0.1, speed: [1.2, 1.4], idle: [5, 1, 4], dialog: 'commuter' },
  elder_f:      { role: 'Grandmother',    garments: ['saree'], fHair: ['hijab'], grey: true, height: [0.93, 0.98], speed: [0.7, 0.9], idle: [4, 0], dialog: 'grandma' },
  youth:        { role: 'Cricket fan',    garments: ['shirt'], mHair: ['short'], moustache: 0.05, beard: 0, cap: 0, speed: [1.4, 1.7], idle: [3, 5, 2], dialog: 'youth' },
  student_f2:   { role: 'School girl',    garments: ['kameez'], fHair: ['long', 'bun'], height: [0.9, 0.95], speed: [1.35, 1.6], idle: [3, 0, 5], dialog: 'student' },
};

/**
 * Who lives in the pool. The order matters: with N active NPCs the first N slots are used, so every
 * small population still has a mix of workers, chatting friends and walkers.
 * home: a work / waiting place from SPOTS (workers stay near it). pair: slot index of the chat partner.
 */
export const SLOTS = [
  { persona: 'office', g: 'm', behavior: 'walker' },                                  // 0
  { persona: 'tea_seller', g: 'm', behavior: 'worker', home: 'tea_seller' },           // 1
  { persona: 'teacher', g: 'm', behavior: 'chatter', pair: 3 },                        // 2
  { persona: 'elder', g: 'm', behavior: 'chatter', pair: 2 },                          // 3
  { persona: 'student_f', g: 'f', behavior: 'walker' },                                // 4
  { persona: 'rickshaw', g: 'm', behavior: 'worker', home: 'rickshaw_a' },             // 5
  { persona: 'housewife', g: 'f', behavior: 'chatter', pair: 7 },                      // 6
  { persona: 'neighbour_f', g: 'f', behavior: 'chatter', pair: 6 },                    // 7
  { persona: 'vendor', g: 'm', behavior: 'worker', home: 'stall_1' },                  // 8
  { persona: 'student_m', g: 'm', behavior: 'walker', hurry: 0.25 },                   // 9
  { persona: 'guard', g: 'm', behavior: 'worker', home: 'hospital_gate' },             // 10
  { persona: 'labourer', g: 'm', behavior: 'walker' },                                 // 11
  { persona: 'vendor_f', g: 'f', behavior: 'worker', home: 'stall_3' },                // 12
  { persona: 'shopper_f', g: 'f', behavior: 'walker' },                                // 13
  { persona: 'driver', g: 'm', behavior: 'chatter', pair: 15 },                        // 14
  { persona: 'roadside', g: 'm', behavior: 'chatter', pair: 14 },                      // 15
  { persona: 'fruit_seller', g: 'm', behavior: 'worker', home: 'stall_2' },            // 16
  { persona: 'elder_f', g: 'f', behavior: 'walker' },                                  // 17
  { persona: 'nurse', g: 'f', behavior: 'worker', home: 'hospital_side' },             // 18
  { persona: 'youth', g: 'm', behavior: 'walker', hurry: 0.2 },                        // 19
  { persona: 'student_f2', g: 'f', behavior: 'walker', hurry: 0.15 },                  // 20
  { persona: 'roadside', g: 'm', behavior: 'worker', home: 'kerb_a' },                 // 21
];

/* ------------------------------------------------------------------ */
/* Places                                                                */
/* ------------------------------------------------------------------ */
const PI = Math.PI;

/** Work / waiting posts. yaw: 0 faces +z, PI faces -z, PI/2 faces +x, -PI/2 faces -x. */
export const HOMES = {
  tea_seller:    { x: -25.2, z: 10.85, yaw: PI, node: 'T0', label: 'serving tea' },
  rickshaw_a:    { x: -20.8, z: 4.3, yaw: PI, node: 'sw_-16', label: 'waiting for a passenger' },
  stall_1:       { x: 10.5, z: 11.6, yaw: 0, node: 'M0', label: 'selling vegetables' },
  stall_2:       { x: 20.5, z: 11.6, yaw: 0, node: 'M0', label: 'selling fruit' },
  stall_3:       { x: 15.5, z: 22.4, yaw: PI, node: 'M1', label: 'selling fish' },
  hospital_gate: { x: -9, z: 12.5, yaw: 0, node: 'H3', label: 'guarding the hospital gate' },
  hospital_side: { x: -13.5, z: 11.2, yaw: 0, node: 'H1', label: 'on a break outside the hospital' },
  kerb_a:        { x: 22, z: 5.45, yaw: PI, node: 'sw_22', label: 'waiting for a bus' },
};

/** Places walkers like to stop at. slots = standing positions, kind decides the idle activity text. */
export const STOPS = [
  { id: 'tea_front', where: 'the tea stall', kind: 'shop', node: 'T0', label: 'having tea', slots: [[-24.9, 8.6, 0], [-26.3, 8.6, 0], [-27.6, 8.9, 0.3]] },
  { id: 'veg_front', where: 'the market', kind: 'shop', node: 'M1', label: 'shopping at the market', slots: [[10.5, 14.6, PI], [5.5, 14.6, PI]] },
  { id: 'fruit_front', where: 'the market', kind: 'shop', node: 'M4', label: 'buying fruit', slots: [[20.5, 14.6, PI], [15.5, 14.6, PI]] },
  { id: 'fish_front', where: 'the market', kind: 'shop', node: 'M1', label: 'buying fish', slots: [[15.5, 19.5, 0], [10.5, 19.5, 0]] },
  { id: 'veg_back', where: 'the market', kind: 'shop', node: 'M2', label: 'shopping at the market', slots: [[5.5, 19.5, 0], [20.5, 19.5, 0]] },
  { id: 'kerb_w', where: 'the crossing', kind: 'roadside', node: 'sw_-16', label: 'waiting to cross the road', slots: [[-11.4, 5.45, PI], [-12.4, 5.45, PI]] },
  { id: 'kerb_e', where: 'the crossing', kind: 'roadside', node: 'sw_14', label: 'waiting to cross the road', slots: [[11.8, 5.45, PI], [12.8, 5.45, PI]] },
  { id: 'kerb_n', where: 'the crossing', kind: 'roadside', node: 'nw_14', label: 'waiting to cross the road', slots: [[11.8, -5.45, 0], [16.4, -5.45, 0]] },
  { id: 'kerb_far', where: 'the bus stop', kind: 'roadside', node: 'sw_52', label: 'looking out for a bus', slots: [[56, 5.45, PI], [57.2, 5.45, PI]] },
  { id: 'hospital', where: 'the hospital', kind: 'plaza', node: 'H3', label: 'waiting outside the hospital', slots: [[-6.2, 11.8, 0], [-12, 12, 0]] },
  { id: 'bench', where: 'the bench', kind: 'plaza', node: 'sw_-2', label: 'resting near the bench', slots: [[-6.4, 6.3, PI], [-1.9, 6.3, PI]] },
  { id: 'plaza_n', where: 'the office plaza', kind: 'plaza', node: 'P0', label: 'standing in the shade', slots: [[14, -9, PI / 2], [22.5, -9.3, -PI / 2]] },
];

/** Two people chatting: centre + axis angle. Slot A is on -axis, slot B on +axis; each faces the other. */
export const SOCIAL_SPOTS = [
  { id: 'apron_w', x: -19, z: 10.6, axis: 0, node: 'H1', label: 'chatting' },
  { id: 'apron_e', x: -2.8, z: 10.8, axis: 0, node: 'H2', label: 'chatting' },
  { id: 'aisle', x: 13, z: 17, axis: 0, node: 'M1', label: 'chatting in the market' },
  { id: 'north_e', x: 44.5, z: -6.3, axis: 0, node: 'nw_42', label: 'chatting on the sidewalk' },
  { id: 'south_w', x: -52, z: 6.35, axis: 0, node: 'sw_-56', label: 'chatting on the sidewalk' },
  { id: 'plaza', x: 18, z: -9.6, axis: 0, node: 'P0', label: 'chatting in front of the office' },
  { id: 'south_e', x: 60.5, z: 6.3, axis: 0, node: 'sw_62', label: 'chatting on the sidewalk' },
];

/* ------------------------------------------------------------------ */
/* Walking network                                                      */
/* ------------------------------------------------------------------ */
/** Sidewalk lanes: side -1 = north (z < 0), +1 = south (z > 0). lane 0 = near the road, 1 = near the buildings. */
export const LANE_Z = [5.45, 6.6];
const SIDEWALK_X = [-92, -80, -68, -56, -44, -36, -30, -24, -16, -9, -2, 6, 14, 22, 28, 34, 42, 52, 62, 72, 84, 92];
const CROSS_X = [-9, 14];
const SIDE_STREETS = [-30, 28];
const SIDE_STREET_Z = [13, 25, 37, 49, 61, 73, 85];

/**
 * @returns {{ nodes: {id:string,x:number,z:number,side:number}[], links: [string,string][] }}
 * side != 0: the z of the node is side * LANE_Z[npc.lane] (so two walkers can use different lanes).
 */
export function buildNetwork() {
  const nodes = [];
  const links = [];
  const add = (id, x, z, side = 0) => nodes.push({ id, x, z, side });
  const key = (side, x) => `${side < 0 ? 'nw' : 'sw'}_${x}`;

  for (const side of [-1, 1]) {
    for (let i = 0; i < SIDEWALK_X.length; i++) {
      const x = SIDEWALK_X[i];
      add(key(side, x), x, 0, side);
      if (i > 0) links.push([key(side, SIDEWALK_X[i - 1]), key(side, x)]);
    }
  }
  // zebra crossings join the two sidewalks
  for (const x of CROSS_X) links.push([key(-1, x), key(1, x)]);

  // side streets: nodes down the middle of the narrow road, joined to the sidewalk junction nodes
  for (const sx of SIDE_STREETS) {
    for (const s of [-1, 1]) {
      let prev = key(s, sx);
      for (const z of SIDE_STREET_Z) {
        const id = `ss_${sx}_${s * z}`;
        add(id, sx, s * z, 0);
        links.push([prev, id]);
        prev = id;
      }
    }
  }

  // market, hospital apron, tea stall, office forecourt
  add('M0', 13, 8.8); add('M1', 13, 17); add('M2', 8, 17); add('M3', 18, 17); add('M4', 23.4, 17);
  links.push([key(1, 14), 'M0'], ['M0', 'M1'], ['M1', 'M2'], ['M1', 'M3'], ['M3', 'M4']);
  add('H0', -9, 8.4); add('H1', -16, 10.4); add('H2', -3, 10.4); add('H3', -9, 11.6);
  links.push([key(1, -9), 'H0'], ['H0', 'H3'], ['H0', 'H1'], ['H0', 'H2'], ['H1', 'H3'], ['H2', 'H3']);
  add('T0', -24.9, 7.7);
  links.push([key(1, -24), 'T0'], ['T0', key(1, -16)]);
  add('P0', 18, -9.4); add('P1', 11, -9.6); add('P2', 25, -9.6);
  links.push([key(-1, 14), 'P1'], [key(-1, 22), 'P2'], ['P1', 'P0'], ['P0', 'P2']);
  return { nodes, links };
}

/* ------------------------------------------------------------------ */
/* Dialogue (all local, works offline)                                   */
/* ------------------------------------------------------------------ */
/**
 * A line is 'n:text' (the NPC speaks) or 'p:text' (the player speaks).
 * Placeholders: {name} the NPC's name, {partner} the chat partner's name, {role} the NPC's job.
 * greet: the first conversation script is picked from this list (more than one = variety).
 * topics: questions the player can ask afterwards; each answer is a short list of lines.
 */
export const DIALOGUE = {
  office: {
    greet: [
      ['n:Assalamu Alaikum, brother!', 'p:Wa Alaikum Assalam. How are you?', 'n:Alhamdulillah, I am doing well. Just rushing to the office.', 'p:What do you do there?', 'n:I keep the accounts for a small trading company. Numbers all day!'],
      ['n:Oh, hello! Excuse me if I look in a hurry.', 'p:No problem. Where are you headed?', 'n:To the office. The boss gets upset if we are late, you know.'],
    ],
    topics: [
      { q: 'How is the traffic today?', a: ['n:Jam, jam, jam! The main road is always full by this time.', 'n:Walking is faster than waiting for a bus, I say.'] },
      { q: 'Any place to eat nearby?', a: ['n:The tea stall near the hospital road is good. A cup of tea and a biscuit and the day is fine.'] },
    ],
  },
  tea: {
    greet: [
      ['n:Assalamu Alaikum, brother! Come, come, the tea is fresh.', 'p:Wa Alaikum Assalam. How is business?', 'n:Alhamdulillah, people always need tea. Rain or sun.', 'p:What do you do here?', 'n:This is my stall. My father sold tea at this very corner before me.'],
      ['n:Welcome! Sit, sit. Milk tea or plain tea?', 'p:Just saying hello today.', 'n:Hello is free, brother. Tea you can pay for next time!'],
    ],
    topics: [
      { q: 'Who comes to your stall?', a: ['n:Everyone! Rickshaw pullers in the morning, office people at noon, and the old men in the evening to argue about cricket.'] },
      { q: 'What is the best thing here?', a: ['n:My seven-layer tea. Only on holidays, the layers take patience.'] },
      { q: 'Where is the market?', a: ['n:Straight along the road, past the zebra crossing, the big red gate on your right. Buy fresh vegetables early.'] },
    ],
  },
  teacher: {
    greet: [
      ['n:Assalamu Alaikum. You look like a thoughtful young person.', 'p:Wa Alaikum Assalam. How are you?', 'n:Alhamdulillah, I am well. I am a school teacher, you see, so I am always happy to meet someone curious.', 'p:What do you teach?', 'n:Bangla and history. Do you know why history matters? It tells us whose country this really is.'],
      ['n:Ah, hello! I was just talking to {partner} about the new school term.', 'p:Sorry to interrupt.', 'n:Not at all! A teacher never refuses a visitor.'],
    ],
    topics: [
      { q: 'Tell me something about our country.', a: ['n:We are a land of rivers, rice and poets. Remember that, whatever you do in the city.'] },
      { q: 'Are the students good?', a: ['n:Some are naughty, most are brilliant. Every year one of them surprises me.'] },
    ],
  },
  elder: {
    greet: [
      ['n:Assalamu Alaikum, my son. Come, come, you walk like someone who has no hurry. Good.', 'p:Wa Alaikum Assalam, chacha. How are you?', 'n:Alhamdulillah, the knees complain but the heart is fine.', 'p:What did you do before?', 'n:I was a clerk in a government office for thirty-one years. Now I only supervise the neighbourhood!'],
      ['n:Walaikum Assalam! You are new here, no?', 'p:Just exploring the city.', 'n:Good, good. When I was young this road was mud. Now they say it is a city. We will see.'],
    ],
    topics: [
      { q: 'How was the city before?', a: ['n:Quiet. More trees, fewer horns. Children played on the road and nobody worried.', 'n:Some things get better, some things we only miss.'] },
      { q: 'Any advice for me?', a: ['n:Greet people, my son. It costs nothing and you will never walk alone.'] },
    ],
  },
  student: {
    greet: [
      ['n:Hi! Assalamu Alaikum.', 'p:Wa Alaikum Assalam. How are you?', 'n:Alhamdulillah, fine. A bit tired, we have exams soon.', 'p:What are you studying?', 'n:I am on the way to class. Do not ask me about maths!'],
      ['n:Oh, hello! Sorry, I was lost in my notes.', 'p:Busy day?', 'n:Always. Study in the day, tuition in the evening, sleep never!'],
    ],
    topics: [
      { q: 'What do you want to become?', a: ['n:Maybe an engineer. Or a doctor. Or a cricketer! Let us see which exam result comes first.'] },
      { q: 'Where is a quiet place to study?', a: ['n:Honestly, the roadside tea stall is my library. The noise teaches you to focus.'] },
    ],
  },
  rickshaw: {
    greet: [
      ['n:Assalamu Alaikum, bhai! Rickshaw lagbe?', 'p:Wa Alaikum Assalam. Not today, thank you. How are you?', 'n:Alhamdulillah, the day is slow but the sun is kind.', 'p:What do you do here?', 'n:I pull this rickshaw. Twelve years now. I know every lane in this city.'],
      ['n:Brother, hello! Are you going far?', 'p:No, just looking around.', 'n:Then look from the rickshaw next time. The best view in the city is from the seat!'],
    ],
    topics: [
      { q: 'Which is the best road?', a: ['n:The main road in the evening. Lights, tea stalls, people. Every corner has a story.'] },
      { q: 'Is the work hard?', a: ['n:Yes. But I send my daughter to school with this money. That makes the legs light.'] },
    ],
  },
  homemaker: {
    greet: [
      ['n:Walaikum Assalam, bhai. Are you from this area?', 'p:Assalamu Alaikum, apu. Just exploring. How are you?', 'n:Alhamdulillah, I am well. I was talking with {partner} about what to cook tonight.', 'p:What will you cook?', 'n:Hilsa fish if I can find a good one at the market. Otherwise dal and bhorta!'],
      ['n:Oh, hello. You startled me a little!', 'p:Sorry, apu.', 'n:It is fine. Come to the market early tomorrow, the best vegetables are gone by nine.'],
    ],
    topics: [
      { q: 'What is good for lunch?', a: ['n:Hot rice, dal, a little fried fish and a slice of lemon. Nothing is better, believe me.'] },
      { q: 'How are the neighbours?', a: ['n:We share everything here: sugar, gossip, and chilli when someone runs out.'] },
    ],
  },
  vendor: {
    greet: [
      ['n:Assalamu Alaikum, bhai! Fresh, fresh, look at this!', 'p:Wa Alaikum Assalam. How is business?', 'n:Alhamdulillah, good in the morning, slower in the heat.', 'p:What do you sell?', 'n:Whatever the season gives. Today it is the best of what the farmers brought at dawn.'],
      ['n:Come, come, no need to buy. Just look!', 'p:It all looks fresh.', 'n:Fresh since four in the morning. I went to the wholesale market myself.'],
    ],
    topics: [
      { q: 'What is cheap today?', a: ['n:Eggplants and spinach. The tomatoes are dear, the rain spoiled the harvest.'] },
      { q: 'How early do you start?', a: ['n:Before the azan at dawn. The market is quiet then, and honest. Prices are fair and the fish still jumps.'] },
    ],
  },
  guard: {
    greet: [
      ['n:Assalamu Alaikum, sir.', 'p:Wa Alaikum Assalam. How are you?', 'n:Alhamdulillah, all is calm, which is what a guard wants.', 'p:What do you do here?', 'n:I watch the hospital gate. Visitors, ambulances, everybody comes through me.'],
      ['n:Sir, please keep the ambulance path clear.', 'p:Of course. Sorry.', 'n:No problem. You are a good citizen.'],
    ],
    topics: [
      { q: 'Is it a busy hospital?', a: ['n:Always. Doctors work day and night. Respect them if you meet one.'] },
      { q: 'Is the area safe?', a: ['n:Very, Alhamdulillah. People look after each other here.'] },
    ],
  },
  nurse: {
    greet: [
      ['n:Walaikum Assalam, bhai. Are you well?', 'p:Alhamdulillah. Are you from the hospital?', 'n:Yes, I am a nurse. Just taking five minutes of fresh air.', 'p:Is it hard work?', 'n:Tiring, but when a patient smiles, you forget it all.'],
      ['n:Hello. If you feel dizzy in this heat, drink water, please.', 'p:Thank you for the advice.', 'n:Habit. Nurses never stop advising!'],
    ],
    topics: [
      { q: 'Any health advice?', a: ['n:Drink clean water, wash your hands, sleep on time. Nothing fancy, but it works.'] },
      { q: 'Do you like your job?', a: ['n:I do. Some days are heavy, but I would not change it.'] },
    ],
  },
  labourer: {
    greet: [
      ['n:Assalamu Alaikum, bhai.', 'p:Wa Alaikum Assalam. How are you?', 'n:Alhamdulillah, I am fine. A little tired from carrying bricks since dawn.', 'p:What are you building?', 'n:Another tall building. The city grows upward, and we are the ones who lift it.'],
      ['n:Excuse me, bhai, I am off to get some tea. Throat is dry.', 'p:Go ahead.', 'n:Come along if you like, the tea stall is not far.'],
    ],
    topics: [
      { q: 'Is the work steady?', a: ['n:Some weeks yes, some weeks no. But my family eats, Alhamdulillah.'] },
      { q: 'Tell me about the city.', a: ['n:It never sleeps. When I go home at night, the horns are still singing.'] },
    ],
  },
  shopper: {
    greet: [
      ['n:Assalamu Alaikum. Oh, hello!', 'p:Wa Alaikum Assalam, apu. How are you?', 'n:I am fine, Alhamdulillah. I am looking for something nice at the market for my sister.', 'p:Did you find it?', 'n:Not yet. Everything is nice, and nothing is cheap!'],
      ['n:Excuse me, is the market this way?', 'p:Straight ahead, near the red gate.', 'n:Thank you! May Allah bless you.'],
    ],
    topics: [
      { q: 'Any tip for bargaining?', a: ['n:Always say it is too expensive and begin to walk away. The real price always comes after.'] },
    ],
  },
  driver: {
    greet: [
      ['n:Assalamu Alaikum, brother. Waiting for my turn to drive.', 'p:Wa Alaikum Assalam. How are you?', 'n:Alhamdulillah, fine, but the road is hard on a driver.', 'p:What do you drive?', 'n:A city bus. Every morning I take hundreds of people to work, and I never get a seat!'],
      ['n:{partner}, you will not believe the jam I was in today.', 'p:Sorry, I just came to say hello.', 'n:Oh, hello brother! We were just complaining about the road. A favourite hobby!'],
    ],
    topics: [
      { q: 'Which route is fastest?', a: ['n:Back lanes, early morning. After nine, no road is fast.'] },
    ],
  },
  commuter: {
    greet: [
      ['n:Assalamu Alaikum, bhai.', 'p:Wa Alaikum Assalam. How are you?', 'n:Alhamdulillah, fine. Waiting for the bus, as always.', 'p:Does it come on time?', 'n:Buses have their own sense of time, brother. I stopped checking my watch long ago.'],
      ['n:Brother, do you know if the bus has gone?', 'p:I am not sure. Sorry.', 'n:No problem. I will wait. What else is there to do!'],
    ],
    topics: [
      { q: 'Where does the bus go?', a: ['n:To the other end of the city. Fifty minutes if Allah is kind, and ninety if not.'] },
    ],
  },
  grandma: {
    greet: [
      ['n:Walaikum Assalam, dada. Come closer, my eyes are not what they were.', 'p:How are you, nani?', 'n:Alhamdulillah, I am alive and I can still walk to the market. What more does an old woman need?', 'p:What do you like to do?', 'n:I tell stories to my grandchildren. And I buy sweets for them in secret!'],
      ['n:Hello, my dear. Take care on the road, the bikes are crazy these days.', 'p:I will, nani.', 'n:Good child. May you live long.'],
    ],
    topics: [
      { q: 'Tell me a story.', a: ['n:Once a crow found a jar of water but could not reach it. So he dropped one small stone at a time, until the water rose.', 'n:Patience, my dear. That was the story.'] },
    ],
  },
  youth: {
    greet: [
      ['n:Assalamu Alaikum, bro!', 'p:Wa Alaikum Assalam. How are you?', 'n:Mast! I just heard the match is tonight. Are you going to watch?', 'p:Which match?', 'n:Bangladesh, of course! If we win, the whole road will dance.'],
      ['n:Hey! Do you play cricket?', 'p:A little.', 'n:We play on the open ground in the evening. Come join us, we always need one more!'],
    ],
    topics: [
      { q: 'Who is your favourite player?', a: ['n:The one who hits a six when it matters. No names, because it changes every match!'] },
    ],
  },
};

/** Extra topics every NPC can talk about. Picked at random, so two people rarely offer the same menu. */
export const COMMON_TOPICS = [
  { q: 'How is the weather?', a: ['n:Hot and humid, as always. When the monsoon rain comes, the whole city smells of wet earth.'] },
  { q: 'Which places are worth seeing?', a: ['n:The market for colours, the tea stall for stories, and the house with the balcony on a lazy evening.'] },
  { q: 'Do you know any shortcut?', a: ['n:Use the side streets near the tea stall. Less noise, and sometimes a free smile from a neighbour.'] },
  { q: 'Is there a motorcycle I can ride?', a: ['n:Someone parked one near the main road. Please drive carefully, people are walking!'] },
];

/** A short remark in the conversation, tied to what the NPC is doing right now. {activity} is replaced. */
export const ACTIVITY_REMARKS = [
  'n:Excuse me, I was just {activity}.',
  'n:You caught me while I was {activity}.',
  'n:I am just {activity}, as you can see.',
];
