import { icon } from './icons.js';

const soonList = (items) => `<ul class="plan">${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;
const soon = (lead, items) => `<p class="lead">${lead}</p>${soonList(items)}<span class="badge">Coming soon</span>`;

/**
 * Content for the lobby panels. `settings` is special: its markup is the static
 * <section data-panel="settings"> in index.html (wired by ui.js) and it opens full screen.
 * Panels marked "Coming soon" are intentionally only a description for now (no fake features).
 */
export const PANELS = {
  settings: { title: 'Settings', static: true, full: true },

  store: {
    title: 'Store',
    html: `<p class="lead">Everything you will be able to wear and use in the city.</p>
      <div class="cards">
        <div class="card">${icon('shirt')}<b>Clothing</b><span>Shirts, panjabi, lungi, saree and more</span></div>
        <div class="card">${icon('customize')}<b>Character</b><span>Face, hair and body customization</span></div>
        <div class="card">${icon('hat')}<b>Accessories</b><span>Caps, glasses, gamchha, watches</span></div>
        <div class="card">${icon('bag')}<b>Items</b><span>Useful things for daily life</span></div>
      </div>
      <span class="badge">Coming soon</span>`,
  },

  groups: { title: 'Groups', html: soon('Communities of players.', ['Create or join a group', 'Group chat and shared goals']) },

  updates: {
    title: 'Updates',
    html: `<div class="banner-card"><small>UPDATE 03</small><b>Living City</b><span>Touch controls, enterable houses, a motorcycle and pedestrians.</span></div>
      <div class="banner-card b2"><small>COMING NEXT</small><b>Shops &amp; Jobs</b><span>Demo banner. Placeholder content.</span></div>
      <div class="banner-card b3"><small>EVENT</small><b>Pohela Boishakh Festival</b><span>Demo banner. Placeholder content.</span></div>
      <ul class="plan done">
        <li>Hilltop lobby with the city behind your character</li>
        <li>Mobile joystick, camera area, jump, run and interact buttons</li>
        <li>Full-screen profile with a unique 8-digit UID</li>
        <li>Four enterable houses, one with stairs and a balcony</li>
        <li>Motorcycle driving and walking pedestrians</li>
      </ul>`,
  },

  gift: { title: 'Special Offer', html: `<div class="banner-card b3"><small>DEMO OFFER</small><b>Starter pack</b><span>Placeholder only. There is no shop yet, so nothing can be bought.</span></div><span class="badge">Coming soon</span>` },

  inventory: {
    title: 'Belt · Inventory',
    html: `<p class="lead">Things you carry. Your belt is empty for now.</p>
      <div class="slots">${Array.from({ length: 6 }, () => '<div class="slot">empty</div>').join('')}</div>
      <span class="badge">Items coming soon</span>`,
  },

  mailbox: { title: 'Mailbox', html: soon('Official messages, notifications and gifts will arrive here.', ['Inbox for rewards and announcements']) },
  friends: { title: 'Friends', html: soon('People you play with.', ['Friend list and invitations', 'See who is online']) },
  addfriend: { title: 'Add Friend', html: soon('Add a friend with their UID.', ['Search by 8-digit UID', 'Friend requests']) },
  wallet: {
    title: 'Currency',
    html: `<div class="cards">
        <div class="card">${icon('coin')}<b>Real Coin</b><span>Everyday in-game money</span></div>
        <div class="card">${icon('diamond')}<b>Diamond</b><span>Special in-game currency</span></div>
      </div>
      <p class="lead">Both are virtual currencies used only inside the game. They cannot be bought with real money.</p>
      <span class="badge">Earning &amp; spending: coming soon</span>`,
  },
};

/**
 * Modal window used by the lobby icons / menu and by the pause menu (Settings).
 * Created once; owns a single Escape listener.
 */
export class Modal {
  constructor(root) {
    this.root = root;
    this.titleEl = root.querySelector('[data-modal-title]');
    this.closeBtn = root.querySelector('[data-modal-close]');
    this.generic = root.querySelector('[data-panel="generic"]');
    this.statics = [...root.querySelectorAll('.modal-section[data-panel]')].filter((s) => s.dataset.panel !== 'generic');
    this.current = null;
    this._opener = null;

    this.closeBtn.insertAdjacentHTML('afterbegin', icon('close'));

    // tabs inside static sections (Settings): [data-tab] buttons switch [data-tabpane] blocks
    for (const tab of root.querySelectorAll('[data-tab]')) {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab));
    }
    this.closeBtn.addEventListener('click', () => this.close());
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.isOpen) this.close(); });
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open(name) {
    const def = PANELS[name];
    if (!def) return;
    this._opener = document.activeElement;
    this.current = name;
    this.titleEl.textContent = def.title;
    for (const s of this.statics) s.classList.toggle('hidden', !(def.static && s.dataset.panel === name));
    this.generic.classList.toggle('hidden', !!def.static);
    if (!def.static) this.generic.innerHTML = def.html;
    this.root.classList.toggle('full', !!def.full);
    if (def.full) this.showTab(this._lastTab || 'performance');
    this.root.classList.remove('hidden');
    this.closeBtn.focus({ preventScroll: true });
  }

  showTab(name) {
    this._lastTab = name;
    for (const t of this.root.querySelectorAll('[data-tab]')) {
      const on = t.dataset.tab === name;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', String(on));
    }
    for (const p of this.root.querySelectorAll('[data-tabpane]')) p.classList.toggle('hidden', p.dataset.tabpane !== name);
  }

  close() {
    if (!this.isOpen) return;
    this.root.classList.add('hidden');
    this.current = null;
    if (this._opener && this._opener.focus) this._opener.focus({ preventScroll: true });
    this._opener = null;
  }
}
