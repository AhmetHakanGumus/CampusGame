import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const lines = fs.readFileSync(path.join(root, 'js', '_inline_extract.js'), 'utf8').split(/\r?\n/);

const header = `'use strict';

import {
    SB_URL, SB_KEY, SB_TABLE, IS_QUEST, IS_MOB, CFG, DIALOGUES, BUILDINGS, SPOTS, NPC_COLORS,
    VR_WALK_SPEED, VR_TURN_SPEED, VR_DEADZONE, SNAP_ANGLE
} from './config.js';
import { applyPlatformDom } from './platform.js';
import { initAudio, playBowDraw, playArrowShoot, playMurmur, playBeep, audio } from './audio.js';
import { TableTennis, FlappyBird, Penalti, Archery, Basketball } from './minigames/games.js';
import { G } from './runtime.js';

applyPlatformDom();

`;

// Orijinal satır 58–2001 (0-tabanlı 57+): STATE'ten itibaren; üstteki config/platform kaldırıldı
let body = lines.slice(57);

// VR sabit tekrarı (config'te): ~satır 22–24 yeni gövdede
for (let i = body.length - 1; i >= 0; i--) {
    if (/^\s*const VR_WALK_SPEED = 5;/.test(body[i])) {
        body.splice(i, 3);
        break;
    }
}

// snap + SNAP_ANGLE tekrarını sadeleştir
for (let i = 0; i < body.length; i++) {
    if (/let snapTurnReady = true/.test(body[i])) {
        if (body[i + 1] && /const SNAP_ANGLE/.test(body[i + 1])) {
            body.splice(i + 1, 1);
        }
        break;
    }
}

// Ses bölümünü çıkar
let a0 = -1;
let a1 = -1;
for (let i = 0; i < body.length; i++) {
    if (body[i].includes('AUDIO ═')) a0 = i;
    if (a0 >= 0 && body[i].includes('function playBeep') && a1 < 0) {
        let j = i;
        while (j < body.length && !/^\s*}\s*$/.test(body[j])) j++;
        a1 = j;
        break;
    }
}
if (a0 >= 0 && a1 >= 0) body.splice(a0, a1 - a0 + 1);

// Minigame sınıfları (games.js)
let g0 = -1;
let g1 = -1;
for (let i = 0; i < body.length; i++) {
    if (body[i].includes('MASA TENİSİ') && body[i].includes('PONG')) g0 = i - 1;
}
for (let i = 0; i < body.length; i++) {
    if (body[i].includes('YARDIMCI FONKSİYONLAR')) {
        g1 = i - 1;
        break;
    }
}
if (g0 >= 0 && g1 >= 0 && g1 > g0) body.splice(g0, g1 - g0 + 1);

let s = body.join('\n');

s = s.replace(/let mmCtx, mmSize = 165, audioCtx = null, lastT = 0;/, 'let mmCtx, mmSize = 165, lastT = 0;');
s = s.replace(/\baudioCtx\b/g, 'audio.ctx');
s = s.replace(/\bgameRunning\b/g, 'G.gameRunning');
s = s.replace(/\bgameRaf\b/g, 'G.gameRaf');

// let activeSpot..., gameRunning — düzelt
s = s.replace(
    /let activeSpot = null, G\.gameRunning = false, gamePaused = false;/,
    'let activeSpot = null;'
);

// Mini engine çift let
s = s.replace(
    /let currentGame = null, currentGameId = null, currentGameTitle = null;\s*let G\.gameRaf = null;\s*/m,
    'let currentGame = null, currentGameId = null, currentGameTitle = null;\n        '
);

fs.writeFileSync(path.join(root, 'js', 'campus-app.js'), header + s + '\n');
console.log('campus-app.js OK');
