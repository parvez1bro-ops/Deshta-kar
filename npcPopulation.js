/**
 * Adaptive NPC population (no three.js, so it can be unit-tested in plain Node).
 *
 * Every frame it is told how long the frame took. It keeps a smoothed frame time and compares it with
 * the frame time the player asked for (FPS limit). Rules, chosen so the count does not flicker:
 *   - nothing changes for the first WARMUP seconds (shader compile, first frames) and after a hitch
 *   - the count is only evaluated every EVAL_EVERY seconds
 *   - to REMOVE NPCs the game must miss its target (ratio > SLOW) in LOW_BAD evaluations in a row
 *   - to ADD an NPC it must beat the target comfortably (ratio < FAST) in GOOD_NEEDED evaluations in a row
 *     and a cooldown since the last change must have passed
 *   - after a removal the old count becomes a temporary ceiling, so it does not bounce straight back
 *     up and down; the ceiling rises by one only after a long stable stretch
 *   - if the count is already at the minimum and the game still struggles, `pressure` rises (0..2).
 *     The NPC manager uses it to shrink the update / draw distance instead of removing more NPCs.
 */
const WARMUP = 4;            // s
const EVAL_EVERY = 1.5;      // s
const SLOW = 1.22;           // smoothed frame time > 122 % of the target frame time
const FAST = 1.06;           // smoothed frame time < 106 % of the target frame time
const LOW_BAD = 2;           // consecutive slow evaluations before removing
const GOOD_NEEDED = 6;       // consecutive fast evaluations before adding (~9 s)
const ADD_COOLDOWN = 12;     // s between two changes (after a removal: 25 s)
const CEILING_RELAX = 90;    // s of stable headroom before the learned ceiling rises by one
const EMA_TAU = 1.6;         // s

export class PopulationController {
  /** @param {{min:number,start:number,max:number}} limits */
  constructor(limits) {
    this.setLimits(limits, true);
    this.ratio = 1;
    this.pressure = 0;
    this._ema = 0;
    this._clock = 0;
    this._evalClock = 0;
    this._bad = 0;
    this._good = 0;
    this._sinceChange = 0;
    this._stable = 0;
    this._lastChange = 0;     // +1 / -1
    this._cooldown = ADD_COOLDOWN;
  }

  /** New graphics preset: new limits, restart the measurement (the first seconds are not trusted again). */
  setLimits({ min, start, max }, first = false) {
    this.min = min;
    this.max = max;
    if (first) {
      this.target = start;
    } else {
      // keep what we learned when it still fits, otherwise move to the closest allowed value
      this.target = Math.max(min, Math.min(max, this.target));
      this._clock = 0;
      this._bad = this._good = 0;
    }
    this.ceiling = max;
    this.pressure = 0;
  }

  /**
   * @param {number} dt real seconds of the last frame (any value)
   * @param {number} targetDt seconds per frame the FPS limit asks for (1 / fpsLimit)
   * @returns {number} the wanted number of active NPCs
   */
  update(dt, targetDt) {
    this._clock += dt;
    this._sinceChange += dt;
    // a long stall (tab switch, GC) is not "the device is slow": cap its weight in the average
    const d = Math.min(dt, targetDt * 3);
    const a = 1 - Math.exp(-dt / EMA_TAU);
    this._ema = this._ema === 0 ? d : this._ema + (d - this._ema) * a;
    this.ratio = this._ema / targetDt;

    if (this._clock < WARMUP) return this.target;
    this._evalClock += dt;
    if (this._evalClock < EVAL_EVERY) return this.target;
    this._evalClock = 0;

    if (this.ratio > SLOW) {
      this._bad++;
      this._good = 0;
      this._stable = 0;
      if (this._bad >= LOW_BAD) {
        this._bad = 0;
        if (this.target > this.min) {
          this.target = Math.max(this.min, this.target - (this.ratio > 1.6 ? 2 : 1));
          this.ceiling = Math.max(this.min, this.target);   // do not climb back up to the count that was too much
          this._change(-1, 25);
        } else if (this.pressure < 2) {
          this.pressure++;                                   // already at the minimum: reduce NPC work instead
        }
      }
    } else if (this.ratio < FAST) {
      this._bad = 0;
      this._good++;
      this._stable += EVAL_EVERY;
      if (this._good >= GOOD_NEEDED && this._sinceChange >= this._cooldown) {
        this._good = 0;
        if (this.pressure > 0) {
          this.pressure--;
          this._change(+1, ADD_COOLDOWN);
        } else if (this.target < Math.min(this.max, this.ceiling)) {
          this.target++;
          this._change(+1, ADD_COOLDOWN);
        }
      }
      if (this._stable >= CEILING_RELAX && this.ceiling < this.max) {
        this.ceiling++;
        this._stable = 0;
      }
    } else {
      // in between: neither slow nor fast. Hold still, forget partial streaks slowly.
      this._bad = Math.max(0, this._bad - 1);
      this._good = Math.max(0, this._good - 1);
    }
    return this.target;
  }

  _change(dir, cooldown) {
    this._lastChange = dir;
    this._sinceChange = 0;
    this._cooldown = cooldown;
    this._good = 0;
  }
}
