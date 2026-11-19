// dogapp — логика приложения: события, действия, Firebase-записи
import { store } from './store.js';
import { render } from './render.js';
import { modalHtml, emojiPickerHtml, popoverHtml } from './modals.js';
import {
  INVITE_TTL, BANNER_PRESETS, rid, makeCode, slugify, esc, clamp, safeUrl,
  copyText, toast, inviteUrl, isExpired, timeLeft
} from './util.js';
import { emoteSet, DEFAULT_EMOTES, buildEmoteIndex } from './emojis.js';

const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));

const view = {
  section: 'home',            // 'home' | 'server' | 'dm'
  serverId: null, channelId: null, dmId: null,
  homeTab: 'friends', friendsTab: 'online',
  search: '', dmQuery: '', showMembers: true, collapsed: new Set(),
  drafts: {}, replyTo: null, editing: null, pendingAttachment: null,
  modal: null, modalTab: 'overview', picker: null, popover: null, invitePage: null,
  mic: true, deaf: false
};

/* ======================= ЗАПУСК ======================= */
const LOAD_LINES = [
  'Проверяем обновления…', 'Подключаемся к Firebase…', 'Загружаем серверы…',
  'Проверяем баннеры…', 'Открываем бесплатные эмоции…', 'Проверяем приглашения…', 'Почти готово, гав! 🐾'
];
let lineIdx = 0;
const lineTimer = setInterval(() => {
  lineIdx = (lineIdx + 1) % LOAD_LINES.length;
  const n = $('loader-status');
  if (n) n.textContent = LOAD_LINES[lineIdx];
}, 420);

async function boot() {
  let mode = 'local';
  try {
    [mode] = await Promise.all([store.init(), wait(1600)]);
  } catch (e) {
    toast('Не удалось запустить хранилище: ' + e.message, 'error');
  }
  clearInterval(lineTimer);
  $('loader-status').textContent = 'Готово! Гав 🐾';
  $('loader-conn').textContent = mode === 'firebase' ? '● Firebase подключён' : '● Демо-режим (localStorage)';
  $('loader').classList.add('loader-out');
  setTimeout(() => { $('loader').hidden = true; }, 520);

  const first = store.myServers()[0];
  if (first) selectServer(first.id, true);
  else { view.section = 'home'; }

  store.on(() => { render(store, view); refreshOverlays(true); });
  setupEvents();
  const hash = parseHash();
  view.invitePage = hash;
  render(store, view);
  refreshOverlays();
  if (mode === 'local') {
    setTimeout(() => toast('Firebase недоступен из браузера → демо-режим. Открой «Настройки → Подключение», чтобы указать базу.', 'warn'), 900);
  }
  setInterval(() => { render(store, view); refreshOverlays(); }, 30000); // таймеры ссылок
}

/* ======================= НАВИГАЦИЯ ======================= */
function parseHash() {
  const m = location.hash.match(/^#\/i\/([A-Za-z0-9_-]{1,24})$/i);
  return m ? m[1] : null;
}
function clearHash() {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  view.invitePage = null;
}
function currentKey() {
  if (view.section === 'server' && view.channelId) return view.channelId;
  if (view.section === 'dm' && view.dmId) return view.dmId;
  return null;
}
function firstTextChannel(srv) {
  const list = Object.values(srv.channels || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
  return list.find(c => c.type === 'text' && /общ|general/i.test(c.name)) || list.find(c => c.type === 'text') || list[0];
}
function selectServer(id, silent = false) {
  const srv = store.state.servers[id];
  if (!srv) return;
  if (!srv.members?.[store.uid]) { toast('Ты не состоишь на этом сервере — зайди по приглашению', 'warn'); return; }
  view.section = 'server'; view.serverId = id;
  view.channelId = firstTextChannel(srv)?.id || null;
  view.dmId = null; view.search = ''; view.replyTo = null; view.editing = null;
  view.pendingAttachment = null; view.popover = null; view.picker = null;
  clearHash();
  if (!silent) { render(store, view); refreshOverlays(); }
}
function goHome() {
  view.section = 'home'; view.serverId = null; view.channelId = null; view.dmId = null;
  view.search = ''; view.replyTo = null; view.editing = null; view.popover = null; view.picker = null;
  clearHash(); render(store, view); refreshOverlays();
}
function selectDm(id) {
  view.section = 'dm'; view.dmId = id; view.serverId = null; view.channelId = null;
  view.search = ''; view.replyTo = null; view.editing = null; view.popover = null;
  clearHash(); render(store, view); refreshOverlays();
}

/* ======================= ОВЕРЛЕИ ======================= */
function refreshOverlays(fromPoll = false) {
  const mr = $('modal-root');
  if (view.modal) {
    const ae = document.activeElement;
    const typingInside = fromPoll && ae && mr.contains(ae);
    if (!typingInside) mr.innerHTML = `<div class="modal-overlay" data-action="overlay">${modalHtml(store, view)}</div>`;
  } else if (mr.innerHTML) mr.innerHTML = '';

  const pr = $('popout-root');
  if (view.popover) {
    const html = popoverHtml(store, view);
    pr.innerHTML = html;
    const el = pr.firstElementChild;
    const pos = view.popover.pos || { left: 260, top: 60 };
    if (el) { el.style.left = pos.left + 'px'; el.style.top = pos.top + 'px'; }
  } else if (pr.innerHTML) pr.innerHTML = '';

  const ep = $('emoji-picker');
  if (view.picker) {
    ep.hidden = false;
    ep.innerHTML = emojiPickerHtml(store, view);
  } else { ep.hidden = true; ep.innerHTML = ''; }
}

function openModal(type, tab) {
  view.modal = type;
  view.modalTab = tab || (type === 'user-settings' ? 'profile' : 'overview');
  view.popover = null; view.picker = null;
  refreshOverlays();
}
function closeModal() { view.modal = null; refreshOverlays(); }

function openPicker(mode, reactTo, anchor) {
  view.picker = { mode, reactTo: reactTo || null, query: '', group: 'servers' };
  view.popover = null;
  const ep = $('emoji-picker');
  ep.hidden = false;
  ep.innerHTML = emojiPickerHtml(store, view);
  const r = anchor?.getBoundingClientRect?.() || { right: window.innerWidth - 280, top: window.innerHeight - 120 };
  ep.style.left = Math.max(8, Math.min(window.innerWidth - 356, r.right - 340)) + 'px';
  ep.style.top = Math.max(8, Math.min(window.innerHeight - 460, r.top - 420)) + 'px';
  const inp = ep.querySelector('[data-role="emoji-search"]');
  if (inp) inp.focus();
}
function closePicker() { view.picker = null; refreshOverlays(); }

function showPopover(type, anchor, extra = {}) {
  const r = anchor?.getBoundingClientRect?.() || { left: 250, bottom: 100, top: 80 };
  const left = type === 'server-menu'
    ? Math.min(window.innerWidth - 250, Math.max(8, r.left + 8))
    : Math.min(window.innerWidth - 340, Math.max(8, r.left - 320));
  const top = type === 'server-menu' ? Math.min(window.innerHeight - 330, r.bottom + 8) : Math.min(window.innerHeight - 420, Math.max(8, r.top));
  view.popover = { type, pos: { left, top }, ...extra };
  view.picker = null;
  refreshOverlays();
}

/* ======================= ПРИГЛАШЕНИЯ ======================= */
function createInvite(serverId, rawCode, custom) {
  const code = custom ? slugify(rawCode) : makeCode(8);
  if (!code || code.length < 2) throw new Error('Адрес должен быть от 2 символов (латиница, цифры, - или _)');
  if (store.state.invites[code]) throw new Error('Адрес dogapp.gg/' + code + ' уже занят');
  if (Object.values(store.state.servers).some(s => s.vanity === code && s.id !== serverId)) throw new Error('Этот адрес уже использует другой сервер');
  if (custom) {
    for (const [c, inv] of Object.entries(store.state.invites)) {
      if (inv.serverId === serverId && inv.custom) store.del(['invites', c]);
    }
    store.patch(['servers', serverId], { vanity: code });
  }
  store.set(['invites', code], {
    code, serverId, custom, createdAt: Date.now(),
    expiresAt: custom ? null : Date.now() + INVITE_TTL,
    creatorId: store.uid, uses: 0
  });
  return code;
}
function revokeInvite(code) {
  const inv = store.state.invites[code];
  if (!inv) return;
  const srv = store.state.servers[inv.serverId];
  if (inv.custom && srv?.vanity === code) store.patch(['servers', inv.serverId], { vanity: '' });
  store.del(['invites', code]);
  toast('Ссылка dogapp.gg/' + code + ' удалена');
}
function joinServerDirect(serverId) {
  const srv = store.state.servers[serverId];
  if (!srv) return;
  if (srv.members?.[store.uid]) { selectServer(serverId); return; }
  store.set(['servers', serverId, 'members', store.uid], { role: 'member', joinedAt: Date.now() });
  selectServer(serverId);
  toast('Ты на сервере «' + clamp(srv.name, 30) + '» 🐾', 'ok');
}
function joinInvite(code) {
  const inv = store.state.invites[code];
  if (!inv) { toast('Приглашение не найдено', 'error'); return; }
  const srv = store.state.servers[inv.serverId];
  if (!srv) { toast('Сервер больше не существует', 'error'); return; }
  if (isExpired(inv)) { toast('Срок действия ссылки истёк (3 дня)', 'warn'); return; }
  store.patch(['invites', code], { uses: (inv.uses || 0) + 1 });
  joinServerDirect(inv.serverId);
  toast('Добро пожаловать на «' + clamp(srv.name, 30) + '»! ' + (inv.custom ? 'Кастомная ссылка.' : 'Ссылка живёт ещё ' + timeLeft(inv.expiresAt - Date.now())), 'ok');
}

/* ======================= ДЕЙСТВИЯ С ДАННЫМИ ======================= */
function sendMessage() {
  const key = currentKey();
  if (!key) return;
  const text = (view.drafts[key] || '').trim();
  const att = view.pendingAttachment;
  if (!text && !att) return;

  if (view.editing) {
    const id = view.editing;
    store.patch(['messages', key, id], { content: text, editedAt: Date.now() });
    view.editing = null;
    toast('Сообщение изменено');
  } else {
    const msg = {
      id: rid('m'), authorId: store.uid, content: text, createdAt: Date.now(), reactions: {}
    };
    if (view.replyTo) msg.replyTo = view.replyTo;
    if (att) msg.attachment = { name: att.name, url: att.url };
    store.set(['messages', key, msg.id], msg);
  }
  view.drafts[key] = '';
  view.replyTo = null; view.pendingAttachment = null;
  store.del(['typing', key, store.uid]);
  render(store, view);
  const ta = $('composer').querySelector('textarea');
  if (ta) ta.focus();
}
function toggleReaction(id, emoji) {
  const key = currentKey();
  const m = store.state.messages[key]?.[id];
  if (!m) return;
  const arr = Array.isArray(m.reactions?.[emoji]) ? [...m.reactions[emoji]] : [];
  const i = arr.indexOf(store.uid);
  if (i >= 0) arr.splice(i, 1); else arr.push(store.uid);
  if (arr.length) store.set(['messages', key, id, 'reactions', emoji], arr);
  else store.del(['messages', key, id, 'reactions', emoji]);
}
function insertText(token) {
  const key = currentKey();
  if (!key) return;
  view.drafts[key] = (view.drafts[key] || '') + (view.drafts[key] && !/\s$/.test(view.drafts[key]) ? ' ' : '') + token + ' ';
  render(store, view);
  const ta = $('composer').querySelector('textarea');
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  noteTyping();
}

let lastTyping = 0, clearTypingTimer = null;
function noteTyping() {
  const key = currentKey();
  if (!key || Date.now() - lastTyping < 900) return;
  lastTyping = Date.now();
  store.set(['typing', key, store.uid], { name: store.me().name || 'Пёс', at: Date.now() }, true);
  clearTimeout(clearTypingTimer);
  clearTypingTimer = setTimeout(() => store.del(['typing', key, store.uid], true), 4000);
}

function createServer(fd) {
  const v = k => String(fd.get(k) || '').trim();
  const name = v('name');
  if (!name) throw new Error('Введи название сервера');
  const vanityRaw = v('vanity');
  const banUrl = safeUrl(v('bannerUrl'));
  const iconUrl = safeUrl(v('iconUrl'));
  const banner = banUrl || v('banner') || BANNER_PRESETS[0].value;
  const icon = iconUrl ? { type: 'url', value: iconUrl } : { type: 'emoji', value: v('icon') || '🐕' };
  const now = Date.now();
  const sid = rid('s');
  const cidWelcome = rid('c'), cidGeneral = rid('c'), cidVoice = rid('c');
  const srv = {
    id: sid, name: name.slice(0, 60), description: v('description'), icon, banner,
    ownerId: store.uid, vanity: vanityRaw ? slugify(vanityRaw) : '', createdAt: now,
    channels: {
      [cidWelcome]: { id: cidWelcome, name: 'добро-пожаловать', type: 'text', topic: 'Начните отсюда 🐾', category: 'ИНФОРМАЦИЯ', order: 0 },
      [cidGeneral]: { id: cidGeneral, name: 'общий', type: 'text', topic: 'Главный чат сервера', category: 'ТЕКСТОВЫЕ КАНАЛЫ', order: 1 },
      [cidVoice]: { id: cidVoice, name: 'Общий голос', type: 'voice', topic: '', category: 'ГОЛОСОВЫЕ КАНАЛЫ', order: 2 }
    },
    members: { [store.uid]: { role: 'owner', joinedAt: now } },
    emojis: emoteSet(DEFAULT_EMOTES.slice(0, 8), now, store.me().name || 'Владелец')
  };
  store.set(['servers', sid], srv);
  const greetingId = rid('m');
  store.set(['messages', cidGeneral, greetingId], {
    id: greetingId, authorId: 'u_bot', createdAt: now, reactions: {},
    content: `**Сервер «${name}» создан!** 🎉 :party:\nПриглашай друзей: кастомная ссылка не истекает, а обычная живёт **3 дня**. И не забудь поставить баннер в настройках сервера.`
  });
  let code;
  try { code = createInvite(sid, vanityRaw || makeCode(8), !!vanityRaw); }
  catch (e) { code = makeCode(8); createInvite(sid, code, false); toast(e.message, 'warn'); }
  closeModal();
  selectServer(sid);
  view.channelId = cidGeneral;
  render(store, view);
  copyText(inviteUrl(code));
  toast('Сервер «' + clamp(name, 28) + '» готов! Ссылка dogapp.gg/' + code + ' скопирована', 'ok');
}

function addChannel(fd) {
  const srv = store.state.servers[view.serverId];
  if (!srv) throw new Error('Сначала открой сервер');
  const v = k => String(fd.get(k) || '').trim();
  const name = v('name');
  if (!name) throw new Error('Введи название канала');
  const list = Object.values(srv.channels || {});
  const cid = rid('c');
  store.set(['servers', srv.id, 'channels', cid], {
    id: cid, name: name.replace(/\s+/g, '-').toLowerCase().slice(0, 40),
    type: v('type') === 'voice' ? 'voice' : 'text', topic: v('topic'),
    category: v('category') || 'КАНАЛЫ', order: Math.max(0, ...list.map(c => c.order || 0)) + 1
  });
  closeModal();
  if (v('type') !== 'voice') { view.channelId = cid; render(store, view); }
  toast('Канал #' + clamp(name, 24) + ' создан', 'ok');
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Не удалось прочитать файл'));
    fr.readAsDataURL(file);
  });
}
async function addEmoji(form) {
  const srv = store.state.servers[view.serverId];
  if (!srv) throw new Error('Открой сервер');
  const fd = new FormData(form);
  const name = String(fd.get('name') || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{2,32}$/.test(name)) throw new Error('Название: латиница, цифры и _ , от 2 до 32 символов');
  if (buildEmoteIndex(store.state)[name]) throw new Error('Эмоция :' + name + ': уже существует');
  let url = safeUrl(String(fd.get('url') || '').trim());
  const file = form.querySelector('[name="file"]')?.files?.[0];
  if (!url && file) {
    if (file.size > 200 * 1024) throw new Error('Файл больше 200 КБ — возьми картинку поменьше');
    url = safeUrl(await fileToDataUrl(file));
  }
  if (!url) throw new Error('Укажи ссылку на картинку или загрузи файл');
  const eid = 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  store.set(['servers', srv.id, 'emojis', eid], {
    id: eid, name, url, animated: /\.gif/i.test(url), createdAt: Date.now(), uploadedBy: store.uid
  });
  refreshOverlays();
  toast('Эмоция :' + name + ': добавлена — бесплатна для всех 🐾', 'ok');
}
function startDm(uid) {
  const u = store.state.users[uid];
  if (!u) return;
  let dm = Object.values(store.state.dms || {}).find(d => (d.users || []).includes(uid) && (d.users || []).includes(store.uid));
  if (!dm) {
    const id = rid('dm');
    dm = { id, users: [store.uid, uid], name: u.name, avatar: u.avatar, createdAt: Date.now() };
    store.set(['dms', id], dm);
  }
  closeModal();
  selectDm(dm.id);
}

/* ======================= СОБЫТИЯ ======================= */
function setupEvents() {
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-action]');
    if (!t) {
      if (view.popover) { view.popover = null; refreshOverlays(); }
      if (view.picker && !e.target.closest('#emoji-picker')) closePicker();
      return;
    }
    const a = t.dataset.action;
    const id = t.dataset.id, code = t.dataset.code, uid = t.dataset.uid;

    // клик по фону модалки
    if (a === 'overlay') { if (e.target === t) closeModal(); return; }

    switch (a) {
      case 'home': goHome(); break;
      case 'select-server': selectServer(id); break;
      case 'select-channel': {
        const srv = store.state.servers[view.serverId];
        const ch = srv?.channels?.[id];
        if (!ch) break;
        if (ch.type === 'voice') { toast('🔊 Голосовой канал «' + clamp(ch.name, 24) + '» — подключайся в демо-режиме пока нельзя', 'warn'); break; }
        view.channelId = id; view.search = ''; view.replyTo = null; view.editing = null;
        render(store, view);
        break;
      }
      case 'select-dm': selectDm(id); break;
      case 'home-tab': view.homeTab = t.dataset.tab; view.section = 'home'; render(store, view); break;
      case 'friends-tab': view.friendsTab = t.dataset.tab; render(store, view); break;
      case 'toggle-cat': {
        const g = t.dataset.cat;
        if (view.collapsed.has(g)) view.collapsed.delete(g); else view.collapsed.add(g);
        render(store, view);
        break;
      }
      case 'toggle-members': view.showMembers = !view.showMembers; render(store, view); break;
      case 'toggle-mic': view.mic = !view.mic; render(store, view); break;
      case 'toggle-deaf': view.deaf = !view.deaf; render(store, view); break;

      case 'create-server': openModal('create-server'); break;
      case 'create-channel': openModal('create-channel'); break;
      case 'server-settings': openModal('server-settings', 'overview'); break;
      case 'server-invites': openModal('server-settings', 'invites'); break;
      case 'server-emotes': openModal('server-settings', 'emojis'); break;
      case 'my-invites': if (view.serverId) openModal('server-settings', 'invites'); else openModal('explore'); break;
      case 'invite-people': openModal('server-settings', 'invites'); break;
      case 'settings': openModal('user-settings', 'profile'); break;
      case 'connection': openModal('user-settings', 'connection'); break;
      case 'about': openModal('user-settings', 'about'); break;
      case 'explore': openModal('explore'); break;
      case 'new-dm': openModal('new-dm'); break;
      case 'media': openModal('media'); break;
      case 'gif': openModal('media'); break;
      case 'close-modal': closeModal(); break;
      case 'modal-tab': view.modalTab = t.dataset.tab; refreshOverlays(); break;

      case 'server-menu': {
        if (view.popover?.type === 'server-menu') { view.popover = null; refreshOverlays(); }
        else showPopover('server-menu', t);
        break;
      }
      case 'profile': {
        if (view.popover?.type === 'profile' && view.popover.uid === uid) { view.popover = null; refreshOverlays(); }
        else showPopover('profile', t, { uid });
        break;
      }

      case 'emoji-picker': {
        const mode = t.dataset.mode || 'composer';
        const reactTo = mode === 'reaction' ? t.dataset.id : null;
        if (view.picker && (reactTo ? view.picker.reactTo === reactTo : !view.picker.reactTo)) closePicker();
        else openPicker(mode, reactTo, t);
        break;
      }
      case 'close-picker': closePicker(); break;
      case 'insert-emoji': insertText(t.dataset.token); closePicker(); break;
      case 'pick-react': toggleReaction(t.dataset.id, t.dataset.emoji); closePicker(); break;

      case 'send': sendMessage(); break;
      case 'react': toggleReaction(id, t.dataset.emoji); break;
      case 'reply': view.replyTo = id; view.editing = null; render(store, view); $('composer')?.querySelector('textarea')?.focus(); break;
      case 'cancel-reply': view.replyTo = null; render(store, view); break;
      case 'edit-msg': {
        const key = currentKey(), m = store.state.messages[key]?.[id];
        if (!m) break;
        view.editing = id; view.replyTo = null; view.drafts[key] = m.content || '';
        render(store, view); $('composer')?.querySelector('textarea')?.focus();
        break;
      }
      case 'cancel-edit': view.editing = null; render(store, view); break;
      case 'delete-msg': {
        const key = currentKey();
        if (key) store.del(['messages', key, id]);
        toast('Сообщение удалено');
        break;
      }
      case 'copy-msg': {
        const key = currentKey(), m = store.state.messages[key]?.[id];
        if (m && await copyText(m.content || '')) toast('Текст скопирован');
        break;
      }
      case 'copy-text': if (await copyText(t.dataset.text || '')) toast('Ссылка скопирована 📋', 'ok'); break;
      case 'copy-invite': {
        const srv = store.state.servers[view.serverId];
        if (!srv) break;
        let c;
        try { c = createInvite(srv.id, makeCode(8), false); }
        catch (err) { toast(err.message, 'error'); break; }
        await copyText(inviteUrl(c));
        toast('Ссылка dogapp.gg/' + c + ' скопирована · живёт 3 дня', 'ok');
        break;
      }
      case 'revoke-invite': revokeInvite(code); refreshOverlays(); break;
      case 'open-invite': location.hash = '#/i/' + encodeURIComponent(code); if (parseHash() === code) { view.invitePage = code; render(store, view); } break;
      case 'join-invite': joinInvite(code); break;
      case 'go-app': clearHash(); render(store, view); refreshOverlays(); break;
      case 'join-server': joinServerDirect(id); closeModal(); break;
      case 'start-dm': startDm(uid); break;

      case 'delete-emoji': store.del(['servers', view.serverId, 'emojis', id]); refreshOverlays(); toast('Эмоция удалена'); break;
      case 'delete-channel': {
        if (view.channelId === id) view.channelId = firstTextChannel(store.state.servers[view.serverId])?.id || null;
        store.del(['servers', view.serverId, 'channels', id]);
        store.del(['messages', id]);
        refreshOverlays(); render(store, view); toast('Канал удалён');
        break;
      }
      case 'leave-server': {
        const srv = store.state.servers[view.serverId];
        if (!srv) break;
        store.del(['servers', srv.id, 'members', store.uid]);
        closeModal(); goHome(); toast('Ты покинул «' + clamp(srv.name, 28) + '»');
        break;
      }
      case 'delete-server': {
        const srv = store.state.servers[view.serverId];
        if (!srv || srv.ownerId !== store.uid) break;
        if (!confirm('Удалить сервер «' + srv.name + '» навсегда? Сообщения и ссылки тоже исчезнут.')) break;
        for (const [c, inv] of Object.entries(store.state.invites)) if (inv.serverId === srv.id) store.del(['invites', c]);
        for (const cid of Object.keys(srv.channels || {})) store.del(['messages', cid]);
        store.del(['servers', srv.id]);
        closeModal(); goHome(); toast('Сервер удалён');
        break;
      }
      case 'recheck': {
        toast('Проверяем соединение…');
        try { const m = await store.recheck(); toast(m === 'firebase' ? 'Firebase подключён ✅' : 'Firebase недоступен — демо-режим', m === 'firebase' ? 'ok' : 'warn'); }
        catch (err) { toast(err.message, 'error'); }
        refreshOverlays(); render(store, view);
        break;
      }
      case 'attach': $('file-input').click(); break;
      case 'cancel-attach': view.pendingAttachment = null; render(store, view); break;
      case 'gift': toast('🎁 В dogapp подарки тоже бесплатны — просто кидай :party:'); break;
      case 'sticker': {
        const idx = buildEmoteIndex(store.state);
        const names = Object.keys(idx);
        const n = names[Math.floor(Math.random() * names.length)];
        if (n) insertText(':' + n + ':'); else toast('Добавь эмоции в настройках сервера 🐾', 'warn');
        break;
      }
      case 'todo': toast('🐾 dogapp: баннеры, бесплатные эмоции и ссылки уже работают. Остальное — скоро!'); break;
      default: break;
    }
  });

  // формы
  document.addEventListener('submit', async e => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const fd = new FormData(form);
    const v = k => String(fd.get(k) || '').trim();
    try {
      switch (form.dataset.form) {
        case 'create-server': createServer(fd); break;
        case 'server-overview': {
          const srv = store.state.servers[view.serverId];
          if (!srv) break;
          const banUrl = safeUrl(v('bannerUrl')), iconUrl = safeUrl(v('iconUrl'));
          store.patch(['servers', srv.id], {
            name: v('name') || srv.name,
            description: v('description'),
            banner: banUrl || v('banner') || srv.banner,
            icon: iconUrl ? { type: 'url', value: iconUrl } : { type: 'emoji', value: v('icon') || '🐕' }
          });
          toast('Сервер обновлён ✨', 'ok'); refreshOverlays(); render(store, view);
          break;
        }
        case 'vanity': {
          const srv = store.state.servers[view.serverId];
          if (!srv) break;
          const slug = slugify(v('vanity'));
          if (!slug) throw new Error('Введи адрес: латиница, цифры, дефис');
          if (srv.vanity === slug) { toast('Этот адрес уже у сервера'); break; }
          const c = createInvite(srv.id, slug, true);
          await copyText(inviteUrl(c));
          toast('Кастомная ссылка dogapp.gg/' + c + ' готова и скопирована · не истекает', 'ok');
          refreshOverlays(); render(store, view);
          break;
        }
        case 'invite': {
          const srv = store.state.servers[view.serverId];
          if (!srv) break;
          const c = createInvite(srv.id, makeCode(8), false);
          await copyText(inviteUrl(c));
          toast('Ссылка dogapp.gg/' + c + ' создана · истечёт через 3 дня', 'ok');
          refreshOverlays();
          break;
        }
        case 'emoji': await addEmoji(form); break;
        case 'channel': addChannel(fd); break;
        case 'profile': {
          const banUrl = safeUrl(v('bannerUrl')), iconUrl = safeUrl(v('iconUrl'));
          store.patch(['users', store.uid], {
            name: v('name') || 'Пёс',
            tag: (v('tag').replace(/\D/g, '') || '0001').slice(0, 4).padEnd(4, '0'),
            status: v('status'), bio: v('bio'),
            banner: banUrl || v('banner') || BANNER_PRESETS[0].value,
            avatar: iconUrl ? { type: 'url', value: iconUrl } : { type: 'emoji', value: v('icon') || '🐕' }
          });
          toast('Профиль сохранён · баннер обновлён 🐾', 'ok');
          closeModal(); render(store, view);
          break;
        }
        case 'fb': {
          toast('Подключаемся к ' + v('url') + '…');
          try { const m = await store.recheck(v('url')); toast(m === 'firebase' ? 'Firebase подключён ✅' : 'Не удалось подключиться — демо-режим', m === 'firebase' ? 'ok' : 'warn'); }
          catch (err) { toast(err.message, 'error'); }
          refreshOverlays(); render(store, view);
          break;
        }
        case 'media': {
          const url = safeUrl(v('url'));
          if (!url) throw new Error('Нужна прямая https:// ссылка на картинку');
          insertText(`![${v('caption') || 'картинка'}](${url})`);
          closeModal(); render(store, view);
          break;
        }
        case 'invite-code': {
          const c = slugify(v('code'));
          if (!c) throw new Error('Введи код приглашения');
          closeModal();
          location.hash = '#/i/' + encodeURIComponent(c);
          view.invitePage = c; render(store, view);
          break;
        }
        default: break;
      }
    } catch (err) {
      toast(err.message || 'Что-то пошло не так', 'error');
    }
  });

  // ввод
  document.addEventListener('input', e => {
    const role = e.target.dataset?.role;
    if (role === 'composer') {
      const key = currentKey();
      if (!key) return;
      view.drafts[key] = e.target.value;
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(160, Math.max(24, e.target.scrollHeight)) + 'px';
      noteTyping();
    } else if (role === 'search') {
      view.search = e.target.value; render(store, view);
    } else if (role === 'dm-search') {
      view.dmQuery = e.target.value; render(store, view);
    } else if (role === 'emoji-search') {
      if (!view.picker) return;
      view.picker.query = e.target.value;
      const ep = $('emoji-picker');
      const pos = e.target.selectionStart;
      ep.innerHTML = emojiPickerHtml(store, view);
      const inp = ep.querySelector('[data-role="emoji-search"]');
      if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (_) { } }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (view.picker) closePicker();
      else if (view.popover) { view.popover = null; refreshOverlays(); }
      else if (view.modal) closeModal();
      else if (view.replyTo || view.editing) { view.replyTo = null; view.editing = null; render(store, view); }
      return;
    }
    if (e.target.dataset?.role === 'composer' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); sendMessage();
    }
  });

  // вложения
  $('file-input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 400 * 1024) { toast('Картинка больше 400 КБ — возьми поменьше', 'warn'); return; }
    try {
      const url = safeUrl(await fileToDataUrl(file));
      if (!url) throw new Error('Не удалось прочитать картинку');
      view.pendingAttachment = { name: file.name, url };
      render(store, view);
      toast('Картинка прикреплена — жми Enter');
    } catch (err) { toast(err.message, 'error'); }
  });

  window.addEventListener('hashchange', () => {
    view.invitePage = parseHash();
    if (!view.invitePage) { view.modal = null; view.popover = null; view.picker = null; }
    render(store, view); refreshOverlays();
  });
  window.addEventListener('resize', () => { if (view.picker) closePicker(); });
}

boot();
