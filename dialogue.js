import './dialogue.css';
import { DIALOGUE, COMMON_TOPICS, ACTIVITY_REMARKS } from './npcData.js';

/**
 * NPC conversation window. Everything is local (src/npcData.js), nothing needs the internet.
 *
 *   open(npc)  -> a short greeting script (a different one on a repeat visit), then a menu of questions
 *                 the player can ask, then "Goodbye". Each NPC type has its own lines, and the person's
 *                 name, job, current activity and chat partner are filled in.
 *   Next / Close buttons, tap the text to finish the typing at once.
 *   Keyboard: E, Enter, Space or Right = next  ·  1-4 = choose a question  ·  Esc = close
 *
 * While it is open the player cannot move (main.js clears the movement input every frame) and the
 * NPC stands still, faces the player and uses talking gestures.
 */
const CPS = 70;      // typed characters per second

function parse(line) {
  return { who: line[0] === 'p' ? 'p' : 'n', text: line.slice(2) };
}

const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, '0')}`;

/** A simple flat portrait drawn from the NPC's own colours (no image files). */
export function drawPortrait(canvas, look) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1d4a3a');
  bg.addColorStop(1, '#0d2a21');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const cx = W / 2;
  const skin = hex(look.skin), hair = hex(look.hair), shirt = hex(look.shirt), scarf = hex(look.gamchha ?? look.shirtTrim);
  const female = look.gender === 'female';

  // shoulders
  g.fillStyle = shirt;
  g.beginPath(); g.ellipse(cx, H + 6, W * 0.46, H * 0.3, 0, Math.PI, 0); g.fill();
  if (look.garment === 'kameez' || look.hairStyle === 'hijab') {
    g.fillStyle = scarf;
    g.beginPath(); g.ellipse(cx, H * 0.86, W * 0.3, H * 0.1, 0, 0, Math.PI * 2); g.fill();
  }
  // neck
  g.fillStyle = skin;
  g.fillRect(cx - W * 0.07, H * 0.6, W * 0.14, H * 0.2);

  // hair behind the head / scarf
  if (look.hairStyle === 'long') { g.fillStyle = hair; g.fillRect(cx - W * 0.25, H * 0.3, W * 0.5, H * 0.5); }
  if (look.hairStyle === 'hijab') { g.fillStyle = scarf; g.beginPath(); g.ellipse(cx, H * 0.46, W * 0.31, H * 0.34, 0, 0, Math.PI * 2); g.fill(); }

  // head
  g.fillStyle = skin;
  g.beginPath(); g.ellipse(cx, H * 0.45, W * 0.2, H * 0.25, 0, 0, Math.PI * 2); g.fill();

  // hair on top
  g.fillStyle = hair;
  if (look.hairStyle === 'short' || look.hairStyle === 'long' || look.hairStyle === 'bun') {
    g.beginPath(); g.ellipse(cx, H * 0.34, W * 0.215, H * 0.15, 0, Math.PI, 0); g.fill();
  } else if (look.hairStyle === 'bald') {
    g.beginPath(); g.ellipse(cx - W * 0.19, H * 0.45, W * 0.03, H * 0.1, 0, 0, Math.PI * 2); g.ellipse(cx + W * 0.19, H * 0.45, W * 0.03, H * 0.1, 0, 0, Math.PI * 2); g.fill();
  }
  if (look.hairStyle === 'bun') { g.beginPath(); g.arc(cx, H * 0.16, W * 0.08, 0, Math.PI * 2); g.fill(); }
  if (look.hairStyle === 'hijab') {          // face opening of the scarf
    g.fillStyle = skin;
    g.beginPath(); g.ellipse(cx, H * 0.47, W * 0.175, H * 0.22, 0, 0, Math.PI * 2); g.fill();
  }
  if (look.cap) {
    g.fillStyle = '#f1ede2';
    g.beginPath(); g.ellipse(cx, H * 0.3, W * 0.21, H * 0.13, 0, Math.PI, 0); g.fill();
    g.fillRect(cx - W * 0.21, H * 0.295, W * 0.42, H * 0.03);
  }

  // face
  g.fillStyle = '#1a1411';
  g.beginPath(); g.arc(cx - W * 0.08, H * 0.46, W * 0.022, 0, Math.PI * 2); g.arc(cx + W * 0.08, H * 0.46, W * 0.022, 0, Math.PI * 2); g.fill();
  g.fillRect(cx - W * 0.115, H * 0.4, W * 0.07, H * 0.018);
  g.fillRect(cx + W * 0.045, H * 0.4, W * 0.07, H * 0.018);
  if (look.beard) {
    g.fillStyle = hair;
    g.beginPath(); g.ellipse(cx, H * 0.6, W * 0.15, H * 0.1, 0, 0, Math.PI); g.fill();
  }
  if (look.moustache && !female) { g.fillStyle = hair; g.fillRect(cx - W * 0.07, H * 0.55, W * 0.14, H * 0.025); }
  g.strokeStyle = female ? '#a23b3b' : '#6a3a2a';
  g.lineWidth = Math.max(1.5, W * 0.02);
  g.beginPath(); g.arc(cx, H * 0.56, W * 0.05, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
}

export class DialogueUI {
  /**
   * @param {{ npcs: import('./npc.js').NpcManager, root: HTMLElement, getFocus: () => import('three').Vector3,
   *           onOpen?: () => void, onClose?: (reason: string) => void }} o
   */
  constructor({ npcs, root, getFocus, onOpen = () => {}, onClose = () => {} }) {
    this.npcs = npcs;
    this.getFocus = getFocus;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this._open = false;
    this.npc = null;
    this.queue = [];
    this.topics = [];
    this.phase = 'lines';
    this._typing = null;
    this._full = '';

    const el = (this.el = document.createElement('div'));
    el.className = 'dlg';
    el.id = 'dialogue';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.setAttribute('aria-label', 'Conversation');
    el.innerHTML = `
      <div class="dlg-card">
        <div class="dlg-side">
          <canvas class="dlg-avatar" width="96" height="96" aria-hidden="true"></canvas>
        </div>
        <div class="dlg-main">
          <div class="dlg-head">
            <div class="dlg-who"><b class="dlg-name"></b><small class="dlg-role"></small></div>
            <button class="dlg-close" type="button" tabindex="-1" aria-label="Close conversation">&#x2715;</button>
          </div>
          <div class="dlg-speaker"></div>
          <p class="dlg-text" aria-live="polite"></p>
          <div class="dlg-choices"></div>
          <div class="dlg-foot"><span class="dlg-keys"></span><button class="dlg-next" type="button" tabindex="-1">Next &#x25B8;</button></div>
        </div>
      </div>`;
    root.appendChild(el);
    this.$ = {
      avatar: el.querySelector('.dlg-avatar'), name: el.querySelector('.dlg-name'), role: el.querySelector('.dlg-role'),
      speaker: el.querySelector('.dlg-speaker'), text: el.querySelector('.dlg-text'), choices: el.querySelector('.dlg-choices'),
      next: el.querySelector('.dlg-next'), close: el.querySelector('.dlg-close'), keys: el.querySelector('.dlg-keys'),
    };

    // taps / clicks (pointer events are not needed here: plain click works for mouse and touch)
    this.$.next.addEventListener('click', (e) => { e.currentTarget.blur(); this.next(); });
    this.$.close.addEventListener('click', (e) => { e.currentTarget.blur(); this.close('button'); });
    this.$.text.addEventListener('click', () => { if (this._typing) this._finishTyping(); });
    this.$.choices.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) { b.blur(); this.choose(Number(b.dataset.i)); }
    });
    // the dialogue must not let touches fall through to the game underneath
    for (const type of ['pointerdown', 'touchstart']) el.addEventListener(type, (e) => e.stopPropagation(), { passive: true });

    window.addEventListener('keydown', (e) => this._onKey(e), true);
  }

  get isOpen() { return this._open; }

  /* ------------------------------ open / close ------------------------------ */

  open(npc) {
    if (this._open || !npc || !npc.active) return false;
    this._open = true;
    this.npc = npc;
    this.npcs.beginConversation(npc, this.getFocus());
    const info = this.npcs.describe(npc);
    this.info = info;

    this.$.name.textContent = info.name;
    this.$.role.textContent = info.role;
    drawPortrait(this.$.avatar, info.look);
    this._buildScript(info);
    this.$.keys.textContent = document.body.classList.contains('touch') ? '' : 'E / Space: next · 1-4: ask · Esc: close';

    document.body.classList.add('dialogue-open');
    this.el.classList.add('show');
    this.onOpen();
    this._showNext();
    return true;
  }

  close(reason = 'button') {
    if (!this._open) return;
    this._open = false;
    this._stopTyping();
    this.el.classList.remove('show');
    document.body.classList.remove('dialogue-open');
    if (this.npc) this.npcs.endConversation(this.npc);
    this.npc = null;
    this.onClose(reason);
  }

  /* ------------------------------ script ------------------------------ */

  _fill(text, info) {
    return text
      .replace(/\{name\}/g, info.name)
      .replace(/\{role\}/g, info.role.toLowerCase())
      .replace(/\{partner\}/g, info.partner || 'a friend')
      .replace(/\{activity\}/g, info.activity);
  }

  _buildScript(info) {
    const set = DIALOGUE[info.dialogKey] || DIALOGUE.office;
    const visit = Math.max(0, info.talkCount - 1);
    const script = set.greet[(visit + info.index) % set.greet.length];
    const lines = script.map(parse);
    if (visit > 0) {                       // someone you already met: a different opening
      lines.unshift({ who: 'n', text: 'Oh, you again! Assalamu Alaikum.' });
      lines.push(parse(ACTIVITY_REMARKS[(visit + info.index) % ACTIVITY_REMARKS.length]));
    }
    this.queue = lines.map((l) => ({ who: l.who, text: this._fill(l.text, info) }));

    // topics: this person's own questions first, plus two random general ones (never the same menu twice in a row)
    const pool = [...set.topics];
    const common = COMMON_TOPICS.slice();
    for (let k = common.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [common[k], common[j]] = [common[j], common[k]]; }
    this.topics = pool.concat(common.slice(0, 2));
    this.phase = 'lines';
  }

  /* ------------------------------ flow ------------------------------ */

  next() {
    if (!this._open) return;
    if (this._typing) { this._finishTyping(); return; }
    if (this.phase === 'menu') return;                       // the menu needs a choice
    this._showNext();
  }

  _showNext() {
    if (this.queue.length) {
      this._showLine(this.queue.shift());
    } else {
      this._showMenu();
    }
  }

  _showLine(line) {
    this.phase = 'lines';
    this.$.choices.innerHTML = '';
    this.$.choices.classList.remove('show');
    this.$.next.hidden = false;
    this.$.speaker.textContent = line.who === 'n' ? this.info.name : 'You';
    this.$.speaker.classList.toggle('you', line.who === 'p');
    this.el.classList.toggle('player-line', line.who === 'p');
    this.npcs.setConversationSpeaker(this.npc, line.who === 'n');
    this._type(line.text);
  }

  _showMenu() {
    this.phase = 'menu';
    this._stopTyping();
    this.npcs.setConversationSpeaker(this.npc, false);
    this.$.speaker.textContent = 'You';
    this.$.speaker.classList.add('you');
    this.el.classList.add('player-line');
    this.$.text.textContent = this.topics.length ? 'What would you like to ask?' : 'Anything else?';
    this.$.next.hidden = true;
    const shown = this.topics.slice(0, 3);
    this._menu = shown;
    let html = shown.map((t, i) => `<button type="button" tabindex="-1" data-i="${i}"><i>${i + 1}</i>${t.q}</button>`).join('');
    html += `<button type="button" tabindex="-1" data-i="bye" class="bye"><i>${shown.length + 1}</i>Goodbye</button>`;
    this.$.choices.innerHTML = html;
    this.$.choices.classList.add('show');
  }

  choose(i) {
    if (!this._open || this.phase !== 'menu') return;
    if (i === 'bye' || Number.isNaN(i) || i >= this._menu.length) { this.close('goodbye'); return; }
    const t = this._menu[i];
    this.topics.splice(this.topics.indexOf(t), 1);
    this.queue = [{ who: 'p', text: t.q }, ...t.a.map(parse).map((l) => ({ who: l.who, text: this._fill(l.text, this.info) }))];
    this._showNext();
  }

  /* ------------------------------ typing effect ------------------------------ */

  _type(text) {
    this._stopTyping();
    this._full = text;
    this.$.text.textContent = '';
    let shown = 0;
    let last = performance.now();
    const tick = (now) => {
      shown += ((now - last) / 1000) * CPS;
      last = now;
      const n = Math.min(text.length, Math.floor(shown));
      this.$.text.textContent = text.slice(0, n);
      if (n >= text.length) { this._typing = null; return; }
      this._typing = requestAnimationFrame(tick);
    };
    this._typing = requestAnimationFrame(tick);
  }

  _finishTyping() {
    this._stopTyping();
    this.$.text.textContent = this._full;
  }

  _stopTyping() {
    if (this._typing) cancelAnimationFrame(this._typing);
    this._typing = null;
  }

  /* ------------------------------ keyboard ------------------------------ */

  _onKey(e) {
    if (!this._open) return;
    const code = e.code;
    let handled = true;
    if (code === 'Escape') { if (!e.repeat) this.close('esc'); }
    else if (code === 'KeyE' || code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'ArrowRight') { if (!e.repeat) this.next(); }
    else if (/^(Digit|Numpad)[1-4]$/.test(code)) {
      if (!e.repeat && this.phase === 'menu') {
        const k = Number(code.slice(-1)) - 1;
        this.choose(k < this._menu.length ? k : (k === this._menu.length ? 'bye' : -1));
      }
    } else handled = false;
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
}
