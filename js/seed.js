// dogapp — пустое состояние базы и очистка данных, созданных предыдущими версиями.
// Никаких предустановленных серверов, ботов, вымышленных людей и сообщений от них.
import { DEMO_USER_IDS } from './util.js';

export const CLEANUP_VERSION = 3;
export const DEMO_SERVER_IDS = Object.freeze(['s_dogapp', 's_dogs', 's_code']);
export const DEMO_DM_IDS = Object.freeze(['dm_bot', 'dm_luna', 'dm_koder']);
export const DEMO_INVITE_CODES = Object.freeze(['dogapp', 'dogs', 'WELCOME7', 'CODE2026']);

const isDemoChannel = id => /^(c_dg_|c_dogs_|c_code_)/.test(String(id || ''));

export function buildEmptyState() {
  return {
    meta: { version: 3, app: 'dogapp', seeded: false, cleanupVersion: CLEANUP_VERSION, createdAt: Date.now() },
    users: {}, servers: {}, messages: {}, dms: {}, invites: {}, typing: {},
    accounts: {}, friends: {}, friendRequests: {}, calls: {}, voice: {}, blocks: {}
  };
}

// Совместимость со старым импортом. Теперь возвращает пустую базу, а не стартовые данные.
export const buildSeed = buildEmptyState;

function fakeUserId(id, state) {
  if (!id || DEMO_USER_IDS.includes(id)) return true;
  const u = state.users?.[id];
  if (!u || u.bot || u.demo || u.guest || !u.login) return true;
  return !!state.accounts && !state.accounts[String(u.login).toLowerCase()];
}

function demoServer(sv, state) {
  if (!sv || typeof sv !== 'object') return true;
  if (DEMO_SERVER_IDS.includes(sv.id) || sv.demo || sv.seeded || sv.createdBy === 'seed') return true;
  return fakeUserId(sv.ownerId, state);
}

// Возвращает список изменений для Firebase REST. Состояние меняет store.applyChanges.
export function collectDemoCleanup(state) {
  const changes = [];
  const del = path => changes.push({ path, method: 'DELETE' });
  const put = (path, value) => changes.push({ path, method: 'PUT', value });

  // Все известные вымышленные ID нужны для поиска ссылок, но удаляем только реально существующие узлы.
  const fakeIds = new Set(DEMO_USER_IDS);
  for (const [id] of Object.entries(state.users || {})) if (fakeUserId(id, state)) fakeIds.add(id);
  const presentFakeIds = new Set([...fakeIds].filter(id =>
    state.users?.[id] || state.friends?.[id] || state.blocks?.[id]
  ));

  const invites = Object.entries(state.invites || {});
  const demoServerIds = new Set();
  for (const sid of DEMO_SERVER_IDS) {
    if (state.servers?.[sid] || invites.some(([, inv]) => inv?.serverId === sid)) demoServerIds.add(sid);
  }
  for (const [id, sv] of Object.entries(state.servers || {})) if (demoServer(sv, state)) demoServerIds.add(id);

  const channelIds = new Set();
  for (const sid of demoServerIds) {
    for (const cid of Object.keys(state.servers?.[sid]?.channels || {})) channelIds.add(cid);
  }
  for (const cid of Object.keys(state.messages || {})) if (isDemoChannel(cid)) channelIds.add(cid);
  for (const cid of Object.keys(state.voice || {})) if (isDemoChannel(cid)) channelIds.add(cid);
  for (const cid of Object.keys(state.typing || {})) if (isDemoChannel(cid)) channelIds.add(cid);

  for (const cid of channelIds) {
    if (state.messages?.[cid]) del(['messages', cid]);
    if (state.voice?.[cid]) del(['voice', cid]);
    if (state.typing?.[cid]) del(['typing', cid]);
  }
  for (const sid of demoServerIds) {
    if (state.servers?.[sid]) del(['servers', sid]);
  }
  for (const [code, inv] of invites) {
    if (demoServerIds.has(inv?.serverId) || fakeIds.has(inv?.creatorId)) del(['invites', code]);
  }

  // Личные беседы с вымышленными профилями.
  for (const [dmId, dm] of Object.entries(state.dms || {})) {
    const users = Array.isArray(dm?.users) ? dm.users : [];
    if (DEMO_DM_IDS.includes(dmId) || users.some(id => fakeIds.has(id)) || !users.every(id => state.users?.[id]?.login)) {
      del(['dms', dmId]);
      if (state.messages?.[dmId]) del(['messages', dmId]);
    }
  }

  // Удаляем существующие узлы вымышленных пользователей.
  for (const id of presentFakeIds) {
    if (state.users?.[id]) del(['users', id]);
    if (state.friends?.[id]) del(['friends', id]);
    if (state.blocks?.[id]) del(['blocks', id]);
  }

  // Убираем все ссылки на вымышленные ID из данных реальных аккаунтов.
  for (const id of fakeIds) {
    for (const [other, list] of Object.entries(state.friends || {})) if (list?.[id]) del(['friends', other, id]);
    for (const [other, list] of Object.entries(state.blocks || {})) if (list?.[id]) del(['blocks', other, id]);
    for (const [sid, sv] of Object.entries(state.servers || {})) {
      if (!demoServerIds.has(sid) && sv?.members?.[id]) del(['servers', sid, 'members', id]);
    }
    for (const [cid, people] of Object.entries(state.voice || {})) if (people?.[id]) del(['voice', cid, id]);
    for (const [key, people] of Object.entries(state.typing || {})) if (people?.[id]) del(['typing', key, id]);
    for (const [rid, r] of Object.entries(state.friendRequests || {})) {
      if (r?.from === id || r?.to === id || fakeIds.has(r?.from) || fakeIds.has(r?.to)) del(['friendRequests', rid]);
    }
    for (const [callId, c] of Object.entries(state.calls || {})) {
      if (c?.from === id || c?.to === id || c?.demo || c?.mode === 'demo' || fakeIds.has(c?.from) || fakeIds.has(c?.to)) del(['calls', callId]);
    }
    for (const [login, account] of Object.entries(state.accounts || {})) {
      if (account?.uid === id || fakeIds.has(account?.uid)) del(['accounts', login]);
    }
  }

  // Чистим сообщения и реакции, оставшиеся от вымышленных профилей.
  for (const [bucket, messages] of Object.entries(state.messages || {})) {
    for (const [mid, m] of Object.entries(messages || {})) {
      if (!m || typeof m !== 'object') continue;
      if (fakeIds.has(m.authorId)) { del(['messages', bucket, mid]); continue; }
      for (const [emoji, users] of Object.entries(m.reactions || {})) {
        if (!Array.isArray(users)) continue;
        const next = users.filter(uid => !fakeIds.has(uid));
        if (next.length !== users.length) {
          if (next.length) put(['messages', bucket, mid, 'reactions', emoji], next);
          else del(['messages', bucket, mid, 'reactions', emoji]);
        }
      }
    }
  }

  if ((state.meta?.cleanupVersion || 0) < CLEANUP_VERSION) {
    changes.push({
      path: ['meta'], method: 'PATCH',
      value: { version: 3, app: 'dogapp', seeded: false, cleanupVersion: CLEANUP_VERSION }
    });
  }
  return changes;
}
