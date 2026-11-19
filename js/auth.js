// dogapp — регистрация, вход, гостевой режим.
// Аккаунты лежат в том же узле Firebase (/dogapp/accounts/<login>).
// Пароль хранится как соль + SHA-256: это демо-уровень, без серверной проверки.
import { store } from './store.js';
import { rid, makeCode, esc, clamp, initials, BANNER_PRESETS, hashPassword, randomSalt } from './util.js';
import { icon } from './icons.js';

export const LS_SESSION = 'dogapp_session_v1';

export function getSession() {
  try { const v = localStorage.getItem(LS_SESSION); return v ? JSON.parse(v) : null; }
  catch (_) { return null; }
}
export function saveSession(s) { localStorage.setItem(LS_SESSION, JSON.stringify(s)); }
export function clearSession() { localStorage.removeItem(LS_SESSION); }
export function isGuest() { const s = getSession(); return !s || !!s.guest; }

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
  if (n.length < 2) throw new Error('Введи отображаемое имя');
  if (store.state.accounts[l]) throw new Error('Логин «' + l + '» уже занят');

  const uid = rid('u');
  const salt = randomSalt();
  const passHash = await hashPassword(p, salt);
  const account = { login: l, uid, salt, passHash, createdAt: Date.now() };
  const user = newProfile(n, l, uid);

  store.set(['accounts', l], account);
  store.set(['users', uid], user);
  // Новый аккаунт сразу попадает на главный сервер и получает демо-друзей
  if (store.state.servers.s_dogapp) {
    store.set(['servers', 's_dogapp', 'members', uid], { role: 'member', joinedAt: Date.now() });
  }
  for (const id of ['u_luna', 'u_barsik', 'u_koder']) {
    if (store.state.users[id]) {
      store.set(['friends', uid, id], { since: Date.now() });
      store.set(['friends', id, uid], { since: Date.now() });
    }
  }
  store.setUid(uid);
  const session = { uid, login: l, name: n, accountId: l, guest: false, since: Date.now() };
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
  if (!store.state.users[account.uid]) {
    store.set(['users', account.uid], newProfile(account.login, l, account.uid));
  }
  const session = { uid: account.uid, login: l, accountId: l, guest: false, since: Date.now() };
  saveSession(session);
  store.patch(['users', account.uid], { lastSeen: Date.now() }, true);
  return session;
}

export function enterGuest() {
  const s = { uid: store.uid, login: 'guest', guest: true, since: Date.now() };
  saveSession(s);
  return s;
}

export function logout() {
  clearSession();
  const guestUid = rid('u');
  store.setUid(guestUid);
  store.ensureSelf();
  store.set(['users', guestUid], store.state.users[guestUid]);
}

export async function changePassword(oldPass, newPass) {
  const s = getSession();
  if (!s || s.guest) throw new Error('Войдите в аккаунт');
  const account = store.state.accounts[s.accountId];
  if (!account) throw new Error('Аккаунт не найден');
  if (await hashPassword(oldPass, account.salt) !== account.passHash) throw new Error('Неверный текущий пароль');
  if (String(newPass).length < 6) throw new Error('Новый пароль от 6 символов');
  const salt = randomSalt();
  store.patch(['accounts', s.accountId], { salt, passHash: await hashPassword(newPass, salt) });
}

/* ---------- экран входа ---------- */
export function authPageHtml(mode = 'login', error = '') {
  const isLogin = mode === 'login';
  return `<div class="auth-bg">
    <div class="auth-top"><img src="assets/logo.svg" alt=""><b>dogapp</b><span>общение без подписок</span></div>
    <div class="auth-card">
      <div class="auth-head">
        <h1>${isLogin ? 'Вход в dogapp' : 'Создать аккаунт'}</h1>
        <p>${isLogin ? 'Введи логин и пароль, чтобы продолжить.' : 'Имя, логин и пароль сохранятся в Firebase и будут видны всем.'}</p>
      </div>
      <div class="auth-tabs">
        <button class="auth-tab ${isLogin ? 'active' : ''}" data-action="auth-tab" data-tab="login">Вход</button>
        <button class="auth-tab ${!isLogin ? 'active' : ''}" data-action="auth-tab" data-tab="register">Регистрация</button>
      </div>
      ${error ? `<div class="auth-error">${esc(error)}</div>` : ''}
      <form data-form="${isLogin ? 'auth-login' : 'auth-register'}" class="auth-form">
        ${!isLogin ? `<label class="field"><span>Отображаемое имя</span><input name="name" maxlength="32" placeholder="Как тебя будут видеть" required></label>` : ''}
        <label class="field"><span>Логин</span><input name="login" maxlength="20" placeholder="логин" autocomplete="username" required></label>
        <label class="field"><span>Пароль</span><input name="password" type="password" maxlength="64" placeholder="не менее 6 символов" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required></label>
        <button class="btn-primary btn-auth" type="submit">${isLogin ? 'Войти' : 'Зарегистрироваться'}</button>
      </form>
      <div class="auth-divider"><span>или</span></div>
      <button class="btn-outline full" data-action="auth-guest">Продолжить без аккаунта</button>
      <div class="auth-notes">
        <div>${icon('shield', 16)}<span>Профиль, баннер, шрифт ника и друзья привязаны к аккаунту.</span></div>
        <div>${icon('cloud', 16)}<span>Данные синхронизируются через Firebase Realtime Database.</span></div>
        <div>${icon('info', 16)}<span>Демо-авторизация: пароль хешируется в браузере, без серверной проверки.</span></div>
      </div>
    </div>
    <div class="auth-foot">dogapp · бесплатно · без смайлов в интерфейсе</div>
  </div>`;
}

export function accountTabHtml(storeRef) {
  const s = getSession();
  const me = storeRef.me();
  if (!s || s.guest) {
    return `<div class="notice notice-blurple">${icon('info', 18)}<div>Сейчас вы <b>гость</b>. Зарегистрируйтесь, чтобы имя, баннер, шрифт ника, друзья и звонки были привязаны к аккаунту и не потерялись при смене браузера.</div></div>
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
    <button class="btn-danger full" data-action="auth-logout">Выйти из аккаунта</button>`;
}
