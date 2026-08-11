'use strict';

import { IS_MOB } from './config.js';

export const audio = { ctx: null, ambient: null };

const AMBIENT_MUTE_STORAGE_KEY = 'vr-harran-ambient-mute';
const AMBIENT_VOLUME_PCT_KEY = 'vr-harran-ambient-volume-pct';
const AMBIENT_LAST_NONZERO_PCT_KEY = 'vr-harran-ambient-last-nonzero-pct';

const SFX_MUTE_STORAGE_KEY = 'vr-harran-sfx-mute';
const SFX_VOLUME_PCT_KEY = 'vr-harran-sfx-volume-pct';
const SFX_LAST_NONZERO_PCT_KEY = 'vr-harran-sfx-last-nonzero-pct';

export function getAmbientVolumeCap() {
    return IS_MOB ? 0.4 : 0.5;
}

function readAmbientVolumePercentFromStorage() {
    try {
        const raw = localStorage.getItem(AMBIENT_VOLUME_PCT_KEY);
        if (raw != null && raw !== '') {
            const n = Number(raw);
            if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
        }
        if (localStorage.getItem(AMBIENT_MUTE_STORAGE_KEY) === '1') return 0;
    } catch (_) { /* ignore */ }
    return 100;
}

function persistAmbientVolumePercent(pct) {
    try {
        localStorage.setItem(AMBIENT_VOLUME_PCT_KEY, String(pct));
        localStorage.setItem(AMBIENT_MUTE_STORAGE_KEY, pct < 1 ? '1' : '0');
        if (pct >= 1) localStorage.setItem(AMBIENT_LAST_NONZERO_PCT_KEY, String(pct));
    } catch (_) { /* ignore */ }
}

function readAmbientLastNonzeroPercent() {
    try {
        const raw = localStorage.getItem(AMBIENT_LAST_NONZERO_PCT_KEY);
        if (raw != null && raw !== '') {
            const n = Number(raw);
            if (Number.isFinite(n)) return Math.max(1, Math.min(100, Math.round(n)));
        }
    } catch (_) { /* ignore */ }
    return 100;
}

/** 0–100: kullanıcı seviyesi (platform tavanı `getAmbientVolumeCap()` ile çarpılır). */
export function getAmbientVolumePercent() {
    const a = audio.ambient;
    if (a) {
        const cap = getAmbientVolumeCap();
        if (cap < 1e-6) return 0;
        return Math.max(0, Math.min(100, Math.round((a.volume / cap) * 100)));
    }
    return readAmbientVolumePercentFromStorage();
}

export function setAmbientVolumePercent(percent) {
    const a = audio.ambient;
    const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const cap = getAmbientVolumeCap();
    persistAmbientVolumePercent(pct);
    if (!a) return;
    a.volume = (pct / 100) * cap;
    if (pct > 0) a.play().catch(() => {});
}

/** `renderer.xr` oturumu açıkken true — satranç hamle sesi Web Audio ile güçlendirilir. */
export let chessAudioVrBoost = false;
export function setChessAudioVrBoost(on) {
    chessAudioVrBoost = !!on;
}

export function initAudio() {
    const amb = new Audio();
    ['/Sounds/Sound_Effects_Outdoor.mp3'].forEach(src => {
        const s = document.createElement('source');
        s.src = src;
        amb.appendChild(s);
    });
    amb.loop = true;
    const cap = getAmbientVolumeCap();
    const pct = readAmbientVolumePercentFromStorage();
    amb.volume = (pct / 100) * cap;
    audio.ambient = amb;
    persistAmbientVolumePercent(pct);
    amb.play().catch(() => console.warn('Ambient ses yüklenemedi.'));
    try {
        audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { /* yok */ }
}

export function isAmbientMusicMuted() {
    return getAmbientVolumePercent() < 1;
}

export function setAmbientMusicMuted(muted) {
    if (muted) {
        setAmbientVolumePercent(0);
    } else {
        const p = readAmbientVolumePercentFromStorage();
        const restore = p >= 1 ? p : readAmbientLastNonzeroPercent();
        setAmbientVolumePercent(restore);
    }
}

function readSfxVolumePercentFromStorage() {
    try {
        const raw = localStorage.getItem(SFX_VOLUME_PCT_KEY);
        if (raw != null && raw !== '') {
            const n = Number(raw);
            if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
        }
        if (localStorage.getItem(SFX_MUTE_STORAGE_KEY) === '1') return 0;
    } catch (_) { /* ignore */ }
    return 100;
}

function persistSfxVolumePercent(pct) {
    try {
        localStorage.setItem(SFX_VOLUME_PCT_KEY, String(pct));
        localStorage.setItem(SFX_MUTE_STORAGE_KEY, pct < 1 ? '1' : '0');
        if (pct >= 1) localStorage.setItem(SFX_LAST_NONZERO_PCT_KEY, String(pct));
    } catch (_) { /* ignore */ }
}

function readSfxLastNonzeroPercent() {
    try {
        const raw = localStorage.getItem(SFX_LAST_NONZERO_PCT_KEY);
        if (raw != null && raw !== '') {
            const n = Number(raw);
            if (Number.isFinite(n)) return Math.max(1, Math.min(100, Math.round(n)));
        }
    } catch (_) { /* ignore */ }
    return 100;
}

/** 0–100: taş, ok vb. efektler (müzikten bağımsız). */
export function getSfxVolumePercent() {
    return readSfxVolumePercentFromStorage();
}

export function setSfxVolumePercent(percent) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    persistSfxVolumePercent(pct);
}

export function isSfxMuted() {
    return getSfxVolumePercent() < 1;
}

export function setSfxMuted(muted) {
    if (muted) {
        setSfxVolumePercent(0);
    } else {
        const p = readSfxVolumePercentFromStorage();
        const restore = p >= 1 ? p : readSfxLastNonzeroPercent();
        setSfxVolumePercent(restore);
    }
}

function sfxGainFactor() {
    return Math.max(0, Math.min(1, getSfxVolumePercent() / 100));
}

export function playBowDraw() {
    if (!audio.ctx) return;
    const sfx = sfxGainFactor();
    if (sfx < 1e-4) return;
    const now = audio.ctx.currentTime;
    const bufSz = audio.ctx.sampleRate;
    const buf = audio.ctx.createBuffer(1, bufSz, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSz; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(i / bufSz, 0.3);
    const ns = audio.ctx.createBufferSource();
    ns.buffer = buf;
    const flt = audio.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 180;
    flt.Q.value = 2.5;
    const gn = audio.ctx.createGain();
    gn.gain.setValueAtTime(0, now);
    gn.gain.linearRampToValueAtTime(0.18 * sfx, now + 0.4);
    gn.gain.linearRampToValueAtTime(0.12 * sfx, now + 0.9);
    gn.gain.linearRampToValueAtTime(0, now + 1.0);
    ns.connect(flt);
    flt.connect(gn);
    gn.connect(audio.ctx.destination);
    ns.start(now);
    ns.stop(now + 1.05);
}

export function playArrowShoot() {
    if (!audio.ctx) return;
    const sfx = sfxGainFactor();
    if (sfx < 1e-4) return;
    const now = audio.ctx.currentTime;
    const bufSz = Math.floor(audio.ctx.sampleRate * 0.25);
    const buf = audio.ctx.createBuffer(1, bufSz, audio.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSz; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSz, 1.5);
    const ns = audio.ctx.createBufferSource();
    ns.buffer = buf;
    const flt = audio.ctx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = 1200;
    const gn = audio.ctx.createGain();
    gn.gain.setValueAtTime(0.5 * sfx, now);
    gn.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    ns.connect(flt);
    flt.connect(gn);
    gn.connect(audio.ctx.destination);
    ns.start(now);
    ns.stop(now + 0.25);
    const o = audio.ctx.createOscillator();
    const og = audio.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, now);
    o.frequency.exponentialRampToValueAtTime(60, now + 0.18);
    og.gain.setValueAtTime(0.25 * sfx, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    o.connect(og);
    og.connect(audio.ctx.destination);
    o.start(now);
    o.stop(now + 0.22);
}

export function playMurmur() {
    if (!audio.ctx) return;
    const sfx = sfxGainFactor();
    if (sfx < 1e-4) return;
    const now = audio.ctx.currentTime;
    const o = audio.ctx.createOscillator();
    const f = audio.ctx.createBiquadFilter();
    const g = audio.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 120 + Math.random() * 80;
    f.type = 'lowpass';
    f.frequency.value = 350;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(.07 * sfx, now + .1);
    g.gain.linearRampToValueAtTime(0, now + .65);
    o.connect(f);
    f.connect(g);
    g.connect(audio.ctx.destination);
    o.start(now);
    o.stop(now + .7);
}

/** VR’da ekstra kazanç (HTML volume üst sınırı 1.0’ı aşmak için). */
const CHESS_VR_GAIN = 2.75;

/** Satranç / dama taş hamlesi — SFX seviyesine bağlı (Chess.mp3). */
export function playChessMove() {
    try {
        const sfx = sfxGainFactor();
        if (sfx < 1e-4) return;
        const a = new Audio('/Sounds/Chess.mp3');
        if (chessAudioVrBoost) {
            const ctx = audio.ctx || new (window.AudioContext || window.webkitAudioContext)();
            if (!audio.ctx) audio.ctx = ctx;
            a.volume = 1;
            const src = ctx.createMediaElementSource(a);
            const gain = ctx.createGain();
            gain.gain.value = CHESS_VR_GAIN * sfx;
            src.connect(gain);
            gain.connect(ctx.destination);
            const run = () => {
                if (ctx.state === 'suspended') ctx.resume().catch(() => {});
                a.play().catch(() => {});
            };
            a.addEventListener('ended', () => {
                try {
                    src.disconnect();
                    gain.disconnect();
                } catch (_e) { /* yok */ }
            }, { once: true });
            run();
        } else {
            a.volume = (IS_MOB ? 0.88 : 1) * sfx;
            a.play().catch(() => {});
        }
    } catch (_e) { /* yok */ }
}

export function playBeep(freq = 440, dur = .1, vol = .3) {
    if (!audio.ctx) return;
    const sfx = sfxGainFactor();
    if (sfx < 1e-4) return;
    const now = audio.ctx.currentTime;
    const o = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol * sfx, now);
    g.gain.exponentialRampToValueAtTime(.001, now + dur);
    o.connect(g);
    g.connect(audio.ctx.destination);
    o.start(now);
    o.stop(now + dur + .05);
}
