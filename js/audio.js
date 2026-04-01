'use strict';

import { IS_MOB } from './config.js';

export const audio = { ctx: null };

export function initAudio() {
    const amb = new Audio();
    ['/Sounds/Sound_Effects_Outdoor.mp3'].forEach(src => {
        const s = document.createElement('source');
        s.src = src;
        amb.appendChild(s);
    });
    amb.loop = true;
    amb.volume = IS_MOB ? .4 : .5;
    amb.play().catch(() => console.warn('Ambient ses yüklenemedi.'));
    try {
        audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { /* yok */ }
}

export function playBowDraw() {
    if (!audio.ctx) return;
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
    gn.gain.linearRampToValueAtTime(0.18, now + 0.4);
    gn.gain.linearRampToValueAtTime(0.12, now + 0.9);
    gn.gain.linearRampToValueAtTime(0, now + 1.0);
    ns.connect(flt);
    flt.connect(gn);
    gn.connect(audio.ctx.destination);
    ns.start(now);
    ns.stop(now + 1.05);
}

export function playArrowShoot() {
    if (!audio.ctx) return;
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
    gn.gain.setValueAtTime(0.5, now);
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
    og.gain.setValueAtTime(0.25, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    o.connect(og);
    og.connect(audio.ctx.destination);
    o.start(now);
    o.stop(now + 0.22);
}

export function playMurmur() {
    if (!audio.ctx) return;
    const now = audio.ctx.currentTime;
    const o = audio.ctx.createOscillator();
    const f = audio.ctx.createBiquadFilter();
    const g = audio.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 120 + Math.random() * 80;
    f.type = 'lowpass';
    f.frequency.value = 350;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(.07, now + .1);
    g.gain.linearRampToValueAtTime(0, now + .65);
    o.connect(f);
    f.connect(g);
    g.connect(audio.ctx.destination);
    o.start(now);
    o.stop(now + .7);
}

export function playBeep(freq = 440, dur = .1, vol = .3) {
    if (!audio.ctx) return;
    const now = audio.ctx.currentTime;
    const o = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(.001, now + dur);
    o.connect(g);
    g.connect(audio.ctx.destination);
    o.start(now);
    o.stop(now + dur + .05);
}
