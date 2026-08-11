'use strict';

import { registerMiniGame } from './registry.js';
import { TableTennis, FlappyBird, Penalti, Archery, Basketball } from './games.js';

let didInit = false;

/**
 * Varsayılan (mevcut) mini-game kayıtları.
 *
 * Not: Bunu ayrı dosyada tutuyoruz ki yeni oyun ekleyenler sadece buraya bir import + register ekleyebilsin.
 */
export function initDefaultMiniGames() {
    if (didInit) return;
    didInit = true;

    registerMiniGame({
        type: 'tt',
        create: ({ canvas, W, H, endGame }) => new TableTennis(canvas, W, H, endGame)
    });
    registerMiniGame({
        type: 'fb',
        create: ({ canvas, W, H, endGame }) => new FlappyBird(canvas, W, H, endGame)
    });
    registerMiniGame({
        type: 'ft',
        create: ({ canvas, W, H, endGame }) => new Penalti(canvas, W, H, endGame)
    });
    registerMiniGame({
        type: 'ok',
        create: ({ canvas, W, H, endGame }) => new Archery(canvas, W, H, endGame)
    });
    registerMiniGame({
        type: 'bk',
        create: ({ canvas, W, H, endGame }) => new Basketball(canvas, W, H, endGame)
    });
}

