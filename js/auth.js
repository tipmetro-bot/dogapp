// dogapp — обязательные аккаунты: регистрация, вход, выход и удаление аккаунта.
// Аккаунты лежат в Firebase RTDB: /dogapp/accounts/<login>, профили — /dogapp/users/<uid>.
import { store } from './store.js';
import {
  rid, esc, clamp, initials, BANNER_PRESETS, hashPassword, randomSalt, isRealAccount
} from './util.js';
import { icon } from './icons.js';

export const LS_SESSION = 'dogapp_session_v1';

export function getSession() {
  try { const v = localStorage.getItem(LS_SESSION); return v ? JSON.parse(v) : null; }
  catch (_) { return null; }
}
export function saveSession(s) { localStorage.setItem(LS_SESSION, JSON.stringify(s)); }
export function clearSession() { localStorage.removeItem(LS_SESSION); }

function accountIdOf(s) { return String(s?.accountId || s?.login || '').toLowerCase(); }

export function sessionIsValid(storeRef = store) {
  const s = getSession();
  if (!s || s.guest || !s.uid || !storeRef.state) return false;
  const id = accountIdOf(s);
  const account = storeRef.state.accounts[id];
  return !!account && account.uid === s.uid && isRealAccount(storeRef.state.users[s.uid], storeRef.state.accounts);
}

export function requireSession(storeRef = store) {
  const s = getSession();
  if (!sessionIsValid(storeRef)) { clearSession(); return null; }
  return s;
}

function newProfile(name, login, uid) {
  return {
    id: uid, name: name.slice(0, 32), tag: String(Math.floor(1000 + Math.random() * 8999)),
    login,
    avatar: { type: 'text', value: initials(name), color: '#5865f2' }, avatarAnimated: false,
    banner: BANNER_PRESETS[0].value, bannerAnimated: false,
    bio: '', status: '', font: 'default', color: '#ffffff',
    lastSeen: Date.now(), createdAt: Date.now()
  };
}

export async function register({ login, password, name }) {
  const l = String(login || '').toLowerCase().trim();
  const p = String(password || '');
  const n = String(name || '').trim();
  if (!/^[a-z0-9_]{3,20}$/.test(l)) throw new Error('Логин: латиница, цифры и подчёркивание, 3–20 символов');
  if (p.length < 6) throw new Error('Пароль от 6 символов');
  if (n.length < 2) throw new Error('Введите отображаемое имя');
  if (store.state.accounts[l]) throw new Error('Логин «' + l + '» уже занят');

  const uid = rid('u');
  const salt = randomSalt();
  const passHash = await hashPassword(p, salt);
  const account = { login: l, uid, salt, passHash, createdAt: Date.now() };
  const user = newProfile(n, l, uid);

  store.set(['accounts', l], account);
  store.set(['users', uid], user);
  store.setUid(uid);
  const session = { uid, login: l, name: n, accountId: l, since: Date.now() };
  saveSession(session);
  return session;
}

export async function login({ login, password }) {
  const l = String(login || '').toLowerCase().trim();
  const p = String(password || '');
  const account = store.state.accounts[l];
  if (!account) throw new Error('Аккаунт не найден');
  const passHash = await hashPassword(p, account.salt);
  if (passHash !== account.passHash) throw new Error('Неверный пароль');

  store.setUid(account.uid);
  if (!isRealAccount(store.state.users[account.uid], store.state.accounts)) {
    store.set(['users', account.uid], newProfile(account.login || l, l, account.uid));
  }
  const session = { uid: account.uid, login: l, accountId: l, name: store.state.users[account.uid].name, since: Date.now() };
  saveSession(session);
  store.patch(['users', account.uid], { lastSeen: Date.now() }, true);
  return session;
}

export function logout() {
  clearSession();
  store.setUid(rid('u'));
  store.bump(true);
}

export async function changePassword(oldPass, newPass) {
  const s = requireSession();
  if (!s) throw new Error('Войдите в аккаунт');
  const id = accountIdOf(s);
  const account = store.state.accounts[id];
  if (!account) throw new Error('Аккаунт не найден');
  if (await hashPassword(oldPass, account.salt) !== account.passHash) throw new Error('Неверный текущий пароль');
  if (String(newPass).length < 6) throw new Error('Новый пароль от 6 символов');
  const salt = randomSalt();
  store.patch(['accounts', id], { salt, passHash: await hashPassword(newPass, salt) });
}

function collectAccountDeletion(state, uid, accountId) {
  const changes = [];
  const del = path => changes.push({ path, method: 'DELETE' });
  const put = (path, value) => changes.push({ path, method: 'PUT', value });
  const patch = (path, value) => changes.push({ path, method: 'PATCH', value });

  del(['accounts', accountId]);
  del(['users', uid]);
  del(['friends', uid]);
  del(['blocks', uid]);

  for (const [other, list] of Object.entries(state.friends || {})) if (list?.[uid]) del(['friends', other, uid]);
  for (const [other, list] of Object.entries(state.blocks || {})) if (list?.[uid]) del(['blocks', other, uid]);
  for (const [reqId, r] of Object.entries(state.friendRequests || {})) {
    if (r?.from === uid || r?.to === uid) del(['friendRequests', reqId]);
  }
  for (const [cid, people] of Object.entries(state.voice || {})) if (people?.[uid]) del(['voice', cid, uid]);
  for (const [key, people] of Object.entries(state.typing || {})) if (people?.[uid]) del(['typing', key, uid]);
  for (const [callId, c] of Object.entries(state.calls || {})) {
    if (c?.from === uid || c?.to === uid) del(['calls', callId]);
  }

  for (const [dmId, dm] of Object.entries(state.dms || {})) {
    if ((Array.isArray(dm?.users) ? dm.users : []).includes(uid)) {
      del(['dms', dmId]);
      del(['messages', dmId]);
    }
  }

  const emptyOwned = [];
  for (const [sid, sv] of Object.entries(state.servers || {})) {
    const members = sv?.members || {};
    if (sv?.ownerId === uid) {
      const others = Object.entries(members)
        .filter(([id]) => id !== uid && isRealAccount(state.users[id], state.accounts))
        .sort((a, b) => (a[1]?.joinedAt || 0) - (b[1]?.joinedAt || 0));
      if (others.length) {
        const [newOwner, member] = others[0];
        patch(['servers', sid], { ownerId: newOwner });
        put(['servers', sid, 'members', newOwner], { ...(member || {}), role: 'owner' });
        del(['servers', sid, 'members', uid]);
      } else {
        emptyOwned.push({ sid, channels: Object.keys(sv.channels || {}) });
      }
    } else if (members[uid]) {
      del(['servers', sid, 'members', uid]);
    }
  }

  for (const { sid, channels } of emptyOwned) {
    del(['servers', sid]);
    for (const cid of channels) {
      del(['messages', cid]);
      del(['voice', cid]);
      del(['typing', cid]);
    }
    for (const [code, inv] of Object.entries(state.invites || {})) {
      if (inv?.serverId === sid) del(['invites', code]);
    }
  }

  for (const [bucket, messages] of Object.entries(state.messages || {})) {
    for (const [mid, m] of Object.entries(messages || {})) {
      if (!m || typeof m !== 'object') continue;
      if (m.authorId === uid) { del(['messages', bucket, mid]); continue; }
      for (const [emoji, users] of Object.entries(m.reactions || {})) {
        if (!Array.isArray(users) || !users.includes(uid)) continue;
        const next = users.filter(x => x !== uid);
        if (next.length) put(['messages', bucket, mid, 'reactions', emoji], next);
        else del(['messages', bucket, mid, 'reactions', emoji]);
      }
    }
  }
  return changes;
}

export async function deleteAccount({ password, confirm }) {
  const s = requireSession();
  if (!s) throw new Error('Войдите в аккаунт');
  const id = accountIdOf(s);
  const account = store.state.accounts[id];
  if (!account || account.uid !== s.uid) throw new Error('Аккаунт не найден');
  if (await hashPassword(password, account.salt) !== account.passHash) throw new Error('Неверный пароль');
  if (String(confirm || '').trim().toLowerCase() !== id) throw new Error('Введите логин «' + id + '» для подтверждения');

  const changes = collectAccountDeletion(store.state, s.uid, id);
  store.applyChanges(changes, true);
  await store.persistChanges(changes);
  clearSession();
  store.setUid(rid('u'));
  store.bump();
  return id;
}

/* ---------- экран входа / регистрации ---------- */
export function authPageHtml(mode = 'register', error = '', pendingInvite = '') {
  const isLogin = mode === 'login';
  return `<div class="auth-bg">
    <div class="auth-top"><img src="assets/logo.svg" alt=""><b>dogapp</b><span>общение без подписок</span></div>
    <div class="auth-card">
      <div class="auth-head">
        <h1>${isLogin ? 'Вход в dogapp' : 'Регистрация в dogapp'}</h1>
        <p>${isLogin ? 'Введите логин и пароль от своего аккаунта.' : 'Создайте аккаунт. Готовых серверов и вымышленных участников в базе нет: всё создают люди.'}</p>
      </div>
      ${pendingInvite ? `<div class="auth-pending">${icon('link', 16)} После входа откроется приглашение <b>dogapp.gg/${esc(pendingInvite)}</b></div>` : ''}
      <div class="auth-tabs">
        <button class="auth-tab ${!isLogin ? 'active' : ''}" data-action="auth-tab" data-tab="register">Регистрация</button>
        <button class="auth-tab ${isLogin ? 'active' : ''}" data-action="auth-tab" data-tab="login">Вход</button>
      </div>
      ${error ? `<div class="auth-error">${esc(error)}</div>` : ''}
      <form data-form="${isLogin ? 'auth-login' : 'auth-register'}" class="auth-form">
        ${!isLogin ? `<label class="field"><span>Отображаемое имя</span><input name="name" maxlength="32" placeholder="Как вас будут видеть" required></label>` : ''}
        <label class="field"><span>Логин</span><input name="login" maxlength="20" placeholder="логин" autocomplete="username" required></label>
        <label class="field"><span>Пароль</span><input name="password" type="password" maxlength="64" placeholder="не менее 6 символов" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required></label>
        <button class="btn-primary btn-auth" type="submit">${isLogin ? 'Войти' : 'Создать аккаунт'}</button>
      </form>
      <div class="auth-notes">
        <div>${icon('shield', 16)}<span>Профиль, баннер, шрифт ника, друзья и звонки привязаны к аккаунту.</span></div>
        <div>${icon('cloud', 16)}<span>Аккаунты и сообщения синхронизируются через Firebase Realtime Database.</span></div>
        <div>${icon('trash', 16)}<span>В настройках есть выход и полное удаление аккаунта вместе с данными.</span></div>
      </div>
    </div>
    <div class="auth-foot">dogapp · бесплатно · только зарегистрированные аккаунты</div>
  </div>`;
}

export function accountTabHtml(storeRef) {
  const s = requireSession(storeRef);
  const me = storeRef.me();
  if (!s) {
    return `<div class="notice notice-blurple">${icon('info', 18)}<div>Сессия не найдена. Зарегистрируйтесь или войдите, чтобы пользоваться dogapp.</div></div>
      <button class="btn-primary full" data-action="auth-open">Войти или зарегистрироваться</button>`;
  }
  return `<div class="account-card">
      <div class="account-avatar">${esc(clamp(me.name || s.login, 2))}</div>
      <div><b>${esc(clamp(me.name || s.login, 30))}</b><span>@${esc(s.login)} · #${esc(me.tag || '0000')}</span></div>
      <span class="badge badge-blurple">АККАУНТ</span>
    </div>
    <div class="hr"></div>
    <div class="section-title">Смена пароля</div>
    <form data-form="auth-password">
      <label class="field"><span>Текущий пароль</span><input name="old" type="password" required></label>
      <label class="field"><span>Новый пароль</span><input name="new" type="password" minlength="6" required></label>
      <div class="form-actions"><button class="btn-primary" type="submit">Сохранить</button></div>
    </form>
    <div class="hr"></div>
    <div class="section-title">Сессия и данные</div>
    <div class="account-actions">
      <button class="btn-outline full" data-action="auth-logout">${icon('arrowLeft', 16)} Выйти из аккаунта</button>
      <button class="btn-danger full" data-action="delete-account">${icon('trash', 16)} Удалить аккаунт</button>
    </div>
    <p class="hint">Удаление убирает профиль, пароль, друзей, заявки, личные сообщения, звонки и ваши сообщения. Серверы без других участников удаляются; серверы с участниками передаются другому владельцу.</p>`;
}
