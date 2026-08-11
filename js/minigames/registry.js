'use strict';

/**
 * Mini-game registry.
 *
 * Amaç:
 * - Yeni oyun eklemek için `campus-app.js` içinde uzun `if/else` zinciriyle uğraşılmasın.
 * - Basit canvas oyunları: type -> factory(create) eşlemesi.
 * - İleride istenirse oyunlar "starter" fonksiyonu ile daha karmaşık akışlara da bağlanabilir.
 */

/** @type {Map<string, { type: string, title?: string, create: Function }>} */
const REGISTRY = new Map();

export function registerMiniGame(def) {
    if (!def || typeof def !== 'object') throw new Error('registerMiniGame(def): def object olmalı');
    const type = String(def.type || '').trim();
    if (!type) throw new Error('registerMiniGame(def): def.type zorunlu');
    if (typeof def.create !== 'function') throw new Error('registerMiniGame(def): def.create function olmalı');
    REGISTRY.set(type, { ...def, type });
    return def;
}

export function getMiniGame(type) {
    return REGISTRY.get(String(type || '').trim()) || null;
}

export function createMiniGameInstance(type, ctx) {
    const def = getMiniGame(type);
    if (!def) return null;
    return def.create(ctx);
}

export function listMiniGames() {
    return Array.from(REGISTRY.values());
}

