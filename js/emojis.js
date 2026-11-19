// dogapp — эмоции серверов (без смайлов в интерфейсе).
// Кастомные эмоции = свои картинки/значки сервера, доступны всем, включая друзей.
// В пикере также есть нейтральные типографские символы (не эмодзи).

export const EMOJI_GROUPS = [
  { name: 'Знаки', icon: '✦', items: '✦ ✧ ★ ☆ ✚ ✖ ❖ ⬡ ◉ ◈ ◆ ◇ ● ○ ◐ ◑ ▪ ▫ ■ □ ▲ △ ▼ ▽ ⌘ ⚑ ⌁ ⟡ ⌬ ⌗ ⏣'.split(' ') },
  { name: 'Стрелки', icon: '→', items: '→ ← ↑ ↓ ↗ ↘ ↖ ↙ ↺ ↻ ⇄ ⇅ ⇆ ⇇ ⇉ ⇒ ⟶ ⟵ ↔ ↕ ⇡ ⇣ ⤴ ⤵ ➜ ➝ ➞'.split(' ') },
  { name: 'Текст', icon: '§', items: '§ ¶ № † ‡ • ‰ ⁂ ※ ‼ ⁄ ° ′ ″ × ÷ ± ≈ ≠ ≤ ≥ ∞ ∑ √ ∫ ≡ ≋ ∅ ∈ ∉ ∩ ∪ ⊂ ⊃'.split(' ') },
  { name: 'Скобки', icon: '«', items: '« » ‹ › 【 】「 」『 』〈 〉 《 》 〖 〗 ( ) [ ] { } ⟨ ⟩ ⦅ ⦆ ⌈ ⌉ ⌊ ⌋'.split(' ') },
  { name: 'Техника', icon: '⌘', items: '⌘ ⌥ ⎋ ⏎ ⌫ ⇥ ⇧ ⌃ ⌂ ⏱ ⏲ ⏳ ⌛ ⚙ ⚒ ⚑ ⚐ ⚡ ☢ ☣ ⌨ ⎗ ⎘ ⏭ ⏮ ⏯ ⏸ ⏹ ⏺ ⏻ ⏼'.split(' ') }
];

// Векторный значок эмоции: буква/монограмма вместо смайла.
export function svgEmote(label, bg = '#5865f2') {
  const text = String(label || 'DG').replace(/[<>&"']/g, '').slice(0, 3).toUpperCase();
  const color = /^#[0-9a-f]{3,8}$/i.test(bg) ? bg : '#5865f2';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="${color}"/><circle cx="50" cy="14" r="6" fill="#ffffff" opacity=".22"/><rect x="7" y="46" width="50" height="3" rx="1.5" fill="#ffffff" opacity=".25"/><text x="32" y="41" font-size="29" font-weight="700" font-family="Segoe UI, Arial, sans-serif" text-anchor="middle" fill="#ffffff" letter-spacing="1">${text}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export const DEFAULT_EMOTES = [
  { name: 'doge',  label: 'DG', bg: '#5865f2' },
  { name: 'paws',  label: 'PW', bg: '#eb459e' },
  { name: 'bone',  label: 'BN', bg: '#f0b232' },
  { name: 'party', label: 'PT', bg: '#23a55a' },
  { name: 'fire',  label: 'FR', bg: '#f23f43' },
  { name: 'heart', label: 'HT', bg: '#7b2ff7' },
  { name: 'wave',  label: 'WV', bg: '#0e7a86' },
  { name: 'think', label: 'TH', bg: '#404eed' },
  { name: 'bark',  label: 'BK', bg: '#3ba55d' },
  { name: 'sleep', label: 'SL', bg: '#4e5058' },
  { name: 'code',  label: 'CD', bg: '#2b2d31' },
  { name: 'gg',    label: 'GG', bg: '#c084fc' }
];

export function emoteSet(list, now, author = 'dogapp') {
  const out = {};
  for (const e of list) {
    const id = 'e_' + e.name;
    out[id] = {
      id, name: e.name, url: svgEmote(e.label || e.name, e.bg),
      animated: false, sharedWith: 'all', createdAt: now, uploadedBy: author
    };
  }
  return out;
}

// Все эмоции всех серверов — плоский индекс для рендера сообщений.
// sharedWith: 'all' — эмоцию могут использовать даже те, кто не состоит на сервере (друзья).
export function buildEmoteIndex(state, uid = null) {
  const idx = {};
  for (const srv of Object.values(state.servers || {})) {
    const member = uid ? !!srv.members?.[uid] : true;
    for (const em of Object.values(srv.emojis || {})) {
      if (em.sharedWith === 'server' && !member) continue;
      const key = String(em.name || '').toLowerCase();
      if (key) idx[key] = { ...em, serverName: srv.name, serverId: srv.id };
    }
  }
  return idx;
}
