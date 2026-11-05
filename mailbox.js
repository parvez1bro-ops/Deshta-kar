/**
 * UPDATE 10 — Mailbox (offline foundation).
 * Three tabs: Updates / Gifts / Messages. Everything is local:
 * claimed gifts and read messages persist in localStorage. No Firebase, no network.
 */
import './mailbox.css';
import { icon } from './icons.js';

const KEY = 'deshta-kar.mailbox.v1';

const UPDATES = [
  { title: 'UPDATE 10 — Mailbox', date: '2026-11-05', desc: 'A new Mailbox in the lobby: game updates, claimable gifts and messages — all stored on this device.' },
  { title: 'UPDATE 09 — NPC Smart Chat', date: '2026-11-05', desc: 'Talk to people in Bengali or English. NPCs now answer questions about their name, job, the market and directions — fully offline.' },
  { title: 'UPDATE 08 — Enterable Houses', date: '2026-11-05', desc: 'Residential houses now have richer interiors: beds, sofas, tables, chairs, wardrobes and counters.' },
  { title: 'UPDATE 07 — Indoor Camera', date: '2026-11-05', desc: 'The camera now stays close and low inside houses and never passes through walls.' },
  { title: 'UPDATE 06 — Advanced NPCs', date: '2026-11-05', desc: 'More pedestrians with varied walking patterns, idle and standing behaviours, and natural stops and turns.' },
  { title: 'UPDATE 03 — Living City', date: '2026-10-01', desc: 'Touch controls, enterable houses, a motorcycle and walking pedestrians.' },
];

const GIFTS = [
  { id: 'welcome', name: 'Welcome Gift', desc: 'A small welcome gift for every player. Claim once.', reward: '+100 Real Coin' },
  { id: 'explorer', name: 'Explorer Gift', desc: 'For exploring the city. Claim once.', reward: '+5 Diamond' },
  { id: 'friend', name: 'Friend Gift', desc: 'A gift for a good friend. Claim once.', reward: '+50 Real Coin' },
];

const MESSAGES = [
  { id: 'm1', title: 'Welcome to DESHTA KAR!', sender: 'DESHTA KAR Team', date: '2026-11-05', body: 'আসসালামু আলাইকুম! Welcome to DESHTA KAR (দেশটা কার). Explore the city, enter houses, ride the motorcycle and talk to people. Everything works offline. Have fun!' },
  { id: 'm2', title: 'Tips for playing', sender: 'DESHTA KAR Team', date: '2026-11-05', body: 'WASD / joystick to move, E / Interact button to talk and open doors, H / Wave to wave. On a phone, drag the right side to look around. The camera adjusts automatically inside houses.' },
  { id: 'm3', title: 'Mailbox is here', sender: 'DESHTA KAR Team', date: '2026-11-05', body: 'This mailbox is an offline foundation. Updates, gifts and messages are stored on this device only. Online messaging will come in a later update.' },
];

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d === 'object') return { claimed: Array.isArray(d.claimed) ? d.claimed : [], read: Array.isArray(d.read) ? d.read : [] };
  } catch { /* ignore */ }
  return { claimed: [], read: [] };
}

export class Mailbox {
  constructor({ modal, profile, toast = () => {} }) {
    this.modal = modal;
    this.profile = profile;
    this.toast = toast;
    this.state = load();
    this.tab = 'updates';
    this.openMsg = null;
    this._save = () => { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* ignore */ } };
  }

  get unreadCount() {
    return MESSAGES.filter((m) => !this.state.read.includes(m.id)).length;
  }

  /** Render the mailbox into the modal's generic section. */
  render() {
    const el = this.modal.generic;
    const tabs = [['updates', 'Updates'], ['gifts', 'Gifts'], ['messages', `Messages${this.unreadCount ? ` (${this.unreadCount})` : ''}`]];
    let body = '';
    if (this.tab === 'updates') {
      body = UPDATES.map((u) => `<div class="mb-card"><small>${u.date}</small><b>${u.title}</b><span>${u.desc}</span></div>`).join('');
    } else if (this.tab === 'gifts') {
      body = GIFTS.map((g) => {
        const claimed = this.state.claimed.includes(g.id);
        return `<div class="mb-card"><b>${g.name}</b><span>${g.desc}</span><small>${g.reward}</small>
          <button class="opt ${claimed ? '' : 'on'}" type="button" data-gift="${g.id}" ${claimed ? 'disabled' : ''}>${claimed ? 'Claimed ✓' : 'Claim'}</button></div>`;
      }).join('');
    } else if (this.openMsg) {
      const m = MESSAGES.find((x) => x.id === this.openMsg);
      body = m ? `<div class="mb-card"><small>${m.date} · ${m.sender}</small><b>${m.title}</b><span>${m.body}</span>
        <button class="opt" type="button" data-back="1">Back to messages</button></div>` : '';
    } else {
      body = MESSAGES.map((m) => {
        const read = this.state.read.includes(m.id);
        return `<button class="mb-msg ${read ? '' : 'unread'}" type="button" data-msg="${m.id}">
          <b>${m.title}</b><small>${m.sender} · ${m.date}${read ? '' : ' · ● unread'}</small></button>`;
      }).join('');
    }
    el.innerHTML = `<div class="mb">
      <nav class="tabs" role="tablist">${tabs.map(([k, label]) => `<button class="tab ${this.tab === k ? 'on' : ''}" type="button" role="tab" data-mbtab="${k}">${label}</button>`).join('')}</nav>
      <div class="mb-body">${body}</div>
      <p class="hint-text">Offline mailbox — stored on this device only.</p>
    </div>`;
    el.querySelectorAll('[data-mbtab]').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.mbtab; this.openMsg = null; this.render(); }));
    el.querySelectorAll('[data-gift]').forEach((b) => b.addEventListener('click', () => this.claim(b.dataset.gift)));
    el.querySelectorAll('[data-msg]').forEach((b) => b.addEventListener('click', () => this.readMsg(b.dataset.msg)));
    const back = el.querySelector('[data-back]');
    if (back) back.addEventListener('click', () => { this.openMsg = null; this.render(); });
  }

  claim(id) {
    if (this.state.claimed.includes(id)) return;
    const gift = GIFTS.find((g) => g.id === id);
    if (!gift) return;
    this.state.claimed.push(id);
    this._save();
    // apply the reward to the profile (offline, local only)
    if (gift.reward.includes('Diamond')) this.profile.diamonds += 5;
    else this.profile.coins += 100;
    this.toast(`${gift.name} claimed! ${gift.reward}`);
    this.render();
  }

  readMsg(id) {
    if (!this.state.read.includes(id)) { this.state.read.push(id); this._save(); }
    this.openMsg = id;
    this.render();
  }

  /** Open the mailbox panel (called from the lobby Mailbox button). */
  open() {
    this.modal.open('mailbox');
    this.render();
  }
}
