// dogapp — хранилище: Firebase Realtime Database (REST) + локальный кэш при недоступности сети
import { FB_DEFAULT, rid, BANNER_PRESETS, initials } from './util.js';
import { buildEmptyState, collectDemoCleanup } from './seed.js';

const LS_UID  = 'dogapp_uid_v1';
const LS_FB   = 'dogapp_fb_url_v1';
const LS_DATA = 'dogapp_state_v1';

function readJSON(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch (_) { return fallback; }
}
function obj(v) {
  if (!v || typeof v !== 'object') return {};
  if (Array.isArray(v)) return Object.fromEntries(v.map((x, i) => [String(i), x]));
  return v;
}
function normalize(raw) {
  const d = obj(raw);
  return {
    meta: obj(d.meta), users: obj(d.users), servers: obj(d.servers),
    messages: obj(d.messages), dms: obj(d.dms), invites: obj(d.invites), typing: obj(d.typing),
    accounts: obj(d.accounts), friends: obj(d.friends), friendRequests: obj(d.friendRequests),
    calls: obj(d.calls), voice: obj(d.voice), blocks: obj(d.blocks)
  };
}
function setIn(root, path, value) {
  let cur = root;
  for (let i = 0; i < path.length - 1; i++) {
    const k = String(path[i]);
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[String(path[path.length - 1])] = value;
}
function getIn(root, path) {
  return path.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), root);
}
function delIn(root, path) {
  const parent = getIn(root, path.slice(0, -1));
  if (parent && typeof parent === 'object') delete parent[path[path.length - 1]];
}
function patchIn(root, path, patch) {
  const cur = getIn(root, path);
  if (cur && typeof cur === 'object' && !Array.isArray(cur)) Object.assign(cur, patch);
  else setIn(root, path, { ...patch });
}

export class Store {
  constructor() {
    this.url = (localStorage.getItem(LS_FB) || FB_DEFAULT).replace(/\/+$/, '');
    this.root = this.url + '/dogapp';
    this.uid = this._uid();
    this.state = null;
    this.mode = 'loading';
    this.error = '';
    this.writeError = '';
    this.listeners = [];
    this.lastSig = '';
    this.pending = 0;
    this.pollTimer = null;
    this.beatTimer = null;
    this.warned = false;
    this._storageBound = false;
  }

  _uid() {
    let u = localStorage.getItem(LS_UID);
    if (!u || /[^a-zA-Z0-9_-]/.test(u)) {
      u = rid('u');
      localStorage.setItem(LS_UID, u);
    }
    return u;
  }

  setUid(uid) {
    if (!uid || /[^a-zA-Z0-9_-]/.test(String(uid))) return;
    this.uid = String(uid);
    localStorage.setItem(LS_UID, this.uid);
  }

  _url(path) {
    const seg = String(path || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
      .map(encodeURIComponent).join('/');
    return `${this.root}${seg ? '/' + seg : ''}.json`;
  }

  on(fn) { this.listeners.push(fn); }
  emit() { for (const fn of this.listeners) { try { fn(); } catch (e) { console.error(e); } } }

  me() { return this.state.users[this.uid] || {}; }
  myServers() {
    return Object.values(this.state.servers).filter(s => s.members && s.members[this.uid]);
  }

  async init() {
    const cached = readJSON(LS_DATA);
    let remote = null, reachable = false;
    try { remote = await this._read(''); reachable = true; }
    catch (e) { this.error = e.message || 'сеть недоступна'; }

    if (reachable) {
      this.mode = 'firebase';
      if (remote && Object.keys(obj(remote)).length) {
        this.state = normalize(remote);
      } else {
        const empty = buildEmptyState();
        this.state = normalize(empty);
        try { await this._request('', 'PUT', empty); }
        catch (e) {
          this.mode = 'local';
          this.error = 'База доступна только на чтение: ' + (e.message || 'запись запрещена');
        }
      }
    } else {
      this.mode = 'local';
      this.state = normalize(cached || buildEmptyState());
    }

    const cleanup = collectDemoCleanup(this.state);
    if (cleanup.length) {
      const clean = this.applyChanges(cleanup, true);
      await this.persistChanges(clean);
    }

    this.ensureSelf();
    this.saveCache();
    this.lastSig = JSON.stringify(this.state);
    this.startPolling();
    return this.mode;
  }

  _signal() {
    return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(5000) : undefined;
  }

  async _read(path) {
    const res = await fetch(this._url(path) + '?t=' + Date.now(), { cache: 'no-store', signal: this._signal() });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' (проверьте правила Firebase)');
    return res.json();
  }

  async _request(path, method, body) {
    const res = await fetch(this._url(path), {
      method,
      signal: this._signal(),
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json().catch(() => null);
  }

  // Профиль создаётся только регистрацией. Гостевых записей больше нет.
  ensureSelf() {
    const u = this.state.users[this.uid];
    if (!u) return;
    u.lastSeen = Date.now();
    if (!u.font) u.font = 'default';
    if (typeof u.bannerAnimated !== 'boolean') u.bannerAnimated = false;
    if (typeof u.avatarAnimated !== 'boolean') u.avatarAnimated = false;
    if (u.avatar && u.avatar.type === 'emoji') u.avatar = { type: 'text', value: initials(u.name || u.login || '?'), color: '#5865f2' };
  }

  saveCache() {
    try { localStorage.setItem(LS_DATA, JSON.stringify(this.state)); } catch (_) { /* квота */ }
  }

  startPolling() {
    clearInterval(this.pollTimer);
    clearInterval(this.beatTimer);
    if (this.mode === 'firebase') {
      this.pollTimer = setInterval(() => this.sync(), 2000);
      this.beatTimer = setInterval(() => this.heartbeat(), 25000);
    }
    if (!this._storageBound) {
      this._storageBound = true;
      window.addEventListener('online', () => this.sync());
      window.addEventListener('storage', e => {
        if (this.mode === 'local' && e.key === LS_DATA && e.newValue) {
          try { this.state = normalize(JSON.parse(e.newValue)); this.emit(); }
          catch (_) { /* битый кэш */ }
        }
      });
    }
  }

  async heartbeat() {
    if (this.mode !== 'firebase' || !this.state.users[this.uid]) return;
    try { await this._request('/users/' + this.uid, 'PATCH', { lastSeen: Date.now() }); }
    catch (_) { /* тихо */ }
  }

  async sync() {
    if (this.mode !== 'firebase' || this.pending > 0) return;
    const prevSig = this.lastSig;
    try {
      const remote = await this._read('');
      const data = normalize(remote || {});
      const cleanup = collectDemoCleanup(data);
      if (cleanup.length) {
        this.state = data;
        const clean = this.applyChanges(cleanup, true);
        this.persistChanges(clean);
      } else {
        this.state = data;
      }
      const sig = JSON.stringify(this.state);
      if (sig !== prevSig) {
        this.lastSig = sig;
        this.saveCache();
        this.emit();
      }
    } catch (e) { this.error = e.message || 'нет связи с Firebase'; }
  }

  async recheck(url) {
    if (url) {
      const clean = String(url).trim().replace(/\/+$/, '');
      if (!/^https:\/\/[a-z0-9.-]+\.firebaseio\.com$/i.test(clean) && !/^https:\/\/[a-z0-9.-]+\.firebasedatabase\.app$/i.test(clean)) {
        throw new Error('Нужен адрес вида https://PROJECT-default-rtdb.firebaseio.com');
      }
      this.url = clean; this.root = clean + '/dogapp';
      localStorage.setItem(LS_FB, clean);
    }
    clearInterval(this.pollTimer); clearInterval(this.beatTimer);
    return this.init();
  }

  bump(silent = false) {
    this.lastSig = JSON.stringify(this.state);
    this.saveCache();
    if (!silent) this.emit();
  }

  // Один пакет изменений: обновляем состояние и пишем только затронутые узлы Firebase.
  applyChanges(changes, silent = true) {
    const seen = new Set();
    const clean = [];
    for (const c of changes || []) {
      if (!c || !Array.isArray(c.path) || !c.path.length) continue;
      const key = c.method + ':' + c.path.map(String).join('/');
      if (seen.has(key)) continue;
      seen.add(key);
      if (c.method === 'PUT') setIn(this.state, c.path, c.value);
      else if (c.method === 'PATCH') patchIn(this.state, c.path, c.value || {});
      else delIn(this.state, c.path);
      clean.push(c);
    }
    this.bump(silent);
    return clean;
  }

  async persistChanges(changes) {
    if (this.mode !== 'firebase' || !changes?.length) return;
    this.pending++;
    try {
      const results = await Promise.allSettled(changes.map(c => this._request(c.path.map(String).join('/'), c.method, c.value)));
      const failed = results.find(r => r.status === 'rejected');
      if (failed) throw failed.reason;
    } catch (e) {
      this.onWriteError(e);
    } finally {
      this.pending--;
    }
  }

  _write(path, method, value) {
    if (this.mode !== 'firebase') return;
    const p = path.map(String).join('/');
    this.pending++;
    this._request(p, method, value)
      .catch(e => this.onWriteError(e))
      .finally(() => { this.pending--; });
  }

  onWriteError(e) {
    this.writeError = e.message || 'запись запрещена';
    if (this.mode === 'firebase') {
      this.mode = 'local';
      clearInterval(this.pollTimer); clearInterval(this.beatTimer);
    }
    if (!this.warned) {
      this.warned = true;
      import('./util.js').then(m => m.toast('Firebase не дал записать данные — включён локальный режим. Проверьте правила: read/write = true', 'warn'));
    }
  }

  set(path, value, silent = false) {
    setIn(this.state, path, value);
    this.bump(silent);
    this._write(path, 'PUT', value);
  }
  del(path, silent = false) {
    delIn(this.state, path);
    this.bump(silent);
    this._write(path, 'DELETE');
  }
  patch(path, patch, silent = false) {
    patchIn(this.state, path, patch);
    this.bump(silent);
    this._write(path, 'PATCH', patch);
  }
}

export const store = new Store();
