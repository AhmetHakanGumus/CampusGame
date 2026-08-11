'use strict';

import * as THREE from 'three';

/** VR ve web 3D satranç için ortak taş modelleri */
export function createPieceModel(type, color, whitePieceMat, blackPieceMat) {
    const group = new THREE.Group();
    const mat = color === 'white' ? whitePieceMat : blackPieceMat;

    const baseGeo = new THREE.CylinderGeometry(0.35, 0.38, 0.1, 16);
    const base = new THREE.Mesh(baseGeo, mat);
    base.position.y = 0.05;
    base.castShadow = true;
    group.add(base);

    switch (type) {
        case 'P': {
            const bodyGeo = new THREE.CylinderGeometry(0.15, 0.25, 0.4, 12);
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 0.3;
            body.castShadow = true;
            group.add(body);
            const headGeo = new THREE.SphereGeometry(0.18, 12, 10);
            const head = new THREE.Mesh(headGeo, mat);
            head.position.y = 0.6;
            head.castShadow = true;
            group.add(head);
            break;
        }
        case 'R': {
            const bodyGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.55, 8);
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 0.38;
            body.castShadow = true;
            group.add(body);
            const topGeo = new THREE.CylinderGeometry(0.28, 0.22, 0.15, 8);
            const top = new THREE.Mesh(topGeo, mat);
            top.position.y = 0.73;
            top.castShadow = true;
            group.add(top);
            for (let i = 0; i < 4; i++) {
                const bGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
                const b = new THREE.Mesh(bGeo, mat);
                const angle = (i / 4) * Math.PI * 2;
                b.position.set(Math.cos(angle) * 0.2, 0.87, Math.sin(angle) * 0.2);
                b.castShadow = true;
                group.add(b);
            }
            break;
        }
        case 'N': {
            const bodyGeo = new THREE.CylinderGeometry(0.18, 0.26, 0.45, 10);
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 0.33;
            body.castShadow = true;
            group.add(body);
            const headGeo = new THREE.BoxGeometry(0.18, 0.35, 0.38);
            const head = new THREE.Mesh(headGeo, mat);
            head.position.set(0, 0.7, 0.05);
            head.rotation.x = 0.3;
            head.castShadow = true;
            group.add(head);
            const noseGeo = new THREE.BoxGeometry(0.14, 0.12, 0.2);
            const nose = new THREE.Mesh(noseGeo, mat);
            nose.position.set(0, 0.58, 0.22);
            nose.castShadow = true;
            group.add(nose);
            break;
        }
        case 'B': {
            const bodyGeo = new THREE.CylinderGeometry(0.12, 0.25, 0.6, 12);
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 0.4;
            body.castShadow = true;
            group.add(body);
            const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
            const head = new THREE.Mesh(headGeo, mat);
            head.position.y = 0.78;
            head.castShadow = true;
            group.add(head);
            const tipGeo = new THREE.SphereGeometry(0.06, 8, 6);
            const tip = new THREE.Mesh(tipGeo, mat);
            tip.position.y = 0.98;
            tip.castShadow = true;
            group.add(tip);
            break;
        }
        case 'Q': {
            const bodyGeo = new THREE.CylinderGeometry(0.1, 0.28, 0.7, 12);
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 0.45;
            body.castShadow = true;
            group.add(body);
            const crownGeo = new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
            const crown = new THREE.Mesh(crownGeo, mat);
            crown.position.y = 0.85;
            crown.castShadow = true;
            group.add(crown);
            const tipGeo = new THREE.SphereGeometry(0.08, 8, 6);
            const tip = new THREE.Mesh(tipGeo, mat);
            tip.position.y = 1.05;
            tip.castShadow = true;
            group.add(tip);
            break;
        }
        case 'K': {
            const bodyGeo = new THREE.CylinderGeometry(0.12, 0.28, 0.75, 12);
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 0.48;
            body.castShadow = true;
            group.add(body);
            const headGeo = new THREE.CylinderGeometry(0.18, 0.14, 0.2, 12);
            const head = new THREE.Mesh(headGeo, mat);
            head.position.y = 0.92;
            head.castShadow = true;
            group.add(head);
            const crossVGeo = new THREE.BoxGeometry(0.06, 0.22, 0.06);
            const crossV = new THREE.Mesh(crossVGeo, mat);
            crossV.position.y = 1.13;
            crossV.castShadow = true;
            group.add(crossV);
            const crossHGeo = new THREE.BoxGeometry(0.18, 0.06, 0.06);
            const crossH = new THREE.Mesh(crossHGeo, mat);
            crossH.position.y = 1.18;
            crossH.castShadow = true;
            group.add(crossH);
            break;
        }
        default:
            break;
    }
    return group;
}

/**
 * Her taşın kendi materyali olsun (emissive ile şah / VR hover parlaması için).
 * @param {THREE.Group} group
 */
export function cloneMaterialsOnPieceGroup(group) {
    group.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        if (Array.isArray(obj.material)) {
            obj.material = obj.material.map((m) => {
                const c = m.clone();
                c.userData._chessPieceMatOwned = true;
                return c;
            });
        } else {
            const c = obj.material.clone();
            c.userData._chessPieceMatOwned = true;
            obj.material = c;
        }
    });
}
