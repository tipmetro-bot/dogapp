// dogapp — эмоции. Стандартные + кастомные эмоции серверов (бесплатно для всех)
export const EMOJI_GROUPS = [
  { name: 'Улыбки', icon: '😀', items: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 😈 👿 💀 👻 👽 🤖'.split(' ') },
  { name: 'Жесты', icon: '👋', items: '👋 🤚 🖐 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 👍 👎 ✊ 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 💪 🦾 ✍️ 💅 🤳 👀 👁 👄 🦷 👅 👂 👃 🧠 🫀'.split(' ') },
  { name: 'Собаки', icon: '🐶', items: '🐶 🐕 🦮 🐕‍🦺 🐩 🐱 🐈 🐈‍⬛ 🐾 🦴 🦊 🦝 🐺 🐻 🐼 🐰 🐹 🐭 🦔 🦄 🐴 🐮 🐷 🐸 🐵 🦁 🐯 🐨 🐔 🐧 🦆 🦉 🦇 🐢 🐍 🐙 🦀 🐟 🐬 🐳 🦈'.split(' ') },
  { name: 'Еда', icon: '🍕', items: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍣 🍱 🍙 🍚 🍘 🍥 🥟 🍢 🍡 🍦 🍰 🎂 🧁 🍫 🍬 🍭 🍯 ☕ 🍵 🧃 🥤 🧋 🍺 🍻 🥂 🍷'.split(' ') },
  { name: 'Предметы', icon: '🎮', items: '🎮 🕹 🎲 🧩 🎯 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎸 🎺 🎻 💻 🖥 ⌨️ 🖱 💾 📱 ☎️ 📷 📸 🎥 📺 ⏰ ⌛ 🔋 🔌 💡 🔦 🕯 🧯 🛒 💰 💳 💎 ⚖️ 🔧 🔨 🛠 ⚙️ 🧲 🔫 💣 🧨 🏆 🥇 🎁 🎈 🎉 🎊 ✨ 🎀 🏷 📦 ✉️ 📨 📩 📤 📥 📝 📌 📎 📏 📐 ✂️ 🗑 🔒 🔑 🔓 📖 📚 🧾 📊 📈 📉'.split(' ') },
  { name: 'Символы', icon: '❤️', items: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉 ☯️ ✡️ 🔯 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 ⛔ 🚫 ❌ ⭕ 💢 💥 💫 💦 💨 🔥 ⭐ 🌟 ✨ ⚡ ☀️ 🌈 ☁️ 🌙 ⛅ ❄️ ☃️ ⛄ 💧 🌊 ✅ ✔️ ➕ ➖ ➗ ❓ ❗ 💯'.split(' ') }
];

// SVG-«эмодзи» для демо-набора серверов. В настройках можно загрузить своё изображение.
export function svgEmote(char, bg = '#5865f2') {
  const safe = String(char || '🐾').replace(/[<>&"']/g, '');
  const color = /^#[0-9a-f]{3,8}$/i.test(bg) ? bg : '#5865f2';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="${color}"/><text x="32" y="46" font-size="43" text-anchor="middle" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">${safe}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export const DEFAULT_EMOTES = [
  { name: 'doge',   char: '🐶', bg: '#5865f2' },
  { name: 'paws',   char: '🐾', bg: '#eb459e' },
  { name: 'bone',   char: '🦴', bg: '#f0b232' },
  { name: 'party',  char: '🎉', bg: '#23a55a' },
  { name: 'fire',   char: '🔥', bg: '#f23f43' },
  { name: 'heart',  char: '💜', bg: '#7b2ff7' },
  { name: 'wave',   char: '👋', bg: '#0e7a86' },
  { name: 'think',  char: '🤔', bg: '#404eed' },
  { name: 'bark',   char: '🐕', bg: '#3ba55d' },
  { name: 'sleep',  char: '😴', bg: '#4e5058' },
  { name: 'code',   char: '💻', bg: '#2b2d31' },
  { name: 'gg',     char: '🎮', bg: '#c084fc' }
];

export function emoteSet(list, now, author = 'dogapp') {
  const out = {};
  for (const e of list) {
    const id = 'e_' + e.name;
    out[id] = { id, name: e.name, url: svgEmote(e.char, e.bg), animated: false, createdAt: now, uploadedBy: author };
  }
  return out;
}

// Все эмоции всех серверов — один плоский индекс для рендера сообщений
export function buildEmoteIndex(state) {
  const idx = {};
  for (const srv of Object.values(state.servers || {})) {
    for (const em of Object.values(srv.emojis || {})) {
      const key = String(em.name || '').toLowerCase();
      if (key) idx[key] = { ...em, serverName: srv.name };
    }
  }
  return idx;
}
