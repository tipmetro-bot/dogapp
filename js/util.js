// dogapp — общие утилиты
export const FB_DEFAULT = 'https://dogapp-52b84-default-rtdb.firebaseio.com';
export const INVITE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 дня для обычных ссылок
export const APP_NAME = 'dogapp';

export const BANNER_PRESETS = [
  { name: 'Blurple',   value: 'linear-gradient(135deg,#5865f2 0%,#eb459e 100%)' },
  { name: 'Лес',       value: 'linear-gradient(135deg,#23a55a 0%,#0e7a86 100%)' },
  { name: 'Закат',     value: 'linear-gradient(135deg,#f0b232 0%,#f23f43 100%)' },
  { name: 'Космос',    value: 'linear-gradient(135deg,#404eed 0%,#7b2ff7 100%)' },
  { name: 'Графит',    value: 'linear-gradient(135deg,#1e1f22 0%,#4e5058 100%)' },
  { name: 'Мята',      value: 'linear-gradient(135deg,#3ba55d 0%,#b8e6c8 100%)' }
];

export function rid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function makeCode(len = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const buf = new Uint32Array(len);
  (self.crypto || window.crypto).getRandomValues(buf);
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

export function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9_-]/g, '').replace(/-{2,}/g, '-').slice(0, 24);
}

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

export function clamp(s, n = 80) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Разрешаем только http(s) и картинки в data URL (используется в <img>, скрипты не исполняются)
export function safeUrl(u) {
  const s = String(u || '').trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(s)) return s;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);(base64,|utf8,)[a-z0-9%+.,;:=_\-\/\\\s]+$/i.test(s)) return s;
  return '';
}

export function safeColor(c, fallback = '#5865f2') {
  const s = String(c || '');
  return /^#[0-9a-f]{3,8}$/i.test(s) ? s : fallback;
}

const GRADIENT_OK = /^linear-gradient\([0-9a-zA-Z%\s,.#()\-]+\)$/;
export function bannerCss(v) {
  const s = String(v || '');
  if (GRADIENT_OK.test(s) && !/url\(/i.test(s)) return 'background:' + s + ';';
  const url = safeUrl(s);
  return url ? `background-image:url("${esc(url)}");background-size:cover;background-position:center;` : '';
}

export function fmtTime(ts) {
  return new Date(ts || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(ts) {
  return new Date(ts || Date.now()).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function dayStart(t) {
  const d = new Date(t); d.setHours(0, 0, 0, 0); return +d;
}

export function fmtFull(ts) {
  const d = dayStart(Date.now()), m = dayStart(ts);
  if (m === d) return 'Сегодня в ' + fmtTime(ts);
  if (m === d - 86400000) return 'Вчера в ' + fmtTime(ts);
  return fmtDate(ts) + ' в ' + fmtTime(ts);
}

export function timeLeft(ms) {
  if (ms <= 0) return 'истекла';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч ${m} мин`;
  return `${Math.max(1, m)} мин`;
}

export function relTime(ts) {
  const diff = Date.now() - (ts || 0);
  if (diff < 60000) return 'только что';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' мин назад';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' ч назад';
  return fmtDate(ts);
}

export function plural(n, forms) {
  const m = Math.abs(n) % 100, m1 = m % 10;
  if (m > 10 && m < 20) return forms[2];
  if (m1 > 1 && m1 < 5) return forms[1];
  if (m1 === 1) return forms[0];
  return forms[2];
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
}

export function toast(text, kind = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = document.createElement('div');
  node.className = 'toast toast-' + kind;
  node.textContent = text;
  root.appendChild(node);
  setTimeout(() => { node.classList.add('toast-out'); setTimeout(() => node.remove(), 350); }, 3400);
}

export function inviteUrl(code) {
  const base = location.href.split('#')[0];
  return base + '#/i/' + encodeURIComponent(code);
}

export function isExpired(inv) {
  return !!inv && !inv.custom && typeof inv.expiresAt === 'number' && inv.expiresAt <= Date.now();
}

export function avatarHtml(user, cls = '') {
  const a = (user && user.avatar) || { type: 'emoji', value: '🐕' };
  if (a.type === 'url' && safeUrl(a.value)) {
    return `<span class="avatar ${cls}"><img src="${esc(safeUrl(a.value))}" alt=""></span>`;
  }
  const content = a.type === 'emoji' ? esc(a.value || '🐕') : esc(initials(user && user.name));
  return `<span class="avatar ${cls}" style="background:${safeColor(a.color)}">${content}</span>`;
}

export function serverIconHtml(server, cls = '') {
  const a = (server && server.icon) || { type: 'emoji', value: '🐕' };
  if (a.type === 'url' && safeUrl(a.value)) {
    return `<span class="server-icon ${cls}"><img src="${esc(safeUrl(a.value))}" alt=""></span>`;
  }
  return `<span class="server-icon ${cls}" style="background:${safeColor(a.color)}">${esc(a.value || '🐕')}</span>`;
}
