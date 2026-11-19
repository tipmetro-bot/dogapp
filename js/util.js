// dogapp — общие утилиты
export const FB_DEFAULT = 'https://dogapp-52b84-default-rtdb.firebaseio.com';
export const INVITE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 дня для обычных ссылок
export const APP_NAME = 'dogapp';

// Идентификаторы, которые раньше создавались стартовыми данными.
// После очистки в базе остаются только профили зарегистрированных аккаунтов.
export const DEMO_USER_IDS = Object.freeze([
  'u_bot', 'u_luna', 'u_barsik', 'u_koder', 'u_mila', 'u_rex', 'demo'
]);

export function isRealAccount(user, accounts = null) {
  if (!user || typeof user !== 'object' || !user.id || !user.login) return false;
  if (user.bot || user.demo || user.guest || DEMO_USER_IDS.includes(user.id)) return false;
  if (accounts && !accounts[String(user.login).toLowerCase()]) return false;
  return true;
}

export function accountName(user) {
  return isRealAccount(user) ? String(user.name || user.login) : 'Удалённый аккаунт';
}

export const BANNER_PRESETS = [
  { name: 'Blurple', value: 'linear-gradient(135deg,#5865f2 0%,#eb459e 100%)' },
  { name: 'Лес',     value: 'linear-gradient(135deg,#23a55a 0%,#0e7a86 100%)' },
  { name: 'Закат',   value: 'linear-gradient(135deg,#f0b232 0%,#f23f43 100%)' },
  { name: 'Космос',  value: 'linear-gradient(135deg,#404eed 0%,#7b2ff7 100%)' },
  { name: 'Графит',  value: 'linear-gradient(135deg,#1e1f22 0%,#4e5058 100%)' },
  { name: 'Мята',    value: 'linear-gradient(135deg,#3ba55d 0%,#b8e6c8 100%)' }
];

// Шрифт ника виден всем участникам: сохраняется в профиле в Firebase
export const FONT_CHOICES = [
  { id: 'default',   name: 'Стандартный', css: 'var(--font)',                                  weight: 600, spacing: '0' },
  { id: 'serif',     name: 'С засечками', css: 'Georgia, "Times New Roman", serif',            weight: 700, spacing: '0' },
  { id: 'mono',      name: 'Моноширинный', css: 'Consolas, "Courier New", monospace',          weight: 700, spacing: '-.01em' },
  { id: 'rounded',   name: 'Округлый',   css: '"Trebuchet MS", "Segoe UI", sans-serif',       weight: 700, spacing: '.01em' },
  { id: 'condensed', name: 'Узкий',      css: '"Arial Narrow", "Roboto Condensed", sans-serif', weight: 700, spacing: '.02em' },
  { id: 'wide',      name: 'Широкий',    css: 'Verdana, Geneva, sans-serif',                  weight: 700, spacing: '.09em' },
  { id: 'gothic',    name: 'Плотный',    css: 'Impact, "Arial Black", sans-serif',            weight: 400, spacing: '.03em' },
  { id: 'hand',      name: 'Рукописный', css: '"Segoe Print", "Comic Sans MS", cursive',      weight: 600, spacing: '.01em' }
];

export function nickStyle(user) {
  const f = FONT_CHOICES.find(x => x.id === (user && user.font)) || FONT_CHOICES[0];
  return `font-family:${f.css};font-weight:${f.weight};letter-spacing:${f.spacing};`;
}

export function rid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function makeCode(len = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const c = (self.crypto || window.crypto || globalThis.crypto);
  if (c && c.getRandomValues) {
    const buf = new Uint32Array(len);
    c.getRandomValues(buf);
    for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  } else {
    for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
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

export function safeColor(c, fallback = '#5865f2') {
  const s = String(c || '');
  return /^#[0-9a-f]{3,8}$/i.test(s) ? s : fallback;
}

// Разрешаем только http(s) и картинки в data URL (используется в <img>, скрипты не исполняются)
export function safeUrl(u) {
  const s = String(u || '').trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(s)) return s;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);(base64,|utf8,)[a-z0-9%+.,;:=_\-\/\\\s]+$/i.test(s)) return s;
  return '';
}

const GRADIENT_OK = /^linear-gradient\([0-9a-zA-Z%\s,.#()\-]+\)$/;
export function bannerCss(v, animated = false) {
  const s = String(v || '');
  if (GRADIENT_OK.test(s) && !/url\(/i.test(s)) {
    return 'background:' + s + ';' + (animated ? 'background-size:220% 220%;animation:bannerShift 9s ease infinite;' : '');
  }
  const url = safeUrl(s);
  return url ? `background-image:url("${esc(url)}");background-size:cover;background-position:center;` : '';
}

export function fmtTime(ts) {
  return new Date(ts || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
export function fmtDate(ts) {
  return new Date(ts || Date.now()).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function dayStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; }
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
  try { await navigator.clipboard.writeText(text); return true; }
  catch (_) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
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
  return location.href.split('#')[0] + '#/i/' + encodeURIComponent(code);
}
export function isExpired(inv) {
  return !!inv && !inv.custom && typeof inv.expiresAt === 'number' && inv.expiresAt <= Date.now();
}

/* ---------- аватары и иконки серверов (без смайлов) ---------- */
function glyphContent(a, fallback) {
  if (!a || a.type === 'url') return esc(initials(fallback));
  if (a.type === 'text' || a.type === 'monogram') return esc(String(a.value || '').slice(0, 3) || initials(fallback));
  if (a.type === 'emoji') return esc(initials(fallback)); // старые данные: показываем буквы
  return esc(initials(fallback));
}
export function avatarHtml(user, cls = '') {
  const a = (user && user.avatar) || null;
  const name = accountName(user);
  if (a && a.type === 'url' && safeUrl(a.value)) {
    return `<span class="avatar ${cls}"><img src="${esc(safeUrl(a.value))}" alt=""></span>`;
  }
  const content = glyphContent(a, name);
  const color = safeColor(a && a.color);
  return `<span class="avatar ${cls} avatar-text" style="background:${color}">${content}</span>`;
}
export function serverIconHtml(server, cls = '') {
  const a = (server && server.icon) || null;
  const name = (server && server.name) || 'Сервер';
  if (a && a.type === 'url' && safeUrl(a.value)) {
    return `<span class="server-icon ${cls}"><img src="${esc(safeUrl(a.value))}" alt=""></span>`;
  }
  return `<span class="server-icon ${cls} server-icon-text" style="background:${safeColor(a && a.color)}">${glyphContent(a, name)}</span>`;
}

/* ---------- файлы, картинки, анимация ---------- */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(new Error('Не удалось прочитать файл'));
    fr.readAsDataURL(file);
  });
}

// «Без анимации» = берём первый кадр GIF/WEBP и сохраняем статичный PNG
export function freezeImage(dataUrl) {
  return new Promise(resolve => {
    if (!/^data:image\/(gif|webp)/i.test(dataUrl)) { resolve(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = Math.min(img.naturalWidth || 256, 512);
        c.height = Math.min(img.naturalHeight || 256, 512);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      } catch (_) { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function isAnimatedImage(url) {
  return /^data:image\/(gif|webp|apng)/i.test(String(url || '')) || /\.(gif|webp|apng)(\?|$)/i.test(String(url || ''));
}

/* ---------- пароли: соль и SHA-256 в браузере ---------- */
export function randomSalt() {
  return makeCode(16);
}
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export async function hashPassword(pass, salt) {
  const input = String(salt || '') + '|' + String(pass || '');
  const c = globalThis.crypto || (self && self.crypto) || (window && window.crypto);
  if (c && c.subtle && c.subtle.digest) {
    try {
      const buf = await c.subtle.digest('SHA-256', new TextEncoder().encode(input));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) { /* fallback ниже */ }
  }
  // детерминированный fallback для окружений без WebCrypto
  let a = fnv(input), b = fnv(input.split('').reverse().join(''));
  for (let i = 0; i < 6; i++) { a = fnv(a + b + i); b = fnv(b + a + i); }
  return a + b + a + b;
}
