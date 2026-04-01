'use strict';

import * as THREE from 'three';
import {
    IS_QUEST, IS_MOB, CFG, DIALOGUES, BUILDINGS, SPOTS, NPC_COLORS,
    VR_WALK_SPEED, VR_TURN_SPEED, VR_DEADZONE, SNAP_ANGLE
} from './config.js';
import { applyPlatformDom } from './platform.js';
import { initAudio, playBowDraw, playArrowShoot, playMurmur, playBeep, audio } from './audio.js';
import { TableTennis, FlappyBird, Penalti, Archery, Basketball } from './minigames/games.js';
import { ChessGame } from './minigames/chess-game.js';
import { VrChessStandalone } from './minigames/vr-chess-standalone.js';
import { G } from './runtime.js';
import { addUniversityMainGate, updateUniversityGateAnimations } from './university-gate.js';
import { getLeaderboard, saveScore, getRank } from './api.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { createMultiplayerClient } from './multiplayer.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

applyPlatformDom();

        /* ════════════════ STATE ════════════════════════ */
        let renderer, scene, camera;
        let player, playerYaw = 0, playerPitch = 0.18;
        let npcs = [], buildingAABBs = [], activeBubbles = [], proxLabels = [];
        let highlightIdx = -1, blinkOn = true, blinkTimer = 0;
        let universityGateRoot = null;
        let keys = {}, isLocked = false;
        let mmCtx, mmSize = 165, lastT = 0;
        let bldgTimer = null, mapTimer = null, lbTimer = null;
        let activeSpot = null;
        let mainRafId = 0;
        let isRunning = false;
        let escMenuOpen = false;
        let escMenuBackdrop = null;
        let escMenuTab = 'leaderboard';
        let localPlayerId = null;
        let localUsername = 'Oyuncu';
        let localSessionToken = '';
        let mpClient = null;
        let remotePlayers = new Map();
        let onlineUsers = [];
        let onlineUsersPanel = null;
        let moveSyncT = 0;
        let vrChessPlayBtn = null;
        let chessModeMenu = null;
        let pendingChessSpot = null;
        let vrChessUiGroup = null;
        let vrChessUiButtons = [];
        let vrChessUiHover = null;

        // Joystick
        const JOY = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0, thumbEl: null, baseEl: null };
        const LOOK = { active: false, id: -1, lx: 0, ly: 0 };

        /* ════════════════ VR STATE ═════════════════════ */
        let xrActive = false;
        let xrRig = null;
        let xrCtrl0 = null;
        let xrCtrl1 = null;
        let xrGrip0 = null;
        let xrGrip1 = null;
        let xrRaycaster = null;
        let xrControllerHands = { 0: null, 1: null };
        let xrSupported = false;
        let xrLeftHand = null, xrRightHand = null;
        let xrGrabbedLeft = null, xrGrabbedRight = null;
        /** squeeze olayları bazı runtime'larda kaçırılabiliyor; poll ile yedeklenir */
        let xrPrevSqueezeLeft = false;
        let xrPrevSqueezeRight = false;
        const vrGrabbables = [];
        let xrHandsLoaded = false;
        let rebindVRHands = () => {};
        let vrChessStandalone = null;
        const VR_EYE_HEIGHT_BOOST = 0.44;

        function startNonVRLoop() {
            if (mainRafId) return;
            const tick = (t) => {
                loop(t);
                mainRafId = requestAnimationFrame(tick);
            };
            mainRafId = requestAnimationFrame(tick);
        }

        function stopNonVRLoop() {
            if (!mainRafId) return;
            cancelAnimationFrame(mainRafId);
            mainRafId = 0;
        }

        /* ════════════════════════════════════════════════
           VR ALGILAMA ve KURULUM
           ─────────────────────────────────────────────
           1. detectAndSetupVR(): Tarayıcı VR destekliyor mu
              kontrol eder. Destekliyorsa setupVR() çağırır.
           2. setupVR(): xrRig, kontrolcüler, olay dinleyiciler
              ve "Enter VR" butonunu oluşturur.
           3. VR yoksa bu fonksiyonlar hiç çağrılmaz, oyun
              normal masaüstü/mobil modda çalışmaya devam eder.
        ════════════════════════════════════════════════ */
        function detectAndSetupVR() {
            // WebXR API var mı?
            if (!navigator.xr || typeof navigator.xr.isSessionSupported !== 'function') {
                console.log('WebXR API bulunamadı – VR devre dışı');
                return;
            }
            // immersive-vr destekleniyor mu?
            navigator.xr.isSessionSupported('immersive-vr')
                .then((supported) => {
                    if (!supported) {
                        console.log('immersive-vr desteklenmiyor – VR devre dışı');
                        return;
                    }
                    console.log('VR cihazı algılandı – VR kuruluyor');
                    xrSupported = true;
                    setupVR();
                })
                .catch((err) => {
                    console.warn('VR destek kontrolü başarısız:', err);
                    xrSupported = false;
                });
        }

        function setupVR() {
            /* ── 1) Renderer XR'ı etkinleştir ────────── */
            renderer.xr.enabled = true;
            renderer.xr.setReferenceSpaceType('local-floor');

            /* ── 2) Oyuncu kafesi (rig) oluştur ──────── */
            xrRig = new THREE.Group();
            xrRig.position.set(
                player ? player.position.x : 0,
                VR_EYE_HEIGHT_BOOST,
                player ? player.position.z : 108
            );
            scene.add(xrRig);

            /* ── 3) Kontrolcüleri (el) ekle ───────────── */
            xrCtrl0 = renderer.xr.getController(0);
            xrCtrl1 = renderer.xr.getController(1);
            xrRig.add(xrCtrl0);
            xrRig.add(xrCtrl1);

            const rayGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, -2)
            ]);
            const rayMat = new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.65 });
            xrCtrl0.add(new THREE.Line(rayGeo, rayMat));
            xrCtrl1.add(new THREE.Line(rayGeo, rayMat));

            /* ── 4) Controller grip modelleri (el) ────── */
            xrGrip0 = renderer.xr.getControllerGrip(0);
            xrGrip1 = renderer.xr.getControllerGrip(1);
            initVRHands(xrGrip0, xrGrip1);
            xrRig.add(xrGrip0);
            xrRig.add(xrGrip1);

            /* ── 5) Raycast (trigger ile spot tespiti) ── */
            xrRaycaster = new THREE.Raycaster();
            function onXrSelectStart(ev) {
                const ctrl = ev.target;
                if (vrChessStandalone && G.gameRunning && vrChessStandalone.onSelectStart(ctrl)) return;
                if (handleVrChessUiSelect()) return;
                if (!activeSpot) return;
                document.getElementById('interact-prompt').style.display = 'none';
                if (activeSpot.game === 'ch') {
                    if (xrActive) return;
                    startGame('ch', activeSpot.id, activeSpot.title, { mode: 'local' });
                    return;
                }
                startGame(activeSpot.game, activeSpot.id, activeSpot.title);
            }
            xrCtrl0.addEventListener('selectstart', onXrSelectStart);
            xrCtrl1.addEventListener('selectstart', onXrSelectStart);
            function ctrl0Hand() { return xrControllerHands[0] || 'left'; }
            function ctrl1Hand() { return xrControllerHands[1] || 'right'; }
            xrCtrl0.addEventListener('squeezestart', () => tryGrabObject(ctrl0Hand()));
            xrCtrl0.addEventListener('squeezeend', () => releaseGrabbedObject(ctrl0Hand()));
            xrCtrl1.addEventListener('squeezestart', () => tryGrabObject(ctrl1Hand()));
            xrCtrl1.addEventListener('squeezeend', () => releaseGrabbedObject(ctrl1Hand()));
            // Trigger ile de bırakma (bazı cihazlarda grip yerine tetik kullanılır)
            function onXrSelectEnd() {
                if (vrChessStandalone && G.gameRunning) vrChessStandalone.onSelectEnd();
            }
            xrCtrl0.addEventListener('selectend', onXrSelectEnd);
            xrCtrl1.addEventListener('selectend', onXrSelectEnd);

            /* ── 6) VR oturum olayları ───────────────── */
            renderer.xr.addEventListener('sessionstart', () => {
                xrActive = true;
                stopNonVRLoop();

                // Kamerayı scene'den çıkar → xrRig'e bağla
                scene.remove(camera);
                xrRig.add(camera);
                // local-floor ile y=0 zemin seviyesi, headset kendi yüksekliğini ekler
                camera.position.set(0, 0, 0);
                camera.rotation.set(0, 0, 0);

                // Kamera/XR Rig'i Harran Kapısı'nın tam önüne taşı
                let targetX = player ? player.position.x : 0;
                let targetZ = player ? player.position.z : 108;
                let targetYaw = playerYaw;

                if (universityGateRoot?.position) {
                    targetX = universityGateRoot.position.x;
                    // Kapının "giriş/ön" tarafı: gate'in biraz güneyi (kayıp yaşamaması için küçük offset)
                    targetZ = universityGateRoot.position.z + 10;
                    // Kapıya bak: birinci şahıs forward -Z yönüne dönsün
                    targetYaw = Math.PI;
                }

                xrRig.position.set(targetX, VR_EYE_HEIGHT_BOOST, targetZ);
                xrRig.rotation.y = targetYaw;
                playerYaw = targetYaw;

                // 1. şahıs: oyuncu modelini gizle ve rig ile senkronla
                if (player) {
                    player.position.set(targetX, 0, targetZ);
                    player.visible = false;
                }

                // HTML overlay'leri gizle (VR'da görünmezler ama temizlik)
                hideHTMLForVR(true);
                rebindVRHands();
                setTimeout(() => rebindVRHands(), 300);

                renderer.setAnimationLoop(loop);
                console.log('VR oturumu başladı – 1. şahıs modu');
            });

            renderer.xr.addEventListener('sessionend', () => {
                xrActive = false;
                renderer.setAnimationLoop(null);

                // Kamerayı xrRig'den çıkar → scene'e geri ekle
                xrRig.remove(camera);
                scene.add(camera);

                // Oyuncu modelini geri göster ve pozisyon senkronize et
                if (player) {
                    player.visible = true;
                    player.position.x = xrRig.position.x;
                    player.position.z = xrRig.position.z;
                    playerYaw = xrRig.rotation.y;
                }

                // HTML overlay'leri geri göster
                hideHTMLForVR(false);

                startNonVRLoop();
                console.log('VR oturumu sona erdi – 3. şahıs moduna dönüldü');
            });

            /* ── 7) Manuel VR butonunu göster ve bağla ── */
            // Standard Three.js VRButton (Enter VR)
            const existingBtn = document.getElementById('VRButton');
            if (existingBtn) existingBtn.remove();
            document.body.appendChild(VRButton.createButton(renderer));

            console.log('VR hazır – VRButton eklendi');
        }

        function createDetailedVRHand(side) {
            const root = new THREE.Group();
            root.position.set(0, -0.03, 0.02);
            const palm = new THREE.Mesh(
                new THREE.BoxGeometry(0.07, 0.022, 0.09),
                new THREE.MeshLambertMaterial({ color: side === 'left' ? 0x8f7d6a : 0x9b8875 })
            );
            palm.position.set(0, 0, 0);
            root.add(palm);

            const fingers = [];
            const xSign = side === 'left' ? -1 : 1;
            const starts = [
                [0.0, 0.0, -0.038], // index
                [0.012 * xSign, 0.0, -0.038], // middle
                [0.024 * xSign, 0.0, -0.036], // ring
                [0.035 * xSign, 0.0, -0.03], // pinky
                [-0.033 * xSign, -0.003, -0.005] // thumb
            ];

            starts.forEach((p, idx) => {
                const base = new THREE.Group();
                base.position.set(p[0], p[1], p[2]);
                root.add(base);
                const segs = [];
                const isThumb = idx === 4;
                const lens = isThumb ? [0.02, 0.016, 0.012] : [0.026, 0.02, 0.016];
                let parent = base;
                lens.forEach((len) => {
                    const joint = new THREE.Group();
                    parent.add(joint);
                    const seg = new THREE.Mesh(
                        new THREE.BoxGeometry(0.012, 0.01, len),
                        new THREE.MeshLambertMaterial({ color: 0xb29f8b })
                    );
                    seg.position.z = -len * 0.5;
                    joint.add(seg);
                    joint.position.z = isThumb ? -0.012 : -len * 0.9;
                    segs.push(joint);
                    parent = joint;
                });
                if (isThumb) base.rotation.y = 0.7 * xSign;
                fingers.push({ base, segs, isThumb });
            });

            return { root, fingers };
        }

        function initVRHands(grip0, grip1) {
            if (xrHandsLoaded) return;

            const fallback = () => {
                const handGeo = new THREE.BoxGeometry(0.06, 0.08, 0.14);
                const handMat = new THREE.MeshLambertMaterial({ color: 0x444466 });
                grip0.add(new THREE.Mesh(handGeo, handMat));
                grip1.add(new THREE.Mesh(handGeo, handMat));
                xrLeftHand = createDetailedVRHand('left');
                xrRightHand = createDetailedVRHand('right');
                grip0.add(xrLeftHand.root);
                grip1.add(xrRightHand.root);
            };

            const loader = new FBXLoader();
            const styleHandMaterials = (root) => {
                root.traverse((o) => {
                    if (!o.isMesh) return;
                    o.material = new THREE.MeshStandardMaterial({
                        color: 0xebcbb9,
                        roughness: 0.72,
                        metalness: 0
                    });
                    o.castShadow = false;
                    o.receiveShadow = false;
                });
            };

            const buildHand = (url, side) =>
                new Promise((resolve, reject) => {
                    loader.load(
                        url,
                        (fbx) => {
                            styleHandMaterials(fbx);
                            fbx.scale.setScalar(0.012);
                            const handGroup = new THREE.Group();
                            const wristPivot = new THREE.Group();
                            handGroup.add(wristPivot);
                            wristPivot.add(fbx);
                            const bbox = new THREE.Box3().setFromObject(fbx);
                            const center = new THREE.Vector3();
                            bbox.getCenter(center);
                            fbx.position.set(-center.x, -center.y, -center.z);
                            handGroup.position.set(0, -0.014, 0.006);
                            wristPivot.rotation.set(
                                Math.PI / 2,
                                Math.PI,
                                side === 'left' ? 0.10 : -0.10
                            );
                            resolve(handGroup);
                        },
                        undefined,
                        reject
                    );
                });

            const attachToGrip = (hand, grip) => {
                if (!hand || !grip) return;
                if (hand.parent) hand.parent.remove(hand);
                grip.add(hand);
                hand.visible = true;
            };
            const attachByController = (controllerIndex, handedness) => {
                const h = String(handedness || '').toLowerCase();
                if (h !== 'left' && h !== 'right') return;
                xrControllerHands[controllerIndex] = h;
                const grip = controllerIndex === 0 ? grip0 : grip1;
                const hand = h === 'left' ? xrLeftHand : xrRightHand;
                attachToGrip(hand, grip);
            };
            rebindVRHands = () => {
                if (!xrHandsLoaded) return;
                const h0 = xrControllerHands[0];
                const h1 = xrControllerHands[1];
                const dup = h0 && h1 && h0 === h1;
                if (!dup) {
                    if (h0 === 'left') attachToGrip(xrLeftHand, grip0);
                    else if (h0 === 'right') attachToGrip(xrRightHand, grip0);
                    if (h1 === 'left') attachToGrip(xrLeftHand, grip1);
                    else if (h1 === 'right') attachToGrip(xrRightHand, grip1);
                } else {
                    // Bazı cihazlar geçici olarak iki kontrolcüyü aynı handedness verebiliyor.
                    attachToGrip(xrLeftHand, grip0);
                    attachToGrip(xrRightHand, grip1);
                }
                // Hiç veri yoksa başlangıç düzenine dön.
                if (!h0 && !h1) {
                    attachToGrip(xrLeftHand, grip0);
                    attachToGrip(xrRightHand, grip1);
                }
            };

            Promise.all([
                buildHand('/models/LeftHand.fbx', 'left'),
                buildHand('/models/RightHand.fbx', 'right')
            ])
                .then(([leftHand, rightHand]) => {
                    xrLeftHand = leftHand;
                    xrRightHand = rightHand;
                    xrHandsLoaded = true;
                    rebindVRHands();

                    xrCtrl0.addEventListener('connected', (ev) => {
                        attachByController(0, ev?.data?.handedness);
                    });
                    xrCtrl1.addEventListener('connected', (ev) => {
                        attachByController(1, ev?.data?.handedness);
                    });
                    xrCtrl0.addEventListener('disconnected', () => {
                        xrControllerHands[0] = null;
                    });
                    xrCtrl1.addEventListener('disconnected', () => {
                        xrControllerHands[1] = null;
                    });
                })
                .catch(() => fallback());
        }

        function setVRHandCurl(hand, amount) {
            if (!hand || !hand.fingers) return;
            const curl = Math.max(0, Math.min(1, amount));
            hand.fingers.forEach((f) => {
                const a = f.isThumb ? (0.6 * curl) : (1.15 * curl);
                f.segs.forEach((j, idx) => {
                    j.rotation.x = -a * (idx === 0 ? 0.8 : 1);
                });
            });
        }

        function collectVRGrabbables() {
            vrGrabbables.length = 0;
            if (vrChessStandalone && G.gameRunning) return;
            scene.traverse((o) => {
                if (!o.userData?.vrGrabbable) return;
                vrGrabbables.push(o);
            });
        }

        function tryGrabObject(handedness) {
            if (!xrActive) return;
            if (vrChessStandalone && G.gameRunning) return;
            if (handedness === 'left' && xrGrabbedLeft) return;
            if (handedness === 'right' && xrGrabbedRight) return;

            collectVRGrabbables();
            const ctrl = handedness === 'left' ? (xrGrip0 || xrCtrl0) : (xrGrip1 || xrCtrl1);
            if (!ctrl) return;

            const origin = new THREE.Vector3();
            ctrl.getWorldPosition(origin);
            let best = null, bestDist = 1.15;
            for (const o of vrGrabbables) {
                const wp = new THREE.Vector3();
                o.getWorldPosition(wp);
                const d = origin.distanceTo(wp);
                if (d < bestDist) { bestDist = d; best = o; }
            }
            if (!best) return;

            ctrl.attach(best);
            best.position.set(0, -0.03, -0.2);
            best.rotation.set(0, 0, 0);

            if (handedness === 'left') xrGrabbedLeft = best;
            else xrGrabbedRight = best;
        }

        function releaseGrabbedObject(handedness) {
            const grabbed = handedness === 'left' ? xrGrabbedLeft : xrGrabbedRight;
            if (!grabbed) return;
            if (handedness === 'left') xrGrabbedLeft = null;
            else xrGrabbedRight = null;
            try {
                scene.attach(grabbed);
            } catch (err) {
                console.error('VR release error:', err);
            }
        }

        function clearVrChess() {
            if (vrChessStandalone) {
                vrChessStandalone.dispose();
                vrChessStandalone = null;
            }
        }

        /* VR sırasında HTML UI'ı gizle/göster */
        function hideHTMLForVR(hide) {
            const ids = ['crosshair','controls-hint','mm-wrap','bldg-panel',
                         'lb-panel','joy-base','joy-label','m-bldg-btn',
                         'm-map-btn','m-lb-btn','lock-overlay'];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = hide ? 'none' : '';
            });
            const vrBtn = document.getElementById('VRButton');
            if (vrBtn) vrBtn.style.display = hide ? 'none' : '';
            // VRButton ek bileşenleri için
            document.querySelectorAll('.webxr-button').forEach(el => {
                el.style.display = hide ? 'none' : '';
            });
        }

        /* ════════════════ INIT ═════════════════════════ */
        async function initGame() {
            if (IS_MOB) mmSize = 130;

            // ── Renderer ────────────────────────────────
            renderer = new THREE.WebGLRenderer({ antialias: !IS_MOB });
            renderer.setSize(innerWidth, innerHeight);
            renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOB ? 1.5 : 2));
            renderer.shadowMap.enabled = !IS_MOB;
            renderer.setClearColor(0x87ceeb);
            renderer.domElement.style.cssText = 'position:fixed;top:0;left:0;z-index:1;width:100%;height:100%';
            document.body.appendChild(renderer.domElement);

            // ── Scene & Camera ──────────────────────────
            scene = new THREE.Scene();
            scene.fog = new THREE.Fog(0x87ceeb, 70, IS_MOB ? 130 : 170);
            camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .1, 500);

            /* ══════════════════════════════════════════════
               VR KONTROLÜ
               ─────────────────────────────────────────────
               Tarayıcı immersive-vr destekliyorsa setupVR()
               çağrılır ve "Enter VR" butonu gösterilir.
               Desteklemiyorsa hiçbir VR objesi oluşturulmaz,
               oyun normal masaüstü/mobil modda çalışır.
            ══════════════════════════════════════════════ */
            renderer.xr.enabled = true;
            detectAndSetupVR();

            // ── Sahne ve oyun objeleri ───────────────────
            buildScene();
            universityGateRoot = await addUniversityMainGate({ scene, IS_MOB, buildingAABBs });
            addInteractiveObjects();
            createPlayer();
            spawnNPCs();
            buildSidePanel();
            buildProxLabels();
            setupControls();
            setupLeaderboard();
            setupMiniGames();
            setupEscMenu();
            setupOnlineUsersPanel();
            setupChessModeMenu();
            setupVrChessUi();

            const mc = document.getElementById('minimap');
            mc.width = mc.height = mmSize; mc.style.width = mc.style.height = mmSize + 'px';
            mmCtx = mc.getContext('2d');

            window.addEventListener('resize', () => {
                camera.aspect = innerWidth / innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(innerWidth, innerHeight);
                updateJoyBase();
            });

            loadLeaderboard('masa_tenisi');
            startNonVRLoop();
        }

        /* ════════════════ SCENE ════════════════════════ */
        function buildScene() {
            scene.add(new THREE.AmbientLight(0xfff3e0, IS_MOB ? .75 : .55));
            const sun = new THREE.DirectionalLight(0xfff4cc, 1.15);
            sun.position.set(70, 100, 50);
            if (!IS_MOB) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = sc.bottom = -140; sc.right = sc.top = 140; sc.far = 450; }
            scene.add(sun); scene.add(new THREE.HemisphereLight(0x87ceeb, 0x6b5033, .4));
            const gnd = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshLambertMaterial({ color: 0x518a3e }));
            gnd.rotation.x = -Math.PI / 2; gnd.receiveShadow = !IS_MOB; scene.add(gnd);
            const pm = new THREE.MeshLambertMaterial({ color: 0x9e9e8a });
            [[0, 0, 9, 175], [0, -46, 155, 9], [0, 14, 130, 7], [-28, -70, 7, 50], [28, -70, 7, 50]].forEach(([x, z, w, d]) => addPlane(x, z, w, d, pm, .02));
            addPlane(0, -20, 30, 30, new THREE.MeshLambertMaterial({ color: 0xbfa882 }), .03);
            BUILDINGS.forEach(addBuilding);
            [[-16, -22], [16, -22], [-16, -33], [16, -33], [-9, -9], [9, -9], [-32, 6], [32, 6], [-22, 44], [22, 44], [0, 50], [-44, -26], [44, -26], [-72, 6], [72, 6], [-26, -74], [26, -74], [0, -37], [-6, -35], [6, -35], [-45, 44], [45, 44], [-20, 58], [20, 58]]
                .forEach(([x, z]) => addTree(x, z, .85 + Math.random() * .4));
            [[6, 2], [-6, 2], [6, -28], [-6, -28], [6, -58], [-6, -58], [32, -24], [-32, -24], [32, -64], [-32, -64], [0, -2], [0, -50]]
                .forEach(([x, z]) => addLamp(x, z));
        }

        function addPlane(x, z, w, d, mat, dy = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, dy, z); scene.add(m); }

        function addBuilding({ x, z, w, h, d, color }) {
            const mat = new THREE.MeshLambertMaterial({ color });
            const body = bx(w, h, d, mat); body.position.set(x, h / 2, z); body.castShadow = body.receiveShadow = !IS_MOB; scene.add(body);
            const roof = bx(w + .6, .8, d + .6, new THREE.MeshLambertMaterial({ color: dk(color, .7) })); roof.position.set(x, h + .4, z); scene.add(roof);
            const wm = new THREE.MeshLambertMaterial({ color: 0x9ecae1, transparent: true, opacity: .85 });
            const cols = Math.max(2, Math.floor(w / 5)), rows = Math.max(1, Math.floor(h / 4));
            for (let r = 0; r < rows; r++)for (let c = 0; c < cols; c++) { const w2 = bx(1.5, 1.2, .12, wm); w2.position.set(x + (c - (cols - 1) / 2) * (w / cols), 2 + r * 3.3, z + d / 2 + .07); scene.add(w2); }
            const door = bx(2.2, 3.2, .15, new THREE.MeshLambertMaterial({ color: dk(color, .5) })); door.position.set(x, 1.6, z + d / 2 + .08); scene.add(door);
            buildingAABBs.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
        }

        function addTree(x, z, s = 1) {
            const g = new THREE.Group(); g.add(cl(.22 * s, .32 * s, 2.5 * s, 7, 0x7a5c1e, 0, 1.25 * s, 0));
            const fc = new THREE.MeshLambertMaterial({ color: 0x2a6332 });
            [[2.4, 3.2], [1.85, 4.7], [1.2, 5.9]].forEach(([r, hy]) => { const sp = new THREE.Mesh(new THREE.SphereGeometry(r * s, IS_MOB ? 6 : 9, IS_MOB ? 5 : 7), fc); sp.position.set(0, hy * s, 0); sp.castShadow = !IS_MOB; g.add(sp) });
            g.position.set(x, 0, z); scene.add(g);
        }

        function addLamp(x, z) {
            scene.add(cl(.07, .1, 5.5, 6, 0x555555, x, 2.75, z));
            const head = new THREE.Mesh(new THREE.SphereGeometry(.3, 8, 8), new THREE.MeshLambertMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: .7 }));
            head.position.set(x, 5.7, z); scene.add(head);
            if (!IS_MOB) { const pl = new THREE.PointLight(0xfff0a0, 1, 16); pl.position.set(x, 5.5, z); scene.add(pl); }
        }

        /* ════════════════ INTERACTIVE 3D OBJECTS ═══════ */
        function addInteractiveObjects() {
            // ── Masa Tenisi Masası ─────────────────────
            const tt = new THREE.Group();
            const tableTop = bx(3.5, .1, 2, new THREE.MeshLambertMaterial({ color: 0x1a5e1a })); tableTop.position.set(0, .85, 0); tt.add(tableTop);
            const net = bx(3.5, .25, .05, new THREE.MeshLambertMaterial({ color: 0xdddddd })); net.position.set(0, 1, 0); tt.add(net);
            [[-1.5, 0, -0.85], [1.5, 0, -0.85], [-1.5, 0, 0.85], [1.5, 0, 0.85]].forEach(([x, _y, z]) => {
                const leg = cl(.06, .06, .85, 4, 0x888888, x, .425, z); tt.add(leg);
            });
            const line = bx(.05, .01, 2, new THREE.MeshLambertMaterial({ color: 0xffffff })); line.position.set(0, .91, 0); tt.add(line);
            const s = SPOTS[0].pos;
            tt.position.set(s.x, .0, s.z);
            scene.add(tt);
            addSpotMarker(s.x, s.z, '🏓');

            // ── Oyun Makinesi (Arcade Cabinet) ────────
            const arc = new THREE.Group();
            const body2 = bx(1.2, 2.2, .7, new THREE.MeshLambertMaterial({ color: 0x1a1a2e })); body2.position.set(0, 1.1, 0); arc.add(body2);
            const scr = bx(0.85, 0.65, .05, new THREE.MeshLambertMaterial({ color: 0x00ffaa, emissive: 0x00ff88, emissiveIntensity: .6 })); scr.position.set(0, 1.55, .38); arc.add(scr);
            const cp = bx(1.1, .15, .5, new THREE.MeshLambertMaterial({ color: 0x2a2a3e })); cp.position.set(0, .85, .2); arc.add(cp);
            [[-.2, 0, .1], [.1, 0, .05], [-.3, 0, .05]].forEach(([bx2, by, bz]) => {
                const btn = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 8), new THREE.MeshLambertMaterial({ color: 0xff3355, emissive: 0xff0022, emissiveIntensity: .5 }));
                btn.position.set(bx2, .93 + by, bz + .23); arc.add(btn);
            });
            const arcPos = SPOTS[1].pos;
            arc.position.set(arcPos.x, 0, arcPos.z); arc.rotation.y = Math.PI * .3;
            scene.add(arc);
            addSpotMarker(arcPos.x, arcPos.z, '🕹️');

            // ── Futbol Kalesi ──────────────────────────
            const goal = new THREE.Group();
            const gmat = new THREE.MeshLambertMaterial({ color: 0xffffff });
            [-2, 2].forEach(ox => { const post = cl(.1, .1, 3, 8, 0xffffff, ox, 1.5, 0); goal.add(post); });
            const bar = bx(4.2, .2, .2, gmat); bar.position.set(0, 3, 0); goal.add(bar);
            const netM = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .18, side: THREE.DoubleSide });
            const netBack = bx(4, .1, 2.8, netM); netBack.position.set(0, 1.5, -1.2); goal.add(netBack);
            const goalPos = SPOTS[2].pos;
            goal.position.set(goalPos.x, 0, goalPos.z); goal.rotation.y = Math.PI * .5;
            scene.add(goal);
            addSpotMarker(goalPos.x, goalPos.z, '⚽');

            // ── Okçuluk Hedef Tahtası ───────────────────
            const archG = new THREE.Group();
            archG.add(cl(.08, .08, 3.5, 6, 0x8b4513, -1.8, 1.75, 0));
            archG.add(cl(.08, .08, 3.5, 6, 0x8b4513, 1.8, 1.75, 0));
            const tColors = [0xffdd00, 0xff0000, 0x0000ff, 0x000000, 0xffffff];
            const tRadii = [.9, .72, .54, .36, .18];
            tColors.forEach((col, i) => {
                const ring = new THREE.Mesh(new THREE.CylinderGeometry(tRadii[i], tRadii[i], .05, 24),
                    new THREE.MeshLambertMaterial({ color: col }));
                ring.rotation.x = Math.PI / 2; ring.position.set(0, 2.6, 0); archG.add(ring);
            });
            archG.add(bx(3.7, .12, .12, new THREE.MeshLambertMaterial({ color: 0x8b4513 })));
            const archPos = SPOTS[3].pos;
            archG.position.set(archPos.x, 0, archPos.z);
            scene.add(archG);
            addSpotMarker(archPos.x, archPos.z, '🏹');

            // ── Basketbol Potası ──────────────────────────
            const bkG = new THREE.Group();
            bkG.add(cl(.12, .12, 4.5, 6, 0x888888, 0, 2.25, 0));
            const board = bx(1.8, 1.2, .08, new THREE.MeshLambertMaterial({ color: 0xddddff, transparent: true, opacity: .75 }));
            board.position.set(0, 4.4, 0); bkG.add(board);
            const hoopMat = new THREE.MeshLambertMaterial({ color: 0xff6600 });
            const hoop = new THREE.Mesh(new THREE.TorusGeometry(.38, .045, 8, 24), hoopMat);
            hoop.rotation.x = Math.PI / 2; hoop.position.set(0, 3.8, .4); bkG.add(hoop);
            for (let i = 0; i < 8; i++) {
                const a = i / 8 * Math.PI * 2;
                const str = cl(.015, .015, .5, 4, 0xffffff, .38 * Math.cos(a), 3.55, .4 + .38 * Math.sin(a)); bkG.add(str);
            }
            const bkPos = SPOTS[4].pos;
            bkG.position.set(bkPos.x, 0, bkPos.z); bkG.rotation.y = Math.PI * .5;
            scene.add(bkG);
            addSpotMarker(bkPos.x, bkPos.z, '🏀');

            // ── Satranç masası (Yemekhane önü) ─────────────
            const chPos = SPOTS.find((s) => s.game === 'ch')?.pos;
            if (chPos) {
                const ch = new THREE.Group();
                const table = bx(3.2, 0.14, 3.2, new THREE.MeshLambertMaterial({ color: 0x5a4330 }));
                table.position.set(0, 1.1, 0);
                ch.add(table);
                [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].forEach(([lx, lz]) => {
                    ch.add(cl(0.09, 0.11, 1.1, 6, 0x4b3626, lx, 0.55, lz));
                });
                const board = bx(2.2, 0.03, 2.2, new THREE.MeshLambertMaterial({ color: 0xe8d9bd }));
                board.position.set(0, 1.2, 0);
                ch.add(board);
                ch.position.set(chPos.x, 0, chPos.z);
                scene.add(ch);
                addSpotMarker(chPos.x, chPos.z, '♟️');
            }
        }

        function addSpotMarker(x, z, emoji) {
            const cv = document.createElement('canvas'); cv.width = 80; cv.height = 80;
            const c = cv.getContext('2d');
            c.font = '52px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(emoji, 40, 42);
            const m = new THREE.Mesh(
                new THREE.PlaneGeometry(2, 2),
                new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })
            );
            m.position.set(x, 3.5, z); m.userData.floatBase = 3.5; m.userData.floatT = Math.random() * Math.PI * 2;
            m.userData.isMarker = true;
            m.userData.vrGrabbable = true;
            scene.add(m);
        }

        /* ════════════════ PLAYER ═══════════════════════ */
        function createPlayer() { player = makeHuman(0x1a4f8a, 0x1a2a3a); player.position.set(0, 0, 108); scene.add(player); }

        function makeHuman(bc, lc) {
            const g = new THREE.Group();
            const sk = new THREE.MeshLambertMaterial({ color: 0xa0522d }), bm = new THREE.MeshLambertMaterial({ color: bc }), lm = new THREE.MeshLambertMaterial({ color: lc }), sm = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
            const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = !IS_MOB; g.add(m); return m };
            g.torso = add(new THREE.BoxGeometry(.62, .82, .32), bm, 0, 1.22, 0); g.head = add(new THREE.BoxGeometry(.44, .44, .44), sk, 0, 1.95, 0);
            g.lArm = add(new THREE.BoxGeometry(.21, .68, .21), bm, -.45, 1.12, 0); g.rArm = add(new THREE.BoxGeometry(.21, .68, .21), bm, .45, 1.12, 0);
            g.lLeg = add(new THREE.BoxGeometry(.24, .72, .24), lm, -.18, .44, 0); g.rLeg = add(new THREE.BoxGeometry(.24, .72, .24), lm, .18, .44, 0);
            add(new THREE.BoxGeometry(.26, .18, .34), sm, -.18, .06, .05); add(new THREE.BoxGeometry(.26, .18, .34), sm, .18, .06, .05);
            g.walkPh = 0; return g;
        }

        function walkAnim(h, dt, mv) {
            if (mv) { h.walkPh += dt * 5.8; const s = Math.sin(h.walkPh) * .52; h.lArm.rotation.x = s; h.rArm.rotation.x = -s; h.lLeg.rotation.x = -s; h.rLeg.rotation.x = s; }
            else { h.lArm.rotation.x *= .8; h.rArm.rotation.x *= .8; h.lLeg.rotation.x *= .8; h.rLeg.rotation.x *= .8; }
        }

        /* ════════════════ NPCs ═════════════════════════ */
        function spawnNPCs() {
            const zones = [[0, 54, 13], [0, -18, 13], [-38, 2, 10], [38, 2, 10], [0, -36, 8], [-12, 42, 8], [12, 42, 8], [-55, -20, 8], [55, -20, 8]];
            for (let i = 0; i < CFG.npcCount; i++) {
                const [zx, zz, zr] = zones[i % zones.length], a = Math.random() * Math.PI * 2, r = Math.random() * zr;
                const npc = makeHuman(NPC_COLORS[i % NPC_COLORS.length], 0x1a2a3a);
                npc.position.set(zx + Math.cos(a) * r, 0, zz + Math.sin(a) * r);
                npc.userData = { target: new THREE.Vector3(zx + Math.cos(a) * r, 0, zz + Math.sin(a) * r), state: 'walk', stateT: Math.random() * 5, greetT: 0, speed: CFG.npcSpeed * (.7 + Math.random() * .65), bubble: null, bubbleExpiry: 0 };
                scene.add(npc); npcs.push(npc); pickTarget(npc);
            }
        }
        function pickTarget(npc) { let t = 0, tx, tz; do { tx = (Math.random() - .5) * 140; tz = (Math.random() - .5) * 140; t++ } while (inBldg(tx, tz, 2.5) && t < 25); npc.userData.target.set(tx, 0, tz); }

        /* ════════════════ PANELS ════════════════════════ */
        function buildSidePanel() {
            const panel = document.getElementById('bldg-panel');
            BUILDINGS.forEach((b, i) => {
                const item = document.createElement('div'); item.className = 'bldg-item';
                const dot = document.createElement('div'); dot.className = 'bldg-dot'; dot.style.background = b.css; dot.style.boxShadow = `0 0 6px ${b.css}88`;
                item.appendChild(dot); item.appendChild(document.createTextNode(b.name));
                item.addEventListener('click', () => {
                    if (highlightIdx === i) { highlightIdx = -1; item.classList.remove('active'); }
                    else { document.querySelectorAll('.bldg-item').forEach(el => el.classList.remove('active')); highlightIdx = i; item.classList.add('active'); }
                    if (IS_MOB) {
                        clearTimeout(bldgTimer);
                        bldgTimer = setTimeout(() => document.getElementById('bldg-panel').classList.remove('mob-open'), 3000);
                        const mmw = document.getElementById('mm-wrap');
                        clearTimeout(mapTimer);
                        mmw.classList.add('mob-open');
                        mapTimer = setTimeout(() => mmw.classList.remove('mob-open'), 4000);
                    }
                });
                panel.appendChild(item);
            });
        }

        function buildProxLabels() {
            BUILDINGS.forEach(b => {
                const el = document.createElement('div'); el.className = 'prox-label'; el.textContent = b.name; el.style.display = 'none';
                document.body.appendChild(el); proxLabels.push({ el, bldg: b });
            });
        }
        function updateProxLabels() {
            proxLabels.forEach(({ el, bldg }) => {
                const dx = player.position.x - bldg.x, dz = player.position.z - bldg.z, dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < CFG.proxDist) {
                    const sc = w2s(bldg.x, bldg.h * .5, bldg.z - bldg.d * .5 - .5);
                    if (sc && sc.x > 0 && sc.x < innerWidth && sc.y > 60 && sc.y < innerHeight - 60) {
                        el.style.left = sc.x + 'px'; el.style.top = sc.y + 'px'; el.style.display = '';
                        el.style.opacity = Math.min(1, (CFG.proxDist - dist) / 6).toFixed(2);
                    } else el.style.display = 'none';
                } else el.style.display = 'none';
            });
        }

        /* ════════════════ MAIN LOOP ════════════════════ */
        function loop(t) {
            const dt = Math.min(((t || 0) - lastT) / 1000, .05); lastT = t || 0;
            blinkTimer += dt; if (blinkTimer > .45) { blinkOn = !blinkOn; blinkTimer = 0; }

            // VR hareketi (sadece VR aktifken)
            if (xrActive) updateVRMovement(dt);
            if (vrChessStandalone && G.gameRunning) vrChessStandalone.update();

            if (!G.gameRunning) {
                updatePlayer(dt);
                updateNPCs(dt);
                checkInteractSpots();
                if (xrActive) updateVRRaycast();
            }

            // Normal modda kamerayı güncelle, VR'da headset kontrol eder
            if (!xrActive) updateCamera();

            updateMarkers(dt);
            updateUniversityGateAnimations(scene, (t || 0) / 1000);
            scene.traverse(o => {
                if (o.userData.isWelcomeGate) {
                    const d = player.position.distanceTo(o.position);
                    o.visible = (d < 72);
                }
            });
            updateProxLabels();
            updateBubbles();
            drawMinimap();
            updateRemotePlayers(dt);
            syncLocalPlayerMove(dt);
            updateVrChessPlayButton();
            updateVrChessUi();

            renderer.render(scene, camera);
        }

        /* ════════════════ UPDATE PLAYER ════════════════ */
        function updatePlayer(dt) {
            // VR modundayken normal player hareketi devre dışı
            if (xrActive) return;

            let fd = 0;
            if (IS_MOB) {
                if (Math.abs(JOY.dy) > .1) fd = JOY.dy;
                if (Math.abs(JOY.dx) > .1) playerYaw -= JOY.dx * CFG.joyTurn * dt;
            } else {
                if (keys['KeyW'] || keys['ArrowUp']) fd = -1;
                if (keys['KeyS'] || keys['ArrowDown']) fd = 1;
            }
            isRunning = !!keys['ShiftLeft'] || !!keys['ShiftRight'];
            const mv = fd !== 0;
            if (mv) {
                const px = player.position.x, pz = player.position.z;
                const speed = CFG.walkSpeed * (isRunning ? 1.8 : 1);
                let nx = px + Math.sin(playerYaw) * fd * speed * dt;
                let nz = pz + Math.cos(playerYaw) * fd * speed * dt;
                nx = Math.max(-94, Math.min(94, nx)); nz = Math.max(-98, Math.min(118, nz));
                if (!inBldg(nx, pz, .75)) player.position.x = nx;
                if (!inBldg(player.position.x, nz, .75)) player.position.z = nz;
            }
            player.rotation.y = playerYaw; walkAnim(player, dt, mv);
        }

        /* ════════════════ UPDATE NPCs ══════════════════ */
        function updateNPCs(dt) {
            const pp = player.position;
            npcs.forEach(npc => {
                const ud = npc.userData;
                ud.stateT -= dt; if (ud.greetT > 0) ud.greetT -= dt;
                const dist = npc.position.distanceTo(pp);
                if (dist < CFG.speakDist && ud.greetT <= 0) { ud.greetT = CFG.greetCool; ud.state = 'talk'; ud.stateT = 3; showBubble(npc, rnd(DIALOGUES)); playMurmur(); }
                if (ud.stateT <= 0) { const r = Math.random(); if (ud.state === 'walk') { if (r < .25) { ud.state = 'talk'; ud.stateT = 2 + Math.random() * 3; showBubble(npc, rnd(DIALOGUES)); playMurmur(); } else if (r < .45) { ud.state = 'idle'; ud.stateT = 1.2 + Math.random() * 2; } else { pickTarget(npc); ud.stateT = 5 + Math.random() * 10; } } else { ud.state = 'walk'; ud.stateT = 4 + Math.random() * 9; pickTarget(npc); } }
                if (ud.state === 'walk') {
                    const dx = ud.target.x - npc.position.x, dz = ud.target.z - npc.position.z, d2 = Math.sqrt(dx * dx + dz * dz);
                    if (d2 > 1) {
                        const nx = npc.position.x + (dx / d2) * ud.speed * dt, nz = npc.position.z + (dz / d2) * ud.speed * dt;
                        if (!inBldg(nx, npc.position.z, .55)) npc.position.x = nx; else pickTarget(npc);
                        if (!inBldg(npc.position.x, nz, .55)) npc.position.z = nz; else pickTarget(npc);
                        npc.rotation.y = Math.atan2(-dx, -dz); walkAnim(npc, dt, true);
                    } else pickTarget(npc);
                } else walkAnim(npc, dt, false);
                if (ud.bubble) { const sc = w2s(npc.position.x, 2.6, npc.position.z); if (sc && dist < 32) { ud.bubble.style.left = sc.x + 'px'; ud.bubble.style.top = sc.y + 'px'; ud.bubble.style.display = ''; } else ud.bubble.style.display = 'none'; }
            });
        }

        /* ════════════════ VR HAREKETİ ═════════════════
           Sol joystick  → baş yönünde ileri/geri/sağ/sol
           Sağ joystick  → 30° snap dönüş (konforlu VR)
        ══════════════════════════════════════════════ */
        let snapTurnReady = true; // Snap turn debounce

        function updateVRMovement(dt) {
            if (!xrRig) return;
            const session = renderer.xr.getSession();
            if (!session) return;

            for (const src of session.inputSources) {
                const gp = src.gamepad;
                if (!gp) continue;
                const triggerVal = gp.buttons?.[0]?.value || 0;
                const squeezeVal = gp.buttons?.[1]?.value || 0;

                const curlVal = Math.max(triggerVal, squeezeVal);
                if (src.handedness === 'left') setVRHandCurl(xrLeftHand, curlVal);
                if (src.handedness === 'right') setVRHandCurl(xrRightHand, curlVal);

                // Grip bırakıldı ama squeezeend gelmemiş olabilir — poll ile algıla
                const sqPressed = squeezeVal > 0.35;
                if (src.handedness === 'left') {
                    if (xrPrevSqueezeLeft && !sqPressed) {
                        if (xrGrabbedLeft) releaseGrabbedObject('left');
                    }
                    xrPrevSqueezeLeft = sqPressed;
                } else if (src.handedness === 'right') {
                    if (xrPrevSqueezeRight && !sqPressed) {
                        if (xrGrabbedRight) releaseGrabbedObject('right');
                    }
                    xrPrevSqueezeRight = sqPressed;
                }

                /* ── Sol el: Yürüyüş (baş yönünde) ────── */
                if (src.handedness === 'left') {
                    const axX = gp.axes[2] || 0;
                    const axZ = gp.axes[3] || 0;
                    const runMul = triggerVal > 0.7 ? 1.8 : 1;
                    isRunning = runMul > 1;

                    if (Math.abs(axX) > VR_DEADZONE || Math.abs(axZ) > VR_DEADZONE) {
                        // Headset'in baktığı yönü al
                        const xrCamera = renderer.xr.getCamera(camera);
                        const forward = new THREE.Vector3();
                        const right = new THREE.Vector3();
                        xrCamera.getWorldDirection(forward);
                        forward.y = 0;
                        forward.normalize();
                        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

                        // Joystick girdisini baş yönüne göre harekete çevir
                        const move = new THREE.Vector3();
                        move.addScaledVector(forward, -axZ * VR_WALK_SPEED * runMul * dt);
                        move.addScaledVector(right, axX * VR_WALK_SPEED * runMul * dt);

                        let nx = xrRig.position.x + move.x;
                        let nz = xrRig.position.z + move.z;
                        nx = Math.max(-94, Math.min(94, nx));
                        nz = Math.max(-98, Math.min(118, nz));
                        if (!inBldg(nx, xrRig.position.z, .75)) xrRig.position.x = nx;
                        if (!inBldg(xrRig.position.x, nz, .75)) xrRig.position.z = nz;

                        // Player pozisyonunu senkronize et (minimap, NPC)
                        if (player) {
                            player.position.x = xrRig.position.x;
                            player.position.z = xrRig.position.z;
                        }
                    }
                }

                /* ── Sağ el: Snap dönüş (30° adımlarla) ── */
                if (src.handedness === 'right') {
                    const axX = gp.axes[2] || 0;

                    if (Math.abs(axX) > 0.6 && snapTurnReady) {
                        // Sağa veya sola 30° snap
                        const dir = axX > 0 ? -1 : 1;
                        xrRig.rotation.y += SNAP_ANGLE * dir;
                        playerYaw = xrRig.rotation.y;
                        snapTurnReady = false;
                    }
                    // Joystick merkeze dönünce tekrar snap'e izin ver
                    if (Math.abs(axX) < 0.3) {
                        snapTurnReady = true;
                    }
                }
            }
        }

        /* ════════════════ VR RAYCAST ══════════════════ */
        function updateVRRaycast() {
            if (!xrCtrl1 || !xrRaycaster) return;

            const origin = new THREE.Vector3();
            const dir = new THREE.Vector3();
            xrCtrl1.getWorldPosition(origin);
            xrCtrl1.getWorldDirection(dir);
            dir.negate();

            xrRaycaster.set(origin, dir);

            let nearest = null, nearDist = Infinity;
            SPOTS.forEach(sp => {
                if (xrActive && sp.game === 'ch') return;
                const d = origin.distanceTo(new THREE.Vector3(sp.pos.x, 1.5, sp.pos.z));
                if (d < CFG.interactDist && d < nearDist) { nearDist = d; nearest = sp; }
            });

            const prompt = document.getElementById('interact-prompt');
            if (nearest && nearest.id !== refusedSpot?.id && !activeSpot) {
                activeSpot = nearest;
                document.getElementById('ip-icon').textContent = nearest.icon;
                document.getElementById('ip-title').textContent = nearest.title + ' oynamak ister misin?';
                document.getElementById('ip-sub').textContent = nearest.sub;
                prompt.style.display = 'block';
            } else if (!nearest && activeSpot) {
                activeSpot = null;
                prompt.style.display = 'none';
            }
        }

        /* ════════════════ CAMERA ════════════════════════ */
        function updateCamera() {
            const hd = Math.cos(Math.max(-.1, playerPitch)) * CFG.camDist;
            const hy = CFG.camHeightBase + Math.sin(playerPitch) * CFG.camDist;
            camera.position.set(player.position.x + Math.sin(playerYaw) * hd, player.position.y + hy, player.position.z + Math.cos(playerYaw) * hd);
            camera.lookAt(player.position.x, player.position.y + 1.7, player.position.z);
        }

        function updateMarkers(dt) {
            scene.traverse(o => {
                if (o.userData.isMarker) {
                    o.userData.floatT += dt * 1.5;
                    o.position.y = o.userData.floatBase + Math.sin(o.userData.floatT) * .25;
                    o.quaternion.copy(camera.quaternion);
                }
            });
        }

        /* ════════════════ INTERACT SPOTS ═══════════════ */
        let refusedSpot = null;

        function checkInteractSpots() {
            // VR modunda ayrı raycast kullanılıyor
            if (xrActive) return;

            let nearest = null, nearDist = Infinity;
            SPOTS.forEach(sp => {
                const dx = player.position.x - sp.pos.x, dz = player.position.z - sp.pos.z;
                const d = Math.sqrt(dx * dx + dz * dz);
                if (d < CFG.interactDist && d < nearDist) { nearDist = d; nearest = sp; }
            });

            if (refusedSpot && nearest?.id !== refusedSpot.id) refusedSpot = null;

            const prompt = document.getElementById('interact-prompt');
            if (nearest && nearest.id === refusedSpot?.id) return;

            if (nearest && !activeSpot) {
                activeSpot = nearest;
                document.getElementById('ip-icon').textContent = nearest.icon;
                document.getElementById('ip-title').textContent = nearest.title + ' oynamak ister misin?';
                document.getElementById('ip-sub').textContent = nearest.sub;
                prompt.style.display = 'block';
            } else if (!nearest && activeSpot) {
                activeSpot = null;
                prompt.style.display = 'none';
            }
        }

        function setupInteractPrompt() {
            document.getElementById('ip-yes').addEventListener('click', () => {
                if (!activeSpot) return;
                document.getElementById('interact-prompt').style.display = 'none';
                if (activeSpot.game === 'ch') {
                    if (isLocked && document.exitPointerLock) document.exitPointerLock();
                    startGame('ch', activeSpot.id, activeSpot.title, { mode: 'local' });
                    return;
                }
                if (isLocked && document.exitPointerLock) document.exitPointerLock();
                startGame(activeSpot.game, activeSpot.id, activeSpot.title);
            });
            document.getElementById('ip-no').addEventListener('click', () => {
                refusedSpot = activeSpot;
                activeSpot = null;
                document.getElementById('interact-prompt').style.display = 'none';
            });
        }

        /* ════════════════ BUBBLES ══════════════════════ */
        function showBubble(npc, text) {
            if (npc.userData.bubble) { npc.userData.bubble.remove(); activeBubbles = activeBubbles.filter(b => b.npc !== npc); }
            const el = document.createElement('div'); el.className = 'bubble'; el.textContent = text;
            document.body.appendChild(el); npc.userData.bubble = el; npc.userData.bubbleExpiry = Date.now() + CFG.bubbleDurMs;
            activeBubbles.push({ el, npc });
        }
        function updateBubbles() {
            const now = Date.now();
            for (let i = activeBubbles.length - 1; i >= 0; i--) { const b = activeBubbles[i]; if (now > b.npc.userData.bubbleExpiry) { b.el.remove(); b.npc.userData.bubble = null; activeBubbles.splice(i, 1); } }
        }

        /* ════════════════ MINIMAP ══════════════════════ */
        function drawMinimap() {
            const ctx = mmCtx, S = mmSize, sc = S / 230;
            ctx.clearRect(0, 0, S, S);
            ctx.fillStyle = 'rgba(10,18,10,.9)'; ctx.beginPath(); rr(ctx, 0, 0, S, S, 12); ctx.fill();
            const tm = (wx, wz) => [S / 2 + wx * sc, S / 2 + wz * sc];
            ctx.fillStyle = 'rgba(40,72,40,.55)'; ctx.beginPath(); rr(ctx, 4, 4, S - 8, S - 8, 9); ctx.fill();
            ctx.strokeStyle = 'rgba(200,185,145,.5)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(S / 2, 4); ctx.lineTo(S / 2, S - 4); ctx.stroke();
            const [, mz46] = tm(0, -46); ctx.beginPath(); ctx.moveTo(4, mz46); ctx.lineTo(S - 4, mz46); ctx.stroke();
            SPOTS.forEach(sp => {
                const [mx, mz] = tm(sp.pos.x, sp.pos.z);
                ctx.fillStyle = '#ffdd44'; ctx.beginPath(); ctx.arc(mx, mz, 3.5, 0, Math.PI * 2); ctx.fill();
            });
            BUILDINGS.forEach(({ x, z, w, d }, i) => {
                const [mx, mz] = tm(x, z), bw = w * sc, bd = d * sc, bx2 = mx - bw / 2, bz = mz - bd / 2, isHL = (i === highlightIdx);
                if (isHL && blinkOn) { ctx.shadowColor = '#e8c870'; ctx.shadowBlur = 10; ctx.fillStyle = '#ffe97a'; ctx.fillRect(bx2 - 2, bz - 2, bw + 4, bd + 4); ctx.shadowBlur = 0; }
                ctx.fillStyle = isHL ? '#e8c870' : '#6888b8'; ctx.fillRect(bx2, bz, bw, bd);
            });
            ctx.fillStyle = '#4ecdc4';
            npcs.forEach(n => { const [mx, mz] = tm(n.position.x, n.position.z); if (mx > 0 && mx < S && mz > 0 && mz < S) { ctx.beginPath(); ctx.arc(mx, mz, 2, 0, Math.PI * 2); ctx.fill(); } });
            const [px, pz] = tm(player.position.x, player.position.z);
            ctx.fillStyle = '#ff5555'; ctx.beginPath(); ctx.arc(px, pz, IS_MOB ? 4 : 5, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ff5555'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(px - Math.sin(playerYaw) * 10, pz - Math.cos(playerYaw) * 10); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = `${IS_MOB ? 8 : 9}px Inter,Arial`; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('N', S - 5, 5);
            ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1.5; ctx.beginPath(); rr(ctx, 1, 1, S - 2, S - 2, 11); ctx.stroke();
        }
        function rr(ctx, x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }

        /* ════════════════ CONTROLS ═════════════════════ */
        function setupControls() {
            window.addEventListener('keydown', e => { keys[e.code] = true; if (['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault(); });
            window.addEventListener('keyup', e => { keys[e.code] = false; });
            window.addEventListener('keydown', (e) => {
                if (e.code !== 'Escape') return;
                e.preventDefault();
                setEscMenuOpen(!escMenuOpen);
            });
            setupInteractPrompt();

            if (IS_QUEST) {
                // Quest tarayıcısında: VR'a girmeden önce dokunmatik kamera kontrolü
                document.getElementById('lock-overlay').classList.add('hidden');
                document.addEventListener('touchstart', e => {
                    if (G.gameRunning || xrActive) return;
                    Array.from(e.changedTouches).forEach(t => {
                        if (!LOOK.active) { LOOK.active = true; LOOK.id = t.identifier; LOOK.lx = t.clientX; LOOK.ly = t.clientY; }
                    });
                }, { passive: true });
                document.addEventListener('touchmove', e => {
                    if (G.gameRunning || xrActive) return;
                    Array.from(e.changedTouches).forEach(t => {
                        if (t.identifier === LOOK.id) {
                            playerYaw -= (t.clientX - LOOK.lx) * CFG.touchSens;
                            playerPitch += (t.clientY - LOOK.ly) * CFG.touchSens;
                            playerPitch = Math.max(-.45, Math.min(.95, playerPitch));
                            LOOK.lx = t.clientX; LOOK.ly = t.clientY;
                        }
                    });
                }, { passive: true });
                document.addEventListener('touchend', e => {
                    Array.from(e.changedTouches).forEach(t => {
                        if (t.identifier === LOOK.id) { LOOK.active = false; LOOK.id = -1; }
                    });
                }, { passive: true });
            } else if (!IS_MOB) {
                const ov = document.getElementById('lock-overlay');
                renderer.domElement.addEventListener('click', () => { if (!isLocked && !G.gameRunning) renderer.domElement.requestPointerLock(); });
                ov.addEventListener('click', () => { if (!isLocked) renderer.domElement.requestPointerLock(); });
                document.addEventListener('mousedown', e => {
                    if (e.button !== 2) return;
                    e.preventDefault();
                    if (isLocked) { document.exitPointerLock(); }
                    else if (!G.gameRunning) { renderer.domElement.requestPointerLock(); }
                });
                document.addEventListener('contextmenu', e => e.preventDefault());
                document.addEventListener('pointerlockchange', () => {
                    isLocked = document.pointerLockElement === renderer.domElement;
                    if (isLocked) { ov.classList.add('hidden'); }
                    else if (!G.gameRunning) { ov.classList.remove('hidden'); }
                });
                document.addEventListener('mousemove', e => { if (!isLocked) return; playerYaw -= e.movementX * CFG.mouseSens; playerPitch += e.movementY * CFG.mouseSens; playerPitch = Math.max(-.45, Math.min(.95, playerPitch)); });
            } else {
                document.getElementById('lock-overlay').classList.add('hidden');
                updateJoyBase();

                const isUI = t => {
                    let el = document.elementFromPoint(t.clientX, t.clientY);
                    while (el) {
                        const tag = el.tagName;
                        if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'A' || tag === 'SELECT' || tag === 'LABEL') return true;
                        const id2 = el.id || '';
                        if (['bldg-panel', 'lb-panel', 'mm-wrap', 'interact-prompt', 'score-modal', 'game-overlay', 'game-hud', 'game-quit-btn'].includes(id2)) return true;
                        if (el.classList && (el.classList.contains('bldg-item') || el.classList.contains('lb-tab') || el.classList.contains('lb-row') || el.classList.contains('ip-btns') || el.classList.contains('sm-card') || el.classList.contains('m-btn'))) return true;
                        el = el.parentElement;
                    }
                    return false;
                };

                document.addEventListener('touchstart', e => {
                    if (G.gameRunning) return;
                    if (Array.from(e.changedTouches).some(isUI)) return;
                    e.preventDefault();
                    Array.from(e.changedTouches).forEach(t => {
                        const isL = t.clientX < innerWidth * .45;
                        if (isL && !JOY.active) { JOY.active = true; JOY.id = t.identifier; updateJoyBase(); setJoyThumb(t.clientX, t.clientY); }
                        else if (!isL && !LOOK.active) { LOOK.active = true; LOOK.id = t.identifier; LOOK.lx = t.clientX; LOOK.ly = t.clientY; }
                    });
                }, { passive: false });

                document.addEventListener('touchmove', e => {
                    if (G.gameRunning) return;
                    if (Array.from(e.changedTouches).some(isUI)) return;
                    e.preventDefault();
                    Array.from(e.changedTouches).forEach(t => {
                        if (t.identifier === JOY.id) { setJoyThumb(t.clientX, t.clientY); }
                        else if (t.identifier === LOOK.id) {
                            const ddx = t.clientX - LOOK.lx, ddy = t.clientY - LOOK.ly;
                            playerYaw -= ddx * CFG.touchSens; playerPitch += ddy * CFG.touchSens;
                            playerPitch = Math.max(-.45, Math.min(.95, playerPitch));
                            LOOK.lx = t.clientX; LOOK.ly = t.clientY;
                        }
                    });
                }, { passive: false });

                document.addEventListener('touchend', e => {
                    if (G.gameRunning) return;
                    Array.from(e.changedTouches).forEach(t => {
                        if (t.identifier === JOY.id) resetJoy();
                        if (t.identifier === LOOK.id) { LOOK.active = false; LOOK.id = -1; }
                    });
                }, { passive: false });

                document.addEventListener('touchcancel', () => {
                    if (!G.gameRunning) { resetJoy(); LOOK.active = false; LOOK.id = -1; }
                });

                [['m-bldg-btn', 'bldg-panel', () => bldgTimer, v => bldgTimer = v],
                ['m-map-btn', 'mm-wrap', () => mapTimer, v => mapTimer = v],
                ['m-lb-btn', 'lb-panel', () => lbTimer, v => lbTimer = v]
                ].forEach(([btnId, panelId, getT, setT]) => {
                    document.getElementById(btnId).addEventListener('click', () => {
                        const p = document.getElementById(panelId);
                        clearTimeout(getT());
                        const op = !p.classList.contains('mob-open');
                        p.classList.toggle('mob-open', op);
                        if (op) { setT(setTimeout(() => p.classList.remove('mob-open'), 3000)); if (panelId === 'lb-panel') loadLeaderboard(currentLbGame); }
                    });
                });
            }

            document.getElementById('game-quit-btn').addEventListener('click', () => endGame(-1));
        }

        /* ════════════════ JOYSTICK ═════════════════════ */
        function updateJoyBase() { const b = document.getElementById('joy-base'); if (!b.offsetParent && !IS_MOB) return; const rect = b.getBoundingClientRect(); JOY.bx = rect.left + rect.width / 2; JOY.by = rect.top + rect.height / 2; JOY.baseEl = b; JOY.thumbEl = document.getElementById('joy-thumb'); }
        function setJoyThumb(cx, cy) { const dx = cx - JOY.bx, dy = cy - JOY.by, dist = Math.min(Math.sqrt(dx * dx + dy * dy), CFG.joyRadius), ang = Math.atan2(dy, dx), tx = Math.cos(ang) * dist, ty = Math.sin(ang) * dist; JOY.dx = tx / CFG.joyRadius; JOY.dy = ty / CFG.joyRadius; if (JOY.thumbEl) JOY.thumbEl.style.transform = `translate(calc(-50% + ${tx}px),calc(-50% + ${ty}px))`; }
        function resetJoy() { JOY.active = false; JOY.id = -1; JOY.dx = 0; JOY.dy = 0; if (JOY.thumbEl) JOY.thumbEl.style.transform = 'translate(-50%,-50%)'; }

        function setupEscMenu() {
            const backdrop = document.createElement('div');
            backdrop.id = 'esc-menu-backdrop';
            backdrop.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1200;';
            document.body.appendChild(backdrop);
            escMenuBackdrop = backdrop;

            const card = document.createElement('div');
            card.id = 'esc-menu-card';
            card.style.cssText = 'display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,760px);max-height:80vh;overflow:auto;background:#131a28;color:#eaf2ff;border:1px solid #2d3b59;border-radius:12px;z-index:1201;padding:14px;';
            card.innerHTML = `
                <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:10px;">
                  <div style="display:flex;gap:8px;">
                    <button data-esc-tab="leaderboard">🏆 Leaderboard</button>
                    <button data-esc-tab="online">🟢 Online</button>
                    <button data-esc-tab="map">🗺️ Harita</button>
                  </div>
                  <button id="esc-menu-close">Kapat ✕</button>
                </div>
                <div id="esc-menu-content"></div>
            `;
            document.body.appendChild(card);
            card.querySelectorAll('[data-esc-tab]').forEach((btn) =>
                btn.addEventListener('click', () => setEscTab(btn.dataset.escTab || 'leaderboard'))
            );
            card.querySelector('#esc-menu-close')?.addEventListener('click', () => setEscMenuOpen(false));
        }

        function setEscTab(tab) {
            escMenuTab = tab;
            const content = document.getElementById('esc-menu-content');
            if (!content) return;
            if (tab === 'leaderboard') {
                content.innerHTML = '<div>Sağdaki Leaderboard panelini kullanabilirsin.</div>';
            } else if (tab === 'online') {
                content.innerHTML = '<div id="esc-online-inline"></div>';
                const holder = content.querySelector('#esc-online-inline');
                if (holder) holder.innerHTML = (onlineUsers || []).map((u) => `<div>🟢 ${esc(u)}</div>`).join('') || '<div>Çevrimiçi kullanıcı yok</div>';
            } else {
                content.innerHTML = '<div>Harita sağ alttaki minimapte canlıdır.</div>';
            }
        }

        function setEscMenuOpen(open) {
            if (escMenuOpen === open) return;
            escMenuOpen = open;
            const b = document.getElementById('esc-menu-backdrop');
            const c = document.getElementById('esc-menu-card');
            if (b) b.style.display = open ? 'block' : 'none';
            if (c) c.style.display = open ? 'block' : 'none';
            if (open) setEscTab(escMenuTab);
        }

        function makeVrUiButton(label, action, y) {
            const cv = document.createElement('canvas');
            cv.width = 512;
            cv.height = 128;
            const c = cv.getContext('2d');
            c.fillStyle = 'rgba(20,30,48,.88)';
            c.fillRect(0, 0, cv.width, cv.height);
            c.strokeStyle = 'rgba(220,235,255,.6)';
            c.lineWidth = 4;
            c.strokeRect(4, 4, cv.width - 8, cv.height - 8);
            c.fillStyle = '#eaf2ff';
            c.font = 'bold 44px Arial';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(label, cv.width / 2, cv.height / 2);
            const tex = new THREE.CanvasTexture(cv);
            const mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(0.72, 0.18),
                new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
            );
            mesh.position.set(0, y, 0);
            mesh.userData.vrUiAction = action;
            return mesh;
        }

        function setupVrChessUi() {
            if (vrChessUiGroup) return;
            vrChessUiGroup = new THREE.Group();
            vrChessUiGroup.visible = false;
            scene.add(vrChessUiGroup);
            vrChessUiButtons = [makeVrUiButton('Oyna', 'start-local', 0.35)];
            vrChessUiButtons.forEach((b) => vrChessUiGroup.add(b));
            setVrChessUiMode('play');
        }

        function setVrChessUiMode(mode) {
            if (!vrChessUiGroup) return;
            if (mode === 'play') {
                vrChessUiButtons.forEach((b) => (b.visible = true));
            } else {
                vrChessUiButtons.forEach((b) => (b.visible = false));
            }
            vrChessUiHover = null;
        }

        function updateVrChessUi() {
            if (!vrChessUiGroup || !xrActive || G.gameRunning) {
                if (vrChessUiGroup) vrChessUiGroup.visible = false;
                vrChessUiHover = null;
                return;
            }
            const chessSpot = SPOTS.find((s) => s.game === 'ch');
            if (!chessSpot || !player) {
                vrChessUiGroup.visible = false;
                vrChessUiHover = null;
                return;
            }
            const dx = player.position.x - chessSpot.pos.x;
            const dz = player.position.z - chessSpot.pos.z;
            const near = Math.sqrt(dx * dx + dz * dz) < Math.max(9, CFG.interactDist + 2);
            if (!near) {
                vrChessUiGroup.visible = false;
                setVrChessUiMode('play');
                return;
            }
            pendingChessSpot = chessSpot;
            vrChessUiGroup.visible = true;
            vrChessUiGroup.position.set(chessSpot.pos.x, 2.5, chessSpot.pos.z - 1.8);
            vrChessUiGroup.lookAt(player.position.x, 2.0, player.position.z);

            if (xrCtrl1 && xrRaycaster) {
                const origin = new THREE.Vector3();
                const dir = new THREE.Vector3();
                xrCtrl1.getWorldPosition(origin);
                xrCtrl1.getWorldDirection(dir);
                dir.negate();
                xrRaycaster.set(origin, dir);
                const hits = xrRaycaster.intersectObjects(vrChessUiButtons.filter((b) => b.visible), false);
                vrChessUiHover = hits[0]?.object || null;
                vrChessUiButtons.forEach((b) => b.scale.setScalar(b === vrChessUiHover ? 1.06 : 1));
            }
        }

        function handleVrChessUiSelect() {
            if (!xrActive || !vrChessUiGroup?.visible || !vrChessUiHover || !pendingChessSpot) return false;
            const action = vrChessUiHover.userData?.vrUiAction;
            if (action === 'start-local') {
                setVrChessUiMode('play');
                startGame('ch', pendingChessSpot.id, pendingChessSpot.title, { mode: 'local' });
                return true;
            }
            return false;
        }

        function setupChessModeMenu() {
            const btn = document.createElement('button');
            btn.id = 'vr-chess-play-btn';
            btn.textContent = '♟️ Satranç Oyna';
            btn.style.cssText =
                'display:none;position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:1300;padding:12px 20px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(19,26,40,.92);color:#e8f0ff;font-weight:700;';
            btn.addEventListener('click', () => {
                if (!pendingChessSpot) return;
                startGame('ch', pendingChessSpot.id, pendingChessSpot.title, { mode: 'local' });
            });
            document.body.appendChild(btn);
            vrChessPlayBtn = btn;

            chessModeMenu = null;
        }

        function openChessModeMenu(spot) {
            pendingChessSpot = spot || pendingChessSpot;
        }

        function closeChessModeMenu() {}

        function updateVrChessPlayButton() {
            if (!vrChessPlayBtn) return;
            if (xrActive) {
                vrChessPlayBtn.style.display = 'none';
                return;
            }
            const chessSpot = SPOTS.find((s) => s.game === 'ch') || null;
            let nearChess = false;
            if (!G.gameRunning && chessSpot && player) {
                const dx = player.position.x - chessSpot.pos.x;
                const dz = player.position.z - chessSpot.pos.z;
                nearChess = Math.sqrt(dx * dx + dz * dz) < Math.max(9, CFG.interactDist + 2);
            }
            const shouldShow = nearChess;
            pendingChessSpot = shouldShow ? chessSpot : pendingChessSpot;
            vrChessPlayBtn.style.display = shouldShow ? 'block' : 'none';
            if (!shouldShow) closeChessModeMenu();
        }

        function createRemotePlayer(data) {
            if (!data?.id || data.id === localPlayerId || remotePlayers.has(data.id)) return;
            const avatar = makeHuman(0x3f8efc, 0x1a2a3a);
            avatar.position.set(Number(data.x) || 0, Number(data.y) || 0, Number(data.z) || 108);
            avatar.rotation.y = Number(data.yaw) || 0;
            scene.add(avatar);
            remotePlayers.set(data.id, avatar);
        }

        function removeRemotePlayer(id) {
            const avatar = remotePlayers.get(id);
            if (!avatar) return;
            avatar.removeFromParent();
            remotePlayers.delete(id);
        }

        function updateRemotePlayers(dt) {
            remotePlayers.forEach((avatar) => walkAnim(avatar, dt, false));
        }

        function setupOnlineUsersPanel() {
            const panel = document.createElement('div');
            panel.id = 'online-users-panel';
            panel.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:999;background:rgba(15,22,35,.82);color:#dfe8ff;padding:8px 10px;border:1px solid rgba(255,255,255,.15);border-radius:8px;max-width:220px;font-size:12px;display:none;';
            document.body.appendChild(panel);
            onlineUsersPanel = panel;
        }

        function renderOnlineUsersPanel() {
            if (!onlineUsersPanel) return;
            const items = (onlineUsers || []).slice(0, 50);
            onlineUsersPanel.innerHTML = `<div style="font-weight:700;margin-bottom:4px;">Online (${items.length})</div>${items.length ? items.map((u) => `<div>🟢 ${esc(u)}</div>`).join('') : '<div>Yok</div>'}`;
            onlineUsersPanel.style.display = items.length ? 'block' : 'none';
        }

        function connectMultiplayer() {
            if (mpClient || !localSessionToken) return;
            mpClient = createMultiplayerClient(
                { nickname: localUsername, username: localUsername, sessionToken: localSessionToken },
                {
                    onSelfInit: ({ id, players }) => {
                        localPlayerId = id;
                        (players || []).forEach((p) => createRemotePlayer(p));
                    },
                    onPlayerJoined: (p) => createRemotePlayer(p),
                    onPlayerMoved: (p) => {
                        if (!p || p.id === localPlayerId) return;
                        if (!remotePlayers.has(p.id)) createRemotePlayer(p);
                        const avatar = remotePlayers.get(p.id);
                        if (!avatar) return;
                        avatar.position.set(Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 108);
                        avatar.rotation.y = Number(p.yaw) || 0;
                    },
                    onPlayerLeft: (id) => removeRemotePlayer(id),
                    onOnlineUsers: (users) => {
                        onlineUsers = users || [];
                        renderOnlineUsersPanel();
                        if (escMenuOpen && escMenuTab === 'online') setEscTab('online');
                    },
                    onAuthError: (msg) => {
                        console.warn('Multiplayer auth error:', msg);
                    },
                    onChessReady: (payload) => {
                        if (currentGame?.onChessReady) currentGame.onChessReady(payload);
                    },
                    onChessMove: (payload) => {
                        if (currentGame?.onChessMove) currentGame.onChessMove(payload);
                    },
                    onChessEnded: () => {
                        if (currentGame?.onChessEnded) currentGame.onChessEnded();
                    }
                }
            );
        }

        function syncLocalPlayerMove(dt) {
            if (!mpClient || !player || G.gameRunning) return;
            moveSyncT += dt;
            if (moveSyncT < 0.08) return;
            moveSyncT = 0;
            mpClient.sendMove({
                x: player.position.x,
                y: player.position.y,
                z: player.position.z,
                yaw: playerYaw,
                running: isRunning
            });
        }


        /* ════════════════════════════════════════════════
           ══ LEADERBOARD (PostgreSQL API) ═════════════
        ════════════════════════════════════════════════ */
        let currentLbGame = 'masa_tenisi';
        let lbBodyOpen = true;

        async function loadLeaderboard(game) {
            currentLbGame = game;
            const list = document.getElementById('lb-list');
            list.innerHTML = '<div id="lb-loading">Yükleniyor…</div>';
            let data = null;
            try {
                data = await getLeaderboard(game);
            } catch (e) {
                data = null;
            }
            if (!data) {
                list.innerHTML = '<div class="lb-empty">Bağlantı yok (API/DB erişilemiyor)</div>'; return;
            }
            if (!data.length) { list.innerHTML = '<div class="lb-empty">Henüz kayıt yok! İlk sen ol 🏅</div>'; return; }
            list.innerHTML = data.map((row, i) => `
                    <div class="lb-row">
                      <span class="lb-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                      <span class="lb-name">${esc(row.player_name)}</span>
                      <span class="lb-score">${row.score}</span>
                    </div>`).join('');
        }

        function setupLeaderboard() {
            document.querySelectorAll('.lb-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    loadLeaderboard(tab.dataset.game);
                });
            });
            document.getElementById('lb-toggle-btn').addEventListener('click', () => {
                lbBodyOpen = !lbBodyOpen;
                document.getElementById('lb-body').style.display = lbBodyOpen ? 'block' : 'none';
                document.getElementById('lb-toggle-btn').textContent = lbBodyOpen ? '▲' : '▼';
            });
        }

        /* ════════════════════════════════════════════════
           ══ SCORE MODAL ══════════════════════════════
        ════════════════════════════════════════════════ */
        let pendingGame = null, pendingScore = 0;

        function showScoreModal(gameId, gameTitle, score) {
            pendingGame = gameId; pendingScore = score;
            document.getElementById('sm-game-name').textContent = gameTitle + ' – Oyun Bitti!';
            document.getElementById('sm-score-val').textContent = score;
            document.getElementById('sm-name').value = '';
            document.getElementById('sm-rank-info').className = ''; document.getElementById('sm-rank-info').textContent = '';
            document.getElementById('sm-close-btn').className = '';
            document.getElementById('sm-save').style.display = '';
            document.getElementById('sm-skip').style.display = '';
            document.getElementById('score-modal').classList.add('active');
        }

        function setupScoreModal() {
            document.getElementById('sm-save').addEventListener('click', async () => {
                const name = document.getElementById('sm-name').value.trim();
                if (!name) { document.getElementById('sm-name').focus(); return; }
                document.getElementById('sm-save').textContent = 'Kaydediliyor…';
                document.getElementById('sm-save').disabled = true;
                try {
                    await saveScore(pendingGame, name, pendingScore);
                    const rankRes = await getRank(pendingGame, pendingScore).catch(() => null);
                    const rank = rankRes?.rank || null;
                    document.getElementById('sm-save').style.display = 'none';
                    document.getElementById('sm-skip').style.display = 'none';
                    const ri = document.getElementById('sm-rank-info');
                    if (rank === 1) ri.textContent = '🥇 Tebrikler! 1. sıradasın!';
                    else if (rank === 2) ri.textContent = '🥈 Harika! 2. sıradasın!';
                    else if (rank === 3) ri.textContent = '🥉 Güzel! 3. sıradasın!';
                    else if (rank) ri.textContent = `🎉 ${rank}. sıradasın!`;
                    else ri.textContent = '✅ Kaydedildi!';
                    ri.classList.add('visible');
                    document.getElementById('sm-close-btn').classList.add('visible');
                    loadLeaderboard(pendingGame);
                    document.querySelectorAll('.lb-tab').forEach(t => { if (t.dataset.game === pendingGame) { t.click(); } });
                } catch (err) {
                    console.error('Skor kaydetme hatası:', err);
                    const ri = document.getElementById('sm-rank-info');
                    ri.textContent = `❌ Kaydedilemedi: ${err.message || err}`;
                    ri.classList.add('visible');
                    document.getElementById('sm-save').textContent = 'Kaydet 💾';
                    document.getElementById('sm-save').disabled = false;
                }
            });

            document.getElementById('sm-skip').addEventListener('click', () => {
                document.getElementById('score-modal').classList.remove('active');
                if (!IS_MOB && !G.gameRunning) setTimeout(() => renderer.domElement.requestPointerLock(), 300);
            });
            document.getElementById('sm-close-btn').addEventListener('click', () => {
                document.getElementById('score-modal').classList.remove('active');
                document.getElementById('sm-save').textContent = 'Kaydet 💾'; document.getElementById('sm-save').disabled = false;
                if (!IS_MOB && !G.gameRunning) setTimeout(() => renderer.domElement.requestPointerLock(), 300);
            });
        }

        /* ════════════════════════════════════════════════
           ══ MINI GAME ENGINE ═════════════════════════
        ════════════════════════════════════════════════ */
        let currentGame = null, currentGameId = null, currentGameTitle = null;
        function setupMiniGames() { setupScoreModal(); }

        function startGame(type, id, title, options = {}) {
            // Not: VR satrançta createVrChess hata verirse NPC'ler durup oyun boş kalmasın diye
            // gameRunning'i satranç kurulumundan sonra kesinleştiriyoruz.
            const startingVrChess = type === 'ch' && xrActive;
            if (!startingVrChess) G.gameRunning = true;
            currentGameId = id;
            currentGameTitle = title;
            closeChessModeMenu();
            if (IS_MOB) {
                resetJoy(); LOOK.active = false; LOOK.id = -1;
                ['joy-base', 'joy-label', 'm-bldg-btn', 'm-map-btn', 'm-lb-btn'].forEach(id2 => {
                    const el = document.getElementById(id2); if (el) el.style.display = 'none';
                });
            }
            const overlay = document.getElementById('game-overlay');
            const isVrChess = type === 'ch' && xrActive;
            if (!isVrChess) overlay.classList.add('active');
            const canvas = document.getElementById('game-canvas');
            const W = Math.min(IS_MOB ? innerWidth * .98 : 600, innerWidth * .98);
            const H = Math.min(IS_MOB ? innerHeight * .7 : 420, innerHeight * .72);
            canvas.width = W; canvas.height = H;
            canvas.style.width = W + 'px'; canvas.style.height = H + 'px';

            if (type === 'tt') currentGame = new TableTennis(canvas, W, H, endGame);
            else if (type === 'fb') currentGame = new FlappyBird(canvas, W, H, endGame);
            else if (type === 'ft') currentGame = new Penalti(canvas, W, H, endGame);
            else if (type === 'ok') currentGame = new Archery(canvas, W, H, endGame);
            else if (type === 'bk') currentGame = new Basketball(canvas, W, H, endGame);
            else if (type === 'ch' && !xrActive) {
                const mode = options.mode || 'local';
                currentGame = new ChessGame(canvas, W, H, endGame, {
                    mode,
                    localPlayerId,
                    multiplayer: mode === 'pvp' && mpClient
                        ? {
                              joinChess: () => mpClient.joinChess?.(),
                              sendChessMove: (move) => mpClient.sendChessMove?.(move)
                          }
                        : null
                });
            } else if (type === 'ch' && xrActive) {
                const mode = options.mode || 'local';
                try {
                    clearVrChess();
                    const chSpot = SPOTS.find((s) => s.game === 'ch')?.pos || { x: 10, z: 42 };
                    currentGame = { mode, destroy() {} };
                    vrChessStandalone = new VrChessStandalone({
                        scene,
                        anchor: {
                            x: chSpot.x,
                            y: 1.25,
                            z: chSpot.z,
                            yaw: 0
                        },
                        onEnd: (sc) => endGame(sc)
                    });
                    vrChessStandalone.mount();
                    if (mode === 'pvp') mpClient?.joinChess?.();
                    G.gameRunning = true;
                } catch (err) {
                    console.error('VR chess start failed:', err);
                    clearVrChess();
                    currentGame = null;
                    G.gameRunning = false;
                    return;
                }
            }

            currentGame?.start?.();
        }

        function endGame(score = -1) {
            if (G.gameRaf) { cancelAnimationFrame(G.gameRaf); G.gameRaf = null; }
            if (score === -1 && currentGame) {
                if (currentGame.totalScore !== undefined) score = currentGame.totalScore;
                else if (currentGame.score !== undefined) score = currentGame.score;
                else if (currentGame.goals !== undefined) score = currentGame.goals * 10;
                else if (currentGame.points !== undefined) score = currentGame.points;
            }
            if (currentGame) { currentGame.destroy(); currentGame = null; }
            document.getElementById('game-overlay').classList.remove('active');
            clearVrChess();
            G.gameRunning = false;
            activeSpot = null;
            if (IS_MOB) {
                document.getElementById('joy-base').style.display = 'block';
                document.getElementById('joy-label').style.display = 'block';
                ['m-bldg-btn', 'm-map-btn', 'm-lb-btn'].forEach(id2 => {
                    const el = document.getElementById(id2); if (el) el.style.display = 'block';
                });
            }
            if (score >= 0) showScoreModal(currentGameId, currentGameTitle, score);
        }

        /* ════════════════ YARDIMCI FONKSİYONLAR ═══════ */
        function inBldg(x, z, m) { for (const b of buildingAABBs) if (x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m) return true; return false; }
        function w2s(wx, wy, wz) { const v = new THREE.Vector3(wx, wy, wz).project(camera); if (v.z > 1) return null; return { x: (v.x * .5 + .5) * innerWidth, y: (-v.y * .5 + .5) * innerHeight }; }
        function bx(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
        function cl(rt, rb, h, seg, color, x, y, z) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), new THREE.MeshLambertMaterial({ color })); m.position.set(x, y, z); m.castShadow = !IS_MOB; return m; }
        function dk(hex, f) { return (Math.floor(((hex >> 16) & 0xff) * f) << 16) | (Math.floor(((hex >> 8) & 0xff) * f) << 8) | Math.floor((hex & 0xff) * f); }
        function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
        function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

        let campusStarted = false;

        export async function startCampusExperience(username = 'Oyuncu', sessionToken = '') {
            if (campusStarted) return;
            campusStarted = true;
            localUsername = String(username || 'Oyuncu');
            localSessionToken = String(sessionToken || '');
            document.getElementById('welcome').style.display = 'none';
            try {
                await initGame();
                initAudio();
                connectMultiplayer();
                if (!IS_MOB && !IS_QUEST) {
                    const lockPromise = renderer.domElement.requestPointerLock();
                    if (lockPromise instanceof Promise) {
                        lockPromise.catch(() => {
                            document.getElementById('lock-overlay').classList.remove('hidden');
                        });
                    }
                }
                if (IS_QUEST) {
                    // Quest'te pointer lock overlay'ini gizle
                    document.getElementById('lock-overlay').classList.add('hidden');
                }
            } catch (err) {
                campusStarted = false;
                console.error('Oyun başlatma hatası:', err);
                document.getElementById('welcome').style.display = 'flex';
                alert('Oyun başlatılırken hata oluştu: ' + err.message);
            }
        }

        /* Fallback: auth UI yoksa eski butonla başlat */
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                startCampusExperience();
            });
        }
