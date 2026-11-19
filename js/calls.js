// dogapp — звонки: WebRTC (сигналинг через Firebase RTDB), демо-звонки и голосовые каналы
import {
  rid, esc, clamp, toast, avatarHtml, fmtTime, bannerCss, nickStyle, safeColor
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
    this.demoTimer = null;
    this.tick = setInterval(() => {
      const c = this._currentCall();
      if (c && c.status === 'active') this._showActive(c);
    }, 1000);
  }

  _root() { return document.getElementById('call-root'); }
  _voiceRoot() { return document.getElementById('voice-root'); }
  _currentCall() { return this.callId ? this.store.state.calls?.[this.callId] : null; }
  _other(c) { return c && (c.from === this.store.uid ? c.to : c.from); }

  /* ---------- реагирование на изменения Firebase ---------- */
  update() {
    const s = this.store.state, me = this.store.uid;
    const calls = Object.values(s.calls || {});
    // Убираем зависшие вызовы старше 90 секунд
    for (const c of calls) {
      if (c.status === 'ringing' && c.createdAt < Date.now() - 90000) {
        this.store.del(['calls', c.id], true);
      }
    }
    const incoming = calls.find(c => c.to === me && c.status === 'ringing' && c.createdAt > Date.now() - 90000);
    const active = calls.find(c => c.status === 'active' && (c.from === me || c.to === me));

    if (incoming && (!this.callId || this.callId !== incoming.id)) {
      this._showIncoming(incoming);
    } else if (active) {
      if (this.callId !== active.id) {
        this.callId = active.id;
        this.role = active.from === me ? 'caller' : 'callee';
        if (active.mode === 'demo') this._startDemoRemote();
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

  /* ---------- исходящий звонок ---------- */
  async startCall(toUid, type) {
    if (this.callId) { toast('Сначала завершите текущий звонок', 'warn'); return; }
    const s = this.store.state, me = this.store.uid;
    const callee = s.users[toUid];
    const online = callee && (callee.lastSeen || 0) > Date.now() - 120000;
    const canWebRTC = this.store.mode === 'firebase' && online &&
      typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    if (!canWebRTC) return this.startDemo(type, toUid, 'Собеседник не в сети или нет связи с Firebase — включён демо-звонок');

    const id = rid('call');
    this.callId = id; this.role = 'caller';
    this.store.set(['calls', id], {
      id, from: me, to: toUid, type, mode: 'webrtc', status: 'ringing',
      createdAt: Date.now(), sdp: {}, ice: {}
    });
    await this._prepareLocal(type);
    this._createPeer(id, toUid);
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.store.set(['calls', id, 'sdp', me], { type: 'offer', sdp: offer.sdp }, true);
    } catch (e) { this.mediaError = 'Не удалось создать предложение: ' + e.message; }
    this._showActive(this._currentCall());
  }

  /* ---------- демо-звонок (работает без второго участника и без WebRTC) ---------- */
  async startDemo(type, toUid = null, note = 'Демонстрационный звонок: собеседник смоделирован локально') {
    if (this.callId) { toast('Сначала завершите текущий звонок', 'warn'); return; }
    const me = this.store.uid;
    const id = rid('call');
    this.callId = id; this.role = 'caller';
    this.mediaError = note;
    this.store.set(['calls', id], {
      id, from: me, to: toUid || 'demo', type, mode: 'demo', status: 'active',
      createdAt: Date.now(), startedAt: Date.now(), demo: true, sdp: {}, ice: {}
    });
    await this._prepareLocal(type);
    this._startDemoRemote();
    this._showActive(this._currentCall());
  }

  async acceptCall(id) {
    const c = this.store.state.calls?.[id];
    if (!c || c.to !== this.store.uid) return;
    this.callId = id; this.role = 'callee';
    this.store.patch(['calls', id], { status: 'active', startedAt: Date.now() });
    await this._prepareLocal(c.type);
    if (c.mode === 'demo') {
      this.mediaError = 'Демонстрационный звонок: собеседник смоделирован локально';
      this._startDemoRemote();
    } else {
      this._createPeer(id, c.from);
      await this._processSignal(c);
    }
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

  /* ---------- медиа ---------- */
  async _prepareLocal(type) {
    this.muted = false; this.cameraOff = false; this.mediaError = this.mediaError || '';
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try { this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' }); }
      catch (e) { this.mediaError = 'Нет доступа к камере или микрофону — используется заглушка'; this.localStream = null; }
    }
    if (!this.localStream) this.localStream = this._syntheticStream('Вы', '#5865f2', true);
    if (this.pc && this.localStream) {
      for (const t of this.localStream.getTracks()) {
        try { this.pc.addTrack(t, this.localStream); } catch (_) { }
      }
    }
  }

  // Синтетический видеопоток через canvas.captureStream — для демо и заглушек
  _syntheticStream(label, color, animated = false) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 480; canvas.height = 270;
      const ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx || !canvas.captureStream) return null;
      let t = 0;
      const draw = () => {
        ctx.fillStyle = color; ctx.fillRect(0, 0, 480, 270);
        const g = ctx.createLinearGradient(0, 0, 480, 270);
        g.addColorStop(0, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 480, 270);
        ctx.fillStyle = 'rgba(255,255,255,.10)';
        for (let i = 0; i < 5; i++) {
          const x = 60 + i * 90 + Math.sin(t + i) * 22, y = 60 + Math.cos(t * .7 + i) * 40;
          ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#fff';
        ctx.font = '600 26px Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(label).slice(0, 26), 240, 150);
        ctx.font = '400 14px Segoe UI, Arial, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.fillText('dogapp · ' + (animated ? 'демо-поток' : 'заглушка'), 240, 180);
      };
      draw();
      if (animated) {
        clearInterval(this.demoTimer);
        this.demoTimer = setInterval(() => { t += .05; draw(); }, 60);
      }
      return canvas.captureStream(15);
    } catch (_) { return null; }
  }

  _startDemoRemote() {
    this.remoteStream = this._syntheticStream('Демо-собеседник', '#23a55a', true);
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
    clearInterval(this.demoTimer);
    this.pc = null; this.localStream = null; this.remoteStream = null;
    this.callId = null; this.role = null; this.mediaError = '';
    this.appliedIce = new Set(); this.remoteDescSet = false;
  }
  destroy() { clearInterval(this.tick); this._cleanup(); }

  /* ---------- HTML звонка ---------- */
  _showIncoming(c) {
    const r = this._root(); if (!r) return;
    const u = this.store.state.users[c.from] || { name: 'Собеседник' };
    r.innerHTML = `<div class="call-incoming">
      <div class="call-incoming-banner" style="${esc(bannerCss(u.banner, u.bannerAnimated))}"></div>
      <div class="call-incoming-avatar">${avatarHtml(u, 'avatar-xl')}</div>
      <div class="call-incoming-label">ВХОДЯЩИЙ ${c.type === 'video' ? 'ВИДЕОЗВОНОК' : 'ЗВОНОК'}</div>
      <h2 style="${nickStyle(u)}">${esc(clamp(u.name, 32))}</h2>
      <p>${c.mode === 'demo' ? 'Демонстрационный звонок' : 'Звонок через dogapp'} · @${esc(u.login || 'user')}</p>
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
    const u = this.store.state.users[otherId] || { name: c.mode === 'demo' ? 'Демо-собеседник' : 'Собеседник' };
    const me = this.store.me();
    const ringing = c.status === 'ringing';
    const elapsed = c.startedAt ? dur(Date.now() - c.startedAt) : '00:00';
    const isVideo = c.type === 'video';

    r.innerHTML = `<div class="call-panel ${isVideo ? 'is-video' : ''}">
      <div class="call-panel-top">
        <span class="call-dot ${ringing ? 'ringing' : ''}"></span>
        <div class="call-panel-title"><b>${ringing ? 'Ожидание ответа' : (c.mode === 'demo' ? 'Демо-звонок' : (isVideo ? 'Видеозвонок' : 'Голосовой звонок'))}</b><span>${esc(clamp(u.name, 26))} · ${ringing ? 'звоним…' : elapsed}</span></div>
        <button class="call-x" data-action="call-end" data-id="${esc(c.id)}" data-tip="Завершить">${icon('close', 16)}</button>
      </div>
      <div class="call-stage">
        ${isVideo
          ? `<div class="call-video remote"><video data-video="remote" autoplay playsinline></video><span class="call-video-label">${esc(clamp(u.name, 22))}</span></div>
             <div class="call-video local"><video data-video="local" autoplay playsinline muted></video><span class="call-video-label">Вы</span></div>`
          : `<div class="call-voice-stage">
              ${avatarHtml(u, 'avatar-xxl')}
              <b style="${nickStyle(u)}">${esc(clamp(u.name, 30))}</b>
              <span>${ringing ? 'Идёт вызов' : 'Соединение установлено'}</span>
              <div class="call-waves"><i></i><i></i><i></i><i></i><i></i></div>
             </div>`}
      </div>
      ${this.mediaError ? `<div class="call-note">${icon('info', 14)} ${esc(clamp(this.mediaError, 120))}</div>` : ''}
      <div class="call-controls">
        <button class="call-ctrl ${this.muted ? 'off' : ''}" data-action="call-mute" data-tip="${this.muted ? 'Включить микрофон' : 'Выключить микрофон'}">${icon(this.muted ? 'micOff' : 'mic', 19)}</button>
        ${isVideo ? `<button class="call-ctrl ${this.cameraOff ? 'off' : ''}" data-action="call-camera" data-tip="${this.cameraOff ? 'Включить камеру' : 'Выключить камеру'}">${icon(this.cameraOff ? 'videoOff' : 'video', 19)}</button>` : ''}
        <button class="call-ctrl ${c.mode === 'demo' ? 'active' : ''}" data-action="call-demo-note" data-tip="О демо-режиме">${icon('bolt', 19)}</button>
        <button class="call-ctrl hangup" data-action="call-end" data-id="${esc(c.id)}" data-tip="Завершить звонок">${icon('phoneOff', 20)}</button>
      </div>
      <div class="call-foot">${icon('shield', 13)} ${c.mode === 'demo' ? 'Демо: видео генерируется локально, без второго участника' : 'WebRTC · сигналинг через Firebase Realtime Database'}</div>
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

  /* ---------- голосовые каналы ---------- */
  joinVoice(channelId) {
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
    const people = Object.entries(this.store.state.voice?.[cid] || {});
    r.innerHTML = `<div class="voice-panel">
      <div class="voice-head"><span class="voice-live"></span><div><b>${esc(clamp(ch.name, 28))}</b><span>${esc(clamp(srv.name, 28))} · ${people.length} в канале</span></div></div>
      <div class="voice-people">${people.map(([id, p]) => {
        const u = this.store.state.users[id] || { name: 'Участник' };
        return `<div class="voice-person" data-action="profile" data-uid="${esc(id)}">${avatarHtml(u, 'avatar-xs')}<span style="${nickStyle(u)}">${esc(clamp(u.name, 20))}</span>${p.muted ? icon('micOff', 13) : ''}</div>`;
      }).join('') || '<span class="voice-empty">Пока только вы</span>'}</div>
      <div class="voice-actions">
        <button class="btn-mini" data-action="voice-mute" data-tip="Микрофон">${icon(this.view.mic ? 'mic' : 'micOff', 15)}</button>
        <button class="btn-mini" data-action="demo-call" data-type="video" data-tip="Демо видеозвонка">${icon('video', 15)}</button>
        <button class="btn-mini" data-action="call-user" data-uid="${esc(people.find(([id]) => id !== this.store.uid)?.[0] || '')}" data-type="voice" data-tip="Позвонить участнику">${icon('phone', 15)}</button>
        <button class="btn-mini btn-mini-red" data-action="voice-leave" data-tip="Отключиться">${icon('phoneOff', 15)}</button>
      </div>
    </div>`;
  }
}

export function callHeaderButtons(store, view) {
  const other = view.section === 'dm'
    ? (store.state.dms[view.dmId]?.users || []).find(id => id !== store.uid)
    : null;
  if (!other) return '';
  return `<button class="hdr-btn" data-action="call-user" data-uid="${esc(other)}" data-type="voice" data-tip="Голосовой звонок">${icon('phone', 19)}</button>
    <button class="hdr-btn" data-action="call-user" data-uid="${esc(other)}" data-type="video" data-tip="Видеозвонок">${icon('video', 19)}</button>`;
}
