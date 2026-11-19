// dogapp — рендер интерфейса (Discord-like)
import {
  esc, clamp, safeUrl, safeColor, bannerCss, avatarHtml, serverIconHtml, nickStyle,
  fmtTime, fmtFull, fmtDate, relTime, timeLeft, isExpired, plural, inviteUrl,
  isRealAccount, accountName
} from './util.js';
import { icon } from './icons.js';
import { buildEmoteIndex } from './emojis.js';
import { invitePageHtml } from './modals.js';
import { friendsViewHtml, friendIds, requestsIn } from './friends.js';
import { callHeaderButtons } from './calls.js';

const $ = id => document.getElementById(id);

function context(store, view) {
  const s = store.state;
  const srv = view.section === 'server' ? s.servers[view.serverId] : null;
  const chan = srv ? srv.channels?.[view.channelId] : null;
  const dm = view.section === 'dm' ? s.dms[view.dmId] : null;
  const key = chan ? chan.id : (dm ? dm.id : null);
  const name = chan ? chan.name : (dm ? dm.name : 'Друзья');
  return { s, srv, chan, dm, key, name };
}

function isOnline(u, me, id) {
  return id === me || ((u?.lastSeen || 0) > Date.now() - 120000);
}
function realUser(s, id) { return isRealAccount(s.users?.[id], s.accounts); }
function roleColor(u, srv, id) {
  const role = srv?.members?.[id]?.role;
  if (role === 'owner') return '#f0b232';
  if (role === 'admin') return '#eb459e';
  if (role === 'bot') return '#7d8bff';
  return safeColor(u?.color, '#f2f3f5');
}
function groupLabel(g) {
  return `<div class="chan-label" data-action="toggle-cat" data-cat="${esc(g)}">
    ${icon('chevron', 12)}<span>${esc(g)}</span>
    <button class="chan-label-plus" data-action="create-channel" data-tip="Создать канал">${icon('plus', 14)}</button>
  </div>`;
}

/* ---------- форматирование текста сообщений ---------- */
function formatContent(raw, emoteIdx) {
  const stash = [];
  const put = html => { stash.push(html); return '\u0001' + (stash.length - 1) + '\u0001'; };
  let t = esc(raw || '');

  t = t.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi, (_, alt, url) => {
    const safe = safeUrl(url);
    return safe ? put(`<img class="msg-image" src="${esc(safe)}" alt="${esc(alt)}" loading="lazy">`) : _;
  });
  t = t.replace(/`([^`\n]+)`/g, (_, c) => put(`<code>${c}</code>`));
  t = t.replace(/:([a-z0-9_]{2,32}):/gi, (full, name) => {
    const e = emoteIdx[name.toLowerCase()];
    if (!e || !safeUrl(e.url)) return full;
    return put(`<img class="emote" src="${esc(safeUrl(e.url))}" alt="${full}" title="${esc(full + ' · ' + (e.serverName || 'сервер'))}" loading="lazy">`);
  });
  t = t.replace(/(https?:\/\/[^\s<"]+|#\/i\/[A-Za-z0-9_-]{2,24}|dogapp\.gg\/[A-Za-z0-9_-]{2,24})/gi, token => {
    if (/^#\/i\//.test(token) || /^dogapp\.gg\//i.test(token)) {
      const code = token.replace(/^#\/i\//, '').replace(/^dogapp\.gg\//i, '');
      return put(`<a class="invite-inline" href="#/i/${esc(code)}">dogapp.gg/${esc(code)}</a>`);
    }
    const safe = safeUrl(token);
    return safe ? put(`<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(clamp(token, 60))}</a>`) : token;
  });
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  t = t.replace(/(^|[\s(])@([A-Za-zА-Яа-яЁё0-9_]{2,32})/g, '$1<span class="mention">@$2</span>');
  t = t.split('\n').map(line =>
    /^&gt;\s/.test(line) ? `<div class="quote">${line.replace(/^&gt;\s?/, '')}</div>` : line
  ).join('\n').replace(/\n/g, '<br>');
  return t.replace(/\u0001(\d+)\u0001/g, (_, i) => stash[+i] || '');
}

function inviteCards(raw, s) {
  const codes = new Set();
  const re = /(?:#\/i\/|(?:https?:\/\/)?dogapp\.gg\/)([A-Za-z0-9_-]{2,24})/gi;
  let m;
  while ((m = re.exec(raw || ''))) codes.add(m[1]);
  let out = '';
  for (const code of codes) {
    const inv = s.invites[code];
    const srv = inv && s.servers[inv.serverId];
    if (!inv || !srv) continue;
    const dead = isExpired(inv);
    const count = Object.keys(srv.members || {}).length;
    out += `<div class="invite-embed ${dead ? 'dead' : ''}">
      <div class="invite-embed-banner" style="${esc(bannerCss(srv.banner, srv.bannerAnimated))}"></div>
      <div class="invite-embed-body">
        ${serverIconHtml(srv, 'invite-embed-icon')}
        <div class="invite-embed-text"><small>ПРИГЛАШЕНИЕ НА СЕРВЕР</small><b>${esc(clamp(srv.name, 40))}</b><span>${count} ${plural(count, ['участник', 'участника', 'участников'])} · dogapp.gg/${esc(code)}</span></div>
        ${dead ? '<span class="badge badge-red">истекла</span>'
          : `<button class="btn-primary" data-action="open-invite" data-code="${esc(code)}">Присоединиться</button>`}
      </div>
      <div class="invite-embed-foot">${icon(inv.custom ? 'sparkle' : 'clock', 13)}
        ${inv.custom ? 'Кастомная ссылка · не истекает' : (dead ? 'Срок действия 3 дня истёк' : 'Истечёт через ' + esc(timeLeft(inv.expiresAt - Date.now())))}</div>
    </div>`;
  }
  return out;
}

function reactionLabel(key, emoteIdx) {
  const name = String(key).replace(/^:|:$/g, '').toLowerCase();
  const e = emoteIdx[name];
  if (e && safeUrl(e.url)) return `<img class="emote" src="${esc(safeUrl(e.url))}" alt=":${esc(e.name)}:" title=":${esc(e.name)}:">`;
  return esc(key);
}

function findReply(s, id) {
  for (const bucket of Object.values(s.messages || {})) if (bucket && bucket[id]) return bucket[id];
  return null;
}

function messageHtml(m, u, srv, grouped, emoteIdx, s, me) {
  u = u || {};
  const color = roleColor(u, srv, m.authorId);
  const mine = m.authorId === me;
  const reply = m.replyTo && findReply(s, m.replyTo);
  const reactions = Object.entries(m.reactions || {}).filter(([, arr]) => Array.isArray(arr) && arr.length);
  return `<div class="msg ${grouped ? 'grouped' : ''}" data-id="${esc(m.id)}">
    <div class="msg-gutter">${grouped ? `<span class="msg-hover-time">${esc(fmtTime(m.createdAt))}</span>` : avatarHtml(u, 'avatar-md')}</div>
    <div class="msg-main">
      ${grouped ? '' : `<div class="msg-head">
        <button class="msg-author" style="color:${esc(color)};${nickStyle(u)}" data-action="profile" data-uid="${esc(m.authorId)}">${esc(clamp(accountName(u), 32))}</button>
        ${u.bot ? '<span class="bot-tag">BOT</span>' : ''}
        <span class="msg-time">${esc(fmtFull(m.createdAt))}</span>
      </div>`}
      ${reply ? `<div class="reply-line">${icon('reply', 13)}<b>${esc(clamp(accountName(s.users[reply.authorId]), 24))}</b><span>${esc(clamp(reply.content || '', 90))}</span></div>` : ''}
      <div class="msg-text">${formatContent(m.content, emoteIdx)}${m.editedAt ? '<span class="edited">(изм.)</span>' : ''}</div>
      ${m.attachment && safeUrl(m.attachment.url) ? `<div class="msg-attachment"><img src="${esc(safeUrl(m.attachment.url))}" alt="${esc(m.attachment.name || 'вложение')}" loading="lazy"><small>${esc(clamp(m.attachment.name || 'изображение', 40))}</small></div>` : ''}
      ${inviteCards(m.content, s)}
      ${reactions.length ? `<div class="msg-reactions">${reactions.map(([k, arr]) =>
        `<button class="reaction ${arr.includes(me) ? 'mine' : ''}" data-action="react" data-id="${esc(m.id)}" data-emoji="${esc(k)}">${reactionLabel(k, emoteIdx)}<span>${arr.length}</span></button>`
      ).join('')}<button class="reaction reaction-add" data-action="emoji-picker" data-mode="reaction" data-id="${esc(m.id)}" data-tip="Добавить реакцию">${icon('reaction', 16)}</button></div>` : ''}
    </div>
    <div class="msg-tools">
      <button data-action="emoji-picker" data-mode="reaction" data-id="${esc(m.id)}" data-tip="Добавить реакцию">${icon('reaction', 18)}</button>
      <button data-action="reply" data-id="${esc(m.id)}" data-tip="Ответить">${icon('reply', 18)}</button>
      <button data-action="copy-msg" data-id="${esc(m.id)}" data-tip="Копировать текст">${icon('copy', 18)}</button>
      ${mine ? `<button data-action="edit-msg" data-id="${esc(m.id)}" data-tip="Изменить">${icon('edit', 18)}</button>
        <button data-action="delete-msg" data-id="${esc(m.id)}" data-tip="Удалить">${icon('trash', 18)}</button>` : ''}
    </div>
  </div>`;
}

/* ======================= ОСНОВНОЙ РЕНДЕР ======================= */
export function render(store, view) {
  if (view.invitePage) {
    $('loader').hidden = true;
    $('app').hidden = true;
    $('auth-page').hidden = true;
    const ip = $('invite-page');
    ip.hidden = false;
    ip.innerHTML = invitePageHtml(store, view);
    return;
  }
  if (view.authScreen) {
    $('loader').hidden = true;
    $('app').hidden = true;
    $('invite-page').hidden = true;
    const ap = $('auth-page');
    ap.hidden = false;
    return;
  }
  $('invite-page').hidden = true;
  $('auth-page').hidden = true;
  $('app').hidden = false;

  const ae = document.activeElement;
  const role = ae && (ae.dataset?.role || '');
  const sel = ae && typeof ae.selectionStart === 'number' ? ae.selectionStart : null;
  const scrolls = ['messages', 'channels', 'members'].map(id => {
    const el = $(id);
    return { id, el, top: el ? el.scrollTop : 0, near: el ? (el.scrollHeight - el.clientHeight - el.scrollTop < 90) : false };
  });

  const c = context(store, view);
  renderRail(store, view, c);
  renderSidebar(store, view, c);
  renderHeader(store, view, c);
  renderMessages(store, view, c);
  renderMembers(store, view, c);
  renderComposer(store, view, c);
  renderTyping(store, view, c);
  renderUserPanel(store, view, c);

  requestAnimationFrame(() => {
    for (const sc of scrolls) if (sc.el) sc.el.scrollTop = sc.near ? sc.el.scrollHeight : sc.top;
    if (role) {
      const n = document.querySelector(`[data-role="${CSS.escape(role)}"]`);
      if (n && n !== ae) {
        n.focus({ preventScroll: true });
        if (sel !== null && typeof n.setSelectionRange === 'function') {
          try { n.setSelectionRange(sel, sel); } catch (_) { }
        }
      }
    }
  });
  document.title = c.key ? `#${c.name} · dogapp` : 'dogapp — общение без подписок';
}

function renderRail(store, view, c) {
  const joined = store.myServers().filter(sv => isRealAccount(c.s.users[sv.ownerId], c.s.accounts));
  $('rail-explore').innerHTML = icon('compass', 22);
  $('rail-link').innerHTML = icon('link', 20);
  $('rail-cloud').innerHTML = icon('cloud', 20);
  $('rail-info').innerHTML = icon('info', 20);
  $('rail-cloud').classList.toggle('conn-ok', store.mode === 'firebase');
  $('rail-home').classList.toggle('active', view.section !== 'server');
  $('server-list').innerHTML = joined.map(sv => {
    const active = view.section === 'server' && view.serverId === sv.id;
    return `<div class="rail-item ${active ? 'active' : ''}">
      <i class="rail-pill"></i>
      <button class="rail-btn rail-server" data-action="select-server" data-id="${esc(sv.id)}" data-tip="${esc(clamp(sv.name, 40))}">
        ${serverIconHtml(sv, 'rail-icon')}
      </button>
    </div>`;
  }).join('');
}

function renderSidebar(store, view, c) {
  const { s, srv } = c;
  const me = store.uid;
  const head = $('sidebar-head');

  if (srv) {
    head.innerHTML = `<button class="server-head" data-action="server-menu" style="${esc(bannerCss(srv.banner, srv.bannerAnimated))}">
      <div class="server-head-shade"></div>
      <span class="server-head-content">${serverIconHtml(srv, 'server-head-icon')}<b>${esc(clamp(srv.name, 30))}</b>${icon('chevron', 18)}</span>
    </button>
    <div class="server-head-sub" style="${esc(bannerCss(srv.banner, srv.bannerAnimated))}">
      <span>${esc(clamp(srv.description || 'Сервер dogapp', 70))}</span>
      ${srv.vanity ? `<button data-action="copy-text" data-text="${esc(inviteUrl(srv.vanity))}" data-tip="Скопировать кастомную ссылку">${icon('link', 14)} dogapp.gg/${esc(srv.vanity)}</button>` : ''}
    </div>`;
  } else {
    const u = s.users[me] || {};
    head.innerHTML = `<div class="home-head">
      <div class="home-search">${icon('search', 16)}<input data-role="dm-search" value="${esc(view.dmQuery || '')}" placeholder="Найти беседу"></div>
      <button class="free-card" data-action="settings" style="${esc(bannerCss(u.banner, u.bannerAnimated))}">
        <span class="free-card-shade"></span>
        <span class="free-card-text"><b>${icon('bolt', 14)} dogapp Free</b><small>Ваш баннер · всё бесплатно</small></span>
      </button>
    </div>`;
  }

  const ch = $('channels');
  if (srv) {
    const list = Object.values(srv.channels || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
    const groups = new Map();
    for (const x of list) {
      const g = x.category || 'КАНАЛЫ';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(x);
    }
    let html = '';
    for (const [g, items] of groups) {
      const collapsed = view.collapsed?.has(g);
      html += groupLabel(g);
      if (collapsed) continue;
      for (const x of items) {
        const active = view.channelId === x.id || view.voiceChannelId === x.id;
        const inVoice = x.type === 'voice' && Object.keys(s.voice?.[x.id] || {}).length;
        html += `<div class="chan ${active ? 'active' : ''} ${x.type === 'voice' ? 'voice' : ''}" data-action="select-channel" data-id="${esc(x.id)}" data-type="${esc(x.type)}">
          ${icon(x.type === 'voice' ? 'volume' : 'hash', 20)}<span>${esc(x.name)}</span>
          ${inVoice ? `<span class="chan-voice-count">${inVoice}</span>` : ''}
          <span class="chan-tools">
            <button data-action="copy-invite" data-tip="Скопировать ссылку на 3 дня">${icon('link', 15)}</button>
            <button data-action="create-channel" data-tip="Создать канал">${icon('plus', 15)}</button>
          </span>
        </div>`;
      }
    }
    ch.innerHTML = html;
  } else {
    const dms = Object.values(s.dms || {}).filter(d => {
      const users = Array.isArray(d.users) ? d.users : [];
      return users.includes(me) && users.every(id => realUser(s, id));
    });
    const q = String(view.dmQuery || '').toLowerCase();
    const shown = dms.filter(d => !q || String(d.name || '').toLowerCase().includes(q));
    const inc = requestsIn(s, me).length;
    ch.innerHTML = `
      <button class="home-nav ${view.section === 'home' ? 'active' : ''}" data-action="home-tab" data-tab="friends">${icon('users', 20)}<span>Друзья</span>${inc ? `<span class="nav-badge">${inc}</span>` : ''}</button>
      <button class="home-nav" data-action="explore">${icon('compass', 20)}<span>Найти серверы</span></button>
      <div class="chan-label home-label"><span>ЛИЧНЫЕ СООБЩЕНИЯ</span><button class="chan-label-plus" data-action="new-dm" data-tip="Новое ЛС">${icon('plus', 14)}</button></div>
      ${shown.map(d => {
        const other = (d.users || []).find(id => id !== me);
        const u = s.users[other];
        return `<div class="chan dm ${view.section === 'dm' && view.dmId === d.id ? 'active' : ''}" data-action="select-dm" data-id="${esc(d.id)}">
          <span class="avatar-wrap">${avatarHtml(u, 'avatar-sm')}<i class="pres ${isOnline(u, me, other) ? 'online' : 'offline'}"></i></span>
          <span>${esc(clamp(accountName(u), 26))}</span>
        </div>`;
      }).join('') || '<div class="chan-empty">Бесед не найдено</div>'}`;
  }
}

function renderHeader(store, view, c) {
  const { srv, chan, dm, name } = c;
  const h = $('chat-header');
  if (!c.key) {
    const ids = friendIds(store.state, store.uid);
    h.innerHTML = `<div class="hdr-left">${icon('users', 24, 'hdr-hash')}<b>Друзья</b>
      <span class="hdr-sep"></span><span class="hdr-topic">${ids.length} в списке · ${requestsIn(store.state, store.uid).length} заявок</span></div>
      <div class="hdr-tools">
        <button class="btn-primary btn-sm" data-action="friends-tab" data-tab="add">${icon('userPlus', 16)} Добавить друга</button>
      </div>`;
    return;
  }
  const topic = chan?.topic || (dm ? 'Личные сообщения · эмоции серверов работают и тут' : '');
  h.innerHTML = `<div class="hdr-left">
      ${icon(chan ? 'hash' : 'at', 24, 'hdr-hash')}<b>${esc(name)}</b>
      ${topic ? `<span class="hdr-sep"></span><span class="hdr-topic" title="${esc(topic)}">${esc(clamp(topic, 70))}</span>` : ''}
    </div>
    <div class="hdr-tools">
      ${callHeaderButtons(store, view)}
      <button class="hdr-btn ${view.showMembers ? 'active' : ''}" data-action="toggle-members" data-tip="Список участников">${icon('users', 20)}</button>
      <div class="hdr-search"><input data-role="search" value="${esc(view.search || '')}" placeholder="Поиск по сообщениям">${icon('search', 15)}</div>
      <button class="hdr-btn" data-action="about" data-tip="Помощь">${icon('help', 20)}</button>
    </div>`;
}

function renderMessages(store, view, c) {
  const el = $('messages');
  const { s, srv, chan, dm, key, name } = c;
  const me = store.uid;
  const emoteIdx = buildEmoteIndex(s, store.uid);

  if (!key) { el.innerHTML = friendsViewHtml(store, view); return; }

  const all = Object.values(s.messages[key] || {})
    .filter(m => m && realUser(s, m.authorId))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const q = String(view.search || '').toLowerCase().trim();
  const list = q ? all.filter(m => String(m.content || '').toLowerCase().includes(q)) : all;

  let intro = '';
  if (!q) {
    if (chan) {
      intro = `<div class="chan-intro">
        <div class="intro-icon">${icon('hash', 46)}</div>
        <h1>Добро пожаловать в #${esc(name)}!</h1>
        <p>Это начало канала <b>#${esc(name)}</b>.${chan.topic ? ' ' + esc(clamp(chan.topic, 120)) : ''}</p>
        ${srv ? `<div class="intro-server" style="${esc(bannerCss(srv.banner, srv.bannerAnimated))}"><div class="intro-server-shade"></div>${serverIconHtml(srv, 'intro-server-icon')}<span>${esc(clamp(srv.name, 30))}</span><small>баннер сервера</small></div>` : ''}
      </div>`;
    } else if (dm) {
      const other = (dm.users || []).find(id => id !== me);
      const u = s.users[other];
      if (realUser(s, other)) {
        intro = `<div class="chan-intro dm-intro">${avatarHtml(u, 'avatar-xl')}<h1 style="${nickStyle(u)}">${esc(clamp(accountName(u), 40))}</h1><p>Это начало вашей беседы с <b>${esc(clamp(accountName(u), 40))}</b>. Эмоции серверов работают и здесь — бесплатно.</p></div>`;
      }
    }
  }

  let body = '', lastAuthor = null, lastTime = 0;
  for (const m of list) {
    const u = s.users[m.authorId];
    const grouped = m.authorId === lastAuthor && (m.createdAt - lastTime) < 7 * 60000;
    body += messageHtml(m, u, srv, grouped, emoteIdx, s, me);
    lastAuthor = m.authorId; lastTime = m.createdAt;
  }
  if (q && !list.length) body = `<div class="empty search-empty">${icon('search', 28)}<b>Ничего не найдено</b><span>По запросу «${esc(clamp(q, 40))}» сообщений нет</span></div>`;
  else if (!q && !list.length) body = '<div class="empty">Пока тихо. Напишите первое сообщение.</div>';

  el.innerHTML = intro + body;
}

function renderMembers(store, view, c) {
  const el = $('members');
  const { s, srv, dm } = c;
  const me = store.uid;
  if (!c.key) { el.hidden = true; return; }
  el.hidden = !view.showMembers;

  if (dm) {
    const other = (dm.users || []).find(id => id !== me);
    const u = s.users[other];
    if (!realUser(s, other)) { el.innerHTML = '<div class="empty">Аккаунт собеседника удалён</div>'; return; }
    el.innerHTML = `<div class="member-group-title">УЧАСТНИКИ — 2</div>
      <div class="member-row" data-action="profile" data-uid="${esc(other)}">${avatarHtml(u)}<b style="${nickStyle(u)}">${esc(clamp(accountName(u), 24))}</b></div>
      <div class="member-promo">${icon('sparkle', 18)}<b>Бесплатные эмоции</b><span>Эмоции всех серверов доступны даже в ЛС — без подписки.</span><button class="btn-outline" data-action="emoji-picker" data-mode="composer">Открыть эмоции</button></div>`;
    return;
  }
  const ids = Object.keys(srv?.members || {}).filter(id => realUser(s, id));
  const online = ids.filter(id => isOnline(s.users[id], me, id));
  const offline = ids.filter(id => !online.includes(id));
  const row = id => {
    const u = s.users[id];
    return `<div class="member-row" data-action="profile" data-uid="${esc(id)}">
      <span class="avatar-wrap">${avatarHtml(u)}<i class="pres ${isOnline(u, me, id) ? 'online' : 'offline'}"></i></span>
      <div><b style="color:${esc(roleColor(u, srv, id))};${nickStyle(u)}">${esc(clamp(accountName(u), 24))}</b>${u.status ? `<small>${esc(clamp(u.status, 34))}</small>` : ''}</div>
      ${srv.members[id].role === 'owner' ? icon('crown', 15) : ''}
    </div>`;
  };
  el.innerHTML = `<div class="member-promo">${icon('bolt', 18)}<b>dogapp Free</b><span>Баннеры и эмоции серверов бесплатны для всех участников.</span><button class="btn-outline" data-action="server-emotes">Все эмоции</button></div>
    <div class="member-group-title">В СЕТИ — ${online.length}</div>${online.map(row).join('')}
    <div class="member-group-title">НЕ В СЕТИ — ${offline.length}</div>${offline.map(row).join('')}`;
}

function renderComposer(store, view, c) {
  const el = $('composer');
  const { key, name } = c;
  if (!key) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const draft = view.drafts[key] || '';
  const replyMsg = view.replyTo ? findReply(c.s, view.replyTo) : null;
  const replyUser = replyMsg ? c.s.users[replyMsg.authorId] : null;
  el.innerHTML = `
    ${view.replyTo ? `<div class="composer-banner">${icon('reply', 16)} Ответ для <b>${esc(clamp(accountName(replyUser), 28))}</b><span data-action="cancel-reply" class="banner-x">${icon('close', 16)}</span></div>` : ''}
    ${view.editing ? `<div class="composer-banner editing">${icon('edit', 16)} Редактирование сообщения<span data-action="cancel-edit" class="banner-x">${icon('close', 16)}</span></div>` : ''}
    ${view.pendingAttachment ? `<div class="composer-banner attach">${icon('image', 16)} <img src="${esc(safeUrl(view.pendingAttachment.url))}" alt=""> ${esc(clamp(view.pendingAttachment.name, 36))}<span data-action="cancel-attach" class="banner-x">${icon('close', 16)}</span></div>` : ''}
    <div class="composer ${view.editing ? 'is-editing' : ''}">
      <button class="cbtn cbtn-plus" data-action="attach" data-tip="Прикрепить картинку">${icon('plusCircle', 22)}</button>
      <textarea data-role="composer" rows="1" placeholder="Написать в ${c.chan ? '#' : '@'}${esc(name)}" maxlength="2000">${esc(draft)}</textarea>
      <div class="composer-tools">
        <button class="cbtn" data-action="gif" data-tip="Картинка по ссылке">${icon('gif', 22)}</button>
        <button class="cbtn" data-action="sticker" data-tip="Случайная эмоция сервера">${icon('sticker', 22)}</button>
        <button class="cbtn ${view.picker && !view.picker.reactTo ? 'active' : ''}" data-action="emoji-picker" data-mode="composer" data-tip="Эмоции — бесплатно">${icon('smile', 22)}</button>
        <button class="cbtn send-btn" data-action="send" data-tip="Отправить (Enter)">${icon('send', 18)}</button>
      </div>
    </div>
    <div class="composer-hint">${icon('bolt', 13)} Эмоции серверов бесплатны для друзей · <b>Enter</b> — отправить · <b>Shift+Enter</b> — новая строка</div>`;
  const ta = el.querySelector('textarea');
  if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(160, Math.max(24, ta.scrollHeight)) + 'px'; }
}

function renderTyping(store, view, c) {
  const el = $('typing');
  const t = c.key ? (c.s.typing[c.key] || {}) : {};
  const names = Object.entries(t)
    .filter(([id, v]) => id !== store.uid && realUser(c.s, id) && v && (v.at || 0) > Date.now() - 5000)
    .map(([id]) => accountName(c.s.users[id]));
  el.innerHTML = names.length
    ? `<span class="typing-dots"><i></i><i></i><i></i></span><b>${esc(names.slice(0, 3).join(', '))}</b> ${names.length > 1 ? 'печатают' : 'печатает'}…`
    : '';
}

function renderUserPanel(store, view, c) {
  const u = store.me();
  const online = store.mode === 'firebase';
  $('user-panel').innerHTML = `
    <button class="up-user" data-action="profile" data-uid="${esc(store.uid)}" data-tip="Мой профиль">
      <span class="avatar-wrap">${avatarHtml(u, 'avatar-sm')}<i class="pres ${online ? 'online' : 'idle'}"></i></span>
      <span class="up-name"><b style="${nickStyle(u)}">${esc(clamp(accountName(u), 20))}</b><small>${esc(clamp(u.status || '@' + (u.login || ''), 30))}</small></span>
    </button>
    <div class="up-actions">
      <button data-action="toggle-mic" data-tip="${view.mic ? 'Выключить микрофон' : 'Включить микрофон'}">${icon(view.mic ? 'mic' : 'micOff', 19)}</button>
      <button data-action="toggle-deaf" data-tip="${view.deaf ? 'Включить звук' : 'Выключить звук'}">${icon(view.deaf ? 'headOff' : 'headphones', 19)}</button>
      <button data-action="settings" data-tip="Настройки пользователя">${icon('settings', 19)}</button>
      <button class="up-logout" data-action="auth-logout" data-tip="Выйти из аккаунта">${icon('arrowLeft', 19)}</button>
      <button class="up-delete" data-action="delete-account" data-tip="Удалить аккаунт">${icon('trash', 19)}</button>
    </div>`;
}
