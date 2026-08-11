'use strict';

import * as THREE from 'three';

/**
 * Kampüs yürüyüşü: XZ düzleminde AABB listesi (`buildingAABBs` ile uyumlu).
 * `userData.skipWorldCollider = true` — mesh çarpışma listesine alınmaz (logo vb.).
 *
 * @typedef {{ x0: number, x1: number, z0: number, z1: number }} WorldXZAabb
 */

/**
 * Birleşik dünya AABB; kenarlardan oransal içe çekme (içi boş kabuk modellerinde dış gövde).
 * @param {THREE.Object3D} root
 * @param {WorldXZAabb[]} out
 * @param {{ fracX?: number, fracZ?: number }} [frac] her eksen için toplam genişliğe oran (iki yana bölünür)
 */
export function appendMergedWorldXZAABBFractionPad(root, out, frac = {}) {
    const fx = Math.min(0.22, Math.max(0, frac.fracX ?? 0.038));
    const fz = Math.min(0.22, Math.max(0, frac.fracZ ?? 0.038));
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const sx = box.max.x - box.min.x;
    const sz = box.max.z - box.min.z;
    const px = sx * fx * 0.5;
    const pz = sz * fz * 0.5;
    let x0 = box.min.x + px;
    let x1 = box.max.x - px;
    let z0 = box.min.z + pz;
    let z1 = box.max.z - pz;
    if (x1 <= x0) {
        x0 = box.min.x;
        x1 = box.max.x;
    }
    if (z1 <= z0) {
        z0 = box.min.z;
        z1 = box.max.z;
    }
    out.push({ x0, x1, z0, z1 });
}

/**
 * Tüm mesh'lerin birleşik dünya AABB'si; tek dikdörtgen (pad ile).
 */
export function appendMergedWorldXZAABB(root, out, pad = {}) {
    const padX = pad.padX ?? 0;
    const padZ0 = pad.padZ0 ?? 0;
    const padZ1 = pad.padZ1 ?? 0;
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    out.push({
        x0: box.min.x + padX,
        x1: box.max.x - padX,
        z0: box.min.z + padZ0,
        z1: box.max.z - padZ1
    });
}
