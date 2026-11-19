// dogapp — стартовые данные (заливаются в пустую Firebase Realtime Database)
import { BANNER_PRESETS, INVITE_TTL } from './util.js';
import { emoteSet, DEFAULT_EMOTES } from './emojis.js';

const ch = (id, name, type, topic, category, order) => ({ id, name, type, topic, category, order });
const msg = (id, authorId, content, createdAt, reactions = {}) =>
  ({ id, authorId, content, createdAt, reactions });

export function buildSeed(uid) {
  const now = Date.now();
  const min = 60000, hour = 3600000;

  const users = {
    [uid]: {
      id: uid, name: 'Пёс', tag: '0001', avatar: { type: 'emoji', value: '🐕' },
      banner: BANNER_PRESETS[0].value, bio: 'Просто пёс. Общаюсь бесплатно 🐾',
      status: 'В dogapp · всё бесплатно', color: '#ffffff', lastSeen: now, createdAt: now - 7 * 86400000
    },
    u_bot: {
      id: 'u_bot', name: 'dogapp Бот', tag: '0000', avatar: { type: 'emoji', value: '🐶' },
      banner: BANNER_PRESETS[3].value, bio: 'Официальный пёс-помощник. Гав!', status: 'На страже бесплатных эмоций',
      color: '#5865f2', bot: true, lastSeen: now, createdAt: now - 30 * 86400000
    },
    u_luna: {
      id: 'u_luna', name: 'Луна', tag: '2042', avatar: { type: 'emoji', value: '🌙' },
      banner: BANNER_PRESETS[3].value, bio: 'Гуляю ночью, сижу в чате днём', status: 'Смотрю на звёзды',
      color: '#eb459e', lastSeen: now - 20000, createdAt: now - 20 * 86400000
    },
    u_barsik: {
      id: 'u_barsik', name: 'Барсик', tag: '1337', avatar: { type: 'emoji', value: '🐱' },
      banner: BANNER_PRESETS[1].value, bio: 'Кот. Да, я тут.', status: 'Сплю на клавиатуре',
      color: '#23a55a', lastSeen: now - 45000, createdAt: now - 18 * 86400000
    },
    u_koder: {
      id: 'u_koder', name: 'Кодер', tag: '0101', avatar: { type: 'emoji', value: '💻' },
      banner: BANNER_PRESETS[4].value, bio: 'HTML, CSS, JS и никаких подписок', status: 'Пишу код',
      color: '#f0b232', lastSeen: now - 90000, createdAt: now - 15 * 86400000
    },
    u_mila: {
      id: 'u_mila', name: 'Мила', tag: '7777', avatar: { type: 'emoji', value: '🦴' },
      banner: BANNER_PRESETS[2].value, bio: 'Коллекционирую эмоции', status: 'Ищу новые эмоции',
      color: '#c084fc', lastSeen: now - 12 * hour, createdAt: now - 12 * 86400000
    },
    u_rex: {
      id: 'u_rex', name: 'Рекс', tag: '0007', avatar: { type: 'emoji', value: '🐕‍🦺' },
      banner: BANNER_PRESETS[5].value, bio: 'Охраняю сервер', status: 'Не в сети',
      color: '#f23f43', lastSeen: now - 3 * 86400000, createdAt: now - 25 * 86400000
    }
  };

  const members = (owner, list) => {
    const out = { [owner]: { role: 'owner', joinedAt: now - 10 * 86400000 } };
    for (const [id, role] of list) out[id] = { role, joinedAt: now - 8 * 86400000 };
    return out;
  };

  const servers = {
    s_dogapp: {
      id: 's_dogapp', name: 'dogapp', icon: { type: 'emoji', value: '🐕' },
      banner: BANNER_PRESETS[0].value,
      description: 'Главный сервер dogapp — общение без платных подписок.',
      ownerId: uid, vanity: 'dogapp', createdAt: now - 30 * 86400000,
      channels: {
        c_dg_welcome: ch('c_dg_welcome', 'добро-пожаловать', 'text', 'Начните отсюда 🐾', 'ИНФОРМАЦИЯ', 0),
        c_dg_rules: ch('c_dg_rules', 'правила', 'text', 'Будь добрым, не кусайся', 'ИНФОРМАЦИЯ', 1),
        c_dg_general: ch('c_dg_general', 'общий', 'text', 'Главный чат — болтаем обо всём', 'ТЕКСТОВЫЕ КАНАЛЫ', 2),
        c_dg_flood: ch('c_dg_flood', 'флудилка', 'text', 'Можно гавкать сколько угодно', 'ТЕКСТОВЫЕ КАНАЛЫ', 3),
        c_dg_memes: ch('c_dg_memes', 'мемы', 'text', 'Только мемы и :doge:', 'ТЕКСТОВЫЕ КАНАЛЫ', 4),
        c_dg_emotes: ch('c_dg_emotes', 'эмоции', 'text', 'Эмоции сервера бесплатны для всех', 'ТЕКСТОВЫЕ КАНАЛЫ', 5),
        c_dg_voice: ch('c_dg_voice', 'Общий голос', 'voice', '', 'ГОЛОСОВЫЕ КАНАЛЫ', 6),
        c_dg_games: ch('c_dg_games', 'Игровая', 'voice', '', 'ГОЛОСОВЫЕ КАНАЛЫ', 7)
      },
      members: members(uid, [['u_bot', 'bot'], ['u_luna', 'admin'], ['u_barsik', 'member'], ['u_koder', 'member'], ['u_mila', 'member'], ['u_rex', 'member']]),
      emojis: emoteSet(DEFAULT_EMOTES.slice(0, 8), now, 'dogapp')
    },
    s_dogs: {
      id: 's_dogs', name: 'Клуб собаководов', icon: { type: 'emoji', value: '🐩' },
      banner: BANNER_PRESETS[1].value,
      description: 'Фото питомцев, прогулки и бесконечные :bone:',
      ownerId: 'u_luna', vanity: 'dogs', createdAt: now - 22 * 86400000,
      channels: {
        c_dogs_general: ch('c_dogs_general', 'общий', 'text', 'Куда пойдём гулять?', 'ОБЩЕНИЕ', 0),
        c_dogs_photo: ch('c_dogs_photo', 'фото-питомцев', 'text', 'Хвастаемся хвостиками 📸', 'ОБЩЕНИЕ', 1),
        c_dogs_walk: ch('c_dogs_walk', 'прогулки', 'text', 'Координаты и маршруты', 'ОБЩЕНИЕ', 2),
        c_dogs_voice: ch('c_dogs_voice', 'Лайв', 'voice', '', 'ГОЛОС', 3)
      },
      members: members('u_luna', [[uid, 'member'], ['u_barsik', 'member'], ['u_rex', 'member'], ['u_bot', 'bot']]),
      emojis: emoteSet([DEFAULT_EMOTES[1], DEFAULT_EMOTES[2], DEFAULT_EMOTES[8], DEFAULT_EMOTES[9], DEFAULT_EMOTES[5]], now, 'Луна')
    },
    s_code: {
      id: 's_code', name: 'Пиксели и код', icon: { type: 'emoji', value: '💻' },
      banner: BANNER_PRESETS[3].value,
      description: 'Здесь только временная ссылка: живёт 3 дня, потом истекает.',
      ownerId: 'u_koder', vanity: '', createdAt: now - 9 * 86400000,
      channels: {
        c_code_general: ch('c_code_general', 'общий', 'text', 'HTML / CSS / JS', 'РАЗРАБОТКА', 0),
        c_code_code: ch('c_code_code', 'код', 'text', 'Сниппеты и ревью', 'РАЗРАБОТКА', 1),
        c_code_bugs: ch('c_code_bugs', 'баги', 'text', 'Что опять сломалось', 'РАЗРАБОТКА', 2)
      },
      members: members('u_koder', [['u_bot', 'bot'], ['u_mila', 'member']]),
      emojis: emoteSet([DEFAULT_EMOTES[10], DEFAULT_EMOTES[11], DEFAULT_EMOTES[7]], now, 'Кодер')
    }
  };

  const messages = {
    c_dg_welcome: {
      m_w1: msg('m_w1', 'u_bot', '**Добро пожаловать в dogapp!** 🐾 :doge:\nЭто бесплатная копия Discord: баннеры для себя и серверов, эмоции серверов без Nitro и приглашения с кастомной ссылкой.\n\n> Правила простые: будь добрым, не кусайся.', now - 26 * hour),
      m_w2: msg('m_w2', 'u_luna', 'Кастомная ссылка на сервер: #/i/dogapp — живёт вечно ✨', now - 25 * hour, { '🎉': ['u_barsik', 'u_mila'], '💜': [uid] }),
      m_w3: msg('m_w3', 'u_bot', 'А это обычная ссылка #/i/WELCOME7 — срок действия ровно **3 дня**, потом она перестанет работать.', now - 25 * hour + min)
    },
    c_dg_general: {
      m_g1: msg('m_g1', 'u_luna', 'О, наконец-то эмоции серверов можно кидать где угодно :doge: :party: И бесплатно!', now - 3 * hour),
      m_g2: msg('m_g2', 'u_barsik', 'Кидаю кость :bone: и поставил себе баннер в профиле, красота', now - 3 * hour + 2 * min, { ':fire:': ['u_luna'] }),
      m_g3: msg('m_g3', 'u_koder', 'Чат работает на **Firebase Realtime Database**, всё синхронится между вкладками ⚡ `HTML + CSS + JS`, без сборки.', now - 2 * hour),
      m_g4: msg('m_g4', 'u_mila', 'Собрала коллекцию эмоций: :paws: :heart: :wave: :think:', now - 90 * min),
      m_g5: msg('m_g5', 'u_bot', 'Загляните в #эмоции — там picker со всеми эмоциями серверов. Использовать их можно в любом канале и даже в ЛС.', now - 40 * min),
      m_g6: msg('m_g6', 'u_luna', 'Кстати, приглашение друзьям: #/i/dogapp — кастомный адрес, не истекает :sparkle:', now - 12 * min),
      m_g7: msg('m_g7', 'u_barsik', 'Гав! :bark: :doge:', now - 4 * min, { ':doge:': [uid, 'u_luna', 'u_mila'], '🐾': ['u_koder'] })
    },
    c_dg_memes: {
      m_mm1: msg('m_mm1', 'u_mila', 'Когда узнала, что за эмоции не надо платить :fire: :party:', now - 5 * hour)
    },
    c_dg_emotes: {
      m_em1: msg('m_em1', 'u_bot', 'Доступные эмоции: :doge: :paws: :bone: :party: :fire: :heart: :wave: :think: — жми на смайлик в поле ввода.', now - 7 * hour)
    },
    c_dogs_general: {
      m_d1: msg('m_d1', 'u_luna', 'Кто на прогулку? :bark: :paws:', now - 6 * hour),
      m_d2: msg('m_d2', 'u_rex', 'Я! :bone:', now - 6 * hour + 3 * min)
    },
    c_code_general: {
      m_c1: msg('m_c1', 'u_koder', 'Этот сервер доступен только по временной ссылке #/i/CODE2026 — она истечёт через 3 дня.', now - 8 * hour)
    },
    dm_bot: {
      m_dm1: msg('m_dm1', 'u_bot', 'Гав! Я dogapp Бот 🐶\nНапиши что-нибудь в #общий — сообщения сразу появятся у всех, у кого открыт dogapp.', now - 30 * min)
    }
  };

  const dms = {
    dm_bot: { id: 'dm_bot', users: [uid, 'u_bot'], name: 'dogapp Бот', avatar: { type: 'emoji', value: '🐶' }, createdAt: now - 30 * min },
    dm_luna: { id: 'dm_luna', users: [uid, 'u_luna'], name: 'Луна', avatar: { type: 'emoji', value: '🌙' }, createdAt: now - 20 * 86400000 },
    dm_koder: { id: 'dm_koder', users: [uid, 'u_koder'], name: 'Кодер', avatar: { type: 'emoji', value: '💻' }, createdAt: now - 15 * 86400000 }
  };

  const invites = {
    dogapp: { code: 'dogapp', serverId: 's_dogapp', custom: true, createdAt: now - 30 * 86400000, expiresAt: null, creatorId: uid, uses: 142 },
    dogs: { code: 'dogs', serverId: 's_dogs', custom: true, createdAt: now - 22 * 86400000, expiresAt: null, creatorId: 'u_luna', uses: 38 },
    WELCOME7: { code: 'WELCOME7', serverId: 's_dogapp', custom: false, createdAt: now - 2 * 86400000, expiresAt: now + INVITE_TTL - 2 * 86400000, creatorId: uid, uses: 7 },
    CODE2026: { code: 'CODE2026', serverId: 's_code', custom: false, createdAt: now - 60 * min, expiresAt: now + INVITE_TTL, creatorId: 'u_koder', uses: 1 }
  };

  return {
    meta: { version: 1, app: 'dogapp', createdAt: now, note: 'Realtime Database: всё бесплатно 🐾' },
    users, servers, messages, dms, invites, typing: {}
  };
}
