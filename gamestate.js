/**
 * Tiny game-state machine. The whole app is always in exactly one of these states:
 *
 *   lobby       main menu, character on display, loop running (idle animation)
 *   transition  camera glides from the lobby framing to the gameplay camera
 *   playing     normal gameplay (pointer locked)
 *   paused      Esc pressed: loop stopped, pause menu visible
 *
 * Only the transitions listed below are allowed, so a stray event (for example a late
 * pointer-lock callback) can never put the game into an impossible state.
 */
export const STATES = Object.freeze({
  LOBBY: 'lobby',
  TRANSITION: 'transition',
  PLAYING: 'playing',
  PAUSED: 'paused',
});

const ALLOWED = {
  lobby: ['transition'],
  transition: ['playing', 'lobby'],
  playing: ['paused'],
  paused: ['playing', 'lobby'],
};

export class GameState {
  constructor(initial = STATES.LOBBY) {
    this.current = initial;
    this._listeners = new Set();
  }

  is(...names) {
    return names.includes(this.current);
  }

  /** @returns {boolean} true if the state changed */
  set(next) {
    if (next === this.current) return false;
    if (!ALLOWED[this.current] || !ALLOWED[this.current].includes(next)) {
      console.warn(`[GameState] ignored invalid transition ${this.current} -> ${next}`);
      return false;
    }
    const prev = this.current;
    this.current = next;
    for (const fn of this._listeners) fn(next, prev);
    return true;
  }

  /** @returns {() => void} unsubscribe */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
}
