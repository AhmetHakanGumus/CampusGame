'use strict';

/**
 * Kampüs bina içeriği.
 *
 * Tasarım hedefi:
 * - `BUILDINGS` aynı "array referansı" olarak her yerde kullanılabilsin (campus-app runtime'da mutate ediyor).
 * - Yeni bina eklemek isteyenler tek bir yerden ekleyebilsin: `registerBuilding(...)`.
 */

/** @type {Array<any>} */
export const BUILDINGS = [
    { x: 0, z: -62, w: 42, h: 19, d: 22, color: 0xc9986a, css: '#c9986a', name: "Ana Bina" },
    { x: -56, z: -46, w: 29, h: 15, d: 19, color: 0x6a8faf, css: '#6a8faf', name: "Kütüphane" },
    { x: 56, z: -46, w: 29, h: 15, d: 19, color: 0x6a8faf, css: '#6a8faf', name: "Mühendislik Fak." },
    { x: -56, z: 14, w: 25, h: 13, d: 18, color: 0x78a878, css: '#78a878', name: "Fen-Edebiyat Fak." },
    { x: 56, z: 14, w: 25, h: 13, d: 18, color: 0x78a878, css: '#78a878', name: "İktisadi Bilimler" },
    { x: 0, z: 26, w: 34, h: 10, d: 22, color: 0xd0b28a, css: '#d0b28a', name: "Rektörlük" },
    { x: -80, z: -66, w: 18, h: 22, d: 30, color: 0xa07cb0, css: '#a07cb0', name: "Yurt A" },
    { x: 80, z: -66, w: 18, h: 22, d: 30, color: 0xa07cb0, css: '#a07cb0', name: "Yurt B" },
    { x: -30, z: -87, w: 19, h: 11, d: 15, color: 0x7aaac4, css: '#7aaac4', name: "Spor Salonu (BESYO)" },
    { x: 30, z: -87, w: 19, h: 11, d: 15, color: 0x7aaac4, css: '#7aaac4', name: "Sağlık Merkezi" },
    { x: 0, z: -33, w: 12, h: 5, d: 12, color: 0xc4b08a, css: '#c4b08a', name: "Güvenlik" },
    // Gap-Yenev (3D: addGapYenev ~ x=36, z=50; harita: merkez daire + üç kanat, campus-app'te runtime'da)
    { x: 36, z: 50, w: 16, h: 8, d: 14, color: 0xb89a6a, css: '#b89a6a', name: "Gap Yenev", mapPolygon: null },
];

export function registerBuilding(spec) {
    if (!spec || typeof spec !== 'object') {
        throw new Error('registerBuilding(spec): spec object olmalı');
    }
    if (!spec.name || typeof spec.name !== 'string') {
        throw new Error('registerBuilding(spec): spec.name zorunlu');
    }
    BUILDINGS.push(spec);
    return spec;
}

export function getBuildings() {
    return BUILDINGS;
}

