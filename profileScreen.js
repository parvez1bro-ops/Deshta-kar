import { avatarSvg } from './icons.js';
import { validateName, saveProfile, likeService, NAME_MAX } from './profile.js';
import { clamp } from './utils.js';

const $ = (id) => document.getElementById(id);

/**
 * Full-screen profile: avatar, name (editable), UID (copyable), level, XP and the local Like button.
 * Created once at start-up; every listener below is added exactly once.
 */
export class ProfileScreen {
  /**
   * @param {{ profile: object, outfit: object, onChange: (p: object) => void, toast: (m: string) => void, beforeOpen?: () => void }} o
   */
  constructor({ profile, outfit, onChange, toast, beforeOpen = () => {} }) {
    this.profile = profile;
    this.onChange = onChange;
    this.toast = toast;
    this.beforeOpen = beforeOpen;
    this.root = $('profileScreen');
    this.form = $('nameForm');
    this.input = $('nameInput');
    this.errorEl = $('nameError');
    this._opener = null;

    $('profileAvatar').innerHTML = avatarSvg(outfit);
    $('profileClose').insertAdjacentHTML('afterbegin', document.querySelector('[data-modal-close] svg')?.outerHTML || '×');

    $('profileClose').addEventListener('click', () => this.close());
    $('profileEditName').addEventListener('click', () => this.startEdit());
    $('nameCancel').addEventListener('click', () => this.stopEdit());
    this.form.addEventListener('submit', (e) => { e.preventDefault(); this.saveName(); });
    $('copyUid').addEventListener('click', () => this.copyUid());
    $('likeBtn').addEventListener('click', () => this.toggleLike());
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || !this.isOpen) return;
      if (!this.form.classList.contains('hidden')) this.stopEdit();   // first Esc leaves the editor
      else this.close();
    });
    this.render();
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open({ edit = false } = {}) {
    this.beforeOpen();
    this._opener = document.activeElement;
    this.render();
    this.root.classList.remove('hidden');
    if (edit) this.startEdit();
    else $('profileClose').focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.stopEdit();
    this.root.classList.add('hidden');
    if (this._opener && this._opener.focus) this._opener.focus({ preventScroll: true });
    this._opener = null;
  }

  render() {
    const p = this.profile;
    $('profileScreenName').textContent = p.name;
    $('profileUid').textContent = p.uid;
    $('profileScreenLevel').textContent = String(p.level);
    const pct = clamp((p.xp / p.xpToNext) * 100, 0, 100);
    $('profileScreenXpFill').style.width = `${pct}%`;
    $('profileScreenXp').textContent = `${p.xp} / ${p.xpToNext} XP`;
    const like = $('likeBtn');
    like.setAttribute('aria-pressed', String(p.liked));
    $('likeLabel').textContent = p.liked ? 'Liked · 1' : 'Like';
  }

  startEdit() {
    this.form.classList.remove('hidden');
    $('profileEditName').classList.add('hidden');
    this.errorEl.textContent = '';
    this.input.value = this.profile.name;
    this.input.maxLength = NAME_MAX + 8;           // allow typing; validateName reports the real limit
    this.input.focus({ preventScroll: true });
    this.input.select();
  }

  stopEdit() {
    this.form.classList.add('hidden');
    $('profileEditName').classList.remove('hidden');
    this.errorEl.textContent = '';
  }

  saveName() {
    const r = validateName(this.input.value);
    if (!r.ok) { this.errorEl.textContent = r.error; return; }
    this.profile.name = r.name;
    saveProfile(this.profile);
    this.render();
    this.onChange(this.profile);
    this.stopEdit();
    this.toast('Name saved');
  }

  async copyUid() {
    const uid = this.profile.uid;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(uid); ok = true; }
    } catch { /* fall back below */ }
    if (!ok) {
      const t = document.createElement('textarea');
      t.value = uid; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(t);
      t.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      t.remove();
    }
    this.toast(ok ? `UID ${uid} copied` : `Could not copy. Your UID is ${uid}`);
  }

  toggleLike() {
    likeService.toggle(this.profile);
    saveProfile(this.profile);
    this.render();
    this.toast(this.profile.liked ? 'Liked (saved on this device only)' : 'Like removed');
  }
}
