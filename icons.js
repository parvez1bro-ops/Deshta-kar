/**
 * Original line icons, drawn for DESHTA KAR (24x24 grid, stroke = currentColor).
 * Use icon('name') to get an inline <svg> string, so icons take the button's text colour.
 */
const PATHS = {
  settings: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.4"/><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.4 5.4l2.1 2.1M16.5 16.5l2.1 2.1M5.4 18.6l2.1-2.1M16.5 7.5l2.1-2.1"/>',
  mailbox: '<rect x="3" y="5.5" width="18" height="13" rx="2.2"/><path d="M3.6 7.6l8.4 6 8.4-6"/>',
  bell: '<path d="M6 17v-5.5a6 6 0 0 1 12 0V17l1.6 2H4.4z"/><path d="M10 21.2a2 2 0 0 0 4 0"/>',
  friends: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.2" cy="9" r="2.4"/><path d="M16.2 14.2c2.9.3 4.8 2.4 4.8 5.3"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2.6"/><path d="M3.4 9.8h17.2"/><circle cx="16.8" cy="14.6" r="1.2"/><path d="M6.5 6V5a2 2 0 0 1 2-2h7"/>',
  gift: '<rect x="4" y="10.5" width="16" height="9.5" rx="1.6"/><rect x="3" y="7.2" width="18" height="3.3" rx="1"/><path d="M12 7.2V20"/><path d="M12 7.2C10.4 3.2 6.6 4 7.2 6.4c.4 1.6 2.8 1.2 4.8.8zM12 7.2c1.6-4 5.4-3.2 4.8-.8-.4 1.6-2.8 1.2-4.8.8z"/>',
  store: '<path d="M3.2 9.2 4.7 4h14.6l1.5 5.2"/><path d="M3.2 9.2a2.9 2.9 0 0 0 5.9 0 2.9 2.9 0 0 0 5.8 0 2.9 2.9 0 0 0 5.9 0"/><path d="M5 12.4V20h14v-7.6"/><path d="M10 20v-5h4v5"/>',
  portal: '<path d="M5.5 21V10.5a6.5 6.5 0 0 1 13 0V21"/><path d="M2.8 21h18.4"/><path d="M9 21v-8a3 3 0 0 1 6 0v8"/>',
  updates: '<circle cx="12" cy="12" r="9"/><path d="M12 16.5V8"/><path d="M8.4 11.6 12 8l3.6 3.6"/>',
  gangs: '<circle cx="12" cy="7.6" r="2.6"/><path d="M7 20c0-2.9 2.2-5.1 5-5.1s5 2.200 5 5.100"/><circle cx="4.8" cy="10.4" r="1.9"/><path d="M1.8 18c.1-1.9 1.4-3.300 3.200-3.400"/><circle cx="19.2" cy="10.4" r="1.9"/><path d="M22.2 18c-.1-1.900-1.400-3.300-3.200-3.400"/>',
  faction: '<path d="M5.500 21.500V3.500"/><path d="M5.500 4.500h12.500l-2.800 4.200 2.800 4.200H5.500"/>',
  macros: '<path d="M13.200 2.400 5 13.800h6l-1 7.800 8.200-11.400h-6z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.600" r="0.600"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  fullscreen: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
  fullscreenExit: '<path d="M9 4v5H4"/><path d="M15 4v5h5"/><path d="M9 20v-5H4"/><path d="M15 20v-5h5"/>',
  rotate: '<path d="M4.200 12a8 8 0 0 1 13.800-5.500"/><path d="M18.300 3v4h-4"/><path d="M19.800 12a8 8 0 0 1-13.800 5.500"/><path d="M5.700 21v-4h4"/>',
  play: '<path d="M8 5.200v13.600L19.200 12z" fill="currentColor"/>',
  shirt: '<path d="M8.500 3.500 3 6.500l2 4 3-1V20.500h8V9.500l3 1 2-4-5.500-3a3.600 3.600 0 0 1-7 0z"/>',
  customize: '<circle cx="10" cy="8" r="3.500"/><path d="M3 20c0-3.600 3-6 7-6"/><path d="M18 14v6M15 17h6"/>',
  hat: '<path d="M4 15c0-5 3.300-9 8-9s8 4 8 9z"/><path d="M2.500 15h19v2.200H2.500z"/>',
  pencil: '<path d="M4 20l1-4.2L16.2 4.6a1.7 1.7 0 0 1 2.4 0l.8.8a1.7 1.7 0 0 1 0 2.4L8.2 19z"/><path d="M14.4 6.4l3.2 3.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  addfriend: '<circle cx="9" cy="8.4" r="3.2"/><path d="M2.8 20c0-3.5 2.800-6 6.200-6 1.500 0 2.800.4 3.800 1.200"/><path d="M18 13.500v6M15 16.500h6"/>',
  coin: '<circle cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="5.200"/><path d="M12 9.200v5.600M10.200 10.800c.4-1.100 3.200-1.100 3.600 0s-.5 1.300-1.800 1.600-1.900.7-1.800 1.600c.4 1.100 3.200 1.100 3.600 0"/>',
  diamond: '<path d="M6.500 4h11l4 5.500L12 21 2.500 9.500z"/><path d="M2.500 9.500h19M9 4l-2 5.500L12 21l5-11.500L15 4M9 4l3 5.500L15 4"/>',
  copy: '<rect x="8.500" y="8.500" width="11.500" height="12" rx="2"/><path d="M15.500 8.500V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8.500a2 2 0 0 0 2 2h2.500"/>',
  heart: '<path d="M12 20.500s-8-4.800-8-10.700A4.600 4.600 0 0 1 12 7a4.600 4.600 0 0 1 8 2.800c0 5.900-8 10.700-8 10.700z"/>',
  pause: '<path d="M8.500 5.500v13M15.500 5.500v13"/>',
  groups: '<circle cx="8" cy="8.500" r="2.800"/><circle cx="16.500" cy="8.500" r="2.800"/><path d="M2.500 19c0-3.200 2.400-5.200 5.500-5.200s5.500 2 5.500 5.200M12.500 14.200c1-.3 2-.4 3-.4 3.100 0 5.500 2 5.500 5.200"/>',
  jump: '<path d="M12 19V6M6.500 11.500 12 6l5.500 5.500"/>',
  run: '<path d="M13.500 4.500a1.800 1.800 0 1 0 0 .01zM8 20l3-5 3 2 2 3.500M6 11.500l4-3 3.500 2 3 3M11 15l-1-4.500"/>',
  hand: '<path d="M8 12V6.500a1.300 1.300 0 0 1 2.600 0V11M10.600 10.500V4.800a1.300 1.300 0 0 1 2.600 0V11M13.200 10.500V6.200a1.300 1.300 0 0 1 2.600 0V12M15.800 11V9.200a1.300 1.300 0 0 1 2.600 0V15a6 6 0 0 1-6 6h-.8a5.500 5.500 0 0 1-4.400-2.200L4.300 15.500a1.400 1.400 0 0 1 2.200-1.700L8 15.500"/>',
  bike: '<circle cx="6" cy="16" r="3.500"/><circle cx="18" cy="16" r="3.500"/><path d="M6 16l3.500-6.500H14l4 6.500M9.500 9.500 8.500 7H6.500M14 9.500l-1-3h3"/>',
  bag: '<path d="M5 8h14l1 12H4z"/><path d="M9 8V6.200a3 3 0 0 1 6 0V8"/>',
};

export function icon(name, cls = '') {
  const body = PATHS[name];
  if (!body) return '';
  return `<svg class="svg ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/** Original avatar portrait that uses the character's own outfit colours. */
export function avatarSvg({ skin, hair, shirt, gamchha }) {
  return `<svg class="avatar-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs><linearGradient id="avBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c8f6d"/><stop offset="1" stop-color="#0b3d2e"/></linearGradient></defs>
    <rect width="64" height="64" fill="url(#avBg)"/>
    <circle cx="30" cy="25" r="17" fill="#e63946" opacity=".85"/>
    <path d="M8 64c0-13 10-20 24-20s24 7 24 20z" fill="${hex(shirt)}"/>
    <path d="M22 46c3 5 7 7 10 7s7-2 10-7l-3-3c-2 3-4.500 4.500-7 4.500S27 46 25 43z" fill="${hex(gamchha)}"/>
    <rect x="28" y="34" width="8" height="10" rx="3" fill="${hex(skin)}"/>
    <ellipse cx="32" cy="26" rx="10.500" ry="12" fill="${hex(skin)}"/>
    <path d="M21 25c0-9 5-14 11-14s11 5 11 14c-3-4-6-6-11-6s-8 2-11 6z" fill="${hex(hair)}"/>
    <circle cx="28" cy="27" r="1.200" fill="#111"/><circle cx="36" cy="27" r="1.200" fill="#111"/>
    <path d="M28.500 33.500c2 1.200 5 1.200 7 0" stroke="#3a2416" stroke-width="1.300" fill="none" stroke-linecap="round"/>
  </svg>`;
}
