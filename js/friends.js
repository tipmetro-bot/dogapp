// dogapp — система друзей: заявки, список, поиск по логину, блокировка
import { esc, clamp, relTime, safeColor, bannerCss, nickStyle, plural } from './util.js';
import { icon } from './icons.js';
import { avatarHtml } from './util.js';

export function friendIds(state, uid) {
  return Object.keys(state.friends?.[uid] || {});
}
export function isFriend(state, uid, other) {
  return !!(state.friends?.[uid]?.[other]);
}
export function isBlocked(state, uid, other) {
  return !!(state.blocks?.[uid]?.[other]);
}
export function requestsIn(state, uid) {
  return Object.values(state.friendRequests || {}).filter(r => r.to === uid && r.status === 'pending');
}
export function requestsOut(state, uid) {
  return Object.values(state.friendRequests || {}).filter(r => r.from === uid && r.status === 'pending');
}
export function hasPending(state, uid, other) {
  return Object.values(state.friendRequests || {}).some(r =>
    r.status === 'pending' && ((r.from === uid && r.to === other) || (r.to === uid && r.from === other)));
}

export function sendRequest(store, toUid) {
  const s = store.state, me = store.uid;
  if (!toUid || toUid === me) throw new Error('Нельзя добавить самого себя');
  if (!s.users[toUid]) throw new Error('Пользователь не найден');
  if (isFriend(s, me, toUid)) throw new Error('Уже в друзьях');
  if (isBlocked(s, me, toUid) || isBlocked(s, toUid, me)) throw new Error('Пользователь в блокировке');
  if (hasPending(s, me, toUid)) throw new Error('Заявка уже отправлена');
  const id = 'fr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  store.set(['friendRequests', id], { id, from: me, to: toUid, status: 'pending', createdAt: Date.now() });
  return id;
}

export function acceptRequest(store, reqId) {
  const r = store.state.friendRequests?.[reqId];
  if (!r || r.to !== store.uid) return;
  const now = Date.now();
  store.set(['friends', store.uid, r.from], { since: now });
  store.set(['friends', r.from, store.uid], { since: now });
  store.del(['friendRequests', reqId]);
}
export function declineRequest(store, reqId) {
  const r = store.state.friendRequests?.[reqId];
  if (!r || (r.to !== store.uid && r.from !== store.uid)) return;
  store.del(['friendRequests', reqId]);
}
export function removeFriend(store, other) {
  store.del(['friends', store.uid, other]);
  store.del(['friends', other, store.uid]);
}
export function blockUser(store, other) {
  removeFriend(store, other);
  for (const r of Object.values(store.state.friendRequests || {})) {
    if ((r.from === store.uid && r.to === other) || (r.to === store.uid && r.from === other)) store.del(['friendRequests', r.id]);
  }
  store.set(['blocks', store.uid, other], { at: Date.now() });
}

export function searchUsers(state, uid, query) {
  const q = String(query || '').toLowerCase().trim();
  const all = Object.values(state.users || {}).filter(u => u.id !== uid);
  const list = q
    ? all.filter(u => [u.name, u.login, u.tag].some(v => String(v || '').toLowerCase().includes(q)))
    : all.filter(u => !isFriend(state, uid, u.id) && !isBlocked(state, uid, u.id));
  return list.slice(0, 30);
}

function online(u, me, id) {
  return id === me || ((u?.lastSeen || 0) > Date.now() - 120000);
}

function friendRow(state, me, id) {
  const u = state.users[id] || { name: 'Участник' };
  return `<div class="friend-row">
    <span class="avatar-wrap">${avatarHtml(u, 'avatar-md')}<i class="pres ${online(u, me, id) ? 'online' : 'offline'}"></i></span>
    <div class="friend-row-main">
      <b style="${nickStyle(u)}">${esc(clamp(u.name, 30))}</b>
      <span>@${esc(u.login || 'user')} · ${esc(clamp(u.status || relTime(u.lastSeen), 48))}</span>
    </div>
    <div class="friend-row-actions">
      <button class="btn-mini" data-action="start-dm" data-uid="${esc(id)}" data-tip="Написать">${icon('at', 16)}</button>
      <button class="btn-mini" data-action="call-user" data-uid="${esc(id)}" data-type="voice" data-tip="Голосовой звонок">${icon('mic', 16)}</button>
      <button class="btn-mini" data-action="call-user" data-uid="${esc(id)}" data-type="video" data-tip="Видеозвонок">${icon('video', 16)}</button>
      <button class="btn-mini" data-action="profile" data-uid="${esc(id)}" data-tip="Профиль">${icon('info', 16)}</button>
      <button class="btn-mini btn-mini-red" data-action="friend-remove" data-uid="${esc(id)}" data-tip="Удалить из друзей">${icon('trash', 16)}</button>
    </div>
  </div>`;
}

function requestRow(state, r, incoming) {
  const other = incoming ? r.from : r.to;
  const u = state.users[other] || { name: 'Участник' };
  return `<div class="friend-row">
    ${avatarHtml(u, 'avatar-md')}
    <div class="friend-row-main"><b style="${nickStyle(u)}">${esc(clamp(u.name, 30))}</b><span>@${esc(u.login || 'user')} · ${esc(relTime(r.createdAt))}</span></div>
    <div class="friend-row-actions">
      ${incoming
        ? `<button class="btn-mini btn-ok" data-action="friend-accept" data-id="${esc(r.id)}">Принять</button>
           <button class="btn-mini" data-action="friend-decline" data-id="${esc(r.id)}">Отклонить</button>`
        : `<span class="badge badge-gray">ожидает</span><button class="btn-mini" data-action="friend-cancel" data-id="${esc(r.id)}">Отменить</button>`}
    </div>
  </div>`;
}

export function friendsViewHtml(store, view) {
  const s = store.state, me = store.uid;
  const meUser = s.users[me] || {};
  const tab = view.friendsTab || 'online';
  const ids = friendIds(s, me);
  const shown = ids.filter(id => tab === 'all' ? true : tab === 'online' ? online(s.users[id], me, id) : !online(s.users[id], me, id));
  const inc = requestsIn(s, me), out = requestsOut(s, me);
  const q = view.friendQuery || '';
  const results = searchUsers(s, me, q);

  const tabs = [
    ['online', 'В сети'], ['all', 'Все'], ['offline', 'Не в сети'],
    ['incoming', 'Ожидают' + (inc.length ? ' (' + inc.length + ')' : '')],
    ['outgoing', 'Отправленные' + (out.length ? ' (' + out.length + ')' : '')],
    ['add', 'Добавить друга']
  ];

  let body = '';
  if (tab === 'incoming') {
    body = inc.length ? inc.map(r => requestRow(s, r, true)).join('') : '<div class="empty">Входящих заявок нет</div>';
  } else if (tab === 'outgoing') {
    body = out.length ? out.map(r => requestRow(s, r, false)).join('') : '<div class="empty">Исходящих заявок нет</div>';
  } else if (tab === 'add') {
    body = `<div class="friend-search">${icon('search', 17)}<input data-role="friend-search" value="${esc(q)}" placeholder="Поиск по логину или имени"></div>
      <div class="friend-results">${results.map(u => {
        const friend = isFriend(s, me, u.id), pending = hasPending(s, me, u.id), blocked = isBlocked(s, me, u.id);
        return `<div class="friend-row">
          ${avatarHtml(u, 'avatar-md')}
          <div class="friend-row-main"><b style="${nickStyle(u)}">${esc(clamp(u.name, 30))}</b><span>@${esc(u.login || 'user')} · #${esc(u.tag || '0000')}</span></div>
          <div class="friend-row-actions">
            ${blocked ? '<span class="badge badge-red">заблокирован</span>'
              : friend ? '<span class="badge badge-green">в друзьях</span>'
              : pending ? '<span class="badge badge-gray">заявка отправлена</span>'
              : `<button class="btn-mini btn-ok" data-action="friend-add" data-uid="${esc(u.id)}">Добавить</button>`}
            <button class="btn-mini" data-action="profile" data-uid="${esc(u.id)}" data-tip="Профиль">${icon('info', 16)}</button>
            ${!blocked ? `<button class="btn-mini btn-mini-red" data-action="friend-block" data-uid="${esc(u.id)}" data-tip="Заблокировать">${icon('shield', 16)}</button>` : ''}
          </div>
        </div>`;
      }).join('') || '<div class="empty">Никого не нашли</div>'}</div>`;
  } else {
    body = shown.length ? shown.map(id => friendRow(s, me, id)).join('') : '<div class="empty">В этом разделе пока пусто</div>';
  }

  return `<div class="friends-view">
    <div class="friends-hero" style="${esc(bannerCss(meUser.banner, meUser.bannerAnimated))}">
      <div class="friends-hero-shade"></div>
      <div class="friends-hero-text">
        <div class="free-chip">${icon('bolt', 14)} ВСЁ БЕСПЛАТНО</div>
        <h1>Друзья</h1>
        <p>${ids.length} ${plural(ids.length, ['друг', 'друга', 'друзей'])} · ${inc.length} входящих заявок. Звонки и видеозвонки доступны прямо из списка.</p>
        <div>
          <button class="btn-primary" data-action="friends-tab" data-tab="add">${icon('plus', 16)} Добавить друга</button>
          <button class="btn-outline" data-action="demo-call" data-type="video">${icon('video', 16)} Демо видеозвонка</button>
          <button class="btn-outline" data-action="demo-call" data-type="voice">${icon('mic', 16)} Демо звонка</button>
        </div>
      </div>
      <img src="assets/logo.svg" alt="" class="friends-hero-logo">
    </div>
    <div class="friends-tabs">${tabs.map(([id, label]) =>
      `<button class="friends-tab ${tab === id ? 'active' : ''}" data-action="friends-tab" data-tab="${id}">${label}</button>`
    ).join('')}</div>
    <div class="friends-list-head">${icon('users', 18)} <b>${tabs.find(t => t[0] === tab)?.[1]?.toUpperCase() || 'ДРУЗЬЯ'}</b> — ${
      tab === 'incoming' ? inc.length : tab === 'outgoing' ? out.length : tab === 'add' ? results.length : shown.length
    }</div>
    <div class="friends-list">${body}</div>
  </div>`;
}
