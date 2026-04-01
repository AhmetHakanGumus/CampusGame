'use strict';

        /* ══════════════════════════════════════════════════
           ⚠️  SUPABASE AYARLARI
        ══════════════════════════════════════════════════ */
        const SB_URL = 'https://tjruztswfsgiufooahjr.supabase.co';
        const SB_KEY = 'sb_publishable_V_qyuWJxYJiuu46yG3PXPQ_vu71TAcD';
        const SB_TABLE = 'campus_scores';

        /* ════════════════ PLATFORM ════════════════════ */
        const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
        const IS_MOB = !IS_QUEST && (
            /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
            || ('ontouchstart' in window && navigator.maxTouchPoints > 1)
            || window.matchMedia('(pointer:coarse)').matches
        );

        if (IS_MOB) {
            document.getElementById('pc-controls').style.display = 'none';
            document.getElementById('mob-controls').style.display = 'grid';
        }
        if (IS_QUEST) {
            document.getElementById('pc-controls').style.display = 'none';
            document.getElementById('mob-controls').style.display = 'none';
            document.getElementById('vr-controls').style.display = 'grid';
            document.body.classList.add('is-quest');
        }

        /* ════════════════ CONFIG ═══════════════════════ */
        const CFG = { walkSpeed: 6.5, npcSpeed: 1.9, npcCount: 18, camDist: 8.5, camHeightBase: 3.8, speakDist: 11, greetCool: 9, bubbleDurMs: 4000, mouseSens: .0022, touchSens: .007, proxDist: 20, joyRadius: 44, joyTurn: 2.2, interactDist: 7 };

        const DIALOGUES = ["Merhaba! 👋", "Bugün dersin var mı?", "Hocam çok anlatıyor...", "Kütüphaneye gidiyorum!", "Yemekhanede buluşalım!", "Sınavlar yaklaşıyor 😅", "Proje ödevim bitmedi!", "Harran'a hoş geldin! 🎓", "Nasılsın, iyi misin?", "Kampüs çok güzel değil mi?", "Şimdi derse gidiyorum.", "Bugün hava çok güzel!", "Bize katıl! 😄", "Koridorda görüşürüz!", "Ödev teslimi yarın...", "Ring yine mi dolu!"];

        const BUILDINGS = [
            { x: 0, z: -62, w: 42, h: 19, d: 22, color: 0xc9986a, css: '#c9986a', name: "Ana Bina" },
            { x: -56, z: -46, w: 29, h: 15, d: 19, color: 0x6a8faf, css: '#6a8faf', name: "Kütüphane" },
            { x: 56, z: -46, w: 29, h: 15, d: 19, color: 0x6a8faf, css: '#6a8faf', name: "Mühendislik Fak." },
            { x: -56, z: 14, w: 25, h: 13, d: 18, color: 0x78a878, css: '#78a878', name: "Fen-Edebiyat Fak." },
            { x: 56, z: 14, w: 25, h: 13, d: 18, color: 0x78a878, css: '#78a878', name: "İktisadi Bilimler" },
            { x: 0, z: 26, w: 34, h: 8, d: 22, color: 0xd4a96a, css: '#d4a96a', name: "Yemekhane" },
            { x: -80, z: -66, w: 18, h: 22, d: 30, color: 0xa07cb0, css: '#a07cb0', name: "Yurt A" },
            { x: 80, z: -66, w: 18, h: 22, d: 30, color: 0xa07cb0, css: '#a07cb0', name: "Yurt B" },
            { x: -30, z: -87, w: 19, h: 11, d: 15, color: 0x7aaac4, css: '#7aaac4', name: "Spor Salonu (BESYO)" },
            { x: 30, z: -87, w: 19, h: 11, d: 15, color: 0x7aaac4, css: '#7aaac4', name: "Sağlık Merkezi" },
            { x: 0, z: -33, w: 12, h: 5, d: 12, color: 0xc4b08a, css: '#c4b08a', name: "Güvenlik" },
        ];

        const SPOTS = [
            { id: 'masa_tenisi', icon: '🏓', title: 'Masa Tenisi', sub: 'BESYO yakınında masa tenisi masası', pos: { x: -18, z: -75 }, game: 'tt' },
            { id: 'flappy_bird', icon: '🕹️', title: 'Oyun Makinesi', sub: 'Mühendislik Fakültesi girişinde', pos: { x: 42, z: -36 }, game: 'fb' },
            { id: 'penalti', icon: '⚽', title: 'Penaltı Atışı', sub: 'BESYO spor alanında', pos: { x: -42, z: -78 }, game: 'ft' },
            { id: 'okculuk', icon: '🏹', title: 'Okçuluk', sub: 'Fen-Edebiyat yanı okçuluk pisti', pos: { x: -70, z: 28 }, game: 'ok' },
            { id: 'basket', icon: '🏀', title: 'Basketbol', sub: 'Yurt A karşısı basketbol sahası', pos: { x: -72, z: -44 }, game: 'bk' },
        ];

        const NPC_COLORS = [0xe74c3c, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xf39c12, 0x27ae60, 0xe91e63, 0x00bcd4, 0xff5722, 0x607d8b];

        /* ════════════════ STATE ════════════════════════ */
        let renderer, scene, camera;
        let player, playerYaw = 0, playerPitch = 0.18;
        let npcs = [], buildingAABBs = [], activeBubbles = [], proxLabels = [];
        let highlightIdx = -1, blinkOn = true, blinkTimer = 0;
        let keys = {}, isLocked = false;
        let mmCtx, mmSize = 165, audioCtx = null, lastT = 0;
        let bldgTimer = null, mapTimer = null, lbTimer = null;
        let activeSpot = null, gameRunning = false, gamePaused = false;
        let mainRafId = 0;

        // Joystick
        const JOY = { active: false, id: -1, bx: 0, by: 0, dx: 0, dy: 0, thumbEl: null, baseEl: null };
        const LOOK = { active: false, id: -1, lx: 0, ly: 0 };

        /* ════════════════ VR STATE ═════════════════════ */
        let xrActive = false;
        let xrRig = null;
        let xrCtrl0 = null;
        let xrCtrl1 = null;
        let xrRaycaster = null;
        const VR_WALK_SPEED = 5;
        const VR_TURN_SPEED = 1.8;
        const VR_DEADZONE = 0.25;
        let xrSupported = false;

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
                0,
                player ? player.position.z : 74
            );
            scene.add(xrRig);

            /* ── 3) Kontrolcüleri (el) ekle ───────────── */
            xrCtrl0 = renderer.xr.getController(0);
            xrCtrl1 = renderer.xr.getController(1);
            xrRig.add(xrCtrl0);
            xrRig.add(xrCtrl1);

            // Kontrolcü görselleri: ince çubuk + ray
            const ctrlGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.18, 8);
            const ctrlMat = new THREE.MeshLambertMaterial({ color: 0xff4444 });
            [xrCtrl0, xrCtrl1].forEach(ctrl => {
                const mesh = new THREE.Mesh(ctrlGeo, ctrlMat);
                mesh.rotation.x = Math.PI / 2;
                mesh.position.z = -0.09;
                ctrl.add(mesh);
                const lineGeo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, -2)
                ]);
                ctrl.add(new THREE.Line(lineGeo,
                    new THREE.LineBasicMaterial({ color: 0xff8888, transparent: true, opacity: .4 })));
            });

            /* ── 4) Controller grip modelleri (el) ────── */
            const grip0 = renderer.xr.getControllerGrip(0);
            const grip1 = renderer.xr.getControllerGrip(1);
            const handGeo = new THREE.BoxGeometry(0.06, 0.08, 0.14);
            const handMat = new THREE.MeshLambertMaterial({ color: 0x444466 });
            grip0.add(new THREE.Mesh(handGeo, handMat));
            grip1.add(new THREE.Mesh(handGeo, handMat));
            xrRig.add(grip0);
            xrRig.add(grip1);

            /* ── 5) Raycast (trigger ile spot tespiti) ── */
            xrRaycaster = new THREE.Raycaster();
            xrCtrl1.addEventListener('selectstart', () => {
                if (!activeSpot) return;
                document.getElementById('interact-prompt').style.display = 'none';
                startGame(activeSpot.game, activeSpot.id, activeSpot.title);
            });

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

                // Rig'i oyuncunun bulunduğu yere taşı
                if (player) {
                    xrRig.position.set(player.position.x, 0, player.position.z);
                    xrRig.rotation.y = playerYaw;
                    // 1. şahıs: oyuncu modelini gizle
                    player.visible = false;
                }

                // HTML overlay'leri gizle (VR'da görünmezler ama temizlik)
                hideHTMLForVR(true);

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
            const vrBtn = document.getElementById('vr-enter-btn');
            vrBtn.style.display = 'block';
            vrBtn.textContent = '🥽 VR\'a Gir';

            vrBtn.addEventListener('click', async () => {
                try {
                    vrBtn.textContent = 'Bağlanıyor…';
                    vrBtn.disabled = true;
                    const sessionInit = {
                        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
                    };
                    const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
                    renderer.xr.setSession(session);
                    vrBtn.style.display = 'none';

                    session.addEventListener('end', () => {
                        vrBtn.style.display = 'block';
                        vrBtn.textContent = '🥽 VR\'a Gir';
                        vrBtn.disabled = false;
                    });
                } catch (err) {
                    console.error('VR oturumu başlatılamadı:', err);
                    vrBtn.textContent = '🥽 VR\'a Gir';
                    vrBtn.disabled = false;
                    alert('VR başlatılamadı: ' + err.message);
                }
            });

            console.log('VR hazır – "VR\'a Gir" butonu gösterildi');
        }

        /* VR sırasında HTML UI'ı gizle/göster */
        function hideHTMLForVR(hide) {
            const ids = ['crosshair','controls-hint','mm-wrap','bldg-panel',
                         'lb-panel','joy-base','joy-label','m-bldg-btn',
                         'm-map-btn','m-lb-btn','lock-overlay','vr-enter-btn'];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = hide ? 'none' : '';
            });
        }

        /* ════════════════ INIT ═════════════════════════ */
        function initGame() {
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
            renderer.xr.enabled = false;
            detectAndSetupVR();

            // ── Sahne ve oyun objeleri ───────────────────
            buildScene();
            addInteractiveObjects();
            createPlayer();
            spawnNPCs();
            buildSidePanel();
            buildProxLabels();
            setupControls();
            setupLeaderboard();
            setupMiniGames();

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
            addWelcomeArch();
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

        function addWelcomeArch() {
            const red = new THREE.MeshLambertMaterial({ color: 0x8b1818 });
            [-10, 10].forEach(px => { const p = bx(1.8, 10, 1.8, red); p.position.set(px, 5, 82); p.castShadow = !IS_MOB; scene.add(p); buildingAABBs.push({ x0: px - 1, x1: px + 1, z0: 81, z1: 83 }); });
            const bL = bx(7, 2.2, 1.6, red); bL.position.set(-7.5, 10.5, 82); scene.add(bL);
            const bR = bx(7, 2.2, 1.6, red); bR.position.set(7.5, 10.5, 82); scene.add(bR);
            const tR = bx(22, .4, 1.6, red); tR.position.set(0, 11.65, 82); scene.add(tR);
            const bB2 = bx(22, .4, 1.6, red); bB2.position.set(0, 9.45, 82); scene.add(bB2);
            const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
            const c = cv.getContext('2d');
            const gr = c.createLinearGradient(0, 0, 512, 0); gr.addColorStop(0, '#6b0e0e'); gr.addColorStop(.5, '#9e1a1a'); gr.addColorStop(1, '#6b0e0e');
            c.fillStyle = gr; c.fillRect(0, 0, 512, 128); c.strokeStyle = '#e8c870'; c.lineWidth = 5; c.strokeRect(5, 5, 502, 118);
            c.fillStyle = '#e8c870'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.font = 'bold 33px Georgia,serif'; c.fillText("Harran Üniversitesi'ne", 256, 44);
            c.font = 'bold 31px Georgia,serif'; c.fillText("Hoş Geldiniz! 🎓", 256, 88);
            const sign = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 2.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide, depthWrite: false }));
            sign.position.set(0, 10.55, 82);
            sign.userData.isWelcomeSign = true;
            scene.add(sign);
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
            scene.add(m);
        }

        /* ════════════════ PLAYER ═══════════════════════ */
        function createPlayer() { player = makeHuman(0x1a4f8a, 0x1a2a3a); player.position.set(0, 0, 74); scene.add(player); }

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

            if (!gameRunning) {
                updatePlayer(dt);
                updateNPCs(dt);
                checkInteractSpots();
                if (xrActive) updateVRRaycast();
            }

            // Normal modda kamerayı güncelle, VR'da headset kontrol eder
            if (!xrActive) updateCamera();

            updateMarkers(dt);
            scene.traverse(o => {
                if (o.userData.isWelcomeSign) {
                    const d = player.position.distanceTo(o.position);
                    o.visible = (d < 30);
                }
            });
            updateProxLabels();
            updateBubbles();
            drawMinimap();

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
            const mv = fd !== 0;
            if (mv) {
                const px = player.position.x, pz = player.position.z;
                let nx = px + Math.sin(playerYaw) * fd * CFG.walkSpeed * dt;
                let nz = pz + Math.cos(playerYaw) * fd * CFG.walkSpeed * dt;
                nx = Math.max(-94, Math.min(94, nx)); nz = Math.max(-98, Math.min(86, nz));
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
        const SNAP_ANGLE = Math.PI / 6; // 30 derece

        function updateVRMovement(dt) {
            if (!xrRig) return;
            const session = renderer.xr.getSession();
            if (!session) return;

            for (const src of session.inputSources) {
                const gp = src.gamepad;
                if (!gp) continue;

                /* ── Sol el: Yürüyüş (baş yönünde) ────── */
                if (src.handedness === 'left') {
                    const axX = gp.axes[2] || 0;
                    const axZ = gp.axes[3] || 0;

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
                        move.addScaledVector(forward, -axZ * VR_WALK_SPEED * dt);
                        move.addScaledVector(right, axX * VR_WALK_SPEED * dt);

                        let nx = xrRig.position.x + move.x;
                        let nz = xrRig.position.z + move.z;
                        nx = Math.max(-94, Math.min(94, nx));
                        nz = Math.max(-98, Math.min(86, nz));
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
            setupInteractPrompt();

            if (IS_QUEST) {
                // Quest tarayıcısında: VR'a girmeden önce dokunmatik kamera kontrolü
                document.getElementById('lock-overlay').classList.add('hidden');
                document.addEventListener('touchstart', e => {
                    if (gameRunning || xrActive) return;
                    Array.from(e.changedTouches).forEach(t => {
                        if (!LOOK.active) { LOOK.active = true; LOOK.id = t.identifier; LOOK.lx = t.clientX; LOOK.ly = t.clientY; }
                    });
                }, { passive: true });
                document.addEventListener('touchmove', e => {
                    if (gameRunning || xrActive) return;
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
                renderer.domElement.addEventListener('click', () => { if (!isLocked && !gameRunning) renderer.domElement.requestPointerLock(); });
                ov.addEventListener('click', () => { if (!isLocked) renderer.domElement.requestPointerLock(); });
                document.addEventListener('mousedown', e => {
                    if (e.button !== 2) return;
                    e.preventDefault();
                    if (isLocked) { document.exitPointerLock(); }
                    else if (!gameRunning) { renderer.domElement.requestPointerLock(); }
                });
                document.addEventListener('contextmenu', e => e.preventDefault());
                document.addEventListener('pointerlockchange', () => {
                    isLocked = document.pointerLockElement === renderer.domElement;
                    if (isLocked) { ov.classList.add('hidden'); }
                    else if (!gameRunning) { ov.classList.remove('hidden'); }
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
                    if (gameRunning) return;
                    if (Array.from(e.changedTouches).some(isUI)) return;
                    e.preventDefault();
                    Array.from(e.changedTouches).forEach(t => {
                        const isL = t.clientX < innerWidth * .45;
                        if (isL && !JOY.active) { JOY.active = true; JOY.id = t.identifier; updateJoyBase(); setJoyThumb(t.clientX, t.clientY); }
                        else if (!isL && !LOOK.active) { LOOK.active = true; LOOK.id = t.identifier; LOOK.lx = t.clientX; LOOK.ly = t.clientY; }
                    });
                }, { passive: false });

                document.addEventListener('touchmove', e => {
                    if (gameRunning) return;
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
                    if (gameRunning) return;
                    Array.from(e.changedTouches).forEach(t => {
                        if (t.identifier === JOY.id) resetJoy();
                        if (t.identifier === LOOK.id) { LOOK.active = false; LOOK.id = -1; }
                    });
                }, { passive: false });

                document.addEventListener('touchcancel', () => {
                    if (!gameRunning) { resetJoy(); LOOK.active = false; LOOK.id = -1; }
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

        /* ════════════════ AUDIO ════════════════════════ */
        function initAudio() {
            const amb = new Audio();
            ['./Sound_Effects_Outdoor.mp3', './Sound_Effects_Outdoor.ogg', './Sound_Effects_Outdoor.wav'].forEach(src => { const s = document.createElement('source'); s.src = src.replace('./', '/'); amb.appendChild(s); });
            amb.loop = true; amb.volume = IS_MOB ? .4 : .5;
            amb.play().catch(() => console.warn('Ambient ses yüklenemedi.'));
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
        }
        function playBowDraw() {
            if (!audioCtx) return;
            const now = audioCtx.currentTime;
            const bufSz = audioCtx.sampleRate;
            const buf = audioCtx.createBuffer(1, bufSz, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSz; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(i / bufSz, 0.3);
            const ns = audioCtx.createBufferSource(); ns.buffer = buf;
            const flt = audioCtx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 180; flt.Q.value = 2.5;
            const gn = audioCtx.createGain();
            gn.gain.setValueAtTime(0, now);
            gn.gain.linearRampToValueAtTime(0.18, now + 0.4);
            gn.gain.linearRampToValueAtTime(0.12, now + 0.9);
            gn.gain.linearRampToValueAtTime(0, now + 1.0);
            ns.connect(flt); flt.connect(gn); gn.connect(audioCtx.destination);
            ns.start(now); ns.stop(now + 1.05);
        }
        function playArrowShoot() {
            if (!audioCtx) return;
            const now = audioCtx.currentTime;
            const bufSz = Math.floor(audioCtx.sampleRate * 0.25);
            const buf = audioCtx.createBuffer(1, bufSz, audioCtx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSz; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSz, 1.5);
            const ns = audioCtx.createBufferSource(); ns.buffer = buf;
            const flt = audioCtx.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 1200;
            const gn = audioCtx.createGain(); gn.gain.setValueAtTime(0.5, now); gn.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            ns.connect(flt); flt.connect(gn); gn.connect(audioCtx.destination);
            ns.start(now); ns.stop(now + 0.25);
            const o = audioCtx.createOscillator(); const og = audioCtx.createGain();
            o.type = 'triangle'; o.frequency.setValueAtTime(220, now); o.frequency.exponentialRampToValueAtTime(60, now + 0.18);
            og.gain.setValueAtTime(0.25, now); og.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            o.connect(og); og.connect(audioCtx.destination); o.start(now); o.stop(now + 0.22);
        }
        function playMurmur() {
            if (!audioCtx) return; const now = audioCtx.currentTime, o = audioCtx.createOscillator(), f = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
            o.type = 'sawtooth'; o.frequency.value = 120 + Math.random() * 80; f.type = 'lowpass'; f.frequency.value = 350;
            g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(.07, now + .1); g.gain.linearRampToValueAtTime(0, now + .65);
            o.connect(f); f.connect(g); g.connect(audioCtx.destination); o.start(now); o.stop(now + .7);
        }
        function playBeep(freq = 440, dur = .1, vol = .3) {
            if (!audioCtx) return; const now = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.frequency.value = freq; g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(.001, now + dur);
            o.connect(g); g.connect(audioCtx.destination); o.start(now); o.stop(now + dur + .05);
        }

        /* ════════════════════════════════════════════════
           ══ LEADERBOARD (Supabase) ═══════════════════
        ════════════════════════════════════════════════ */
        let currentLbGame = 'masa_tenisi';
        let lbBodyOpen = true;

        async function sbGet(game) {
            try {
                const r = await fetch(`${SB_URL}/rest/v1/${SB_TABLE}?game=eq.${game}&order=score.desc&limit=10`, {
                    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
                });
                if (!r.ok) return null;
                return await r.json();
            } catch (e) { return null; }
        }

        async function sbInsert(game, playerName, score) {
            try {
                const r = await fetch(`${SB_URL}/rest/v1/${SB_TABLE}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Prefer': 'return=representation' },
                    body: JSON.stringify({ game, player_name: playerName, score })
                });
                return await r.json();
            } catch (e) { return null; }
        }

        async function getPlayerRank(game, score) {
            try {
                const r = await fetch(`${SB_URL}/rest/v1/${SB_TABLE}?game=eq.${game}&score=gt.${score}&select=id`, {
                    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
                });
                if (!r.ok) return null;
                const data = await r.json();
                return data.length + 1;
            } catch (e) { return null; }
        }

        async function loadLeaderboard(game) {
            currentLbGame = game;
            const list = document.getElementById('lb-list');
            list.innerHTML = '<div id="lb-loading">Yükleniyor…</div>';
            const data = await sbGet(game);
            if (!data || data.error) {
                list.innerHTML = '<div class="lb-empty">Bağlantı yok veya Supabase ayarlanmamış</div>'; return;
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
                await sbInsert(pendingGame, name, pendingScore);
                const rank = await getPlayerRank(pendingGame, pendingScore);
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
            });

            document.getElementById('sm-skip').addEventListener('click', () => {
                document.getElementById('score-modal').classList.remove('active');
                if (!IS_MOB && !gameRunning) setTimeout(() => renderer.domElement.requestPointerLock(), 300);
            });
            document.getElementById('sm-close-btn').addEventListener('click', () => {
                document.getElementById('score-modal').classList.remove('active');
                document.getElementById('sm-save').textContent = 'Kaydet 💾'; document.getElementById('sm-save').disabled = false;
                if (!IS_MOB && !gameRunning) setTimeout(() => renderer.domElement.requestPointerLock(), 300);
            });
        }

        /* ════════════════════════════════════════════════
           ══ MINI GAME ENGINE ═════════════════════════
        ════════════════════════════════════════════════ */
        let currentGame = null, currentGameId = null, currentGameTitle = null;
        let gameRaf = null;

        function setupMiniGames() { setupScoreModal(); }

        function startGame(type, id, title) {
            gameRunning = true; currentGameId = id; currentGameTitle = title;
            if (IS_MOB) {
                resetJoy(); LOOK.active = false; LOOK.id = -1;
                ['joy-base', 'joy-label', 'm-bldg-btn', 'm-map-btn', 'm-lb-btn'].forEach(id2 => {
                    const el = document.getElementById(id2); if (el) el.style.display = 'none';
                });
            }
            const overlay = document.getElementById('game-overlay');
            overlay.classList.add('active');
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

            currentGame.start();
        }

        function endGame(score = -1) {
            if (gameRaf) { cancelAnimationFrame(gameRaf); gameRaf = null; }
            if (score === -1 && currentGame) {
                if (currentGame.totalScore !== undefined) score = currentGame.totalScore;
                else if (currentGame.score !== undefined) score = currentGame.score;
                else if (currentGame.goals !== undefined) score = currentGame.goals * 10;
                else if (currentGame.points !== undefined) score = currentGame.points;
            }
            if (currentGame) { currentGame.destroy(); currentGame = null; }
            document.getElementById('game-overlay').classList.remove('active');
            gameRunning = false;
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

        /* ════════════════════════════════════════════════
           ══ MASA TENİSİ (PONG – SONSUZ) ══════════════
        ════════════════════════════════════════════════ */
        class TableTennis {
            constructor(canvas, W, H, done) {
                this.canvas = canvas; this.ctx = canvas.getContext('2d');
                this.W = W; this.H = H; this.done = done;
                this.vert = IS_MOB;
                this.totalScore = 0; this.rally = 0; this.gameOver = false;
                this.pPos = this.vert ? W / 2 : H / 2;
                this.cPos = this.vert ? W / 2 : H / 2;
                this._mm = e => this.onMouseMove(e);
                this._ts = e => this.onTouch(e);
                this._kb = e => this.onKey(e);
                this.resetBall();
            }
            resetBall() {
                this.bx = this.W / 2; this.by = this.H / 2;
                const spd = 5.5 + Math.min(this.rally * .1, 4);
                const ang = (Math.random() * .5 + .15) * (Math.random() < .5 ? 1 : -1);
                if (this.vert) {
                    this.bvx = spd * Math.sin(ang);
                    this.bvy = -Math.abs(spd * Math.cos(ang));
                } else {
                    this.bvx = Math.abs(spd * Math.cos(ang));
                    this.bvy = spd * Math.sin(ang);
                }
                this.br = 7;
                this.pLen = this.vert ? this.W * .28 : this.H * .22;
                this.rThick = 12;
                this.maxSpd = 16; this.rally = 0;
            }
            start() {
                document.addEventListener('mousemove', this._mm);
                this.canvas.addEventListener('touchstart', this._ts, { passive: false });
                this.canvas.addEventListener('touchmove', this._ts, { passive: false });
                document.addEventListener('keydown', this._kb);
                this.loop();
            }
            destroy() {
                document.removeEventListener('mousemove', this._mm);
                this.canvas.removeEventListener('touchstart', this._ts);
                this.canvas.removeEventListener('touchmove', this._ts);
                document.removeEventListener('keydown', this._kb);
            }
            onMouseMove(e) {
                const rect = this.canvas.getBoundingClientRect();
                this.pPos = Math.max(this.pLen / 2, Math.min(this.H - this.pLen / 2, (e.clientY - rect.top)));
            }
            onTouch(e) {
                e.preventDefault(); e.stopPropagation();
                const rect = this.canvas.getBoundingClientRect();
                const t = e.touches[0] || e.changedTouches[0]; if (!t) return;
                if (this.vert) {
                    this.pPos = Math.max(this.pLen / 2, Math.min(this.W - this.pLen / 2, t.clientX - rect.left));
                } else {
                    this.pPos = Math.max(this.pLen / 2, Math.min(this.H - this.pLen / 2, t.clientY - rect.top));
                }
            }
            onKey(e) {
                if (this.vert) {
                    if (e.code === 'ArrowLeft') this.pPos = Math.max(this.pLen / 2, this.pPos - 20);
                    if (e.code === 'ArrowRight') this.pPos = Math.min(this.W - this.pLen / 2, this.pPos + 20);
                } else {
                    if (e.code === 'ArrowUp') this.pPos = Math.max(this.pLen / 2, this.pPos - 18);
                    if (e.code === 'ArrowDown') this.pPos = Math.min(this.H - this.pLen / 2, this.pPos + 18);
                }
            }
            loop() { gameRaf = requestAnimationFrame(() => this.loop()); if (!this.gameOver) this.update(); this.draw(); }
            update() {
                if (this.vert) this.updateVert();
                else this.updateHoriz();
                document.getElementById('game-score-txt').textContent = `Skor: ${this.totalScore}`;
                document.getElementById('game-info-txt').textContent = `Rally: ${this.rally} | Her vuruş puan kazandırır!`;
            }
            updateVert() {
                const W = this.W, H = this.H, br = this.br;
                if (this.bvy < 0) this.cPos = Math.max(this.pLen / 2, Math.min(W - this.pLen / 2, this.bx));
                this.bx += this.bvx; this.by += this.bvy;
                if (this.bx - br < 0) { this.bx = br; this.bvx *= -1; playBeep(600, .07); }
                if (this.bx + br > W) { this.bx = W - br; this.bvx *= -1; playBeep(600, .07); }
                const cy = this.rThick + 2;
                if (this.by - br < cy + this.rThick && this.by > cy && this.bx > this.cPos - this.pLen / 2 && this.bx < this.cPos + this.pLen / 2) {
                    this.by = cy + this.rThick + br + 1;
                    this.bvy = Math.abs(this.bvy) * 1.02;
                    this.bvx += (this.bx - this.cPos) / this.pLen * 3;
                    this.bvy = Math.min(this.maxSpd, this.bvy);
                    this.bvx = Math.max(-this.maxSpd, Math.min(this.maxSpd, this.bvx));
                    playBeep(480, .07, .35);
                }
                const py = H - this.rThick - 2;
                if (this.by + br > py - this.rThick && this.by < py && this.bx > this.pPos - this.pLen / 2 && this.bx < this.pPos + this.pLen / 2) {
                    this.by = py - this.rThick - br - 1;
                    this.bvy = -Math.abs(this.bvy) * 1.04;
                    this.bvx += (this.bx - this.pPos) / this.pLen * 4;
                    this.bvy = Math.max(-this.maxSpd, this.bvy);
                    this.bvx = Math.max(-this.maxSpd, Math.min(this.maxSpd, this.bvx));
                    this.rally++;
                    const pts = this.rally <= 3 ? 5 : this.rally <= 8 ? 8 : 12;
                    this.totalScore += pts;
                    playBeep(400, .07, .4);
                }
                if (this.by - br > H) {
                    this.gameOver = true; playBeep(150, .4, .6);
                    cancelAnimationFrame(gameRaf); gameRaf = null;
                    this.drawGameOver();
                    setTimeout(() => { document.getElementById('game-overlay').classList.remove('active'); gameRunning = false; this.done(this.totalScore); }, 1200);
                }
                if (this.by + br < 0) this.resetBall();
            }
            updateHoriz() {
                const W = this.W, H = this.H, br = this.br;
                const cx = W - this.rThick - 2;
                if (this.bvx > 0) this.cPos = Math.max(this.pLen / 2, Math.min(H - this.pLen / 2, this.by));
                this.bx += this.bvx; this.by += this.bvy;
                if (this.by - br < 0) { this.by = br; this.bvy *= -1; playBeep(600, .07); }
                if (this.by + br > H) { this.by = H - br; this.bvy *= -1; playBeep(600, .07); }
                if (this.bx + br > cx - this.rThick && this.bx < cx && this.by > this.cPos - this.pLen / 2 && this.by < this.cPos + this.pLen / 2) {
                    this.bx = cx - this.rThick - br - 1;
                    this.bvx = -Math.abs(this.bvx) * 1.02;
                    this.bvy += (this.by - this.cPos) / this.pLen * 3;
                    this.bvx = Math.max(-this.maxSpd, this.bvx);
                    this.bvy = Math.max(-this.maxSpd, Math.min(this.maxSpd, this.bvy));
                    playBeep(480, .07, .35);
                }
                const px = this.rThick + 2;
                if (this.bx - br < px + this.rThick && this.bx > px && this.by > this.pPos - this.pLen / 2 && this.by < this.pPos + this.pLen / 2) {
                    this.bx = px + this.rThick + br + 1;
                    this.bvx = Math.abs(this.bvx) * 1.04;
                    this.bvy += (this.by - this.pPos) / this.pLen * 4;
                    this.bvx = Math.min(this.maxSpd, this.bvx);
                    this.bvy = Math.max(-this.maxSpd, Math.min(this.maxSpd, this.bvy));
                    this.rally++;
                    const pts = this.rally <= 3 ? 5 : this.rally <= 8 ? 8 : 12;
                    this.totalScore += pts;
                    playBeep(400, .07, .4);
                }
                if (this.bx - br < 0) {
                    this.gameOver = true; playBeep(150, .4, .6);
                    cancelAnimationFrame(gameRaf); gameRaf = null;
                    this.drawGameOver();
                    setTimeout(() => { document.getElementById('game-overlay').classList.remove('active'); gameRunning = false; this.done(this.totalScore); }, 1200);
                }
                if (this.bx + br > W) this.resetBall();
            }
            drawGameOver() {
                const c = this.ctx, W = this.W, H = this.H;
                this.draw();
                c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(0, 0, W, H);
                c.fillStyle = '#e74c3c'; c.font = `bold ${Math.min(W, H) * .1}px Cinzel,serif`; c.textAlign = 'center';
                c.fillText('OYUN BİTTİ', W / 2, H * .42);
                c.fillStyle = '#e8c870'; c.font = `bold ${Math.min(W, H) * .07}px Inter,Arial`;
                c.fillText(`Skor: ${this.totalScore}`, W / 2, H * .58);
            }
            draw() {
                const c = this.ctx, W = this.W, H = this.H;
                c.fillStyle = '#1a1a2e'; c.fillRect(0, 0, W, H);
                if (this.vert) {
                    c.setLineDash([8, 8]); c.strokeStyle = 'rgba(255,255,255,.15)'; c.lineWidth = 2;
                    c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke(); c.setLineDash([]);
                    c.fillStyle = 'rgba(50,200,50,.12)'; c.fillRect(0, 0, W, 8); c.fillRect(0, H - 8, W, 8);
                    c.fillStyle = '#e74c3c';
                    c.fillRect(this.cPos - this.pLen / 2, this.rThick + 2, this.pLen, this.rThick);
                    c.fillStyle = '#e8c870';
                    c.fillRect(this.pPos - this.pLen / 2, H - this.rThick * 2 - 2, this.pLen, this.rThick);
                    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, H / 2 - 2, W, 4);
                    c.fillStyle = 'rgba(255,50,50,.5)'; c.font = `${H * .035}px Inter,Arial`; c.textAlign = 'center';
                    c.fillText('BİLGİSAYAR', W / 2, this.rThick + 30);
                    c.fillStyle = 'rgba(232,200,112,.5)';
                    c.fillText('SEN', W / 2, H - this.rThick - 20);
                } else {
                    c.setLineDash([8, 8]); c.strokeStyle = 'rgba(255,255,255,.15)'; c.lineWidth = 2;
                    c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke(); c.setLineDash([]);
                    c.fillStyle = 'rgba(50,200,50,.12)'; c.fillRect(0, 0, W, 8); c.fillRect(0, H - 8, W, 8);
                    c.fillStyle = '#e8c870';
                    c.fillRect(this.rThick + 2, this.pPos - this.pLen / 2, this.rThick, this.pLen);
                    c.fillStyle = '#e74c3c';
                    c.fillRect(W - this.rThick * 2 - 2, this.cPos - this.pLen / 2, this.rThick, this.pLen);
                }
                c.fillStyle = '#fff'; c.beginPath(); c.arc(this.bx, this.by, this.br, 0, Math.PI * 2); c.fill();
                c.fillStyle = 'rgba(255,255,255,.9)';
                c.font = `bold ${Math.min(W, H) * .1}px Cinzel,serif`; c.textAlign = 'center';
                c.fillText(this.totalScore, W / 2, this.vert ? H * .5 - 16 : H * .14);
                c.fillStyle = 'rgba(255,255,255,.25)';
                c.font = `${Math.min(W, H) * .04}px Inter,Arial`;
                c.fillText('SKOR', W / 2, this.vert ? H * .5 + 12 : H * .22);
                if (this.rally > 3) {
                    c.fillStyle = 'rgba(232,200,112,.7)';
                    c.font = `${Math.min(W, H) * .038}px Inter,Arial`;
                    c.fillText(`🔥 ${this.rally} rally!`, W / 2, this.vert ? H * .5 + 36 : H * .88);
                }
            }
        }

        /* ════════════════════════════════════════════════
           ══ FLAPPY BIRD ══════════════════════════════
        ════════════════════════════════════════════════ */
        class FlappyBird {
            constructor(canvas, W, H, done) {
                this.canvas = canvas; this.ctx = canvas.getContext('2d');
                this.W = W; this.H = H; this.done = done;
                this._kb = e => { if (e.code === 'Space') this.flap(); };
                this._tc = e => { e.preventDefault(); e.stopPropagation(); this.flap(); };
                this._cl = () => this.flap();
            }
            start() {
                this.bird = { x: this.W * .22, y: this.H / 2, vy: 0, r: 16 };
                this.gravity = 0.42; this.flapPow = -8.5; this.pipes = [];
                this.pipeW = 54; this.gap = this.H * .32; this.pipeTimer = 0; this.pipeInterval = 110;
                this.score = 0; this.alive = true; this.started = false;
                this.frame = 0;
                document.addEventListener('keydown', this._kb);
                this.canvas.addEventListener('touchstart', this._tc, { passive: false });
                this.canvas.addEventListener('click', this._cl);
                this.loop();
            }
            destroy() {
                document.removeEventListener('keydown', this._kb);
                this.canvas.removeEventListener('touchstart', this._tc);
                this.canvas.removeEventListener('click', this._cl);
            }
            flap() {
                if (!this.alive) { return; }
                if (!this.started) this.started = true;
                this.bird.vy = this.flapPow;
                playBeep(700, .06, .3);
            }
            loop() {
                gameRaf = requestAnimationFrame(() => this.loop());
                this.update(); this.draw();
            }
            update() {
                if (!this.started || !this.alive) return;
                this.frame++;
                this.bird.vy += this.gravity;
                this.bird.y += this.bird.vy;
                if (this.bird.y - this.bird.r < 0 || this.bird.y + this.bird.r > this.H) { this.die(); return; }
                this.pipeTimer++;
                if (this.pipeTimer >= this.pipeInterval) {
                    this.pipeTimer = 0;
                    const top = this.H * .15 + Math.random() * (this.H * .55);
                    this.pipes.push({ x: this.W, top, scored: false });
                }
                for (let i = this.pipes.length - 1; i >= 0; i--) {
                    const p = this.pipes[i]; p.x -= 3.5;
                    if (!p.scored && p.x + this.pipeW < this.bird.x) { p.scored = true; this.score++; playBeep(880, .08); }
                    if (p.x + this.pipeW < 0) { this.pipes.splice(i, 1); continue; }
                    const bx = this.bird.x, by = this.bird.y, br = this.bird.r;
                    if (bx + br > p.x && bx - br < p.x + this.pipeW && (by - br < p.top || by + br > p.top + this.gap)) { this.die(); return; }
                }
                document.getElementById('game-score-txt').textContent = `Skor: ${this.score}`;
                document.getElementById('game-info-txt').textContent = 'Boşluklardan geç!';
            }
            die() {
                this.alive = false; playBeep(200, .3, .5);
                setTimeout(() => {
                    cancelAnimationFrame(gameRaf); gameRaf = null;
                    document.getElementById('game-overlay').classList.remove('active');
                    gameRunning = false;
                    this.done(this.score);
                }, 900);
            }
            draw() {
                const c = this.ctx, W = this.W, H = this.H;
                const sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#87ceeb'); sky.addColorStop(1, '#c9e8f5');
                c.fillStyle = sky; c.fillRect(0, 0, W, H);
                c.fillStyle = '#8b6914'; c.fillRect(0, H - 24, W, 24);
                c.fillStyle = '#5a8a1a'; c.fillRect(0, H - 30, W, 8);
                this.pipes.forEach(p => {
                    c.fillStyle = '#2ecc71';
                    c.fillRect(p.x, 0, this.pipeW, p.top);
                    c.fillRect(p.x, p.top + this.gap, this.pipeW, H - p.top - this.gap);
                    c.fillStyle = '#27ae60';
                    c.fillRect(p.x - 4, p.top - 18, this.pipeW + 8, 18);
                    c.fillRect(p.x - 4, p.top + this.gap, this.pipeW + 8, 18);
                });
                const b = this.bird;
                c.save(); c.translate(b.x, b.y);
                c.rotate(Math.max(-0.5, Math.min(0.8, b.vy * .06)));
                c.fillStyle = '#f39c12'; c.beginPath(); c.arc(0, 0, b.r, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#e67e22'; c.beginPath(); c.arc(4, -4, b.r * .55, 0, Math.PI * 2); c.fill();
                c.fillStyle = 'white'; c.beginPath(); c.arc(6, -6, b.r * .3, 0, Math.PI * 2); c.fill();
                c.fillStyle = '#333'; c.beginPath(); c.arc(8, -6, b.r * .15, 0, Math.PI * 2); c.fill();
                c.restore();
                c.fillStyle = 'rgba(0,0,0,.55)'; c.font = `bold ${H * .085}px Cinzel,serif`; c.textAlign = 'center';
                c.fillText(this.score, W / 2 + 2, H * .15 + 2); c.fillStyle = 'white'; c.fillText(this.score, W / 2, H * .15);
                if (!this.started) {
                    c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, 0, W, H);
                    c.fillStyle = 'white'; c.font = `bold ${H * .055}px Cinzel,serif`; c.textAlign = 'center';
                    c.fillText('Başlamak için tıkla veya Boşluk', W / 2, H / 2);
                }
                if (!this.alive) {
                    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, W, H);
                    c.fillStyle = '#e74c3c'; c.font = `bold ${H * .08}px Cinzel,serif`; c.textAlign = 'center';
                    c.fillText('GAME OVER', W / 2, H * .42);
                    c.fillStyle = 'white'; c.font = `${H * .05}px Inter,Arial`;
                    c.fillText('Skor: ' + this.score, W / 2, H * .55);
                }
            }
        }

        /* ════════════════════════════════════════════════
           ══ PENALTİ ATIŞI ════════════════════════════
        ════════════════════════════════════════════════ */
        class Penalti {
            constructor(canvas, W, H, done) {
                this.canvas = canvas; this.ctx = canvas.getContext('2d');
                this.W = W; this.H = H; this.done = done;
                this._cl = e => this.onClick(e);
                this._tc = e => this.onTap(e);
            }
            start() {
                this.shot = 0; this.goals = 0; this.missed = 0;
                this.state = 'aim';
                this.aimX = this.W / 2; this.aimY = this.H * .38;
                this.aimDx = 3.5; this.aimDy = 1.8;
                this.ballX = this.W / 2; this.ballY = this.H * .82;
                this.ballTx = 0; this.ballTy = 0;
                this.keeperX = this.W / 2; this.keeperDir = 1; this.keeperSpeed = 4.5;
                this.keeperDive = -1;
                this.msg = ''; this.msgT = 0;
                this.canvas.addEventListener('click', this._cl);
                this.canvas.addEventListener('touchstart', this._tc, { passive: false });
                this.loop();
            }
            destroy() {
                this.canvas.removeEventListener('click', this._cl);
                this.canvas.removeEventListener('touchstart', this._tc);
            }
            onClick(e) { const rect = this.canvas.getBoundingClientRect(); this.shoot(e.clientX - rect.left, e.clientY - rect.top); }
            onTap(e) { e.preventDefault(); e.stopPropagation(); const rect = this.canvas.getBoundingClientRect(); const t = e.touches[0] || e.changedTouches[0]; this.shoot(t.clientX - rect.left, t.clientY - rect.top); }
            shoot(mx, my) {
                if (this.state !== 'aim') return;
                this.ballTx = this.aimX; this.ballTy = this.aimY;
                this.keeperFrozenX = this.keeperX;
                this.state = 'fly'; this.flyT = 0;
                playBeep(300, .08, .5);
            }
            loop() { gameRaf = requestAnimationFrame(() => this.loop()); this.update(); this.draw(); }
            update() {
                const W = this.W, H = this.H;
                if (this.state === 'aim') {
                    this.aimX += this.aimDx; this.aimY += this.aimDy;
                    const goalL = W * .2, goalR = W * .8, goalT = H * .18, goalB = H * .48;
                    if (this.aimX < goalL || this.aimX > goalR) this.aimDx *= -1;
                    if (this.aimY < goalT || this.aimY > goalB) this.aimDy *= -1;
                    this.keeperX += this.keeperDir * this.keeperSpeed;
                    if (this.keeperX < W * .3 || this.keeperX > W * .7) this.keeperDir *= -1;
                } else if (this.state === 'fly') {
                    this.flyT = Math.min(1, this.flyT + .05);
                    this.ballX = this.W / 2 + (this.ballTx - this.W / 2) * this.flyT;
                    this.ballY = H * .82 + (this.ballTy - H * .82) * this.flyT;
                    if (this.flyT >= 1) {
                        const tx = this.ballTx, ty = this.ballTy;
                        const goalL = W * .22, goalR = W * .78, goalT = H * .18, goalB = H * .48;
                        const inGoal = tx > goalL && tx < goalR && ty > goalT && ty < goalB;
                        const keeperReach = 50;
                        const keeperBlocks = inGoal && Math.abs(tx - this.keeperFrozenX) < keeperReach;
                        if (inGoal && !keeperBlocks) {
                            this.goals++; this.msg = '⚽ GOL! +10'; playBeep(880, .2, .6); setTimeout(() => playBeep(1100, .15, .5), 200);
                        } else if (!inGoal) {
                            this.missed++; this.msg = '😬 Kaçtı!'; playBeep(200, .25, .5);
                        } else {
                            this.missed++; this.msg = '🧤 Kurtardı!'; playBeep(300, .2, .4);
                        }
                        this.msgT = 90; this.shot++;
                        if (this.missed >= 3) {
                            this.state = 'gameover'; this.msgT = 120;
                            setTimeout(() => {
                                cancelAnimationFrame(gameRaf); gameRaf = null;
                                document.getElementById('game-overlay').classList.remove('active'); gameRunning = false;
                                this.done(this.goals * 10);
                            }, 1600);
                        } else {
                            this.state = 'result';
                            this.keeperSpeed = 4.5 + Math.min(this.goals * .3, 4);
                            setTimeout(() => { this.state = 'aim'; this.ballX = this.W / 2; this.ballY = H * .82; }, 1400);
                        }
                    }
                }
                document.getElementById('game-score-txt').textContent = `Skor: ${this.goals * 10} | Gol: ${this.goals} | ❌ ${this.missed}/3`;
                document.getElementById('game-info-txt').textContent = '3 kaçırınca oyun biter!';
            }
            draw() {
                const c = this.ctx, W = this.W, H = this.H;
                c.fillStyle = '#2e7d32'; c.fillRect(0, 0, W, H);
                c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 2;
                c.beginPath(); c.ellipse(W / 2, H * .75, W * .2, H * .12, 0, 0, Math.PI * 2); c.stroke();
                const gL = W * .2, gR = W * .8, gT = H * .18, gB = H * .48;
                c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(gL, gT, gR - gL, gB - gT);
                c.strokeStyle = 'white'; c.lineWidth = 3; c.strokeRect(gL, gT, gR - gL, gB - gT);
                c.strokeStyle = 'rgba(255,255,255,.15)'; c.lineWidth = 1;
                for (let x = gL + 40; x < gR; x += 40) { c.beginPath(); c.moveTo(x, gT); c.lineTo(x, gB); c.stroke(); }
                for (let y = gT + 28; y < gB; y += 28) { c.beginPath(); c.moveTo(gL, y); c.lineTo(gR, y); c.stroke(); }
                const kx = this.keeperX; const ky = gT + 8;
                const kBodyH = gB - ky - 4;
                c.fillStyle = '#e74c3c'; c.fillRect(kx - 22, ky, 44, kBodyH);
                c.fillStyle = '#f0c8a0'; c.beginPath(); c.arc(kx, ky - 14, 16, 0, Math.PI * 2); c.fill();
                if (this.state === 'aim') {
                    c.strokeStyle = 'rgba(255,255,0,.8)'; c.lineWidth = 2;
                    c.beginPath(); c.arc(this.aimX, this.aimY, 14, 0, Math.PI * 2); c.stroke();
                    c.beginPath(); c.moveTo(this.aimX - 20, this.aimY); c.lineTo(this.aimX + 20, this.aimY); c.stroke();
                    c.beginPath(); c.moveTo(this.aimX, this.aimY - 20); c.lineTo(this.aimX, this.aimY + 20); c.stroke();
                }
                c.fillStyle = 'white'; c.beginPath(); c.arc(this.ballX, this.ballY, 12, 0, Math.PI * 2); c.fill();
                c.strokeStyle = '#333'; c.lineWidth = 1.5; c.stroke();
                if (this.msg && this.msgT > 0) {
                    this.msgT--;
                    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(W * .3, H * .55, W * .4, H * .14);
                    c.fillStyle = '#ffdd44'; c.font = `bold ${H * .07}px Cinzel,serif`; c.textAlign = 'center';
                    c.fillText(this.msg, W / 2, H * .65);
                }
                c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(W * .25, H * .03, W * .5, H * .1);
                c.fillStyle = 'white'; c.font = `bold ${H * .055}px Inter,Arial`; c.textAlign = 'center';
                c.fillText(`⚽ ${this.goals} Gol  ❌ ${this.missed || 0}/3`, W / 2, H * .1);
                if (this.state === 'aim') {
                    c.fillStyle = 'rgba(255,255,255,.7)'; c.font = `${H * .04}px Inter,Arial`;
                    c.fillText('Ekrana tıkla – tam hedef üstüne!', W / 2, H * .94);
                }
                if (this.state === 'gameover') {
                    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, 0, W, H);
                    c.fillStyle = '#e74c3c'; c.font = `bold ${H * .09}px Cinzel,serif`; c.textAlign = 'center';
                    c.fillText('OYUN BİTTİ', W / 2, H * .42);
                    c.fillStyle = '#e8c870'; c.font = `bold ${H * .07}px Inter,Arial`;
                    c.fillText(`Skor: ${this.goals * 10}`, W / 2, H * .58);
                }
            }
        }

        /* ════════════════════════════════════════════════
           ══ OKÇULUK ══════════════════════════════════
        ════════════════════════════════════════════════ */
        class Archery {
            constructor(canvas, W, H, done) {
                this.canvas = canvas; this.ctx = canvas.getContext('2d');
                this.W = W; this.H = H; this.done = done;
                this.points = 0;
                this.missLeft = 5;
                this.totalShots = 0;
                this.state = 'aim';
                this.tx = W / 2; this.ty = H * .32; this.tdx = 2.5;
                this.tr = Math.min(W, H) * .13;
                this.arrowFlyX = W / 2; this.arrowFlyY = H * .82;
                this.flyT = 0;
                this.msg = ''; this.msgT = 0;
                this.drawPct = 0; this.holding = false; this.holdStart = 0; this.DRAW_TIME = 500;
            }
            start() {
                this.drawPct = 0;
                this.holding = false;
                this.holdStart = 0;
                this.DRAW_TIME = 500;
                this._pd = e => { e.preventDefault(); this.pressDown(); };
                this._pu = e => { e.preventDefault(); this.pressUp(); };
                this._td = e => { e.preventDefault(); e.stopPropagation(); this.pressDown(); };
                this._tu = e => { e.preventDefault(); e.stopPropagation(); this.pressUp(); };
                this._kb = e => { if (e.code === 'Space') { e.preventDefault(); if (!this.holding) this.pressDown(); } };
                this._kr = e => { if (e.code === 'Space') { e.preventDefault(); this.pressUp(); } };
                this.canvas.addEventListener('mousedown', this._pd);
                document.addEventListener('mouseup', this._pu);
                this.canvas.addEventListener('touchstart', this._td, { passive: false });
                this.canvas.addEventListener('touchend', this._tu, { passive: false });
                document.addEventListener('keydown', this._kb);
                document.addEventListener('keyup', this._kr);
                this.loop();
            }
            destroy() {
                this.canvas.removeEventListener('mousedown', this._pd);
                document.removeEventListener('mouseup', this._pu);
                this.canvas.removeEventListener('touchstart', this._td);
                this.canvas.removeEventListener('touchend', this._tu);
                document.removeEventListener('keydown', this._kb);
                document.removeEventListener('keyup', this._kr);
            }
            pressDown() {
                if (this.state !== 'aim' || this.holding) return;
                this.holding = true;
                this.holdStart = performance.now();
                this.drawPct = 0;
                if (!this._bowAudio) {
                    this._bowAudio = new Audio('/bow_draw.mp3');
                    this._bowAudio.volume = 0.7;
                }
                this._bowAudio.currentTime = 0;
                this._bowAudio.play().catch(() => { });
            }
            pressUp() {
                if (!this.holding) return;
                this.holding = false;
                if (this._bowAudio) { this._bowAudio.pause(); this._bowAudio.currentTime = 0; }
                if (this.state !== 'aim') return;
                if (this.drawPct >= 0.1) this.shoot();
                else this.drawPct = 0;
            }
            shoot() {
                if (this.state !== 'aim') return;
                this.arrowFlyX = this.W / 2;
                this.arrowFlyY = this.H * .82;
                this.state = 'fly'; this.flyT = 0; this.totalShots++;
                this.drawPct = 0;
                playArrowShoot();
            }
            loop() { gameRaf = requestAnimationFrame(() => this.loop()); this.update(); this.draw(); }
            update() {
                const W = this.W;
                if (this.holding && this.state === 'aim') {
                    this.drawPct = Math.min(1, (performance.now() - this.holdStart) / this.DRAW_TIME);
                }
                this.tx += this.tdx;
                if (this.tx - this.tr < W * .08) this.tdx = Math.abs(this.tdx);
                if (this.tx + this.tr > W * .92) this.tdx = -Math.abs(this.tdx);

                if (this.state === 'fly') {
                    this.flyT = Math.min(1, this.flyT + .07);
                    this.arrowFlyY = this.H * .82 + (this.ty - this.H * .82) * this.flyT;
                    if (this.flyT >= 1) {
                        const hitDist = Math.abs(this.tx - this.W / 2);
                        let pts = 0;
                        if (hitDist < this.tr * .18) { pts = 100; this.msg = '🎯 TAM ORTA! +100'; }
                        else if (hitDist < this.tr * .38) { pts = 70; this.msg = '🏹 Çok iyi! +70'; }
                        else if (hitDist < this.tr * .62) { pts = 40; this.msg = '👍 Güzel! +40'; }
                        else if (hitDist < this.tr) { pts = 10; this.msg = '✅ Değdi! +10'; }
                        else { pts = 0; this.msg = '❌ Kaçtı!'; }
                        this.points += pts;
                        if (pts === 0) this.missLeft--;
                        if (pts > 0) playBeep(880, .12, .4); else playBeep(220, .2, .4);
                        this.msgT = 75;
                        this.state = 'result';
                        setTimeout(() => {
                            if (this.missLeft <= 0) {
                                cancelAnimationFrame(gameRaf); gameRaf = null;
                                document.getElementById('game-overlay').classList.remove('active'); gameRunning = false;
                                this.done(this.points);
                            } else {
                                this.state = 'aim';
                                const spd = Math.min(9, 2.5 + this.totalShots * 0.18);
                                this.tdx = spd * (this.tdx > 0 ? 1 : -1);
                            }
                        }, 1200);
                    }
                }
                if (this.msgT > 0) this.msgT--;
                document.getElementById('game-score-txt').textContent = `Skor: ${this.points}`;
                document.getElementById('game-info-txt').textContent = `❤️ ${this.missLeft} ıskalama hakkı | Basılı tut → Bırak!`;
            }
            draw() {
                const c = this.ctx, W = this.W, H = this.H;
                const bg = c.createLinearGradient(0, 0, 0, H);
                bg.addColorStop(0, '#87ceeb'); bg.addColorStop(.55, '#87ceeb');
                bg.addColorStop(.551, '#4a7c3f'); bg.addColorStop(1, '#3a6230');
                c.fillStyle = bg; c.fillRect(0, 0, W, H);
                const rings = [{ r: this.tr, col: '#fff' }, { r: this.tr * .8, col: '#000' },
                { r: this.tr * .6, col: '#4169e1' }, { r: this.tr * .4, col: '#e74c3c' }, { r: this.tr * .2, col: '#ffd700' }];
                rings.forEach(({ r, col }) => { c.fillStyle = col; c.beginPath(); c.arc(this.tx, this.ty, r, 0, Math.PI * 2); c.fill(); });
                c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 1.5; c.beginPath(); c.arc(this.tx, this.ty, this.tr, 0, Math.PI * 2); c.stroke();
                if (this.state === 'aim') {
                    const arr = this.tdx > 0 ? '→' : '←';
                    c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `${H * .04}px Arial`; c.textAlign = 'center';
                    c.fillText(arr, this.tx + (this.tdx > 0 ? this.tr + 14 : -(this.tr + 14)), this.ty + 5);
                }
                const cx = W / 2, cy = H * .82;
                c.strokeStyle = 'rgba(255,50,50,.9)'; c.lineWidth = 2;
                c.beginPath(); c.arc(cx, cy, 14, 0, Math.PI * 2); c.stroke();
                c.beginPath(); c.moveTo(cx - 22, cy); c.lineTo(cx + 22, cy); c.stroke();
                c.beginPath(); c.moveTo(cx, cy - 22); c.lineTo(cx, cy + 22); c.stroke();
                c.fillStyle = 'rgba(255,80,80,.7)'; c.beginPath(); c.arc(cx, cy, 3, 0, Math.PI * 2); c.fill();
                if (this.state === 'fly' || this.state === 'result') {
                    const ax = this.W / 2, ay = this.arrowFlyY;
                    c.strokeStyle = '#8b4513'; c.lineWidth = 3; c.lineCap = 'round';
                    c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax, ay + 20); c.stroke();
                    c.fillStyle = '#ccc'; c.beginPath();
                    c.moveTo(ax, ay - 14); c.lineTo(ax - 5, ay); c.lineTo(ax + 5, ay); c.closePath(); c.fill();
                }
                c.fillStyle = '#1a4f8a'; c.fillRect(W / 2 - 12, H * .85, 24, 38);
                c.fillStyle = '#a0522d'; c.beginPath(); c.arc(W / 2, H * .82, 13, 0, Math.PI * 2); c.fill();
                const pct = this.drawPct || 0;
                const bowCurve = 20 + pct * 18;
                const bowAng = 0.55 + pct * 0.35;
                c.strokeStyle = '#8b4513'; c.lineWidth = 2.5;
                c.beginPath(); c.arc(W / 2 - 16, H * .85, bowCurve, -bowAng, bowAng); c.stroke();
                const bowX1 = W / 2 - 16 + bowCurve * Math.cos(-bowAng), bowY1 = H * .85 + bowCurve * Math.sin(-bowAng);
                const bowX2 = W / 2 - 16 + bowCurve * Math.cos(bowAng), bowY2 = H * .85 + bowCurve * Math.sin(bowAng);
                if (pct > 0.05) {
                    const pull = pct * 14;
                    c.strokeStyle = '#ddd'; c.lineWidth = 1.5;
                    c.beginPath(); c.moveTo(bowX1, bowY1); c.lineTo(W / 2 + 6 + pull, H * .82); c.lineTo(bowX2, bowY2); c.stroke();
                    c.strokeStyle = '#8b4513'; c.lineWidth = 2;
                    c.beginPath(); c.moveTo(W / 2, H * .82 - 16 - pct * 18); c.lineTo(W / 2 + 6 + pull, H * .82 + 4); c.stroke();
                    c.fillStyle = '#ccc'; c.beginPath(); c.moveTo(W / 2, H * .82 - 28 - pct * 18); c.lineTo(W / 2 - 4, H * .82 - 16 - pct * 18); c.lineTo(W / 2 + 4, H * .82 - 16 - pct * 18); c.closePath(); c.fill();
                } else {
                    c.strokeStyle = '#ddd'; c.lineWidth = 1.5;
                    c.beginPath(); c.moveTo(bowX1, bowY1); c.lineTo(bowX2, bowY2); c.stroke();
                }
                if (this.holding || pct > 0) {
                    const bw = W * .5, bh = IS_MOB ? 20 : 14, bx2 = W * .25, by2 = H * .93;
                    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(bx2, by2, bw, bh);
                    const gc = c.createLinearGradient(bx2, 0, bx2 + bw, 0);
                    gc.addColorStop(0, '#2ecc71'); gc.addColorStop(0.6, '#f39c12'); gc.addColorStop(1, '#e74c3c');
                    c.fillStyle = gc; c.fillRect(bx2, by2, bw * pct, bh);
                    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.5; c.strokeRect(bx2, by2, bw, bh);
                    c.strokeStyle = '#00ff88'; c.lineWidth = 2;
                    c.beginPath(); c.moveTo(bx2 + bw, by2 - 3); c.lineTo(bx2 + bw, by2 + bh + 3); c.stroke();
                    c.fillStyle = 'white'; c.font = `${H * .034}px Inter,Arial`; c.textAlign = 'center';
                    const label = pct >= 1 ? '🔥 TAM GERİLDİ – BIRAK!' : 'Basılı tut…';
                    c.fillText(label, W / 2, by2 - 5);
                }
                if (this.msg && this.msgT > 0) {
                    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(W * .05, H * .58, W * .9, H * .12);
                    c.fillStyle = '#ffdd44'; c.font = `bold ${H * .068}px Cinzel,serif`; c.textAlign = 'center';
                    c.fillText(this.msg, W / 2, H * .66);
                }
                c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, W, H * .09);
                c.fillStyle = 'white'; c.font = `bold ${H * .052}px Inter,Arial`; c.textAlign = 'center';
                c.fillText(`🎯 ${this.points} puan`, W * .3, H * .065);
                let hearts = '';
                for (let i = 0; i < 5; i++) hearts += i < this.missLeft ? '❤️' : '🖤';
                c.font = `${H * .042}px Arial`; c.textAlign = 'center';
                c.fillText(hearts, W * .72, H * .063);
            }
        }

        /* ════════════════════════════════════════════════
           ══ BASKETBOL ════════════════════════════════
        ════════════════════════════════════════════════ */
        class Basketball {
            constructor(canvas, W, H, done) {
                this.canvas = canvas; this.ctx = canvas.getContext('2d');
                this.W = W; this.H = H; this.done = done;
                this.points = 0; this.attempts = 0; this.missLeft = 6;
                this.state = 'charge';
                this.power = 0; this.powerDir = 1; this.powerSpd = 1.8;
                this.bx = W * .18; this.by = H * .72;
                this.bvx = 0; this.bvy = 0; this.br = IS_MOB ? 14 : 18;
                this.hoopX = W * .78; this.hoopY = H * .28; this.hoopR = IS_MOB ? W * .06 : W * .055;
                this.msg = ''; this.msgT = 0; this.trail = []; this.frameN = 0;
                this._cl = e => this.onRelease();
                this._tc = e => { e.preventDefault(); e.stopPropagation(); this.tryShoot(); };
                this._km = e => { if (e.code === 'Space') this.tryShoot(); };
            }
            start() {
                this.canvas.addEventListener('click', this._cl);
                this.canvas.addEventListener('touchstart', this._tc, { passive: false });
                document.addEventListener('keydown', this._km);
                this.loop();
            }
            destroy() {
                this.canvas.removeEventListener('click', this._cl);
                this.canvas.removeEventListener('touchstart', this._tc);
                document.removeEventListener('keydown', this._km);
            }
            onRelease() { this.tryShoot(); }
            tryShoot() {
                if (this.state !== 'charge') return;
                const dx = this.hoopX - this.bx, dy = this.hoopY - this.by;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const baseSpd = dist * 0.022 * (0.6 + this.power / 100 * 0.65);
                const ang = Math.atan2(dy, dx);
                this.bvx = baseSpd * Math.cos(ang) * 0.7;
                this.bvy = baseSpd * Math.sin(ang) - baseSpd * 0.9;
                this.state = 'fly'; this.trail = [];
                playBeep(300, .08, .5);
            }
            loop() { gameRaf = requestAnimationFrame(() => this.loop()); this.frameN++; this.update(); this.draw(); }
            update() {
                const W = this.W, H = this.H;
                if (this.state === 'charge') {
                    const spd = Math.min(3.5, 1.8 + this.attempts * 0.08);
                    this.power += this.powerDir * spd;
                    if (this.power >= 100) { this.power = 100; this.powerDir = -1; }
                    if (this.power <= 0) { this.power = 0; this.powerDir = 1; }
                } else if (this.state === 'fly') {
                    this.bvy += 0.38;
                    this.bx += this.bvx; this.by += this.bvy;
                    this.trail.push({ x: this.bx, y: this.by });
                    if (this.trail.length > 18) this.trail.shift();
                    const dx = this.bx - this.hoopX, dy = this.by - this.hoopY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const scored = dist < this.hoopR + this.br * .6 && this.bvy > 0 && this.by > this.hoopY - 10;
                    const missed = this.bx > W * 1.05 || this.by > H + 40 || this.bx < -20;
                    if (scored || missed) {
                        this.attempts++;
                        if (scored) {
                            const pts = this.power > 40 && this.power < 70 ? 30 : 20;
                            this.points += pts;
                            this.msg = `🏀 BASKET! +${pts}`;
                            playBeep(880, .2, .5); setTimeout(() => playBeep(1100, .15, .4), 180);
                        } else {
                            this.missLeft--;
                            this.msg = '❌ Kaçtı!'; playBeep(200, .22, .4);
                        }
                        this.msgT = 80; this.state = 'result';
                        setTimeout(() => {
                            if (this.missLeft <= 0) {
                                cancelAnimationFrame(gameRaf); gameRaf = null;
                                document.getElementById('game-overlay').classList.remove('active'); gameRunning = false;
                                this.done(this.points);
                            } else {
                                this.bx = W * .18; this.by = H * .72; this.trail = [];
                                this.power = 0; this.powerDir = 1; this.state = 'charge';
                            }
                        }, 1300);
                    }
                } else if (this.state === 'result') { if (this.msgT > 0) this.msgT--; }
                document.getElementById('game-score-txt').textContent = `Skor: ${this.points}`;
                document.getElementById('game-info-txt').textContent = `❤️ ${this.missLeft} hak | Doğru anda tıkla!`;
            }
            draw() {
                const c = this.ctx, W = this.W, H = this.H;
                c.fillStyle = '#c47a20'; c.fillRect(0, 0, W, H * .85);
                c.fillStyle = '#5a3a10'; c.fillRect(0, H * .85, W, H * .15);
                c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1.5;
                for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(i * W / 7, 0); c.lineTo(i * W / 7, H * .85); c.stroke(); }
                c.beginPath(); c.arc(W / 2, H * .7, W * .18, 0, Math.PI * 2); c.stroke();
                c.fillStyle = 'rgba(255,255,255,.88)'; c.fillRect(this.hoopX - W * .1, this.hoopY - H * .18, W * .19, H * .22);
                c.strokeStyle = '#e74c3c'; c.lineWidth = 2; c.strokeRect(this.hoopX - W * .055, this.hoopY - H * .08, W * .11, H * .1);
                c.strokeStyle = '#ff6600'; c.lineWidth = IS_MOB ? 4 : 5;
                c.beginPath(); c.arc(this.hoopX, this.hoopY, this.hoopR, 0, Math.PI * 2); c.stroke();
                c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.2;
                for (let i = 0; i < 6; i++) {
                    const a1 = i / 6 * Math.PI;
                    c.beginPath(); c.moveTo(this.hoopX + this.hoopR * Math.cos(a1 + Math.PI / 6), this.hoopY + this.hoopR * Math.sin(a1 + Math.PI / 6));
                    c.lineTo(this.hoopX + this.hoopR * .6 * Math.cos(a1 + Math.PI / 6 + .5), this.hoopY + this.hoopR * .8 + this.hoopR * .3 * Math.sin(.5));
                    c.stroke();
                }
                c.fillStyle = '#888'; c.fillRect(this.hoopX + this.hoopR - 2, this.hoopY, 5, H * .7 - this.hoopY);
                this.trail.forEach((p, i) => {
                    const a = i / this.trail.length;
                    c.fillStyle = `rgba(231,76,60,${a * .4})`; c.beginPath(); c.arc(p.x, p.y, this.br * a * .6, 0, Math.PI * 2); c.fill();
                });
                c.fillStyle = '#e74c3c'; c.beginPath(); c.arc(this.bx, this.by, this.br, 0, Math.PI * 2); c.fill();
                c.strokeStyle = '#c0392b'; c.lineWidth = 1.5; c.stroke();
                c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1.2;
                c.beginPath(); c.arc(this.bx, this.by, this.br, 0, Math.PI); c.stroke();
                c.beginPath(); c.moveTo(this.bx - this.br, this.by); c.lineTo(this.bx + this.br, this.by); c.stroke();
                c.fillStyle = '#1a4f8a'; c.fillRect(this.W * .08, H * .58, 22, 38);
                c.fillStyle = '#a0522d'; c.beginPath(); c.arc(this.W * .09 + 11, H * .55, 13, 0, Math.PI * 2); c.fill();
                if (this.state === 'charge') {
                    const bw = W * .5, bh = IS_MOB ? 22 : 16, bx2 = W * .25, by2 = H * .9;
                    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(bx2, by2, bw, bh);
                    const pct = this.power / 100;
                    const gc = c.createLinearGradient(bx2, 0, bx2 + bw, 0);
                    gc.addColorStop(0, '#2ecc71'); gc.addColorStop(.5, '#f39c12'); gc.addColorStop(1, '#e74c3c');
                    c.fillStyle = gc; c.fillRect(bx2, by2, bw * pct, bh);
                    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1.5; c.strokeRect(bx2, by2, bw, bh);
                    c.strokeStyle = '#00ff88'; c.lineWidth = 2;
                    c.beginPath(); c.moveTo(bx2 + bw * .4, by2 - 2); c.lineTo(bx2 + bw * .4, by2 + bh + 2); c.stroke();
                    c.beginPath(); c.moveTo(bx2 + bw * .7, by2 - 2); c.lineTo(bx2 + bw * .7, by2 + bh + 2); c.stroke();
                    c.fillStyle = '#00ff88'; c.font = `${H * .032}px Inter,Arial`; c.textAlign = 'center';
                    c.fillText('İdeal', bx2 + bw * .55, by2 - 5);
                    c.fillStyle = 'rgba(255,255,255,.7)'; c.font = `${H * .038}px Inter,Arial`;
                    c.fillText('Tıkla / Boşluk → At!', W / 2, by2 + bh + H * .04);
                }
                if (this.msg && this.msgT > 0) {
                    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(W * .1, H * .42, W * .8, H * .13);
                    c.fillStyle = '#ffdd44'; c.font = `bold ${H * .08}px Cinzel,serif`; c.textAlign = 'center';
                    c.fillText(this.msg, W / 2, H * .51);
                }
                c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, W, H * .08);
                c.fillStyle = 'white'; c.font = `bold ${H * .048}px Inter,Arial`; c.textAlign = 'center';
                c.fillText(`🏀 ${this.points} puan`, W * .3, H * .058);
                let hearts = '';
                for (let i = 0; i < 6; i++) hearts += i < this.missLeft ? '❤️' : '🖤';
                c.font = `${H * .038}px Arial`; c.textAlign = 'center';
                c.fillText(hearts, W * .72, H * .055);
            }
        }

        /* ════════════════ YARDIMCI FONKSİYONLAR ═══════ */
        function inBldg(x, z, m) { for (const b of buildingAABBs) if (x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m) return true; return false; }
        function w2s(wx, wy, wz) { const v = new THREE.Vector3(wx, wy, wz).project(camera); if (v.z > 1) return null; return { x: (v.x * .5 + .5) * innerWidth, y: (-v.y * .5 + .5) * innerHeight }; }
        function bx(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
        function cl(rt, rb, h, seg, color, x, y, z) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), new THREE.MeshLambertMaterial({ color })); m.position.set(x, y, z); m.castShadow = !IS_MOB; return m; }
        function dk(hex, f) { return (Math.floor(((hex >> 16) & 0xff) * f) << 16) | (Math.floor(((hex >> 8) & 0xff) * f) << 8) | Math.floor((hex & 0xff) * f); }
        function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
        function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

        /* ════════════════ BOOTSTRAP ════════════════════ */
        document.getElementById('start-btn').addEventListener('click', () => {
            document.getElementById('welcome').style.display = 'none';
            try {
                initGame();
                initAudio();
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
                console.error('Oyun başlatma hatası:', err);
                document.getElementById('welcome').style.display = 'flex';
                alert('Oyun başlatılırken hata oluştu: ' + err.message);
            }
        });