'use strict';

import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
function makeStoneBlockTexture(THREE) {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 1024;
    const c = cv.getContext('2d');

    c.fillStyle = '#c6a37a';
    c.fillRect(0, 0, cv.width, cv.height);

    const rowH = 80;
    for (let y = 0; y < cv.height; y += rowH) {
        const offset = ((y / rowH) % 2) ? 35 : 0;
        for (let x = -offset; x < cv.width; x += 140) {
            const w = 120 + (Math.random() * 24 - 12);
            const h = rowH - 6;
            const hue = 28 + Math.random() * 8;
            const sat = 32 + Math.random() * 10;
            const lit = 58 + Math.random() * 10;
            c.fillStyle = `hsl(${hue} ${sat}% ${lit}%)`;
            c.fillRect(x, y + 3, w, h);
            c.strokeStyle = 'rgba(85,65,45,0.24)';
            c.lineWidth = 2;
            c.strokeRect(x, y + 3, w, h);
        }
    }

    // Hafif kir / pürüz
    for (let i = 0; i < 4200; i++) {
        c.globalAlpha = 0.03 + Math.random() * 0.07;
        c.fillStyle = Math.random() > 0.5 ? '#7f6548' : '#e0c39e';
        c.fillRect(Math.random() * cv.width, Math.random() * cv.height, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
    c.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2.5, 2.5);
    return tex;
}

export function addUniversityMainGate({ scene, IS_MOB, buildingAABBs }) {
    const GATE_Z = 82;
    const gateRoot = new THREE.Group();
    gateRoot.position.set(0, 0, GATE_Z);
    gateRoot.userData.isWelcomeGate = true;
    scene.add(gateRoot);

    const objLoader = new OBJLoader();
    const mtlLoader = new MTLLoader();
    const texLoader = new THREE.TextureLoader();
    const stoneTex = makeStoneBlockTexture(THREE);

    return new Promise((resolve, reject) => {
        const tuneMaterial = (mat) => {
            if (!mat) return;
            // MTLLoader genelde MeshPhongMaterial üretir; aşırı parlamayı azalt.
            if (mat.isMeshPhongMaterial) {
                mat.shininess = Math.min(10, mat.shininess ?? 10);
                if (mat.specular) mat.specular.setHex(0x111111);
                mat.needsUpdate = true;
                return;
            }
            if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                mat.metalness = 0;
                mat.roughness = Math.max(0.85, mat.roughness ?? 0.85);
                mat.envMapIntensity = 0;
                mat.needsUpdate = true;
            }
        };

        // Önce MTL yükle ki kapıdaki PNG/renkler görünsün.
        mtlLoader.setPath('/models/');
        mtlLoader.load(
            'Harran-Kapi.mtl',
            (materials) => {
                materials.preload();
                objLoader.setMaterials(materials);
                objLoader.load(
                    '/models/Harran-Kapi.obj',
                    (obj) => {
                        // Blender rengini (Kd/color) koru, sadece taş dokusunu "map" olarak bindir.
                        const applyStoneTexture = (mat) => {
                            if (!mat) return;
                            // Mevcut map varsa override etme (Blender'da özel texture varsa kalsın)
                            if (!mat.map) {
                                mat.map = stoneTex;
                                mat.needsUpdate = true;
                            }
                        };

                        obj.traverse((m) => {
                            if (!m.isMesh) return;
                            // MTL materyali varsa: rengi koru + taş dokusu ekle
                            if (Array.isArray(m.material)) {
                                m.material.forEach((mat) => {
                                    tuneMaterial(mat);
                                    applyStoneTexture(mat);
                                });
                            } else {
                                tuneMaterial(m.material);
                                applyStoneTexture(m.material);
                            }
                            m.castShadow = !IS_MOB;
                            m.receiveShadow = !IS_MOB;
                        });

                // Biraz daha büyük
                const box0 = new THREE.Box3().setFromObject(obj);
                const size0 = new THREE.Vector3();
                box0.getSize(size0);
                const targetWidth = 34;
                const targetHeight = 20;
                const scale = Math.max(targetWidth / (size0.x || 1), targetHeight / (size0.y || 1));
                obj.scale.multiplyScalar(scale);

                const box1 = new THREE.Box3().setFromObject(obj);
                obj.position.y -= box1.min.y; // yere oturt
                gateRoot.add(obj);

                // Orta direk yuvarlak kabartma bölgesine logo
                const boxF = new THREE.Box3().setFromObject(obj);
                const sizeF = new THREE.Vector3();
                boxF.getSize(sizeF);
                // Logo dosyasını public/models altından oku
                const logoTex = texLoader.load('/models/harran_universitesi_logo.png');
                logoTex.anisotropy = 8;

                const logoSize = Math.max(1.6, sizeF.y * 0.12);
                const logo = new THREE.Mesh(
                    new THREE.CircleGeometry(logoSize * 0.5, 48),
                    new THREE.MeshBasicMaterial({
                        map: logoTex,
                        transparent: true,
                        depthWrite: false,
                        side: THREE.DoubleSide
                    })
                );

                // Direk üstündeki yuvarlak kabartma için yaklaşık hedef
                logo.position.set(0, boxF.max.y - sizeF.y * 0.2, boxF.max.z - sizeF.z * 0.06);
                obj.add(logo);

                // Collider (AABB): kapıyı X ekseninde duvar/geçiş parçalarına böl; geçit boşlukları açık kalsın.
                // Z: ana duvarlar (zWall) + öne taşan merkez çıkıntı (zNose).
                if (Array.isArray(buildingAABBs)) {
                    const depth = Math.max(1, sizeF.z);
                    const cx = (boxF.min.x + boxF.max.x) * 0.5;
                    const halfW = sizeF.x * 0.5;
                    const zHalf = depth * 0.5;
                    const zWall0 = GATE_Z - zHalf * 0.92;
                    const zWall1 = GATE_Z + zHalf * 0.26;
                    const zNose0 = GATE_Z + zHalf * 0.18;
                    const zNose1 = GATE_Z + zHalf * 0.92;

                    const centerHalf = halfW * 0.08;
                    const bigOpening = halfW * 0.32;
                    const thinWall = halfW * 0.12;
                    const smallOpening = halfW * 0.2;

                    const rightThin0 = cx + centerHalf + bigOpening;
                    const rightThin1 = rightThin0 + thinWall;
                    const rightOuter0 = rightThin1 + smallOpening;
                    const rightOuter1 = cx + halfW;

                    const leftThin1 = cx - centerHalf - bigOpening;
                    const leftThin0 = leftThin1 - thinWall;
                    const leftOuter1 = leftThin0 - smallOpening;
                    const leftOuter0 = cx - halfW;

                    const pushWall = (x0, x1, z0 = zWall0, z1 = zWall1) => {
                        const a = Math.max(boxF.min.x, Math.min(x0, x1));
                        const b = Math.min(boxF.max.x, Math.max(x0, x1));
                        if (b - a < 0.16) return;
                        buildingAABBs.push({ x0: a, x1: b, z0, z1 });
                    };

                    pushWall(cx - centerHalf, cx + centerHalf);
                    pushWall(leftThin0, leftThin1);
                    pushWall(rightThin0, rightThin1);
                    pushWall(leftOuter0, leftOuter1);
                    pushWall(rightOuter0, rightOuter1);
                    pushWall(cx - centerHalf * 1.05, cx + centerHalf * 1.05, zNose0, zNose1);
                }

                resolve(gateRoot);
                    },
                    undefined,
                    (err) => reject(err)
                );
            },
            undefined,
            (err) => {
                // MTL yoksa yine OBJ ile devam et (eski davranış)
                console.warn('Harran-Kapi.mtl yüklenemedi, fallback material kullanılacak:', err);
                objLoader.load(
                    '/models/Harran-Kapi.obj',
                    (obj) => {
                        const stoneMat = new THREE.MeshStandardMaterial({
                            map: stoneTex,
                            color: 0xffffff,
                            roughness: 0.95,
                            metalness: 0,
                            envMapIntensity: 0.09,
                        });
                        obj.traverse((m) => {
                            if (!m.isMesh) return;
                            m.material = stoneMat;
                            m.castShadow = !IS_MOB;
                            m.receiveShadow = !IS_MOB;
                        });

                        const box0 = new THREE.Box3().setFromObject(obj);
                        const size0 = new THREE.Vector3();
                        box0.getSize(size0);
                        const targetWidth = 34;
                        const targetHeight = 20;
                        const scale = Math.max(targetWidth / (size0.x || 1), targetHeight / (size0.y || 1));
                        obj.scale.multiplyScalar(scale);

                        const box1 = new THREE.Box3().setFromObject(obj);
                        obj.position.y -= box1.min.y;
                        gateRoot.add(obj);
                        resolve(gateRoot);
                    },
                    undefined,
                    (e2) => reject(e2)
                );
            }
        );
    });
}

export function updateUniversityGateAnimations() {
    // Bayraklar kaldırıldı; animasyon yok.
}
