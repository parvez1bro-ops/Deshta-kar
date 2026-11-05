/**
 * UPDATE 09 — NPC Smart Chat (local, offline, rule-based).
 * Bengali + English keyword matching. No network, no AI API.
 * Each NPC answers with its own name / role / activity so replies differ per person.
 */

const norm = (s) => String(s || '').toLowerCase().replace(/[?।!.,;:\"'()]/g, ' ').replace(/\s+/g, ' ').trim();

const has = (t, ...words) => words.some((w) => t.includes(w));

/** Pick a reply, avoiding an immediate repeat of the last one. */
function pick(list, state) {
  if (!list || !list.length) return '';
  if (list.length === 1) return list[0];
  let i = Math.floor(Math.random() * list.length);
  if (state && state.lastReply === list[i]) i = (i + 1) % list.length;
  if (state) state.lastReply = list[i];
  return list[i];
}

/**
 * @param {string} raw player message
 * @param {{name:string, role:string, activity:string, partner:string|null, gender:string}} info
 * @param {{lastReply?:string, greeted?:boolean}} state per-NPC memory
 * @returns {string} NPC reply
 */
export function smartReply(raw, info, state = {}) {
  const t = norm(raw);
  const name = info.name || 'আমি';
  const role = info.role || 'এখানকার বাসিন্দা';
  const act = info.activity || 'এখানে দাঁড়িয়ে আছি';
  const partner = info.partner || 'আমার বন্ধু';

  if (!t) return pick(['হ্যাঁ, বলুন? / Yes, tell me?', 'শুনছি, বলুন। / I am listening.'], state);

  // ---- greetings ----
  if (has(t, 'আসসালামু আলাইকুম', 'আসসালাম', 'সালাম', 'assalamu alaikum', 'assalam', 'salam', 'hello', 'hi', 'hey', 'হ্যালো', 'হাই')) {
    state.greeted = true;
    return pick([
      `ওয়ালাইকুম আসসালাম! আমি ${name}। কেমন আছেন? / Wa Alaikum Assalam! I am ${name}. How are you?`,
      `আসসালামু আলাইকুম! আমি ${name}, ${role}। আপনাকে কীভাবে সাহায্য করতে পারি? / Assalamu Alaikum! I am ${name}, a ${role}. How can I help?`,
      `ওয়ালাইকুম আসসালাম, ভাই/আপু! আমি ${name}। বলুন, কী জানতে চান? / Wa Alaikum Assalam! I am ${name}. What would you like to know?`,
    ], state);
  }
  if (has(t, 'আদাব', 'নমস্কার', 'adab', 'nomoskar')) {
    return pick([`আদাব! আমি ${name}। বলুন কী জানতে চান। / Adab! I am ${name}. Tell me what you want to know.`,
      `নমস্কার! আমি ${name}। কেমন আছেন? / Nomoskar! I am ${name}. How are you?`], state);
  }

  // ---- how are you ----
  if (has(t, 'কেমন আছ', 'কেমন আছো', 'ভালো আছ', 'how are you', 'how r u', 'kemon acho')) {
    return pick([
      'আলহামদুলিল্লাহ, ভালো আছি! আপনি কেমন আছেন? / Alhamdulillah, I am well! How are you?',
      `আলহামদুলিল্লাহ ভালো। আমি ${name}, এখন ${act}। / Alhamdulillah, I am fine. I am ${act} right now.`,
      'ভালো আছি, ধন্যবাদ! আপনার দিন কেমন যাচ্ছে? / I am good, thank you! How is your day?',
    ], state);
  }
  if (has(t, 'ভালো আছি', 'আলহামদুলিল্লাহ', 'i am fine', 'i am good', 'i am well')) {
    return pick(['শুনে ভালো লাগলো! / Glad to hear that!', 'আলহামদুলিল্লাহ! ভালো থাকুন। / Alhamdulillah! Stay well.'], state);
  }

  // ---- name ----
  if (has(t, 'তোমার নাম', 'আপনার নাম', 'নাম কী', 'নাম কি', 'your name', 'what is your name', 'who are you', 'তুমি কে', 'আপনি কে')) {
    return pick([
      `আমার নাম ${name}। / My name is ${name}.`,
      `আমি ${name}। ${role} হিসেবে এখানে থাকি। / I am ${name}. I live here as a ${role}.`,
      `${name} — আমাকে সবাই এই নামেই চেনে। / ${name} — everyone here knows me by this name.`,
    ], state);
  }

  // ---- where are you going ----
  if (has(t, 'কোথায় যাচ্ছ', 'কোথায় যাচ্ছো', 'কোথায় যাবা', 'where are you going', 'where you going', 'যাচ্ছ কোথায়')) {
    return pick([
      `আমি ${act}। / I am ${act}.`,
      `আমি বাজারের দিকে যাচ্ছি। / I am heading towards the market.`,
      `আমি ${role} হিসেবে আমার কাজে যাচ্ছি। / I am going to my work as a ${role}.`,
      `এখন ${act}, তারপর বাড়ি যাব। / Right now I am ${act}, then I will go home.`,
    ], state);
  }

  // ---- where is the market ----
  if (has(t, 'বাজার কোথায়', 'বাজার কোথা', 'বাজার কোন দিকে', 'market কোথায়', 'where is the market', 'market where', 'বাজার')) {
    return pick([
      'সামনের রাস্তা দিয়ে সোজা গেলে বাজার পাবেন — লাল গেটের পাশে। / Go straight on the main road, the market is by the red gate.',
      'জেব্রা ক্রসিং পেরিয়ে সোজা যান, ডান দিকে বাজার। / Cross the zebra crossing and go straight, the market is on your right.',
      'মূল সড়ক ধরে পূর্ব দিকে যান, বাজার সেখানেই। / Follow the main road east, the market is there.',
    ], state);
  }

  // ---- job / work ----
  if (has(t, 'কী কাজ কর', 'কি কাজ কর', 'কাজ কী', 'কাজ কি', 'পেশা', 'what do you do', 'your job', 'your work', 'কাজ করো')) {
    return pick([
      `আমি ${role} হিসেবে কাজ করি। / I work as a ${role}.`,
      `আমি একটি দোকানে কাজ করি — ${role}। / I work in a shop — as a ${role}.`,
      `আমার কাজ হলো ${role} এর কাজ করা। / My work is being a ${role}.`,
    ], state);
  }

  // ---- directions: hospital / tea stall / bus / school / office ----
  if (has(t, 'হাসপাতাল', 'hospital', 'ডাক্তার', 'doctor')) {
    return pick(['হাসপাতালটি পশ্চিম দিকে, চায়ের দোকানের পাশে। / The hospital is to the west, beside the tea stall.',
      'সামনের মোড় থেকে বামে গেলে হাসপাতাল পাবেন। / Turn left at the next crossing for the hospital.'], state);
  }
  if (has(t, 'চায়ের দোকান', 'চা কোথায়', 'tea stall', 'tea shop', 'চা পাব')) {
    return pick(['চায়ের দোকানটি হাসপাতালের রাস্তার পাশে — গরম চা পাবেন! / The tea stall is by the hospital road — hot tea there!',
      'পশ্চিম দিকে হাঁটলেই চায়ের দোকান। / Walk west and you will find the tea stall.'], state);
  }
  if (has(t, 'বাস', 'bus', 'বাস স্টপ', 'bus stop')) {
    return pick(['বাস স্টপটি মূল সড়কের পাশে। / The bus stop is beside the main road.',
      'সামনের মোড়ে বাস থামে। / Buses stop at the next crossing.'], state);
  }
  if (has(t, 'স্কুল', 'school', 'কলেজ', 'college', 'বিদ্যালয়')) {
    return pick(['স্কুলটি উত্তরের দিকে, অফিসের পাশে। / The school is to the north, beside the office.',
      'মূল সড়ক ধরে উত্তরে গেলেই স্কুল। / Go north on the main road to reach the school.'], state);
  }
  if (has(t, 'অফিস', 'office')) {
    return pick(['অফিসটি উত্তরের প্লাজার সামনে। / The office is in front of the northern plaza.',
      'জেব্রা ক্রসিং পেরিয়ে উত্তরে গেলেই অফিস। / Cross and go north for the office.'], state);
  }
  if (has(t, 'বাড়ি কোথায়', 'বাসা কোথায়', 'where do you live', 'where is your home', 'তুমি কোথায় থাক')) {
    return pick(['আমি এই এলাকাতেই থাকি। / I live in this area.',
      'আমার বাড়ি এখান থেকে অল্প দূরে। / My home is not far from here.'], state);
  }
  if (has(t, 'রাস্তা', 'road', 'যানজট', 'traffic', 'jam')) {
    return pick(['আজ রাস্তায় বেশ ভিড়। / The road is quite busy today.',
      'এই সময় মূল সড়কে সবসময় জ্যাম থাকে। / The main road is always jammed at this time.'], state);
  }
  if (has(t, 'আবহাওয়া', 'weather', 'গরম', 'বৃষ্টি', 'rain', 'hot')) {
    return pick(['আজ গরম আর আর্দ্র। বৃষ্টি এলে শহরটা ভিজে মাটির গন্ধে ভরে যাবে। / Hot and humid today. When the monsoon rain comes, the city will smell of wet earth.',
      'আবহাওয়া পরিষ্কার আছে। / The weather is clear.'], state);
  }
  if (has(t, 'ধন্যবাদ', 'thank', 'শুকরিয়া', 'thanks')) {
    return pick(['আপনাকেও ধন্যবাদ! / Thank you too!', 'আরে কোনো ব্যাপার না! / No problem at all!'], state);
  }
  if (has(t, 'বিদায়', 'আসি', 'bye', 'goodbye', 'আল্লাহ হাফেজ', 'allah hafez', 'see you')) {
    return pick(['আল্লাহ হাফেজ! ভালো থাকবেন। / Allah Hafez! Take care.',
      'বিদায়! আবার আসবেন। / Goodbye! Come again.'], state);
  }
  if (has(t, 'বন্ধু', 'friend', 'কে তোমার বন্ধু', 'who is your friend')) {
    return pick([`আমার বন্ধু ${partner}। / My friend is ${partner}.`,
      `${partner} এর সাথে আমি প্রায়ই কথা বলি। / I often talk with ${partner}.`], state);
  }
  if (has(t, 'খাবার', 'খেয়েছ', 'খেয়েছো', 'food', 'eat', 'lunch', 'দুপুরের খাবার')) {
    return pick(['গরম ভাত, ডাল আর ভাজা মাছ — এর চেয়ে ভালো কিছু নেই! / Hot rice, dal and fried fish — nothing is better!',
      'চায়ের দোকানে চা আর বিস্কুট খেলাম। / I had tea and biscuits at the tea stall.'], state);
  }
  if (has(t, 'ক্রিকেট', 'cricket', 'খেলা', 'match')) {
    return pick(['আজ রাতে বাংলাদেশের খেলা! জিতলে পুরো রাস্তা নাচবে। / Bangladesh plays tonight! If we win, the whole road will dance.',
      'ক্রিকেট আমার প্রিয় খেলা। / Cricket is my favourite game.'], state);
  }
  if (has(t, 'বাংলাদেশ', 'bangladesh', 'দেশ', 'country')) {
    return pick(['আমরা নদী, ধান আর কবির দেশ। / We are a land of rivers, rice and poets.',
      'বাংলাদেশ আমার প্রিয় দেশ। / Bangladesh is my beloved country.'], state);
  }
  if (has(t, 'সাহায্য', 'help', 'কী করতে পার', 'what can you do')) {
    return pick(['আপনাকে পথ দেখাতে পারি, বাজারের খবর দিতে পারি। / I can show you the way and tell you about the market.',
      'জিজ্ঞেস করুন — বাজার, হাসপাতাল, চায়ের দোকান, সব বলে দেব। / Ask me — market, hospital, tea stall, I will tell you everything.'], state);
  }
  if (has(t, 'হ্যাঁ', 'হ্যা', 'yes', 'হুম', 'আচ্ছা', 'ok', 'okay', 'ঠিক আছে')) {
    return pick(['ঠিক আছে! / Okay!', 'হ্যাঁ, বুঝেছি। / Yes, I understand.'], state);
  }
  if (has(t, 'না', 'no', 'নাহ', 'nah')) {
    return pick(['ঠিক আছে, কোনো সমস্যা নেই। / Okay, no problem.', 'আচ্ছা, বুঝেছি। / Alright, I see.'], state);
  }

  // ---- fallback: varied, personalised ----
  return pick([
    `হুম, ভালো প্রশ্ন! আমি ${name}, ${role}। ${act}। / Hmm, good question! I am ${name}, a ${role}. I am ${act}.`,
    `এটা নিয়ে আমি ${partner} এর সাথে কথা বলেছিলাম। / I talked about this with ${partner}.`,
    `আমি ঠিক জানি না, তবে ${role} হিসেবে আমার অভিজ্ঞতা বলে... / I am not sure, but from my experience as a ${role}...`,
    `বলুন তো, আপনি কোথা থেকে এসেছেন? / Tell me, where are you from?`,
    `আমার মনে হয় এটা এলাকার সবাই জানে — ${act}। / I think everyone in the area knows this — I am ${act}.`,
    `দারুণ কথা! আর কিছু জানতে চান? / Great point! Anything else you want to know?`,
  ], state);
}
