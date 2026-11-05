/**
 * Player profile, UID allocation and the (offline) Like service.
 *
 * UID SERVICE
 *   Interface (what the rest of the game relies on):  allocate() -> '81000001' (8 digits, string)
 *   LocalUidService below hands out 81000001, 81000002, ... from a counter saved in localStorage.
 *   The counter is saved BEFORE the id is returned, and an id is never re-issued.
 *   Honest limit: localStorage belongs to one browser on one device. It cannot guarantee
 *   uniqueness across different players / devices. For real online play replace LocalUidService
 *   with a service whose allocate() runs an atomic server-side counter (for example a Firebase
 *   transaction on /counters/uid, or a Cloud Function). Make it async and await it once, before the
 *   first profile render; nothing else in the game needs to change.
 *
 * LIKE SERVICE
 *   Offline prototype: a local toggle only. No online likes are simulated. A Firebase version
 *   would store likes/{targetUid}/{authenticatedUserUid} = true (one like per user, enforced by
 *   security rules) and return the real count.
 */
const PROFILE_KEY = 'deshta-kar.profile.v2';
const UID_KEY = 'deshta-kar.uid.counter.v1';
const OLD_PROFILE_KEY = 'deshta-kar.profile.v1';

export const UID_FIRST = 81000001;
export const UID_LAST = 89999999;
export const NAME_MIN = 2;
export const NAME_MAX = 16;

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

export class LocalUidService {
  constructor() {
    this._memory = UID_FIRST - 1;   // used only if storage is blocked (then ids last one session)
  }

  /** Highest id handed out so far. */
  get last() {
    const raw = storage.get(UID_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isInteger(n) && n >= UID_FIRST - 1 ? Math.max(n, this._memory) : this._memory;
  }

  /** Make sure the counter is at least `uid` (used when a saved profile already owns one). */
  reserve(uid) {
    const n = Number(uid);
    if (Number.isInteger(n) && n >= UID_FIRST && n <= UID_LAST && n > this.last) this._write(n);
  }

  allocate() {
    const next = this.last + 1;
    if (next > UID_LAST) throw new Error('UID range exhausted');
    this._write(next);          // persist first, then return
    return String(next);
  }

  _write(n) {
    this._memory = n;
    storage.set(UID_KEY, String(n));
  }
}

export class LocalLikeService {
  /** @returns {{ liked: boolean, count: number }} local state only */
  toggle(profile) {
    profile.liked = !profile.liked;
    profile.likes = profile.liked ? 1 : 0;
    return { liked: profile.liked, count: profile.likes };
  }
  get online() { return false; }
}

/** Trim, collapse spaces, drop control characters. Returns { ok, name, error }. */
export function validateName(raw) {
  const name = String(raw ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  if ([...name].length < NAME_MIN) return { ok: false, name, error: `Name must have at least ${NAME_MIN} characters.` };
  if ([...name].length > NAME_MAX) return { ok: false, name, error: `Name can have at most ${NAME_MAX} characters.` };
  return { ok: true, name, error: '' };
}

export const uidService = new LocalUidService();
export const likeService = new LocalLikeService();

const defaults = () => ({ uid: '', name: 'Musafir', level: 1, xp: 0, xpToNext: 100, coins: 500, diamonds: 20, liked: false, likes: 0 });

/** Load the saved profile (or create it). A UID is assigned exactly once, here. */
export function loadProfile(service = uidService) {
  const p = defaults();
  const raw = storage.get(PROFILE_KEY);
  if (raw) {
    try {
      const d = JSON.parse(raw);
      if (typeof d.name === 'string' && validateName(d.name).ok) p.name = validateName(d.name).name;
      for (const k of ['level', 'xp', 'xpToNext', 'coins', 'diamonds']) if (Number.isFinite(d[k]) && d[k] >= 0) p[k] = d[k];
      if (p.xpToNext < 1) p.xpToNext = 100;
      if (/^\d{8}$/.test(d.uid) && Number(d.uid) >= UID_FIRST && Number(d.uid) <= UID_LAST) p.uid = d.uid;
      p.liked = d.liked === true;
      p.likes = p.liked ? 1 : 0;
    } catch { /* corrupted: fall through to defaults */ }
  } else {
    // keep the player's name from the first lobby version, if any
    try {
      const old = JSON.parse(storage.get(OLD_PROFILE_KEY) || 'null');
      if (old && typeof old.name === 'string' && validateName(old.name).ok) p.name = validateName(old.name).name;
    } catch { /* ignore */ }
  }
  if (p.uid) service.reserve(p.uid);          // the counter can never fall behind an existing id
  else p.uid = service.allocate();
  saveProfile(p);
  return p;
}

export function saveProfile(p) {
  storage.set(PROFILE_KEY, JSON.stringify({
    uid: p.uid, name: p.name, level: p.level, xp: p.xp, xpToNext: p.xpToNext,
    coins: p.coins, diamonds: p.diamonds, liked: p.liked,
  }));
}
