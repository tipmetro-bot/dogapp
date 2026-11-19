// dogapp — модальные окна, поповеры, экран приглашения и picker эмоций
import {
  BANNER_PRESETS, FONT_CHOICES, INVITE_TTL, esc, clamp, safeUrl, safeColor, bannerCss,
  avatarHtml, serverIconHtml, nickStyle, inviteUrl, isExpired, timeLeft, fmtFull, fmtDate,
  plural, relTime, FB_DEFAULT
} from './util.js';
import { icon } from './icons.js';
import { EMOJI_GROUPS, buildEmoteIndex } from './emojis.js';
import { accountTabHtml } from './auth.js';

const TABS = {
  'server-settings': [
    ['overview', 'Обзор', 'settings'], ['invites', 'Приглашения', 'link'], ['emojis', 'Эмоции', 'smile'],
    ['channels', 'Каналы', 'hash'], ['members', 'Участники', 'users'], ['danger', 'Опасная зона', 'trash']
  ],
  'user-settings': [
    ['profile', 'Мой профиль', 'users'], ['account', 'Аккаунт', 'shield'],
    ['connection', 'Подключение', 'cloud'], ['about', 'О dogapp', 'info']
  ]
};

function tabsHtml(type, active) {
  const list = TABS[type];
  if (!list) return '';
  return `<div class="modal-tabs">${list.map(([id, label, ic]) =>
    `<button class="tab ${active === id ? 'active' : ''}" data-action="modal-tab" data-tab="${id}">${icon(ic, 16)}<span>${label}</span></button>`
  ).join('')}</div>`;
}

function input(label, name, value = '', o = {}) {
  const { type = 'text', placeholder = '', max = 100, hint = '', required = false, rows = 0 } = o;
  const control = rows
    ? `<textarea name="${name}" rows="${rows}" maxlength="${max}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''}>${esc(value)}</textarea>`
    : `<input type="${type}" name="${name}" value="${esc(value)}" maxlength="${max}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''}>`;
  return `<label class="field"><span>${esc(label)}</span>${control}${hint ? `<small>${hint}</small>` : ''}</label>`;
}

function swatches(current) {
  return `<div class="swatches">${BANNER_PRESETS.map(p =>
    `<label class="swatch" style="${esc(bannerCss(p.value))}" data-tip="${esc(p.name)}" title="${esc(p.name)}"><input type="radio" name="banner" value="${esc(p.value)}" ${current === p.value ? 'checked' : ''}></label>`
  ).join('')}</div>`;
}

function animSwitch(name, checked, hint) {
  return `<label class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span class="switch-track"></span>
    <span class="switch-text"><b>Анимация</b><small>${esc(hint)}</small></span></label>`;
}

function iconFields(current = {}, animated = false, label = 'Монограмма') {
  return `<div class="field-row">
    ${input(label, 'icon', current.type === 'url' ? '' : (current.value || ''), { max: 3, placeholder: 'AB', hint: '1–3 буквы, если нет фото' })}
    ${input('Ссылка на фото', 'iconUrl', current.type === 'url' ? current.value : '', { placeholder: 'https://…', hint: 'Или загрузите файл ниже' })}
  </div>
  <label class="field"><span>Выбрать фото аватара</span><input type="file" name="iconFile" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"><small>PNG, JPG, GIF, WEBP до 300 КБ. Без галочки «Анимация» GIF замораживается в статичный кадр.</small></label>
  ${animSwitch('avatarAnimated', animated, 'Оставить движение для GIF / WEBP. Иначе берётся первый кадр.')}`;
}

function bannerFields(current, animated, label = 'Баннер') {
  const isUrl = /^https?:|^data:/.test(String(current || ''));
  return `<label class="field"><span>${esc(label)} — градиент</span>${swatches(isUrl ? '' : current)}</label>
    <label class="field"><span>Выбрать фото баннера</span><input type="file" name="bannerFile" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"><small>Своё фото вместо градиента. До 500 КБ.</small></label>
    ${input('Или ссылка на фото', 'bannerUrl', isUrl ? current : '', { placeholder: 'https://example.com/banner.png', max: 400 })}
    ${animSwitch('bannerAnimated', animated, 'Для градиента — плавное движение. Для GIF — сохранить анимацию или заморозить кадр.')}`;
}

function fontFields(user) {
  const cur = user.font || 'default';
  return `<label class="field"><span>Шрифт ника — видят все участники</span>
    <select name="font" data-role="font-select">${FONT_CHOICES.map(f =>
      `<option value="${f.id}" ${f.id === cur ? 'selected' : ''}>${esc(f.name)}</option>`
    ).join('')}</select></label>
    <div class="font-preview"><small>Предпросмотр</small><b data-role="font-preview" style="${nickStyle(user)}">${esc(clamp(user.name || 'Ваш ник', 30))}</b><span>#${esc(user.tag || '0001')} в чате, в списке участников и в профиле</span></div>`;
}

function actions(primary) {
  return `<div class="form-actions"><button class="btn-primary" type="submit">${esc(primary)}</button></div>`;
}
function roleName(role) {
  return ({ owner: 'Владелец', admin: 'Админ', bot: 'Бот', member: 'Участник' })[role] || 'Участник';
}

function inviteRow(inv, store) {
  const srv = store.state.servers[inv.serverId] || { name: 'Сервер' };
  const expired = isExpired(inv);
  const url = inviteUrl(inv.code);
  const left = inv.custom ? 'бессрочная' : (expired ? 'истекла' : 'осталось ' + timeLeft(inv.expiresAt - Date.now()));
  return `<div class="invite-row ${expired ? 'dead' : ''}">
    <div class="invite-row-main">
      <div class="invite-row-top"><strong>dogapp.gg/${esc(inv.code)}</strong>
        <span class="badge ${inv.custom ? 'badge-blurple' : 'badge-gray'}">${inv.custom ? 'кастомная' : '3 дня'}</span>
        ${expired ? '<span class="badge badge-red">истекла</span>' : ''}</div>
      <div class="invite-row-meta">${esc(clamp(srv.name, 34))} · ${inv.custom ? 'не истекает' : left} · использована ${inv.uses || 0} раз</div>
      <div class="invite-row-url">${esc(clamp(url, 74))}</div>
    </div>
    <div class="invite-row-actions">
      <button class="btn-mini" data-action="copy-text" data-text="${esc(url)}" data-tip="Скопировать ссылку" ${expired ? 'disabled' : ''}>${icon('copy', 16)}</button>
      <button class="btn-mini btn-mini-red" data-action="revoke-invite" data-code="${esc(inv.code)}" data-tip="Удалить ссылку">${icon('trash', 16)}</button>
    </div>
  </div>`;
}

/* ======================= МОДАЛКИ ======================= */
export function modalHtml(store, view) {
  const t = view.modal;
  if (!t) return '';
  const s = store.state, me = store.uid;
  const srv = s.servers[view.serverId] || null;
  const user = s.users[me] || {};
  let title = '', sub = '', tabs = '', body = '', size = '';

  if (t === 'create-server') {
    title = 'Создайте свой сервер';
    sub = 'Название, баннер и кастомная ссылка — всё сразу и бесплатно.';
    body = `<form data-form="create-server">
      ${input('Название сервера', 'name', '', { placeholder: 'Например, Дворняги', required: true, max: 60 })}
      ${input('Описание', 'description', '', { placeholder: 'О чём этот сервер?', max: 160, rows: 2 })}
      ${iconFields()}
      ${bannerFields(BANNER_PRESETS[0].value, false)}
      <div class="notice notice-blurple">${icon('link', 18)}<div><b>Кастомная ссылка (необязательно)</b><br>Оставьте поле пустым — тогда создаётся обычная ссылка со сроком жизни <b>3 дня</b>. Кастомная ссылка не истекает.</div></div>
      ${input('Адрес ссылки', 'vanity', '', { placeholder: 'my-dogs → dogapp.gg/my-dogs', max: 24, hint: 'латиница, цифры, дефис; от 2 до 24 символов' })}
      ${actions('Создать сервер')}
    </form>`;
  }

  else if (t === 'server-settings') {
    title = 'Настройки сервера';
    sub = esc(srv ? srv.name : 'Сервер');
    tabs = tabsHtml(t, view.modalTab);
    const tab = view.modalTab || 'overview';

    if (tab === 'overview') {
      body = `<form data-form="server-overview">
        <div class="server-preview" style="${esc(bannerCss(srv?.banner, srv?.bannerAnimated))}">
          ${serverIconHtml(srv, 'server-preview-icon')}
          <div><b>${esc(clamp(srv?.name || '', 40))}</b><span>${esc(clamp(srv?.description || '', 90))}</span></div>
        </div>
        ${input('Название', 'name', srv?.name || '', { required: true, max: 60 })}
        ${input('Описание', 'description', srv?.description || '', { max: 160, rows: 2 })}
        ${iconFields(srv?.icon, false, 'Монограмма сервера')}
        ${bannerFields(srv?.banner, srv?.bannerAnimated)}
        ${actions('Сохранить')}
      </form>`;
    }

    else if (tab === 'invites') {
      const list = Object.values(s.invites).filter(i => i.serverId === srv?.id)
        .sort((a, b) => (b.custom - a.custom) || (b.createdAt - a.createdAt));
      body = `<div class="section-title">Кастомная ссылка ${icon('sparkle', 16)}</div>
        <form data-form="vanity" class="vanity-form">
          <div class="vanity-input"><span>dogapp.gg/</span><input name="vanity" value="${esc(srv?.vanity || '')}" maxlength="24" placeholder="my-cool-server"></div>
          <button class="btn-primary" type="submit">${srv?.vanity ? 'Изменить' : 'Занять адрес'}</button>
        </form>
        <p class="hint">Кастомная ссылка <b>не имеет срока действия</b> и работает, пока вы её не удалите. Адрес уникален на весь dogapp.</p>
        ${srv?.vanity ? `<div class="inline-link">${esc(inviteUrl(srv.vanity))}<button class="btn-mini" data-action="copy-text" data-text="${esc(inviteUrl(srv.vanity))}">${icon('copy', 16)}</button></div>` : ''}
        <div class="hr"></div>
        <div class="section-title">Обычные ссылки ${icon('clock', 16)}</div>
        <div class="notice notice-yellow">${icon('clock', 18)}<div><b>Срок действия — ровно 3 дня.</b><br>После этого ссылка перестаёт пускать на сервер. Хотите вечную — используйте кастомный адрес выше.</div></div>
        <form data-form="invite"><input type="hidden" name="custom" value="0">${actions('Создать ссылку на 3 дня')}</form>
        <div class="hr"></div>
        <div class="section-title">Все ссылки сервера <span class="count">${list.length}</span></div>
        <div class="invite-list">${list.length ? list.map(i => inviteRow(i, store)).join('') : '<div class="empty">Пока нет ссылок. Создайте первую.</div>'}</div>`;
    }

    else if (tab === 'emojis') {
      const emotes = Object.values(srv?.emojis || {});
      body = `<div class="notice notice-green">${icon('sparkle', 18)}<div><b>Эмоции сервера бесплатны для всех, включая друзей.</b><br>Их можно использовать в любом канале и в личных сообщениях — без подписки.</div></div>
        <div class="emote-admin-grid">${emotes.map(e =>
          `<div class="emote-admin"><img src="${esc(safeUrl(e.url))}" alt=""><code>:${esc(e.name)}:</code>
            ${e.animated ? '<span class="badge badge-blurple">GIF</span>' : ''}
            <span class="emote-share">${e.sharedWith === 'server' ? 'только сервер' : 'все'}</span>
            <button class="btn-mini btn-mini-red" data-action="delete-emoji" data-id="${esc(e.id)}" data-tip="Удалить">${icon('trash', 14)}</button></div>`
        ).join('') || '<div class="empty">Эмоций пока нет — добавьте первую ниже</div>'}</div>
        <div class="hr"></div>
        <div class="section-title">Добавить эмоцию</div>
        <form data-form="emoji">
          ${input('Название', 'name', '', { placeholder: 'goodboy', max: 32, required: true, hint: 'латиница, цифры и _ ; в сообщении будет :goodboy:' })}
          ${input('Ссылка на картинку', 'url', '', { placeholder: 'https://…/emoji.png', hint: 'или загрузите файл ниже' })}
          <label class="field"><span>Загрузить файл</span><input type="file" name="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"><small>PNG, GIF, WEBP до 200 КБ.</small></label>
          ${animSwitch('emojiAnimated', false, 'Сохранить анимацию GIF. Иначе берётся первый кадр.')}
          <label class="switch"><input type="checkbox" name="emojiShared" checked><span class="switch-track"></span>
            <span class="switch-text"><b>Доступна друзьям</b><small>Если выключить, эмоцию увидят только участники сервера.</small></span></label>
          ${actions('Добавить эмоцию')}
        </form>`;
    }

    else if (tab === 'channels') {
      const chans = Object.values(srv?.channels || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
      body = `<div class="chan-admin-list">${chans.map(c =>
        `<div class="chan-admin">${icon(c.type === 'voice' ? 'volume' : 'hash', 17)}<div><b>${esc(c.name)}</b><small>${esc(c.category || 'Без категории')} · ${c.type === 'voice' ? 'голосовой' : 'текстовый'}</small></div><button class="btn-mini btn-mini-red" data-action="delete-channel" data-id="${esc(c.id)}" data-tip="Удалить канал">${icon('trash', 15)}</button></div>`
      ).join('')}</div>
        <div class="hr"></div>
        <div class="section-title">Новый канал</div>
        <form data-form="channel">
          ${input('Название', 'name', '', { placeholder: 'новый-канал', required: true, max: 40 })}
          <div class="field-row">
            <label class="field"><span>Тип</span><select name="type"><option value="text">Текстовый</option><option value="voice">Голосовой</option></select></label>
            ${input('Категория', 'category', 'ТЕКСТОВЫЕ КАНАЛЫ', { max: 40 })}
          </div>
          ${input('Описание', 'topic', '', { max: 120 })}
          ${actions('Создать канал')}
        </form>`;
    }

    else if (tab === 'members') {
      const list = Object.entries(srv?.members || {}).map(([id, m]) => ({ id, m, u: s.users[id] || {} }));
      body = `<div class="member-admin-list">${list.map(({ id, m, u }) =>
        `<div class="member-admin">${avatarHtml(u)}<div><b style="color:${safeColor(u.color, '#f2f3f5')};${nickStyle(u)}">${esc(clamp(u.name || 'Участник', 30))}</b><small>#${esc(u.tag || '0000')} · ${roleName(m.role)}</small></div>${m.role === 'owner' ? icon('crown', 18) : ''}</div>`
      ).join('')}</div>`;
    }

    else if (tab === 'danger') {
      body = `<div class="notice notice-red">${icon('trash', 18)}<div><b>Осторожно.</b><br>Покинув сервер, вы снова сможете зайти только по действующей ссылке.</div></div>
        <div class="danger-actions">
          <button class="btn-outline" data-action="leave-server">Покинуть сервер</button>
          ${srv?.ownerId === me ? `<button class="btn-danger" data-action="delete-server">Удалить сервер навсегда</button>` : ''}
        </div>`;
    }
  }

  else if (t === 'user-settings') {
    title = 'Настройки пользователя';
    sub = esc((user.name || 'Гость') + '#' + (user.tag || '0001'));
    tabs = tabsHtml(t, view.modalTab);
    const tab = view.modalTab || 'profile';

    if (tab === 'profile') {
      body = `<div class="profile-preview" style="${esc(bannerCss(user.banner, user.bannerAnimated))}">
          <div class="profile-preview-avatar">${avatarHtml(user, 'avatar-lg')}</div>
          <div class="profile-preview-name"><b data-role="profile-name" style="${nickStyle(user)}">${esc(clamp(user.name || 'Гость', 30))}</b><span>#${esc(user.tag || '0001')}</span>${icon('sparkle', 15)}</div>
        </div>
        <div class="free-badge">${icon('bolt', 16)} dogapp Free — баннеры, фото, эмоции и ссылки бесплатны</div>
        <form data-form="profile">
          <div class="field-row">
            ${input('Имя', 'name', user.name || '', { required: true, max: 32 })}
            ${input('Тег', 'tag', user.tag || '0001', { max: 4, hint: '4 цифры' })}
          </div>
          ${fontFields(user)}
          ${input('Статус', 'status', user.status || '', { max: 80, placeholder: 'Чем занимаетесь?' })}
          ${input('О себе', 'bio', user.bio || '', { max: 200, rows: 3 })}
          ${iconFields(user.avatar, user.avatarAnimated, 'Монограмма ника')}
          ${bannerFields(user.banner, user.bannerAnimated, 'Баннер профиля')}
          ${actions('Сохранить профиль')}
        </form>`;
    }

    else if (tab === 'account') {
      body = accountTabHtml(store);
    }

    else if (tab === 'connection') {
      const ok = store.mode === 'firebase';
      body = `<div class="conn-card ${ok ? 'conn-ok' : 'conn-bad'}">
          <div class="conn-head">${icon(ok ? 'cloud' : 'info', 22)}<div><b>${ok ? 'Firebase подключён' : 'Демо-режим (localStorage)'}</b><span>${ok ? 'Данные синхронизируются между устройствами каждые 2 секунды' : 'Данные сохраняются только в этом браузере'}</span></div></div>
          <div class="conn-url">${esc(store.root)}.json</div>
        </div>
        ${store.error ? `<div class="conn-error">Ошибка чтения: ${esc(store.error)}</div>` : ''}
        ${store.writeError ? `<div class="conn-error">Ошибка записи: ${esc(store.writeError)}</div>` : ''}
        <div class="hr"></div>
        <div class="section-title">Адрес базы</div>
        <form data-form="fb">
          ${input('Firebase Realtime Database URL', 'url', store.url, { placeholder: FB_DEFAULT, max: 160 })}
          ${actions('Сохранить и подключиться')}
        </form>
        <button class="btn-outline full" data-action="recheck">${icon('bolt', 16)} Проверить соединение ещё раз</button>
        <div class="hr"></div>
        <div class="section-title">Правила базы (для теста)</div>
        <p class="hint">Чтобы чтение и запись работали без авторизации, в Firebase → Realtime Database → Rules разрешите узел <code>dogapp</code>:</p>
        <pre class="code-block">{
  "rules": {
    "dogapp": {
      ".read": true,
      ".write": true
    }
  }
}</pre>
        <p class="hint">Открытые правила подходят только для демо. Для реального проекта добавьте аутентификацию и проверки.</p>`;
    }

    else if (tab === 'about') {
      body = `<div class="about-hero"><img src="assets/logo.svg" alt=""><div><b>dogapp</b><span>v2.0 · бесплатно · HTML/CSS/JS без сборки</span></div></div>
        <div class="feature-grid">
          <div class="feature">${icon('image', 20)}<div><b>Фото и баннеры</b><span>Загрузка файла или ссылка, анимация включается и выключается.</span></div></div>
          <div class="feature">${icon('smile', 20)}<div><b>Эмоции серверов</b><span>Свои эмоции доступны всем, включая друзей, без подписки.</span></div></div>
          <div class="feature">${icon('users', 20)}<div><b>Друзья и аккаунты</b><span>Регистрация, заявки в друзья, поиск по логину.</span></div></div>
          <div class="feature">${icon('video', 20)}<div><b>Звонки</b><span>Голосовые каналы, WebRTC-звонки через Firebase и демо видеозвонки.</span></div></div>
          <div class="feature">${icon('edit', 20)}<div><b>Шрифт ника</b><span>Выберите начертание — его увидят все участники.</span></div></div>
          <div class="feature">${icon('link', 20)}<div><b>Ссылки</b><span>Вечная кастомная ссылка или обычная на 3 дня.</span></div></div>
        </div>
        <div class="hr"></div>
        <div class="section-title">Горячие клавиши</div>
        <div class="kbd-list"><span><kbd>Enter</kbd> отправить</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> новая строка</span><span><kbd>Esc</kbd> закрыть окно</span></div>`;
    }
  }

  else if (t === 'create-channel') {
    title = 'Новый канал';
    sub = esc('Сервер: ' + (srv?.name || ''));
    body = `<form data-form="channel">
      ${input('Название', 'name', '', { placeholder: 'мемы-и-гав', required: true, max: 40 })}
      <div class="field-row">
        <label class="field"><span>Тип</span><select name="type"><option value="text">Текстовый</option><option value="voice">Голосовой</option></select></label>
        ${input('Категория', 'category', 'ТЕКСТОВЫЕ КАНАЛЫ', { max: 40 })}
      </div>
      ${input('Описание', 'topic', '', { max: 120 })}
      ${actions('Создать канал')}
    </form>`;
  }

  else if (t === 'explore') {
    title = 'Найти серверы';
    sub = 'Все серверы в базе dogapp. Заходите по ссылке или в один клик.';
    const all = Object.values(s.servers);
    body = `<form data-form="invite-code" class="code-form">
        ${input('У вас есть код приглашения?', 'code', '', { placeholder: 'dogapp или WELCOME7', max: 24, required: true })}
        <button class="btn-primary" type="submit">Открыть</button>
      </form>
      <div class="hr"></div>
      <div class="server-cards">${all.map(sv => {
        const count = Object.keys(sv.members || {}).length;
        const joined = !!(sv.members && sv.members[me]);
        const inv = s.invites[sv.vanity] || Object.values(s.invites).find(i => i.serverId === sv.id && !isExpired(i));
        return `<div class="server-card">
          <div class="server-card-banner" style="${esc(bannerCss(sv.banner, sv.bannerAnimated))}"></div>
          <div class="server-card-body">${serverIconHtml(sv, 'server-card-icon')}
            <div class="server-card-text"><b>${esc(clamp(sv.name, 40))}</b><span>${esc(clamp(sv.description || 'Без описания', 90))}</span><small>${icon('users', 13)} ${count} ${plural(count, ['участник', 'участника', 'участников'])}${sv.vanity ? ' · dogapp.gg/' + esc(sv.vanity) : ''}</small></div>
            <div class="server-card-actions">
              ${joined ? `<button class="btn-outline" data-action="select-server" data-id="${esc(sv.id)}">Открыть</button>`
                : `<button class="btn-primary" data-action="join-server" data-id="${esc(sv.id)}">Войти</button>`}
              ${inv ? `<button class="btn-mini" data-action="open-invite" data-code="${esc(inv.code)}" data-tip="Открыть ссылку">${icon('link', 16)}</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('') || '<div class="empty">Серверов пока нет — создайте первый.</div>'}</div>`;
  }

  else if (t === 'media') {
    title = 'Вставить картинку или GIF';
    sub = 'Вставьте ссылку — картинка появится прямо в сообщении.';
    body = `<form data-form="media">
      ${input('Ссылка на картинку / GIF', 'url', '', { placeholder: 'https://…/picture.gif', required: true, max: 300 })}
      ${input('Подпись (необязательно)', 'caption', '', { placeholder: 'Подпись', max: 80 })}
      <div class="notice notice-blurple">${icon('info', 18)}<div>Работают прямые ссылки на изображения по <b>https://</b>. Синтаксис <code>![подпись](ссылка)</code> добавится в поле ввода.</div></div>
      ${actions('Добавить в сообщение')}
    </form>`;
  }

  else if (t === 'new-dm') {
    title = 'Новое личное сообщение';
    sub = 'Выберите, кому написать.';
    const users = Object.values(s.users).filter(u => u.id !== me);
    body = `<div class="dm-user-list">${users.map(u =>
      `<button class="dm-user" data-action="start-dm" data-uid="${esc(u.id)}">${avatarHtml(u)}<div><b style="${nickStyle(u)}">${esc(clamp(u.name, 30))}</b><span>@${esc(u.login || 'user')} · ${esc(clamp(u.status || relTime(u.lastSeen), 40))}</span></div>${icon('chevronRight', 18)}</button>`
    ).join('')}</div>`;
  }

  return `<div class="modal-card ${size}">
    <button class="modal-x" data-action="close-modal" aria-label="Закрыть">${icon('close', 20)}</button>
    <div class="modal-head"><div class="modal-eyebrow">DOGAPP</div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
    ${tabs}
    <div class="modal-body">${body}</div>
  </div>`;
}

/* ======================= ПРИГЛАШЕНИЕ (полный экран) ======================= */
export function invitePageHtml(store, view) {
  const code = view.invitePage || '';
  const inv = store.state.invites[code];
  const srv = inv ? store.state.servers[inv.serverId] : null;
  const members = srv ? Object.keys(srv.members || {}).length : 0;
  const online = srv ? Object.keys(srv.members || {}).filter(id => (store.state.users[id]?.lastSeen || 0) > Date.now() - 120000).length : 0;
  const joined = !!(srv && srv.members && srv.members[store.uid]);
  const expired = isExpired(inv);
  const closed = !inv || !srv || expired;

  const card = closed
    ? `<div class="invite-card invite-closed">
        <div class="invite-closed-icon">${icon('clock', 40)}</div>
        <h1>${!inv || !srv ? 'Ссылка не найдена' : 'Срок действия ссылки истёк'}</h1>
        <p>${!inv || !srv ? 'Возможно, ссылку удалили или в ней опечатка.' : 'Обычные приглашения в dogapp живут <b>ровно 3 дня</b>. Попросите новую ссылку или кастомный адрес — он не истекает.'}</p>
        <div class="invite-code">dogapp.gg/${esc(code)}</div>
        <button class="btn-primary" data-action="go-app">Вернуться в dogapp</button>
      </div>`
    : `<div class="invite-card">
        <div class="invite-banner" style="${esc(bannerCss(srv.banner, srv.bannerAnimated))}"></div>
        <div class="invite-icon-wrap">${serverIconHtml(srv, 'invite-icon')}</div>
        <div class="invite-eyebrow">ПРИГЛАШЕНИЕ НА СЕРВЕР</div>
        <h1>${esc(clamp(srv.name, 50))}</h1>
        <p class="invite-desc">${esc(clamp(srv.description || 'Заходите пообщаться', 180))}</p>
        <div class="invite-stats"><span class="pres-dot online"></span>${online} в сети <span class="pres-dot offline"></span>${members} ${plural(members, ['участник', 'участника', 'участников'])}</div>
        <div class="invite-exp ${inv.custom ? 'forever' : ''}">${icon(inv.custom ? 'sparkle' : 'clock', 16)}
          ${inv.custom ? `Кастомная ссылка <b>dogapp.gg/${esc(inv.code)}</b> — не истекает`
            : `Ссылка истечёт через <b>${esc(timeLeft(inv.expiresAt - Date.now()))}</b> · создана ${esc(fmtFull(inv.createdAt))}`}
        </div>
        <button class="btn-primary btn-join" data-action="${joined ? 'select-server' : 'join-invite'}" ${joined ? `data-id="${esc(srv.id)}"` : `data-code="${esc(inv.code)}"`}>
          ${joined ? 'Открыть сервер' : 'Присоединиться к серверу'}
        </button>
        <div class="invite-under">${icon('shield', 15)} Бесплатно, без подписок</div>
        <button class="btn-ghost" data-action="go-app">Я просто посмотреть</button>
      </div>`;

  return `<div class="invite-bg">
    <div class="invite-top"><img src="assets/logo.svg" alt=""><b>dogapp</b><span>общение без подписок</span></div>
    ${card}
    <div class="invite-foot">Не Discord. Но почти. И бесплатно.</div>
  </div>`;
}

/* ======================= PICKER ЭМОЦИЙ ======================= */
export function emojiPickerHtml(store, view) {
  const p = view.picker || { query: '', tab: 'servers' };
  const q = String(p.query || '').toLowerCase().trim();
  const tab = p.tab || 'servers';
  const srvList = Object.values(store.state.servers || {});
  const friendSet = new Set(Object.keys(store.state.friends?.[store.uid] || {}));
  const custom = [];
  for (const sv of srvList) {
    const ems = Object.values(sv.emojis || {}).filter(e =>
      (!q || e.name.toLowerCase().includes(q)) &&
      (e.sharedWith !== 'server' || sv.members?.[store.uid])
    );
    if (ems.length) custom.push({ sv, ems, isFriend: !!sv.members && Object.keys(sv.members).some(id => friendSet.has(id)) });
  }
  const std = EMOJI_GROUPS.map(g => ({ ...g, items: q ? g.items.filter(e => g.name.toLowerCase().includes(q) || e.includes(q)) : g.items }))
    .filter(g => g.items.length);

  const pick = (token, emoji) => p.reactTo
    ? `data-action="pick-react" data-id="${esc(p.reactTo)}" data-emoji="${esc(emoji)}"`
    : `data-action="insert-emoji" data-token="${esc(token)}"`;

  return `<div class="picker-head">
      <div class="picker-search">${icon('search', 16)}<input data-role="emoji-search" value="${esc(p.query || '')}" placeholder="Найти эмоцию"></div>
      <button class="picker-x" data-action="close-picker">${icon('close', 16)}</button>
    </div>
    <div class="picker-tabs">
      <button class="picker-tab ${tab === 'servers' ? 'active' : ''}" data-action="picker-tab" data-tab="servers">Эмоции серверов</button>
      <button class="picker-tab ${tab === 'symbols' ? 'active' : ''}" data-action="picker-tab" data-tab="symbols">Символы</button>
    </div>
    <div class="picker-scroll">
      ${tab === 'servers' ? `<div class="picker-ribbon">${icon('bolt', 14)} Эмоции всех серверов бесплатны и доступны друзьям</div>
        ${custom.length ? '<div class="picker-section">ДОСТУПНЫ ВСЕМ</div>' : ''}
        ${custom.map(({ sv, ems, isFriend }) => `<div class="picker-group-label">${esc(clamp(sv.name, 34))}${isFriend ? '<span class="picker-friend">друзья</span>' : ''}</div>
          <div class="picker-grid">${ems.map(e =>
            `<button class="picker-emote" ${pick(':' + e.name + ':', e.name)} data-tip=":${esc(e.name)}: · ${esc(sv.name)}"><img src="${esc(safeUrl(e.url))}" alt=":${esc(e.name)}:"></button>`
          ).join('')}</div>`).join('')}
        ${!custom.length ? '<div class="empty picker-empty">Эмоций не найдено</div>' : ''}`
      : `${std.map(g => `<div class="picker-group-label">${esc(g.name)}</div>
          <div class="picker-grid">${g.items.map(e =>
            `<button class="picker-std" ${pick(e, e)} data-tip="${esc(e)}">${e}</button>`
          ).join('')}</div>`).join('') || '<div class="empty picker-empty">Ничего не нашлось</div>'}`}
    </div>
    <div class="picker-foot">${icon('sparkle', 14)} ${p.reactTo ? 'Выберите реакцию' : 'Нажмите, чтобы вставить в сообщение'}</div>`;
}

/* ======================= ПОПОВЕРЫ ======================= */
export function popoverHtml(store, view) {
  const p = view.popover;
  if (!p) return '';
  const s = store.state;
  if (p.type === 'server-menu') {
    const srv = s.servers[view.serverId];
    if (!srv) return '';
    const items = [
      ['invite-people', 'Пригласить людей', 'link'],
      ['server-settings', 'Настройки сервера', 'settings'],
      ['create-channel', 'Создать канал', 'plus'],
      ['server-invites', 'Управление ссылками', 'clock'],
      ['server-emotes', 'Эмоции сервера', 'smile'],
      ['leave-server', 'Покинуть сервер', 'arrowLeft']
    ];
    return `<div class="popover server-pop">
      <div class="popover-head">${serverIconHtml(srv, 'server-mini-icon')}<b>${esc(clamp(srv.name, 26))}</b></div>
      ${items.map(([a, label, ic], i) =>
        `<button class="pop-item ${i === items.length - 1 ? 'pop-red' : ''}" data-action="${a}">${icon(ic, 16)}<span>${label}</span></button>`
      ).join('')}
    </div>`;
  }
  if (p.type === 'profile') {
    const u = s.users[p.uid] || { name: 'Участник' };
    const srv = s.servers[view.serverId];
    const role = srv?.members?.[p.uid]?.role;
    return `<div class="popover profile-pop">
      <div class="pop-banner" style="${esc(bannerCss(u.banner, u.bannerAnimated))}"></div>
      <div class="pop-avatar">${avatarHtml(u, 'avatar-lg')}</div>
      <div class="pop-body">
        <div class="pop-name" style="${nickStyle(u)}">${esc(clamp(u.name, 28))}<span>#${esc(u.tag || '0000')}</span></div>
        ${role ? `<div class="pop-role">${icon(role === 'owner' ? 'crown' : 'shield', 13)} ${roleName(role)}${esc(srv ? ' · ' + clamp(srv.name, 24) : '')}</div>` : ''}
        ${u.bot ? '<div class="badge badge-blurple">БОТ</div>' : ''}
        <div class="hr"></div>
        ${u.status ? `<div class="pop-label">СТАТУС</div><div class="pop-text">${esc(u.status)}</div>` : ''}
        ${u.bio ? `<div class="pop-label">О СЕБЕ</div><div class="pop-text">${esc(u.bio)}</div>` : ''}
        <div class="pop-label">ШРИФТ НИКА</div><div class="pop-text">${esc(FONT_CHOICES.find(f => f.id === u.font)?.name || 'Стандартный')}</div>
        <div class="pop-label">В DOGAPP С</div><div class="pop-text">${esc(fmtDate(u.createdAt))}</div>
        ${p.uid !== store.uid ? `<div class="pop-actions">
          <button class="btn-primary" data-action="start-dm" data-uid="${esc(p.uid)}">Написать</button>
          <button class="btn-mini" data-action="call-user" data-uid="${esc(p.uid)}" data-type="voice" data-tip="Звонок">${icon('phone', 16)}</button>
          <button class="btn-mini" data-action="call-user" data-uid="${esc(p.uid)}" data-type="video" data-tip="Видеозвонок">${icon('video', 16)}</button>
          <button class="btn-mini" data-action="friend-add" data-uid="${esc(p.uid)}" data-tip="Добавить в друзья">${icon('userPlus', 16)}</button>
        </div>` : ''}
      </div>
    </div>`;
  }
  return '';
}
