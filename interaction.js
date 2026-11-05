/**
 * Proximity interactions: doors, the balcony wave and the motorcycle.
 * An interactable is { kind, short, x, z, radius, label(), available?(player), act(player, ctx) }.
 * `x` / `z` may be getters (the motorcycle moves). One E press / Interact tap triggers the nearest one.
 */
export class Interactions {
  /**
   * @param {object[]} list shared array (World.interactables); items can be added later
   * @param {{ el: HTMLElement, textEl: HTMLElement }} ui
   */
  constructor(list, { el, textEl }) {
    this.list = list;
    this.el = el;
    this.textEl = textEl;
    this.current = null;
    this._shownText = '';
  }

  /** @returns {{kind: string, short: string, text: string} | null} the prompt currently shown */
  update(player, controls, ctx, { riding = false } = {}) {
    const p = player.position;
    let best = null, bestScore = Infinity;
    for (let i = 0; i < this.list.length; i++) {
      const it = this.list[i];
      if (riding && it.kind !== 'vehicle') continue;
      const d = Math.hypot(p.x - it.x, p.z - it.z);
      if (d > it.radius) continue;
      if (it.available && !it.available(p)) continue;
      const score = d / it.radius + (it.scorePenalty || 0);   // NPCs add a small penalty so doors / the bike win ties
      if (score < bestScore) { best = it; bestScore = score; }
    }
    this.current = best;
    const pressed = controls.consumeInteract();          // always consumed, so old presses never fire later
    if (pressed && best) best.act(player, ctx);

    // the label may have changed because of the action (door opened, got on the bike, ...)
    const text = best ? best.label() : '';
    if (text !== this._shownText) {
      this._shownText = text;
      this.textEl.textContent = text;
      this.el.classList.toggle('show', !!text);
    }
    return best ? { kind: best.kind, short: best.short ? (best.shortLabel ? best.shortLabel() : best.short) : 'USE', text } : null;
  }

  hide() {
    this.current = null;
    this._shownText = '';
    this.el.classList.remove('show');
  }
}
