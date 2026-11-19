// dogapp — стартовые данные (заливаются в пустую Firebase Realtime Database)
import { BANNER_PRESETS, INVITE_TTL } from './util.js';
import { emoteSet, DEFAULT_EMOTES } from './emojis.js';

const ch = (id, name, type, topic, category, order) => ({ id, name, type, topic, category, order });
const msg = (id, authorId, content, createdAt, reactions = {}) =>
  ({ id, authorId, content, createdAt, reactions });

export function buildSeed(uid) {
  const now = Date.now();
  const min = 60000, hour = 3600000, day = 86400000;

  const users = {
    [uid]: {
      id: uid, name: 'Пёс', tag: '0001', login: 'guest',
      avatar: { type: 'text', value: 'ПС', color: '#5865f2' }, avatarAnimated: false,
      banner: BANNER_PRESETS[0].value, bannerAnimated: false,
      bio: 'Просто пёс. Общаюсь бесплатно.', status: 'В dogapp', font: 'default',
      color: '#ffffff', lastSeen: now, createdAt: now - 7 * day
    },
    u_bot: {
      id: 'u_bot', name: 'dogapp Бот', tag: '0000', login: 'bot',
      avatar: { type: 'text', value: 'DB', color: '#4752c4' }, avatarAnimated: false,
      banner: BANNER_PRESETS[3].value, bannerAnimated: true,
      bio: 'Официальный помощник сервиса.', status: 'Слежу за порядком', font: 'mono',
      color: '#7d8bff', bot: true, lastSeen: now, createdAt: now - 30 * day
    },
    u_luna: {
      id: 'u_luna', name: 'Луна', tag: '2042', login: 'luna',
      avatar: { type: 'text', value: 'ЛН', color: '#eb459e' }, avatarAnimated: false,
      banner: BANNER_PRESETS[3].value, bannerAnimated: true,
      bio: 'Гуляю ночью, сижу в чате днём.', status: 'Смотрю на звёзды', font: 'serif',
      color: '#eb459e', lastSeen: now - 20000, createdAt: now - 20 * day
    },
    u_barsik: {
      id: 'u_barsik', name: 'Барсик', tag: '1337', login: 'barsik',
      avatar: { type: 'text', value: 'БР', color: '#23a55a' }, avatarAnimated: false,
      banner: BANNER_PRESETS[1].value, bannerAnimated: false,
      bio: 'Кот. Да, я тут.', status: 'Сплю на клавиатуре', font: 'rounded',
      color: '#23a55a', lastSeen: now - 45000, createdAt: now - 18 * day
    },
    u_koder: {
      id: 'u_koder', name: 'Кодер', tag: '0101', login: 'koder',
      avatar: { type: 'text', value: 'КД', color: '#f0b232' }, avatarAnimated: false,
      banner: BANNER_PRESETS[4].value, bannerAnimated: false,
      bio: 'HTML, CSS, JS и никаких подписок.', status: 'Пишу код', font: 'mono',
      color: '#f0b232', lastSeen: now - 90000, createdAt: now - 15 * day
    },
    u_mila: {
      id: 'u_mila', name: 'Мила', tag: '7777', login: 'mila',
      avatar: { type: 'text', value: 'МЛ', color: '#c084fc' }, avatarAnimated: false,
      banner: BANNER_PRESETS[2].value, bannerAnimated: false,
      bio: 'Коллекционирую Значки серверов.', status: 'Ищу новые emocии', font: 'wide',
      color: '#c084fc', lastSeen: now - 12 * hour, createdAt: now - 12 * day
    },
    u_rex: {
      id: 'u_rex', name: 'Рекс', tag: '0007', login: 'rex',
      avatar: { type: 'text', value: 'РК', color: '#f23f43' }, avatarAnimated: false,
      banner: BANNER_PRESETS[5].value, bannerAnimated: false,
      bio: 'Охраняю сервер.', status: 'Не в сети', font: 'gothic',
      color: '#f23f43', lastSeen: now - 3 * day, createdAt: now - 25 * day
    }
  };

  const members = (owner, list) => {
    const out = { [owner]: { role: 'owner', joinedAt: now - 10 * day } };
    for (const [id, role] of list) out[id] = { role, joinedAt: now - 8 * day };
    return out;
  };

  const servers = {
    s_dogapp: {
      id: 's_dogapp', name: 'dogapp', icon: { type: 'text', value: 'DA', color: '#5865f2' },
      banner: BANNER_PRESETS[0].value, bannerAnimated: true,
      description: 'Главный сервер dogapp — общение без платных подписок.',
      ownerId: uid, vanity: 'dogapp', createdAt: now - 30 * day,
      channels: {
        c_dg_welcome: ch('c_dg_welcome', 'добро-пожаловать', 'text', 'Начните отсюда', 'ИНФОРМАЦИЯ', 0),
        c_dg_rules: ch('c_dg_rules', 'правила', 'text', 'Будь вежливым', 'ИНФОРМАЦИЯ', 1),
        c_dg_general: ch('c_dg_general', 'общий', 'text', 'Главный чат — болтаем обо всём', 'ТЕКСТОВЫЕ КАНАЛЫ', 2),
        c_dg_flood: ch('c_dg_flood', 'флудилка', 'text', 'Можно писать сколько угодно', 'ТЕКСТОВЫЕ КАНАЛЫ', 3),
        c_dg_memes: ch('c_dg_memes', 'мемы', 'text', 'Картинки и шутки', 'ТЕКСТОВЫЕ КАНАЛЫ', 4),
        c_dg_emotes: ch('c_dg_emotes', 'эмоции', 'text', 'Эмоции сервера бесплатны для всех', 'ТЕКСТОВЫЕ КАНАЛЫ', 5),
        c_dg_voice: ch('c_dg_voice', 'Общий голос', 'voice', '', 'ГОЛОСОВЫЕ КАНАЛЫ', 6),
        c_dg_games: ch('c_dg_games', 'Игровая', 'voice', '', 'ГОЛОСОВЫЕ КАНАЛЫ', 7)
      },
      members: members(uid, [['u_bot', 'bot'], ['u_luna', 'admin'], ['u_barsik', 'member'], ['u_koder', 'member'], ['u_mila', 'member'], ['u_rex', 'member']]),
      emojis: emoteSet(DEFAULT_EMOTES.slice(0, 8), now, 'dogapp')
    },
    s_dogs: {
      id: 's_dogs', name: 'Клуб собаководов', icon: { type: 'text', value: 'КС', color: '#23a55a' },
      banner: BANNER_PRESETS[1].value, bannerAnimated: false,
      description: 'Фото питомцев, прогулки и бесконечные :bone:',
      ownerId: 'u_luna', vanity: 'dogs', createdAt: now - 22 * day,
      channels: {
        c_dogs_general: ch('c_dogs_general', 'общий', 'text', 'Куда пойдём гулять?', 'ОБЩЕНИЕ', 0),
        c_dogs_photo: ch('c_dogs_photo', 'фото-питомцев', 'text', 'Делимся снимками', 'ОБЩЕНИЕ', 1),
        c_dogs_walk: ch('c_dogs_walk', 'прогулки', 'text', 'Координаты и маршруты', 'ОБЩЕНИЕ', 2),
        c_dogs_voice: ch('c_dogs_voice', 'Лайв', 'voice', '', 'ГОЛОС', 3)
      },
      members: members('u_luna', [[uid, 'member'], ['u_barsik', 'member'], ['u_rex', 'member'], ['u_bot', 'bot']]),
      emojis: emoteSet([DEFAULT_EMOTES[1], DEFAULT_EMOTES[2], DEFAULT_EMOTES[8], DEFAULT_EMOTES[9], DEFAULT_EMOTES[5]], now, 'Луна')
    },
    s_code: {
      id: 's_code', name: 'Пиксели и код', icon: { type: 'text', value: 'ПК', color: '#7b2ff7' },
      banner: BANNER_PRESETS[3].value, bannerAnimated: false,
      description: 'Здесь только временная ссылка: живёт 3 дня, потом истекает.',
      ownerId: 'u_koder', vanity: '', createdAt: now - 9 * day,
      channels: {
        c_code_general: ch('c_code_general', 'общий', 'text', 'HTML / CSS / JS', 'РАЗРАБОТКА', 0),
        c_code_code: ch('c_code_code', 'код', 'text', 'Сниппеты и ревью', 'РАЗРАБОТКА', 1),
        c_code_bugs: ch('c_code_bugs', 'баги', 'text', 'Что опять сломалось', 'РАЗРАБОТКА', 2),
        c_code_voice: ch('c_code_voice', 'Созвон', 'voice', '', 'ГОЛОС', 3)
      },
      members: members('u_koder', [['u_bot', 'bot'], ['u_mila', 'member']]),
      emojis: emoteSet([DEFAULT_EMOTES[10], DEFAULT_EMOTES[11], DEFAULT_EMOTES[7]], now, 'Кодер')
    }
  };

  const messages = {
    c_dg_welcome: {
      m_w1: msg('m_w1', 'u_bot', '**Добро пожаловать в dogapp!** :doge:\nБесплатная копия Discord: баннеры для себя и серверов, эмоции серверов без подписки и приглашения с кастомной ссылкой.\n\n> Правила простые: будь вежливым.', now - 26 * hour),
      m_w2: msg('m_w2', 'u_luna', 'Кастомная ссылка на сервер: #/i/dogapp — живёт вечно', now - 25 * hour, { 'party': ['u_barsik', 'u_mila'], 'heart': [uid] }),
      m_w3: msg('m_w3', 'u_bot', 'А это обычная ссылка #/i/WELCOME7 — срок действия ровно **3 дня**, потом она перестанет работать.', now - 25 * hour + min)
    },
    c_dg_general: {
      m_g1: msg('m_g1', 'u_luna', 'Эмоции серверов можно использовать где угодно :doge: :party: И бесплатно.', now - 3 * hour),
      m_g2: msg('m_g2', 'u_barsik', 'Кидаю :bone: и поставил себе баннер в профиле, получилось неплохо', now - 3 * hour + 2 * min, { 'fire': ['u_luna'] }),
      m_g3: msg('m_g3', 'u_koder', 'Чат работает на **Firebase Realtime Database**, всё синхронится между вкладками. `HTML + CSS + JS`, без сборки.', now - 2 * hour),
      m_g4: msg('m_g4', 'u_mila', 'Собрала коллекцию: :paws: :heart: :wave: :think:', now - 90 * min),
      m_g5: msg('m_g5', 'u_bot', 'Загляните в #эмоции — там picker со всеми эмоциями серверов. Они доступны друзьям и в личных сообщениях.', now - 40 * min),
      m_g6: msg('m_g6', 'u_luna', 'Приглашение друзьям: #/i/dogapp — кастомный адрес, не истекает', now - 12 * min),
      m_g7: msg('m_g7', 'u_barsik', 'Гав! :bark: :doge:', now - 4 * min, { 'doge': [uid, 'u_luna', 'u_mila'], 'paws': ['u_koder'] })
    },
    c_dg_memes: {
      m_mm1: msg('m_mm1', 'u_mila', 'Когда узнала, что за эмоции не надо платить :fire: :party:', now - 5 * hour)
    },
    c_dg_emotes: {
      m_em1: msg('m_em1', 'u_bot', 'Доступные эмоции: :doge: :paws: :bone: :party: :fire: :heart: :wave: :think: — жми на значок в поле ввода.', now - 7 * hour)
    },
    c_dogs_general: {
      m_d1: msg('m_d1', 'u_luna', 'Кто на прогулку? :bark: :paws:', now - 6 * hour),
      m_d2: msg('m_d2', 'u_rex', 'Я! :bone:', now - 6 * hour + 3 * min)
    },
    c_code_general: {
      m_c1: msg('m_c1', 'u_koder', 'Этот сервер доступен только по временной ссылке #/i/CODE2026 — она истечёт через 3 дня.', now - 8 * hour)
    },
    dm_bot: {
      m_dm1: msg('m_dm1', 'u_bot', 'Привет. Я dogapp Бот.\nНапиши что-нибудь в #общий — сообщения сразу появятся у всех, у кого открыт dogapp.', now - 30 * min)
    }
  };

  const dms = {
    dm_bot: { id: 'dm_bot', users: [uid, 'u_bot'], name: 'dogapp Бот', avatar: { type: 'text', value: 'DB', color: '#4752c4' }, createdAt: now - 30 * min },
    dm_luna: { id: 'dm_luna', users: [uid, 'u_luna'], name: 'Луна', avatar: { type: 'text', value: 'ЛН', color: '#eb459e' }, createdAt: now - 20 * day },
    dm_koder: { id: 'dm_koder', users: [uid, 'u_koder'], name: 'Кодер', avatar: { type: 'text', value: 'КД', color: '#f0b232' }, createdAt: now - 15 * day }
  };

  const invites = {
    dogapp: { code: 'dogapp', serverId: 's_dogapp', custom: true, createdAt: now - 30 * day, expiresAt: null, creatorId: uid, uses: 142 },
    dogs: { code: 'dogs', serverId: 's_dogs', custom: true, createdAt: now - 22 * day, expiresAt: null, creatorId: 'u_luna', uses: 38 },
    WELCOME7: { code: 'WELCOME7', serverId: 's_dogapp', custom: false, createdAt: now - 2 * day, expiresAt: now + INVITE_TTL - 2 * day, creatorId: uid, uses: 7 },
    CODE2026: { code: 'CODE2026', serverId: 's_code', custom: false, createdAt: now - 60 * min, expiresAt: now + INVITE_TTL, creatorId: 'u_koder', uses: 1 }
  };

  const friends = {
    [uid]: {
      u_luna: { since: now - 15 * day },
      u_barsik: { since: now - 10 * day },
      u_koder: { since: now - 5 * day }
    },
    u_luna: { [uid]: { since: now - 15 * day } },
    u_barsik: { [uid]: { since: now - 10 * day } },
    u_koder: { [uid]: { since: now - 5 * day } }
  };

  const friendRequests = {
    fr_in1: { id: 'fr_in1', from: 'u_mila', to: uid, status: 'pending', createdAt: now - 3 * hour },
    fr_out1: { id: 'fr_out1', from: uid, to: 'u_rex', status: 'pending', createdAt: now - 2 * day }
  };

  return {
    meta: { version: 2, app: 'dogapp', createdAt: now },
    users, servers, messages, dms, invites, typing: {},
    accounts: {}, friends, friendRequests, calls: {}, voice: {}, blocks: {}
  };
}
