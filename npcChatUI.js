import './npcChat.css';
import { smartReply } from './npcChat.js';
import { drawPortrait } from './dialogue.js';

/**
 * UPDATE 09 — NPC Smart Chat UI.
 * Left-side panel: NPC name, message log, text input (Bengali/English), Send button.
 * Replies come from the local rule-based engine (npcChat.js). Fully offline.
 * While open the player cannot move (main.js clears movement input) and the NPC
 * stands still facing the player — same pattern as the scripted dialogue.
 */
export class NpcChatUI {
  constructor({ npcs, root, getFocus, onOpen = () => {}, onClose = () => {} }) {
    this.npcs = npcs;
    this.getFocus = getFocus;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this._open = false;
    this.npc = null;
    this.info = null;
    this.state = {};

    const el = (this.el = document.createElement('div'));
    el.className = 'npc-chat';
    el.id = 'npcChat';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'NPC chat');
    el.innerHTML = `
      <div class="npc-chat-head">
        <canvas width="80" height="80" aria-hidden="true"></canvas>
        <div class="who"><b class="npc-chat-name"></b><small class="npc-chat-role"></small></div>
        <button class="npc-chat-close" type="button" aria-label="Close chat">&#x2715;</button>
      </div>
      <div class="npc-chat-log" aria-live="polite"></div>
      <form class="npc-chat-form" autocomplete="off">
        <input type="text" maxlength="200" placeholder="লিখুন... / Type a message" aria-label="Message" />
        <button type="submit">Send</button>
      </form>`;
    root.appendChild(el);
    this.$ = {
      avatar: el.querySelector('canvas'),
      name: el.querySelector('.npc-chat-name'),
      role: el.querySelector('.npc-chat-role'),
      log: el.querySelector('.npc-chat-log'),
      form: el.querySelector('.npc-chat-form'),
      input: el.querySelector('input'),
      close: el.querySelector('.npc-chat-close'),
    };
    this.$.close.addEventListener('click', (e) => { e.currentTarget.blur(); this.close('button'); });
    this.$.form.addEventListener('submit', (e) => { e.preventDefault(); this.send(); });
    for (const type of ['pointerdown', 'touchstart']) el.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    window.addEventListener('keydown', (e) => {
      if (!this._open) return;
      if (e.code === 'Escape' && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); this.close('esc'); }
    }, true);
  }

  get isOpen() { return this._open; }

  open(npc) {
    if (this._open || !npc || !npc.active) return false;
    this._open = true;
    this.npc = npc;
    this.state = {};
    this.npcs.beginConversation(npc, this.getFocus());
    this.info = this.npcs.describe(npc);
    this.$.name.textContent = this.info.name;
    this.$.role.textContent = this.info.role;
    drawPortrait(this.$.avatar, this.info.look);
    this.$.log.innerHTML = '';
    this._add('npc', `আসসালামু আলাইকুম! আমি ${this.info.name}। আমাকে কিছু জিজ্ঞেস করুন — নাম, কাজ, বাজার, পথ... / Assalamu Alaikum! I am ${this.info.name}. Ask me anything — name, job, market, directions...`);
    document.body.classList.add('chat-open');
    this.el.classList.add('show');
    this.onOpen();
    return true;
  }

  close(reason = 'button') {
    if (!this._open) return;
    this._open = false;
    this.el.classList.remove('show');
    document.body.classList.remove('chat-open');
    if (this.npc) this.npcs.endConversation(this.npc);
    this.npc = null;
    this.onClose(reason);
  }

  send() {
    if (!this._open || !this.npc) return;
    const text = this.$.input.value.trim();
    if (!text) return;
    this.$.input.value = '';
    this._add('you', text);
    this.npcs.setConversationSpeaker(this.npc, true);
    const reply = smartReply(text, this.info, this.state);
    this._add('npc', reply);
    this.$.input.focus({ preventScroll: true });
  }

  _add(who, text) {
    const d = document.createElement('div');
    d.className = `npc-chat-msg ${who}`;
    d.textContent = text;
    this.$.log.appendChild(d);
    this.$.log.scrollTop = this.$.log.scrollHeight;
  }
}
