// dogapp — реальные звонки WebRTC через сигналинг Firebase RTDB и голосовые каналы.
// Никаких вымышленных собеседников и синтетических видеопотоков.
import {
  rid, esc, clamp, toast, avatarHtml, bannerCss, nickStyle, isRealAccount, accountName
} from './util.js';
import { icon } from './icons.js';

const STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function dur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class CallManager {
  constructor(store, view) {
    this.store = store;
    this.view = view;
    this.callId = null;
    this.role = null;
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    this.muted = false;
    this.cameraOff = false;
    this.mediaError = '';
    this.appliedIce = new Set();
    this.remoteDescSet = false;
    this.iceIdx = 0;
    this.processing = false;
    this.tick = setInterval(() => {
      const c = this._currentCall();
      if (c && c.status === 'active') this._showActive(c);
    }, 1000);
  }

  _root() { return document.getElementById('call-root'); }
  _voiceRoot() { return document.getElementById('voice-root'); }
  _currentCall() { return this.callId ? this.store.state.calls?.[this.callId] : null; }
  _other(c) { return c && (c.from === this.store.uid ? c.to : c.from); }
  _realUser(id) { return isRealAccount(this.store.state.users?.[id], this.store.state.accounts); }
  _iAmReal() { return this._realUser(this.store.uid); }

  update() {
    const s = this.store.state, me = this.store.uid;
    const calls = Object.values(s.calls || {});

    for (const c of calls) {
      const stale = c.status === 'ringing' && c.createdAt < Date.now() - 90000;
      const legacy = c.demo || c.mode !== 'webrtc';
      const wrongPeople = !this._realUser(c.from) || !this._realUser(c.to);
      if (stale || legacy || wrongPeople) this.store.del(['calls', c.id], true);
    }
    const valid = calls.filter(c =>
      !c.demo && c.mode === 'webrtc' && !c.stale &&
      this._realUser(c.from) && this._realUser(c.to) &&
      !(c.status === 'ringing' && c.createdAt < Date.now() - 90000)
    );

    const incoming = valid.find(c => c.to === me && c.status === 'ringing');
    const active = valid.find(c => c.status === 'active' && (c.from === me || c.to === me));

    if (incoming && (!this.callId || this.callId !== incoming.id)) {
      this._showIncoming(incoming);
    } else if (active) {
      if (this.callId !== active.id) {
        this.callId = active.id;
        this.role = active.from === me ? 'caller' : 'callee';
      }
      this._processSignal(active);
      this._showActive(active);
    } else if (!incoming) {
      if (this.callId) this._cleanup();
      const r = this._root();
      if (r) r.innerHTML = '';
    }
    this.renderVoice();
  }

  async startCall(toUid, type) {
    if (!this._iAmReal()) { toast('Нужен зарегистрированный аккаунт', 'error'); return; }
    if (this.callId) { toast('Сначала завершите текущий звонок', 'warn'); return; }
    if (!this._realUser(toUid)) { toast('Можно позвонить только зарегистрированному участнику', 'error'); return; }
    if (this.store.mode !== 'firebase') { toast('Звонки требуют подключения к Firebase', 'error'); return; }
    if (typeof RTCPeerConnection === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast('Этот браузер не поддерживает WebRTC или доступ к камере и микрофону', 'error'); return;
    }
    const callee = this.store.state.users[toUid];
    if ((callee?.lastSeen || 0) < Date.now() - 120000) {
      toast('Участник не в сети', 'warn'); return;
    }

    const ready = await this._prepareLocal(type);
    if (!ready) { toast('Нет доступа к камере или микрофону — звонок отменён', 'error'); return; }

    const id = rid('call'), me = this.store.uid;
    this.callId = id; this.role = 'caller';
    this.store.set(['calls', id], {
      id, from: me, to: toUid, type, mode: 'webrtc', status: 'ringing',
      createdAt: Date.now(), sdp: {}, ice: {}
    });
    this._createPeer(id, toUid);
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.store.set(['calls', id, 'sdp', me], { type: 'offer', sdp: offer.sdp }, true);
    } catch (e) {
      this.store.del(['calls', id]);
      this._cleanup();
      toast('Не удалось создать звонок: ' + e.message, 'error');
      return;
    }
    this._showActive(this._currentCall());
  }

  async acceptCall(id) {
    const c = this.store.state.calls?.[id];
    if (!c || c.to !== this.store.uid || !this._realUser(c.from)) return;
    const ready = await this._prepareLocal(c.type);
    if (!ready) {
      this.declineCall(id);
      toast('Нет доступа к камере или микрофону — звонок отклонён', 'error');
      return;
    }
    this.callId = id; this.role = 'callee';
    this.store.patch(['calls', id], { status: 'active', startedAt: Date.now() });
    this._createPeer(id, c.from);
    await this._processSignal(c);
    this._showActive(this.store.state.calls[id]);
  }

  declineCall(id) {
    this.store.del(['calls', id]);
    if (this.callId === id) this._cleanup();
    this.update();
  }

  endCall(id) {
    const cid = id || this.callId;
    if (cid) this.store.del(['calls', cid]);
    this._cleanup();
    this.update();
    toast('Звонок завершён');
  }

  async _prepareLocal(type) {
    this.muted = false; this.cameraOff = false; this.mediaError = '';
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
      return !!this.localStream;
    } catch (e) {
      this.mediaError = e?.message || 'доступ к устройствам запрещён';
      this.localStream = null;
      return false;
    }
  }

  _createPeer(id, other) {
    if (typeof RTCPeerConnection === 'undefined') return;
    try { this.pc = new RTCPeerConnection(STUN); } catch (_) { return; }
    this.appliedIce = new Set(); this.remoteDescSet = false; this.iceIdx = 0;
    const me = this.store.uid;
    this.pc.onicecandidate = e => {
      if (!e.candidate) return;
      const raw = e.candidate.toJSON ? e.candidate.toJSON() : e.candidate;
      this.store.set(['calls', id, 'ice', me, String(this.iceIdx++)], JSON.stringify(raw), true);
    };
    this.pc.ontrack = e => {
      this.remoteStream = e.streams && e.streams[0] ? e.streams[0] : null;
      this._attachStreams();
    };
    if (this.localStream) {
      for (const t of this.localStream.getTracks()) {
        try { this.pc.addTrack(t, this.localStream); } catch (_) { }
      }
    }
  }

  async _processSignal(c) {
    if (!this.pc || this.processing || !c) return;
    const me = this.store.uid, other = this._other(c);
    this.processing = true;
    try {
      const remote = c.sdp?.[other];
      if (remote && !this.remoteDescSet) {
        await this.pc.setRemoteDescription({ type: remote.type, sdp: remote.sdp });
        this.remoteDescSet = true;
        if (remote.type === 'offer') {
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this.store.set(['calls', c.id, 'sdp', me], { type: 'answer', sdp: answer.sdp }, true);
        }
      }
      if (this.remoteDescSet) {
        for (const [k, raw] of Object.entries(c.ice?.[other] || {})) {
          if (this.appliedIce.has(k)) continue;
          this.appliedIce.add(k);
          try { await this.pc.addIceCandidate(JSON.parse(raw)); } catch (_) { }
        }
      }
    } catch (e) {
      // сигналинг ещё неполный — следующая синхронизация повторит
    } finally { this.processing = false; }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.localStream) for (const t of this.localStream.getAudioTracks()) t.enabled = !this.muted;
    this._showActive(this._currentCall());
  }
  toggleCamera() {
    this.cameraOff = !this.cameraOff;
    if (this.localStream) for (const t of this.localStream.getVideoTracks()) t.enabled = !this.cameraOff;
    this._showActive(this._currentCall());
  }

  _cleanup() {
    try { if (this.localStream) for (const t of this.localStream.getTracks()) t.stop(); } catch (_) { }
    try { if (this.pc) this.pc.close(); } catch (_) { }
    this.pc = null; this.localStream = null; this.remoteStream = null;
    this.callId = null; this.role = null; this.mediaError = '';
    this.appliedIce = new Set(); this.remoteDescSet = false;
  }
  destroy() { clearInterval(this.tick); this._cleanup(); }

  _showIncoming(c) {
    const r = this._root(); if (!r) return;
    const u = this.store.state.users[c.from];
    r.innerHTML = `<div class="call-incoming">
      <div class="call-incoming-banner" style="${esc(bannerCss(u.banner, u.bannerAnimated))}"></div>
      <div class="call-incoming-avatar">${avatarHtml(u, 'avatar-xl')}</div>
      <div class="call-incoming-label">ВХОДЯЩИЙ ${c.type === 'video' ? 'ВИДЕОЗВОНОК' : 'ЗВОНОК'}</div>
      <h2 style="${nickStyle(u)}">${esc(clamp(accountName(u), 32))}</h2>
      <p>Звонок через dogapp · @${esc(u.login || 'user')}</p>
      <div class="call-incoming-actions">
        <button class="btn-ok btn-round" data-action="call-accept" data-id="${esc(c.id)}" data-tip="Принять">${icon('phone', 22)}</button>
        <button class="btn-danger btn-round" data-action="call-decline" data-id="${esc(c.id)}" data-tip="Отклонить">${icon('phoneOff', 22)}</button>
      </div>
      <div class="call-ringing">${icon('signal', 14)} Ожидание ответа</div>
    </div>`;
  }

  _showActive(c) {
    const r = this._root(); if (!r || !c) return;
    const otherId = this._other(c);
    const u = this.store.state.users[otherId] || {};
    const me = this.store.me();
    const ringing = c.status === 'ringing';
    const elapsed = c.startedAt ? dur(Date.now() - c.startedAt) : '00:00';
    const isVideo = c.type === 'video';

    r.innerHTML = `<div class="call-panel ${isVideo ? 'is-video' : ''}">
      <div class="call-panel-top">
        <span class="call-dot ${ringing ? 'ringing' : ''}"></span>
        <div class="call-panel-title"><b>${ringing ? 'Ожидание ответа' : (isVideo ? 'Видеозвонок' : 'Голосовой звонок')}</b><span>${esc(clamp(accountName(u), 26))} · ${ringing ? 'звоним…' : elapsed}</span></div>
        <button class="call-x" data-action="call-end" data-id="${esc(c.id)}" data-tip="Завершить">${icon('close', 16)}</button>
      </div>
      <div class="call-stage">
        ${isVideo
          ? `<div class="call-video remote"><video data-video="remote" autoplay playsinline></video><span class="call-video-label">${esc(clamp(accountName(u), 22))}</span></div>
             <div class="call-video local"><video data-video="local" autoplay playsinline muted></video><span class="call-video-label">Вы</span></div>`
          : `<div class="call-voice-stage">
              ${avatarHtml(u, 'avatar-xxl')}
              <b style="${nickStyle(u)}">${esc(clamp(accountName(u), 30))}</b>
              <span>${ringing ? 'Идёт вызов' : 'Соединение установлено'}</span>
              <div class="call-waves"><i></i><i></i><i></i><i></i><i></i></div>
             </div>`}
      </div>
      ${this.mediaError ? `<div class="call-note">${icon('info', 14)} ${esc(clamp(this.mediaError, 120))}</div>` : ''}
      <div class="call-controls">
        <button class="call-ctrl ${this.muted ? 'off' : ''}" data-action="call-mute" data-tip="${this.muted ? 'Включить микрофон' : 'Выключить микрофон'}">${icon(this.muted ? 'micOff' : 'mic', 19)}</button>
        ${isVideo ? `<button class="call-ctrl ${this.cameraOff ? 'off' : ''}" data-action="call-camera" data-tip="${this.cameraOff ? 'Включить камеру' : 'Выключить камеру'}">${icon(this.cameraOff ? 'videoOff' : 'video', 19)}</button>` : ''}
        <button class="call-ctrl hangup" data-action="call-end" data-id="${esc(c.id)}" data-tip="Завершить звонок">${icon('phoneOff', 20)}</button>
      </div>
      <div class="call-foot">${icon('shield', 13)} WebRTC · сигналинг через Firebase Realtime Database</div>
    </div>`;
    if (isVideo) this._attachStreams();
  }

  _attachStreams() {
    const attach = () => {
      try {
        const rv = this._root()?.querySelector('[data-video="remote"]');
        const lv = this._root()?.querySelector('[data-video="local"]');
        if (rv && this.remoteStream && rv.srcObject !== this.remoteStream) {
          rv.srcObject = this.remoteStream;
          if (rv.play) rv.play().catch(() => { });
        }
        if (lv && this.localStream && lv.srcObject !== this.localStream) {
          lv.srcObject = this.localStream;
          if (lv.play) lv.play().catch(() => { });
        }
      } catch (_) { }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(attach);
    else setTimeout(attach, 0);
  }

  joinVoice(channelId) {
    if (!this._iAmReal()) { toast('Нужен зарегистрированный аккаунт', 'error'); return; }
    const srv = this.store.state.servers[this.view.serverId];
    const ch = srv?.channels?.[channelId];
    if (!ch || ch.type !== 'voice') return;
    if (this.view.voiceChannelId && this.view.voiceChannelId !== channelId) this.leaveVoice(this.view.voiceChannelId, true);
    this.view.voiceChannelId = channelId;
    this.store.set(['voice', channelId, this.store.uid], {
      joinedAt: Date.now(), muted: !this.view.mic, deaf: this.view.deaf, video: false
    });
    toast('Вы подключились к голосовому каналу «' + clamp(ch.name, 24) + '»');
    this.renderVoice();
  }
  leaveVoice(channelId, silent = false) {
    const cid = channelId || this.view.voiceChannelId;
    if (!cid) return;
    this.store.del(['voice', cid, this.store.uid]);
    this.view.voiceChannelId = null;
    if (!silent) toast('Вы покинули голосовой канал');
    this.renderVoice();
  }
  toggleVoiceMute() {
    this.view.mic = !this.view.mic;
    const cid = this.view.voiceChannelId;
    if (cid) this.store.patch(['voice', cid, this.store.uid], { muted: !this.view.mic }, true);
    if (this.localStream) for (const t of this.localStream.getAudioTracks()) t.enabled = this.view.mic;
    this.renderVoice();
  }

  renderVoice() {
    const r = this._voiceRoot(); if (!r) return;
    const cid = this.view.voiceChannelId;
    const srv = this.store.state.servers[this.view.serverId];
    const ch = cid && srv?.channels?.[cid];
    if (!cid || !ch) { r.innerHTML = ''; return; }
    const people = Object.entries(this.store.state.voice?.[cid] || {})
      .filter(([id]) => this._realUser(id));
    const other = people.find(([id]) => id !== this.store.uid)?.[0];
    r.innerHTML = `<div class="voice-panel">
      <div class="voice-head"><span class="voice-live"></span><div><b>${esc(clamp(ch.name, 28))}</b><span>${esc(clamp(srv.name, 28))} · ${people.length} в канале</span></div></div>
      <div class="voice-people">${people.map(([id, p]) => {
        const u = this.store.state.users[id];
        return `<div class="voice-person" data-action="profile" data-uid="${esc(id)}">${avatarHtml(u, 'avatar-xs')}<span style="${nickStyle(u)}">${esc(clamp(accountName(u), 20))}</span>${p.muted ? icon('micOff', 13) : ''}</div>`;
      }).join('') || '<span class="voice-empty">Пока только вы</span>'}</div>
      <div class="voice-actions">
        <button class="btn-mini" data-action="voice-mute" data-tip="Микрофон">${icon(this.view.mic ? 'mic' : 'micOff', 15)}</button>
        ${other ? `<button class="btn-mini" data-action="call-user" data-uid="${esc(other)}" data-type="voice" data-tip="Позвонить участнику">${icon('phone', 15)}</button>`
          : `<button class="btn-mini" disabled data-tip="Нет других участников">${icon('phone', 15)}</button>`}
        <button class="btn-mini btn-mini-red" data-action="voice-leave" data-tip="Отключиться">${icon('phoneOff', 15)}</button>
      </div>
    </div>`;
  }
}

export function callHeaderButtons(store, view) {
  const other = view.section === 'dm'
    ? (store.state.dms[view.dmId]?.users || []).find(id => id !== store.uid)
    : null;
  if (!other || !isRealAccount(store.state.users[other], store.state.accounts)) return '';
  return `<button class="hdr-btn" data-action="call-user" data-uid="${esc(other)}" data-type="voice" data-tip="Голосовой звонок">${icon('phone', 19)}</button>
    <button class="hdr-btn" data-action="call-user" data-uid="${esc(other)}" data-type="video" data-tip="Видеозвонок">${icon('video', 19)}</button>`;
}
