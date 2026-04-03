'use strict';

import * as THREE from 'three';
import {
    IS_QUEST, IS_MOB, CFG, DIALOGUES, BUILDINGS, SPOTS, NPC_COLORS,
    VR_WALK_SPEED, VR_TURN_SPEED, VR_DEADZONE, SNAP_ANGLE
} from './config.js';
import { applyPlatformDom } from './platform.js';
import { initAudio, playBowDraw, playArrowShoot, playMurmur, playBeep, audio, setChessAudioVrBoost } from './audio.js';
import { TableTennis, FlappyBird, Penalti, Archery, Basketball } from './minigames/games.js';
import { ChessGame } from './minigames/chess-game.js';
import { VrChessStandalone } from './minigames/vr-chess-standalone.js';
import { G } from './runtime.js';
import { addUniversityMainGate, updateUniversityGateAnimations } from './university-gate.js';
import { getLeaderboard, saveScore, getRank } from './api.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { createMultiplayerClient } from './multiplayer.js';

        applyPlatformDom();

        // Gap Yenev: Blender referansı — merkez daire + üç kanat (dış yay, iç yay, hub arası yay), 120° simetri.
        (function initGapYenevTriskelionMapPolygon() {
            const spec = BUILDINGS.find((b) => b.name === 'Gap Yenev');
            if (!spec) return;
            const cx = 36;
            const cz = 50;
            const rot = -Math.PI / 6;
            const cosR = Math.cos(rot);
            const sinR = Math.sin(rot);
            const toWorld = (lx, lz) => ({
                x: cx + lx * cosR - lz * sinR,
                z: cz + lx * sinR + lz * cosR
            });

            const R_hub = 2.6;
            const R_inner = 4.0;
            const R_outer = 11;
            const alpha = 0.4;
            const TAU = Math.PI * 2;
            const nHub = 10;
            const nInner = 14;
            const nOuter = 22;
            const nRad = 1;

            const pts = [];
            const push = (lx, lz) => pts.push(toWorld(lx, lz));
            const pushArc = (r, a0, a1, nSeg, skipFirst) => {
                for (let i = skipFirst ? 1 : 0; i <= nSeg; i++) {
                    const t = i / nSeg;
                    const a = a0 + (a1 - a0) * t;
                    push(r * Math.cos(a), r * Math.sin(a));
                }
            };
            const pushRadial = (r0, r1, ang, skipFirst) => {
                for (let i = skipFirst ? 1 : 0; i <= nRad; i++) {
                    const t = i / nRad;
                    const r = r0 + (r1 - r0) * t;
                    push(r * Math.cos(ang), r * Math.sin(ang));
                }
            };

            for (let k = 0; k < 3; k++) {
                const phi = k * (TAU / 3);
                const phiPrev = phi - TAU / 3;
                pushArc(R_hub, phiPrev - alpha, phi - alpha, nHub, pts.length > 0);
                pushRadial(R_hub, R_inner, phi - alpha, false);
                pushArc(R_inner, phi - alpha, phi + alpha, nInner, true);
                pushRadial(R_inner, R_outer, phi + alpha, true);
                pushArc(R_outer, phi + alpha, phi - alpha, nOuter, true);
                pushRadial(R_outer, R_hub, phi - alpha, true);
            }

            spec.mapPolygon = pts;
            let sx = 0;
            let sz = 0;
            pts.forEach((p) => { sx += p.x; sz += p.z; });
            spec.x = sx / pts.length;
            spec.z = sz / pts.length;
        })();

        /* ════════════════ STATE ════════════════════════ */
        let renderer, scene, camera;
        let player, playerYaw = 0, playerPitch = 0.18;
        let npcs = [], buildingAABBs = [], activeBubbles = [], proxLabels = [];
        // Bazı objeler (örn. dairesel anıt) için daha doğal çarpışma: XZ düzleminde daire.
        let circleColliders = [];
        let highlightIdx = -1, blinkOn = true, blinkTimer = 0;
        let universityGateRoot = null;
        let keys = {}, isLocked = false;
        let mmCtx, mmSize = 165, lastT = 0;
        let bldgTimer = null, mapTimer = null, lbTimer = null;
        let activeSpot = null;
        let mainRafId = 0;
        let localNickname = 'Oyuncu';
        let localSessionToken = '';
        let localPlayerId = null;
        let localUserId = null;
        let mpClient = null;
        let remotePlayers = new Map();
        let onlineUsers = [];
        let onlineUsersPanel = null;
        const onlineChess = {
            queued: false,
            waitingPlayer: null,
            totalWaiting: 0,
            matchId: null,
            myColor: null,
            white: null,
            black: null,
            active: false,
            lastState: null
        };
        let chessQueueLastRequestAt = 0;
        let chessExitConfirmEl = null;
        let chessExitConfirmOpen = false;
        let vrChessExitWindow = null;
        let vrChessExitCanvas = null;
        let vrChessExitCtx = null;
        let vrChessExitTexture = null;
        let vrChessExitPointerLeft = null;
        let vrChessExitPointerRight = null;
        let vrChessResultWindow = null;
        let vrChessResultCanvas = null;
        let vrChessResultCtx = null;
        let vrChessResultTexture = null;
        let vrChessResultPointerLeft = null;
        let vrChessResultPointerRight = null;
        let vrChessResultOpen = false;
        let vrChessResultText = '';
        let vrChessResultSub = '';
        let chessNotifyEl = null;
        let chessNotifyTimer = null;
        let chessResultEl = null;
        let chessResultOpen = false;
        let escMenuOpen = false;
        let escMenuBackdrop = null;
        let escMenuCard = null;
        let escMenuTab = 'leaderboard';
        const escTabs = ['leaderboard', 'online', 'map'];
        const lbGames = [
            { id: 'masa_tenisi', label: '🏓' },
            { id: 'flappy_bird', label: '🐦' },
            { id: 'penalti', label: '⚽' },
            { id: 'okculuk', label: '🏹' },
            { id: 'basket', label: '🏀' },
            { id: 'satranc', label: '♟️' }
        ];
        let escMapCanvas = null;
        let escMapCtx = null;
        let escMapSize = 420;
        let escMapBuildingList = null;
        let vrMenuToggleLatch = false;
        let prevClickLeft = false;
        let prevClickRight = false;
        let prevAltGripLeft = false;
        let prevAltGripRight = false;
        let vrInputCooldownUntil = 0;
        let vrMenuPointerLeft = null;
        let vrMenuPointerRight = null;
        let vrSpotPointerLeft = null;
        let vrSpotPointerRight = null;
        let vrMenuLbScroll = 0;
        let vrMenuOnlineScroll = 0;
        let vrMenuMapScroll = 0;
        let vrMenuDragLeft = null;
        let vrMenuDragRight = null;
        let vrMenuMoveLeft = null;
        let vrMenuMoveRight = null;
        let vrMenuAngle = 0;
        let vrMenuTargetAngle = 0;
        let vrMenuHeight = 1.5;
        let vrMenuTargetHeight = 1.5;
        const vrMenuRadius = 2.15;
        let suppressLockOverlay = false;
        let vrMenuWindow = null;
        let vrMenuCanvas = null;
        let vrMenuCtx = null;
        let vrMenuTexture = null;
        let vrSpotWindow = null;
        let vrSpotCanvas = null;
        let vrSpotCtx = null;
        let vrSpotTexture = null;
        let vrCharWindow = null;
        let vrCharCanvas = null;
        let vrCharCtx = null;
        let vrCharTexture = null;
        let vrCharPointerLeft = null;
        let vrCharPointerRight = null;
        let vrCharOpen = false;
        let vrCharToggleLatch = false;
        let vrCharMannequin = null;

        const FACE_PRESETS = [
            { id: 'neutral', label: '🙂 Nötr' },
            { id: 'happy', label: '😄 Mutlu' },
            { id: 'angry', label: '😠 Kızgın' },
            { id: 'sad', label: '😢 Üzgün' },
        ];
        const BODY_COLORS = [
            { id: 'blue', label: 'Mavi', hex: 0x1a4f8a },
            { id: 'red', label: 'Kırmızı', hex: 0xb93434 },
            { id: 'green', label: 'Yeşil', hex: 0x2f8a52 },
            { id: 'purple', label: 'Mor', hex: 0x6c3fb3 },
            { id: 'yellow', label: 'Sarı', hex: 0xc9a030 },
            { id: 'white', label: 'Beyaz', hex: 0xe0e6ef },
        ];
        // "pending": UI'de seçilen ama henüz uygulanmamış görünüm (önizleme + manken)
        // "applied": oyuncuya ve multiplayer'a gönderilen görünüm
        const appearancePending = { faceIdx: 0, bodyIdx: 0 };
        const appearanceApplied = { faceIdx: 0, bodyIdx: 0 };
        let waypointTargetIdx = -1;
        let waypointMarker = null;
        let netTimer = 0;
        let ballNetTimer = 0;
        let jumpVel = 0;
        let isJumping = false;
        let isRunning = false;

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
        let xrSupported = false;
        let xrLeftHand = null, xrRightHand = null;
        let xrHandsLoaded = false;
        let xrHandModelLoadPromise = null;
        let xrCtrl0Handedness = '';
        let xrCtrl1Handedness = '';
        const xrHandMixers = [];
        const xrHandClock = new THREE.Clock();
        let xrGrabbedLeft = null, xrGrabbedRight = null;
        const vrGrabbables = [];
        const vrThrownBodies = [];
        const vrBallsById = new Map();
        const ctrlTrack = {
            left: { prevPos: null, curPos: new THREE.Vector3(), velocity: new THREE.Vector3() },
            right: { prevPos: null, curPos: new THREE.Vector3(), velocity: new THREE.Vector3() }
        };
        const vrMenuLookTarget = new THREE.Vector3();
        let webHandPreviewState = null;
        let handEnvMap = null;
        let handTextureSet = null;
        let vrChessStandalone = null;
        /** Son başlatılan VR satranç çevrimiçi maç mıydı? (yerel bitiş paneli yanlış tetiklenmesin) */
        let lastVrChessWasOnlinePvp = false;
        let hasVrSessionSpawned = false;
        // VR'da göz seviyesi: biraz daha yukarı (daha rahat görüş).
        const VR_RIG_EYE_OFFSET = 0.42;

        function resetVrTransientInputState() {
            prevClickLeft = true;
            prevClickRight = true;
            prevAltGripLeft = false;
            prevAltGripRight = false;
            vrInputCooldownUntil = performance.now() + 600;
            vrMenuDragLeft = null;
            vrMenuDragRight = null;
            vrMenuMoveLeft = null;
            vrMenuMoveRight = null;
            vrMenuPointerLeft = null;
            vrMenuPointerRight = null;
            vrSpotPointerLeft = null;
            vrSpotPointerRight = null;
            vrMenuToggleLatch = false;
            vrCharPointerLeft = null;
            vrCharPointerRight = null;
            vrCharToggleLatch = false;
        }

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

        function makeProceduralHandTextures() {
            if (handTextureSet) return handTextureSet;
            const size = 512;
            const makeCanvasTex = () => {
                const c = document.createElement('canvas');
                c.width = size;
                c.height = size;
                return c;
            };

            const albedoCanvas = makeCanvasTex();
            const roughCanvas = makeCanvasTex();
            const aCtx = albedoCanvas.getContext('2d');
            const rCtx = roughCanvas.getContext('2d');

            const baseGrad = aCtx.createLinearGradient(0, 0, size, size);
            baseGrad.addColorStop(0, '#f2d2bc');
            baseGrad.addColorStop(0.45, '#e9c8b0');
            baseGrad.addColorStop(1, '#cfae9a');
            aCtx.fillStyle = baseGrad;
            aCtx.fillRect(0, 0, size, size);
            rCtx.fillStyle = '#b9b9b9';
            rCtx.fillRect(0, 0, size, size);

            for (let i = 0; i < 5200; i++) {
                const x = Math.random() * size;
                const y = Math.random() * size;
                const r = 0.3 + Math.random() * 1.6;
                const pore = 188 + Math.floor(Math.random() * 42);
                aCtx.fillStyle = `rgba(${pore},${Math.max(112, pore - 55)},${Math.max(86, pore - 78)},0.06)`;
                aCtx.beginPath();
                aCtx.arc(x, y, r, 0, Math.PI * 2);
                aCtx.fill();
                const rough = 138 + Math.floor(Math.random() * 68);
                rCtx.fillStyle = `rgba(${rough},${rough},${rough},0.05)`;
                rCtx.beginPath();
                rCtx.arc(x, y, r * 0.85, 0, Math.PI * 2);
                rCtx.fill();
            }

            aCtx.globalAlpha = 0.08;
            aCtx.strokeStyle = '#9f7048';
            aCtx.lineWidth = 1.2;
            for (let y = 18; y < size; y += 20) {
                aCtx.beginPath();
                aCtx.moveTo(0, y + Math.sin(y * 0.08) * 3.2);
                for (let x = 0; x <= size; x += 16) {
                    aCtx.lineTo(x, y + Math.sin((x + y) * 0.07) * 3.2);
                }
                aCtx.stroke();
            }
            aCtx.globalAlpha = 1;

            const normalSize = 256;
            const normalData = new Uint8Array(normalSize * normalSize * 4);
            for (let y = 0; y < normalSize; y++) {
                for (let x = 0; x < normalSize; x++) {
                    const i = (y * normalSize + x) * 4;
                    const nx = 128 + Math.floor((Math.random() - 0.5) * 16);
                    const ny = 128 + Math.floor((Math.random() - 0.5) * 16);
                    const nz = 255;
                    normalData[i] = nx;
                    normalData[i + 1] = ny;
                    normalData[i + 2] = nz;
                    normalData[i + 3] = 255;
                }
            }

            const albedo = new THREE.CanvasTexture(albedoCanvas);
            const roughness = new THREE.CanvasTexture(roughCanvas);
            const normal = new THREE.DataTexture(normalData, normalSize, normalSize, THREE.RGBAFormat);
            [albedo, roughness, normal].forEach((t) => {
                t.wrapS = THREE.RepeatWrapping;
                t.wrapT = THREE.RepeatWrapping;
                t.repeat.set(2.6, 2.3);
                t.needsUpdate = true;
            });

            handTextureSet = { albedo, roughness, normal };
            return handTextureSet;
        }

        function createHandSkinMaterial({
            tone = 0xe9c8b0,
            roughness = 0.58,
            normalScale = 0.42,
            envMapIntensity = 0.14,
            emissiveIntensity = 0.022
        } = {}) {
            const tex = makeProceduralHandTextures();
            return new THREE.MeshStandardMaterial({
                color: tone,
                map: tex.albedo,
                roughnessMap: tex.roughness,
                normalMap: tex.normal,
                roughness,
                metalness: 0.02,
                normalScale: new THREE.Vector2(normalScale, normalScale),
                envMap: handEnvMap || null,
                envMapIntensity,
                emissive: 0x1a0f08,
                emissiveIntensity
            });
        }

        function initHandEnvironment() {
            if (!renderer || handEnvMap) return;
            const pmrem = new THREE.PMREMGenerator(renderer);
            pmrem.compileEquirectangularShader();
            handEnvMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
            pmrem.dispose();
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
            if (IS_QUEST) renderer.xr.setFramebufferScaleFactor(1.25);

            /* ── 2) Oyuncu kafesi (rig) oluştur ──────── */
            xrRig = new THREE.Group();
            xrRig.position.set(
                player ? player.position.x : 0,
                0,
                player ? player.position.z : 108
            );
            scene.add(xrRig);

            /* ── 3) Kontrolcüleri (el) ekle ───────────── */
            xrCtrl0 = renderer.xr.getController(0);
            xrCtrl1 = renderer.xr.getController(1);
            xrRig.add(xrCtrl0);
            xrRig.add(xrCtrl1);
            xrGrip0 = renderer.xr.getControllerGrip(0);
            xrGrip1 = renderer.xr.getControllerGrip(1);
            xrRig.add(xrGrip0);
            xrRig.add(xrGrip1);
            /* ── 4) Controller modelleri (el) ──────────── */
            xrCtrl0.clear();
            xrCtrl1.clear();
            // Ray çizgisini tekrar ekle (clear sonrası silindi)
            [xrCtrl0, xrCtrl1].forEach(ctrl => {
                const lineGeo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, -0.01, -0.03),
                    new THREE.Vector3(0, 0, -2)
                ]);
                ctrl.add(new THREE.Line(lineGeo,
                    new THREE.LineBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.9 })));
            });
            xrLeftHand = null;
            xrRightHand = null;
            initVRHands();

            /* ── 5) VR etkileşim (select / squeeze) ── */
            const onXrSelectStart = (ev) => {
                const ctrl = ev.target;
                if (vrChessStandalone && G.gameRunning && vrChessStandalone.onSelectStart(ctrl)) return;
                if (!activeSpot) return;
                // Satranç: sadece tetik + A/X (updateVRMovement) ile başlar; yanlışlıkla tetikleme olmasın
                if (activeSpot.game === 'ch') return;
                document.getElementById('interact-prompt').style.display = 'none';
                startGame(activeSpot.game, activeSpot.id, activeSpot.title);
            };
            xrCtrl0.addEventListener('selectstart', onXrSelectStart);
            xrCtrl1.addEventListener('selectstart', onXrSelectStart);
            const onXrSelectEnd = () => {
                if (vrChessStandalone && G.gameRunning) vrChessStandalone.onSelectEnd();
            };
            xrCtrl0.addEventListener('selectend', onXrSelectEnd);
            xrCtrl1.addEventListener('selectend', onXrSelectEnd);

            /* ── 6) VR oturum olayları ───────────────── */
            renderer.xr.addEventListener('sessionstart', () => {
                xrActive = true;
                setChessAudioVrBoost(true);
                resetVrTransientInputState();
                stopNonVRLoop();

                const xrSession = renderer.xr.getSession();
                if (xrSession) {
                    xrSession.addEventListener('visibilitychange', () => {
                        resetVrTransientInputState();
                    });
                    xrSession.addEventListener('inputsourceschange', () => {
                        resetVrTransientInputState();
                    });
                }

                // Kamerayı scene'den çıkar → xrRig'e bağla
                scene.remove(camera);
                xrRig.add(camera);
                // local-floor ile y=0 zemin seviyesi, headset kendi yüksekliğini ekler
                camera.position.set(0, 0, 0);
                camera.rotation.set(0, 0, 0);

                // İlk VR girişinde kapı önünden başlat; sonraki girişlerde kaldığın yerden devam et.
                let targetX = player ? player.position.x : 0;
                let targetZ = player ? player.position.z : 108;
                let targetYaw = playerYaw;

                // Eğer kullanıcı zaten kampüste başka bir yerdeyse (browser modunda göründüğü yer),
                // VR'a girerken kesinlikle aynı yerden başlamalı.
                const hasMovedFromDefaultSpawn = !!(player && (
                    Math.abs(player.position.x - 0) > 0.5 || Math.abs(player.position.z - 108) > 0.5
                ));

                if (!hasMovedFromDefaultSpawn && !hasVrSessionSpawned && universityGateRoot?.position) {
                    targetX = universityGateRoot.position.x;
                    // Kapının güneyinde biraz daha geriden başlat (kapıyı net görsün)
                    targetZ = universityGateRoot.position.z + 22;
                    // Güneyden kapıya dönük başlasın (ilk bakışta kapı karşıda)
                    targetYaw = Math.PI;
                }
                hasVrSessionSpawned = true;

                xrRig.position.set(targetX, VR_RIG_EYE_OFFSET, targetZ);
                xrRig.rotation.y = targetYaw;
                playerYaw = targetYaw;
                if (xrLeftHand) xrLeftHand.visible = true;
                if (xrRightHand) xrRightHand.visible = true;

                // 1. şahıs: oyuncu modelini gizle ve rig ile senkronla
                if (player) {
                    player.position.set(targetX, 0, targetZ);
                    player.visible = false;
                }

                // HTML overlay'leri gizle (VR'da görünmezler ama temizlik)
                hideHTMLForVR(true);
                initVrMenuWindow();
                initVrSpotWindow();
                setVrCharOpen(false);
                vrMenuAngle = 0;
                vrMenuTargetAngle = 0;
                vrMenuHeight = 1.5;
                vrMenuTargetHeight = 1.5;
                updateVrMenuTransform(1 / 60);
                if (vrMenuWindow) vrMenuWindow.visible = escMenuOpen;
                if (vrSpotWindow) vrSpotWindow.visible = false;
                if (vrCharWindow) vrCharWindow.visible = false;

                renderer.setAnimationLoop(loop);
                console.log('VR oturumu başladı – 1. şahıs modu');
            });

            renderer.xr.addEventListener('sessionend', () => {
                xrActive = false;
                setChessAudioVrBoost(false);
                resetVrTransientInputState();
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
                if (vrMenuWindow) vrMenuWindow.visible = false;
                if (vrSpotWindow) vrSpotWindow.visible = false;
                if (vrCharWindow) vrCharWindow.visible = false;
                if (vrCharMannequin) vrCharMannequin.visible = false;
                vrCharOpen = false;
                if (vrChessStandalone) clearVrChess();

                startNonVRLoop();
                console.log('VR oturumu sona erdi – 3. şahıs moduna dönüldü');
            });

            /* ── 7) Manuel VR butonunu göster ve bağla ── */
            // Standard Three.js VRButton (Enter VR)
            const existingBtn = document.getElementById('VRButton');
            if (existingBtn) existingBtn.remove();
            const vrBtn = VRButton.createButton(renderer);
            vrBtn.id = 'VRButton';
            vrBtn.textContent = 'VR\'a Gir';
            vrBtn.style.zIndex = '240';
            vrBtn.style.right = '18px';
            vrBtn.style.bottom = '18px';
            vrBtn.style.left = 'auto';
            vrBtn.style.display = 'block';
            document.body.appendChild(vrBtn);

            console.log('VR hazır – VRButton eklendi');
        }

        function createDetailedVRHand(side) {
            const root = new THREE.Group();
            const xSign = side === 'left' ? -1 : 1;
            // Kontrolcu tutus dinlenimi:
            // - Parmaklar ileri (-Z) baksin diye yaw = 0.
            // - Avuclar birbirine baksin diye iceri dogru roll verilir.
            const yawIn = 0;
            const pitchDown = -0.62;
            const roll = side === 'left' ? 1.12 : -1.12;
            root.position.set(0, -0.052, 0.048);
            root.rotation.set(pitchDown, yawIn, roll);
            root.scale.setScalar(1.25);

            const skin = createHandSkinMaterial({
                tone: 0xe9c8b0,
                roughness: 0.66,
                normalScale: 0.2,
                envMapIntensity: 0.1,
                emissiveIntensity: 0.012
            });
            const skinMid = createHandSkinMaterial({
                tone: 0xdab29c,
                roughness: 0.72,
                normalScale: 0.16,
                envMapIntensity: 0.09,
                emissiveIntensity: 0.01
            });
            const nailMat = new THREE.MeshStandardMaterial({
                color: 0xf1d8c5,
                roughness: 0.7,
                metalness: 0.02,
                envMap: handEnvMap || null,
                envMapIntensity: 0.09
            });

            const knuckleZ = -0.0415;
            const palmY = 0.0036;
            const fingerBaseR = 0.0075;
            const palmThick = fingerBaseR * 2.15;
            // palmD: elin GÖVDE uzunluğu (bilek → parmak dipleri) boyunca Z eksenindeki ölçek (~1.5× eski 0.072).
            // palmAnchorZ = metakarpal / dolgu referansı; wristBandZ ayrı — bilek daha geride (+Z), avuçla çakışmaz.
            // 0 yapınca bu mesafeler çöküyor → metakarpal silindirleri milim kalıyor, bilek knuckle’a yapışıyor → el “inecik”.
            // Avuçun GENİŞLİĞİ / et kalınlığı: palmW + palmCore ölçeği + lathe profili; palmD ile karıştırma.
            const palmD = 0.108;
            const pz = knuckleZ + 0.007 + palmD * 0.48;
            // palmW = Lathe profilindeki Y aralığı. 0 yapınca tüm noktalar aynı Y'de toplanır → LatheGeometry düz disk üretir.
            // Lathe avucu istemiyorsan palmW'yi 0 bırak; aşağıda palmCore hiç eklenmez (disk yok).
            const palmW = 0.0;
            const palmAnchorZ = pz + palmD * 0.48;
            const wristBandZ = pz + palmD * 0.595;

            // Uç yarıçapı ~0.005 olunca Lathe dönme ekseninde uzun sivri “çubuk” oluşur; hubR ile kapat.
            const hubR = palmThick * 0.38;
            let palmCore = null;
            if (palmW > 1e-6) {
                const palmProfile = [
                    new THREE.Vector2(hubR, -palmW * 0.5),
                    new THREE.Vector2(palmThick * 0.44, -palmW * 0.32),
                    new THREE.Vector2(palmThick * 0.6, -palmW * 0.048),
                    new THREE.Vector2(palmThick * 0.58, palmW * 0.16),
                    new THREE.Vector2(palmThick * 0.5, palmW * 0.3),
                    new THREE.Vector2(palmThick * 0.34, palmW * 0.4),
                    new THREE.Vector2(hubR, palmW * 0.5)
                ];
                palmCore = new THREE.Mesh(new THREE.LatheGeometry(palmProfile, 36), skin);
                palmCore.rotation.x = Math.PI / 2;
                palmCore.scale.set(1.26, 1.04, 3.22);
                palmCore.position.set(0, palmY + 0.0002, pz - 0.016);
                root.add(palmCore);
            }

            const dorsal = new THREE.Mesh(new THREE.SphereGeometry(fingerBaseR * 2.28, 22, 18), skin);
            dorsal.scale.set(1.12, 0.38, 1.38);
            dorsal.position.set(-0.001 * xSign, palmY - palmThick * 0.44, pz - 0.004);
            root.add(dorsal);

            // Avuç içi dolgu: kase + yastıklar (iç boşluk / sırt görünmesini kapatır)
            const palmarPad = new THREE.Mesh(new THREE.SphereGeometry(fingerBaseR * 3.35, 22, 16), skin);
            palmarPad.scale.set(1.4, 0.6, 1.82);
            palmarPad.position.set(0.004 * xSign, palmY + palmThick * 0.54, pz + palmD * 0.038);
            root.add(palmarPad);
            const palmWell = new THREE.Mesh(new THREE.SphereGeometry(fingerBaseR * 2.88, 18, 14), skinMid);
            palmWell.scale.set(1.3, 0.34, 1.48);
            palmWell.position.set(-0.006 * xSign, palmY + palmThick * 0.57, pz + palmD * 0.015);
            root.add(palmWell);
            const wristZMid = (palmAnchorZ + wristBandZ) * 0.5;
            const wristDiskR = fingerBaseR * 3.34;
            const wristDiscY = palmY - fingerBaseR * 0.08;
            const wristDiscZ = wristZMid + palmD * 0.006;
            // Thenar: volar bilek–başparmak geçişi (CMC hattına yakın, sırta kaydırma).
            const thenarPad = new THREE.Mesh(new THREE.SphereGeometry(fingerBaseR * 1.42, 14, 12), skinMid);
            thenarPad.scale.set(1.38, 0.44, 1.16);
            thenarPad.position.set(0.017 * xSign, wristDiscY + wristDiskR * 0.28, wristDiscZ - palmD * 0.02);
            root.add(thenarPad);
            // Bilek: geniş ince disk (köprü küresi kaldırıldı).
            const wristDiskH = 0.0102;
            const wristDisk = new THREE.Mesh(
                new THREE.CylinderGeometry(wristDiskR, wristDiskR * 0.993, wristDiskH, 56),
                skin
            );
            wristDisk.rotation.x = Math.PI / 2;
            wristDisk.position.set(0, wristDiscY, wristDiscZ);
            root.add(wristDisk);

            const kz = knuckleZ;
            const ky = 0.0064;
            const fingerStarts = [
                [0.0345 * xSign, ky - 0.001, kz + 0.0015],
                [0.0128 * xSign, ky, kz - 0.001],
                [-0.0092 * xSign, ky + 0.001, kz - 0.0015],
                [-0.0362 * xSign, ky, kz]
            ];
            const vA = new THREE.Vector3();
            const vB = new THREE.Vector3();
            const vDir = new THREE.Vector3();
            const qMc = new THREE.Quaternion();
            const yAxis = new THREE.Vector3(0, 1, 0);
            const addMetacarpal = (ax, ay, az, bx, by, bz, rProx, rDist, mat, radialSegs = 14, heightSegs = 1) => {
                vA.set(ax, ay, az);
                vB.set(bx, by, bz);
                vDir.subVectors(vB, vA);
                const len = vDir.length();
                if (len < 0.004) return null;
                const geo = new THREE.CylinderGeometry(rProx, rDist, len, radialSegs, heightSegs, false);
                if (heightSegs > 1) geo.computeVertexNormals();
                const cyl = new THREE.Mesh(geo, mat);
                vDir.multiplyScalar(1 / len);
                cyl.position.copy(vA).add(vB).multiplyScalar(0.5);
                if (Math.abs(vDir.dot(yAxis)) > 0.998) {
                    cyl.quaternion.identity();
                } else {
                    qMc.setFromUnitVectors(yAxis, vDir);
                    cyl.quaternion.copy(qMc);
                }
                root.add(cyl);
                return cyl;
            };
            fingerStarts.forEach(([fx, fy, fz]) => {
                const ax = fx * 0.4;
                const az = palmAnchorZ;
                addMetacarpal(ax, palmY, az, fx, fy, fz, fingerBaseR * 1.02, fingerBaseR * 0.96, skinMid);
            });

            // CMC: bilek diskinin AVUÇ tarafı (kırmızı işaret) — disk merkezinden +Y volar, radial köşeden içeri; sırt kenarı değil.
            const indKn = fingerStarts[0];
            const cmc = new THREE.Vector3(
                wristDiskR * 0.29 * xSign,
                wristDiscY + wristDiskR * 0.36,
                wristDiscZ - palmD * 0.036
            );
            const thumbMcp = new THREE.Vector3(
                indKn[0] + 0.056 * xSign,
                palmY + palmThick * 0.534,
                indKn[2] - palmD * 0.052
            );
            /** Bilek (CMC) → başparmak tabanı (MCP) kemik gövdesi; %50 kısaltılmış. */
            let thumbMcpAttach = thumbMcp;
            vDir.subVectors(thumbMcp, cmc);
            const mcChord = vDir.length();
            if (mcChord > 0.006) {
                vDir.multiplyScalar(1 / mcChord);
                const mcLen = mcChord * 0.5;
                const rWrist = fingerBaseR * 1.56;
                const rMcp = fingerBaseR * 1.18;
                const mcGeo = new THREE.CylinderGeometry(rMcp, rWrist, mcLen, 22, 1, false);
                const mcMesh = new THREE.Mesh(mcGeo, skinMid);
                mcMesh.position.copy(cmc).addScaledVector(vDir, mcLen * 0.5);
                if (Math.abs(vDir.dot(yAxis)) > 0.998) {
                    mcMesh.quaternion.identity();
                } else {
                    qMc.setFromUnitVectors(yAxis, vDir);
                    mcMesh.quaternion.copy(qMc);
                }
                root.add(mcMesh);
                thumbMcpAttach = cmc.clone().addScaledVector(vDir, mcLen);
            } else {
                vDir.set(0.4 * xSign, 0.26, -0.76).normalize();
            }

            // Parmak araları → avuç içi: ince silindir + web yastığı (yumuşak geçiş).
            const palmInnerY = palmY + palmThick * 0.47;
            const palmInnerZ = palmAnchorZ - palmD * 0.058;
            const webPads = [];
            for (let wi = 0; wi < fingerStarts.length - 1; wi++) {
                const a = fingerStarts[wi];
                const b = fingerStarts[wi + 1];
                const wx = (a[0] + b[0]) * 0.5;
                const wy = (a[1] + b[1]) * 0.5;
                const wz = (a[2] + b[2]) * 0.5;
                const ix = wx * 0.38;
                const ringPinky = wi === 2;
                const rProx = fingerBaseR * (ringPinky ? 0.48 : 0.36);
                const rDist = fingerBaseR * (ringPinky ? 0.7 : 0.5);
                addMetacarpal(wx, wy, wz, ix, palmInnerY, palmInnerZ, rProx, rDist, skinMid, ringPinky ? 22 : 20);
                const wpR = fingerBaseR * (ringPinky ? 0.68 : 0.5);
                const wp = new THREE.Mesh(new THREE.SphereGeometry(wpR, ringPinky ? 18 : 16, ringPinky ? 16 : 14), skinMid);
                wp.scale.set(
                    ringPinky ? 1.4 : 1.18,
                    ringPinky ? 0.9 : 0.72,
                    ringPinky ? 1.22 : 1.08
                );
                wp.position.set(
                    wx * 0.94,
                    wy + fingerBaseR * (ringPinky ? 0.23 : 0.2),
                    wz + fingerBaseR * (ringPinky ? 0.052 : 0.045)
                );
                root.add(wp);
                webPads.push(wp);
            }

            const palmMeshes = [palmCore, dorsal, palmarPad, palmWell, thenarPad, wristDisk, ...webPads].filter(
                Boolean
            );
            palmMeshes.forEach((m) => {
                m.userData.palmBaseScale = m.scale.clone();
            });
            root.userData.palmMeshes = palmMeshes;

            const fingers = [];
            const makePhalanx = (radiusA, radiusB, len, mat, radialSegs = 18, ell = null) => {
                const geo = new THREE.CylinderGeometry(radiusA, radiusB, len, radialSegs, 1, false);
                const mesh = new THREE.Mesh(geo, mat);
                mesh.rotation.x = Math.PI / 2;
                mesh.position.z = -len * 0.53;
                if (ell) mesh.scale.set(ell[0], ell[1], ell[2]);
                return mesh;
            };

            // Parmak tabanlari knuckleZ uzerinde (kz, ky yukarida)
            // Sira setVRHandPose: [0..3] diger parmaklar, [4]=basparmak (isThumb)
            // Uzunluk hiyerarsisi: orta > yuzuk ~ isaret > serce; uca dogru taper artar.
            const fingerDefs = [
                {
                    start: [0.0345 * xSign, ky - 0.001, kz + 0.0015],
                    lengths: [0.026, 0.019, 0.014],
                    radii: [0.0074, 0.00645, 0.0055],
                    spreadZ: -0.034,
                    splayY: 0.044,
                    tapers: [0.93, 0.88, 0.83],
                    ell: [1.05, 1.0, 0.94]
                },
                {
                    start: [0.0128 * xSign, ky, kz - 0.001],
                    lengths: [0.034, 0.025, 0.018],
                    radii: [0.00865, 0.0076, 0.00645],
                    spreadZ: -0.013,
                    splayY: 0.016,
                    tapers: [0.935, 0.885, 0.835],
                    ell: [1.1, 1.0, 0.95]
                },
                {
                    start: [-0.0092 * xSign, ky + 0.001, kz - 0.0015],
                    lengths: [0.031, 0.023, 0.017],
                    radii: [0.00825, 0.00725, 0.0062],
                    spreadZ: 0.007,
                    splayY: -0.018,
                    tapers: [0.93, 0.88, 0.825],
                    ell: [1.06, 1.0, 0.93]
                },
                {
                    start: [-0.0362 * xSign, ky, kz],
                    lengths: [0.023, 0.0165, 0.0115],
                    radii: [0.00705, 0.0062, 0.0053],
                    spreadZ: 0.026,
                    splayY: -0.056,
                    tapers: [0.925, 0.875, 0.815],
                    ell: [0.97, 1.0, 0.9]
                }
            ];

            fingerDefs.forEach((def, fi) => {
                const base = new THREE.Group();
                base.position.set(def.start[0], def.start[1], def.start[2]);
                root.add(base);
                const r0 = def.radii[0];
                const mcpR = r0 * 1.0;
                const mcpKnuckle = new THREE.Mesh(new THREE.SphereGeometry(mcpR, 13, 11), skinMid);
                mcpKnuckle.position.set(0, 0.00115, 0.0011);
                mcpKnuckle.scale.set(0.98, 0.9, 0.93);
                base.add(mcpKnuckle);
                const segs = [];
                let parent = base;
                def.lengths.forEach((len, segIdx) => {
                    const joint = new THREE.Group();
                    parent.add(joint);
                    const r = def.radii[segIdx];
                    const radSegs = 20;
                    if (segIdx === 0) {
                        joint.position.z = 0;
                    } else {
                        joint.position.z = -def.lengths[segIdx - 1] * 0.965;
                    }
                    const tapers = def.tapers || [0.93, 0.89, 0.84];
                    const taper = tapers[Math.min(segIdx, tapers.length - 1)];
                    const ell = def.ell || [1.06, 1.0, 0.93];
                    const seg = makePhalanx(r, r * taper, len, skin, radSegs, ell);
                    joint.add(seg);

                    const tenR0 = r * 0.11;
                    const tenR1 = r * 0.078;
                    const tendon = new THREE.Mesh(new THREE.CylinderGeometry(tenR0, tenR1, len * 0.66, 10), skinMid);
                    tendon.rotation.x = Math.PI / 2;
                    tendon.position.set(0, -r * 0.21, -len * 0.49);
                    joint.add(tendon);

                    let jb = r * 1.05;
                    if (segIdx === 1) jb *= 1.05;
                    if (segIdx === 2) jb *= 0.94;
                    const jointBall = new THREE.Mesh(new THREE.SphereGeometry(jb, 13, 11), skinMid);
                    jointBall.position.z = -len * 0.96;
                    joint.add(jointBall);

                    if (segIdx === def.lengths.length - 1) {
                        const nailMesh = new THREE.Mesh(new THREE.SphereGeometry(r * 0.68, 12, 10), nailMat);
                        nailMesh.scale.set(1.34, 0.3, 1.05);
                        nailMesh.position.set(0, 0.0048, -len * 1.018);
                        nailMesh.rotation.x = -0.09 - segIdx * 0.01;
                        joint.add(nailMesh);
                    }

                    segs.push(joint);
                    parent = joint;
                });

                const fin = Math.min(fi, 3);
                const fingerIdleMcpX = [0.028, 0.044, 0.058, 0.074];
                base.rotation.x = -0.048 + (def.spreadZ || 0) * 0.008 - fingerIdleMcpX[fin];
                base.rotation.z = (def.spreadZ || 0) * 0.82;
                base.rotation.y = (def.splayY ?? 0) * xSign;

                fingers.push({ base, segs, isThumb: false });
            });

            // Başparmak: gerçek anatomide 2 falanks — üst falanks + uç + tırnak (3 silindir zinciri değil).
            const rProxPh = fingerBaseR * 1.14;
            const rDistPh = fingerBaseR * 0.92;
            const thumbLens = [0.0312, 0.0186];
            const thumbTap = [0.9, 0.84];
            const thumbEll = [1.08, 1.02];
            const thumbBase = new THREE.Group();
            thumbBase.position.copy(thumbMcpAttach);
            root.add(thumbBase);
            const mcpKnuckleTh = new THREE.Mesh(new THREE.SphereGeometry(rProxPh * 1.02, 14, 12), skinMid);
            mcpKnuckleTh.position.set(0.001 * xSign, -0.0004, 0.0008);
            mcpKnuckleTh.scale.set(1.06, 0.9, 1.03);
            thumbBase.add(mcpKnuckleTh);
            const thumbSegs = [];
            let parentTh = thumbBase;
            const thumbRad = [rProxPh, rDistPh];
            thumbLens.forEach((len, segIdx) => {
                const joint = new THREE.Group();
                parentTh.add(joint);
                const r = thumbRad[segIdx];
                if (segIdx === 0) joint.position.z = 0;
                else joint.position.z = -thumbLens[segIdx - 1] * 0.968;
                const taper = thumbTap[segIdx];
                const ell = [thumbEll[segIdx], 1.0, thumbEll[segIdx]];
                const seg = makePhalanx(r, r * taper, len, skin, 18, ell);
                joint.add(seg);

                const tenR0 = r * 0.17;
                const tenR1 = r * 0.12;
                const tendon = new THREE.Mesh(new THREE.CylinderGeometry(tenR0, tenR1, len * 0.62, 10), skinMid);
                tendon.rotation.x = Math.PI / 2;
                tendon.position.set(0, -r * 0.17, -len * 0.48);
                joint.add(tendon);

                const jb = r * (segIdx === 0 ? 1.06 : 1.02);
                const jointBall = new THREE.Mesh(new THREE.SphereGeometry(jb, 12, 10), skinMid);
                jointBall.position.z = -len * 0.96;
                joint.add(jointBall);

                if (segIdx === thumbLens.length - 1) {
                    const nail = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 12, 10), nailMat);
                    nail.scale.set(1.18, 0.3, 1.0);
                    nail.position.set(0.0012 * xSign, 0.0046, -len * 1.015);
                    nail.rotation.x = -0.38;
                    nail.rotation.z = 0.1 * xSign;
                    joint.add(nail);
                }

                thumbSegs.push(joint);
                parentTh = joint;
            });
            // Uç normal insanda MC’den sonra daha çok ileri (−Z) gider.
            const mcBone =
                vDir.lengthSq() > 1e-8
                    ? vDir.clone().normalize()
                    : new THREE.Vector3(0.4 * xSign, 0.24, -0.75).normalize();
            const tipH = new THREE.Vector3(0.28 * xSign, -0.34, -0.9).normalize();
            const phalDir = mcBone.clone().multiplyScalar(0.32).add(tipH.clone().multiplyScalar(0.68)).normalize();
            const qThumbRest = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), phalDir);
            thumbBase.quaternion.copy(qThumbRest);
            thumbBase.userData.restQuat = qThumbRest.clone();
            fingers.push({ base: thumbBase, segs: thumbSegs, isThumb: true });

            root.userData.handMaterials = [skin, skinMid, nailMat];
            return { root, fingers };
        }

        function initVRHands() {
            if (xrHandsLoaded || !xrGrip0 || !xrGrip1 || !xrCtrl0 || !xrCtrl1) return;
            xrHandMixers.length = 0;

            // Model el yükleme iptal: eski procedural eller.
            const loadedModels = { left: null, right: null };
            const buildHand = (side) => {
                const h = createDetailedVRHand(side);
                h.root.userData.handedness = side;
                h.root.fingers = h.fingers;
                h.root.visible = false;
                h.root.userData.isVrHand = true;
                return h.root;
            };

            // Görsel sol/sağ mesh ile XR handedness bazen ters eşleşiyor; geometriyi takas et.
            loadedModels.left = buildHand('right');
            loadedModels.left.userData.handedness = 'left';
            loadedModels.left.rotation.z *= -1;
            loadedModels.right = buildHand('left');
            loadedModels.right.userData.handedness = 'right';
            loadedModels.right.rotation.z *= -1;

            xrLeftHand = loadedModels.left;
            xrRightHand = loadedModels.right;
            xrHandsLoaded = true;
            xrHandModelLoadPromise = null;
            console.log('initVRHands: Procedural hands hazir, connected bekliyor...');

            const attachHand = (ctrlIndex, handedness) => {
                if (!xrHandsLoaded) return;
                const grip = ctrlIndex === 0 ? xrGrip0 : xrGrip1;
                const hand = handedness === 'left' ? loadedModels.left : loadedModels.right;
                if (!hand) return;
                if (hand.parent) hand.parent.remove(hand);
                grip.add(hand);
                hand.visible = true;
                // Baglanti aninda da acik avuc yerine kontrolcu-tutma dinlenim pozu.
                setVRHandPose(hand, { grip: 0, trigger: 0, point: 0, thumbsUp: 0 });
            };

            const detachHand = (handedness) => {
                const hand = handedness === 'left' ? loadedModels.left : loadedModels.right;
                if (!hand) return;
                hand.visible = false;
            };

            xrCtrl0.addEventListener('connected', (ev) => {
                const h = String(ev?.data?.handedness || '').toLowerCase();
                xrCtrl0Handedness = h;
                if (h === 'left' || h === 'right') attachHand(0, h);
            });
            xrCtrl1.addEventListener('connected', (ev) => {
                const h = String(ev?.data?.handedness || '').toLowerCase();
                xrCtrl1Handedness = h;
                if (h === 'left' || h === 'right') attachHand(1, h);
            });
            xrCtrl0.addEventListener('disconnected', (ev) => {
                const h = String(ev?.data?.handedness || '').toLowerCase();
                if (h === 'left' || h === 'right') detachHand(h);
            });
            xrCtrl1.addEventListener('disconnected', (ev) => {
                const h = String(ev?.data?.handedness || '').toLowerCase();
                if (h === 'left' || h === 'right') detachHand(h);
            });
        }

        function smoothstep(edge0, edge1, x) {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        }

        function setVRHandPose(hand, pose) {
            if (!hand) return;
            const fingers = hand.fingers || null;
            if (!fingers) return;
            const side = hand.userData?.handedness === 'left' ? -1 : 1;
            // Quest: buttons[0] = üst tetik, buttons[1] = alt grip
            const rawGrip = Math.max(0, Math.min(1, pose?.grip ?? 0));
            const rawTrigger = Math.max(0, Math.min(1, pose?.trigger ?? 0));
            const smooth = hand.userData.poseSmooth || {
                grip: rawGrip,
                trigger: rawTrigger,
                thumbsUp: Math.max(0, Math.min(1, pose?.thumbsUp ?? 0))
            };
            const a = pose?.instant ? 1 : 0.15;
            const targetThumbs = Math.max(0, Math.min(1, pose?.thumbsUp ?? 0));
            smooth.grip += (rawGrip - smooth.grip) * a;
            smooth.trigger += (rawTrigger - smooth.trigger) * a;
            smooth.thumbsUp += (targetThumbs - smooth.thumbsUp) * a;
            hand.userData.poseSmooth = smooth;

            const gr = smooth.grip;
            const tr = smooth.trigger;
            const thumbsUp = smooth.thumbsUp;

            const openPalm = Boolean(pose?.openPalm);
            // Quest: buttons[0] = ust tetik, buttons[1] = alt grip
            // alt trigger tutma; iki tetik beraber daha sert yumruk.
            const graspOnly = openPalm ? 0 : gr * (1 - smoothstep(0.06, 0.48, tr));

            const trioRelaxed = openPalm ? 0.04 : 0.37;
            const idxRelaxed = openPalm ? 0.02 : 0.14;

            const okT = tr * tr * (3 - 2 * tr);

            const bothOn = smoothstep(0.12, 0.36, gr) * smoothstep(0.1, 0.36, tr);
            const hardFist = smoothstep(0.5, 0.98, Math.min(gr, tr));
            const fingersWrap = Math.max(
                bothOn * smoothstep(0.32, 0.98, gr) * tr,
                hardFist * 0.98
            );

            // Başparmak: tek skaler (0=açık, 1=avuça kapanır) — eski uThumb/curlTh kaldırıldı
            let thumbTarget = openPalm
                ? 0
                : Math.min(
                    1,
                    Math.max(gr, tr * 0.72) * 0.92 + hardFist * 0.35 + fingersWrap * 0.25
                );
            thumbTarget *= 1 - thumbsUp * 0.92;
            let tcs = hand.userData.thumbCloseSmooth;
            if (typeof tcs !== 'number') tcs = thumbTarget;
            tcs += (thumbTarget - tcs) * a;
            hand.userData.thumbCloseSmooth = tcs;
            const thumbClose = Math.max(0, Math.min(1, tcs));

            const curlIdx =
                idxRelaxed * (1 - gr * 0.18) * (1 - graspOnly * 0.62) + okT * 0.44 + fingersWrap * 0.92;

            const curl3 =
                trioRelaxed * (1 - fingersWrap * 0.85) +
                graspOnly * 0.86 +
                fingersWrap * (0.28 + gr * 0.95);

            const palmMeshes = hand.userData?.palmMeshes;
            if (palmMeshes && palmMeshes.length) {
                const bulge = Math.max(
                    0,
                    Math.min(1, fingersWrap * 0.98 + gr * 0.3 + graspOnly * 0.22 + okT * 0.08)
                );
                palmMeshes.forEach((m) => {
                    const b = m.userData.palmBaseScale;
                    if (!b) return;
                    const g = 1 + bulge * 0.11;
                    const gy = 1 + bulge * 0.07;
                    m.scale.set(b.x * g, b.y * gy, b.z * g);
                });
            }

            if (fingers) {
                fingers.forEach((f, idx) => {
                    if (f.isThumb) {
                        const rq = f.base.userData?.restQuat;
                        if (rq) f.base.quaternion.copy(rq);
                        else f.base.quaternion.identity();
                        const tc = thumbClose;
                        // Diğer parmaklarla aynı bükülme modeli: tendonCurve + negatif rx, rz = -0.08*side (avuç içi).
                        const tendonCurve = tc * (0.72 + 0.28 * tc);
                        const lat = -side;
                        f.base.rotateX(-0.55 * tendonCurve);
                        f.base.rotateY(lat * tc * 0.32);
                        f.base.rotateZ(-0.12 * lat * tc);
                        const s0 = f.segs[0];
                        const s1 = f.segs[1];
                        const applyThumbSeg = (joint, segIdx, segMul) => {
                            if (!joint) return;
                            let rx = -1.55 * tendonCurve * segMul;
                            let ry = lat * tc * (0.18 + segIdx * 0.08);
                            let rz = -0.1 * lat * tc;
                            if (okT > 0.02) {
                                const o = okT;
                                rx += -o * (0.1 + segIdx * 0.12);
                                ry += lat * o * (0.18 + segIdx * 0.08);
                                rz += -lat * o * (0.09 + segIdx * 0.05);
                            }
                            if (fingersWrap > 0.08) {
                                const w = fingersWrap;
                                rz += -lat * w * (segIdx === 0 ? 0.24 : 0.34);
                                rx += -w * (0.06 + segIdx * 0.06);
                            }
                            if (fingersWrap > 0.12) {
                                const w = fingersWrap;
                                rx += -w * (0.06 + segIdx * 0.05);
                            }
                            joint.rotation.order = 'XYZ';
                            joint.rotation.set(rx, ry, rz);
                        };
                        applyThumbSeg(s0, 0, 0.72);
                        applyThumbSeg(s1, 1, 1.0);
                        return;
                    }

                    let curl = 0;
                    if (idx === 0) {
                        curl = curlIdx;
                    } else if (idx === 1) {
                        curl = curl3 * 1.0;
                    } else if (idx === 2) {
                        curl = curl3 * 1.07;
                    } else if (idx === 3) {
                        curl = curl3 * 1.16;
                    }

                    f.segs.forEach((j, segIdx) => {
                        let segMul = segIdx === 0 ? 0.72 : segIdx === 1 ? 1.0 : 1.2;
                        if (idx <= 3 && fingersWrap > 0.05) {
                            segMul *= segIdx === 2 ? 1.14 : segIdx === 1 ? 1.05 : 0.92;
                        }
                        const tendonCurve = curl * (0.72 + 0.28 * curl);
                        let rx = -1.55 * tendonCurve * segMul;
                        let ry = 0;
                        let rz = -0.08 * side * curl;
                        if (idx === 0 && okT > 0.02) {
                            const o = okT;
                            rx += -o * (0.1 + segIdx * 0.12);
                            ry += side * o * (0.16 + segIdx * 0.07);
                            rz += side * o * (0.08 + segIdx * 0.05);
                        }
                        if (fingersWrap > 0.08 && idx <= 3) {
                            const add = fingersWrap * 0.06;
                            rz += -side * add * (idx === 0 ? 0.35 : idx === 3 ? 0.5 : 0.28);
                        }
                        if (fingersWrap > 0.12) {
                            const w = fingersWrap;
                            rx += -w * (0.08 + segIdx * 0.08);
                        }
                        j.rotation.x = rx;
                        j.rotation.y = ry;
                        j.rotation.z = rz;
                    });
                });
            }
        }

        function getHandPoseFromSource(src) {
            const gp = src?.gamepad;
            if (!gp) return null;
            const trigger = Math.max(gp.buttons?.[0]?.value || 0, gp.buttons?.[0]?.pressed ? 1 : 0);
            const grip = Math.max(gp.buttons?.[1]?.value || 0, gp.buttons?.[1]?.pressed ? 1 : 0);
            const facePressed = !!gp.buttons?.[3]?.pressed || !!gp.buttons?.[4]?.pressed || !!gp.buttons?.[5]?.pressed;
            const thumbsUp = (!facePressed && trigger < 0.1 && grip < 0.15) ? 1 : 0;
            return { trigger, grip, point: 0, thumbsUp };
        }

        function updateVRHandAnimations() {
            if (!xrActive) return;
            const session = renderer.xr.getSession();
            if (!session) return;

            let leftPose = null;
            let rightPose = null;
            for (const src of listXrInputSources(session)) {
                if (!src?.gamepad) continue;
                if (src.handedness === 'left' && !leftPose) leftPose = getHandPoseFromSource(src);
                if (src.handedness === 'right' && !rightPose) rightPose = getHandPoseFromSource(src);
            }

            if (leftPose) {
                if (xrGrabbedLeft) leftPose.grip = Math.max(leftPose.grip, 0.42);
                setVRHandPose(xrLeftHand, leftPose);
            }
            if (rightPose) {
                if (xrGrabbedRight) rightPose.grip = Math.max(rightPose.grip, 0.42);
                setVRHandPose(xrRightHand, rightPose);
            }
        }

        function makeCurvedMenuGeometry(width, height, segments = 28, bendDepth = 0.26) {
            const geo = new THREE.PlaneGeometry(width, height, segments, 1);
            const pos = geo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const nx = x / (width * 0.5);
                // Kenarlari izleyiciye yaklastir: ici sana bakan kavis.
                pos.setZ(i, Math.pow(nx, 2) * bendDepth);
            }
            pos.needsUpdate = true;
            geo.computeVertexNormals();
            return geo;
        }

        function initVrMenuWindow() {
            if (vrMenuWindow || !xrRig) return;
            vrMenuCanvas = document.createElement('canvas');
            vrMenuCanvas.width = 1200;
            vrMenuCanvas.height = 760;
            vrMenuCtx = vrMenuCanvas.getContext('2d');
            vrMenuTexture = new THREE.CanvasTexture(vrMenuCanvas);
            const mat = new THREE.MeshBasicMaterial({ map: vrMenuTexture, transparent: true, side: THREE.DoubleSide });
            vrMenuWindow = new THREE.Mesh(makeCurvedMenuGeometry(1.9, 1.14), mat);
            // Kafaya degil, oyuncu rig'ine bagli dunyasal pencere.
            vrMenuWindow.position.set(0, vrMenuHeight, -vrMenuRadius);
            vrMenuWindow.visible = false;
            xrRig.add(vrMenuWindow);
            updateVrMenuWindow();
        }

        function updateVrMenuWindow() {
            if (!vrMenuCtx || !vrMenuTexture) return;
            const c = vrMenuCtx;
            const W = vrMenuCanvas.width;
            const H = vrMenuCanvas.height;
            const getOnlineLabel = (u) => {
                if (typeof u === 'string') return u;
                if (u && typeof u === 'object') return u.nickname || u.username || u.name || 'Oyuncu';
                return 'Oyuncu';
            };
            c.clearRect(0, 0, W, H);
            c.fillStyle = 'rgba(6, 14, 24, 0.86)';
            c.fillRect(0, 0, W, H);
            c.fillStyle = '#e8c870';
            c.font = 'bold 44px Arial';
            c.fillText('Harran Üniversitesi', 34, 62);

            const tabLabels = ['🏆 Leaderboard', '🟢 Online', '🗺️ Harita'];
            tabLabels.forEach((label, idx) => {
                const x = 34 + idx * 232;
                const y = 92;
                const w = 206;
                const h = 46;
                const active = escMenuTab === escTabs[idx];
                c.fillStyle = active ? 'rgba(232,200,112,.30)' : 'rgba(255,255,255,.08)';
                c.fillRect(x, y, w, h);
                c.strokeStyle = active ? 'rgba(232,200,112,.9)' : 'rgba(255,255,255,.16)';
                c.lineWidth = 2;
                c.strokeRect(x, y, w, h);
                c.fillStyle = active ? '#ffe7a7' : '#d9ecff';
                c.font = 'bold 20px Arial';
                c.fillText(label, x + 12, y + 30);
            });

            c.fillStyle = 'rgba(255,120,120,.18)';
            c.fillRect(W - 138, 24, 104, 44);
            c.strokeStyle = 'rgba(255,160,160,.45)';
            c.lineWidth = 2;
            c.strokeRect(W - 138, 24, 104, 44);
            c.fillStyle = '#ffd2d2';
            c.font = 'bold 26px Arial';
            c.fillText('Kapat', W - 124, 54);

            c.fillStyle = '#b9d7ff';
            c.font = '23px Arial';
            c.fillText(`Sekme: ${escMenuTab === 'map' ? 'Harita' : escMenuTab === 'online' ? 'Online' : 'Leaderboard'}`, 34, 176);
            c.fillText(`Online: ${onlineUsers.length}`, 34, 208);

            if (escMenuTab === 'leaderboard') {
                lbGames.forEach((g, i) => {
                    const x = 34 + i * 92;
                    const y = 248;
                    const active = currentLbGame === g.id;
                    c.fillStyle = active ? 'rgba(232,200,112,.30)' : 'rgba(255,255,255,.08)';
                    c.fillRect(x, y, 74, 42);
                    c.strokeStyle = active ? 'rgba(232,200,112,.9)' : 'rgba(255,255,255,.16)';
                    c.lineWidth = 2;
                    c.strokeRect(x, y, 74, 42);
                    c.fillStyle = '#eef6ff';
                    c.font = '24px Arial';
                    c.fillText(g.label, x + 20, y + 29);
                });
                const rows = Array.from(document.querySelectorAll('#lb-list .lb-row')).slice(0, 10);
                rows.forEach((row, i) => {
                    const rank = row.querySelector('.lb-rank')?.textContent || `${i + 1}`;
                    const name = row.querySelector('.lb-name')?.textContent || '-';
                    const score = row.querySelector('.lb-score')?.textContent || '0';
                    c.fillStyle = 'rgba(255,255,255,.06)';
                    c.fillRect(34, 304 + i * 35, 1130, 30);
                    c.fillStyle = '#dceeff';
                    c.font = '19px Arial';
                    c.fillText(rank, 46, 325 + i * 35);
                    c.fillText(name, 122, 325 + i * 35);
                    c.fillText(score, 1115, 325 + i * 35);
                });
                if (!rows.length) {
                    const emptyText = document.querySelector('#lb-list .lb-empty')?.textContent?.trim();
                    c.fillText(emptyText || 'Henüz kayıt yok', 34, 326);
                }
            } else if (escMenuTab === 'online') {
                c.fillStyle = 'rgba(255,255,255,.1)';
                c.fillRect(34, 250, 1130, 38);
                c.fillStyle = '#cfe6ff';
                c.font = 'bold 20px Arial';
                c.fillText('#', 52, 275);
                c.fillText('Kullanici', 110, 275);
                c.fillText('Durum', 1020, 275);
                const onlineVisible = 5;
                const onlineMaxStart = Math.max(0, onlineUsers.length - onlineVisible);
                vrMenuOnlineScroll = Math.max(0, Math.min(onlineMaxStart, vrMenuOnlineScroll));
                const visibleOnline = onlineUsers.slice(vrMenuOnlineScroll, vrMenuOnlineScroll + onlineVisible);
                visibleOnline.forEach((u, i) => {
                    c.fillStyle = 'rgba(255,255,255,.06)';
                    c.fillRect(34, 292 + i * 34, 1130, 29);
                    c.fillStyle = '#dceeff';
                    c.font = '20px Arial';
                    c.fillText(String(vrMenuOnlineScroll + i + 1), 52, 312 + i * 34);
                    c.fillText(getOnlineLabel(u), 110, 312 + i * 34);
                    c.fillText('Online', 1020, 312 + i * 34);
                });
                if (!onlineUsers.length) c.fillText('Online kullanici yok', 34, 312);
                if (onlineUsers.length > onlineVisible) {
                    const trackX = 1168;
                    const trackY = 292;
                    const trackH = 170;
                    const thumbH = Math.max(26, trackH * (onlineVisible / onlineUsers.length));
                    const maxStart = Math.max(1, onlineUsers.length - onlineVisible);
                    const thumbY = trackY + ((trackH - thumbH) * (vrMenuOnlineScroll / maxStart));
                    c.fillStyle = 'rgba(255,255,255,.14)';
                    c.fillRect(trackX, trackY, 12, trackH);
                    c.fillStyle = '#e8c870';
                    c.fillRect(trackX, thumbY, 12, thumbH);
                    c.fillStyle = '#8fbde6';
                    c.font = '17px Arial';
                    c.fillText(`Kaydir: ${vrMenuOnlineScroll + 1}-${Math.min(onlineUsers.length, vrMenuOnlineScroll + onlineVisible)} / ${onlineUsers.length}`, 34, 484);
                }
            } else {
                const mapX = 426, mapY = 250, mapW = 738, mapH = 430;
                c.fillStyle = 'rgba(255,255,255,.08)';
                c.fillRect(mapX, mapY, mapW, mapH);
                if (escMapCanvas) c.drawImage(escMapCanvas, mapX + 8, mapY + 8, mapW - 16, mapH - 16);
                const mapVisible = 8;
                const mapMaxStart = Math.max(0, BUILDINGS.length - mapVisible);
                vrMenuMapScroll = Math.max(0, Math.min(mapMaxStart, vrMenuMapScroll));
                const visibleBuildings = BUILDINGS.slice(vrMenuMapScroll, vrMenuMapScroll + mapVisible);
                visibleBuildings.forEach((b, i) => {
                    const globalIdx = vrMenuMapScroll + i;
                    const active = highlightIdx === globalIdx;
                    c.fillStyle = active ? 'rgba(232,200,112,.22)' : 'rgba(255,255,255,.06)';
                    c.fillRect(34, 250 + i * 35, 350, 29);
                    c.fillStyle = active ? '#ffe7a7' : '#dceeff';
                    c.font = '20px Arial';
                    c.fillText(`${active ? '✓' : '•'} ${b.name}`, 44, 270 + i * 35);
                });
                if (BUILDINGS.length > mapVisible) {
                    const trackX = 390;
                    const trackY = 250;
                    const trackH = 280;
                    const thumbH = Math.max(26, trackH * (mapVisible / BUILDINGS.length));
                    const maxStart = Math.max(1, BUILDINGS.length - mapVisible);
                    const thumbY = trackY + ((trackH - thumbH) * (vrMenuMapScroll / maxStart));
                    c.fillStyle = 'rgba(255,255,255,.14)';
                    c.fillRect(trackX, trackY, 12, trackH);
                    c.fillStyle = '#e8c870';
                    c.fillRect(trackX, thumbY, 12, thumbH);
                    c.fillStyle = '#8fbde6';
                    c.font = '17px Arial';
                    c.fillText(`Kaydir: ${vrMenuMapScroll + 1}-${Math.min(BUILDINGS.length, vrMenuMapScroll + mapVisible)} / ${BUILDINGS.length}`, 34, 548);
                }
            }

            if (vrMenuPointerLeft) {
                c.beginPath();
                c.strokeStyle = '#59c7ff';
                c.lineWidth = 3;
                c.arc(vrMenuPointerLeft.x, vrMenuPointerLeft.y, 13, 0, Math.PI * 2);
                c.stroke();
            }
            if (vrMenuPointerRight) {
                c.beginPath();
                c.strokeStyle = '#8cff8c';
                c.lineWidth = 3;
                c.arc(vrMenuPointerRight.x, vrMenuPointerRight.y, 13, 0, Math.PI * 2);
                c.stroke();
            }

            c.fillStyle = '#9ed3ff';
            c.font = '21px Arial';
            c.fillText('Sol Y: ESC ac | Sol/Sag X-A: tikla', 34, H - 92);
            c.fillText('Bos alana basili tutup cek: menu yer degistir', 34, H - 56);
            vrMenuTexture.needsUpdate = true;
        }

        function updateVrMenuTransform(dt) {
            if (!vrMenuWindow || !xrRig) return;
            const k = Math.min(1, Math.max(0.03, dt * 12));
            vrMenuAngle += (vrMenuTargetAngle - vrMenuAngle) * k;
            vrMenuHeight += (vrMenuTargetHeight - vrMenuHeight) * k;
            vrMenuWindow.position.set(
                Math.sin(vrMenuAngle) * vrMenuRadius,
                vrMenuHeight,
                -Math.cos(vrMenuAngle) * vrMenuRadius
            );
            // Her durumda oyuncunun merkezine bak: menu daima oyuncuya donuk kalsin.
            xrRig.getWorldPosition(vrMenuLookTarget);
            vrMenuLookTarget.y += vrMenuHeight;
            vrMenuWindow.lookAt(vrMenuLookTarget);
        }

        function initVrSpotWindow() {
            if (vrSpotWindow || !xrRig) return;
            vrSpotCanvas = document.createElement('canvas');
            vrSpotCanvas.width = 900;
            vrSpotCanvas.height = 420;
            vrSpotCtx = vrSpotCanvas.getContext('2d');
            vrSpotTexture = new THREE.CanvasTexture(vrSpotCanvas);
            const mat = new THREE.MeshBasicMaterial({ map: vrSpotTexture, transparent: true, side: THREE.DoubleSide });
            vrSpotWindow = new THREE.Mesh(makeCurvedMenuGeometry(1.42, 0.66, 24, 0.18), mat);
            vrSpotWindow.position.set(0, 1.32, -1.72);
            vrSpotWindow.visible = false;
            xrRig.add(vrSpotWindow);
            updateVrSpotWindow();
        }

        function initVrCharWindow() {
            if (vrCharWindow || !xrRig) return;
            vrCharCanvas = document.createElement('canvas');
            vrCharCanvas.width = 900;
            vrCharCanvas.height = 520;
            vrCharCtx = vrCharCanvas.getContext('2d');
            vrCharTexture = new THREE.CanvasTexture(vrCharCanvas);
            const mat = new THREE.MeshBasicMaterial({
                map: vrCharTexture,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: false
            });
            vrCharWindow = new THREE.Mesh(makeCurvedMenuGeometry(1.55, 0.90, 26, 0.20), mat);
            vrCharWindow.position.set(0, 1.35, -1.85);
            vrCharWindow.renderOrder = 20;
            vrCharWindow.visible = false;
            xrRig.add(vrCharWindow);
            updateVrCharWindow();
        }

        function initVrCharMannequin() {
            if (vrCharMannequin || !xrRig) return;
            const m = makeHuman(0x1a4f8a, 0x1a2a3a);
            m.scale.setScalar(0.52);
            // pencerenin sağında, önde dursun (menünün arkasında kalmasın)
            m.position.set(1.08, 0.78, -1.72);
            m.rotation.y = Math.PI;
            m.renderOrder = 21;
            m.traverse?.((o) => {
                if (o && o.isMesh) o.renderOrder = 21;
            });
            xrRig.add(m);
            vrCharMannequin = m;
            applyPendingAppearanceToMannequin();
        }

        function updateVrCharWindow() {
            if (!vrCharCtx || !vrCharTexture || !vrCharCanvas) return;
            const c = vrCharCtx;
            const W = vrCharCanvas.width;
            const H = vrCharCanvas.height;
            c.clearRect(0, 0, W, H);
            c.fillStyle = 'rgba(6, 14, 24, 0.90)';
            c.fillRect(0, 0, W, H);

            c.fillStyle = '#f7d977';
            c.font = 'bold 38px Arial';
            c.fillText('Karakter', 36, 64);

            // Close
            c.fillStyle = 'rgba(255,120,120,.18)';
            c.fillRect(W - 150, 22, 116, 46);
            c.strokeStyle = 'rgba(255,160,160,.45)';
            c.lineWidth = 2;
            c.strokeRect(W - 150, 22, 116, 46);
            c.fillStyle = '#ffd2d2';
            c.font = 'bold 26px Arial';
            c.fillText('Kapat', W - 132, 54);

            // Face section
            c.fillStyle = '#d9ecff';
            c.font = 'bold 24px Arial';
            c.fillText('Yüz ifadesi', 36, 128);
            const face = FACE_PRESETS[appearancePending.faceIdx] || FACE_PRESETS[0];
            c.font = '22px Arial';
            c.fillStyle = '#bcd6ff';
            c.fillText(`Seçili: ${face?.label || '-'}`, 36, 160);

            const btnH = 84;
            const prevX = 36, prevY = 184, prevW = 190;
            const nextX = 36 + prevW + 16, nextY = prevY, nextW = 190;
            c.fillStyle = 'rgba(255,255,255,.08)';
            c.fillRect(prevX, prevY, prevW, btnH);
            c.fillRect(nextX, nextY, nextW, btnH);
            c.strokeStyle = 'rgba(255,255,255,.18)';
            c.lineWidth = 2;
            c.strokeRect(prevX, prevY, prevW, btnH);
            c.strokeRect(nextX, nextY, nextW, btnH);
            c.fillStyle = '#e7f0ff';
            c.font = 'bold 30px Arial';
            c.fillText('◀ Önceki', prevX + 28, prevY + 52);
            c.fillText('Sonraki ▶', nextX + 28, nextY + 52);

            // Body color section
            c.fillStyle = '#d9ecff';
            c.font = 'bold 24px Arial';
            c.fillText('Gövde rengi', 36, 312);
            const body = BODY_COLORS[appearancePending.bodyIdx] || BODY_COLORS[0];
            c.font = '22px Arial';
            c.fillStyle = '#bcd6ff';
            c.fillText(`Seçili: ${body?.label || '-'}`, 36, 344);

            const swY = 368;
            const swW = 128;
            const swH = 56;
            const gap = 14;
            BODY_COLORS.slice(0, 6).forEach((col, i) => {
                const x = 36 + (i % 3) * (swW + gap);
                const y = swY + Math.floor(i / 3) * (swH + 14);
                c.fillStyle = `#${col.hex.toString(16).padStart(6, '0')}`;
                c.fillRect(x, y, swW, swH);
                const active = i === appearancePending.bodyIdx;
                c.lineWidth = active ? 5 : 2;
                c.strokeStyle = active ? 'rgba(232,200,112,.95)' : 'rgba(255,255,255,.22)';
                c.strokeRect(x, y, swW, swH);
                c.fillStyle = active ? 'rgba(0,0,0,.35)' : 'rgba(0,0,0,.22)';
                c.fillRect(x, y + swH - 22, swW, 22);
                c.fillStyle = '#eaf4ff';
                c.font = 'bold 16px Arial';
                c.fillText(col.label, x + 10, y + swH - 6);
            });

            // Apply button
            const applyW = 210, applyH = 76;
            const applyX = W - applyW - 36;
            const applyY = H - applyH - 22;
            const dirty = appearancePending.faceIdx !== appearanceApplied.faceIdx || appearancePending.bodyIdx !== appearanceApplied.bodyIdx;
            c.fillStyle = dirty ? 'rgba(64, 168, 98, 0.34)' : 'rgba(255,255,255,0.08)';
            c.fillRect(applyX, applyY, applyW, applyH);
            c.strokeStyle = dirty ? 'rgba(126, 255, 164, 0.92)' : 'rgba(255,255,255,0.18)';
            c.lineWidth = 3;
            c.strokeRect(applyX, applyY, applyW, applyH);
            c.fillStyle = dirty ? '#eaffef' : '#dceeff';
            c.font = 'bold 34px Arial';
            c.fillText('UYGULA', applyX + 40, applyY + 50);

            c.fillStyle = '#9ed3ff';
            c.font = '20px Arial';
            c.fillText('Sol grip: aç/kapat  |  Trigger / A / X: tıkla', 36, H - 28);

            if (vrCharPointerLeft) {
                c.beginPath();
                c.strokeStyle = '#59c7ff';
                c.lineWidth = 3;
                c.arc(vrCharPointerLeft.x, vrCharPointerLeft.y, 13, 0, Math.PI * 2);
                c.stroke();
            }
            if (vrCharPointerRight) {
                c.beginPath();
                c.strokeStyle = '#8cff8c';
                c.lineWidth = 3;
                c.arc(vrCharPointerRight.x, vrCharPointerRight.y, 13, 0, Math.PI * 2);
                c.stroke();
            }
            vrCharTexture.needsUpdate = true;
        }

        function updateVrCharTransform(dt) {
            if (!vrCharWindow || !xrRig) return;
            const k = Math.min(1, Math.max(0.03, dt * 12));
            // Sabit, hafif yukarı; menü gibi sürüklenmesin (bu pencere daha "modal").
            vrCharWindow.position.x += (0 - vrCharWindow.position.x) * k;
            vrCharWindow.position.y += (1.35 - vrCharWindow.position.y) * k;
            vrCharWindow.position.z += (-1.85 - vrCharWindow.position.z) * k;
            xrRig.getWorldPosition(vrMenuLookTarget);
            vrMenuLookTarget.y += 1.35;
            vrCharWindow.lookAt(vrMenuLookTarget);

            if (vrCharMannequin) {
                // pencere açıkken sağ tarafta sabit dursun
                const tx = 1.08, ty = 0.78, tz = -1.72;
                vrCharMannequin.position.x += (tx - vrCharMannequin.position.x) * k;
                vrCharMannequin.position.y += (ty - vrCharMannequin.position.y) * k;
                vrCharMannequin.position.z += (tz - vrCharMannequin.position.z) * k;

                // Dik dursun: sadece Y ekseninde (yaw) döndür.
                vrCharMannequin.rotation.x = 0;
                vrCharMannequin.rotation.z = 0;
                if (renderer?.xr && camera) {
                    const xrCam = renderer.xr.getCamera(camera);
                    if (xrCam) {
                        const dx = xrCam.position.x - vrCharMannequin.position.x;
                        const dz = xrCam.position.z - vrCharMannequin.position.z;
                        const yawToCam = Math.atan2(dx, dz);
                        // Yüz dokusu kafanın "back" yüzünde olduğundan +PI ile çevir.
                        // Ayrıca hafif 3/4 açı ver (tam düz bakmasın).
                        vrCharMannequin.rotation.y = yawToCam + Math.PI - 0.35;
                    }
                }
            }
        }

        function getVrCharHit(src, session) {
            if (!vrCharOpen || !vrCharWindow?.visible || !vrCharCanvas) return null;
            const ctrl = getVrControllerForSource(session, src);
            if (!ctrl) return null;
            const origin = new THREE.Vector3();
            const dir = new THREE.Vector3();
            ctrl.getWorldPosition(origin);
            ctrl.getWorldDirection(dir);
            dir.negate().normalize();
            const hit = new THREE.Raycaster(origin, dir).intersectObject(vrCharWindow, false)[0];
            if (!hit?.uv) return null;
            return {
                x: hit.uv.x * vrCharCanvas.width,
                y: (1 - hit.uv.y) * vrCharCanvas.height
            };
        }

        function setVrCharOpen(open) {
            if (vrCharOpen === open) return;
            vrCharOpen = open;
            if (open) {
                // Açılırken: pending'i mevcut applied'dan başlat (önizleme)
                appearancePending.faceIdx = appearanceApplied.faceIdx;
                appearancePending.bodyIdx = appearanceApplied.bodyIdx;
                initVrCharWindow();
                initVrCharMannequin();
                updateVrCharWindow();
            }
            if (vrCharWindow) vrCharWindow.visible = !!(xrActive && vrCharOpen);
            if (vrCharMannequin) vrCharMannequin.visible = !!(xrActive && vrCharOpen);
            // Karakter penceresi açıkken ESC menüsünü kapat (çakışma olmasın).
            if (open && escMenuOpen) setEscMenuOpen(false);
            // Pencere açılınca spot etkileşimini gizle.
            if (open && vrSpotWindow) vrSpotWindow.visible = false;
            vrCharPointerLeft = null;
            vrCharPointerRight = null;
            vrInputCooldownUntil = performance.now() + 220;
        }

        function applyPendingAppearanceToMannequin() {
            const body = BODY_COLORS[appearancePending.bodyIdx] || BODY_COLORS[0];
            const face = FACE_PRESETS[appearancePending.faceIdx] || FACE_PRESETS[0];
            if (vrCharMannequin) {
                setHumanBodyColor(vrCharMannequin, body.hex);
                setHumanFace(vrCharMannequin, face.id);
            }
        }

        function applyAppliedAppearanceToPlayer() {
            const body = BODY_COLORS[appearanceApplied.bodyIdx] || BODY_COLORS[0];
            const face = FACE_PRESETS[appearanceApplied.faceIdx] || FACE_PRESETS[0];
            if (player) {
                setHumanBodyColor(player, body.hex);
                setHumanFace(player, face.id);
            }
        }

        function commitPendingAppearance() {
            appearanceApplied.faceIdx = appearancePending.faceIdx;
            appearanceApplied.bodyIdx = appearancePending.bodyIdx;
            applyAppliedAppearanceToPlayer();
            updateVrCharWindow();
            vrInputCooldownUntil = performance.now() + 220;
        }

        function clickVrCharAt(hit) {
            if (!hit || !vrCharOpen || !vrCharCanvas) return false;
            const W = vrCharCanvas.width;
            const H = vrCharCanvas.height;
            const x = hit.x;
            const y = hit.y;

            // Close
            if (x >= W - 150 && x <= W - 34 && y >= 22 && y <= 68) {
                setVrCharOpen(false);
                return true;
            }

            // Apply
            const applyW = 210, applyH = 76;
            const applyX = W - applyW - 36;
            const applyY = H - applyH - 22;
            if (x >= applyX && x <= applyX + applyW && y >= applyY && y <= applyY + applyH) {
                commitPendingAppearance();
                return true;
            }

            // Face prev/next
            const prevX = 36, prevY = 184, prevW = 190, btnH = 84;
            const nextX = 36 + prevW + 16, nextY = prevY, nextW = 190;
            if (y >= prevY && y <= prevY + btnH) {
                if (x >= prevX && x <= prevX + prevW) {
                    appearancePending.faceIdx = (appearancePending.faceIdx - 1 + FACE_PRESETS.length) % FACE_PRESETS.length;
                    applyPendingAppearanceToMannequin();
                    updateVrCharWindow();
                    return true;
                }
                if (x >= nextX && x <= nextX + nextW) {
                    appearancePending.faceIdx = (appearancePending.faceIdx + 1) % FACE_PRESETS.length;
                    applyPendingAppearanceToMannequin();
                    updateVrCharWindow();
                    return true;
                }
            }

            // Body swatches (3x2)
            const swY = 368, swW = 128, swH = 56, gap = 14;
            for (let i = 0; i < Math.min(6, BODY_COLORS.length); i++) {
                const bx = 36 + (i % 3) * (swW + gap);
                const by = swY + Math.floor(i / 3) * (swH + 14);
                if (x >= bx && x <= bx + swW && y >= by && y <= by + swH) {
                    appearancePending.bodyIdx = i;
                    applyPendingAppearanceToMannequin();
                    updateVrCharWindow();
                    return true;
                }
            }
            return false;
        }

        function updateVrSpotWindow() {
            if (!vrSpotCtx || !vrSpotTexture || !vrSpotCanvas) return;
            const c = vrSpotCtx;
            const W = vrSpotCanvas.width;
            const H = vrSpotCanvas.height;
            const spot = activeSpot;

            c.clearRect(0, 0, W, H);
            c.fillStyle = 'rgba(6, 14, 24, 0.88)';
            c.fillRect(0, 0, W, H);

            c.fillStyle = '#f7d977';
            c.font = 'bold 36px Arial';
            c.fillText(spot ? `${spot.icon} ${spot.title}` : 'Etkilesim', 36, 62);

            c.fillStyle = '#d9ecff';
            c.font = '24px Arial';
            c.fillText(spot?.sub || 'Yakindaki etkinlik', 36, 104);

            const vrBtn = getVrSpotPrimaryButtonState();
            const playX = 36;
            const playY = 156;
            const playW = W - 72;
            const playH = 132;
            c.fillStyle = 'rgba(64, 168, 98, 0.35)';
            c.fillRect(playX, playY, playW, playH);
            c.strokeStyle = 'rgba(126, 255, 164, 0.92)';
            c.lineWidth = 3;
            c.strokeRect(playX, playY, playW, playH);
            c.fillStyle = '#eaffef';
            c.font = 'bold 52px Arial';
            c.fillText(vrBtn.label, W / 2 - Math.min(230, vrBtn.label.length * 11), playY + 76);
            c.font = '22px Arial';
            c.fillStyle = '#c6f5d8';
            c.fillText(vrBtn.sub, 56, playY + 116);

            c.fillStyle = '#9ed3ff';
            c.font = '22px Arial';
            c.fillText('ESC menusu gibi: sol X / sag A / trigger ile tikla', 36, H - 58);
            c.fillText('Satrancta tas: trigger veya grip ile sec-birak', 36, H - 26);

            if (vrSpotPointerLeft) {
                c.beginPath();
                c.strokeStyle = '#59c7ff';
                c.lineWidth = 3;
                c.arc(vrSpotPointerLeft.x, vrSpotPointerLeft.y, 13, 0, Math.PI * 2);
                c.stroke();
            }
            if (vrSpotPointerRight) {
                c.beginPath();
                c.strokeStyle = '#8cff8c';
                c.lineWidth = 3;
                c.arc(vrSpotPointerRight.x, vrSpotPointerRight.y, 13, 0, Math.PI * 2);
                c.stroke();
            }
            vrSpotTexture.needsUpdate = true;
        }

        function updateVrSpotTransform(dt) {
            if (!vrSpotWindow || !xrRig) return;
            const k = Math.min(1, Math.max(0.03, dt * 12));
            vrSpotWindow.position.x += (0 - vrSpotWindow.position.x) * k;
            vrSpotWindow.position.y += (1.32 - vrSpotWindow.position.y) * k;
            vrSpotWindow.position.z += (-1.72 - vrSpotWindow.position.z) * k;
            xrRig.getWorldPosition(vrMenuLookTarget);
            vrMenuLookTarget.y += 1.32;
            vrSpotWindow.lookAt(vrMenuLookTarget);
        }

        function getVrControllerForSource(session, src) {
            if (!session || !src) return null;
            const idx = listXrInputSources(session).indexOf(src);
            if (idx === 0) return xrCtrl0;
            if (idx === 1) return xrCtrl1;
            if (idx >= 0) return renderer.xr.getController(idx);
            return src.handedness === 'left' ? xrCtrl0 : xrCtrl1;
        }

        function getVrMenuHit(src, session) {
            if (!escMenuOpen || !vrMenuWindow?.visible || !vrMenuCanvas) return null;
            const ctrl = getVrControllerForSource(session, src);
            if (!ctrl) return null;
            const origin = new THREE.Vector3();
            const dir = new THREE.Vector3();
            ctrl.getWorldPosition(origin);
            ctrl.getWorldDirection(dir);
            dir.negate().normalize();
            const hit = new THREE.Raycaster(origin, dir).intersectObject(vrMenuWindow, false)[0];
            if (!hit?.uv) return null;
            return {
                x: hit.uv.x * vrMenuCanvas.width,
                y: (1 - hit.uv.y) * vrMenuCanvas.height
            };
        }

        function getVrSpotHit(src, session) {
            if (escMenuOpen || !vrSpotWindow?.visible || !vrSpotCanvas || !activeSpot || G.gameRunning) return null;
            const ctrl = getVrControllerForSource(session, src);
            if (!ctrl) return null;
            const origin = new THREE.Vector3();
            const dir = new THREE.Vector3();
            ctrl.getWorldPosition(origin);
            ctrl.getWorldDirection(dir);
            dir.negate().normalize();
            const hit = new THREE.Raycaster(origin, dir).intersectObject(vrSpotWindow, false)[0];
            if (!hit?.uv) return null;
            return {
                x: hit.uv.x * vrSpotCanvas.width,
                y: (1 - hit.uv.y) * vrSpotCanvas.height
            };
        }

        function clickVrSpotAt(hit) {
            if (!hit || escMenuOpen || !activeSpot || G.gameRunning || !vrSpotCanvas) return false;
            const x = hit.x;
            const y = hit.y;
            const playX = 36;
            const playY = 156;
            const playW = vrSpotCanvas.width - 72;
            const playH = 132;
            if (x >= playX && x <= playX + playW && y >= playY && y <= playY + playH) {
                const ip = document.getElementById('interact-prompt');
                if (ip) ip.style.display = 'none';
                if (activeSpot.game === 'ch') {
                    if (onlineChess.active) {
                        applyChessTeleport();
                        if (!G.gameRunning) {
                            startGame(activeSpot.game, activeSpot.id, activeSpot.title, {
                                mode: 'pvp',
                                matchId: onlineChess.matchId,
                                matchPayload: onlineChess.lastState
                            });
                        }
                    } else if (onlineChess.queued) {
                        onlineChess.queued = false;
                        mpClient?.leaveChessQueue?.();
                    } else {
                        mpClient?.joinChessQueue?.();
                    }
                    updateChessQueueUi();
                    updateVrSpotWindow();
                } else {
                    startGame(activeSpot.game, activeSpot.id, activeSpot.title);
                }
                vrInputCooldownUntil = performance.now() + 350;
                return true;
            }
            return false;
        }

        function clickVrMenuAt(hit) {
            if (!hit || !escMenuOpen || !vrMenuCanvas) return { handled: false, scrollArea: null, menuDrag: false };
            const W = vrMenuCanvas.width;
            const x = hit.x;
            const y = hit.y;

            if (x >= W - 138 && x <= W - 34 && y >= 24 && y <= 68) {
                setEscMenuOpen(false);
                return { handled: true, scrollArea: null, menuDrag: false };
            }

            for (let idx = 0; idx < 3; idx++) {
                const tx = 34 + idx * 232;
                if (x >= tx && x <= tx + 206 && y >= 92 && y <= 138) {
                    setEscTab(escTabs[idx]);
                    return { handled: true, scrollArea: null, menuDrag: false };
                }
            }

            if (escMenuTab === 'leaderboard') {
                for (let i = 0; i < lbGames.length; i++) {
                    const tx = 34 + i * 92;
                    if (x >= tx && x <= tx + 74 && y >= 248 && y <= 290) {
                        const game = lbGames[i].id;
                        const tabBtn = document.querySelector(`.lb-tab[data-game="${game}"]`);
                        if (tabBtn) tabBtn.click();
                        else loadLeaderboard(game);
                        return { handled: true, scrollArea: null, menuDrag: false };
                    }
                }
            } else if (escMenuTab === 'map') {
                // Ayrik scroll alani (liste yanindaki kaydirma cubugu)
                if (x >= 390 && x <= 402 && y >= 250 && y <= 530) {
                    return { handled: true, scrollArea: 'map', menuDrag: false };
                }
                if (x >= 34 && x <= 384 && y >= 250 && y <= 565) {
                    const row = Math.floor((y - 250) / 35);
                    const globalRow = vrMenuMapScroll + row;
                    if (row >= 0 && row < 8 && globalRow < BUILDINGS.length) {
                        highlightIdx = (highlightIdx === globalRow) ? -1 : globalRow;
                        renderEscMapBuildingList();
                        setWaypointForBuilding(highlightIdx);
                        updateVrMenuWindow();
                        return { handled: true, scrollArea: null, menuDrag: false };
                    }
                }
            } else if (escMenuTab === 'online') {
                // Ayrik scroll alani (liste yanindaki kaydirma cubugu)
                if (x >= 1168 && x <= 1180 && y >= 292 && y <= 462) {
                    return { handled: true, scrollArea: 'online', menuDrag: false };
                }
                if (x >= 34 && x <= 1164 && y >= 292 && y <= 462) {
                    return { handled: true, scrollArea: 'online', menuDrag: false };
                }
            }
            // Kartin bos alani: karti surukleyip tasimak icin.
            if (x >= 20 && x <= (W - 20) && y >= 80 && y <= (vrMenuCanvas.height - 30)) {
                return { handled: true, scrollArea: null, menuDrag: true };
            }
            return { handled: false, scrollArea: null, menuDrag: false };
        }

        function applyVrMenuScroll(area, deltaY) {
            const step = deltaY > 0 ? 1 : -1;
            if (area === 'leaderboard') {
                const total = document.querySelectorAll('#lb-list .lb-row').length;
                const maxStart = Math.max(0, total - 5);
                vrMenuLbScroll = Math.max(0, Math.min(maxStart, vrMenuLbScroll + step));
            } else if (area === 'online') {
                const total = onlineUsers.length;
                const maxStart = Math.max(0, total - 5);
                vrMenuOnlineScroll = Math.max(0, Math.min(maxStart, vrMenuOnlineScroll + step));
            } else if (area === 'map') {
                const total = BUILDINGS.length;
                const maxStart = Math.max(0, total - 8);
                vrMenuMapScroll = Math.max(0, Math.min(maxStart, vrMenuMapScroll + step));
            }
        }

        function getVrMenuScroll(area) {
            if (area === 'leaderboard') return vrMenuLbScroll;
            if (area === 'online') return vrMenuOnlineScroll;
            if (area === 'map') return vrMenuMapScroll;
            return 0;
        }

        function setVrMenuScroll(area, value) {
            const v = Math.round(value);
            if (area === 'leaderboard') {
                const maxStart = Math.max(0, document.querySelectorAll('#lb-list .lb-row').length - 5);
                vrMenuLbScroll = Math.max(0, Math.min(maxStart, v));
                return;
            }
            if (area === 'online') {
                const maxStart = Math.max(0, onlineUsers.length - 5);
                vrMenuOnlineScroll = Math.max(0, Math.min(maxStart, v));
                return;
            }
            if (area === 'map') {
                const maxStart = Math.max(0, BUILDINGS.length - 8);
                vrMenuMapScroll = Math.max(0, Math.min(maxStart, v));
            }
        }

        function setWaypointForBuilding(idx) {
            if (waypointMarker) {
                scene.remove(waypointMarker);
                waypointMarker.traverse((o) => {
                    if (o.material?.map) o.material.map.dispose?.();
                    o.material?.dispose?.();
                    o.geometry?.dispose?.();
                });
                waypointMarker = null;
            }
            waypointTargetIdx = idx;
            if (idx < 0 || !BUILDINGS[idx]) return;
            const b = BUILDINGS[idx];
            const root = new THREE.Group();
            // Bilincli olarak binanin "icinden" gorunmesi icin orta yukseklige koy.
            root.position.set(b.x, Math.max(2.1, (b.h || 6) * 0.45), b.z);
            root.userData.isWaypointMarker = true;

            const diamond = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.42, 0),
                new THREE.MeshBasicMaterial({
                    color: 0xffd247,
                    transparent: true,
                    opacity: 0.98,
                    depthWrite: false,
                    depthTest: false
                })
            );
            diamond.renderOrder = 995;
            root.add(diamond);

            const beam = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.12, 5.4, 12),
                new THREE.MeshBasicMaterial({
                    color: 0xffd247,
                    transparent: true,
                    opacity: 0.28,
                    depthWrite: false,
                    depthTest: false
                })
            );
            beam.renderOrder = 994;
            root.add(beam);

            const cv = document.createElement('canvas');
            cv.width = 512;
            cv.height = 128;
            const ctx = cv.getContext('2d');
            ctx.fillStyle = 'rgba(10,20,30,0.78)';
            ctx.fillRect(8, 16, 496, 96);
            ctx.strokeStyle = 'rgba(232,200,112,0.9)';
            ctx.lineWidth = 4;
            ctx.strokeRect(8, 16, 496, 96);
            ctx.fillStyle = '#ffe8a4';
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${String(b.name || 'Bina').slice(0, 28)}`, 256, 64);
            const tex = new THREE.CanvasTexture(cv);
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
            const label = new THREE.Sprite(mat);
            label.position.set(0, 2.0, 0);
            label.scale.set(5.6, 1.4, 1);
            label.renderOrder = 999;
            root.add(label);

            waypointMarker = root;
            scene.add(waypointMarker);
        }

        function collectVRGrabbables() {
            if (vrGrabbables.length) return;
            scene.traverse((o) => {
                if (o.userData?.vrGrabbable) vrGrabbables.push(o);
            });
        }

        function tryGrabObject(handedness) {
            if (!xrActive) return;
            collectVRGrabbables();
            const ctrl = handedness === 'left' ? xrCtrl0 : xrCtrl1;
            if (!ctrl) return;
            if (handedness === 'left' && xrGrabbedLeft) return;
            if (handedness === 'right' && xrGrabbedRight) return;
            const origin = new THREE.Vector3();
            ctrl.getWorldPosition(origin);
            let best = null, bestDist = 1.15;
            vrGrabbables.forEach((o) => {
                const wp = new THREE.Vector3();
                o.getWorldPosition(wp);
                const d = origin.distanceTo(wp);
                if (d < bestDist) { bestDist = d; best = o; }
            });
            if (!best) return;
            best.userData.prevParent = best.parent;
            ctrl.attach(best);
            best.position.set(0, -0.03, -0.2);
            best.rotation.set(0, 0, 0);
            if (best.userData?.ballId && mpClient) {
                const wp = new THREE.Vector3();
                best.getWorldPosition(wp);
                mpClient.sendBallState({
                    ballId: best.userData.ballId,
                    heldBy: localPlayerId || 'self',
                    x: wp.x,
                    y: wp.y,
                    z: wp.z
                });
            }
            if (handedness === 'left') xrGrabbedLeft = best;
            else xrGrabbedRight = best;
        }

        function releaseGrabbedObject(handedness) {
            const grabbed = handedness === 'left' ? xrGrabbedLeft : xrGrabbedRight;
            if (!grabbed) return;
            scene.attach(grabbed);
            const vel = ctrlTrack[handedness]?.velocity || new THREE.Vector3();
            if (grabbed.userData?.vrThrowable) {
                grabbed.userData.vrVel = vel.clone().multiplyScalar(1.35);
                if (!vrThrownBodies.includes(grabbed)) vrThrownBodies.push(grabbed);
                if (grabbed.userData?.ballId && mpClient) {
                    mpClient.sendBallState({
                        ballId: grabbed.userData.ballId,
                        heldBy: null,
                        x: grabbed.position.x,
                        y: grabbed.position.y,
                        z: grabbed.position.z,
                        vx: grabbed.userData.vrVel.x,
                        vy: grabbed.userData.vrVel.y,
                        vz: grabbed.userData.vrVel.z
                    });
                }
            }
            if (handedness === 'left') xrGrabbedLeft = null;
            else xrGrabbedRight = null;
        }

        function updateControllerVelocity(dt) {
            if (!xrCtrl0 || !xrCtrl1 || dt <= 0) return;
            [
                ['left', xrCtrl0],
                ['right', xrCtrl1]
            ].forEach(([side, ctrl]) => {
                const t = ctrlTrack[side];
                ctrl.getWorldPosition(t.curPos);
                if (t.prevPos) {
                    t.velocity.copy(t.curPos).sub(t.prevPos).multiplyScalar(1 / dt);
                }
                if (!t.prevPos) t.prevPos = t.curPos.clone();
                else t.prevPos.copy(t.curPos);
            });
        }

        function updateThrownBodies(dt) {
            if (!vrThrownBodies.length) return;
            for (let i = vrThrownBodies.length - 1; i >= 0; i--) {
                const b = vrThrownBodies[i];
                const v = b.userData?.vrVel;
                if (!v) { vrThrownBodies.splice(i, 1); continue; }
                v.y -= 14.5 * dt;
                b.position.addScaledVector(v, dt);
                if (b.position.y < 0.28) {
                    b.position.y = 0.28;
                    v.y *= -0.46;
                    v.x *= 0.84;
                    v.z *= 0.84;
                    if (v.lengthSq() < 0.06) {
                        v.set(0, 0, 0);
                        vrThrownBodies.splice(i, 1);
                    }
                }
            }
        }

        function applyRemoteBallState(payload) {
            const ball = vrBallsById.get(payload?.ballId);
            if (!ball) return;
            if (payload?.heldBy) {
                ball.userData.vrVel = null;
                const idx = vrThrownBodies.indexOf(ball);
                if (idx >= 0) vrThrownBodies.splice(idx, 1);
            }
            if (typeof payload.x === 'number') ball.position.x = payload.x;
            if (typeof payload.y === 'number') ball.position.y = payload.y;
            if (typeof payload.z === 'number') ball.position.z = payload.z;
            if (typeof payload.vx === 'number') {
                ball.userData.vrVel = new THREE.Vector3(payload.vx || 0, payload.vy || 0, payload.vz || 0);
                if (!vrThrownBodies.includes(ball)) vrThrownBodies.push(ball);
            }
        }

        function syncBallNetworkState(dt) {
            if (!mpClient) return;
            ballNetTimer += dt;
            if (ballNetTimer < 0.08) return;
            ballNetTimer = 0;
            vrBallsById.forEach((b, ballId) => {
                if (!b) return;
                const wp = new THREE.Vector3();
                b.getWorldPosition(wp);
                const lp = b.userData._lastNetPos || (b.userData._lastNetPos = new THREE.Vector3());
                if (lp.distanceToSquared(wp) < 0.00025 && !b.userData.vrVel) return;
                lp.copy(wp);
                mpClient.sendBallState({
                    ballId,
                    heldBy: (b === xrGrabbedLeft || b === xrGrabbedRight) ? (localPlayerId || 'self') : null,
                    x: wp.x,
                    y: wp.y,
                    z: wp.z,
                    vx: b.userData?.vrVel?.x || 0,
                    vy: b.userData?.vrVel?.y || 0,
                    vz: b.userData?.vrVel?.z || 0
                });
            });
        }

        /* VR sırasında HTML UI'ı gizle/göster */
        function hideHTMLForVR(hide) {
            const ids = ['crosshair','controls-hint','joy-base','joy-label','m-bldg-btn',
                         'm-map-btn','m-lb-btn'];
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

        function setupEscMenu() {
            const backdrop = document.createElement('div');
            backdrop.id = 'esc-menu-backdrop';
            backdrop.style.cssText = 'display:none;position:fixed;inset:0;z-index:145;background:rgba(5,10,20,.72);backdrop-filter:blur(4px);';
            document.body.appendChild(backdrop);
            escMenuBackdrop = backdrop;

            const card = document.createElement('div');
            card.id = 'esc-menu-card';
            card.style.cssText = 'display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:170;width:min(95vw,1180px);height:min(88vh,780px);padding:14px;';
            card.innerHTML = `
                <div class="esc-menu-shell">
                <div class="esc-menu-head">
                    <div class="esc-menu-tabs">
                        <button data-esc-tab="leaderboard" class="esc-tab-btn">🏆 Leaderboard</button>
                        <button data-esc-tab="online" class="esc-tab-btn">🟢 Online Kullanıcılar</button>
                        <button data-esc-tab="map" class="esc-tab-btn">🗺️ Harita</button>
                    </div>
                    <button id="esc-menu-close" class="esc-close-btn">Kapat ✕</button>
                </div>
                <div id="esc-menu-content" class="esc-menu-content"></div>
                </div>
            `;
            document.body.appendChild(card);
            escMenuCard = card;
            card.querySelectorAll('.esc-tab-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    setEscTab(btn.dataset.escTab || 'leaderboard');
                });
            });
            card.querySelector('#esc-menu-close')?.addEventListener('click', () => setEscMenuOpen(false));

            const mapWrap = document.createElement('div');
            mapWrap.id = 'esc-map-wrap';
            mapWrap.style.cssText = 'display:none;position:absolute;inset:0;border-radius:12px;padding:12px;';
            mapWrap.innerHTML = '<div style="color:#dfe8ff;font-size:12px;text-align:center;letter-spacing:.08em;margin-bottom:7px;">HARİTA</div>';
            const mapBody = document.createElement('div');
            mapBody.style.cssText = 'display:grid;grid-template-columns:minmax(240px,320px) 1fr;gap:12px;height:calc(100% - 24px);';
            const mapList = document.createElement('div');
            mapList.id = 'esc-map-building-list';
            mapList.style.cssText = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px;overflow:auto;';
            escMapBuildingList = mapList;
            mapBody.appendChild(mapList);
            escMapCanvas = document.createElement('canvas');
            escMapCanvas.width = escMapCanvas.height = escMapSize;
            escMapCanvas.style.cssText = 'display:block;width:min(100%, 92vh);height:auto;max-height:100%;margin:0 auto;border-radius:10px;box-shadow:0 8px 22px rgba(0,0,0,.55);';
            const mapCanvasWrap = document.createElement('div');
            mapCanvasWrap.style.cssText = 'display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:8px;';
            mapCanvasWrap.appendChild(escMapCanvas);
            mapBody.appendChild(mapCanvasWrap);
            mapWrap.appendChild(mapBody);
            escMapCtx = escMapCanvas.getContext('2d');

            const content = card.querySelector('#esc-menu-content');
            const l = document.getElementById('lb-panel');
            const o = document.getElementById('online-users-panel');
            if (l) { l.style.position = 'absolute'; l.style.inset = '0'; l.style.width = '100%'; l.style.maxWidth = '100%'; content?.appendChild(l); }
            if (o) { o.style.position = 'absolute'; o.style.inset = '0'; o.style.width = '100%'; o.style.maxWidth = '100%'; o.style.maxHeight = '100%'; o.style.overflowY = 'auto'; content?.appendChild(o); }
            content?.appendChild(mapWrap);
            renderEscMapBuildingList();
            setEscTab('leaderboard');
        }

        function renderEscMapBuildingList() {
            if (!escMapBuildingList) return;
            escMapBuildingList.innerHTML = `<div style="font-weight:700;color:#dfe8ff;margin-bottom:8px;">Binalar</div>`;
            BUILDINGS.forEach((b, i) => {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'esc-map-bldg-row';
                row.style.cssText = `display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:8px 10px;margin:0 0 6px;border-radius:8px;border:1px solid ${i === highlightIdx ? 'rgba(232,200,112,.7)' : 'rgba(255,255,255,.12)'};background:${i === highlightIdx ? 'rgba(232,200,112,.2)' : 'rgba(255,255,255,.04)'};color:#f3f7ff;cursor:pointer;`;
                row.innerHTML = `<span>${esc(b.name)}</span><span>${i === highlightIdx ? '✓' : ''}</span>`;
                row.addEventListener('click', () => {
                    highlightIdx = (highlightIdx === i) ? -1 : i;
                    renderEscMapBuildingList();
                    setWaypointForBuilding(highlightIdx);
                });
                escMapBuildingList.appendChild(row);
            });
        }

        function setEscTab(tab) {
            escMenuTab = tab;
            const l = document.getElementById('lb-panel');
            const o = document.getElementById('online-users-panel');
            const m = document.getElementById('esc-map-wrap');
            if (l) l.style.display = tab === 'leaderboard' ? 'block' : 'none';
            if (o) o.style.display = tab === 'online' ? 'block' : 'none';
            if (m) m.style.display = tab === 'map' ? 'block' : 'none';
            if (escMenuCard) {
                escMenuCard.querySelectorAll('.esc-tab-btn').forEach((btn) => {
                    btn.classList.toggle('active', btn.dataset.escTab === tab);
                });
            }
            if (tab === 'leaderboard') loadLeaderboard(currentLbGame);
            if (tab === 'map') renderEscMapBuildingList();
            updateVrMenuWindow();
        }

        function cycleEscTab(dir) {
            const cur = Math.max(0, escTabs.indexOf(escMenuTab));
            const next = (cur + dir + escTabs.length) % escTabs.length;
            setEscTab(escTabs[next]);
        }

        function setEscMenuOpen(open) {
            if (escMenuOpen === open) return;
            escMenuOpen = open;
            document.body.classList.toggle('esc-menu-open', open);
            if (xrActive) {
                if (escMenuBackdrop) escMenuBackdrop.style.display = 'none';
                if (escMenuCard) escMenuCard.style.display = 'none';
            } else {
                if (escMenuBackdrop) escMenuBackdrop.style.display = open ? 'block' : 'none';
                if (escMenuCard) escMenuCard.style.display = open ? 'block' : 'none';
            }
            if (open) setEscTab(escMenuTab);
            if (vrMenuWindow) vrMenuWindow.visible = !!(open && xrActive);
            if (vrSpotWindow) vrSpotWindow.visible = !open && !vrCharOpen && xrActive && !!activeSpot && !G.gameRunning;
            if (!open) {
                vrMenuDragLeft = null;
                vrMenuDragRight = null;
                vrMenuMoveLeft = null;
                vrMenuMoveRight = null;
                vrMenuPointerLeft = null;
                vrMenuPointerRight = null;
                vrSpotPointerLeft = null;
                vrSpotPointerRight = null;
            } else {
                updateVrMenuWindow();
            }
            if (open && isLocked && document.exitPointerLock) {
                suppressLockOverlay = true;
                document.exitPointerLock();
            }
            if (!open && !IS_MOB && !G.gameRunning && !xrActive) {
                suppressLockOverlay = true;
                setTimeout(() => renderer?.domElement?.requestPointerLock?.().catch?.(() => { }), 50);
            }
        }

        /* ════════════════ INIT ═════════════════════════ */
        async function initGame() {
            if (IS_MOB) mmSize = 130;

            // ── Renderer ────────────────────────────────
            renderer = new THREE.WebGLRenderer({
                antialias: !IS_MOB && !IS_QUEST,
                powerPreference: 'high-performance',
            });
            renderer.setSize(innerWidth, innerHeight);
            const targetPixelRatio = IS_QUEST ? 1.25 : (IS_MOB ? 1.5 : 2);
            renderer.setPixelRatio(Math.min(devicePixelRatio, targetPixelRatio));
            // VR'da (Quest) gölge maliyeti çok yüksek: kapat.
            renderer.shadowMap.enabled = !IS_MOB && !IS_QUEST;
            // VR'da BasicShadowMap çok sert gölge veriyor. Daha düşük çözünürlük + PCF ile yumuşat.
            renderer.shadowMap.type = IS_QUEST ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = IS_QUEST ? 0.92 : 1.05;
            // Daha sıcak gökyüzü tonu
            renderer.setClearColor(0x8cc0d8);
            renderer.domElement.style.cssText = 'position:fixed;top:0;left:0;z-index:1;width:100%;height:100%';
            document.body.appendChild(renderer.domElement);

            // ── Scene & Camera ──────────────────────────
            scene = new THREE.Scene();
            // Daha sıcak fog (uzakta maviyi biraz kır)
            scene.fog = new THREE.Fog(0x8bbfd7, 74, IS_MOB ? 128 : 176);
            camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .1, 500);
            initHandEnvironment();
            if (handEnvMap) scene.environment = handEnvMap;

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
            setupOnlineUsersPanel();
            setupEscMenu();
            setupMultiplayer();
            spawnNPCs();
            buildSidePanel();
            buildProxLabels();
            setupControls();
            setupLeaderboard();
            setupMiniGames();

            const mc = document.getElementById('minimap');
            mc.width = mc.height = mmSize; mc.style.width = mc.style.height = mmSize + 'px';
            mmCtx = mc.getContext('2d');

            if (!IS_MOB) {
                const b = document.getElementById('bldg-panel');
                if (b) b.style.display = 'none';
                if (onlineUsersPanel) onlineUsersPanel.style.display = 'none';
            }

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
        /** Kampüs gövdesi: hafif PBR; VR'da envMap daha da düşük olsun (parlama + maliyet). */
        function worldStd(color, roughness = 0.86, metalness = 0) {
            return new THREE.MeshStandardMaterial({
                color,
                roughness,
                metalness,
                envMapIntensity: IS_QUEST ? 0.03 : 0.1,
            });
        }

        function buildScene() {
            // Gölgeleri tamamen kapatmadan daha hafif yap: kontrastı azalt (daha fazla ortam ışığı, biraz daha düşük güneş).
            scene.add(new THREE.AmbientLight(
                0xffefe0,
                IS_QUEST ? 0.62 : (IS_MOB ? 0.58 : 0.42)
            ));
            const sun = new THREE.DirectionalLight(
                0xffd6b3,
                IS_QUEST ? 0.44 : (IS_MOB ? 0.64 : 0.56)
            );
            sun.position.set(72, 108, 46);
            if (!IS_MOB && !IS_QUEST) {
                sun.castShadow = true;
                // Daha az baskın / daha performanslı gölge
                sun.shadow.mapSize.set(IS_QUEST ? 512 : 1024, IS_QUEST ? 512 : 1024);
                sun.shadow.bias = -0.00022;
                sun.shadow.normalBias = 0.035;
                const sc = sun.shadow.camera;
                sc.left = sc.bottom = -150;
                sc.right = sc.top = 150;
                sc.far = 480;
            }
            scene.add(sun);
            scene.add(new THREE.HemisphereLight(
                0x9ac9dc,
                0x4a3a2b,
                IS_QUEST ? 0.42 : (IS_MOB ? 0.36 : 0.32)
            ));
            const gnd = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), worldStd(0x4a7c3c, 0.94));
            gnd.rotation.x = -Math.PI / 2;
            gnd.receiveShadow = !IS_MOB;
            scene.add(gnd);
            initVrBlobShadow();
            const pm = worldStd(0x8f8f82, 0.92);
            [[0, 0, 9, 175], [0, -46, 155, 9], [0, 14, 130, 7], [-28, -70, 7, 50], [28, -70, 7, 50]].forEach(([x, z, w, d]) =>
                addPlane(x, z, w, d, pm, 0.02));
            addPlane(0, -20, 30, 30, worldStd(0xa89872, 0.91), 0.03);
            // Rektörlük / Gap Yenev gerçek OBJ ile; kutu-bina olarak ekleme.
            BUILDINGS.forEach((b) => {
                if (b.name === 'Rektörlük' || b.name === 'Gap Yenev') return;
                addBuilding(b);
            });
            addRectorateBuilding();
            addEntranceMonument();
            addGapYenev();
            const isNearAnit = (x, z) => {
                const dx = x - (-24.0);
                const dz = z - 50.0;
                return (dx * dx + dz * dz) < (10.5 * 10.5);
            };
            const isNearGapYenev = (x, z) => {
                const dx = x - (36.0);
                const dz = z - 50.0;
                return (dx * dx + dz * dz) < (20.0 * 20.0);
            };
            [[-16, -22], [16, -22], [-16, -33], [16, -33], [-9, -9], [9, -9], [-32, 6], [32, 6], [-22, 44], [22, 44], [0, 50], [-44, -26], [44, -26], [-72, 6], [72, 6], [-26, -74], [26, -74], [0, -37], [-6, -35], [6, -35], [-45, 44], [45, 44], [-20, 58], [20, 58]]
                .filter(([x, z]) => !isNearAnit(x, z) && !isNearGapYenev(x, z))
                .forEach(([x, z]) => addTree(x, z, .85 + Math.random() * .4));
            [[6, 2], [-6, 2], [6, -28], [-6, -28], [6, -58], [-6, -58], [32, -24], [-32, -24], [32, -64], [-32, -64], [0, -2], [0, -50]]
                .filter(([x, z]) => !isNearGapYenev(x, z))
                .forEach(([x, z]) => addLamp(x, z));
        }

        function addEntranceMonument() {
            // Rektörlük (z~26) ile giriş kapısı (z~82) arasına, satranç tarafının tersine (x negatif) koy.
            // Ağaçlara dokunma; sadece anıtı konumlandır.
            const ANIT_X = -24.0;
            const ANIT_Z = 50.0;
            const tuneMaterial = (m) => {
                if (!m) return;
                // ANIT çok koyu görünmesin diye rengi biraz aç.
                if (m.color) {
                    m.color.r = Math.min(1, m.color.r * 1.35);
                    m.color.g = Math.min(1, m.color.g * 1.35);
                    m.color.b = Math.min(1, m.color.b * 1.35);
                }
                if (m.isMeshPhongMaterial) {
                    m.shininess = 6;
                    if (m.specular) m.specular.setHex(0x111111);
                    if (m.emissive) {
                        m.emissive.setHex(0x111111);
                    }
                    m.needsUpdate = true;
                } else if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
                    m.metalness = 0;
                    m.roughness = Math.max(0.86, m.roughness ?? 0.86);
                    m.envMapIntensity = 0;
                    if (m.emissive) {
                        m.emissive.setHex(0x111111);
                        m.emissiveIntensity = Math.max(0.08, m.emissiveIntensity ?? 0);
                    }
                    m.needsUpdate = true;
                }
            };

            const mtl = new MTLLoader();
            mtl.setPath('/models/');
            mtl.load(
                'ANIT.mtl',
                (materials) => {
                    materials.preload();
                    const objLoader = new OBJLoader();
                    objLoader.setMaterials(materials);
                    objLoader.setPath('/models/');
                    objLoader.load(
                        'ANIT.obj',
                        (root) => {
                            root.position.set(ANIT_X, 0, ANIT_Z);

                            // Ölçek: sahneyle uyumlu olması için target yüksekliğe göre ayarla
                            const box0 = new THREE.Box3().setFromObject(root);
                            const size0 = new THREE.Vector3();
                            box0.getSize(size0);
                            const targetH = 12;
                            const s = targetH / Math.max(0.001, size0.y);
                            root.scale.setScalar(s);

                            // Zemine oturt
                            const box1 = new THREE.Box3().setFromObject(root);
                            root.position.y += -box1.min.y;

                            // Materyal: parlamayı azalt + gölge
                            root.traverse((o) => {
                                if (!o?.isMesh) return;
                                o.castShadow = !IS_MOB && !IS_QUEST;
                                o.receiveShadow = !IS_MOB && !IS_QUEST;
                                if (Array.isArray(o.material)) o.material.forEach(tuneMaterial);
                                else tuneMaterial(o.material);
                            });

                            scene.add(root);

                            // Çarpışma: anıt daire formunda, AABB yerine daire collider kullan.
                            const box2 = new THREE.Box3().setFromObject(root);
                            const size2 = new THREE.Vector3();
                            box2.getSize(size2);
                            const cx = (box2.min.x + box2.max.x) * 0.5;
                            const cz = (box2.min.z + box2.max.z) * 0.5;
                            const r = Math.max(0.5, Math.min(size2.x, size2.z) * 0.5 - 0.6);
                            circleColliders.push({ x: cx, z: cz, r });
                        },
                        undefined,
                        (err) => console.error('ANIT.obj yüklenemedi:', err)
                    );
                },
                undefined,
                (err) => console.error('ANIT.mtl yüklenemedi:', err)
            );
        }

        function addGapYenev() {
            // ANIT'in zıttı: x pozitif tarafta, aynı bant (z~50).
            const X = 36.0;
            const Z = 50.0;
            const tuneMaterial = (m) => {
                if (!m) return;
                if (m.isMeshPhongMaterial) {
                    m.shininess = Math.min(10, m.shininess ?? 10);
                    if (m.specular) m.specular.setHex(0x111111);
                    m.needsUpdate = true;
                } else if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
                    m.metalness = 0;
                    m.roughness = Math.max(0.86, m.roughness ?? 0.86);
                    m.envMapIntensity = 0;
                    m.needsUpdate = true;
                }
            };

            const mtl = new MTLLoader();
            mtl.setPath('/models/');
            mtl.load(
                'Gap-Yenev.mtl',
                (materials) => {
                    materials.preload();
                    const objLoader = new OBJLoader();
                    objLoader.setMaterials(materials);
                    objLoader.setPath('/models/');
                    objLoader.load(
                        'Gap-Yenev.obj',
                        (root) => {
                            root.position.set(X, 0, Z);
                            // Saat yönü 30° (Y ekseni)
                            root.rotation.y = -Math.PI / 6;

                            // Ölçek: sahneye uydur (yükseklik hedefi)
                            const box0 = new THREE.Box3().setFromObject(root);
                            const size0 = new THREE.Vector3();
                            box0.getSize(size0);
                            const targetH = 4.5; // yarı yarıya
                            const s = targetH / Math.max(0.001, size0.y);
                            // X/Z sabit kalsın, sadece yükseklik (Y) artsın
                            const heightMul = 1.45;
                            root.scale.set(s, s * heightMul, s);

                            // Zemine oturt
                            const box1 = new THREE.Box3().setFromObject(root);
                            root.position.y += -box1.min.y;

                            root.traverse((o) => {
                                if (!o?.isMesh) return;
                                o.castShadow = !IS_MOB && !IS_QUEST;
                                o.receiveShadow = !IS_MOB && !IS_QUEST;
                                if (Array.isArray(o.material)) o.material.forEach(tuneMaterial);
                                else tuneMaterial(o.material);
                            });

                            scene.add(root);

                            // Basit çarpışma: daire collider
                            const box2 = new THREE.Box3().setFromObject(root);
                            const size2 = new THREE.Vector3();
                            box2.getSize(size2);
                            const cx = (box2.min.x + box2.max.x) * 0.5;
                            const cz = (box2.min.z + box2.max.z) * 0.5;
                            const r = Math.max(0.5, Math.min(size2.x, size2.z) * 0.5 - 0.6);
                            circleColliders.push({ x: cx, z: cz, r });
                        },
                        undefined,
                        (err) => console.error('Gap-Yenev.obj yüklenemedi:', err)
                    );
                },
                undefined,
                (err) => console.error('Gap-Yenev.mtl yüklenemedi:', err)
            );
        }

        function addRectorateBuilding() {
            const spec = BUILDINGS.find((b) => b.name === 'Rektörlük');
            if (!spec) return;

            const tuneMaterial = (mat) => {
                if (!mat) return;
                // OBJ/MTL çoğu zaman MeshPhongMaterial üretir (parlak/specular). Matlaştır.
                if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                    mat.metalness = 0;
                    mat.roughness = Math.max(0.85, mat.roughness ?? 0.85);
                    mat.envMapIntensity = 0;
                    mat.emissive?.setHex?.(0x000000);
                    mat.needsUpdate = true;
                } else if (mat.isMeshPhongMaterial) {
                    mat.shininess = 6;
                    if (mat.specular) mat.specular.setHex(0x111111);
                    mat.emissive?.setHex?.(0x000000);
                    mat.needsUpdate = true;
                } else if (mat.isMeshLambertMaterial) {
                    mat.emissive?.setHex?.(0x000000);
                    mat.needsUpdate = true;
                }
            };

            const mtlLoader = new MTLLoader();
            mtlLoader.setPath('/models/');
            mtlLoader.load(
                'Rektorluk-binasi.mtl',
                (materials) => {
                    materials.preload();

                    const objLoader = new OBJLoader();
                    objLoader.setMaterials(materials);
                    objLoader.setPath('/models/');
                    objLoader.load(
                        'Rektorluk-binasi.obj',
                        (root) => {
                            // OBJ'yi hedef ayak izine sığdır (yemekhane yerine), satrancın üstünü kapatmasın diye biraz daha güneye çek.
                            root.position.set(spec.x, 0, spec.z - 2);

                            // Ölçek: modelin bounding box'ına göre footprint'e sığdır
                            const box = new THREE.Box3().setFromObject(root);
                            const size = new THREE.Vector3();
                            box.getSize(size);
                            const safeSizeX = Math.max(0.0001, size.x);
                            const safeSizeZ = Math.max(0.0001, size.z);
                            const sx = (spec.w * 0.92) / safeSizeX;
                            const sz = (spec.d * 0.92) / safeSizeZ;
                            const s = Math.min(sx, sz);
                            root.scale.setScalar(s);

                            // Zemine oturt
                            const box2 = new THREE.Box3().setFromObject(root);
                            root.position.y += -box2.min.y;

                            if (!IS_MOB) {
                                root.traverse((o) => {
                                    if (o && o.isMesh) {
                                        o.castShadow = true;
                                        o.receiveShadow = true;
                                        if (Array.isArray(o.material)) o.material.forEach(tuneMaterial);
                                        else tuneMaterial(o.material);
                                    }
                                });
                            } else {
                                // Mobilde gölge yok; yine de parlaklığı kır.
                                root.traverse((o) => {
                                    if (o && o.isMesh) {
                                        if (Array.isArray(o.material)) o.material.forEach(tuneMaterial);
                                        else tuneMaterial(o.material);
                                    }
                                });
                            }

                            scene.add(root);

                            // Çarpışma AABB
                            const box3 = new THREE.Box3().setFromObject(root);
                            const shrinkX = 1.2;
                            // Rektörlüğün önündeki collider biraz daha kıs: +Z (ön) tarafını daha fazla kırp.
                            const shrinkZBack = 1.2;
                            const shrinkZFront = 3.0;
                            buildingAABBs.push({
                                x0: box3.min.x + shrinkX, x1: box3.max.x - shrinkX,
                                z0: box3.min.z + shrinkZBack, z1: box3.max.z - shrinkZFront
                            });
                        },
                        undefined,
                        (err) => console.error('Rektörlük OBJ yüklenemedi:', err)
                    );
                },
                undefined,
                (err) => console.error('Rektörlük MTL yüklenemedi:', err)
            );
        }

        function addPlane(x, z, w, d, mat, dy = 0) {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
            m.rotation.x = -Math.PI / 2;
            m.position.set(x, dy, z);
            m.receiveShadow = !IS_MOB;
            scene.add(m);
        }

        function addBuilding({ x, z, w, h, d, color }) {
            const mat = worldStd(color, 0.84);
            const body = bx(w, h, d, mat);
            body.position.set(x, h / 2, z);
            if (!IS_MOB) {
                body.castShadow = true;
                body.receiveShadow = true;
            }
            scene.add(body);
            const roof = bx(w + 0.6, 0.8, d + 0.6, worldStd(dk(color, 0.7), 0.88));
            roof.position.set(x, h + 0.4, z);
            if (!IS_MOB) {
                roof.castShadow = true;
                roof.receiveShadow = true;
            }
            scene.add(roof);
            const wm = new THREE.MeshStandardMaterial({
                color: 0x8eb6d8,
                transparent: true,
                opacity: 0.78,
                roughness: 0.22,
                metalness: 0.06,
                envMapIntensity: 0.26,
            });
            const cols = Math.max(2, Math.floor(w / 5)),
                rows = Math.max(1, Math.floor(h / 4));
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const w2 = bx(1.5, 1.2, 0.12, wm);
                    w2.position.set(x + (c - (cols - 1) / 2) * (w / cols), 2 + r * 3.3, z + d / 2 + 0.07);
                    if (!IS_MOB) w2.receiveShadow = true;
                    scene.add(w2);
                }
            }
            const door = bx(2.2, 3.2, 0.15, worldStd(dk(color, 0.5), 0.86));
            door.position.set(x, 1.6, z + d / 2 + 0.08);
            if (!IS_MOB) door.castShadow = true;
            scene.add(door);
            buildingAABBs.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
        }

        function addTree(x, z, s = 1) {
            const g = new THREE.Group();
            g.add(cl(0.22 * s, 0.32 * s, 2.5 * s, 7, 0x6b4a2a, 0, 1.25 * s, 0));
            const fc = worldStd(0x234d28, 0.9);
            [[2.4, 3.2], [1.85, 4.7], [1.2, 5.9]].forEach(([r, hy]) => {
                const sp = new THREE.Mesh(new THREE.SphereGeometry(r * s, IS_MOB ? 6 : 9, IS_MOB ? 5 : 7), fc);
                sp.position.set(0, hy * s, 0);
                if (!IS_MOB) sp.castShadow = true;
                g.add(sp);
            });
            g.position.set(x, 0, z);
            scene.add(g);
        }

        function addLamp(x, z) {
            scene.add(cl(0.07, 0.1, 5.5, 6, 0x444444, x, 2.75, z));
            const head = new THREE.Mesh(
                new THREE.SphereGeometry(0.3, 8, 8),
                new THREE.MeshStandardMaterial({
                    color: 0xe8d89a,
                    emissive: 0xc9b060,
                    emissiveIntensity: 0.3,
                    roughness: 0.55,
                    metalness: 0,
                    envMapIntensity: 0.06,
                })
            );
            head.position.set(x, 5.7, z);
            scene.add(head);
            if (!IS_MOB) {
                const pl = new THREE.PointLight(0xffe8b8, 0.36, 18, 1.4);
                pl.position.set(x, 5.5, z);
                scene.add(pl);
            }
        }

        /* ════════════════ INTERACTIVE 3D OBJECTS ═══════ */
        function addInteractiveObjects() {
            // Girişteki toplar kaldırıldı.
            // ── Masa Tenisi Masası ─────────────────────
            const tt = new THREE.Group();
            const tableTop = bx(3.5, 0.1, 2, worldStd(0x1a4e1a, 0.76));
            tableTop.position.set(0, 0.85, 0);
            tt.add(tableTop);
            const net = bx(3.5, 0.25, 0.05, worldStd(0xc6c6c6, 0.52));
            net.position.set(0, 1, 0);
            tt.add(net);
            [[-1.5, 0, -0.85], [1.5, 0, -0.85], [-1.5, 0, 0.85], [1.5, 0, 0.85]].forEach(([x, _y, z]) => {
                tt.add(cl(0.06, 0.06, 0.85, 4, 0x888888, x, 0.425, z));
            });
            const line = bx(0.05, 0.01, 2, worldStd(0xefefef, 0.32));
            line.position.set(0, 0.91, 0);
            tt.add(line);
            if (!IS_MOB) {
                tableTop.castShadow = true;
                net.castShadow = true;
            }
            const s = SPOTS[0].pos;
            tt.position.set(s.x, .0, s.z);
            scene.add(tt);
            addSpotMarker(s.x, s.z, '🏓');

            // ── Oyun Makinesi (Arcade Cabinet) ────────
            const arc = new THREE.Group();
            const body2 = bx(1.2, 2.2, 0.7, worldStd(0x16162a, 0.82));
            body2.position.set(0, 1.1, 0);
            arc.add(body2);
            const scr = bx(
                0.85,
                0.65,
                0.05,
                new THREE.MeshStandardMaterial({
                    color: 0x00cc88,
                    emissive: 0x00aa70,
                    emissiveIntensity: 0.4,
                    roughness: 0.42,
                    metalness: 0,
                    envMapIntensity: 0.05,
                })
            );
            scr.position.set(0, 1.55, 0.38);
            arc.add(scr);
            const cp = bx(1.1, 0.15, 0.5, worldStd(0x252538, 0.85));
            cp.position.set(0, 0.85, 0.2);
            arc.add(cp);
            [[-0.2, 0, 0.1], [0.1, 0, 0.05], [-0.3, 0, 0.05]].forEach(([bx2, by, bz]) => {
                const btn = new THREE.Mesh(
                    new THREE.SphereGeometry(0.06, 8, 8),
                    new THREE.MeshStandardMaterial({
                        color: 0xff3355,
                        emissive: 0xcc0018,
                        emissiveIntensity: 0.35,
                        roughness: 0.45,
                        metalness: 0,
                        envMapIntensity: 0.04,
                    })
                );
                btn.position.set(bx2, 0.93 + by, bz + 0.23);
                arc.add(btn);
            });
            const arcPos = SPOTS[1].pos;
            arc.position.set(arcPos.x, 0, arcPos.z); arc.rotation.y = Math.PI * .3;
            scene.add(arc);
            addSpotMarker(arcPos.x, arcPos.z, '🕹️');

            // ── Futbol Kalesi ──────────────────────────
            const goal = new THREE.Group();
            const gmat = worldStd(0xf5f5f5, 0.8);
            [-2, 2].forEach((ox) => {
                goal.add(cl(0.1, 0.1, 3, 8, 0xffffff, ox, 1.5, 0));
            });
            const bar = bx(4.2, 0.2, 0.2, gmat);
            bar.position.set(0, 3, 0);
            goal.add(bar);
            const netM = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.18,
                side: THREE.DoubleSide,
                roughness: 0.95,
                metalness: 0,
                envMapIntensity: 0.04,
            });
            const netBack = bx(4, 0.1, 2.8, netM);
            netBack.position.set(0, 1.5, -1.2);
            if (!IS_MOB) netBack.receiveShadow = true;
            goal.add(netBack);
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
                const ring = new THREE.Mesh(new THREE.CylinderGeometry(tRadii[i], tRadii[i], 0.05, 24), worldStd(col, 0.72));
                ring.rotation.x = Math.PI / 2;
                ring.position.set(0, 2.6, 0);
                archG.add(ring);
            });
            archG.add(bx(3.7, 0.12, 0.12, worldStd(0x8b4513, 0.88)));
            const archPos = SPOTS[3].pos;
            archG.position.set(archPos.x, 0, archPos.z);
            scene.add(archG);
            addSpotMarker(archPos.x, archPos.z, '🏹');

            // ── Basketbol Potası ──────────────────────────
            const bkG = new THREE.Group();
            bkG.add(cl(.12, .12, 4.5, 6, 0x888888, 0, 2.25, 0));
            const board = bx(
                1.8,
                1.2,
                0.08,
                new THREE.MeshStandardMaterial({
                    color: 0xd0d8f0,
                    transparent: true,
                    opacity: 0.74,
                    roughness: 0.35,
                    metalness: 0.04,
                    envMapIntensity: 0.12,
                })
            );
            board.position.set(0, 4.4, 0);
            bkG.add(board);
            const hoopMat = worldStd(0xff6600, 0.48, 0.12);
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

            // ── Satranç Masası (dekoratif; VR oynanabilir tahta anchor.y ayrı ayarlanır) ──
            const chPos = SPOTS.find((spt) => spt.game === 'ch')?.pos;
            if (chPos) {
                const chG = new THREE.Group();
                const tableTopCh = bx(3.2, 0.14, 3.2, worldStd(0x4c321e, 0.82));
                tableTopCh.position.set(0, 0.34, 0);
                chG.add(tableTopCh);
                const board = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 2.1), worldStd(0xe5d7b5, 0.78));
                board.position.set(0, 0.45, 0);
                chG.add(board);
                const legH = 0.27;
                const legY = legH * 0.5;
                [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]].forEach(([lx, lz]) => {
                    chG.add(cl(0.08, 0.08, legH, 6, 0x7a5c1e, lx, legY, lz));
                });
                chG.position.set(chPos.x, 0, chPos.z);
                scene.add(chG);
                addSpotMarker(chPos.x, chPos.z, '♟️');

            }
        }

        function addEntranceThrowBalls() {
            const ballsRoot = new THREE.Group();
            const baseZ = universityGateRoot?.position?.z ? universityGateRoot.position.z + 7 : 90;
            const mat = worldStd(0xff7a2d, 0.38, 0.04);
            for (let i = 0; i < 6; i++) {
                const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, IS_MOB ? 10 : 14, IS_MOB ? 10 : 14), mat);
                b.position.set(-2.2 + i * 0.9, 0.32, baseZ + (i % 2 ? 0.35 : 0));
                b.castShadow = !IS_MOB;
                b.userData.vrGrabbable = true;
                b.userData.vrThrowable = true;
                b.userData.ballId = `entrance_ball_${i}`;
                vrBallsById.set(b.userData.ballId, b);
                scene.add(b);
                ballsRoot.add(b);
            }
            scene.add(ballsRoot);
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
        const SPAWN_STORE_KEY = 'vrh_spawn_v1';

        function saveSpawnForReload() {
            try {
                const src = xrActive && xrRig ? xrRig : player;
                if (!src) return;
                const x = src.position?.x ?? 0;
                const z = src.position?.z ?? 108;
                const yaw = (src.rotation?.y ?? playerYaw ?? 0);
                localStorage.setItem(SPAWN_STORE_KEY, JSON.stringify({
                    x,
                    z,
                    yaw,
                    t: Date.now(),
                }));
            } catch (_) { /* ignore */ }
        }

        function readSavedSpawn() {
            try {
                const raw = localStorage.getItem(SPAWN_STORE_KEY);
                if (!raw) return null;
                const d = JSON.parse(raw);
                if (!d || typeof d !== 'object') return null;
                const x = Number(d.x);
                const z = Number(d.z);
                const yaw = Number(d.yaw);
                if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(yaw)) return null;
                return { x, z, yaw };
            } catch (_) {
                return null;
            }
        }

        function createPlayer() {
            player = makeHuman(0x1a4f8a, 0x1a2a3a);
            player.position.set(0, 0, 108);
            const saved = readSavedSpawn();
            if (saved) {
                player.position.set(saved.x, 0, saved.z);
                playerYaw = saved.yaw;
                player.rotation.y = saved.yaw;
            }
            player.userData.nameTag = createNameTag(localNickname);
            player.userData.nameTag.position.set(0, 2.7, 0);
            player.add(player.userData.nameTag);
            // ilk görünüm: applied
            applyAppliedAppearanceToPlayer();
            scene.add(player);
        }

        function createNameTag(text) {
            const cv = document.createElement('canvas');
            cv.width = 512;
            cv.height = 128;
            const ctx = cv.getContext('2d');
            ctx.clearRect(0, 0, cv.width, cv.height);
            ctx.fillStyle = 'rgba(0,0,0,0.62)';
            ctx.fillRect(16, 24, cv.width - 32, 72);
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = 'rgba(0,0,0,0.95)';
            ctx.lineWidth = 9;
            ctx.font = 'bold 44px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const nick = String(text || 'Oyuncu').slice(0, 24);
            ctx.strokeText(nick, cv.width / 2, cv.height / 2 + 2);
            ctx.fillText(nick, cv.width / 2, cv.height / 2 + 2);
            const tex = new THREE.CanvasTexture(cv);
            tex.needsUpdate = true;
            const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
            tag.scale.set(3.1, 0.78, 1);
            return tag;
        }

        function createRemotePlayer(p) {
            const avatar = makeHuman(0x3e9f5f, 0x1a2a3a);
            avatar.position.set(p.x || 0, p.y || 0, p.z || 108);
            avatar.rotation.y = p.yaw || 0;
            avatar.userData.target = new THREE.Vector3(avatar.position.x, avatar.position.y, avatar.position.z);
            avatar.userData.targetYaw = avatar.rotation.y;
            avatar.userData.appearance = {
                bc: Number.isFinite(p?.bc) ? p.bc : null,
                face: typeof p?.face === 'string' ? p.face : null
            };
            if (Number.isFinite(p?.bc)) setHumanBodyColor(avatar, p.bc);
            if (typeof p?.face === 'string') setHumanFace(avatar, p.face);
            avatar.userData.nameTag = createNameTag(p.nickname || 'Oyuncu');
            avatar.userData.nameTag.position.set(0, 2.7, 0);
            avatar.add(avatar.userData.nameTag);
            scene.add(avatar);
            remotePlayers.set(p.id, avatar);
        }

        function removeRemotePlayer(id) {
            const avatar = remotePlayers.get(id);
            if (!avatar) return;
            scene.remove(avatar);
            remotePlayers.delete(id);
        }

        function updateRemotePlayers(dt) {
            remotePlayers.forEach((avatar) => {
                const t = avatar.userData.target;
                if (!t) return;
                const prevX = avatar.position.x;
                const prevZ = avatar.position.z;
                avatar.position.lerp(t, Math.min(1, dt * 10));
                avatar.rotation.y += (avatar.userData.targetYaw - avatar.rotation.y) * Math.min(1, dt * 12);
                const moved = Math.hypot(avatar.position.x - prevX, avatar.position.z - prevZ) > 0.001;
                walkAnim(avatar, dt, moved);
                if (avatar.userData.nameTag) avatar.userData.nameTag.quaternion.copy(camera.quaternion);
            });
        }

        function getChessSpotPos() {
            return SPOTS.find((s) => s.game === 'ch')?.pos || { x: 10, z: 42 };
        }

        function getChessSeat(color) {
            const spot = getChessSpotPos();
            // VR satranç tahtasında (yaw=0) beyaz taşlar lokal z küçük tarafta başlar,
            // siyah taşlar lokal z büyük tarafta başlar. Bu yüzden oturma konumu:
            // Not: Three.js'de yaw=0 bakış yönü -Z'dir. Masaya (merkeze) dönük olmak için:
            // - Güneydeki oyuncu +Z'ye bakmalı -> yaw=PI
            // - Kuzeydeki oyuncu -Z'ye bakmalı -> yaw=0
            if (color === 'white') return { x: spot.x, z: spot.z - 3.2, yaw: Math.PI };
            return { x: spot.x, z: spot.z + 3.2, yaw: 0 };
        }

        function showChessNotice(text, ms = 1800) {
            if (!text) return;
            if (!chessNotifyEl) {
                const el = document.createElement('div');
                el.style.position = 'fixed';
                el.style.top = '18px';
                el.style.left = '50%';
                el.style.transform = 'translateX(-50%)';
                el.style.zIndex = '210';
                el.style.padding = '10px 16px';
                el.style.borderRadius = '10px';
                el.style.background = 'rgba(9,16,26,.85)';
                el.style.color = '#f4e6b4';
                el.style.border = '1px solid rgba(255,215,123,.4)';
                el.style.font = '600 15px Inter,Arial,sans-serif';
                el.style.backdropFilter = 'blur(6px)';
                el.style.display = 'none';
                document.body.appendChild(el);
                chessNotifyEl = el;
            }
            if (chessNotifyTimer) clearTimeout(chessNotifyTimer);
            chessNotifyEl.textContent = text;
            chessNotifyEl.style.display = 'block';
            chessNotifyTimer = setTimeout(() => {
                chessNotifyTimer = null;
                if (chessNotifyEl) chessNotifyEl.style.display = 'none';
            }, ms);
        }

        function ensureChessResultModal() {
            if (chessResultEl) return chessResultEl;
            const root = document.createElement('div');
            root.style.position = 'fixed';
            root.style.left = '50%';
            root.style.top = '50%';
            root.style.transform = 'translate(-50%, -50%)';
            root.style.zIndex = '270';
            root.style.minWidth = '360px';
            root.style.maxWidth = '85vw';
            root.style.padding = '16px';
            root.style.borderRadius = '12px';
            root.style.background = 'rgba(7,12,20,.92)';
            root.style.border = '1px solid rgba(150,185,255,.4)';
            root.style.color = '#e7f0ff';
            root.style.font = '14px Inter,Arial,sans-serif';
            root.style.display = 'none';
            root.innerHTML = `
                <div id="chess-res-title" style="font-weight:800;font-size:20px;margin-bottom:8px;"></div>
                <div id="chess-res-sub" style="opacity:.88;line-height:1.4;margin-bottom:14px;"></div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button id="chess-res-ok" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(126,255,164,.55);background:rgba(64,168,98,.22);color:#eaffef;cursor:pointer;">Tamam</button>
                </div>
            `;
            document.body.appendChild(root);
            root.querySelector('#chess-res-ok')?.addEventListener('click', () => closeChessResultModal());
            chessResultEl = root;
            return root;
        }

        function openChessResultModal({ title = '', sub = '' } = {}) {
            if (xrActive) return; // VR için ayrı pencere var
            const root = ensureChessResultModal();
            root.querySelector('#chess-res-title').textContent = title || 'Oyun bitti';
            root.querySelector('#chess-res-sub').textContent = sub || '';
            chessResultOpen = true;
            root.style.display = 'block';
        }

        function closeChessResultModal() {
            chessResultOpen = false;
            if (chessResultEl) chessResultEl.style.display = 'none';
        }

        function ensureChessExitConfirm() {
            if (chessExitConfirmEl) return chessExitConfirmEl;
            const root = document.createElement('div');
            root.style.position = 'fixed';
            root.style.left = '50%';
            root.style.top = '50%';
            root.style.transform = 'translate(-50%, -50%)';
            root.style.zIndex = '260';
            root.style.minWidth = '340px';
            root.style.maxWidth = '80vw';
            root.style.padding = '16px';
            root.style.borderRadius = '12px';
            root.style.background = 'rgba(7,12,20,.9)';
            root.style.border = '1px solid rgba(150,185,255,.4)';
            root.style.color = '#e7f0ff';
            root.style.font = '14px Inter,Arial,sans-serif';
            root.style.display = 'none';
            root.innerHTML = `
                <div style="font-weight:700;font-size:18px;margin-bottom:6px;">Satranç Alanı Dışı</div>
                <div style="opacity:.88;line-height:1.4;margin-bottom:12px;">Çıkmak istediğine emin misin?</div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button id="chess-exit-no" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#dce8ff;cursor:pointer;">Hayır</button>
                    <button id="chess-exit-yes" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,168,150,.35);background:rgba(255,88,56,.2);color:#ffd5cb;cursor:pointer;">Evet</button>
                </div>
            `;
            document.body.appendChild(root);
            root.querySelector('#chess-exit-no')?.addEventListener('click', () => {
                chessExitConfirmOpen = false;
                root.style.display = 'none';
            });
            root.querySelector('#chess-exit-yes')?.addEventListener('click', () => {
                const mid = onlineChess.matchId;
                if (mid && mpClient?.confirmExitMatch) mpClient.confirmExitMatch(mid);
                chessExitConfirmOpen = false;
                root.style.display = 'none';
            });
            chessExitConfirmEl = root;
            return root;
        }

        function openChessExitConfirm() {
            if (!onlineChess.active || chessExitConfirmOpen) return;
            // VR'da HTML modal görünmez; VR içinde ayrı bir pencere göster.
            if (xrActive) {
                chessExitConfirmOpen = true;
                initVrChessExitWindow();
                updateVrChessExitWindow();
                if (vrChessExitWindow) vrChessExitWindow.visible = true;
                return;
            }
            const root = ensureChessExitConfirm();
            root.style.display = 'block';
            chessExitConfirmOpen = true;
        }

        function closeChessExitConfirm() {
            chessExitConfirmOpen = false;
            if (chessExitConfirmEl) chessExitConfirmEl.style.display = 'none';
            if (vrChessExitWindow) vrChessExitWindow.visible = false;
            vrChessExitPointerLeft = null;
            vrChessExitPointerRight = null;
        }

        function openVrChessResult({ title = '', sub = '' } = {}) {
            vrChessResultText = String(title || '');
            vrChessResultSub = String(sub || '');
            vrChessResultOpen = true;
            initVrChessResultWindow();
            updateVrChessResultWindow();
            if (vrChessResultWindow) vrChessResultWindow.visible = true;
        }

        function closeVrChessResult() {
            vrChessResultOpen = false;
            if (vrChessResultWindow) vrChessResultWindow.visible = false;
            vrChessResultPointerLeft = null;
            vrChessResultPointerRight = null;
        }

        function initVrChessResultWindow() {
            if (vrChessResultWindow || !xrRig) return;
            vrChessResultCanvas = document.createElement('canvas');
            vrChessResultCanvas.width = 900;
            vrChessResultCanvas.height = 420;
            vrChessResultCtx = vrChessResultCanvas.getContext('2d');
            vrChessResultTexture = new THREE.CanvasTexture(vrChessResultCanvas);
            const mat = new THREE.MeshBasicMaterial({ map: vrChessResultTexture, transparent: true, side: THREE.DoubleSide });
            vrChessResultWindow = new THREE.Mesh(makeCurvedMenuGeometry(1.42, 0.66, 24, 0.18), mat);
            vrChessResultWindow.position.set(0, 1.32, -1.72);
            vrChessResultWindow.visible = false;
            xrRig.add(vrChessResultWindow);
        }

        function updateVrChessResultWindow() {
            if (!vrChessResultCtx || !vrChessResultTexture || !vrChessResultCanvas) return;
            const c = vrChessResultCtx;
            const W = vrChessResultCanvas.width;
            const H = vrChessResultCanvas.height;
            c.clearRect(0, 0, W, H);
            c.fillStyle = 'rgba(7,12,20,.92)';
            c.fillRect(0, 0, W, H);

            c.fillStyle = '#e7f0ff';
            c.font = 'bold 42px Arial';
            c.fillText(vrChessResultText || 'Oyun bitti', 36, 78);
            c.fillStyle = '#bcd6ff';
            c.font = '24px Arial';
            if (vrChessResultSub) c.fillText(vrChessResultSub, 36, 124);

            const btnW = 320;
            const btnH = 112;
            const btnX = (W - btnW) / 2;
            const btnY = 200;
            c.fillStyle = 'rgba(64, 168, 98, 0.30)';
            c.fillRect(btnX, btnY, btnW, btnH);
            c.strokeStyle = 'rgba(126, 255, 164, 0.92)';
            c.lineWidth = 3;
            c.strokeRect(btnX, btnY, btnW, btnH);
            c.fillStyle = '#eaffef';
            c.font = 'bold 48px Arial';
            c.fillText('TAMAM', btnX + 72, btnY + 74);

            const reloadY = btnY + btnH + 18;
            c.fillStyle = 'rgba(90, 140, 255, 0.22)';
            c.fillRect(btnX, reloadY, btnW, btnH);
            c.strokeStyle = 'rgba(140, 190, 255, 0.85)';
            c.lineWidth = 3;
            c.strokeRect(btnX, reloadY, btnW, btnH);
            c.fillStyle = '#e9f2ff';
            c.font = 'bold 34px Arial';
            c.fillText('YENİLE', btnX + 78, reloadY + 72);
            c.fillStyle = '#bcd6ff';
            c.font = '20px Arial';
            c.fillText('Aynı yerden başla', btnX + 78, reloadY + 100);

            c.fillStyle = '#9ed3ff';
            c.font = '22px Arial';
            c.fillText('Trigger / A / X ile tikla', 36, H - 32);

            if (vrChessResultPointerLeft) {
                c.beginPath();
                c.strokeStyle = '#59c7ff';
                c.lineWidth = 3;
                c.arc(vrChessResultPointerLeft.x, vrChessResultPointerLeft.y, 13, 0, Math.PI * 2);
                c.stroke();
            }
            if (vrChessResultPointerRight) {
                c.beginPath();
                c.strokeStyle = '#8cff8c';
                c.lineWidth = 3;
                c.arc(vrChessResultPointerRight.x, vrChessResultPointerRight.y, 13, 0, Math.PI * 2);
                c.stroke();
            }
            vrChessResultTexture.needsUpdate = true;
        }

        function updateVrChessResultTransform(dt) {
            if (!xrActive || !vrChessResultOpen || !vrChessResultWindow || !vrChessResultWindow.visible || !xrRig) return;
            if (!renderer?.xr || !camera) return;
            const xrCam = renderer.xr.getCamera(camera);
            if (!xrCam) return;

            const camPos = new THREE.Vector3();
            const fwd = new THREE.Vector3();
            xrCam.getWorldPosition(camPos);
            xrCam.getWorldDirection(fwd);

            // Kameranın 1.7m önüne, hafif aşağıya koy (konfor için).
            const targetWorld = camPos.clone()
                .add(fwd.multiplyScalar(1.7))
                .add(new THREE.Vector3(0, -0.10, 0));

            // xrRig local uzayına çevir.
            const targetLocal = xrRig.worldToLocal(targetWorld.clone());

            const k = 1 - Math.exp(-dt * 10);
            vrChessResultWindow.position.x += (targetLocal.x - vrChessResultWindow.position.x) * k;
            vrChessResultWindow.position.y += (targetLocal.y - vrChessResultWindow.position.y) * k;
            vrChessResultWindow.position.z += (targetLocal.z - vrChessResultWindow.position.z) * k;

            // Pencere kameraya baksın.
            const lookLocal = xrRig.worldToLocal(camPos.clone());
            vrChessResultWindow.lookAt(lookLocal);
        }

        function getVrChessResultHit(src, session) {
            if (!vrChessResultOpen || !vrChessResultWindow?.visible || !vrChessResultCanvas) return null;
            const ctrl = getVrControllerForSource(session, src);
            if (!ctrl) return null;
            const origin = new THREE.Vector3();
            const dir = new THREE.Vector3();
            ctrl.getWorldPosition(origin);
            ctrl.getWorldDirection(dir);
            dir.negate().normalize();
            const hit = new THREE.Raycaster(origin, dir).intersectObject(vrChessResultWindow, false)[0];
            if (!hit?.uv) return null;
            return {
                x: hit.uv.x * vrChessResultCanvas.width,
                y: (1 - hit.uv.y) * vrChessResultCanvas.height
            };
        }

        function clickVrChessResultAt(hit) {
            if (!hit || !vrChessResultOpen || !vrChessResultCanvas) return false;
            const x = hit.x;
            const y = hit.y;
            const W = vrChessResultCanvas.width;
            const btnW = 320;
            const btnH = 112;
            const btnX = (W - btnW) / 2;
            const btnY = 200;
            const reloadY = btnY + btnH + 18;
            const inOk = x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH;
            const inReload = x >= btnX && x <= btnX + btnW && y >= reloadY && y <= reloadY + btnH;
            if (!inOk && !inReload) return false;

            if (inReload) {
                saveSpawnForReload();
                vrInputCooldownUntil = performance.now() + 450;
                try { location.reload(); } catch (_) { /* ignore */ }
                return true;
            }

            closeVrChessResult();
            softResetChessForReplay();
            vrInputCooldownUntil = performance.now() + 450;
            return true;
        }

        function initVrChessExitWindow() {
            if (vrChessExitWindow || !xrRig) return;
            vrChessExitCanvas = document.createElement('canvas');
            vrChessExitCanvas.width = 900;
            vrChessExitCanvas.height = 420;
            vrChessExitCtx = vrChessExitCanvas.getContext('2d');
            vrChessExitTexture = new THREE.CanvasTexture(vrChessExitCanvas);
            const mat = new THREE.MeshBasicMaterial({ map: vrChessExitTexture, transparent: true, side: THREE.DoubleSide });
            vrChessExitWindow = new THREE.Mesh(makeCurvedMenuGeometry(1.42, 0.66, 24, 0.18), mat);
            vrChessExitWindow.position.set(0, 1.32, -1.72);
            vrChessExitWindow.visible = false;
            xrRig.add(vrChessExitWindow);
        }

        function updateVrChessExitWindow() {
            if (!vrChessExitCtx || !vrChessExitTexture || !vrChessExitCanvas) return;
            const c = vrChessExitCtx;
            const W = vrChessExitCanvas.width;
            const H = vrChessExitCanvas.height;
            c.clearRect(0, 0, W, H);
            c.fillStyle = 'rgba(7,12,20,.92)';
            c.fillRect(0, 0, W, H);

            c.fillStyle = '#ffdda0';
            c.font = 'bold 34px Arial';
            c.fillText('Satranç Alanı Dışı', 36, 62);
            c.fillStyle = '#e7f0ff';
            c.font = '24px Arial';
            c.fillText('Oyundan çıkmak istiyor musun?', 36, 110);

            const btnW = (W - 36 * 3) / 2;
            const btnH = 116;
            const yesX = 36;
            const noX = 36 * 2 + btnW;
            const btnY = 170;

            c.fillStyle = 'rgba(255,88,56,.22)';
            c.fillRect(yesX, btnY, btnW, btnH);
            c.strokeStyle = 'rgba(255,168,150,.55)';
            c.lineWidth = 3;
            c.strokeRect(yesX, btnY, btnW, btnH);
            c.fillStyle = '#ffd5cb';
            c.font = 'bold 46px Arial';
            c.fillText('EVET', yesX + btnW / 2 - 60, btnY + 74);
            c.font = '20px Arial';
            c.fillStyle = '#ffcfbf';
            c.fillText('Çık ve rakip kazansın', yesX + 28, btnY + 108);

            c.fillStyle = 'rgba(255,255,255,.08)';
            c.fillRect(noX, btnY, btnW, btnH);
            c.strokeStyle = 'rgba(180,210,255,.35)';
            c.lineWidth = 3;
            c.strokeRect(noX, btnY, btnW, btnH);
            c.fillStyle = '#dce8ff';
            c.font = 'bold 46px Arial';
            c.fillText('HAYIR', noX + btnW / 2 - 78, btnY + 74);
            c.font = '20px Arial';
            c.fillStyle = '#bcd6ff';
            c.fillText('Devam et', noX + 28, btnY + 108);

            c.fillStyle = '#9ed3ff';
            c.font = '22px Arial';
            c.fillText('Trigger / A / X ile tikla', 36, H - 32);

            if (vrChessExitPointerLeft) {
                c.beginPath();
                c.strokeStyle = '#59c7ff';
                c.lineWidth = 3;
                c.arc(vrChessExitPointerLeft.x, vrChessExitPointerLeft.y, 13, 0, Math.PI * 2);
                c.stroke();
            }
            if (vrChessExitPointerRight) {
                c.beginPath();
                c.strokeStyle = '#8cff8c';
                c.lineWidth = 3;
                c.arc(vrChessExitPointerRight.x, vrChessExitPointerRight.y, 13, 0, Math.PI * 2);
                c.stroke();
            }
            vrChessExitTexture.needsUpdate = true;
        }

        function getVrChessExitHit(src, session) {
            if (!chessExitConfirmOpen || !vrChessExitWindow?.visible || !vrChessExitCanvas) return null;
            const ctrl = getVrControllerForSource(session, src);
            if (!ctrl) return null;
            const origin = new THREE.Vector3();
            const dir = new THREE.Vector3();
            ctrl.getWorldPosition(origin);
            ctrl.getWorldDirection(dir);
            dir.negate().normalize();
            const hit = new THREE.Raycaster(origin, dir).intersectObject(vrChessExitWindow, false)[0];
            if (!hit?.uv) return null;
            return {
                x: hit.uv.x * vrChessExitCanvas.width,
                y: (1 - hit.uv.y) * vrChessExitCanvas.height
            };
        }

        function clickVrChessExitAt(hit) {
            if (!hit || !chessExitConfirmOpen || !vrChessExitCanvas) return false;
            const x = hit.x;
            const y = hit.y;
            const W = vrChessExitCanvas.width;
            const btnW = (W - 36 * 3) / 2;
            const btnH = 116;
            const yesX = 36;
            const noX = 36 * 2 + btnW;
            const btnY = 170;

            const inYes = x >= yesX && x <= yesX + btnW && y >= btnY && y <= btnY + btnH;
            const inNo = x >= noX && x <= noX + btnW && y >= btnY && y <= btnY + btnH;
            if (!inYes && !inNo) return false;

            if (inYes) {
                const mid = onlineChess.matchId;
                if (mid && mpClient?.confirmExitMatch) mpClient.confirmExitMatch(mid);
                closeChessExitConfirm();
                // Sunucudan "match ended" gelmesi biraz sürebilir.
                // Bu arada oyuncu masaya tekrar yaklaşınca VR spot penceresi çıkabilsin diye
                // oyunu lokal olarak hemen kapat.
                if (G.gameRunning) endGame(-1);
                mpClient?.getChessQueue?.();
                vrInputCooldownUntil = performance.now() + 450;
                return true;
            }
            if (inNo) {
                closeChessExitConfirm();
                vrInputCooldownUntil = performance.now() + 350;
                return true;
            }
            return false;
        }

        function isInsideChessBoundary(x, z) {
            if (!onlineChess.active) return true;
            const spot = getChessSpotPos();
            const dx = x - spot.x;
            const dz = z - spot.z;
            return dx * dx + dz * dz <= 8.3 * 8.3;
        }

        function updateChessQueueUi() {
            if (activeSpot?.game !== 'ch') return;
            const titleEl = document.getElementById('ip-title');
            const subEl = document.getElementById('ip-sub');
            const yesEl = document.getElementById('ip-yes');
            const noEl = document.getElementById('ip-no');
            if (!titleEl || !subEl || !yesEl || !noEl) return;
            if (onlineChess.active) {
                titleEl.textContent = 'Online satranç maçın aktif';
                subEl.textContent = `Renk: ${onlineChess.myColor === 'white' ? 'Beyaz' : 'Siyah'}`;
                yesEl.textContent = 'Maça Dön';
                noEl.textContent = 'Kapat';
                return;
            }
            if (onlineChess.queued) {
                titleEl.textContent = 'Kuyrukta bekliyorsun';
                subEl.textContent = 'Beklerken kampüste gezmeye devam edebilirsin.';
                yesEl.textContent = 'Kuyruktan Çık';
                noEl.textContent = 'Kapat';
                return;
            }
            if (onlineChess.waitingPlayer && !isWaitingPlayerSelf()) {
                titleEl.textContent = `Kuyrukta: ${onlineChess.waitingPlayer.username}`;
                subEl.textContent = 'Oyuncu seni bekliyor';
                yesEl.textContent = 'Şimdi Oynayın';
                noEl.textContent = 'Kapat';
                return;
            }
            titleEl.textContent = 'Online satranç oynamak ister misin?';
            subEl.textContent = 'Şu an oyun bekleyen kimse yok';
            yesEl.textContent = 'İstek Oluştur';
            noEl.textContent = 'Hayır';
        }

        function isWaitingPlayerSelf() {
            const wp = onlineChess.waitingPlayer;
            if (!wp) return false;
            if (localUserId != null && Number(wp.userId) === Number(localUserId)) return true;
            const a = String(wp.username || '').trim().toLowerCase();
            const b = String(localNickname || '').trim().toLowerCase();
            return !!a && !!b && a === b;
        }

        function requestChessQueueState(force = false) {
            if (!mpClient?.getChessQueue) return;
            const now = performance.now();
            if (!force && now - chessQueueLastRequestAt < 850) return;
            chessQueueLastRequestAt = now;
            mpClient.getChessQueue();
        }

        function getVrSpotPrimaryButtonState() {
            if (activeSpot?.game !== 'ch') return { label: 'OYNA', sub: 'Oyunu baslat', mode: 'default' };
            if (onlineChess.active) {
                return { label: 'MACA DON', sub: onlineChess.myColor === 'white' ? 'Rol: BEYAZ' : 'Rol: SIYAH', mode: 'resume' };
            }
            if (onlineChess.queued) {
                return { label: 'KUYRUKTAN CIK', sub: 'Beklerken kampuste gezebilirsin', mode: 'leave' };
            }
            if (onlineChess.waitingPlayer && !isWaitingPlayerSelf()) {
                return {
                    label: 'SIMDI OYNAYIN',
                    sub: `Kuyrukta: ${onlineChess.waitingPlayer.username}`,
                    mode: 'join'
                };
            }
            return {
                label: 'ISTEK OLUSTUR',
                sub: 'Kuyrukta beklemeye basla',
                mode: 'queue'
            };
        }

        function applyChessTeleport() {
            if (!onlineChess.active) return;
            const seat = getChessSeat(onlineChess.myColor || 'white');
            if (player) {
                player.position.x = seat.x;
                player.position.z = seat.z;
            }
            playerYaw = seat.yaw;
            if (xrRig) {
                xrRig.position.x = seat.x;
                xrRig.position.z = seat.z;
                xrRig.rotation.y = seat.yaw;
            }
        }

        function setupMultiplayer() {
            mpClient = createMultiplayerClient({
                nickname: localNickname,
                username: localNickname,
                sessionToken: localSessionToken
            }, {
                onRoomFull: () => alert('Oda dolu: Şimdilik en fazla 50 oyuncu destekleniyor.'),
                onAuthError: (msg) => alert(msg || 'Oturum doğrulanamadı, tekrar giriş yap.'),
                onSelfInit: ({ id, players }) => {
                    localPlayerId = id;
                    players.forEach((p) => {
                        if (p.id === localPlayerId) {
                            localUserId = p.userId || null;
                            player.position.set(p.x, p.y, p.z);
                            playerYaw = p.yaw || 0;
                            // Sunucudan görünüm geldiyse uygula (yoksa varsayılan kalır)
                            if (Number.isFinite(p?.bc)) {
                                const idx = BODY_COLORS.findIndex((c) => c.hex === p.bc);
                                if (idx >= 0) appearanceApplied.bodyIdx = idx;
                            }
                            if (typeof p?.face === 'string') {
                                const idx = FACE_PRESETS.findIndex((f) => f.id === p.face);
                                if (idx >= 0) appearanceApplied.faceIdx = idx;
                            }
                            applyAppliedAppearanceToPlayer();
                            return;
                        }
                        if (!remotePlayers.has(p.id)) createRemotePlayer(p);
                    });
                    requestChessQueueState(true);
                },
                onPlayerJoined: (p) => {
                    if (p.id === localPlayerId || remotePlayers.has(p.id)) return;
                    createRemotePlayer(p);
                },
                onPlayerMoved: (p) => {
                    if (p.id === localPlayerId) return;
                    const avatar = remotePlayers.get(p.id);
                    if (!avatar) {
                        createRemotePlayer(p);
                        return;
                    }
                    avatar.userData.target.set(p.x, p.y, p.z);
                    avatar.userData.targetYaw = p.yaw || 0;
                    const nextBc = Number.isFinite(p?.bc) ? p.bc : null;
                    const nextFace = typeof p?.face === 'string' ? p.face : null;
                    const cur = avatar.userData.appearance || {};
                    if (nextBc !== null && cur.bc !== nextBc) {
                        cur.bc = nextBc;
                        setHumanBodyColor(avatar, nextBc);
                    }
                    if (nextFace && cur.face !== nextFace) {
                        cur.face = nextFace;
                        setHumanFace(avatar, nextFace);
                    }
                    avatar.userData.appearance = cur;
                },
                onPlayerLeft: (id) => removeRemotePlayer(id),
                onOnlineUsers: (users) => {
                    onlineUsers = users;
                    renderOnlineUsersPanel();
                    updateVrMenuWindow();
                },
                onBallState: (payload) => {
                    applyRemoteBallState(payload);
                },
                onChessQueueState: (payload) => {
                    onlineChess.waitingPlayer = payload?.waitingPlayer || null;
                    onlineChess.totalWaiting = payload?.totalWaiting || 0;
                    onlineChess.queued = !!payload?.selfQueued;
                    if (activeSpot?.game === 'ch') {
                        updateChessQueueUi();
                        updateVrSpotWindow();
                    }
                },
                onChessMatchStarted: (payload) => {
                    onlineChess.active = true;
                    onlineChess.queued = false;
                    onlineChess.matchId = payload.matchId;
                    onlineChess.myColor = payload.yourColor;
                    onlineChess.white = payload.white;
                    onlineChess.black = payload.black;
                    onlineChess.lastState = payload;
                    applyChessTeleport();
                    if (!G.gameRunning) {
                        const chSpot = SPOTS.find((s) => s.game === 'ch');
                        if (chSpot) {
                            startGame('ch', chSpot.id, chSpot.title, {
                                mode: 'pvp',
                                matchId: payload.matchId,
                                matchPayload: payload
                            });
                        }
                    }
                    updateChessQueueUi();
                    updateVrSpotWindow();
                },
                onChessMatchResumed: (payload) => {
                    onlineChess.active = true;
                    onlineChess.queued = false;
                    onlineChess.matchId = payload.matchId;
                    onlineChess.myColor = payload.yourColor;
                    onlineChess.white = payload.white;
                    onlineChess.black = payload.black;
                    onlineChess.lastState = payload;
                    applyChessTeleport();
                    if (!G.gameRunning) {
                        const chSpot = SPOTS.find((s) => s.game === 'ch');
                        if (chSpot) {
                            startGame('ch', chSpot.id, chSpot.title, {
                                mode: 'pvp',
                                matchId: payload.matchId,
                                matchPayload: payload
                            });
                        }
                    }
                },
                onChessStateUpdate: (payload) => {
                    onlineChess.lastState = payload;
                    if (payload.checkBy && payload.checkedPlayer) {
                        showChessNotice(`${payload.checkBy} ${payload.checkedPlayer} oyuncusuna şah çekti`, 1600);
                    }
                    if (currentGame?.onChessStateUpdate) currentGame.onChessStateUpdate(payload);
                    if (vrChessStandalone?.onServerStateUpdate) vrChessStandalone.onServerStateUpdate(payload);
                },
                onChessMatchEnded: (payload) => {
                    showChessNotice(payload?.message || 'Oyun bitti', 2300);
                    onlineChess.active = false;
                    onlineChess.queued = false;
                    onlineChess.matchId = null;
                    onlineChess.lastState = null;
                    if (currentGame?.onChessMatchEnded) currentGame.onChessMatchEnded(payload);
                    if (vrChessStandalone?.onMatchEnded) vrChessStandalone.onMatchEnded(payload);
                    // Satranç sahnesini mutlaka sıfırla (bazı akışlarda sahnede kalabiliyordu).
                    if (vrChessStandalone) clearVrChess();
                    // VR'da maç bitince (rakip çıktı / mat) oyunu hemen kapat ki masaya yaklaşınca tekrar prompt çıksın.
                    // endGame(0) score modal tetikleyebilir; burada skor kaydı satranç için sunucuda yapılıyor.
                    closeChessExitConfirm();
                    // Maç bitince VR/PC sonuç ekranı (reason boş / DB alanı farklı gelse bile panel çıksın).
                    const reason = String(payload?.reason || '').toLowerCase();
                    const winnerId = payload?.winnerUserId != null ? Number(payload.winnerUserId) : null;
                    const me = localUserId != null ? Number(localUserId) : null;
                    const winnerName = String(payload?.winnerUsername || '').trim().toLowerCase();
                    const meName = String(localNickname || '').trim().toLowerCase();
                    const iWon = (winnerId != null && me != null && winnerId === me) || (!!winnerName && !!meName && winnerName === meName);
                    let endTitle = 'Oyun bitti';
                    let endSub = String(payload?.message || 'Maç sona erdi.');
                    if (reason === 'stalemate') {
                        endTitle = 'Berabere!';
                        endSub = payload?.message || 'Oyun berabere bitti.';
                    } else if (reason === 'checkmate' || reason === 'exit' || reason === 'disconnect' || reason === 'resign') {
                        endTitle = iWon ? 'Kazandın!' : 'Kaybettin!';
                        endSub = iWon ? 'Tebrikler (50 puan)' : (payload?.message || 'Bir dahaki sefere!');
                    } else if (winnerId != null && me != null) {
                        endTitle = iWon ? 'Kazandın!' : 'Kaybettin!';
                        endSub = payload?.message || endSub;
                    }
                    if (xrActive) {
                        openVrChessResult({ title: endTitle, sub: endSub });
                    } else {
                        const pcTitle = endTitle === 'Kazandın!' ? 'Kazandınız!' : (endTitle === 'Kaybettin!' ? 'Kaybettiniz!' : endTitle);
                        openChessResultModal({ title: pcTitle, sub: endSub });
                    }
                    if (xrActive) {
                        // Bazı durumlarda G.gameRunning false kalabiliyor; yine de state'i temizle.
                        endGame(-1);
                    } else {
                        setTimeout(() => {
                            if (G.gameRunning) endGame(-1);
                        }, 900);
                    }
                    // Maç bittiğinde VR/PC tarafını "yenilemeden" tekrar sıraya sok.
                    // Sonuç ekranı açıksa "TAMAM" ile tekrar çağrılır; açılamadıysa en azından menü geri gelsin.
                    setTimeout(() => {
                        if (!onlineChess.active && !G.gameRunning) softResetChessForReplay();
                    }, xrActive ? 250 : 650);
                    mpClient?.getChessQueue?.();
                },
                onChessError: (message) => {
                    if (!message) return;
                    showChessNotice(message, 1700);
                }
            });
            window.addEventListener('beforeunload', () => {
                if (mpClient) mpClient.disconnect();
            }, { once: true });
        }

        function setupOnlineUsersPanel() {
            const panel = document.createElement('div');
            panel.id = 'online-users-panel';
            panel.style.position = 'fixed';
            panel.style.top = '12px';
            panel.style.right = '12px';
            panel.style.zIndex = '165';
            panel.style.minWidth = '200px';
            panel.style.maxWidth = '280px';
            panel.style.maxHeight = '240px';
            panel.style.overflowY = 'auto';
            panel.style.padding = '10px 12px';
            panel.style.borderRadius = '10px';
            panel.style.background = 'rgba(8, 18, 28, 0.78)';
            panel.style.border = '1px solid rgba(120, 200, 255, 0.35)';
            panel.style.color = '#dff6ff';
            panel.style.font = '13px Inter, Arial, sans-serif';
            panel.style.backdropFilter = 'blur(6px)';
            panel.style.display = 'none';
            document.body.appendChild(panel);
            onlineUsersPanel = panel;
            renderOnlineUsersPanel();
        }

        function renderOnlineUsersPanel() {
            if (!onlineUsersPanel) return;
            const items = (onlineUsers || []).slice(0, 50);
            const getOnlineLabel = (u) => {
                if (typeof u === 'string') return u;
                if (u && typeof u === 'object') return u.nickname || u.username || u.name || 'Oyuncu';
                return 'Oyuncu';
            };
            const body = items.length
                ? items.map((u) => `<div style="padding:2px 0;">🟢 ${esc(getOnlineLabel(u))}</div>`).join('')
                : '<div style="opacity:.75;">Çevrimiçi oyuncu yok</div>';
            onlineUsersPanel.innerHTML = `
                <div style="font-weight:700; margin-bottom:6px;">Online Oyuncular (${items.length})</div>
                ${body}
            `;
        }

        function drawFaceToCanvas(ctx, faceId = 'neutral') {
            const W = ctx.canvas.width;
            const H = ctx.canvas.height;
            ctx.clearRect(0, 0, W, H);

            // Zemin: beyaz doldur (texture siyaha çarpmasın).
            // Not: StandardMaterial'da map alpha'sı rengi "boş bırakmaz"; boş piksel siyah görünür.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);

            const cx = W / 2;
            const cy = H / 2;

            // Gözler
            const eyeY = cy - H * 0.10;
            const eyeDX = W * 0.16;
            const eyeR = W * 0.042;
            ctx.fillStyle = 'rgba(18, 18, 18, 0.95)';
            ctx.beginPath(); ctx.arc(cx - eyeDX, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + eyeDX, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();

            // Kaşlar / göz ifadeleri
            ctx.strokeStyle = 'rgba(10,10,10,0.75)';
            ctx.lineWidth = W * 0.020;
            ctx.lineCap = 'round';
            const browY = eyeY - H * 0.065;
            const browW = W * 0.16;
            const browH = H * 0.04;
            // Kullanıcı geri bildirimi: sad/angry ters görünüyordu → çizim mantığını düzelt.
            const browTilt = faceId === 'sad' ? 1 : faceId === 'angry' ? -1 : 0;
            ctx.beginPath();
            ctx.moveTo(cx - eyeDX - browW * 0.45, browY + browH * browTilt);
            ctx.lineTo(cx - eyeDX + browW * 0.45, browY - browH * browTilt);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + eyeDX - browW * 0.45, browY - browH * browTilt);
            ctx.lineTo(cx + eyeDX + browW * 0.45, browY + browH * browTilt);
            ctx.stroke();

            // Ağız
            const mouthY = cy + H * 0.14;
            const mouthW = W * 0.34;
            const mouthH = H * 0.10;
            ctx.strokeStyle = 'rgba(15, 15, 15, 0.85)';
            ctx.lineWidth = W * 0.030;
            ctx.beginPath();
            if (faceId === 'happy') {
                ctx.arc(cx, mouthY, mouthW * 0.46, 0.12 * Math.PI, 0.88 * Math.PI, false);
            } else if (faceId === 'angry') {
                ctx.arc(cx, mouthY + mouthH * 0.85, mouthW * 0.46, 1.12 * Math.PI, 1.88 * Math.PI, false);
            } else if (faceId === 'sad') {
                ctx.moveTo(cx - mouthW * 0.34, mouthY + mouthH * 0.12);
                ctx.lineTo(cx + mouthW * 0.34, mouthY + mouthH * 0.12);
            } else {
                ctx.moveTo(cx - mouthW * 0.28, mouthY);
                ctx.lineTo(cx + mouthW * 0.28, mouthY);
            }
            ctx.stroke();

            // Yanaklar (mutlu)
            if (faceId === 'happy') {
                ctx.fillStyle = 'rgba(255, 120, 140, 0.18)';
                ctx.beginPath(); ctx.arc(cx - W * 0.25, cy + H * 0.02, W * 0.08, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(cx + W * 0.25, cy + H * 0.02, W * 0.08, 0, Math.PI * 2); ctx.fill();
            }
        }

        function setHumanFace(h, faceId) {
            if (!h?.userData?.faceTex?.ctx || !h?.userData?.faceTex?.texture) return;
            h.userData.faceTex.id = faceId;
            drawFaceToCanvas(h.userData.faceTex.ctx, faceId);
            h.userData.faceTex.texture.needsUpdate = true;
        }

        function setHumanBodyColor(h, hex) {
            if (!h) return;
            const mats = [];
            if (h.torso?.material) mats.push(h.torso.material);
            if (h.lArm?.material) mats.push(h.lArm.material);
            if (h.rArm?.material) mats.push(h.rArm.material);
            mats.forEach((m) => {
                if (m?.color?.setHex) m.color.setHex(hex);
            });
        }

        function makeHuman(bc, lc) {
            const g = new THREE.Group();
            const skinBase = worldStd(0x8b5a3b, 0.76);
            const bm = worldStd(bc, 0.74);
            const lm = worldStd(lc, 0.78);
            const sm = worldStd(0x1a1a1a, 0.72);
            const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = !IS_MOB; g.add(m); return m };

            // Yüz için canvas texture (ifadeler buradan değişecek)
            const faceCanvas = document.createElement('canvas');
            faceCanvas.width = 256;
            faceCanvas.height = 256;
            const faceCtx = faceCanvas.getContext('2d');
            const faceTex = new THREE.CanvasTexture(faceCanvas);
            faceTex.colorSpace = THREE.SRGBColorSpace;
            faceTex.needsUpdate = true;
            const skinPlain = new THREE.MeshStandardMaterial({
                color: skinBase.color.clone(),
                roughness: skinBase.roughness,
                metalness: skinBase.metalness
            });
            const skinWithFace = new THREE.MeshStandardMaterial({
                color: skinBase.color.clone(),
                roughness: skinBase.roughness,
                metalness: skinBase.metalness,
                map: faceTex
            });

            g.torso = add(new THREE.BoxGeometry(.62, .82, .32), bm, 0, 1.22, 0);
            // BoxGeometry materyal sırası: [right, left, top, bottom, front, back]
            // Yüz dokusu sadece "back" yüzünde olsun (ilerleme yönünün tersi).
            g.head = add(new THREE.BoxGeometry(.44, .44, .44), [
                skinPlain,
                skinPlain.clone(),
                skinPlain.clone(),
                skinPlain.clone(),
                skinPlain.clone(),
                skinWithFace
            ], 0, 1.95, 0);
            g.lArm = add(new THREE.BoxGeometry(.18, .66, .18), bm, -.42, 1.14, 0);
            g.rArm = add(new THREE.BoxGeometry(.18, .66, .18), bm, .42, 1.14, 0);
            g.lLeg = add(new THREE.BoxGeometry(.24, .72, .24), lm, -.18, .44, 0);
            g.rLeg = add(new THREE.BoxGeometry(.24, .72, .24), lm, .18, .44, 0);
            // Ayakkabı çıkıntısı: ileri yönde (-Z) baksın
            add(new THREE.BoxGeometry(.26, .18, .34), sm, -.18, .06, -.05);
            add(new THREE.BoxGeometry(.26, .18, .34), sm, .18, .06, -.05);

            g.userData.faceTex = { id: 'neutral', canvas: faceCanvas, ctx: faceCtx, texture: faceTex };
            drawFaceToCanvas(faceCtx, 'neutral');
            faceTex.needsUpdate = true;

            g.walkPh = 0;
            return g;
        }

        function walkAnim(h, dt, mv) {
            if (mv) {
                h.walkPh += dt * 5.8;
                const s = Math.sin(h.walkPh) * .52;
                if (h.lArm) h.lArm.rotation.x = s;
                if (h.rArm) h.rArm.rotation.x = -s;
                h.lLeg.rotation.x = -s;
                h.rLeg.rotation.x = s;
            }
            else {
                if (h.lArm) h.lArm.rotation.x *= .8;
                if (h.rArm) h.rArm.rotation.x *= .8;
                h.lLeg.rotation.x *= .8;
                h.rLeg.rotation.x *= .8;
            }
        }

        /* ════════════════ NPCs ═════════════════════════ */
        function spawnNPCs() {
            const zones = [[0, 54, 13], [0, -18, 13], [-38, 2, 10], [38, 2, 10], [0, -36, 8], [-12, 42, 8], [12, 42, 8], [-55, -20, 8], [55, -20, 8]];
            const npcCount = IS_QUEST ? Math.min(8, CFG.npcCount) : CFG.npcCount;
            for (let i = 0; i < npcCount; i++) {
                const [zx, zz, zr] = zones[i % zones.length];
                let a = 0, r = 0, sx = zx, sz = zz;
                // Spawn noktasını bina/anıt içinden kaçır (özellikle dairesel anıt collider).
                let tries = 0;
                do {
                    a = Math.random() * Math.PI * 2;
                    r = Math.random() * zr;
                    sx = zx + Math.cos(a) * r;
                    sz = zz + Math.sin(a) * r;
                    tries++;
                } while (inBldg(sx, sz, 1.15) && tries < 40);
                const npc = makeHuman(NPC_COLORS[i % NPC_COLORS.length], 0x1a2a3a);
                npc.position.set(sx, 0, sz);
                npc.userData = { target: new THREE.Vector3(sx, 0, sz), state: 'walk', stateT: Math.random() * 5, greetT: 0, speed: CFG.npcSpeed * (.7 + Math.random() * .65), bubble: null, bubbleExpiry: 0 };
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
                    renderEscMapBuildingList();
                    setWaypointForBuilding(highlightIdx);
                    updateVrMenuWindow();
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

            // VR oturumu init tam bitmeden loop'a girebilir.
            if (!player) {
                if (scene && camera && renderer) renderer.render(scene, camera);
                return;
            }

            // VR hareketi (sadece VR aktifken)
            if (xrActive) updateVRMovement(dt);
            if (xrActive) updateControllerVelocity(dt);
            if (xrActive) updateVRHandAnimations();
            if (xrActive && vrSpotWindow) updateVrSpotTransform(dt);
            if (vrChessStandalone && xrActive) vrChessStandalone.update();
            if (xrActive && chessExitConfirmOpen && vrChessExitWindow?.visible) updateVrChessExitWindow();
            if (xrActive && vrChessResultOpen && vrChessResultWindow?.visible) updateVrChessResultWindow();
            if (xrActive && vrChessResultOpen && vrChessResultWindow?.visible) updateVrChessResultTransform(dt);
            if (xrHandMixers.length) {
                const mixDt = xrHandClock.getDelta();
                xrHandMixers.forEach((m) => m.update(mixDt));
            }
            // Yerel kutu-karakter kollarının VR'da görünmesini tamamen engelle
            if (player) player.visible = !xrActive;
            updateThrownBodies(dt);
            syncBallNetworkState(dt);

            if (!G.gameRunning) {
                updatePlayer(dt);
                updateNPCs(dt);
                checkInteractSpots();
                if (xrActive) updateVRRaycast();
            }

            // VR için hafif zemin gölgesi (performans dostu).
            if (vrBlobShadow) {
                if (xrActive && xrRig) {
                    vrBlobShadow.visible = true;
                    vrBlobShadow.position.x = xrRig.position.x;
                    vrBlobShadow.position.z = xrRig.position.z;
                } else {
                    vrBlobShadow.visible = false;
                }
            }

            if (isJumping || player.position.y > 0) {
                jumpVel -= 18 * dt;
                player.position.y = Math.max(0, player.position.y + jumpVel * dt);
                if (xrActive && xrRig) xrRig.position.y = player.position.y + VR_RIG_EYE_OFFSET;
                if (player.position.y <= 0) {
                    player.position.y = 0;
                    if (xrActive && xrRig) xrRig.position.y = VR_RIG_EYE_OFFSET;
                    jumpVel = 0;
                    isJumping = false;
                }
            }

            // Normal modda kamerayı güncelle, VR'da headset kontrol eder
            if (!xrActive) updateCamera();
            updateRemotePlayers(dt);
            if (player?.userData?.nameTag) player.userData.nameTag.quaternion.copy(camera.quaternion);

            netTimer += dt;
            if (mpClient && netTimer > 0.05) {
                netTimer = 0;
                const body = BODY_COLORS[appearanceApplied.bodyIdx] || BODY_COLORS[0];
                const face = FACE_PRESETS[appearanceApplied.faceIdx] || FACE_PRESETS[0];
                mpClient.sendMove({
                    x: player?.position?.x || 0,
                    y: player?.position?.y || 0,
                    z: player?.position?.z || 0,
                    yaw: playerYaw,
                    jumping: isJumping,
                    running: isRunning,
                    bc: body.hex,
                    face: face.id
                });
            }


            updateMarkers(dt);
            updateUniversityGateAnimations(scene, (t || 0) / 1000);
            scene.traverse(o => {
                if (o.userData.isWelcomeGate) {
                    const d = player?.position?.distanceTo?.(o.position) ?? Infinity;
                    o.visible = (d < 72);
                }
            });
            updateProxLabels();
            updateBubbles();
            drawMinimap();
            updateWaypointMarker(dt);
            if (xrActive && vrMenuWindow) updateVrMenuTransform(dt);
            if (xrActive && vrCharWindow) updateVrCharTransform(dt);

            renderer.render(scene, camera);
        }

        /* ════════════════ UPDATE PLAYER ════════════════ */
        function updatePlayer(dt) {
            if (!player) return;
            // VR modundayken normal player hareketi devre dışı
            if (xrActive || escMenuOpen) return;

            let fd = 0;
            isRunning = false;
            if (IS_MOB) {
                if (Math.abs(JOY.dy) > .1) fd = JOY.dy;
                if (Math.abs(JOY.dx) > .1) playerYaw -= JOY.dx * CFG.joyTurn * dt;
                isRunning = Math.abs(JOY.dy) > 0.82;
            } else {
                if (keys['KeyW'] || keys['ArrowUp']) fd = -1;
                if (keys['KeyS'] || keys['ArrowDown']) fd = 1;
                isRunning = !!keys['ShiftLeft'] || !!keys['ShiftRight'];
                if (keys['Space'] && !isJumping && player.position.y <= 0.001) {
                    isJumping = true;
                    jumpVel = 7.2;
                }
            }
            const mv = fd !== 0;
            if (mv) {
                const px = player.position.x, pz = player.position.z;
                const speed = CFG.walkSpeed * (isRunning ? 1.8 : 1);
                let nx = px + Math.sin(playerYaw) * fd * speed * dt;
                let nz = pz + Math.cos(playerYaw) * fd * speed * dt;
                nx = Math.max(-94, Math.min(94, nx)); nz = Math.max(-98, Math.min(118, nz));
                if (onlineChess.active && !isInsideChessBoundary(nx, nz)) {
                    openChessExitConfirm();
                    nx = px;
                    nz = pz;
                }
                if (!inBldg(nx, pz, .75)) player.position.x = nx;
                if (!inBldg(player.position.x, nz, .75)) player.position.z = nz;
            }
            player.rotation.y = playerYaw; walkAnim(player, dt, mv);
        }

        /* ════════════════ UPDATE NPCs ══════════════════ */
        function updateNPCs(dt) {
            if (!player) return;
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
        let vrMoveAxX = 0, vrMoveAxZ = 0; // filtreli joystick
        let vrVelX = 0, vrVelZ = 0; // m/s (xrRig düzlem hızı)
        const vrMoveForward = new THREE.Vector3();
        const vrMoveRight = new THREE.Vector3();
        const vrMoveVec = new THREE.Vector3();
        const vrMoveOriginUp = new THREE.Vector3(0, 1, 0);
        const vrCamDirTmp = new THREE.Vector3();

        let vrBlobShadow = null;
        let forceVrChessQueueUntil = 0;
        function initVrBlobShadow() {
            if (vrBlobShadow || !scene) return;
            const geo = new THREE.CircleGeometry(1.25, 32);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.16,
                depthWrite: false
            });
            vrBlobShadow = new THREE.Mesh(geo, mat);
            vrBlobShadow.rotation.x = -Math.PI / 2;
            vrBlobShadow.position.y = 0.03;
            vrBlobShadow.renderOrder = 2;
            vrBlobShadow.visible = false;
            scene.add(vrBlobShadow);
        }

        function forceShowVrChessQueueMenu(ms = 8000) {
            const now = performance.now();
            forceVrChessQueueUntil = Math.max(forceVrChessQueueUntil, now + ms);
            const chSpot = SPOTS.find((s) => s.game === 'ch');
            if (chSpot) activeSpot = chSpot;
            initVrSpotWindow();
            updateVrSpotWindow();
            if (vrSpotWindow) vrSpotWindow.visible = !!(xrActive && !escMenuOpen && !vrCharOpen && !G.gameRunning && activeSpot);
        }

        /** Bazı tarayıcılarda XRInputSourceArray üzerinde .some yok; for-of da hata verebilir. */
        function listXrInputSources(session) {
            if (!session?.inputSources) return [];
            try {
                return Array.from(session.inputSources);
            } catch (_) {
                try {
                    return [...session.inputSources];
                } catch (_) {
                    const out = [];
                    try {
                        const n = session.inputSources.length;
                        for (let i = 0; i < n; i++) out.push(session.inputSources[i]);
                    } catch (_) { /* ignore */ }
                    return out;
                }
            }
        }

        function updateVRMovement(dt) {
            if (!xrRig) return;
            const session = renderer.xr.getSession();
            if (!session) return;
            try {
            isRunning = false;
            let leftClickDown = false;
            let rightClickDown = false;
            const inputCoolingDown = performance.now() < vrInputCooldownUntil;

            // VR'da satranç alanı çıkış onayı açıksa, sadece bu pencereyi tıkla.
            if (chessExitConfirmOpen && vrChessExitWindow?.visible) {
                const inputSourcesList = listXrInputSources(session);
                for (const src of inputSourcesList) {
                    const gp = src.gamepad;
                    if (!gp) continue;
                    const triggerVal = gp.buttons?.[0]?.value || 0;
                    const triggerClick = !!gp.buttons?.[0]?.pressed || triggerVal > 0.85;
                    const clickPressed = !!gp.buttons?.[4]?.pressed || !!gp.buttons?.[3]?.pressed || triggerClick;
                    const clickJustDown = !inputCoolingDown && clickPressed && (
                        src.handedness === 'left' ? !prevClickLeft : !prevClickRight
                    );

                    if (src.handedness === 'left') {
                        vrChessExitPointerLeft = getVrChessExitHit(src, session);
                        if (clickJustDown && vrChessExitPointerLeft) clickVrChessExitAt(vrChessExitPointerLeft);
                        prevClickLeft = clickPressed;
                    } else if (src.handedness === 'right') {
                        vrChessExitPointerRight = getVrChessExitHit(src, session);
                        if (clickJustDown && vrChessExitPointerRight) clickVrChessExitAt(vrChessExitPointerRight);
                        prevClickRight = clickPressed;
                    }
                }
                updateVrChessExitWindow();
                return;
            }

            // VR'da satranç sonuç ekranı açıksa, sadece onu tıkla.
            if (vrChessResultOpen && vrChessResultWindow?.visible) {
                const inputSourcesList = listXrInputSources(session);
                for (const src of inputSourcesList) {
                    const gp = src.gamepad;
                    if (!gp) continue;
                    const triggerVal = gp.buttons?.[0]?.value || 0;
                    const triggerClick = !!gp.buttons?.[0]?.pressed || triggerVal > 0.85;
                    const clickPressed = !!gp.buttons?.[4]?.pressed || !!gp.buttons?.[3]?.pressed || triggerClick;
                    const clickJustDown = !inputCoolingDown && clickPressed && (
                        src.handedness === 'left' ? !prevClickLeft : !prevClickRight
                    );

                    if (src.handedness === 'left') {
                        vrChessResultPointerLeft = getVrChessResultHit(src, session);
                        if (clickJustDown && vrChessResultPointerLeft) clickVrChessResultAt(vrChessResultPointerLeft);
                        prevClickLeft = clickPressed;
                    } else if (src.handedness === 'right') {
                        vrChessResultPointerRight = getVrChessResultHit(src, session);
                        if (clickJustDown && vrChessResultPointerRight) clickVrChessResultAt(vrChessResultPointerRight);
                        prevClickRight = clickPressed;
                    }
                }
                updateVrChessResultWindow();
                return;
            }

            // VR karakter penceresi açıksa, sadece onu tıkla.
            if (vrCharOpen && vrCharWindow?.visible) {
                const inputSourcesList = listXrInputSources(session);
                for (const src of inputSourcesList) {
                    const gp = src.gamepad;
                    if (!gp) continue;
                    if (src.handedness === 'left') {
                        const altGripDown = (gp.buttons?.[1]?.value || 0) > 0.42 || !!gp.buttons?.[1]?.pressed;
                        if (!inputCoolingDown && altGripDown && !prevAltGripLeft && !vrCharToggleLatch) {
                            setVrCharOpen(false);
                            vrCharToggleLatch = true;
                        } else if (!altGripDown) {
                            vrCharToggleLatch = false;
                        }
                        prevAltGripLeft = altGripDown;
                    }
                    const triggerVal = gp.buttons?.[0]?.value || 0;
                    const triggerClick = !!gp.buttons?.[0]?.pressed || triggerVal > 0.85;
                    const clickPressed = !!gp.buttons?.[4]?.pressed || !!gp.buttons?.[3]?.pressed || triggerClick;
                    const clickJustDown = !inputCoolingDown && clickPressed && (
                        src.handedness === 'left' ? !prevClickLeft : !prevClickRight
                    );
                    if (src.handedness === 'left') {
                        vrCharPointerLeft = getVrCharHit(src, session);
                        if (clickJustDown && vrCharPointerLeft) clickVrCharAt(vrCharPointerLeft);
                        prevClickLeft = clickPressed;
                    } else if (src.handedness === 'right') {
                        vrCharPointerRight = getVrCharHit(src, session);
                        if (clickJustDown && vrCharPointerRight) clickVrCharAt(vrCharPointerRight);
                        prevClickRight = clickPressed;
                    }
                }
                updateVrCharWindow();
                return;
            }
            if (escMenuOpen) {
                vrMenuPointerLeft = null;
                vrMenuPointerRight = null;
            }
            if (!escMenuOpen) {
                vrSpotPointerLeft = null;
                vrSpotPointerRight = null;
            }

            const inputSourcesList = listXrInputSources(session);
            for (const src of inputSourcesList) {
                const gp = src.gamepad;
                if (!gp) continue;
                const triggerVal = gp.buttons?.[0]?.value || 0;
                // Bazı cihazlarda X/A face button index'i 3 veya 4 olabiliyor.
                // Trigger'i de tiklama olarak destekle (Meta'daki deneyime benzer).
                const triggerClick = !!gp.buttons?.[0]?.pressed || triggerVal > 0.85;
                const clickPressed = !!gp.buttons?.[4]?.pressed || !!gp.buttons?.[3]?.pressed || triggerClick;
                const yOrBPressed = !!gp.buttons?.[5]?.pressed;

                /* ── Sol el: Yürüyüş (baş yönünde) ────── */
                if (src.handedness === 'left') {
                    leftClickDown = clickPressed;
                    const clickJustDown = !inputCoolingDown && clickPressed && !prevClickLeft;
                    const altGripDown = (gp.buttons?.[1]?.value || 0) > 0.42 || !!gp.buttons?.[1]?.pressed;
                    if (altGripDown && !prevAltGripLeft) {
                        if (!(vrChessStandalone && G.gameRunning && vrChessStandalone.onSqueezeStart(xrCtrl0))) {
                            if (!inputCoolingDown && !vrCharToggleLatch) {
                                setVrCharOpen(!vrCharOpen);
                                vrCharToggleLatch = true;
                            }
                        }
                    } else if (!altGripDown && prevAltGripLeft) {
                        if (!(vrChessStandalone && G.gameRunning && vrChessStandalone.onSqueezeEnd())) {
                            // left grip: toggle only
                        }
                        vrCharToggleLatch = false;
                    }
                    prevAltGripLeft = altGripDown;

                    if (!inputCoolingDown && yOrBPressed && !vrMenuToggleLatch && !escMenuOpen) {
                        setEscMenuOpen(true);
                        vrMenuToggleLatch = true;
                    } else if (!yOrBPressed) {
                        vrMenuToggleLatch = false;
                    }

                    if (escMenuOpen) {
                        vrMenuPointerLeft = getVrMenuHit(src, session);
                        if (clickJustDown) {
                            const res = clickVrMenuAt(vrMenuPointerLeft);
                            vrMenuDragLeft = res.scrollArea && vrMenuPointerLeft ? {
                                area: res.scrollArea,
                                startY: vrMenuPointerLeft.y,
                                startScroll: getVrMenuScroll(res.scrollArea)
                            } : null;
                            vrMenuMoveLeft = res.menuDrag && vrMenuPointerLeft ? {
                                startX: vrMenuPointerLeft.x,
                                startY: vrMenuPointerLeft.y,
                                startAngle: vrMenuTargetAngle,
                                startHeight: vrMenuTargetHeight,
                                axis: null
                            } : null;
                        } else if (clickPressed && vrMenuDragLeft && vrMenuPointerLeft) {
                            const rowsDelta = Math.trunc((vrMenuPointerLeft.y - vrMenuDragLeft.startY) / 24);
                            setVrMenuScroll(vrMenuDragLeft.area, vrMenuDragLeft.startScroll + rowsDelta);
                        } else if (clickPressed && vrMenuMoveLeft && vrMenuPointerLeft) {
                            const dxRaw = vrMenuPointerLeft.x - vrMenuMoveLeft.startX;
                            const dyRaw = vrMenuPointerLeft.y - vrMenuMoveLeft.startY;
                            if (!vrMenuMoveLeft.axis && (Math.abs(dxRaw) > 10 || Math.abs(dyRaw) > 10)) {
                                vrMenuMoveLeft.axis = Math.abs(dxRaw) >= Math.abs(dyRaw) ? 'x' : 'y';
                            }
                            if (vrMenuMoveLeft.axis === 'x') {
                                const dx = dxRaw / 520;
                                vrMenuTargetAngle = Math.max(-1.1, Math.min(1.1, vrMenuMoveLeft.startAngle + dx));
                                vrMenuTargetHeight = vrMenuMoveLeft.startHeight;
                            } else if (vrMenuMoveLeft.axis === 'y') {
                                const dy = dyRaw / 300;
                                vrMenuTargetHeight = Math.max(1.0, Math.min(2.25, vrMenuMoveLeft.startHeight - dy));
                                vrMenuTargetAngle = vrMenuMoveLeft.startAngle;
                            }
                        } else if (!clickPressed) {
                            vrMenuDragLeft = null;
                            vrMenuMoveLeft = null;
                        }
                    } else {
                        vrSpotPointerLeft = getVrSpotHit(src, session);
                        if (clickJustDown && vrSpotPointerLeft) {
                            clickVrSpotAt(vrSpotPointerLeft);
                        }
                        if (!clickPressed) {
                            vrMenuMoveLeft = null;
                        }
                    }
                    if (!escMenuOpen && !clickPressed) {
                        vrMenuMoveLeft = null;
                    }

                    prevClickLeft = clickPressed;

                    // Quest 2 browser bazen axes'i [0,1], bazen [2,3] veriyor.
                    let axX = gp.axes?.[2] ?? 0;
                    let axZ = gp.axes?.[3] ?? 0;
                    if (Math.abs(axX) < 0.05 && Math.abs(axZ) < 0.05) {
                        axX = gp.axes?.[0] ?? 0;
                        axZ = gp.axes?.[1] ?? 0;
                    }

                    // Joystick filtreleme + yumuşak hız (VR'da kasılma/titreme azaltır)
                    const rawX = Math.abs(axX) > VR_DEADZONE ? axX : 0;
                    const rawZ = Math.abs(axZ) > VR_DEADZONE ? axZ : 0;
                    const kInput = 1 - Math.exp(-dt * 18);
                    vrMoveAxX += (rawX - vrMoveAxX) * kInput;
                    vrMoveAxZ += (rawZ - vrMoveAxZ) * kInput;

                    const ease = (v) => {
                        const s = Math.max(-1, Math.min(1, v));
                        const a = Math.abs(s);
                        const e = a * a * (3 - 2 * a); // smoothstep
                        return Math.sign(s) * e;
                    };
                    const ix = ease(vrMoveAxX);
                    const iz = ease(vrMoveAxZ);

                    const hasMove = Math.abs(ix) > 0.001 || Math.abs(iz) > 0.001;
                    const runMul = triggerVal > 0.7 ? 1.8 : 1;
                    isRunning = runMul > 1;

                    // Headset yön vektörleri (alloc yapmadan)
                    const xrCamera = renderer.xr.getCamera(camera);
                    xrCamera.getWorldDirection(vrCamDirTmp);
                    vrCamDirTmp.y = 0;
                    vrCamDirTmp.normalize();
                    vrMoveForward.copy(vrCamDirTmp);
                    vrMoveRight.crossVectors(vrMoveForward, vrMoveOriginUp).normalize();

                    const targetVX = (vrMoveRight.x * ix + vrMoveForward.x * (-iz)) * VR_WALK_SPEED * runMul;
                    const targetVZ = (vrMoveRight.z * ix + vrMoveForward.z * (-iz)) * VR_WALK_SPEED * runMul;

                    const kVel = 1 - Math.exp(-dt * (hasMove ? 10 : 14));
                    vrVelX += (targetVX - vrVelX) * kVel;
                    vrVelZ += (targetVZ - vrVelZ) * kVel;

                    if (Math.abs(vrVelX) > 0.0005 || Math.abs(vrVelZ) > 0.0005) {
                        vrMoveVec.set(vrVelX * dt, 0, vrVelZ * dt);

                        let nx = xrRig.position.x + vrMoveVec.x;
                        let nz = xrRig.position.z + vrMoveVec.z;
                        nx = Math.max(-94, Math.min(94, nx));
                        nz = Math.max(-98, Math.min(118, nz));
                        if (onlineChess.active && !isInsideChessBoundary(nx, nz)) {
                            openChessExitConfirm();
                            nx = xrRig.position.x;
                            nz = xrRig.position.z;
                            vrVelX = 0; vrVelZ = 0;
                        }
                        if (!inBldg(nx, xrRig.position.z, .75)) xrRig.position.x = nx;
                        if (!inBldg(xrRig.position.x, nz, .75)) xrRig.position.z = nz;

                        // Player pozisyonunu senkronize et (minimap, NPC)
                        if (player) {
                            player.position.x = xrRig.position.x;
                            player.position.z = xrRig.position.z;
                        }
                    }
                }

                if (src.handedness === 'right') {
                    rightClickDown = clickPressed;
                    const clickJustDown = !inputCoolingDown && clickPressed && !prevClickRight;
                    const altGripDown = (gp.buttons?.[1]?.value || 0) > 0.42 || !!gp.buttons?.[1]?.pressed;
                    if (altGripDown && !prevAltGripRight) {
                        if (!(vrChessStandalone && G.gameRunning && vrChessStandalone.onSqueezeStart(xrCtrl1))) {
                            tryGrabObject('right');
                        }
                    } else if (!altGripDown && prevAltGripRight) {
                        if (!(vrChessStandalone && G.gameRunning && vrChessStandalone.onSqueezeEnd())) {
                            releaseGrabbedObject('right');
                        }
                    }
                    prevAltGripRight = altGripDown;

                    if (escMenuOpen) {
                        vrMenuPointerRight = getVrMenuHit(src, session);
                        if (clickJustDown) {
                            const res = clickVrMenuAt(vrMenuPointerRight);
                            vrMenuDragRight = res.scrollArea && vrMenuPointerRight ? {
                                area: res.scrollArea,
                                startY: vrMenuPointerRight.y,
                                startScroll: getVrMenuScroll(res.scrollArea)
                            } : null;
                            vrMenuMoveRight = res.menuDrag && vrMenuPointerRight ? {
                                startX: vrMenuPointerRight.x,
                                startY: vrMenuPointerRight.y,
                                startAngle: vrMenuTargetAngle,
                                startHeight: vrMenuTargetHeight,
                                axis: null
                            } : null;
                        } else if (clickPressed && vrMenuDragRight && vrMenuPointerRight) {
                            const rowsDelta = Math.trunc((vrMenuPointerRight.y - vrMenuDragRight.startY) / 24);
                            setVrMenuScroll(vrMenuDragRight.area, vrMenuDragRight.startScroll + rowsDelta);
                        } else if (clickPressed && vrMenuMoveRight && vrMenuPointerRight) {
                            const dxRaw = vrMenuPointerRight.x - vrMenuMoveRight.startX;
                            const dyRaw = vrMenuPointerRight.y - vrMenuMoveRight.startY;
                            if (!vrMenuMoveRight.axis && (Math.abs(dxRaw) > 10 || Math.abs(dyRaw) > 10)) {
                                vrMenuMoveRight.axis = Math.abs(dxRaw) >= Math.abs(dyRaw) ? 'x' : 'y';
                            }
                            if (vrMenuMoveRight.axis === 'x') {
                                const dx = dxRaw / 520;
                                vrMenuTargetAngle = Math.max(-1.1, Math.min(1.1, vrMenuMoveRight.startAngle + dx));
                                vrMenuTargetHeight = vrMenuMoveRight.startHeight;
                            } else if (vrMenuMoveRight.axis === 'y') {
                                const dy = dyRaw / 300;
                                vrMenuTargetHeight = Math.max(1.0, Math.min(2.25, vrMenuMoveRight.startHeight - dy));
                                vrMenuTargetAngle = vrMenuMoveRight.startAngle;
                            }
                        } else if (!clickPressed) {
                            vrMenuDragRight = null;
                            vrMenuMoveRight = null;
                        }
                    } else {
                        vrSpotPointerRight = getVrSpotHit(src, session);
                        if (clickJustDown && vrSpotPointerRight) {
                            clickVrSpotAt(vrSpotPointerRight);
                        }
                        if (!clickPressed) vrMenuMoveRight = null;
                    }

                    prevClickRight = clickPressed;
                    /* ── Sağ el: Snap dönüş (30° adımlarla) ── */
                    let axX = gp.axes?.[2] ?? 0;
                    if (Math.abs(axX) < 0.05) axX = gp.axes?.[0] ?? 0;

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
                if (escMenuOpen) continue;
            }

            if (escMenuOpen) updateVrMenuWindow();
            else if (vrSpotWindow?.visible) updateVrSpotWindow();

            if (!leftClickDown) {
                prevClickLeft = false;
                vrMenuDragLeft = null;
                vrMenuMoveLeft = null;
            }
            if (!inputSourcesList.some((s) => s.handedness === 'left')) prevAltGripLeft = false;
            if (!rightClickDown) {
                prevClickRight = false;
                vrMenuDragRight = null;
                vrMenuMoveRight = null;
            }
            if (!inputSourcesList.some((s) => s.handedness === 'right')) prevAltGripRight = false;
            } catch (err) {
                console.error('updateVRMovement:', err);
            }
        }

        /* ════════════════ VR RAYCAST ══════════════════ */
        function updateVRRaycast() {
            if (!xrRig) return;
            // Maç bitişi gibi durumlarda satranç kuyruğu menüsünü kısa süre zorla göster.
            if (performance.now() < forceVrChessQueueUntil) {
                const chSpot = SPOTS.find((s) => s.game === 'ch');
                if (chSpot) {
                    activeSpot = chSpot;
                    requestChessQueueState();
                    updateChessQueueUi();
                    initVrSpotWindow();
                    if (vrSpotWindow) {
                        vrSpotWindow.visible = !!(xrActive && !escMenuOpen && !vrCharOpen && !G.gameRunning && activeSpot);
                        if (vrSpotWindow.visible) updateVrSpotWindow();
                    }
                }
                return;
            }

            // Masaya yakınlık: rig / ayak pozisyonu (sağ el konumu değil) — masadayken etkileşim kaçmasın
            const px = xrRig.position.x;
            const pz = xrRig.position.z;

            let nearest = null, nearDist = Infinity;
            SPOTS.forEach(sp => {
                const dx = px - sp.pos.x;
                const dz = pz - sp.pos.z;
                const d = Math.sqrt(dx * dx + dz * dz);
                if (d < CFG.interactDist && d < nearDist) { nearDist = d; nearest = sp; }
            });

            if (nearest && nearest.id !== refusedSpot?.id) {
                activeSpot = nearest;
                if (nearest.game === 'ch') {
                    requestChessQueueState();
                    updateChessQueueUi();
                }
            } else {
                activeSpot = null;
            }
            // VR'da HTML prompt yerine ESC mantigindaki raycast tiklama penceresi kullan.
            if (vrSpotWindow) {
                vrSpotWindow.visible = !!(xrActive && !escMenuOpen && !vrCharOpen && !G.gameRunning && activeSpot);
                if (vrSpotWindow.visible) updateVrSpotWindow();
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

        function updateWaypointMarker(dt) {
            if (!waypointMarker) return;
            waypointMarker.userData._t = (waypointMarker.userData._t || 0) + dt * 1.6;
            const baseY = Math.max(2.1, (BUILDINGS[waypointTargetIdx]?.h || 6) * 0.45);
            waypointMarker.position.y = baseY + Math.sin(waypointMarker.userData._t) * 0.16;
            const diamond = waypointMarker.children[0];
            const beam = waypointMarker.children[1];
            const label = waypointMarker.children[2];
            if (diamond) diamond.rotation.y += dt * 1.2;
            if (beam) beam.rotation.y -= dt * 0.7;
            if (label) label.quaternion.copy(camera.quaternion);
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

            if (nearest) {
                const changed = !activeSpot || activeSpot.id !== nearest.id;
                activeSpot = nearest;
                if (changed) {
                    document.getElementById('ip-icon').textContent = nearest.icon;
                    document.getElementById('ip-title').textContent = nearest.title + ' oynamak ister misin?';
                    document.getElementById('ip-sub').textContent = nearest.sub;
                }
                if (nearest.game === 'ch') {
                    requestChessQueueState();
                    updateChessQueueUi();
                }
                prompt.style.display = 'block';
                // Pointer lock açıkken DOM butonlarına tıklamak zor/engelli olabilir.
                if (isLocked && document.exitPointerLock) {
                    suppressLockOverlay = true;
                    document.exitPointerLock();
                }
            } else if (activeSpot) {
                activeSpot = null;
                prompt.style.display = 'none';
            }
        }

        function setupInteractPrompt() {
            document.getElementById('ip-yes').addEventListener('click', () => {
                if (!activeSpot) return;
                if (activeSpot.game === 'ch') {
                    if (onlineChess.active) {
                        document.getElementById('interact-prompt').style.display = 'none';
                        applyChessTeleport();
                        if (!G.gameRunning) {
                            startGame(activeSpot.game, activeSpot.id, activeSpot.title, {
                                mode: 'pvp',
                                matchId: onlineChess.matchId,
                                matchPayload: onlineChess.lastState
                            });
                        }
                        return;
                    }
                    if (onlineChess.queued) {
                        onlineChess.queued = false;
                        mpClient?.leaveChessQueue?.();
                        updateChessQueueUi();
                        return;
                    }
                    mpClient?.joinChessQueue?.();
                    updateChessQueueUi();
                    return;
                }
                document.getElementById('interact-prompt').style.display = 'none';
                if (isLocked && document.exitPointerLock) document.exitPointerLock();
                startGame(activeSpot.game, activeSpot.id, activeSpot.title);
            });
            document.getElementById('ip-no').addEventListener('click', () => {
                if (activeSpot?.game === 'ch') {
                    refusedSpot = activeSpot;
                    activeSpot = null;
                    document.getElementById('interact-prompt').style.display = 'none';
                    return;
                }
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
            const drawMap = (ctx, S) => {
                const sc = S / 230;
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
                BUILDINGS.forEach((b, i) => {
                    const isHL = (i === highlightIdx);
                    if (b.mapPolygon && b.mapPolygon.length >= 3) {
                        ctx.beginPath();
                        const [mx0, mz0] = tm(b.mapPolygon[0].x, b.mapPolygon[0].z);
                        ctx.moveTo(mx0, mz0);
                        for (let k = 1; k < b.mapPolygon.length; k++) {
                            const [mx, mz] = tm(b.mapPolygon[k].x, b.mapPolygon[k].z);
                            ctx.lineTo(mx, mz);
                        }
                        ctx.closePath();
                        if (isHL && blinkOn) {
                            ctx.shadowColor = '#e8c870';
                            ctx.shadowBlur = 10;
                            ctx.fillStyle = '#ffe97a';
                            ctx.fill();
                            ctx.shadowBlur = 0;
                        }
                        ctx.fillStyle = isHL ? '#e8c870' : (b.css || '#6888b8');
                        ctx.fill();
                    } else {
                        const { x, z, w, d } = b;
                        const [mx, mz] = tm(x, z);
                        const bw = w * sc;
                        const bd = d * sc;
                        const bx2 = mx - bw / 2;
                        const bz = mz - bd / 2;
                        if (isHL && blinkOn) {
                            ctx.shadowColor = '#e8c870';
                            ctx.shadowBlur = 10;
                            ctx.fillStyle = '#ffe97a';
                            ctx.fillRect(bx2 - 2, bz - 2, bw + 4, bd + 4);
                            ctx.shadowBlur = 0;
                        }
                        ctx.fillStyle = isHL ? '#e8c870' : (b.css || '#6888b8');
                        ctx.fillRect(bx2, bz, bw, bd);
                    }
                });
                if (waypointTargetIdx >= 0 && BUILDINGS[waypointTargetIdx]) {
                    const wb = BUILDINGS[waypointTargetIdx];
                    const [wmx, wmz] = tm(wb.x, wb.z);
                    ctx.strokeStyle = '#ffd54a';
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.arc(wmx, wmz, 8, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = '#ffe8a4';
                    ctx.font = `${IS_MOB ? 8 : 9}px Inter,Arial`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(`WP: ${String(wb.name || '').slice(0, 10)}`, wmx + 10, wmz - 6);
                }
                ctx.fillStyle = '#4ecdc4';
                npcs.forEach(n => { const [mx, mz] = tm(n.position.x, n.position.z); if (mx > 0 && mx < S && mz > 0 && mz < S) { ctx.beginPath(); ctx.arc(mx, mz, 2, 0, Math.PI * 2); ctx.fill(); } });
                ctx.fillStyle = '#39ff75';
                remotePlayers.forEach((rp) => {
                    const [mx, mz] = tm(rp.position.x, rp.position.z);
                    if (mx > 0 && mx < S && mz > 0 && mz < S) { ctx.beginPath(); ctx.arc(mx, mz, 3, 0, Math.PI * 2); ctx.fill(); }
                });
                const [px, pz] = tm(player.position.x, player.position.z);
                ctx.fillStyle = '#ff5555'; ctx.beginPath(); ctx.arc(px, pz, IS_MOB ? 4 : 5, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#ff5555'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(px - Math.sin(playerYaw) * 10, pz - Math.cos(playerYaw) * 10); ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = `${IS_MOB ? 8 : 9}px Inter,Arial`; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('N', S - 5, 5);
                ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1.5; ctx.beginPath(); rr(ctx, 1, 1, S - 2, S - 2, 11); ctx.stroke();
            };
            drawMap(mmCtx, mmSize);
            if (escMenuOpen && escMapCtx) drawMap(escMapCtx, escMapSize);
        }
        function rr(ctx, x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }

        /* ════════════════ CONTROLS ═════════════════════ */
        function setupControls() {
            // VR'da Home ile arka plana gidip geri gelince input latch'leri temizle.
            window.addEventListener('blur', () => {
                if (xrActive) resetVrTransientInputState();
            });
            window.addEventListener('focus', () => {
                if (xrActive) resetVrTransientInputState();
            });
            window.addEventListener('pageshow', () => {
                if (xrActive) resetVrTransientInputState();
            });
            document.addEventListener('visibilitychange', () => {
                if (xrActive) resetVrTransientInputState();
            });

            window.addEventListener('keydown', e => { keys[e.code] = true; if (['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault(); });
            window.addEventListener('keyup', e => { keys[e.code] = false; });
            window.addEventListener('keydown', e => {
                if (e.code !== 'Escape') return;
                e.preventDefault();
                setEscMenuOpen(!escMenuOpen);
            });
            setupInteractPrompt();

            if (IS_QUEST) {
                // Quest tarayıcısında: VR'a girmeden önce dokunmatik kamera kontrolü
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
                renderer.domElement.addEventListener('click', () => { if (!isLocked && !G.gameRunning) renderer.domElement.requestPointerLock(); });
                document.addEventListener('mousedown', e => {
                    if (e.button !== 2) return;
                    e.preventDefault();
                    if (isLocked) { document.exitPointerLock(); }
                    else if (!G.gameRunning) { renderer.domElement.requestPointerLock(); }
                });
                document.addEventListener('contextmenu', e => e.preventDefault());
                document.addEventListener('pointerlockchange', () => {
                    isLocked = document.pointerLockElement === renderer.domElement;
                    if (!isLocked && !G.gameRunning && !escMenuOpen) {
                        if (suppressLockOverlay) {
                            suppressLockOverlay = false;
                            // Pointer lock değişiminde webde ESC menüsünü otomatik açma.
                            // Menü yalnızca kullanıcı ESC ile açmalı.
                        }
                    }
                });
                document.addEventListener('mousemove', e => { if (!isLocked) return; playerYaw -= e.movementX * CFG.mouseSens; playerPitch += e.movementY * CFG.mouseSens; playerPitch = Math.max(-.45, Math.min(.95, playerPitch)); });
            } else {
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

            document.getElementById('game-quit-btn').addEventListener('click', () => {
                // PC satranç maçında çıkış: kaybetmiş sayılsın, rakip kazansın (50 puan server'da).
                if (!xrActive && currentGameId === 'satranc' && onlineChess.active && onlineChess.matchId) {
                    mpClient?.confirmExitMatch?.(onlineChess.matchId);
                    openChessResultModal({ title: 'Kaybettiniz!', sub: 'Maçtan ayrıldın.' });
                    endGame(-1);
                    return;
                }
                endGame(-1);
            });
        }

        /* ════════════════ JOYSTICK ═════════════════════ */
        function updateJoyBase() { const b = document.getElementById('joy-base'); if (!b.offsetParent && !IS_MOB) return; const rect = b.getBoundingClientRect(); JOY.bx = rect.left + rect.width / 2; JOY.by = rect.top + rect.height / 2; JOY.baseEl = b; JOY.thumbEl = document.getElementById('joy-thumb'); }
        function setJoyThumb(cx, cy) { const dx = cx - JOY.bx, dy = cy - JOY.by, dist = Math.min(Math.sqrt(dx * dx + dy * dy), CFG.joyRadius), ang = Math.atan2(dy, dx), tx = Math.cos(ang) * dist, ty = Math.sin(ang) * dist; JOY.dx = tx / CFG.joyRadius; JOY.dy = ty / CFG.joyRadius; if (JOY.thumbEl) JOY.thumbEl.style.transform = `translate(calc(-50% + ${tx}px),calc(-50% + ${ty}px))`; }
        function resetJoy() { JOY.active = false; JOY.id = -1; JOY.dx = 0; JOY.dy = 0; if (JOY.thumbEl) JOY.thumbEl.style.transform = 'translate(-50%,-50%)'; }


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
        let currentGame = null, currentGameId = null, currentGameTitle = null, currentGameType = null;
        function setupMiniGames() { setupScoreModal(); }

        function clearVrChess() {
            if (!vrChessStandalone) return;
            vrChessStandalone.dispose?.();
            vrChessStandalone = null;
        }

        function softResetChessForReplay() {
            // Satranç "özel refresh": sayfa yenilemeden tekrar oynanabilir hale getir.
            onlineChess.active = false;
            onlineChess.queued = false;
            onlineChess.matchId = null;
            onlineChess.lastState = null;
            closeChessExitConfirm();
            if (vrChessStandalone) clearVrChess();
            if (G.gameRunning) endGame(-1);

            const chSpot = SPOTS.find((s) => s.game === 'ch');
            if (chSpot) activeSpot = chSpot;

            requestChessQueueState(true);
            updateChessQueueUi();

            if (xrActive) {
                initVrSpotWindow();
                updateVrSpotWindow();
                if (vrSpotWindow) vrSpotWindow.visible = !!(!escMenuOpen && !vrCharOpen && activeSpot);
                forceShowVrChessQueueMenu(12000);
            } else {
                const prompt = document.getElementById('interact-prompt');
                if (prompt && activeSpot?.game === 'ch') prompt.style.display = 'block';
            }
        }

        function startGame(type, id, title, options = {}) {
            const startingVrChess = type === 'ch' && xrActive;
            if (!startingVrChess) G.gameRunning = true;
            if (vrSpotWindow) vrSpotWindow.visible = false;
            currentGameId = id;
            currentGameTitle = title;
            currentGameType = type;
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
                currentGame = new ChessGame(canvas, W, H, endGame, {
                    mode: options.mode || 'local',
                    localPlayerId,
                    matchId: options.matchId || null,
                    multiplayer: mpClient
                });
                if (options.matchPayload) currentGame.onChessMatchStarted?.(options.matchPayload);
            } else if (type === 'ch' && xrActive) {
                try {
                    clearVrChess();
                    lastVrChessWasOnlinePvp = options.mode === 'pvp';
                    const chSpot = SPOTS.find((s) => s.game === 'ch')?.pos || { x: 10, z: 42 };
                    currentGame = { destroy() {} };
                    vrChessStandalone = new VrChessStandalone({
                        scene,
                        anchor: {
                            x: chSpot.x,
                            // VR oynanabilir tahta (dekoratif masa ayrı; biraz yukarı).
                            y: 0.56,
                            z: chSpot.z,
                            yaw: 0
                        },
                        onEnd: (sc) => endGame(sc)
                    });
                    vrChessStandalone.mount();
                    if (options.mode === 'pvp') {
                        vrChessStandalone.setOnlineContext({
                            enabled: true,
                            matchId: options.matchId || null,
                            myColor: options.matchPayload?.yourColor || onlineChess.myColor,
                            onMoveTry: (move) => {
                                mpClient?.sendChessMove?.(move);
                            }
                        });
                        if (options.matchPayload) vrChessStandalone.onServerStateUpdate(options.matchPayload);
                    }
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
            const endedType = currentGameType;
            const endedTitle = currentGameTitle;
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
            closeChessExitConfirm();
            activeSpot = null;
            if (vrSpotWindow) vrSpotWindow.visible = false;
            if (IS_MOB) {
                document.getElementById('joy-base').style.display = 'block';
                document.getElementById('joy-label').style.display = 'block';
                ['m-bldg-btn', 'm-map-btn', 'm-lb-btn'].forEach(id2 => {
                    const el = document.getElementById(id2); if (el) el.style.display = 'block';
                });
            }
            // VR satranç (yerel iki oyuncu) bitince sonuç paneli; çevrimiçi maçta panel onChessMatchEnded'de açılır.
            if (xrActive && endedType === 'ch') {
                if (!lastVrChessWasOnlinePvp && (score === 50 || score === 0)) {
                    openVrChessResult({
                        title: score === 50 ? 'Şah mat!' : 'Berabere!',
                        sub: score === 50
                            ? 'Aynı cihazda iki oyuncu — sıradaki oyunda renk değiştirin.'
                            : 'Pat — oyun berabere bitti.'
                    });
                }
                lastVrChessWasOnlinePvp = false;
                softResetChessForReplay();
                return;
            }

            if (score >= 0) showScoreModal(currentGameId, endedTitle || currentGameTitle, score);
        }

        /* ════════════════ YARDIMCI FONKSİYONLAR ═══════ */
        function inBldg(x, z, m) {
            for (const b of buildingAABBs) {
                if (x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m) return true;
            }
            for (const c of circleColliders) {
                const dx = x - c.x;
                const dz = z - c.z;
                const rr = (c.r + m) * (c.r + m);
                if (dx * dx + dz * dz < rr) return true;
            }
            return false;
        }
        function w2s(wx, wy, wz) { const v = new THREE.Vector3(wx, wy, wz).project(camera); if (v.z > 1) return null; return { x: (v.x * .5 + .5) * innerWidth, y: (-v.y * .5 + .5) * innerHeight }; }
        function bx(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
        function cl(rt, rb, h, seg, color, x, y, z) {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), worldStd(color, 0.87));
            m.position.set(x, y, z);
            if (!IS_MOB) m.castShadow = true;
            return m;
        }
        function dk(hex, f) { return (Math.floor(((hex >> 16) & 0xff) * f) << 16) | (Math.floor(((hex >> 8) & 0xff) * f) << 8) | Math.floor((hex & 0xff) * f); }
        function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
        function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

        let campusStarted = false;

        export function stopWebHandPreview() {
            const s = webHandPreviewState;
            if (!s) return;
            if (s.raf) cancelAnimationFrame(s.raf);
            webHandPreviewState = null;
            if (s.ro) s.ro.disconnect();
            if (s._onResize) removeEventListener('resize', s._onResize);
            if (s.canvas && s._ptrDown) {
                s.canvas.removeEventListener('pointerdown', s._ptrDown);
                s.canvas.removeEventListener('pointermove', s._ptrMove);
                s.canvas.removeEventListener('pointerup', s._ptrUp);
                s.canvas.removeEventListener('pointercancel', s._ptrUp);
            }
            const host = document.getElementById('web-hand-preview');
            if (host) {
                host.classList.remove('is-active');
                host.removeAttribute('title');
                host.innerHTML = '';
            }
            if (s.renderer) s.renderer.dispose();
        }

        export function startWebHandPreview() {
            if (webHandPreviewState) return;
            const host = document.getElementById('web-hand-preview');
            if (!host) return;
            host.classList.add('is-active');
            host.innerHTML = '';
            host.title = 'Sürükleyerek sağa–sola döndür (yatay)';

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(38, 1, 0.04, 8);
            const lookTarget = new THREE.Vector3(0, 0.088, 0);
            let orbitYaw = 0.38;
            const orbitDist = 0.98;
            const orbitHeight = 0.17;

            const syncCamera = () => {
                camera.position.set(
                    Math.sin(orbitYaw) * orbitDist,
                    orbitHeight,
                    Math.cos(orbitYaw) * orbitDist
                );
                camera.lookAt(lookTarget);
            };
            syncCamera();

            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
            renderer.setClearColor(0x000000, 0);
            const canvas = renderer.domElement;
            canvas.style.touchAction = 'none';
            host.appendChild(canvas);

            scene.add(new THREE.AmbientLight(0xeee8e0, 0.42));
            const key = new THREE.DirectionalLight(0xfff5eb, 0.62);
            key.position.set(0.35, 1.35, 0.55);
            scene.add(key);
            const fill = new THREE.DirectionalLight(0xa8b8e8, 0.18);
            fill.position.set(-0.8, 0.6, -0.4);
            scene.add(fill);

            const buildMirrored = (sideLabel) => {
                const geoSide = sideLabel === 'left' ? 'right' : 'left';
                const built = createDetailedVRHand(geoSide);
                const root = built.root;
                root.fingers = built.fingers;
                root.userData.handedness = sideLabel;
                root.rotation.z *= -1;
                return root;
            };

            const group = new THREE.Group();
            group.scale.setScalar(2.62);
            const leftMesh = buildMirrored('left');
            const rightMesh = buildMirrored('right');
            leftMesh.position.set(-0.152, 0.055, 0.02);
            rightMesh.position.set(0.152, 0.055, 0.02);
            // Avuç içi önde: sırt değil volar yüzey görünsün
            group.rotation.set(-0.04, 0, 0);
            group.add(leftMesh, rightMesh);
            scene.add(group);

            const applySize = () => {
                if (!webHandPreviewState) return;
                const w = Math.max(280, host.clientWidth || innerWidth);
                let h = host.clientHeight;
                if (h < 64) h = Math.min(innerHeight * 0.44, 400);
                h = Math.max(180, h);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
                renderer.setSize(w, h);
            };

            const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(applySize) : null;
            if (ro) ro.observe(host);

            const onWinResize = () => applySize();
            addEventListener('resize', onWinResize);

            let dragging = false;
            let lastPtrX = 0;
            const onPtrDown = (e) => {
                if (e.button !== undefined && e.button !== 0) return;
                dragging = true;
                lastPtrX = e.clientX;
                try {
                    canvas.setPointerCapture(e.pointerId);
                } catch (_) { /* ignore */ }
            };
            const onPtrMove = (e) => {
                if (!dragging) return;
                const dx = e.clientX - lastPtrX;
                lastPtrX = e.clientX;
                orbitYaw -= dx * 0.0065;
            };
            const onPtrUp = (e) => {
                dragging = false;
                try {
                    canvas.releasePointerCapture(e.pointerId);
                } catch (_) { /* ignore */ }
            };
            canvas.addEventListener('pointerdown', onPtrDown);
            canvas.addEventListener('pointermove', onPtrMove);
            canvas.addEventListener('pointerup', onPtrUp);
            canvas.addEventListener('pointercancel', onPtrUp);

            const openPreviewPose = { grip: 0, trigger: 0, point: 0, thumbsUp: 0, openPalm: true };
            const tick = () => {
                const st = webHandPreviewState;
                if (!st) return;
                setVRHandPose(leftMesh, openPreviewPose);
                setVRHandPose(rightMesh, openPreviewPose);
                syncCamera();
                if (webHandPreviewState !== st) return;
                renderer.render(scene, camera);
                if (webHandPreviewState !== st) return;
                st.raf = requestAnimationFrame(tick);
            };

            webHandPreviewState = {
                raf: 0,
                renderer,
                scene,
                host,
                ro,
                _onResize: onWinResize,
                canvas,
                _ptrDown: onPtrDown,
                _ptrMove: onPtrMove,
                _ptrUp: onPtrUp
            };
            applySize();
            requestAnimationFrame(() => {
                applySize();
                tick();
            });
        }

        export async function startCampusExperience(username = 'Oyuncu', sessionToken = '') {
            stopWebHandPreview();
            if (campusStarted) return;
            campusStarted = true;
            localNickname = String(username || 'Oyuncu').slice(0, 24);
            localSessionToken = String(sessionToken || '');
            const welcome = document.getElementById('welcome');
            if (welcome) welcome.style.display = 'none';
            try {
                await initGame();
                initAudio();
                if (!IS_MOB && !IS_QUEST) {
                    const lockPromise = renderer.domElement.requestPointerLock();
                    if (lockPromise instanceof Promise) {
                        lockPromise.catch(() => { });
                    }
                }
                if (IS_QUEST) {
                    // Quest'te pointer lock kullanılmıyor
                }
            } catch (err) {
                campusStarted = false;
                console.error('Oyun başlatma hatası:', err);
                const authScreen = document.getElementById('auth-screen');
                if (authScreen) authScreen.style.display = 'flex';
                alert('Oyun başlatılırken hata oluştu: ' + err.message);
            }
        }
