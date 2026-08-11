'use strict';

/**
 * Interact noktaları (mini-game spotları).
 *
 * Not: `SPOTS` bir array referansı olarak export edilir. Campus runtime'da bazı alanları okuyup filtreliyor.
 */

/** @type {Array<any>} */
export const SPOTS = [
    { id: 'masa_tenisi', icon: '🏓', title: 'Masa Tenisi', sub: 'BESYO yakınında masa tenisi masası', pos: { x: -18, z: -75 }, game: 'tt' },
    { id: 'flappy_bird', icon: '🕹️', title: 'Oyun Makinesi', sub: 'Mühendislik Fakültesi girişinde', pos: { x: 42, z: -36 }, game: 'fb' },
    { id: 'penalti', icon: '⚽', title: 'Penaltı Atışı', sub: 'BESYO spor alanında', pos: { x: -42, z: -78 }, game: 'ft' },
    { id: 'okculuk', icon: '🏹', title: 'Okçuluk', sub: 'Fen-Edebiyat yanı okçuluk pisti', pos: { x: -70, z: 28 }, game: 'ok' },
    { id: 'basket', icon: '🏀', title: 'Basketbol', sub: 'Yurt A karşısı basketbol sahası', pos: { x: -72, z: -44 }, game: 'bk' },
    // 2 masa: her masa ayrı kuyruk (mesaId).
    { id: 'satranc_1', icon: '♟️', title: 'Satranç', sub: 'Online kuyruk · Masa 1', pos: { x: 10, z: 42 }, game: 'ch', mesaId: 1 },
    { id: 'satranc_2', icon: '♟️', title: 'Satranç', sub: 'Online kuyruk · Masa 2', pos: { x: 18, z: 42 }, game: 'ch', mesaId: 2 },
    { id: 'dama_1', icon: '⛀', title: 'Dama', sub: 'Online kuyruk · Masa 1', pos: { x: -10, z: 42 }, game: 'da', mesaId: 1 },
    { id: 'dama_2', icon: '⛀', title: 'Dama', sub: 'Online kuyruk · Masa 2', pos: { x: -18, z: 42 }, game: 'da', mesaId: 2 }
];

export function registerSpot(spec) {
    if (!spec || typeof spec !== 'object') {
        throw new Error('registerSpot(spec): spec object olmalı');
    }
    if (!spec.id || typeof spec.id !== 'string') {
        throw new Error('registerSpot(spec): spec.id zorunlu');
    }
    if (!spec.game || typeof spec.game !== 'string') {
        throw new Error('registerSpot(spec): spec.game zorunlu');
    }
    SPOTS.push(spec);
    return spec;
}

export function getSpots() {
    return SPOTS;
}

