'use strict';

import * as THREE from 'three';
import {
    IS_QUEST, IS_MOB, CFG, DIALOGUES, BUILDINGS, SPOTS, NPC_COLORS,
    VR_WALK_SPEED, VR_TURN_SPEED, VR_DEADZONE, SNAP_ANGLE
} from './config.js';
import { applyPlatformDom } from './platform.js';
import {
    initAudio, playBowDraw, playArrowShoot, playMurmur, playBeep, setChessAudioVrBoost,
    getAmbientVolumePercent,
    setAmbientVolumePercent,
    setAmbientMusicMuted,
    isAmbientMusicMuted,
    getSfxVolumePercent,
    setSfxVolumePercent,
    setSfxMuted,
    isSfxMuted
} from './audio.js';
import { createMiniGameInstance } from './minigames/registry.js';
import { ChessGame } from './minigames/chess-game.js';
import { OnlineChess3D } from './minigames/online-chess-3d.js';
import { OnlineDama3D } from './minigames/online-dama-3d.js';
import { VrChessStandalone } from './minigames/vr-chess-standalone.js';
import { G } from './runtime.js';
import { addUniversityMainGate, updateUniversityGateAnimations } from './university-gate.js';
import {
    getLeaderboard,
    saveScore,
    getRank,
    getChessLeaderboardRank,
    getChessLeaderboardRankByUser,
    getDamaLeaderboardRank,
    getDamaLeaderboardRankByUser,
    getMyLeaderboardBadges,
    saveCrownChoice,
    clearCrownChoice
} from './api.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { createMultiplayerClient } from './multiplayer.js';
import { sanitizePlainText } from './security.js';
import { mesaIdForQueueJoin, mesaIdForQueueState } from './online/mesa.js';
import {
    showCampusBootOverlay,
    hideCampusBootOverlay,
    setCampusBootStatus
} from './campus/bootOverlay.js';
import { initCampusContent } from './campus/initCampusContent.js';
import { updateFollowCamera } from './campus/camera.js';
import { createSpawnStore } from './campus/spawnStore.js';
        applyPlatformDom();
        initCampusContent();

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
        /** @type {{ game: string, place: number } | null} */
        let localDisplayCrown = null;
        let mpClient = null;
        let remotePlayers = new Map();
        let onlineUsers = [];
        let onlineUsersPanel = null;
        const chessQueueStateByMesa = new Map(); // mesaId -> {waitingPlayer,totalWaiting,selfQueued,activeMatch}
        const damaQueueStateByMesa = new Map(); // mesaId -> {waitingPlayer,totalWaiting,selfQueued,activeMatch}
        const onlineChess = {
            queued: false,
            waitingPlayer: null,
            totalWaiting: 0,
            matchId: null,
            myColor: null,
            white: null,
            black: null,
            active: false,
            /** Çıkış onaylandı; sonuç paketi bekleniyor (UI takılmasın). */
            exiting: false,
            /** Sunucudaki aktif maç (kuyruk bildirimi); izleyici “İzle” için */
            activeMatch: null,
            /** Oyuncu değilim; chess:watch ile odaya katıldım */
            watching: false,
            lastState: null,
            /**
             * Masaüstü: maç bitince “İstek Oluştur” spot paneli gösterme;
             * oyuncu satranç etkileşim mesafesinden çıkıp tekrar girince sıfırlanır.
             */
            suppressChessSpotOfferUntilLeaveZone: false
        };
        const onlineDama = {
            queued: false,
            waitingPlayer: null,
            totalWaiting: 0,
            matchId: null,
            myColor: null,
            white: null,
            black: null,
            active: false,
            /** Çıkış onaylandı; sonuç paketi bekleniyor (UI takılmasın). */
            exiting: false,
            activeMatch: null,
            watching: false,
            lastState: null,
            suppressDamaSpotOfferUntilLeaveZone: false
        };
        let chessQueueLastRequestAt = 0;
        let damaQueueLastRequestAt = 0;
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
        /** Son çizilen TAMAM düğme bölgesi (UV tıklaması için) */
        let vrChessResultHitOk = { x: 290, y: 200, w: 320, h: 112 };
        let vrChessResultDomBtnWired = false;
        /** Satranç sonuç: liderlik metni (çok satır, canvas’ta ayrı sarılır) */
        let vrChessResultLeaderboardBlock = '';
        /** DOM/VR sonuç TAMAM: satranç mı dama mı sıfırlanacak */
        let lastVrBoardGameOverlayKind = 'ch';
        /** VR: rakip şah çekti — Tamam ile kapanan panel */
        let vrChessCheckWindow = null;
        let vrChessCheckCanvas = null;
        let vrChessCheckCtx = null;
        let vrChessCheckTexture = null;
        let vrChessCheckOpen = false;
        let vrChessCheckText = '';
        let vrChessCheckHitOk = { x: 0, y: 0, w: 0, h: 0 };
        let vrChessCheckPointerLeft = null;
        let vrChessCheckPointerRight = null;
        let lastVrChessCheckNoticeKey = '';
        const VR_CHESS_CHECK_PANEL_DIST = 1.34;
        const VR_CHESS_CHECK_HUD_SCALE = IS_QUEST ? 0.54 : 0.50;
        /** VR satranç sonuç paneli: kompakt boyut */
        const VR_CHESS_RESULT_PANEL_DIST = 1.36;
        const VR_CHESS_RESULT_HUD_SCALE = IS_QUEST ? 0.44 : 0.42;
        let chessNotifyEl = null;
        let chessNotifyTimer = null;
        let chessResultEl = null;
        let chessResultOpen = false;
        let escMenuOpen = false;
        let escMenuBackdrop = null;
        let escMenuCard = null;
        let escMenuTab = 'leaderboard';
        const escTabs = ['leaderboard', 'online', 'live', 'map', 'character', 'settings'];
        /** VR karakter sekmesinde taç seçici (0 = gösterme, 1..n = eligible sırası) */
        let lastCrownEligibleForVr = [];
        let vrCrownPickerIndex = 0;

        function isEscCharacterTabOpen() {
            return escMenuOpen && escMenuTab === 'character';
        }
        const lbGames = [
            { id: 'masa_tenisi', label: '🏓' },
            { id: 'flappy_bird', label: '🐦' },
            { id: 'penalti', label: '⚽' },
            { id: 'okculuk', label: '🏹' },
            { id: 'basket', label: '🏀' },
            { id: 'satranc', label: '♟️' },
            { id: 'dama', label: '⛀' }
        ];

        function isLbEloGame(id) {
            return id === 'satranc' || id === 'dama';
        }

        function chessOpponentFromLastState(st, meUid, meNameLower) {
            if (!st?.white?.username || !st?.black?.username) return null;
            const wId = Number(st.white.userId);
            const bId = Number(st.black.userId);
            const me = Number(meUid);
            if (Number.isFinite(me) && me === wId) return String(st.black.username).trim();
            if (Number.isFinite(me) && me === bId) return String(st.white.username).trim();
            if (meNameLower) {
                const wl = String(st.white.username).toLowerCase();
                const bl = String(st.black.username).toLowerCase();
                if (wl === meNameLower) return String(st.black.username).trim();
                if (bl === meNameLower) return String(st.white.username).trim();
            }
            return null;
        }

        function lbGameEmoji(gameId) {
            const g = lbGames.find((x) => x.id === gameId);
            return g ? g.label : '🎮';
        }

        function escAttr(s) {
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;');
        }

        /** İlk 3: yalnız taç (ikon yok); 4+ sıra numarası. Haritada isim etiketinde ikonlar ayrı. */
        function lbRankMedalHtml(place1Based) {
            const p = Number(place1Based) || 0;
            if (p < 1 || p > 3) {
                return `<span class="lb-rank-num">${p}</span>`;
            }
            const medal = p === 1 ? 'gold' : p === 2 ? 'silver' : 'bronze';
            return `<span class="lb-rank-medal" data-lb-vr-medal="${medal}"><span class="lb-crown lb-crown--${medal}" role="img" aria-label="${p}. sıra"></span></span>`;
        }

        function lbCrownTierFromRank(rank) {
            const r = Number(rank);
            if (!Number.isFinite(r) || r < 1) return null;
            if (r === 1) return 'gold';
            if (r === 2) return 'silver';
            if (r === 3) return 'bronze';
            return null;
        }

        const LB_CROWN_TR = { gold: 'Altın', silver: 'Gümüş', bronze: 'Bronz' };

        /** Satranç/dama maç sonu: kısa Elo + duruma göre taç / sıra (web, mobil, VR). */
        function buildChessLeaderboardBlock(meta, outcome) {
            if (!meta || typeof meta !== 'object') return '';
            const w = meta.winsAfter ?? 0;
            const l = meta.lossesAfter ?? 0;
            const d = meta.drawsAfter ?? 0;
            const g = meta.gamesAfter ?? 0;
            const eb = Math.round(Number(meta.eloBefore) || 1500);
            const ea = Math.round(Number(meta.eloAfter) || 1500);
            const rb = Number(meta.rankBefore);
            const ra = Number(meta.rankAfter) || 1;
            const tp = Number(meta.totalPlayersAfter) || 0;
            const tierB = lbCrownTierFromRank(rb);
            const tierA = lbCrownTierFromRank(ra);
            const top10 = meta.top10Move;
            const rankStr = tp > 0 ? `${ra}/${tp}` : String(ra);

            const lines = [
                `Elo ${eb}→${ea} · G${w} M${l}${d ? ` B${d}` : ''} · ${g} oyun`,
                outcome === 'win' ? 'Galibiyet.' : outcome === 'draw' ? 'Beraberlik.' : 'Mağlubiyet.'
            ];

            let third = '';
            if (outcome === 'win' || outcome === 'draw') {
                if (tierA) {
                    if (tierB === tierA) {
                        third = `${LB_CROWN_TR[tierA]} taç korunuyor.`;
                    } else if (tierB) {
                        third = `Taç: ${LB_CROWN_TR[tierB]} → ${LB_CROWN_TR[tierA]}.`;
                    } else {
                        third = `${LB_CROWN_TR[tierA]} taç (${ra}.).`;
                    }
                } else if (tierB) {
                    third = 'Taç kalktı (ilk 3 dışı).';
                } else if (ra <= 10) {
                    third =
                        top10 === 'entered'
                            ? `İlk 10’a girdin (${rankStr}).`
                            : `İlk 10: sıra ${rankStr}.`;
                } else if (ra <= 20) {
                    if (Number.isFinite(rb) && rb > 20) third = `İlk 20: ${rankStr}.`;
                    else if (ra <= 14) third = `İlk 10’a yakınsın (${rankStr}).`;
                    else third = `Sıra ${rankStr}.`;
                } else {
                    third = `Sıra ${rankStr}.`;
                }
            } else {
                if (tierA) {
                    if (tierB === tierA) third = `${LB_CROWN_TR[tierA]} taç duruyor.`;
                    else if (tierB) third = `Taç: ${LB_CROWN_TR[tierB]} → ${LB_CROWN_TR[tierA]}.`;
                    else third = `${LB_CROWN_TR[tierA]} taç (${rankStr}).`;
                } else if (tierB) {
                    third = 'Taç kaybı (ilk 3 dışı).';
                } else if (ra <= 10) {
                    third = `Sıra ${rankStr} (ilk 10).`;
                } else if (ra <= 20) {
                    third = `Sıra ${rankStr} (ilk 20).`;
                } else {
                    third = `Sıra ${rankStr}.`;
                }
            }

            lines.push(third);
            return lines.join('\n');
        }

        let escMapCanvas = null;
        let escMapCtx = null;
        let escMapSize = 420;
        let lastVrEscMapDraw = 0;
        let escMapBuildingList = null;
        let escLiveWrap = null;
        let escLiveCanvas = null;
        let escLiveCtx = null;
        let escLiveList = null;
        let escLiveStatus = null;
        let escLiveLeaveBtn = null;
        /** @type {{ kind: 'ch'|'da', matchId: number } | null} */
        let escLiveWatch = null;
        let escLiveChessPayload = null;
        let escLiveDamaPayload = null;
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
        let vrCharMannequin = null;
        /** VR: Karakter sekmesinde eski eğri UI penceresi (ana ESC paneli yerine) */
        let vrCharWindow = null;
        let vrCharCanvas = null;
        let vrCharCtx = null;
        let vrCharTexture = null;
        let vrCharPointerLeft = null;
        let vrCharPointerRight = null;
        /** Web/mobil: ESC karakter sekmesi 3D önizleme */
        let charPreviewRenderer = null;
        let charPreviewScene = null;
        let charPreviewCamera = null;
        let charPreviewMannequin = null;
        let charPreviewRaf = null;
        let charPreviewResizeObs = null;
        const charPreviewClock = new THREE.Clock();

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
        /** Çevrimiçi PvP VR — kampüs sahnesi (OnlineChess3D, runtime world) */
        let onlineChess3d = null;
        /** Çoklu masa: world satranç tahtaları (mesaId -> OnlineChess3D) */
        const onlineChess3dByMesa = new Map();
        /** Çevrimiçi PvP web/masaüstü — overlay 3D tahta (viewport); dünya tahtası ile aynı FEN */
        let onlineChess3dViewport = null;
        let onlineDama3d = null;
        /** Çoklu masa: world dama tahtaları (mesaId -> OnlineDama3D) */
        const onlineDama3dByMesa = new Map();
        let onlineDama3dViewport = null;
        /** Son başlatılan VR satranç çevrimiçi maç mıydı? (yerel bitiş paneli yanlış tetiklenmesin) */
        let lastVrChessWasOnlinePvp = false;
        let lastVrDamaWasOnlinePvp = false;

        /** Satranç UI / maç yaşam döngüsü (kampüs + VR spot + sonuç paneli) */
        const ChessUIPhase = {
            IDLE: 'idle',
            QUEUED: 'queued',
            PLAYING: 'playing',
            RESULT: 'result',
            CLEANUP: 'cleanup'
        };
        let chessUiPhase = ChessUIPhase.IDLE;
        /** Aynı matchId için match:ended + terminal state:update idempotency */
        let processedChessMatchEndId = null;
        const DamaUIPhase = {
            IDLE: 'idle',
            QUEUED: 'queued',
            PLAYING: 'playing',
            RESULT: 'result',
            CLEANUP: 'cleanup'
        };
        let damaUiPhase = DamaUIPhase.IDLE;
        let processedDamaMatchEndId = null;
        let hasVrSessionSpawned = false;
        /** Otur: daha alçak rig; ayakta: daha yukarı (kulaklık + gövde). */
        const VR_RIG_OFFSET_SITTING = 0.5;
        const VR_RIG_OFFSET_STANDING = 0.77;
        const VR_HEIGHT_STORAGE_KEY = 'vr-harran-height-posture';
        let vrHeightPostureSit = true;

        function loadVrHeightPosturePreference() {
            try {
                const v = localStorage.getItem(VR_HEIGHT_STORAGE_KEY);
                if (v === 'stand') vrHeightPostureSit = false;
                else if (v === 'sit') vrHeightPostureSit = true;
            } catch (_) { /* ignore */ }
        }

        function saveVrHeightPosturePreference() {
            try {
                localStorage.setItem(VR_HEIGHT_STORAGE_KEY, vrHeightPostureSit ? 'sit' : 'stand');
            } catch (_) { /* ignore */ }
        }

        function getVrRigEyeOffset() {
            return vrHeightPostureSit ? VR_RIG_OFFSET_SITTING : VR_RIG_OFFSET_STANDING;
        }

        function applyVrRigHeightFromPosture() {
            if (!xrActive || !xrRig || !player) return;
            xrRig.position.y = player.position.y + getVrRigEyeOffset();
        }

        function syncEscVrPostureUi() {
            const btn = document.getElementById('esc-vr-posture-toggle');
            if (btn) {
                btn.textContent = 'Oturuyorum / Ayaktayım';
                btn.title = vrHeightPostureSit
                    ? 'Şu an oturuyorsun — dokun: ayakta göz hizası'
                    : 'Şu an ayaktasın — dokun: oturur göz hizası';
            }
        }

        function syncVrCrownPickerFromEquipped(eq) {
            vrCrownPickerIndex = 0;
            if (!eq || !lastCrownEligibleForVr.length) return;
            const i = lastCrownEligibleForVr.findIndex(
                (b) => b.game === eq.game && Number(b.place) === Number(eq.place)
            );
            if (i >= 0) vrCrownPickerIndex = i + 1;
        }

        function updateCharacterCrownSaveState() {
            const sel = document.getElementById('char-crown-select');
            const btn = document.getElementById('char-crown-save');
            if (!btn || !sel) return;
            if (!localSessionToken) {
                btn.disabled = true;
                return;
            }
            const ec = Number(sel.dataset.eligibleCount || '0');
            if (ec === 0) {
                btn.disabled = true;
                return;
            }
            const hadEquipped = sel.dataset.hadEquipped === '1';
            const v = sel.value;
            btn.disabled = v === '' && !hadEquipped;
        }

        function getCharacterPanelPreviewCrownOpt() {
            const sel = document.getElementById('char-crown-select');
            if (!sel) {
                return localDisplayCrown?.game &&
                    localDisplayCrown.place >= 1 &&
                    localDisplayCrown.place <= 3
                    ? localDisplayCrown
                    : null;
            }
            if (sel.value) {
                const parts = sel.value.split(':');
                const g = parts[0];
                const p = Number(parts[1]);
                if (g && Number.isFinite(p) && p >= 1 && p <= 3) {
                    return { game: String(g), place: p };
                }
            }
            if (!sel.disabled) {
                return null;
            }
            return localDisplayCrown?.game &&
                localDisplayCrown.place >= 1 &&
                localDisplayCrown.place <= 3
                ? localDisplayCrown
                : null;
        }

        function syncPreviewMannequinCrownTags() {
            const nick = String(localNickname || 'Sen').slice(0, 24);
            const crown = getCharacterPanelPreviewCrownOpt();
            const attach = (mannequin) => {
                if (!mannequin) return;
                const old = mannequin.userData.previewNameTag;
                if (old) {
                    mannequin.remove(old);
                    if (old.material?.map) old.material.map.dispose();
                    if (old.material) old.material.dispose();
                    mannequin.userData.previewNameTag = null;
                }
                if (!crown) return;
                const tag = createNameTag(nick, crown);
                tag.position.set(0, NAME_TAG_ANCHOR_Y, 0);
                mannequin.add(tag);
                mannequin.userData.previewNameTag = tag;
            };
            attach(charPreviewMannequin);
            attach(vrCharMannequin);
        }

        async function refreshCharacterCrownSelect() {
            const sel = document.getElementById('char-crown-select');
            const hint = document.getElementById('char-crown-hint');
            if (!sel) return;
            try {
            delete sel.dataset.eligibleCount;
            delete sel.dataset.hadEquipped;
            lastCrownEligibleForVr = [];
            vrCrownPickerIndex = 0;
            if (!localSessionToken) {
                if (hint) {
                    hint.textContent =
                        'Taç için giriş yapmalısın. Herhangi bir oyunda ilk 3’teysen aşağıda listelenir; birden fazla hakkın varsa birini seçip kaydet.';
                }
                sel.disabled = true;
                while (sel.firstChild) sel.removeChild(sel.firstChild);
                const o = document.createElement('option');
                o.value = '';
                o.textContent = '—';
                sel.appendChild(o);
                updateCharacterCrownSaveState();
                if (xrActive) updateVrMenuWindow();
                return;
            }
            const labels = {
                satranc: '♟️ Satranç',
                dama: '⛀ Dama',
                masa_tenisi: '🏓 Masa tenisi',
                flappy_bird: '🐦 Flappy Bird',
                penalti: '⚽ Penaltı',
                okculuk: '🏹 Okçuluk',
                basket: '🏀 Basketbol'
            };
            try {
                const data = await getMyLeaderboardBadges(localSessionToken, localNickname);
                const eligible = data.eligible || [];
                lastCrownEligibleForVr = eligible;
                while (sel.firstChild) sel.removeChild(sel.firstChild);
                sel.dataset.eligibleCount = String(eligible.length);
                const eq = data.equipped;
                sel.dataset.hadEquipped = eq ? '1' : '0';
                syncVrCrownPickerFromEquipped(eq);

                if (eligible.length === 0) {
                    if (hint) {
                        hint.textContent = 'Şu anda mevcut tacınız bulunmamaktadır.';
                    }
                    sel.disabled = true;
                    const o = document.createElement('option');
                    o.value = '';
                    o.textContent = 'Taç hakkı yok';
                    sel.appendChild(o);
                    sel.value = '';
                    updateCharacterCrownSaveState();
                    if (xrActive) updateVrMenuWindow();
                    return;
                }

                if (hint) {
                    hint.textContent =
                        'İlk üçte olduğun oyunlar aşağıda. Haritada hangi taçı göstereceğini seçip kaydet; tek oyunun varsa yine kaydedebilirsin.';
                }
                sel.disabled = false;
                const o0 = document.createElement('option');
                o0.value = '';
                o0.textContent = '— Taç gösterme —';
                sel.appendChild(o0);
                eligible.forEach((b) => {
                    const o = document.createElement('option');
                    o.value = `${b.game}:${b.place}`;
                    o.textContent = `${labels[b.game] || b.game} · ${b.place}. sıra`;
                    sel.appendChild(o);
                });
                if (eq) sel.value = `${eq.game}:${eq.place}`;
                else sel.value = '';
            } catch (_e) {
                if (hint) hint.textContent = 'Rozetler yüklenemedi; bağlantıyı kontrol et.';
                sel.disabled = true;
                while (sel.firstChild) sel.removeChild(sel.firstChild);
                const o = document.createElement('option');
                o.value = '';
                o.textContent = '—';
                sel.appendChild(o);
            }
            updateCharacterCrownSaveState();
            if (xrActive) updateVrMenuWindow();
            if (xrActive && escMenuTab === 'character') updateVrCharWindow();
            } finally {
                syncPreviewMannequinCrownTags();
            }
        }

        function syncCharacterFaceBodyLabels() {
            const face = FACE_PRESETS[appearancePending.faceIdx] || FACE_PRESETS[0];
            const body = BODY_COLORS[appearancePending.bodyIdx] || BODY_COLORS[0];
            const fl = document.getElementById('char-face-label');
            if (fl) fl.textContent = face?.label || '—';
            const bl = document.getElementById('char-body-label');
            if (bl) bl.textContent = body?.label || '—';
            document.querySelectorAll('.char-body-swatch').forEach((btn, i) => {
                btn.classList.toggle('active', i === appearancePending.bodyIdx);
            });
            const applyBtn = document.getElementById('char-appearance-apply');
            if (applyBtn) {
                const dirty =
                    appearancePending.faceIdx !== appearanceApplied.faceIdx ||
                    appearancePending.bodyIdx !== appearanceApplied.bodyIdx;
                applyBtn.disabled = !dirty;
            }
        }

        function syncCharacterPanelUi() {
            appearancePending.faceIdx = appearanceApplied.faceIdx;
            appearancePending.bodyIdx = appearanceApplied.bodyIdx;
            syncCharacterFaceBodyLabels();
            void refreshCharacterCrownSelect();
        }

        const MUTE_ICON_ON_SVG =
            '<svg class="esc-audio-mute-icon esc-audio-mute-icon--on" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
        const MUTE_ICON_OFF_SVG =
            '<svg class="esc-audio-mute-icon esc-audio-mute-icon--off" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';

        const VR_AUDIO_MUTE_W = 52;
        const VR_AUDIO_BTN_W = 58;
        const VR_AUDIO_GAP = 8;
        const VR_AUDIO_BAR_W = 420;
        const VR_AUDIO_ROW0_Y = 334;
        const VR_AUDIO_ROW1_Y = 428;
        const VR_AUDIO_MUTE_X0 = 34;

        function syncEscSettingsUi() {
            const vol = document.getElementById('esc-ambient-volume');
            const volVal = document.getElementById('esc-ambient-vol-value');
            const p = getAmbientVolumePercent();
            if (vol && String(vol.value) !== String(p)) vol.value = String(p);
            if (volVal) volVal.textContent = `${p}%`;
            const musicMute = document.getElementById('esc-music-mute-btn');
            if (musicMute) {
                const muted = isAmbientMusicMuted();
                musicMute.setAttribute('data-muted', muted ? '1' : '0');
                musicMute.setAttribute('aria-pressed', muted ? 'true' : 'false');
                musicMute.title = muted ? 'Sesi aç' : 'Müziği tamamen kapat';
            }
            const sfxVol = document.getElementById('esc-sfx-volume');
            const sfxVal = document.getElementById('esc-sfx-vol-value');
            const sp = getSfxVolumePercent();
            if (sfxVol && String(sfxVol.value) !== String(sp)) sfxVol.value = String(sp);
            if (sfxVal) sfxVal.textContent = `${sp}%`;
            const sfxMute = document.getElementById('esc-sfx-mute-btn');
            if (sfxMute) {
                const sm = isSfxMuted();
                sfxMute.setAttribute('data-muted', sm ? '1' : '0');
                sfxMute.setAttribute('aria-pressed', sm ? 'true' : 'false');
                sfxMute.title = sm ? 'SFX aç' : 'SFX tamamen kapat';
            }
            syncEscVrPostureUi();
        }

        function syncCrownDomFromVrPicker() {
            const sel = document.getElementById('char-crown-select');
            if (!sel || sel.disabled) return;
            if (vrCrownPickerIndex === 0) sel.value = '';
            else {
                const b = lastCrownEligibleForVr[vrCrownPickerIndex - 1];
                if (b) sel.value = `${b.game}:${b.place}`;
            }
            updateCharacterCrownSaveState();
            syncPreviewMannequinCrownTags();
        }

        function vrStepCrownPicker(dir) {
            const n = lastCrownEligibleForVr.length;
            if (!localSessionToken || n === 0) return;
            const mod = n + 1;
            vrCrownPickerIndex = (vrCrownPickerIndex + dir + mod * 8) % mod;
            syncCrownDomFromVrPicker();
            updateVrMenuWindow();
            if (xrActive && escMenuTab === 'character') updateVrCharWindow();
        }

        async function saveCharacterCrownFromUi() {
            const sel = document.getElementById('char-crown-select');
            if (!sel || !localSessionToken || sel.disabled) return;
            const v = sel.value;
            try {
                if (!v) {
                    await clearCrownChoice(localSessionToken);
                    mpClient?.sendCrownChoice?.({
                        sessionToken: localSessionToken,
                        clear: true,
                        nickname: localNickname
                    });
                } else {
                    const parts = v.split(':');
                    const g = parts[0];
                    const p = Number(parts[1]);
                    await saveCrownChoice(localSessionToken, g, p, localNickname);
                    mpClient?.sendCrownChoice?.({
                        sessionToken: localSessionToken,
                        game: g,
                        place: p,
                        nickname: localNickname
                    });
                }
                await refreshCharacterCrownSelect();
            } catch (err) {
                alert(sanitizePlainText(err?.message || 'Kaydedilemedi', 200));
            }
        }

        function setVrHeightPosture(sit) {
            vrHeightPostureSit = !!sit;
            saveVrHeightPosturePreference();
            applyVrRigHeightFromPosture();
            syncEscVrPostureUi();
            updateVrMenuWindow();
        }

        loadVrHeightPosturePreference();

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
           1. detectAndSetupVR(): immersive-vr + Quest (IS_QUEST) ise setupVR().
              Masaüstü WebXR’da VR düğmesi gösterilmez.
           2. setupVR(): xrRig, kontroller, ekran ortasında "VR'a gir".
           3. Aksi halde VR kurulmaz.
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
                    if (!IS_QUEST) {
                        console.log('Masaüstü/telefon WebXR: immersive-vr var ama VR düğmesi yalnızca Quest’te');
                        return;
                    }
                    console.log('Quest VR hazırlanıyor');
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
            // Ray çizgisini tekrar ekle (clear sonrası silindi) — uzunluk metre cinsinden (~oda ölçeği)
            const vrPointerLineLen = 16;
            [xrCtrl0, xrCtrl1].forEach(ctrl => {
                const lineGeo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, -0.01, -0.03),
                    new THREE.Vector3(0, 0, -vrPointerLineLen)
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
                const vrcBoard = getVrChessBoard();
                if (isVrChessPlayActive() && vrcBoard?.onSelectStart?.(ctrl)) return;
                const vrdBoard = getVrDamaBoard();
                if (isVrDamaPlayActive() && vrdBoard?.onSelectStart?.(ctrl)) return;
                if (!activeSpot) return;
                // Satranç: sadece tetik + A/X (updateVRMovement) ile başlar; yanlışlıkla tetikleme olmasın
                if (activeSpot.game === 'ch' || activeSpot.game === 'da') return;
                document.getElementById('interact-prompt').style.display = 'none';
                startGame(activeSpot.game, activeSpot.id, activeSpot.title);
            };
            xrCtrl0.addEventListener('selectstart', onXrSelectStart);
            xrCtrl1.addEventListener('selectstart', onXrSelectStart);
            const onXrSelectEnd = () => {
                if (isVrChessPlayActive()) getVrChessBoard()?.onSelectEnd?.();
                if (isVrDamaPlayActive()) getVrDamaBoard()?.onSelectEnd?.();
            };
            xrCtrl0.addEventListener('selectend', onXrSelectEnd);
            xrCtrl1.addEventListener('selectend', onXrSelectEnd);

            /* ── 6) VR oturum olayları ───────────────── */
            renderer.xr.addEventListener('sessionstart', () => {
                xrActive = true;
                stopCharacterPreviewLoop();
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

                // Tekrar VR: masaüstünde yürüdüysen player güncel, rig eski kalabilir — player öncelikli.
                // Yürümediysen çıkışta ikisi aynı olmalı; rig yaw bazen daha tutarlı.
                if (hasVrSessionSpawned && player && xrRig) {
                    const dx = player.position.x - xrRig.position.x;
                    const dz = player.position.z - xrRig.position.z;
                    if (dx * dx + dz * dz > 0.04) {
                        targetX = player.position.x;
                        targetZ = player.position.z;
                        targetYaw = playerYaw;
                    } else {
                        targetX = xrRig.position.x;
                        targetZ = xrRig.position.z;
                        targetYaw = xrRig.rotation.y;
                        playerYaw = targetYaw;
                    }
                }

                // Varsayılan spawn (0,108) dışına çıktı mı — sadece ilk VR'da kapı spawn'ı için.
                const hasMovedFromDefaultSpawn =
                    Math.abs(targetX - 0) > 0.5 || Math.abs(targetZ - 108) > 0.5;

                if (!hasMovedFromDefaultSpawn && !hasVrSessionSpawned && universityGateRoot?.position) {
                    targetX = universityGateRoot.position.x;
                    // Kapının güneyinde biraz daha geriden başlat (kapıyı net görsün)
                    targetZ = universityGateRoot.position.z + 22;
                    // Güneyden kapıya dönük başlasın (ilk bakışta kapı karşıda)
                    targetYaw = Math.PI;
                }
                hasVrSessionSpawned = true;

                xrRig.position.set(targetX, getVrRigEyeOffset(), targetZ);
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
                setEscMenuOpen(false);
                vrMenuAngle = 0;
                vrMenuTargetAngle = 0;
                vrMenuHeight = 1.5;
                vrMenuTargetHeight = 1.5;
                updateVrMenuTransform(1 / 60);
                if (vrMenuWindow) vrMenuWindow.visible = escMenuOpen;
                if (vrSpotWindow) vrSpotWindow.visible = false;

                renderer.setAnimationLoop(loop);
                console.log('VR oturumu başladı – 1. şahıs modu');
            });

            renderer.xr.addEventListener('sessionend', () => {
                setEscMenuOpen(false);
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
                if (vrCharMannequin) vrCharMannequin.visible = false;
                if (vrCharWindow && xrRig) {
                    xrRig.remove(vrCharWindow);
                    vrCharWindow.geometry?.dispose?.();
                    if (vrCharWindow.material) {
                        vrCharWindow.material.map?.dispose?.();
                        vrCharWindow.material.dispose?.();
                    }
                    vrCharWindow = null;
                    vrCharCanvas = null;
                    vrCharCtx = null;
                    vrCharTexture = null;
                }
                if (vrChessStandalone || onlineChess3d || onlineChess3dViewport) clearVrChess();
                if (onlineDama3d || onlineDama3dViewport) clearVrDama();
                closeVrChessResult();
                // Çevrimiçi maç sürerken VR'dan çıkınca tahta kalkar ama maç sunucuda devam eder;
                // G.gameRunning false olmazsa spot menüsü / tekrar giriş takılı kalıyordu.
                if (currentGameType === 'ch') {
                    if (currentGame) {
                        currentGame.destroy();
                        currentGame = null;
                    }
                    G.gameRunning = false;
                    if (!onlineChess.active && !onlineChess.watching) {
                        endGame(-1);
                    }
                }
                if (currentGameType === 'da') {
                    if (currentGame) {
                        currentGame.destroy();
                        currentGame = null;
                    }
                    G.gameRunning = false;
                    if (!onlineDama.active && !onlineDama.watching) {
                        endGame(-1);
                    }
                }

                startNonVRLoop();
                console.log('VR oturumu sona erdi – 3. şahıs moduna dönüldü');
            });

            /* ── 7) VR giriş butonu (Three.VRButton değil: metin sürekli "ENTER VR"e dönüyordu) ── */
            const existingBtn = document.getElementById('VRButton');
            if (existingBtn) existingBtn.remove();
            document.querySelectorAll('button.webxr-button').forEach((el) => {
                if (el.id !== 'VRButton') el.remove();
            });

            const vrBtn = document.createElement('button');
            vrBtn.type = 'button';
            vrBtn.id = 'VRButton';
            vrBtn.className = 'webxr-button vr-entry-btn';
            vrBtn.setAttribute('aria-label', "VR'a gir");
            vrBtn.textContent = "VR'a gir";
            vrBtn.style.cssText = [
                'position:fixed',
                'left:50%',
                'top:auto',
                'right:auto',
                'bottom:18%',
                'transform:translateX(-50%)',
                'z-index:240',
                'min-width:120px',
                'padding:14px 22px',
                'border:1px solid rgba(255,255,255,.35)',
                'border-radius:10px',
                'background:rgba(0,0,0,.45)',
                'color:#fff',
                'font:normal 14px sans-serif',
                'text-align:center',
                'cursor:pointer',
                'outline:none',
                'opacity:0.94',
                'display:block',
                'box-shadow:0 8px 28px rgba(0,0,0,.35)'
            ].join(';');
            vrBtn.onmouseenter = () => { vrBtn.style.opacity = '1'; };
            vrBtn.onmouseleave = () => { vrBtn.style.opacity = '0.92'; };

            let vrEntrySession = null;
            vrBtn.addEventListener('click', async () => {
                if (!navigator.xr) return;
                try {
                    if (vrEntrySession == null) {
                        const sessionInit = {
                            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
                        };
                        const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
                        vrEntrySession = session;
                        session.addEventListener('end', () => {
                            vrEntrySession = null;
                            vrBtn.textContent = "VR'a gir";
                            vrBtn.setAttribute('aria-label', "VR'a gir");
                        });
                        vrBtn.textContent = "VR'dan çık";
                        vrBtn.setAttribute('aria-label', "VR'dan çık");
                        await renderer.xr.setSession(session);
                    } else {
                        vrEntrySession.end();
                    }
                } catch (err) {
                    console.warn('VR oturumu:', err);
                }
            });

            document.body.classList.add('vr-entry-available');
            document.body.appendChild(vrBtn);

            console.log('VR hazır – VR giriş düğmesi eklendi');
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
            if (xrActive && escMenuTab === 'character') {
                c.clearRect(0, 0, W, H);
                vrMenuTexture.needsUpdate = true;
                return;
            }
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

            const vrTabX0 = 34;
            const vrTabW = 198;
            const vrTabGap = 10;
            const vrTabY = 92;
            const vrTabH = 46;
            const tabLabels = ['🏆 LB', '🟢 Online', '🗺️ Harita', '👤 Karakter', '⚙️ Ayarlar'];
            tabLabels.forEach((label, idx) => {
                const x = vrTabX0 + idx * (vrTabW + vrTabGap);
                const y = vrTabY;
                const w = vrTabW;
                const h = vrTabH;
                const active = escMenuTab === escTabs[idx];
                c.fillStyle = active ? 'rgba(232,200,112,.30)' : 'rgba(255,255,255,.08)';
                c.fillRect(x, y, w, h);
                c.strokeStyle = active ? 'rgba(232,200,112,.9)' : 'rgba(255,255,255,.16)';
                c.lineWidth = 2;
                c.strokeRect(x, y, w, h);
                c.fillStyle = active ? '#ffe7a7' : '#d9ecff';
                c.font = 'bold 17px Arial';
                c.fillText(label, x + 10, y + 30);
            });

            c.fillStyle = 'rgba(255,120,120,.18)';
            c.fillRect(W - 138, 24, 104, 44);
            c.strokeStyle = 'rgba(255,160,160,.45)';
            c.lineWidth = 2;
            c.strokeRect(W - 138, 24, 104, 44);
            c.fillStyle = '#ffd2d2';
            c.font = 'bold 26px Arial';
            c.fillText('Kapat', W - 124, 54);

            const subTabLabel = escMenuTab === 'map'
                ? 'Harita'
                : escMenuTab === 'online'
                    ? 'Çevrimiçi'
                    : escMenuTab === 'character'
                        ? 'Karakter'
                        : escMenuTab === 'settings'
                            ? 'Ayarlar'
                            : 'Liderlik';
            c.fillStyle = '#b9d7ff';
            c.font = '23px Arial';
            c.fillText(`Sekme: ${subTabLabel}`, 34, 176);
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
                    const name = row.querySelector('.lb-name')?.textContent || '-';
                    const meta = row.querySelector('.lb-chess-meta');
                    const rawScore = meta
                        ? meta.textContent
                        : row.querySelector('.lb-score')?.textContent || '0';
                    const score = rawScore.length > 95 ? `${rawScore.slice(0, 92)}…` : rawScore;
                    const place = row.dataset.lbVrPlace || `${i + 1}`;
                    const medal = row.dataset.lbVrMedal || '';
                    c.fillStyle = 'rgba(255,255,255,.06)';
                    c.fillRect(34, 304 + i * 35, 1130, 30);
                    c.fillStyle = '#dceeff';
                    c.textBaseline = 'middle';
                    const rowMidY = 304 + i * 35 + 15;
                    if (medal) {
                        const pMedal =
                            Number(row.dataset.lbVrPlace) ||
                            (medal === 'gold' ? 1 : medal === 'silver' ? 2 : medal === 'bronze' ? 3 : 0);
                        const crownCv = getVrLbCrownCanvas(pMedal);
                        if (crownCv) {
                            const ch = 34;
                            const cw = (100 / 80) * ch;
                            c.drawImage(crownCv, 46 - cw / 2, rowMidY - ch / 2, cw, ch);
                        } else {
                            c.font = meta ? '16px Arial' : '19px Arial';
                            c.fillText(String(place), 46, rowMidY);
                        }
                    } else {
                        c.font = meta ? '16px Arial' : '19px Arial';
                        c.fillText(String(place), 46, rowMidY);
                    }
                    c.font = meta ? '16px Arial' : '19px Arial';
                    c.fillText(name, 122, rowMidY);
                    c.font = meta ? '15px Arial' : '19px Arial';
                    c.fillStyle = meta ? 'rgba(200,220,255,.88)' : '#dceeff';
                    c.fillText(score, meta ? 520 : 1115, rowMidY);
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
            } else if (escMenuTab === 'map') {
                if (escMapCtx) {
                    const now = performance.now();
                    if (!xrActive || (now - lastVrEscMapDraw > 280)) {
                        lastVrEscMapDraw = now;
                        drawCampusMapCanvas(escMapCtx, escMapSize);
                    }
                }
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
            } else if (escMenuTab === 'character') {
                const vrCrownLabels = {
                    satranc: '♟️ Satranç',
                    dama: '⛀ Dama',
                    masa_tenisi: '🏓 Masa tenisi',
                    flappy_bird: '🐦 Flappy Bird',
                    penalti: '⚽ Penaltı',
                    okculuk: '🏹 Okçuluk',
                    basket: '🏀 Basketbol'
                };
                c.fillStyle = '#d9ecff';
                c.font = 'bold 24px Arial';
                c.fillText('Yüz ifadesi', 34, 228);
                const face = FACE_PRESETS[appearancePending.faceIdx] || FACE_PRESETS[0];
                c.font = '20px Arial';
                c.fillStyle = '#bcd6ff';
                c.fillText(face?.label || '-', 34, 256);
                const fPrevX = 34;
                const fPrevY = 272;
                const fPrevW = 170;
                const fBtnH = 56;
                const fNextX = fPrevX + fPrevW + 14;
                const fNextW = 170;
                c.fillStyle = 'rgba(255,255,255,.08)';
                c.fillRect(fPrevX, fPrevY, fPrevW, fBtnH);
                c.fillRect(fNextX, fPrevY, fNextW, fBtnH);
                c.strokeStyle = 'rgba(255,255,255,.18)';
                c.lineWidth = 2;
                c.strokeRect(fPrevX, fPrevY, fPrevW, fBtnH);
                c.strokeRect(fNextX, fPrevY, fNextW, fBtnH);
                c.fillStyle = '#e7f0ff';
                c.font = 'bold 22px Arial';
                c.fillText('◀ Önceki', fPrevX + 22, fPrevY + 36);
                c.fillText('Sonraki ▶', fNextX + 22, fPrevY + 36);

                c.fillStyle = '#d9ecff';
                c.font = 'bold 24px Arial';
                c.fillText('Gövde rengi', 34, 358);
                const body = BODY_COLORS[appearancePending.bodyIdx] || BODY_COLORS[0];
                c.font = '20px Arial';
                c.fillStyle = '#bcd6ff';
                c.fillText(`Seçili: ${body?.label || '-'}`, 34, 386);
                const swY = 400;
                const swW = 108;
                const swH = 48;
                const swGap = 12;
                BODY_COLORS.slice(0, 6).forEach((col, i) => {
                    const x = 34 + (i % 3) * (swW + swGap);
                    const y = swY + Math.floor(i / 3) * (swH + 12);
                    c.fillStyle = `#${col.hex.toString(16).padStart(6, '0')}`;
                    c.fillRect(x, y, swW, swH);
                    const active = i === appearancePending.bodyIdx;
                    c.lineWidth = active ? 4 : 2;
                    c.strokeStyle = active ? 'rgba(232,200,112,.95)' : 'rgba(255,255,255,.22)';
                    c.strokeRect(x, y, swW, swH);
                });

                c.fillStyle = '#d9ecff';
                c.font = 'bold 22px Arial';
                c.fillText('Liderlik taçı', 620, 228);
                c.font = '17px Arial';
                c.fillStyle = '#9ed3ff';
                let crownLine = '—';
                if (!localSessionToken) {
                    crownLine = 'Taç için giriş gerekli.';
                } else if (!lastCrownEligibleForVr.length) {
                    crownLine = 'Taç hakkı yok.';
                } else {
                    const n = Math.max(0, Math.min(vrCrownPickerIndex, lastCrownEligibleForVr.length));
                    crownLine =
                        n === 0
                            ? '— Taç gösterme —'
                            : `${vrCrownLabels[lastCrownEligibleForVr[n - 1].game] || lastCrownEligibleForVr[n - 1].game} · ${lastCrownEligibleForVr[n - 1].place}. sıra`;
                }
                const wrapCrown = crownLine.length > 52 ? `${crownLine.slice(0, 50)}…` : crownLine;
                c.fillText(wrapCrown, 620, 258);
                const crY = 282;
                const crW = 132;
                const crH = 40;
                const crCanPick = !!(localSessionToken && lastCrownEligibleForVr.length);
                const drawCrBtn = (bx, label, dim) => {
                    c.fillStyle = dim ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.1)';
                    c.fillRect(bx, crY, crW, crH);
                    c.strokeStyle = dim ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.22)';
                    c.lineWidth = 2;
                    c.strokeRect(bx, crY, crW, crH);
                    c.fillStyle = dim ? 'rgba(220,230,255,.45)' : '#dceeff';
                    c.font = 'bold 16px Arial';
                    c.fillText(label, bx + 18, crY + 26);
                };
                drawCrBtn(620, '◀ Taç', !crCanPick);
                drawCrBtn(620 + crW + 10, 'Taç ▶', !crCanPick);
                const sel = document.getElementById('char-crown-select');
                const ec = Number(sel?.dataset?.eligibleCount || '0');
                const hadEq = sel?.dataset?.hadEquipped === '1';
                const curPickVal =
                    vrCrownPickerIndex === 0
                        ? ''
                        : lastCrownEligibleForVr[vrCrownPickerIndex - 1]
                            ? `${lastCrownEligibleForVr[vrCrownPickerIndex - 1].game}:${lastCrownEligibleForVr[vrCrownPickerIndex - 1].place}`
                            : '';
                const saveDisabled =
                    !localSessionToken || ec === 0 || (curPickVal === '' && !hadEq);
                const svX = 620;
                const svY = 334;
                const svW = 200;
                const svH = 42;
                c.fillStyle = saveDisabled ? 'rgba(255,255,255,.06)' : 'rgba(232,200,112,.22)';
                c.fillRect(svX, svY, svW, svH);
                c.strokeStyle = saveDisabled ? 'rgba(255,255,255,.12)' : 'rgba(232,200,112,.75)';
                c.lineWidth = 2;
                c.strokeRect(svX, svY, svW, svH);
                c.fillStyle = saveDisabled ? 'rgba(200,210,230,.5)' : '#ffe7a7';
                c.font = 'bold 18px Arial';
                c.fillText('Tacı kaydet', svX + 36, svY + 28);

                const applyW = 220;
                const applyH = 64;
                const applyX = W - applyW - 34;
                const applyY = H - applyH - 108;
                const dirty =
                    appearancePending.faceIdx !== appearanceApplied.faceIdx ||
                    appearancePending.bodyIdx !== appearanceApplied.bodyIdx;
                c.fillStyle = dirty ? 'rgba(64, 168, 98, 0.34)' : 'rgba(255,255,255,0.08)';
                c.fillRect(applyX, applyY, applyW, applyH);
                c.strokeStyle = dirty ? 'rgba(126, 255, 164, 0.92)' : 'rgba(255,255,255,0.18)';
                c.lineWidth = 3;
                c.strokeRect(applyX, applyY, applyW, applyH);
                c.fillStyle = dirty ? '#eaffef' : '#dceeff';
                c.font = 'bold 28px Arial';
                c.fillText('UYGULA', applyX + 48, applyY + 42);
            } else if (escMenuTab === 'settings') {
                const ambPct = getAmbientVolumePercent();
                const sfxPct = getSfxVolumePercent();
                const musicMuted = isAmbientMusicMuted();
                const sfxMuted = isSfxMuted();
                const barH = 42;
                const minusX = VR_AUDIO_MUTE_X0 + VR_AUDIO_MUTE_W + VR_AUDIO_GAP;
                const barX = minusX + VR_AUDIO_BTN_W + VR_AUDIO_GAP;
                const plusX = barX + VR_AUDIO_BAR_W + VR_AUDIO_GAP;
                const drawAudioRow = (rowY, pct, muteOn) => {
                    c.fillStyle = muteOn ? 'rgba(180,90,90,.35)' : 'rgba(255,255,255,.1)';
                    c.fillRect(VR_AUDIO_MUTE_X0, rowY, VR_AUDIO_MUTE_W, barH);
                    c.strokeStyle = muteOn ? 'rgba(255,160,160,.55)' : 'rgba(255,255,255,.22)';
                    c.lineWidth = 2;
                    c.strokeRect(VR_AUDIO_MUTE_X0, rowY, VR_AUDIO_MUTE_W, barH);
                    c.font = '22px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
                    c.fillStyle = '#eef6ff';
                    c.textAlign = 'center';
                    c.textBaseline = 'middle';
                    c.fillText(muteOn ? '🔇' : '🔊', VR_AUDIO_MUTE_X0 + VR_AUDIO_MUTE_W / 2, rowY + barH / 2);
                    c.textAlign = 'left';
                    c.textBaseline = 'alphabetic';
                    c.fillStyle = 'rgba(255,255,255,.1)';
                    c.fillRect(minusX, rowY, VR_AUDIO_BTN_W, barH);
                    c.strokeStyle = 'rgba(255,255,255,.22)';
                    c.strokeRect(minusX, rowY, VR_AUDIO_BTN_W, barH);
                    c.fillStyle = '#eef6ff';
                    c.font = 'bold 28px Arial';
                    c.fillText('−', minusX + 20, rowY + 30);
                    c.fillStyle = 'rgba(255,255,255,.08)';
                    c.fillRect(barX, rowY, VR_AUDIO_BAR_W, barH);
                    const fillW = (VR_AUDIO_BAR_W * pct) / 100;
                    c.fillStyle = 'rgba(232,200,112,.5)';
                    c.fillRect(barX, rowY, fillW, barH);
                    c.strokeStyle = 'rgba(255,255,255,.28)';
                    c.strokeRect(barX, rowY, VR_AUDIO_BAR_W, barH);
                    c.fillStyle = 'rgba(255,255,255,.1)';
                    c.fillRect(plusX, rowY, VR_AUDIO_BTN_W, barH);
                    c.strokeStyle = 'rgba(255,255,255,.22)';
                    c.strokeRect(plusX, rowY, VR_AUDIO_BTN_W, barH);
                    c.fillStyle = '#eef6ff';
                    c.font = 'bold 26px Arial';
                    c.fillText('+', plusX + 20, rowY + 30);
                };
                c.fillStyle = '#e8c870';
                c.font = 'bold 26px Arial';
                c.fillText('Ses', 34, 258);
                c.fillStyle = '#b9d7ff';
                c.font = '20px Arial';
                c.fillText('Müzik sesi', 34, 286);
                c.font = '22px Arial';
                c.fillText(`Seviye: ${ambPct}%`, 34, 312);
                drawAudioRow(VR_AUDIO_ROW0_Y, ambPct, musicMuted);
                c.fillStyle = '#b9d7ff';
                c.font = '20px Arial';
                c.fillText('SFX sesleri (taş vb.)', 34, 404);
                c.font = '22px Arial';
                c.fillText(`Seviye: ${sfxPct}%`, 34, 430);
                drawAudioRow(VR_AUDIO_ROW1_Y, sfxPct, sfxMuted);
                if (IS_QUEST) {
                    c.fillStyle = '#e8c870';
                    c.font = 'bold 26px Arial';
                    c.fillText('VR gorus', 34, 502);
                    c.fillStyle = '#9ed3ff';
                    c.font = '18px Arial';
                    c.fillText('Oturma / ayakta rig yuksekligi — tek tikla degistir', 34, 534);
                    const pW = 400;
                    const pH = 40;
                    const yb = 546;
                    const bx = 34;
                    c.fillStyle = 'rgba(255,255,255,.1)';
                    c.fillRect(bx, yb, pW, pH);
                    c.strokeStyle = 'rgba(232,200,112,.55)';
                    c.lineWidth = 2;
                    c.strokeRect(bx, yb, pW, pH);
                    c.fillStyle = '#eef6ff';
                    c.font = 'bold 17px Arial';
                    const postureLabel = 'Oturuyorum / Ayaktayım';
                    const tw = c.measureText(postureLabel).width;
                    c.fillText(postureLabel, bx + (pW - tw) / 2, yb + 26);
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
            c.fillText('Sol Y: menusu | Sol grip: ziplama | Sol/Sag X-A: tikla', 34, H - 92);
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

        function updateVrCharacterMannequinTransform(dt) {
            if (!vrCharMannequin || !xrRig || !isEscCharacterTabOpen()) return;
            const k = Math.min(1, Math.max(0.03, dt * 12));
            const tx = 1.08;
            const ty = 0.78;
            const tz = -1.72;
            vrCharMannequin.position.x += (tx - vrCharMannequin.position.x) * k;
            vrCharMannequin.position.y += (ty - vrCharMannequin.position.y) * k;
            vrCharMannequin.position.z += (tz - vrCharMannequin.position.z) * k;
            vrCharMannequin.rotation.x = 0;
            vrCharMannequin.rotation.z = 0;
            if (renderer?.xr && camera) {
                const xrCam = renderer.xr.getCamera(camera);
                if (xrCam) {
                    const dx = xrCam.position.x - vrCharMannequin.position.x;
                    const dz = xrCam.position.z - vrCharMannequin.position.z;
                    const yawToCam = Math.atan2(dx, dz);
                    vrCharMannequin.rotation.y = yawToCam + Math.PI - 0.35;
                }
            }
            const pt = vrCharMannequin.userData?.previewNameTag;
            if (pt && renderer?.xr && camera) {
                const xrCam = renderer.xr.getCamera(camera);
                if (xrCam) pt.quaternion.copy(xrCam.quaternion);
            }
        }

        const _vrPointerRayRot = new THREE.Matrix4();
        /** WebXR: lazer kontrolcünün yerel -Z ekseni (vr-chess-standalone _hitFromController ile aynı). */
        function vrControllerRayWorld(ctrl, originOut, dirOut) {
            originOut.setFromMatrixPosition(ctrl.matrixWorld);
            _vrPointerRayRot.identity().extractRotation(ctrl.matrixWorld);
            dirOut.set(0, 0, -1).applyMatrix4(_vrPointerRayRot).normalize();
        }

        function applyPendingAppearanceToMannequin() {
            const body = BODY_COLORS[appearancePending.bodyIdx] || BODY_COLORS[0];
            const face = FACE_PRESETS[appearancePending.faceIdx] || FACE_PRESETS[0];
            if (vrCharMannequin) {
                setHumanBodyColor(vrCharMannequin, body.hex);
                setHumanFace(vrCharMannequin, face.id);
            }
            if (charPreviewMannequin) {
                setHumanBodyColor(charPreviewMannequin, body.hex);
                setHumanFace(charPreviewMannequin, face.id);
            }
            syncPreviewMannequinCrownTags();
        }

        function syncVrEscWindowsVisibility() {
            if (!xrActive) return;
            const esc = escMenuOpen;
            const ch = esc && escMenuTab === 'character';
            if (vrMenuWindow) vrMenuWindow.visible = esc && !ch;
            if (vrCharWindow) vrCharWindow.visible = ch;
            if (vrCharMannequin) vrCharMannequin.visible = ch;
        }

        function initVrCharWindow() {
            if (vrCharWindow || !xrRig) return;
            vrCharCanvas = document.createElement('canvas');
            vrCharCanvas.width = 900;
            vrCharCanvas.height = 600;
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

        function updateVrCharWindow() {
            if (!vrCharCtx || !vrCharTexture || !vrCharCanvas) return;
            const c = vrCharCtx;
            const W = vrCharCanvas.width;
            const H = vrCharCanvas.height;
            c.clearRect(0, 0, W, H);
            c.fillStyle = 'rgba(6, 14, 24, 0.92)';
            c.fillRect(0, 0, W, H);

            c.fillStyle = 'rgba(120,200,255,.12)';
            c.fillRect(34, 18, 148, 42);
            c.strokeStyle = 'rgba(160,210,255,.35)';
            c.lineWidth = 2;
            c.strokeRect(34, 18, 148, 42);
            c.fillStyle = '#cfe8ff';
            c.font = 'bold 20px Arial';
            c.fillText('← Ana menü', 52, 46);

            c.fillStyle = 'rgba(255,120,120,.18)';
            c.fillRect(W - 150, 18, 116, 42);
            c.strokeStyle = 'rgba(255,160,160,.45)';
            c.strokeRect(W - 150, 18, 116, 42);
            c.fillStyle = '#ffd2d2';
            c.font = 'bold 22px Arial';
            c.fillText('Kapat', W - 128, 46);

            c.fillStyle = '#f7d977';
            c.font = 'bold 34px Arial';
            c.fillText('Karakter', 36, 92);

            c.fillStyle = '#d9ecff';
            c.font = 'bold 22px Arial';
            c.fillText('Yüz ifadesi', 36, 128);
            const face = FACE_PRESETS[appearancePending.faceIdx] || FACE_PRESETS[0];
            c.font = '19px Arial';
            c.fillStyle = '#bcd6ff';
            c.fillText(face?.label || '-', 36, 154);

            const btnH = 62;
            const prevX = 36;
            const prevY = 168;
            const prevW = 190;
            const nextX = prevX + prevW + 16;
            const nextW = 190;
            c.fillStyle = 'rgba(255,255,255,.08)';
            c.fillRect(prevX, prevY, prevW, btnH);
            c.fillRect(nextX, prevY, nextW, btnH);
            c.strokeStyle = 'rgba(255,255,255,.18)';
            c.lineWidth = 2;
            c.strokeRect(prevX, prevY, prevW, btnH);
            c.strokeRect(nextX, prevY, nextW, btnH);
            c.fillStyle = '#e7f0ff';
            c.font = 'bold 26px Arial';
            c.fillText('◀ Önceki', prevX + 28, prevY + 42);
            c.fillText('Sonraki ▶', nextX + 28, prevY + 42);

            c.fillStyle = '#d9ecff';
            c.font = 'bold 22px Arial';
            c.fillText('Gövde rengi', 36, 268);
            const body = BODY_COLORS[appearancePending.bodyIdx] || BODY_COLORS[0];
            c.font = '19px Arial';
            c.fillStyle = '#bcd6ff';
            c.fillText(`Seçili: ${body?.label || '-'}`, 36, 294);

            const swY = 308;
            const swW = 122;
            const swH = 46;
            const gap = 12;
            BODY_COLORS.slice(0, 6).forEach((col, i) => {
                const x = 36 + (i % 3) * (swW + gap);
                const y = swY + Math.floor(i / 3) * (swH + gap);
                c.fillStyle = `#${col.hex.toString(16).padStart(6, '0')}`;
                c.fillRect(x, y, swW, swH);
                const active = i === appearancePending.bodyIdx;
                c.lineWidth = active ? 4 : 2;
                c.strokeStyle = active ? 'rgba(232,200,112,.95)' : 'rgba(255,255,255,.22)';
                c.strokeRect(x, y, swW, swH);
            });

            const vrCrownLabels = {
                satranc: '♟️ Satranç',
                dama: '⛀',
                masa_tenisi: '🏓 MT',
                flappy_bird: '🐦 FB',
                penalti: '⚽',
                okculuk: '🏹',
                basket: '🏀'
            };
            c.fillStyle = '#d9ecff';
            c.font = 'bold 20px Arial';
            c.fillText('Liderlik taçı', 36, 418);
            c.font = '16px Arial';
            c.fillStyle = '#9ed3ff';
            let crownLine = '—';
            if (!localSessionToken) crownLine = 'Taç için giriş gerekli.';
            else if (!lastCrownEligibleForVr.length) crownLine = 'Taç hakkı yok.';
            else {
                const n = Math.max(0, Math.min(vrCrownPickerIndex, lastCrownEligibleForVr.length));
                crownLine =
                    n === 0
                        ? '— Taç gösterme —'
                        : `${vrCrownLabels[lastCrownEligibleForVr[n - 1].game] || lastCrownEligibleForVr[n - 1].game} · ${lastCrownEligibleForVr[n - 1].place}. sıra`;
            }
            c.fillText(crownLine.length > 48 ? `${crownLine.slice(0, 46)}…` : crownLine, 36, 442);

            const crY = 454;
            const crW = 128;
            const crH = 36;
            const crCan = !!(localSessionToken && lastCrownEligibleForVr.length);
            const drawCrBtn = (bx, label, dim) => {
                c.fillStyle = dim ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.1)';
                c.fillRect(bx, crY, crW, crH);
                c.strokeStyle = dim ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.22)';
                c.lineWidth = 2;
                c.strokeRect(bx, crY, crW, crH);
                c.fillStyle = dim ? 'rgba(220,230,255,.45)' : '#dceeff';
                c.font = 'bold 15px Arial';
                c.fillText(label, bx + 22, crY + 24);
            };
            drawCrBtn(36, '◀ Taç', !crCan);
            drawCrBtn(36 + crW + 10, 'Taç ▶', !crCan);

            const sel = document.getElementById('char-crown-select');
            const ec = Number(sel?.dataset?.eligibleCount || '0');
            const hadEq = sel?.dataset?.hadEquipped === '1';
            const curPickVal =
                vrCrownPickerIndex === 0
                    ? ''
                    : lastCrownEligibleForVr[vrCrownPickerIndex - 1]
                        ? `${lastCrownEligibleForVr[vrCrownPickerIndex - 1].game}:${lastCrownEligibleForVr[vrCrownPickerIndex - 1].place}`
                        : '';
            const saveDis = !localSessionToken || ec === 0 || (curPickVal === '' && !hadEq);
            const svX = 330;
            const svY = 454;
            const svW = 188;
            const svH = 36;
            c.fillStyle = saveDis ? 'rgba(255,255,255,.06)' : 'rgba(232,200,112,.22)';
            c.fillRect(svX, svY, svW, svH);
            c.strokeStyle = saveDis ? 'rgba(255,255,255,.12)' : 'rgba(232,200,112,.75)';
            c.lineWidth = 2;
            c.strokeRect(svX, svY, svW, svH);
            c.fillStyle = saveDis ? 'rgba(200,210,230,.5)' : '#ffe7a7';
            c.font = 'bold 16px Arial';
            c.fillText('Tacı kaydet', svX + 36, svY + 24);

            const applyW = 210;
            const applyH = 72;
            const applyX = W - applyW - 36;
            const applyY = H - applyH - 28;
            const dirty =
                appearancePending.faceIdx !== appearanceApplied.faceIdx ||
                appearancePending.bodyIdx !== appearanceApplied.bodyIdx;
            c.fillStyle = dirty ? 'rgba(64, 168, 98, 0.34)' : 'rgba(255,255,255,0.08)';
            c.fillRect(applyX, applyY, applyW, applyH);
            c.strokeStyle = dirty ? 'rgba(126, 255, 164, 0.92)' : 'rgba(255,255,255,0.18)';
            c.lineWidth = 3;
            c.strokeRect(applyX, applyY, applyW, applyH);
            c.fillStyle = dirty ? '#eaffef' : '#dceeff';
            c.font = 'bold 30px Arial';
            c.fillText('UYGULA', applyX + 44, applyY + 48);

            c.fillStyle = '#7a9aba';
            c.font = '16px Arial';
            c.fillText('Menü (Y): kapat · Sekmeler: trigger ile', 36, H - 22);

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

        function getVrCharHit(src, session) {
            if (!escMenuOpen || escMenuTab !== 'character' || !vrCharWindow?.visible || !vrCharCanvas) return null;
            const ctrl = getVrControllerForSource(session, src);
            if (!ctrl) return null;
            const origin = new THREE.Vector3();
            const dir = new THREE.Vector3();
            vrControllerRayWorld(ctrl, origin, dir);
            const hit = new THREE.Raycaster(origin, dir).intersectObject(vrCharWindow, false)[0];
            if (!hit?.uv) return null;
            return {
                x: hit.uv.x * vrCharCanvas.width,
                y: (1 - hit.uv.y) * vrCharCanvas.height
            };
        }

        function clickVrCharAt(hit) {
            if (!hit || !vrCharCanvas) return false;
            const W = vrCharCanvas.width;
            const H = vrCharCanvas.height;
            const x = hit.x;
            const y = hit.y;

            if (x >= 34 && x <= 182 && y >= 18 && y <= 60) {
                setEscTab('leaderboard');
                vrInputCooldownUntil = performance.now() + 220;
                return true;
            }
            if (x >= W - 150 && x <= W - 34 && y >= 18 && y <= 60) {
                setEscMenuOpen(false);
                vrInputCooldownUntil = performance.now() + 220;
                return true;
            }

            const prevX = 36;
            const prevY = 168;
            const prevW = 190;
            const btnH = 62;
            const nextX = prevX + prevW + 16;
            const nextW = 190;
            if (y >= prevY && y <= prevY + btnH) {
                if (x >= prevX && x <= prevX + prevW) {
                    appearancePending.faceIdx =
                        (appearancePending.faceIdx - 1 + FACE_PRESETS.length) % FACE_PRESETS.length;
                    applyPendingAppearanceToMannequin();
                    syncCharacterFaceBodyLabels();
                    updateVrCharWindow();
                    return true;
                }
                if (x >= nextX && x <= nextX + nextW) {
                    appearancePending.faceIdx = (appearancePending.faceIdx + 1) % FACE_PRESETS.length;
                    applyPendingAppearanceToMannequin();
                    syncCharacterFaceBodyLabels();
                    updateVrCharWindow();
                    return true;
                }
            }

            const swY = 308;
            const swW = 122;
            const swH = 46;
            const gap = 12;
            for (let i = 0; i < Math.min(6, BODY_COLORS.length); i++) {
                const bx = 36 + (i % 3) * (swW + gap);
                const by = swY + Math.floor(i / 3) * (swH + gap);
                if (x >= bx && x <= bx + swW && y >= by && y <= by + swH) {
                    appearancePending.bodyIdx = i;
                    applyPendingAppearanceToMannequin();
                    syncCharacterFaceBodyLabels();
                    updateVrCharWindow();
                    return true;
                }
            }

            const crY = 454;
            const crW = 128;
            const crH = 36;
            if (y >= crY && y <= crY + crH && localSessionToken && lastCrownEligibleForVr.length) {
                const crA = 36;
                const crB = crA + crW + 10;
                if (x >= crA && x <= crA + crW) {
                    vrStepCrownPicker(-1);
                    updateVrCharWindow();
                    return true;
                }
                if (x >= crB && x <= crB + crW) {
                    vrStepCrownPicker(1);
                    updateVrCharWindow();
                    return true;
                }
            }

            const svX = 330;
            const svY = 454;
            const svW = 188;
            const svH = 36;
            const sel = document.getElementById('char-crown-select');
            const ec = Number(sel?.dataset?.eligibleCount || '0');
            const hadEq = sel?.dataset?.hadEquipped === '1';
            const curPickVal =
                vrCrownPickerIndex === 0
                    ? ''
                    : lastCrownEligibleForVr[vrCrownPickerIndex - 1]
                        ? `${lastCrownEligibleForVr[vrCrownPickerIndex - 1].game}:${lastCrownEligibleForVr[vrCrownPickerIndex - 1].place}`
                        : '';
            const saveDis = !localSessionToken || ec === 0 || (curPickVal === '' && !hadEq);
            if (!saveDis && x >= svX && x <= svX + svW && y >= svY && y <= svY + svH) {
                void saveCharacterCrownFromUi();
                updateVrCharWindow();
                return true;
            }

            const applyW = 210;
            const applyH = 72;
            const applyX = W - applyW - 36;
            const applyY = H - applyH - 28;
            if (x >= applyX && x <= applyX + applyW && y >= applyY && y <= applyY + applyH) {
                commitPendingAppearance();
                updateVrCharWindow();
                return true;
            }
            return false;
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
            syncCharacterFaceBodyLabels();
            updateVrMenuWindow();
            if (xrActive && escMenuTab === 'character') updateVrCharWindow();
            vrInputCooldownUntil = performance.now() + 220;
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
            const layout = getVrSpotPlayAreaLayout();
            const { playX, playY, playW, playH } = layout;
            c.fillStyle = 'rgba(64, 168, 98, 0.35)';
            c.fillRect(playX, playY, playW, playH);
            c.strokeStyle = 'rgba(126, 255, 164, 0.92)';
            c.lineWidth = 3;
            c.strokeRect(playX, playY, playW, playH);
            c.fillStyle = '#eaffef';
            c.font = 'bold 52px Arial';
            c.fillText(vrBtn.label, W / 2 - Math.min(230, vrBtn.label.length * 11), playY + Math.min(76, Math.floor(playH * 0.58)));
            c.font = '22px Arial';
            c.fillStyle = '#c6f5d8';
            c.fillText(vrBtn.sub, 56, playY + Math.min(116, Math.floor(playH * 0.88)));
            if (layout.hasClose && layout.closeY != null && layout.closeH != null) {
                const cy = layout.closeY;
                const ch = layout.closeH;
                c.fillStyle = 'rgba(120, 48, 48, 0.4)';
                c.fillRect(playX, cy, playW, ch);
                c.strokeStyle = 'rgba(255, 160, 160, 0.85)';
                c.strokeRect(playX, cy, playW, ch);
                c.fillStyle = '#ffd0d0';
                c.font = 'bold 40px Arial';
                c.fillText('KAPAT', W / 2 - 72, cy + Math.floor(ch * 0.62));
            }

            c.fillStyle = '#9ed3ff';
            c.font = '22px Arial';
            c.fillText('ESC menusu gibi: sol X / sag A / trigger ile tikla', 36, H - 58);
            c.fillText('Satranç: tetik + lazer — önce taş karesi, sonra hedef kare', 36, H - 26);

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
            vrControllerRayWorld(ctrl, origin, dir);
            const hit = new THREE.Raycaster(origin, dir).intersectObject(vrMenuWindow, false)[0];
            if (!hit?.uv) return null;
            return {
                x: hit.uv.x * vrMenuCanvas.width,
                y: (1 - hit.uv.y) * vrMenuCanvas.height
            };
        }

        function getVrSpotHit(src, session) {
            if (escMenuOpen || !vrSpotWindow?.visible || !vrSpotCanvas || !activeSpot || shouldLockChessSpotControls()) return null;
            const ctrl = getVrControllerForSource(session, src);
            if (!ctrl) return null;
            const origin = new THREE.Vector3();
            const dir = new THREE.Vector3();
            vrControllerRayWorld(ctrl, origin, dir);
            const hit = new THREE.Raycaster(origin, dir).intersectObject(vrSpotWindow, false)[0];
            if (!hit?.uv) return null;
            return {
                x: hit.uv.x * vrSpotCanvas.width,
                y: (1 - hit.uv.y) * vrSpotCanvas.height
            };
        }

        function clickVrSpotAt(hit) {
            if (!hit || escMenuOpen || !activeSpot || shouldLockChessSpotControls() || !vrSpotCanvas) return false;
            const x = hit.x;
            const y = hit.y;
            const layout = getVrSpotPlayAreaLayout();
            const { playX, playY, playW, playH } = layout;
            if (
                layout.hasClose &&
                layout.closeY != null &&
                layout.closeH != null &&
                x >= playX &&
                x <= playX + playW &&
                y >= layout.closeY &&
                y <= layout.closeY + layout.closeH
            ) {
                if (activeSpot?.game === 'da') {
                    dismissDamaSpotPanel();
                    updateDamaQueueUi();
                } else {
                    dismissChessSpotPanel();
                    updateChessQueueUi();
                }
                updateVrSpotWindow();
                vrInputCooldownUntil = performance.now() + 350;
                return true;
            }
            if (x >= playX && x <= playX + playW && y >= playY && y <= playY + playH) {
                const ip = document.getElementById('interact-prompt');
                if (ip) ip.style.display = 'none';
                if (
                    (activeSpot.game === 'ch' && onlineDama.queued) ||
                    (activeSpot.game === 'da' && onlineChess.queued)
                ) {
                    dismissChessSpotPanel();
                    updateChessQueueUi();
                    updateDamaQueueUi();
                    updateVrSpotWindow();
                    vrInputCooldownUntil = performance.now() + 350;
                    return true;
                }
                if (activeSpot.game === 'ch') {
                    if (onlineChess.active) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        if (vrSpotWindow) vrSpotWindow.visible = false;
                    } else if (onlineChess.watching) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        if (vrSpotWindow) vrSpotWindow.visible = false;
                    } else if (
                        // Sadece VR masalarında (1-2) "masada canlı maç var" kilidi.
                        // PC/mobil sanal masa (0) paralel maçlara izin verir.
                        onlineChess.activeMatch &&
                        !isLocalPlayerInActiveMatch(onlineChess.activeMatch)
                        && xrActive
                    ) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        if (vrSpotWindow) vrSpotWindow.visible = false;
                    } else if (onlineChess.queued) {
                        onlineChess.queued = false;
                        mpClient?.leaveChessQueue?.();
                    } else {
                        mpClient?.joinChessQueue?.();
                    }
                    updateChessQueueUi();
                    updateVrSpotWindow();
                } else if (activeSpot.game === 'da') {
                    if (onlineDama.active) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        if (vrSpotWindow) vrSpotWindow.visible = false;
                    } else if (onlineDama.watching) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        if (vrSpotWindow) vrSpotWindow.visible = false;
                    } else if (
                        onlineDama.activeMatch &&
                        !isLocalPlayerInActiveMatch(onlineDama.activeMatch)
                        && xrActive
                    ) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        if (vrSpotWindow) vrSpotWindow.visible = false;
                    } else if (onlineDama.queued) {
                        onlineDama.queued = false;
                        mpClient?.leaveDamaQueue?.();
                    } else {
                        mpClient?.joinDamaQueue?.();
                    }
                    updateDamaQueueUi();
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

            const vrTabX0 = 34;
            const vrTabW = 198;
            const vrTabGap = 10;
            const vrTabY = 92;
            const vrTabH = 46;
            for (let idx = 0; idx < escTabs.length; idx++) {
                const tx = vrTabX0 + idx * (vrTabW + vrTabGap);
                if (x >= tx && x <= tx + vrTabW && y >= vrTabY && y <= vrTabY + vrTabH) {
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
            } else if (escMenuTab === 'character') {
                const fPrevX = 34;
                const fPrevY = 272;
                const fPrevW = 170;
                const fBtnH = 56;
                const fNextX = fPrevX + fPrevW + 14;
                const fNextW = 170;
                if (y >= fPrevY && y <= fPrevY + fBtnH) {
                    if (x >= fPrevX && x <= fPrevX + fPrevW) {
                        appearancePending.faceIdx =
                            (appearancePending.faceIdx - 1 + FACE_PRESETS.length) % FACE_PRESETS.length;
                        applyPendingAppearanceToMannequin();
                        syncCharacterFaceBodyLabels();
                        updateVrMenuWindow();
                        return { handled: true, scrollArea: null, menuDrag: false };
                    }
                    if (x >= fNextX && x <= fNextX + fNextW) {
                        appearancePending.faceIdx = (appearancePending.faceIdx + 1) % FACE_PRESETS.length;
                        applyPendingAppearanceToMannequin();
                        syncCharacterFaceBodyLabels();
                        updateVrMenuWindow();
                        return { handled: true, scrollArea: null, menuDrag: false };
                    }
                }
                const swY = 400;
                const swW = 108;
                const swH = 48;
                const swGap = 12;
                for (let i = 0; i < Math.min(6, BODY_COLORS.length); i++) {
                    const bx = 34 + (i % 3) * (swW + swGap);
                    const by = swY + Math.floor(i / 3) * (swH + 12);
                    if (x >= bx && x <= bx + swW && y >= by && y <= by + swH) {
                        appearancePending.bodyIdx = i;
                        applyPendingAppearanceToMannequin();
                        syncCharacterFaceBodyLabels();
                        updateVrMenuWindow();
                        return { handled: true, scrollArea: null, menuDrag: false };
                    }
                }
                const crY = 282;
                const crW = 132;
                const crH = 40;
                if (y >= crY && y <= crY + crH && localSessionToken && lastCrownEligibleForVr.length) {
                    const crA = 620;
                    const crB = crA + crW + 10;
                    if (x >= crA && x <= crA + crW) {
                        vrStepCrownPicker(-1);
                        return { handled: true, scrollArea: null, menuDrag: false };
                    }
                    if (x >= crB && x <= crB + crW) {
                        vrStepCrownPicker(1);
                        return { handled: true, scrollArea: null, menuDrag: false };
                    }
                }
                const svX = 620;
                const svY = 334;
                const svW = 200;
                const svH = 42;
                const sel = document.getElementById('char-crown-select');
                const ec = Number(sel?.dataset?.eligibleCount || '0');
                const hadEq = sel?.dataset?.hadEquipped === '1';
                const curPickVal =
                    vrCrownPickerIndex === 0
                        ? ''
                        : lastCrownEligibleForVr[vrCrownPickerIndex - 1]
                            ? `${lastCrownEligibleForVr[vrCrownPickerIndex - 1].game}:${lastCrownEligibleForVr[vrCrownPickerIndex - 1].place}`
                            : '';
                const saveDisabled =
                    !localSessionToken || ec === 0 || (curPickVal === '' && !hadEq);
                if (!saveDisabled && x >= svX && x <= svX + svW && y >= svY && y <= svY + svH) {
                    void saveCharacterCrownFromUi();
                    return { handled: true, scrollArea: null, menuDrag: false };
                }
                const applyW = 220;
                const applyH = 64;
                const applyX = W - applyW - 34;
                const applyY = H - applyH - 108;
                if (x >= applyX && x <= applyX + applyW && y >= applyY && y <= applyY + applyH) {
                    commitPendingAppearance();
                    syncCharacterFaceBodyLabels();
                    updateVrMenuWindow();
                    return { handled: true, scrollArea: null, menuDrag: false };
                }
            } else if (escMenuTab === 'settings') {
                const rowH = 42;
                const minusX = VR_AUDIO_MUTE_X0 + VR_AUDIO_MUTE_W + VR_AUDIO_GAP;
                const barX = minusX + VR_AUDIO_BTN_W + VR_AUDIO_GAP;
                const plusX = barX + VR_AUDIO_BAR_W + VR_AUDIO_GAP;
                const hitRow = (rowY, onMute, onMinus, onPlus, onBar) => {
                    if (y < rowY || y > rowY + rowH) return false;
                    if (x >= VR_AUDIO_MUTE_X0 && x <= VR_AUDIO_MUTE_X0 + VR_AUDIO_MUTE_W) {
                        onMute();
                        return true;
                    }
                    if (x >= minusX && x <= minusX + VR_AUDIO_BTN_W) {
                        onMinus();
                        return true;
                    }
                    if (x >= plusX && x <= plusX + VR_AUDIO_BTN_W) {
                        onPlus();
                        return true;
                    }
                    if (x >= barX && x <= barX + VR_AUDIO_BAR_W) {
                        onBar();
                        return true;
                    }
                    return false;
                };
                if (
                    hitRow(
                        VR_AUDIO_ROW0_Y,
                        () => setAmbientMusicMuted(!isAmbientMusicMuted()),
                        () => setAmbientVolumePercent(getAmbientVolumePercent() - 10),
                        () => setAmbientVolumePercent(getAmbientVolumePercent() + 10),
                        () => {
                            const rel = (x - barX) / VR_AUDIO_BAR_W;
                            setAmbientVolumePercent(Math.round(Math.max(0, Math.min(1, rel)) * 100));
                        }
                    )
                ) {
                    syncEscSettingsUi();
                    updateVrMenuWindow();
                    return { handled: true, scrollArea: null, menuDrag: false };
                }
                if (
                    hitRow(
                        VR_AUDIO_ROW1_Y,
                        () => setSfxMuted(!isSfxMuted()),
                        () => setSfxVolumePercent(getSfxVolumePercent() - 10),
                        () => setSfxVolumePercent(getSfxVolumePercent() + 10),
                        () => {
                            const rel = (x - barX) / VR_AUDIO_BAR_W;
                            setSfxVolumePercent(Math.round(Math.max(0, Math.min(1, rel)) * 100));
                        }
                    )
                ) {
                    syncEscSettingsUi();
                    updateVrMenuWindow();
                    return { handled: true, scrollArea: null, menuDrag: false };
                }
                if (IS_QUEST) {
                    const pW = 400;
                    const pH = 40;
                    const yb = 546;
                    const bx = 34;
                    if (y >= yb && y <= yb + pH && x >= bx && x <= bx + pW) {
                        setVrHeightPosture(!vrHeightPostureSit);
                        return { handled: true, scrollArea: null, menuDrag: false };
                    }
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
                         'm-map-btn','m-lb-btn','m-esc-btn','mm-wrap'];
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
            backdrop.style.display = 'none';
            document.body.appendChild(backdrop);
            escMenuBackdrop = backdrop;

            const card = document.createElement('div');
            card.id = 'esc-menu-card';
            card.style.display = 'none';
            card.innerHTML = `
                <div class="esc-menu-shell">
                <div class="esc-menu-head">
                    <button type="button" id="esc-menu-close" class="esc-close-btn">Kapat ✕</button>
                    <div class="esc-menu-tabs" role="tablist" aria-label="Menü sekmeleri">
                        <button type="button" data-esc-tab="leaderboard" class="esc-tab-btn">🏆 Liderlik</button>
                        <button type="button" data-esc-tab="online" class="esc-tab-btn">🟢 Çevrimiçi</button>
                        <button type="button" data-esc-tab="live" class="esc-tab-btn">👁️ Canlı</button>
                        <button type="button" data-esc-tab="map" class="esc-tab-btn">🗺️ Harita</button>
                        <button type="button" data-esc-tab="character" class="esc-tab-btn">👤 Karakter</button>
                        <button type="button" data-esc-tab="settings" class="esc-tab-btn">⚙️ Ayarlar</button>
                    </div>
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
            mapWrap.className = 'esc-map-wrap';
            mapWrap.style.display = 'none';
            mapWrap.innerHTML = '<div class="esc-map-wrap-title">HARİTA</div>';
            const mapBody = document.createElement('div');
            mapBody.id = 'esc-map-body';
            mapBody.className = 'esc-map-body';
            const mapList = document.createElement('div');
            mapList.id = 'esc-map-building-list';
            escMapBuildingList = mapList;
            mapBody.appendChild(mapList);
            escMapCanvas = document.createElement('canvas');
            escMapCanvas.width = escMapCanvas.height = escMapSize;
            const mapCanvasWrap = document.createElement('div');
            mapCanvasWrap.className = 'esc-map-canvas-wrap';
            mapCanvasWrap.appendChild(escMapCanvas);
            mapBody.appendChild(mapCanvasWrap);
            mapWrap.appendChild(mapBody);
            escMapCtx = escMapCanvas.getContext('2d');

            const liveWrap = document.createElement('div');
            liveWrap.id = 'esc-live-wrap';
            liveWrap.className = 'esc-live-wrap';
            liveWrap.style.cssText = 'display:none;position:absolute;inset:0;overflow:auto;color:#e8eeff;padding:14px 14px 18px;';
            liveWrap.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
                    <div style="font-weight:900;letter-spacing:.04em;color:#dfe8ff;">CANLI MAÇLAR</div>
                    <button type="button" id="esc-live-leave" class="esc-posture-btn" style="padding:10px 12px;min-width:140px;">İzlemeyi bırak</button>
                </div>
                <div id="esc-live-status" class="esc-settings-desc" style="margin-bottom:10px;opacity:.9;"></div>
                <div style="display:grid;grid-template-columns:minmax(260px,360px) 1fr;gap:12px;align-items:start;">
                    <div id="esc-live-list" style="border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);border-radius:12px;padding:10px;min-height:220px;"></div>
                    <div style="border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);border-radius:12px;padding:10px;min-height:220px;display:flex;flex-direction:column;gap:10px;">
                        <canvas id="esc-live-canvas" width="520" height="520" style="width:min(100%,520px);height:auto;border-radius:10px;border:1px solid rgba(140,190,255,.25);background:#050a14;"></canvas>
                        <div class="esc-settings-desc" style="opacity:.8">Satranç/Dama canlı izleme (basit 2D tahta). İzlemek için soldan bir maç seç.</div>
                    </div>
                </div>
            `;
            escLiveWrap = liveWrap;
            escLiveCanvas = liveWrap.querySelector('#esc-live-canvas');
            escLiveCtx = escLiveCanvas?.getContext?.('2d') || null;
            escLiveList = liveWrap.querySelector('#esc-live-list');
            escLiveStatus = liveWrap.querySelector('#esc-live-status');
            escLiveLeaveBtn = liveWrap.querySelector('#esc-live-leave');
            escLiveLeaveBtn?.addEventListener('click', () => escLiveStopWatching());

            const settingsWrap = document.createElement('div');
            settingsWrap.id = 'esc-settings-wrap';
            settingsWrap.className = 'esc-settings-wrap';
            settingsWrap.style.cssText = 'display:none;position:absolute;inset:0;overflow:auto;color:#e8eeff;';
            settingsWrap.innerHTML = `
                <section class="esc-settings-section esc-settings-audio">
                    <h3 class="esc-settings-h">Ses</h3>
                    <div class="esc-audio-subsection">
                        <div class="esc-audio-sub-head">
                            <h4 class="esc-audio-sub-title">Müzik sesi</h4>
                            <button type="button" id="esc-music-mute-btn" class="esc-audio-mute-btn" data-muted="0" aria-label="Müziği sessize al veya aç" aria-pressed="false">
                                ${MUTE_ICON_ON_SVG}
                                ${MUTE_ICON_OFF_SVG}
                            </button>
                        </div>
                        <p class="esc-settings-desc">Arka plan müziği (döngü). 0 kapalıdır; seviye cihazda kayıtlı kalır.</p>
                        <div class="esc-ambient-volume-block">
                            <div class="esc-ambient-volume-head">
                                <span class="esc-ambient-volume-label">Seviye</span>
                                <span id="esc-ambient-vol-value" class="esc-ambient-vol-value">100%</span>
                            </div>
                            <input type="range" id="esc-ambient-volume" class="esc-ambient-volume-slider" min="0" max="100" step="1" value="100" aria-valuemin="0" aria-valuemax="100" aria-label="Müzik sesi seviyesi" />
                        </div>
                    </div>
                    <div class="esc-audio-subsection">
                        <div class="esc-audio-sub-head">
                            <h4 class="esc-audio-sub-title">SFX sesleri</h4>
                            <button type="button" id="esc-sfx-mute-btn" class="esc-audio-mute-btn" data-muted="0" aria-label="SFX sessize al veya aç" aria-pressed="false">
                                ${MUTE_ICON_ON_SVG}
                                ${MUTE_ICON_OFF_SVG}
                            </button>
                        </div>
                        <p class="esc-settings-desc">Taş sesleri; ileride yürüme gibi efektler de bu kanaldan çalacak.</p>
                        <div class="esc-ambient-volume-block">
                            <div class="esc-ambient-volume-head">
                                <span class="esc-ambient-volume-label">Seviye</span>
                                <span id="esc-sfx-vol-value" class="esc-ambient-vol-value">100%</span>
                            </div>
                            <input type="range" id="esc-sfx-volume" class="esc-ambient-volume-slider" min="0" max="100" step="1" value="100" aria-valuemin="0" aria-valuemax="100" aria-label="SFX seviyesi" />
                        </div>
                    </div>
                </section>
                <section class="esc-settings-section esc-settings-vr" id="esc-settings-vr" style="display:none">
                    <h3 class="esc-settings-h">VR</h3>
                    <p class="esc-settings-desc">Otururken veya ayakta göz hizası için rig yüksekliği (Quest). Tek düğmeyle modlar arasında geç.</p>
                    <div class="esc-settings-vr-btns esc-settings-vr-btns--single">
                        <button type="button" id="esc-vr-posture-toggle" class="esc-posture-btn esc-vr-posture-toggle">Oturuyorum / Ayaktayım</button>
                    </div>
                </section>
            `;
            const vrSec = settingsWrap.querySelector('#esc-settings-vr');
            if (IS_QUEST && vrSec) vrSec.style.display = 'block';
            const ambVol = settingsWrap.querySelector('#esc-ambient-volume');
            const ambVolVal = settingsWrap.querySelector('#esc-ambient-vol-value');
            const onAmbientVolInput = (e) => {
                const v = Number(e.target?.value);
                setAmbientVolumePercent(Number.isFinite(v) ? v : 0);
                if (ambVolVal) ambVolVal.textContent = `${getAmbientVolumePercent()}%`;
                syncEscSettingsUi();
                updateVrMenuWindow();
            };
            ambVol?.addEventListener('input', onAmbientVolInput);
            ambVol?.addEventListener('change', onAmbientVolInput);
            settingsWrap.querySelector('#esc-music-mute-btn')?.addEventListener('click', () => {
                setAmbientMusicMuted(!isAmbientMusicMuted());
                syncEscSettingsUi();
                updateVrMenuWindow();
            });
            const sfxVol = settingsWrap.querySelector('#esc-sfx-volume');
            const sfxVolVal = settingsWrap.querySelector('#esc-sfx-vol-value');
            const onSfxVolInput = (e) => {
                const v = Number(e.target?.value);
                setSfxVolumePercent(Number.isFinite(v) ? v : 0);
                if (sfxVolVal) sfxVolVal.textContent = `${getSfxVolumePercent()}%`;
                syncEscSettingsUi();
                updateVrMenuWindow();
            };
            sfxVol?.addEventListener('input', onSfxVolInput);
            sfxVol?.addEventListener('change', onSfxVolInput);
            settingsWrap.querySelector('#esc-sfx-mute-btn')?.addEventListener('click', () => {
                setSfxMuted(!isSfxMuted());
                syncEscSettingsUi();
                updateVrMenuWindow();
            });
            settingsWrap.querySelector('#esc-vr-posture-toggle')?.addEventListener('click', () => {
                setVrHeightPosture(!vrHeightPostureSit);
            });

            const characterWrap = document.createElement('div');
            characterWrap.id = 'esc-character-wrap';
            characterWrap.className = 'esc-character-wrap';
            characterWrap.style.cssText = 'display:none;position:absolute;inset:0;overflow:auto;color:#e8eeff;';
            characterWrap.innerHTML = `
                <div class="esc-character-grid">
                    <div class="esc-character-main">
                        <section class="esc-settings-section">
                            <h3 class="esc-settings-h">Yüz ifadesi</h3>
                            <p class="esc-settings-desc" id="char-face-label">—</p>
                            <div class="char-face-btns">
                                <button type="button" id="char-face-prev" class="esc-posture-btn">◀ Önceki</button>
                                <button type="button" id="char-face-next" class="esc-posture-btn">Sonraki ▶</button>
                            </div>
                        </section>
                        <section class="esc-settings-section">
                            <h3 class="esc-settings-h">Gövde rengi</h3>
                            <p class="esc-settings-desc" id="char-body-label">—</p>
                            <div id="char-body-swatches" class="char-body-swatches"></div>
                        </section>
                        <section class="esc-settings-section">
                            <h3 class="esc-settings-h">Liderlik taçı</h3>
                            <p class="esc-settings-desc" id="char-crown-hint"></p>
                            <select id="char-crown-select" class="esc-crown-select" aria-label="Taç seçimi"></select>
                            <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;">
                                <button type="button" id="char-crown-save" class="esc-posture-btn esc-crown-save-btn" disabled>Taçı kaydet</button>
                            </div>
                        </section>
                        <button type="button" id="char-appearance-apply" class="esc-char-apply-btn" disabled>Görünümü uygula</button>
                    </div>
                    <div class="esc-character-aside">
                        <div id="char-preview-3d-host" class="char-preview-3d-host" aria-label="Karakter önizleme"></div>
                        <p class="char-preview-caption esc-settings-desc">Kampüsteki model + seçtiğin taç (önizleme)</p>
                    </div>
                </div>
            `;
            const swHost = characterWrap.querySelector('#char-body-swatches');
            if (swHost) {
                BODY_COLORS.forEach((col, i) => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'char-body-swatch';
                    b.dataset.idx = String(i);
                    b.style.background = `#${col.hex.toString(16).padStart(6, '0')}`;
                    b.title = col.label;
                    b.addEventListener('click', () => {
                        appearancePending.bodyIdx = i;
                        applyPendingAppearanceToMannequin();
                        syncCharacterFaceBodyLabels();
                        updateVrMenuWindow();
                    });
                    swHost.appendChild(b);
                });
            }
            characterWrap.querySelector('#char-face-prev')?.addEventListener('click', () => {
                appearancePending.faceIdx =
                    (appearancePending.faceIdx - 1 + FACE_PRESETS.length) % FACE_PRESETS.length;
                applyPendingAppearanceToMannequin();
                syncCharacterFaceBodyLabels();
                updateVrMenuWindow();
            });
            characterWrap.querySelector('#char-face-next')?.addEventListener('click', () => {
                appearancePending.faceIdx = (appearancePending.faceIdx + 1) % FACE_PRESETS.length;
                applyPendingAppearanceToMannequin();
                syncCharacterFaceBodyLabels();
                updateVrMenuWindow();
            });
            characterWrap.querySelector('#char-appearance-apply')?.addEventListener('click', () => commitPendingAppearance());
            characterWrap.querySelector('#char-crown-select')?.addEventListener('change', () => {
                updateCharacterCrownSaveState();
                const sel = document.getElementById('char-crown-select');
                if (!sel || sel.disabled) return;
                const v = sel.value;
                if (!v) vrCrownPickerIndex = 0;
                else {
                    const parts = v.split(':');
                    const g = parts[0];
                    const p = Number(parts[1]);
                    const ix = lastCrownEligibleForVr.findIndex(
                        (b) => b.game === g && Number(b.place) === p
                    );
                    vrCrownPickerIndex = ix >= 0 ? ix + 1 : 0;
                }
                syncPreviewMannequinCrownTags();
                updateVrMenuWindow();
            });
            characterWrap.querySelector('#char-crown-save')?.addEventListener('click', () => void saveCharacterCrownFromUi());

            const content = card.querySelector('#esc-menu-content');
            const l = document.getElementById('lb-panel');
            const o = document.getElementById('online-users-panel');
            if (l) { l.style.position = 'absolute'; l.style.inset = '0'; l.style.width = '100%'; l.style.maxWidth = '100%'; content?.appendChild(l); }
            if (o) { o.style.position = 'absolute'; o.style.inset = '0'; o.style.width = '100%'; o.style.maxWidth = '100%'; o.style.maxHeight = '100%'; o.style.overflowY = 'auto'; content?.appendChild(o); }
            content?.appendChild(liveWrap);
            content?.appendChild(mapWrap);
            content?.appendChild(characterWrap);
            content?.appendChild(settingsWrap);
            renderEscMapBuildingList();
            syncEscSettingsUi();
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
            const live = document.getElementById('esc-live-wrap');
            const m = document.getElementById('esc-map-wrap');
            const ch = document.getElementById('esc-character-wrap');
            const s = document.getElementById('esc-settings-wrap');
            if (l) l.style.display = tab === 'leaderboard' ? 'block' : 'none';
            if (o) o.style.display = tab === 'online' ? 'block' : 'none';
            if (live) live.style.display = tab === 'live' ? 'block' : 'none';
            if (m) m.style.display = tab === 'map' ? 'flex' : 'none';
            if (ch) ch.style.display = tab === 'character' ? 'block' : 'none';
            if (s) s.style.display = tab === 'settings' ? 'block' : 'none';
            if (escMenuCard) {
                escMenuCard.querySelectorAll('.esc-tab-btn').forEach((btn) => {
                    btn.classList.toggle('active', btn.dataset.escTab === tab);
                });
            }
            if (tab === 'leaderboard') loadLeaderboard(currentLbGame);
            if (tab === 'live') {
                escLiveRefreshList();
                escLiveRequestMesaStates();
                escLiveRenderCanvas();
            }
            if (tab === 'map') {
                renderEscMapBuildingList();
                lastVrEscMapDraw = 0;
            }
            if (tab === 'settings') syncEscSettingsUi();
            else syncEscVrPostureUi();
            if (tab === 'character') {
                if (xrActive) {
                    initVrCharMannequin();
                    initVrCharWindow();
                    applyPendingAppearanceToMannequin();
                }
                syncCharacterPanelUi();
                if (!xrActive) {
                    requestAnimationFrame(() => {
                        if (escMenuTab !== 'character' || xrActive) return;
                        ensureCharacterPreview3d();
                        resizeCharacterPreview3d();
                        startCharacterPreviewLoop();
                    });
                } else {
                    stopCharacterPreviewLoop();
                    updateVrCharWindow();
                }
            } else {
                stopCharacterPreviewLoop();
            }
            if (xrActive) syncVrEscWindowsVisibility();
            updateVrMenuWindow();
        }

        function cycleEscTab(dir) {
            const cur = Math.max(0, escTabs.indexOf(escMenuTab));
            const next = (cur + dir + escTabs.length) % escTabs.length;
            setEscTab(escTabs[next]);
        }

        function escLiveRequestMesaStates() {
            // Canlı liste için PC/mobil sanal masa (0) state çek.
            try {
                mpClient?.getChessQueue?.(0);
                mpClient?.getDamaQueue?.(0);
            } catch (_) { /* ignore */ }
        }

        function escLiveStopWatching() {
            if (!escLiveWatch) return;
            const prev = escLiveWatch;
            escLiveWatch = null;
            escLiveChessPayload = null;
            escLiveDamaPayload = null;
            if (escLiveStatus) escLiveStatus.textContent = 'İzleme kapandı.';
            try {
                if (prev.kind === 'ch') mpClient?.leaveChessWatch?.(prev.matchId);
                else mpClient?.leaveDamaWatch?.(prev.matchId);
            } catch (_) { /* ignore */ }
            escLiveRenderCanvas();
        }

        function escLiveRefreshList() {
            if (!escLiveList) return;
            const chRows = [0]
                .flatMap((mid) => {
                    const st = chessQueueStateByMesa.get(mid);
                    const list = Array.isArray(st?.activeMatches) ? st.activeMatches : null;
                    if (list?.length) return list.map((am) => ({ mid, am }));
                    const one = st?.activeMatch || null;
                    return one ? [{ mid, am: one }] : [];
                })
                .filter((x) => !!x.am?.matchId);
            const daRows = [0]
                .flatMap((mid) => {
                    const st = damaQueueStateByMesa.get(mid);
                    const list = Array.isArray(st?.activeMatches) ? st.activeMatches : null;
                    if (list?.length) return list.map((am) => ({ mid, am }));
                    const one = st?.activeMatch || null;
                    return one ? [{ mid, am: one }] : [];
                })
                .filter((x) => !!x.am?.matchId);

            const rowBtn = ({ kind, mid, matchId }) => {
                const label = kind === 'ch' ? '♟️ Satranç' : '⛀ Dama';
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'esc-map-bldg-row';
                b.style.cssText =
                    'display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;padding:10px 10px;margin:0 0 8px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#f3f7ff;cursor:pointer;';
                const active =
                    escLiveWatch &&
                    escLiveWatch.kind === kind &&
                    Number(escLiveWatch.matchId) === Number(matchId);
                b.style.borderColor = active ? 'rgba(140,190,255,.65)' : 'rgba(255,255,255,.14)';
                b.style.background = active ? 'rgba(120,180,255,.16)' : 'rgba(255,255,255,.04)';
                b.innerHTML = `<span style="font-weight:800">${esc(label)}</span><span style="opacity:.86">Masa ${mid} · #${esc(String(matchId))}</span>`;
                b.addEventListener('click', () => {
                    const mId = Number(matchId);
                    if (!Number.isFinite(mId)) return;
                    escLiveWatch = { kind, matchId: mId };
                    if (escLiveStatus) escLiveStatus.textContent = `${label} izleniyor… (Masa ${mid})`;
                    escLiveRefreshList();
                    escLiveRenderCanvas();
                    try {
                        if (kind === 'ch') mpClient?.watchChessMatch?.(mId);
                        else mpClient?.watchDamaMatch?.(mId);
                    } catch (_) { /* ignore */ }
                });
                return b;
            };

            escLiveList.innerHTML = '';
            const h1 = document.createElement('div');
            h1.style.cssText = 'font-weight:900;margin:4px 0 10px;color:#dfe8ff;';
            h1.textContent = 'Aktif maçlar (PC/Mobil)';
            escLiveList.appendChild(h1);

            const sec = (title) => {
                const t = document.createElement('div');
                t.style.cssText = 'margin:10px 0 6px;font-weight:800;opacity:.92;';
                t.textContent = title;
                escLiveList.appendChild(t);
            };

            sec('Satranç');
            if (!chRows.length) {
                const e = document.createElement('div');
                e.className = 'esc-settings-desc';
                e.textContent = 'Şu an satranç canlı maç yok.';
                escLiveList.appendChild(e);
            } else {
                chRows.forEach(({ mid, am }) =>
                    escLiveList.appendChild(rowBtn({ kind: 'ch', mid, matchId: am.matchId }))
                );
            }

            sec('Dama');
            if (!daRows.length) {
                const e = document.createElement('div');
                e.className = 'esc-settings-desc';
                e.textContent = 'Şu an dama canlı maç yok.';
                escLiveList.appendChild(e);
            } else {
                daRows.forEach(({ mid, am }) =>
                    escLiveList.appendChild(rowBtn({ kind: 'da', mid, matchId: am.matchId }))
                );
            }
        }

        function escLiveRenderCanvas() {
            if (!escLiveCtx || !escLiveCanvas) return;
            const ctx = escLiveCtx;
            const W = escLiveCanvas.width;
            const H = escLiveCanvas.height;
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = '#050a14';
            ctx.fillRect(0, 0, W, H);

            const drawCenterText = (t1, t2 = '') => {
                ctx.fillStyle = 'rgba(220,232,255,.92)';
                ctx.textAlign = 'center';
                ctx.font = '800 20px Inter,Segoe UI,Arial';
                ctx.fillText(t1, W / 2, H / 2 - 10);
                if (t2) {
                    ctx.font = '600 14px Inter,Segoe UI,Arial';
                    ctx.fillStyle = 'rgba(220,232,255,.72)';
                    ctx.fillText(t2, W / 2, H / 2 + 18);
                }
            };

            if (!escLiveWatch) {
                drawCenterText('Canlı maç seç', 'Soldan bir maç seçerek izlemeye başla');
                return;
            }

            if (escLiveWatch.kind === 'ch') {
                const p = escLiveChessPayload;
                if (!p?.fen) {
                    drawCenterText('Satranç yükleniyor…', `#${esc(String(escLiveWatch.matchId))}`);
                    return;
                }
                drawChessFen2d(ctx, p.fen, { lastMove: p.move || null });
                return;
            }

            const p = escLiveDamaPayload;
            if (!p?.board) {
                drawCenterText('Dama yükleniyor…', `#${esc(String(escLiveWatch.matchId))}`);
                return;
            }
            drawDamaBoard2d(ctx, p.board);
        }

        function drawChessFen2d(ctx, fen, { lastMove = null } = {}) {
            const W = escLiveCanvas.width;
            const H = escLiveCanvas.height;
            const S = Math.min(W, H);
            const pad = 20;
            const board = S - pad * 2;
            const cell = board / 8;
            const x0 = (W - board) / 2;
            const y0 = (H - board) / 2;

            const ranks = String(fen || '').split(' ')[0]?.split('/') || [];
            const sq = Array.from({ length: 8 }, () => Array(8).fill('.'));
            for (let r = 0; r < 8; r++) {
                const row = ranks[r] || '';
                let c = 0;
                for (const ch of row) {
                    if (c >= 8) break;
                    if (/\d/.test(ch)) c += Number(ch);
                    else { sq[r][c] = ch; c++; }
                }
            }
            const toRC = (al) => {
                if (!al || typeof al !== 'string' || al.length < 2) return null;
                const file = al[0].toLowerCase().charCodeAt(0) - 97;
                const rank = Number(al[1]);
                if (file < 0 || file > 7 || !Number.isFinite(rank) || rank < 1 || rank > 8) return null;
                return { r: 8 - rank, c: file };
            };
            const from = lastMove?.from ? toRC(lastMove.from) : null;
            const to = lastMove?.to ? toRC(lastMove.to) : null;

            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const light = (r + c) % 2 === 0;
                    ctx.fillStyle = light ? '#d4dbe6' : '#3b4a62';
                    ctx.fillRect(x0 + c * cell, y0 + r * cell, cell, cell);
                }
            }
            const hl = (rc, col) => {
                if (!rc) return;
                ctx.fillStyle = col;
                ctx.fillRect(x0 + rc.c * cell, y0 + rc.r * cell, cell, cell);
            };
            hl(from, 'rgba(255,220,120,.35)');
            hl(to, 'rgba(120,200,255,.28)');

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `${Math.floor(cell * 0.72)}px "Segoe UI Symbol","Apple Color Emoji",Arial`;
            const pieceGlyph = (p) => {
                const map = {
                    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
                    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
                };
                return map[p] || '';
            };
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const ch = sq[r][c];
                    const g = pieceGlyph(ch);
                    if (!g) continue;
                    ctx.fillStyle = ch === ch.toUpperCase() ? '#10151e' : '#10151e';
                    ctx.fillText(g, x0 + c * cell + cell / 2, y0 + r * cell + cell / 2 + 1);
                }
            }
            ctx.strokeStyle = 'rgba(140,190,255,.35)';
            ctx.lineWidth = 3;
            ctx.strokeRect(x0 - 1.5, y0 - 1.5, board + 3, board + 3);
        }

        function drawDamaBoard2d(ctx, boardStr) {
            const W = escLiveCanvas.width;
            const H = escLiveCanvas.height;
            const S = Math.min(W, H);
            const pad = 20;
            const board = S - pad * 2;
            const cell = board / 8;
            const x0 = (W - board) / 2;
            const y0 = (H - board) / 2;
            const b = String(boardStr || '');
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const dark = (r + c) % 2 === 1;
                    ctx.fillStyle = dark ? '#2b3446' : '#d4dbe6';
                    ctx.fillRect(x0 + c * cell, y0 + r * cell, cell, cell);
                    const ch = b[r * 8 + c] || '.';
                    if (ch === '.' || ch === '#') continue;
                    const isWhite = ch === 'w' || ch === 'W';
                    const isKing = ch === 'W' || ch === 'B';
                    const cx = x0 + c * cell + cell / 2;
                    const cy = y0 + r * cell + cell / 2;
                    ctx.beginPath();
                    ctx.arc(cx, cy, cell * 0.33, 0, Math.PI * 2);
                    ctx.fillStyle = isWhite ? '#f1f6ff' : '#10151e';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(0,0,0,.35)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    if (isKing) {
                        ctx.fillStyle = isWhite ? '#1a4f8a' : '#e8c870';
                        ctx.font = `900 ${Math.floor(cell * 0.28)}px Inter,Arial`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('K', cx, cy + 1);
                    }
                }
            }
            ctx.strokeStyle = 'rgba(140,190,255,.35)';
            ctx.lineWidth = 3;
            ctx.strokeRect(x0 - 1.5, y0 - 1.5, board + 3, board + 3);
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
                if (escMenuCard) escMenuCard.style.display = open ? 'flex' : 'none';
            }
            if (open) setEscTab(escMenuTab);
            if (xrActive) syncVrEscWindowsVisibility();
            if (vrSpotWindow) {
                const px = xrRig?.position?.x ?? 0;
                const pz = xrRig?.position?.z ?? 0;
                const suppressNear =
                    (onlineChess.suppressChessSpotOfferUntilLeaveZone && isNearChessSpot(px, pz)) ||
                    (onlineDama.suppressDamaSpotOfferUntilLeaveZone && isNearDamaSpot(px, pz));
                vrSpotWindow.visible =
                    !open &&
                    xrActive &&
                    !!activeSpot &&
                    !shouldLockChessSpotControls() &&
                    !suppressNear;
            }
            if (!open) {
                stopCharacterPreviewLoop();
                vrMenuDragLeft = null;
                vrMenuDragRight = null;
                vrMenuMoveLeft = null;
                vrMenuMoveRight = null;
                vrMenuPointerLeft = null;
                vrMenuPointerRight = null;
                vrSpotPointerLeft = null;
                vrSpotPointerRight = null;
            } else {
                syncEscSettingsUi();
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

        // Boot overlay yardımcıları `js/campus/bootOverlay.js` içine taşındı.

        /** Ağır UI / NPC / API — ilk kare çizildikten hemen sonra (ana iş parçacığını nefes aldırır, özellikle Quest). */
        function scheduleCampusDeferredInit() {
            const runHeavy = () => {
                try {
                    spawnNPCs();
                    buildProxLabels();
                    loadLeaderboard('masa_tenisi');
                } catch (err) {
                    console.error('Ertelemeli kampüs init (ağır):', err);
                }
            };
            const run = () => {
                try {
                    buildSidePanel();
                    setupLeaderboard();
                    setupMiniGames();
                    setupWebChessDesktopViewMode();
                    setupWebDamaDesktopViewMode();
                    if (IS_QUEST) {
                        setTimeout(runHeavy, 0);
                    } else {
                        runHeavy();
                    }
                } catch (err) {
                    console.error('Ertelemeli kampüs init:', err);
                }
            };
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => {
                    requestAnimationFrame(run);
                });
            } else {
                setTimeout(run, 0);
            }
        }

        /* ════════════════ INIT ═════════════════════════ */
        async function initGame() {
            if (IS_MOB) mmSize = 130;
            if (IS_QUEST) {
                mmSize = 148;
                escMapSize = 300;
            }

            setCampusBootStatus('Grafik motoru başlatılıyor…');

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
            renderer.toneMappingExposure = IS_QUEST ? 0.78 : 0.88;
            renderer.setClearColor(0x7298b0);
            renderer.domElement.style.cssText = 'position:fixed;top:0;left:0;z-index:1;width:100%;height:100%';
            document.body.appendChild(renderer.domElement);

            // ── Scene & Camera ──────────────────────────
            scene = new THREE.Scene();
            // Daha sıcak fog (uzakta maviyi biraz kır)
            scene.fog = new THREE.Fog(0x7aa8c4, 74, IS_MOB ? 128 : 176);
            camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .1, 500);
            initHandEnvironment();
            if (handEnvMap) scene.environment = handEnvMap;

            /* ══════════════════════════════════════════════
               VR KONTROLÜ
               ─────────────────────────────────────────────
               immersive-vr + Quest (IS_QUEST) ise setupVR() ve ortalanmış
               "VR'a gir" düğmesi. Masaüstü web’de WebXR olsa bile atlanır.
            ══════════════════════════════════════════════ */
            renderer.xr.enabled = true;
            detectAndSetupVR();

            // ── Sahne ve oyun objeleri (UI/NPC/leaderboard API bir sonraki karede) ──
            setCampusBootStatus('Sahne oluşturuluyor…');
            const bootModelPromises = buildScene();
            // Kampüsün "boşlukta" görünmemesi için kritik OBJ'lerin (Rektörlük/Anıt/Gap Yenev) yüklenmesini bekle.
            // Bu bekleme, eski davranıştaki gibi dünyayı tek seferde "hazır" göstermeyi hedefler.
            if (bootModelPromises?.length) {
                setCampusBootStatus('Kampüs modelleri yükleniyor…');
                await Promise.race([
                    Promise.allSettled(bootModelPromises),
                    new Promise((r) => setTimeout(r, 12000))
                ]);
            }
            setCampusBootStatus('Ana kapı yükleniyor…');
            universityGateRoot = await addUniversityMainGate({ scene, IS_MOB, buildingAABBs });
            setCampusBootStatus('Kampüs ve bağlantı hazırlanıyor…');
            addInteractiveObjects();
            createPlayer();
            setupOnlineUsersPanel();
            setupEscMenu();
            setupMultiplayer();
            // 2 masa: dünyaya iki satranç/dama tahtası monte et.
            [1, 2].forEach((mid) => {
                ensureWorldChessBoard(mid);
                ensureWorldDamaBoard(mid);
            });
            setupControls();

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
                resizeCharacterPreview3d();
            });

            setCampusBootStatus('Son dokunuşlar…');
            startNonVRLoop();
            document.body.classList.add('campus-ready');

            document.addEventListener(
                'contextmenu',
                (e) => {
                    const t = e.target;
                    if (!(t instanceof Element)) return;
                    if (t.closest('input, textarea, [contenteditable="true"]')) return;
                    if (
                        t.closest(
                            'button, [role="button"], .lb-tab, #lb-toggle-btn, .bldg-item, .m-btn, .web-chess-3d-btn, #game-overlay, #interact-prompt, #lb-panel, #bldg-panel, #score-modal, #esc-menu-card, #esc-menu-backdrop, #vr-chess-result-dom-overlay'
                        )
                    ) {
                        e.preventDefault();
                    }
                },
                true
            );

            scheduleCampusDeferredInit();
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
            /** @type {Promise<any>[]} */
            const modelPromises = [];
            // Gölgeleri tamamen kapatmadan daha hafif yap: kontrastı azalt (daha fazla ortam ışığı, biraz daha düşük güneş).
            scene.add(new THREE.AmbientLight(
                0xffefe0,
                IS_QUEST ? 0.52 : (IS_MOB ? 0.48 : 0.35)
            ));
            const sun = new THREE.DirectionalLight(
                0xffd6b3,
                IS_QUEST ? 0.38 : (IS_MOB ? 0.54 : 0.48)
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
                IS_QUEST ? 0.35 : (IS_MOB ? 0.3 : 0.26)
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
            modelPromises.push(addRectorateBuilding());
            modelPromises.push(addEntranceMonument());
            modelPromises.push(addGapYenev());
            const isNearAnit = (x, z) => {
                const dx = x - (-44.0);
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
            return modelPromises;
        }

        function addEntranceMonument() {
            return new Promise((resolve) => {
                let settled = false;
                const done = (v) => {
                    if (settled) return;
                    settled = true;
                    resolve(v);
                };
            // Rektörlük (z~26) ile giriş kapısı (z~82) arasına, satranç tarafının tersine (x negatif) koy.
            // Dama masası (x~-10,z~42) ile çakışmayı önlemek için anıtı daha sola (x daha negatif).
            const ANIT_X = -44.0;
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

                            const box2 = new THREE.Box3().setFromObject(root);
                            const size2 = new THREE.Vector3();
                            box2.getSize(size2);
                            const cx = (box2.min.x + box2.max.x) * 0.5;
                            const cz = (box2.min.z + box2.max.z) * 0.5;
                            const r = Math.max(0.5, Math.min(size2.x, size2.z) * 0.5 - 0.6);
                            circleColliders.push({ x: cx, z: cz, r });
                            done(root);
                        },
                        undefined,
                        (err) => { console.error('ANIT.obj yüklenemedi:', err); done(null); }
                    );
                },
                undefined,
                (err) => { console.error('ANIT.mtl yüklenemedi:', err); done(null); }
            );
            });
        }

        function addGapYenev() {
            return new Promise((resolve) => {
                let settled = false;
                const done = (v) => {
                    if (settled) return;
                    settled = true;
                    resolve(v);
                };
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

                            const box2 = new THREE.Box3().setFromObject(root);
                            const size2 = new THREE.Vector3();
                            box2.getSize(size2);
                            const cx = (box2.min.x + box2.max.x) * 0.5;
                            const cz = (box2.min.z + box2.max.z) * 0.5;
                            const r = Math.max(0.5, Math.min(size2.x, size2.z) * 0.5 - 0.6);
                            circleColliders.push({ x: cx, z: cz, r });
                            done(root);
                        },
                        undefined,
                        (err) => { console.error('Gap-Yenev.obj yüklenemedi:', err); done(null); }
                    );
                },
                undefined,
                (err) => { console.error('Gap-Yenev.mtl yüklenemedi:', err); done(null); }
            );
            });
        }

        function addRectorateBuilding() {
            const spec = BUILDINGS.find((b) => b.name === 'Rektörlük');
            if (!spec) return Promise.resolve(null);

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
            return new Promise((resolve) => {
                let settled = false;
                const done = (v) => {
                    if (settled) return;
                    settled = true;
                    resolve(v);
                };
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

                            const box3 = new THREE.Box3().setFromObject(root);
                            const shrinkX = 1.2;
                            const shrinkZBack = 1.2;
                            const shrinkZFront = 3.0;
                            buildingAABBs.push({
                                x0: box3.min.x + shrinkX,
                                x1: box3.max.x - shrinkX,
                                z0: box3.min.z + shrinkZBack,
                                z1: box3.max.z - shrinkZFront
                            });
                            done(root);
                            },
                            undefined,
                            (err) => { console.error('Rektörlük OBJ yüklenemedi:', err); done(null); }
                        );
                    },
                    undefined,
                    (err) => { console.error('Rektörlük MTL yüklenemedi:', err); done(null); }
                );
            });
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

            // ── Satranç & Dama Masaları (dekoratif; VR oynanabilir tahta anchor.y ayrı ayarlanır) ──
            const buildTable = (x, z, boardHex, legHex, markerEmoji) => {
                const g = new THREE.Group();
                const top = bx(3.2, 0.14, 3.2, worldStd(0x4c321e, 0.82));
                top.position.set(0, 0.34, 0);
                g.add(top);
                const b = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 2.1), worldStd(boardHex, 0.78));
                b.position.set(0, 0.45, 0);
                g.add(b);
                const legH = 0.27;
                const legY = legH * 0.5;
                [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]].forEach(([lx, lz]) => {
                    g.add(cl(0.08, 0.08, legH, 6, legHex, lx, legY, lz));
                });
                g.position.set(x, 0, z);
                scene.add(g);
                addSpotMarker(x, z, markerEmoji);
            };

            SPOTS.filter((spt) => spt.game === 'ch').forEach((spt) => {
                buildTable(spt.pos.x, spt.pos.z, 0xe5d7b5, 0x7a5c1e, '♟️');
            });
            SPOTS.filter((spt) => spt.game === 'da').forEach((spt) => {
                buildTable(spt.pos.x, spt.pos.z, 0x2a1810, 0x5a4a32, '⛀');
            });
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
        const spawnStore = createSpawnStore('vrh_spawn_v1');

        function createPlayer() {
            player = makeHuman(0x1a4f8a, 0x1a2a3a);
            player.position.set(0, 0, 108);
            const saved = spawnStore.read();
            if (saved) {
                player.position.set(saved.x, 0, saved.z);
                playerYaw = saved.yaw;
                player.rotation.y = saved.yaw;
            }
            player.userData.nameTag = createNameTag(localNickname, localDisplayCrown);
            player.userData.nameTag.position.set(0, NAME_TAG_ANCHOR_Y, 0);
            player.add(player.userData.nameTag);
            // ilk görünüm: applied
            applyAppliedAppearanceToPlayer();
            scene.add(player);
        }

        function nameTagCrownOpts(p) {
            if (!p?.crownGame || p.crownPlace == null) return null;
            const pl = Number(p.crownPlace);
            if (!Number.isFinite(pl) || pl < 1 || pl > 3) return null;
            return { game: String(p.crownGame), place: pl };
        }

        /** Liderlik panelindeki .lb-crown--gold|silver|bronze SVG ile aynı vektör (emoji değil). */
        const NAME_TAG_CROWN_PATH =
            'M10 62h80v10H10zm8-38l12 22h40l12-22-14 10L50 18 32 34 18 24z';

        function drawNameTagCrownSprite(ctx, cx, cy, place1to3) {
            const styles = {
                1: { fill: '#e8c04a', stroke: '#a67c00', gem: '#fff3b0' },
                2: { fill: '#c8ccd4', stroke: '#7a7e87', gem: '#eef1f5' },
                3: { fill: '#b87333', stroke: '#6b3f1d', gem: '#e0a060' }
            };
            const st = styles[place1to3] || styles[1];
            const targetH = 124;
            const sc = targetH / 80;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(sc, sc);
            ctx.translate(-50, -40);
            let body;
            try {
                body = new Path2D(NAME_TAG_CROWN_PATH);
            } catch (_e) {
                ctx.restore();
                return;
            }
            ctx.fillStyle = st.fill;
            ctx.strokeStyle = st.stroke;
            ctx.lineWidth = 2;
            ctx.fill(body);
            ctx.stroke(body);
            ctx.fillStyle = st.gem;
            for (const [gx, gy] of [
                [22, 22],
                [50, 12],
                [78, 22]
            ]) {
                ctx.beginPath();
                ctx.arc(gx, gy, 5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        /** Alt-orta sabit; isim bandı dünya yüksekliği createNameTag ile hizalı */
        const NAME_TAG_ANCHOR_Y = 2.31;

        const NAME_TAG_CROWN_CACHE_VER = 2;
        const vrLbCrownCanvasCache = {};

        function getVrLbCrownCanvas(place1to3) {
            const p = Number(place1to3);
            if (p < 1 || p > 3) return null;
            const hit = vrLbCrownCanvasCache[p];
            if (hit && hit.ver === NAME_TAG_CROWN_CACHE_VER) return hit.canvas;
            const cc = document.createElement('canvas');
            cc.width = 100;
            cc.height = 80;
            const cctx = cc.getContext('2d');
            drawNameTagCrownSprite(cctx, 50, 40, p);
            vrLbCrownCanvasCache[p] = { ver: NAME_TAG_CROWN_CACHE_VER, canvas: cc };
            return cc;
        }

        /** @param {{ game: string, place: number } | null | undefined} crownOpt */
        function createNameTag(text, crownOpt) {
            const crown =
                crownOpt?.game && crownOpt.place >= 1 && crownOpt.place <= 3 ? crownOpt : null;
            const cv = document.createElement('canvas');
            cv.width = 512;
            const NAME_TAG_CV_H = 268;
            const nameBandTop = NAME_TAG_CV_H - 96;
            const ny = nameBandTop + 36;
            const crownCy = 72;
            cv.height = NAME_TAG_CV_H;
            const ctx = cv.getContext('2d');
            ctx.clearRect(0, 0, cv.width, cv.height);
            if (crown) {
                const flank = lbGameEmoji(crown.game);
                const flankX = 158;
                const flankFont = '44px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = flankFont;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(flank, flankX, crownCy);
                drawNameTagCrownSprite(ctx, cv.width / 2, crownCy, crown.place);
                ctx.font = flankFont;
                ctx.fillText(flank, cv.width - flankX, crownCy);
            }
            ctx.fillStyle = 'rgba(0,0,0,0.62)';
            ctx.fillRect(16, nameBandTop, cv.width - 32, 72);
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = 'rgba(0,0,0,0.95)';
            ctx.lineWidth = 9;
            ctx.font = 'bold 44px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const nick = String(text || 'Oyuncu').slice(0, 24);
            ctx.strokeText(nick, cv.width / 2, ny);
            ctx.fillText(nick, cv.width / 2, ny);
            const tex = new THREE.CanvasTexture(cv);
            tex.needsUpdate = true;
            const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
            tag.center.set(0.5, 0);
            const sy = 0.78 * (NAME_TAG_CV_H / 128);
            tag.scale.set(3.55, sy, 1);
            return tag;
        }

        function refreshLocalPlayerNameTag() {
            if (!player?.userData) return;
            const old = player.userData.nameTag;
            if (old) {
                player.remove(old);
                if (old.material?.map) old.material.map.dispose();
                if (old.material) old.material.dispose();
            }
            player.userData.nameTag = createNameTag(localNickname, localDisplayCrown);
            player.userData.nameTag.position.set(0, NAME_TAG_ANCHOR_Y, 0);
            player.add(player.userData.nameTag);
        }

        function refreshRemotePlayerNameTag(avatar, nickname, crownOpt) {
            if (!avatar?.userData) return;
            const old = avatar.userData.nameTag;
            if (old) {
                avatar.remove(old);
                if (old.material?.map) old.material.map.dispose();
                if (old.material) old.material.dispose();
            }
            avatar.userData.nameTag = createNameTag(nickname || 'Oyuncu', crownOpt);
            avatar.userData.nameTag.position.set(0, NAME_TAG_ANCHOR_Y, 0);
            avatar.add(avatar.userData.nameTag);
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
            avatar.userData.remoteNickname = p.nickname || 'Oyuncu';
            avatar.userData.nameTag = createNameTag(avatar.userData.remoteNickname, nameTagCrownOpts(p));
            avatar.userData.nameTag.position.set(0, NAME_TAG_ANCHOR_Y, 0);
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
            if (activeSpot?.game === 'ch') return activeSpot.pos;
            const mid = onlineChess?.mesaId ?? 1;
            return SPOTS.find((s) => s.game === 'ch' && Number(s.mesaId || 1) === Number(mid))?.pos || SPOTS.find((s) => s.game === 'ch')?.pos || { x: 10, z: 42 };
        }

        function getDamaSpotPos() {
            if (activeSpot?.game === 'da') return activeSpot.pos;
            const mid = onlineDama?.mesaId ?? 1;
            return SPOTS.find((s) => s.game === 'da' && Number(s.mesaId || 1) === Number(mid))?.pos || SPOTS.find((s) => s.game === 'da')?.pos || { x: -10, z: 42 };
        }

        /** Satranç masası SPOTS merkezine göre yakınlık (kuyruk paneli bastırma için). */
        function isNearChessSpot(px, pz) {
            const spot = getChessSpotPos();
            const dx = px - spot.x;
            const dz = pz - spot.z;
            return dx * dx + dz * dz <= CFG.interactDist * CFG.interactDist;
        }

        function isNearDamaSpot(px, pz) {
            const spot = getDamaSpotPos();
            const dx = px - spot.x;
            const dz = pz - spot.z;
            return dx * dx + dz * dz <= CFG.interactDist * CFG.interactDist;
        }

        function getChessSeat(color) {
            const spot = getChessSpotPos();
            // Tahta koordinatı: rank 1 (beyaz) küçük Z, rank 8 (siyah) büyük Z.
            // Bu yüzden beyaz oyuncu z− tarafta, siyah oyuncu z+ tarafta oturmalı.
            // Yaw: oyuncuyu masaya baktır (beyaz z− → +Z yönü, siyah z+ → −Z yönü).
            if (color === 'white') return { x: spot.x, z: spot.z - 3.2, yaw: Math.PI };
            return { x: spot.x, z: spot.z + 3.2, yaw: 0 };
        }

        /** Sunucu yourColor + white/black ile tutarlı beyaz/siyah koltuk */
        function normalizeChessPlayerColor(payload) {
            if (!payload) return 'white';
            const ycRaw = payload.yourColor;
            if (ycRaw != null && ycRaw !== '') {
                const yc = String(ycRaw).toLowerCase().trim();
                if (yc === 'black' || yc === 'white') return yc;
                if (yc === 'spectator') return 'white';
            }
            const uid = localUserId != null ? Number(localUserId) : null;
            const w = payload.white?.userId != null ? Number(payload.white.userId) : null;
            const b = payload.black?.userId != null ? Number(payload.black.userId) : null;
            if (uid != null && w != null && uid === w) return 'white';
            if (uid != null && b != null && uid === b) return 'black';
            return 'white';
        }

        function isLocalPlayerInActiveMatch(am) {
            if (!am || localUserId == null) return false;
            const uid = Number(localUserId);
            return uid === Number(am.whiteUserId) || uid === Number(am.blackUserId);
        }

        /** İzleyici: masanın yanından bakış (oyuncular z± tarafta) */
        function getChessSpectatorSeat() {
            const spot = getChessSpotPos();
            return { x: spot.x + 5.4, z: spot.z, yaw: Math.PI / 2 };
        }

        function getDamaSeat(color) {
            const spot = getDamaSpotPos();
            /* Dama masası dünya yönü satrançtan farklı; beyaz/siyah koltukları satrançla aynı sayılınca VR’da ters oturuluyordu. */
            if (color === 'white') return { x: spot.x, z: spot.z - 3.2, yaw: Math.PI };
            return { x: spot.x, z: spot.z + 3.2, yaw: 0 };
        }

        function getDamaSpectatorSeat() {
            const spot = getDamaSpotPos();
            return { x: spot.x - 5.4, z: spot.z, yaw: -Math.PI / 2 };
        }

        function normalizeDamaPlayerColor(payload) {
            return normalizeChessPlayerColor(payload);
        }

        function applyDamaTeleport() {
            if (!onlineDama.active) return;
            // Davranış:
            // - PC/mobil vs PC/mobil (mesaId=0): ışınlanma yok (overlay oynanır)
            // - VR masası üstünde oynanan maç (mesaId=1/2): PC/mobil oyuncu da masanın karşısına ışınlanabilir
            const mid = Number(onlineDama.mesaId ?? onlineDama.lastState?.mesaId ?? 0);
            if (!xrActive && mid === 0) return;
            const seat = getDamaSeat(
                normalizeDamaPlayerColor({
                    yourColor: onlineDama.myColor,
                    white: onlineDama.white,
                    black: onlineDama.black
                })
            );
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

        function applyDamaTeleportSpectator() {
            if (!onlineDama.watching) return;
            if (!xrActive) return;
            const seat = getDamaSpectatorSeat();
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

        function applyChessTeleportSpectator() {
            if (!onlineChess.watching) return;
            if (!xrActive) return;
            const seat = getChessSpectatorSeat();
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
            const go = document.getElementById('game-overlay');
            chessNotifyEl.style.top =
                go && go.classList.contains('active') ? 'max(72px, env(safe-area-inset-top, 0px) + 52px)' : '18px';
            chessNotifyEl.style.maxWidth = go && go.classList.contains('active') ? 'min(96vw, 520px)' : 'min(92vw, 480px)';
            chessNotifyEl.style.whiteSpace = 'normal';
            chessNotifyEl.style.textAlign = 'center';
            chessNotifyEl.style.lineHeight = '1.35';
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
                <div id="chess-res-sub" style="opacity:.88;line-height:1.45;margin-bottom:14px;white-space:pre-wrap;"></div>
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
                <div id="exit-confirm-title" style="font-weight:700;font-size:18px;margin-bottom:6px;">Çıkış</div>
                <div id="exit-confirm-sub" style="opacity:.88;line-height:1.4;margin-bottom:12px;">Çıkmak istediğine emin misin?</div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button id="chess-exit-no" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#dce8ff;cursor:pointer;">Çıkma</button>
                    <button id="chess-exit-yes" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,168,150,.35);background:rgba(255,88,56,.2);color:#ffd5cb;cursor:pointer;">Çık</button>
                </div>
            `;
            document.body.appendChild(root);
            root.querySelector('#chess-exit-no')?.addEventListener('click', () => {
                chessExitConfirmOpen = false;
                root.style.display = 'none';
            });
            root.querySelector('#chess-exit-yes')?.addEventListener('click', () => {
                if (onlineDama.active || onlineDama.watching) {
                    const mid = onlineDama.matchId;
                    if (onlineDama.watching) {
                        if (mid != null) mpClient?.leaveDamaWatch?.(mid);
                        onlineDama.watching = false;
                        onlineDama.matchId = null;
                        onlineDama.lastState = null;
                        clearVrDama();
                        endGame(-1);
                    } else if (mid && mpClient?.confirmExitDamaMatch) {
                        // Çıkış = otomatik kayıp. Sonuç paketini beklemeden UI'ı hemen göster.
                        const w = onlineDama.white;
                        const b = onlineDama.black;
                        let winnerUid = null;
                        let winnerName = 'Rakip';
                        if (w && b && localUserId != null) {
                            if (Number(w.userId) === Number(localUserId)) {
                                winnerUid = b.userId;
                                winnerName = String(b.username || 'Rakip');
                            } else {
                                winnerUid = w.userId;
                                winnerName = String(w.username || 'Rakip');
                            }
                        }
                        mpClient.confirmExitDamaMatch(mid);
                        onlineDama.exiting = true;
                        onlineDama.active = false;
                        // matchId kalsın: sonuç paketi gelince doğru finalize çalışsın.
                        onlineDama.lastState = null;
                        finalizeDamaMatchFromServer({
                            matchId: mid,
                            winnerUserId: winnerUid != null ? Number(winnerUid) : null,
                            winnerUsername: winnerName,
                            reason: 'exit',
                            message: `Ayrıldın. ${winnerName} kazandı.`
                        });
                    }
                    mpClient?.getDamaQueue?.();
                } else {
                    const mid = onlineChess.matchId;
                    if (onlineChess.watching) {
                        if (mid != null) mpClient?.leaveChessWatch?.(mid);
                        onlineChess.watching = false;
                        onlineChess.matchId = null;
                        onlineChess.lastState = null;
                        clearVrChess();
                        endGame(-1);
                    } else if (mid && mpClient?.confirmExitMatch) {
                        const w = onlineChess.white;
                        const b = onlineChess.black;
                        let winnerUid = null;
                        let winnerName = 'Rakip';
                        if (w && b && localUserId != null) {
                            if (Number(w.userId) === Number(localUserId)) {
                                winnerUid = b.userId;
                                winnerName = String(b.username || 'Rakip');
                            } else {
                                winnerUid = w.userId;
                                winnerName = String(w.username || 'Rakip');
                            }
                        }
                        mpClient.confirmExitMatch(mid);
                        onlineChess.exiting = true;
                        onlineChess.active = false;
                        onlineChess.lastState = null;
                        finalizeChessMatchFromServer({
                            matchId: mid,
                            winnerUserId: winnerUid != null ? Number(winnerUid) : null,
                            winnerUsername: winnerName,
                            reason: 'exit',
                            message: `Ayrıldın. ${winnerName} kazandı.`
                        });
                    }
                    mpClient?.getChessQueue?.();
                }
                chessExitConfirmOpen = false;
                root.style.display = 'none';
            });
            chessExitConfirmEl = root;
            return root;
        }

        function openChessExitConfirm() {
            const inBoardZone =
                onlineChess.active ||
                onlineChess.watching ||
                onlineDama.active ||
                onlineDama.watching;
            if (!inBoardZone || chessExitConfirmOpen) return;
            // VR'da HTML modal görünmez; VR içinde ayrı bir pencere göster.
            if (xrActive) {
                chessExitConfirmOpen = true;
                initVrChessExitWindow();
                attachVrChessExitHud();
                updateVrChessExitWindow();
                snapVrChessExitWindowToView();
                if (vrChessExitWindow) {
                    vrChessExitWindow.visible = true;
                    vrChessExitWindow.frustumCulled = false;
                }
                requestAnimationFrame(() => {
                    if (!chessExitConfirmOpen || !vrChessExitWindow?.visible) return;
                    attachVrChessExitHud();
                    updateVrChessExitWindow();
                    snapVrChessExitWindowToView();
                });
                return;
            }
            const root = ensureChessExitConfirm();
            const title = root.querySelector('#exit-confirm-title');
            const sub = root.querySelector('#exit-confirm-sub');
            const yesBtn = root.querySelector('#chess-exit-yes');
            const noBtn = root.querySelector('#chess-exit-no');
            if (onlineDama.active) {
                if (title) title.textContent = 'Dama maçından çık';
                if (sub) sub.textContent = 'Emin misin? Çıkarsan kaybedeceksin ve puanın düşecek.';
                if (yesBtn) yesBtn.textContent = 'Çık';
                if (noBtn) noBtn.textContent = 'Çıkma';
            } else if (onlineChess.active) {
                if (title) title.textContent = 'Satranç maçından çık';
                if (sub) sub.textContent = 'Emin misin? Çıkarsan kaybedeceksin ve puanın düşecek.';
                if (yesBtn) yesBtn.textContent = 'Çık';
                if (noBtn) noBtn.textContent = 'Çıkma';
            } else {
                if (title) title.textContent = 'İzlemeyi bırak';
                if (sub) sub.textContent = 'İzlemeyi bırakmak istiyor musun?';
                if (yesBtn) yesBtn.textContent = 'Bırak';
                if (noBtn) noBtn.textContent = 'Vazgeç';
            }
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

        function snapVrChessResultWindowToView() {
            if (!vrChessResultWindow || !xrRig || !renderer?.xr || !camera) return;
            const xrCam = renderer.xr.getCamera(camera);
            if (!xrCam) return;
            const camPos = new THREE.Vector3();
            const fwd = new THREE.Vector3();
            xrCam.getWorldPosition(camPos);
            xrCam.getWorldDirection(fwd);
            const targetWorld = camPos.clone()
                .add(fwd.multiplyScalar(VR_CHESS_RESULT_PANEL_DIST))
                .add(new THREE.Vector3(0, -0.10, 0));
            const targetLocal = xrRig.worldToLocal(targetWorld.clone());
            vrChessResultWindow.position.copy(targetLocal);
            // lookAt dünya uzayında hedef ister (vrSpot ile aynı); worldToLocal vermek yüzü ters çevirir.
            vrChessResultWindow.lookAt(camPos);
        }

        function snapVrChessExitWindowToView() {
            if (!vrChessExitWindow || !xrRig || !renderer?.xr || !camera) return;
            const xrCam = renderer.xr.getCamera(camera);
            if (!xrCam) return;
            const camPos = new THREE.Vector3();
            const fwd = new THREE.Vector3();
            xrCam.getWorldPosition(camPos);
            xrCam.getWorldDirection(fwd);
            const targetWorld = camPos.clone()
                .add(fwd.multiplyScalar(1.7))
                .add(new THREE.Vector3(0, -0.10, 0));
            const targetLocal = xrRig.worldToLocal(targetWorld.clone());
            vrChessExitWindow.position.copy(targetLocal);
            vrChessExitWindow.lookAt(camPos);
        }

        function updateVrChessExitTransform(dt) {
            if (!isVrSessionPresenting() || !chessExitConfirmOpen || !vrChessExitWindow || !vrChessExitWindow.visible || !xrRig) return;
            if (!renderer?.xr || !camera) return;
            const xrCam = renderer.xr.getCamera(camera);
            if (!xrCam) return;

            const camPos = new THREE.Vector3();
            const fwd = new THREE.Vector3();
            xrCam.getWorldPosition(camPos);
            xrCam.getWorldDirection(fwd);

            const targetWorld = camPos.clone()
                .add(fwd.multiplyScalar(1.7))
                .add(new THREE.Vector3(0, -0.10, 0));

            const targetLocal = xrRig.worldToLocal(targetWorld.clone());

            const k = 1 - Math.exp(-dt * 10);
            vrChessExitWindow.position.x += (targetLocal.x - vrChessExitWindow.position.x) * k;
            vrChessExitWindow.position.y += (targetLocal.y - vrChessExitWindow.position.y) * k;
            vrChessExitWindow.position.z += (targetLocal.z - vrChessExitWindow.position.z) * k;

            vrChessExitWindow.lookAt(camPos);
        }

        /** Çıkış onay paneli — sonuç paneli ile aynı: yalnızca xrRig, kafa önü. */
        function attachVrChessExitHud() {
            if (!vrChessExitWindow || !xrRig) return;
            if (vrChessExitWindow.parent && vrChessExitWindow.parent !== xrRig) {
                vrChessExitWindow.parent.remove(vrChessExitWindow);
            }
            if (vrChessExitWindow.parent !== xrRig) {
                xrRig.add(vrChessExitWindow);
            }
            vrChessExitWindow.scale.setScalar(0.44);
        }

        /** Sonuç paneli her kare xrRig üzerinde kafa önüne taşınır (updateVrChessResultTransform). Kameraya parent vermeyin — stereo’da yüzü dönük kalmaz. */
        function attachVrChessResultHud() {
            if (!vrChessResultWindow || !xrRig) return;
            if (vrChessResultWindow.parent && vrChessResultWindow.parent !== xrRig) {
                vrChessResultWindow.parent.remove(vrChessResultWindow);
            }
            if (vrChessResultWindow.parent !== xrRig) {
                xrRig.add(vrChessResultWindow);
            }
            vrChessResultWindow.scale.setScalar(VR_CHESS_RESULT_HUD_SCALE);
        }

        function wireVrChessResultDomButtonOnce() {
            if (vrChessResultDomBtnWired) return;
            const ok = document.getElementById('vr-chess-result-dom-ok');
            if (!ok) return;
            vrChessResultDomBtnWired = true;
            ok.addEventListener('click', () => {
                vrInputCooldownUntil = performance.now() + 450;
                if (lastVrBoardGameOverlayKind === 'da') {
                    softResetDamaForReplay();
                } else {
                    softResetChessForReplay();
                }
            });
        }

        function showVrChessResultDomOverlay(title, sub) {
            wireVrChessResultDomButtonOnce();
            const ov = document.getElementById('vr-chess-result-dom-overlay');
            const tEl = document.getElementById('vr-chess-result-dom-title');
            const sEl = document.getElementById('vr-chess-result-dom-sub');
            if (tEl) tEl.textContent = title || 'Oyun bitti';
            if (sEl) sEl.textContent = sub || '';
            if (ov) {
                ov.style.display = 'flex';
                ov.style.pointerEvents = 'auto';
            }
        }

        function hideVrChessResultDomOverlay() {
            const ov = document.getElementById('vr-chess-result-dom-overlay');
            if (ov) {
                ov.style.display = 'none';
                ov.style.pointerEvents = 'none';
            }
        }

        function openVrChessResult({
            title = '',
            sub = '',
            leaderboardBlock = '',
            fetchChessRankFallback = false,
            boardKind = 'ch'
        } = {}) {
            lastVrBoardGameOverlayKind = boardKind === 'da' ? 'da' : 'ch';
            vrChessResultText = String(title || '');
            vrChessResultSub = String(sub || '');
            vrChessResultLeaderboardBlock = String(leaderboardBlock || '');
            vrChessResultOpen = true;
            const domSub =
                vrChessResultSub && vrChessResultLeaderboardBlock
                    ? `${vrChessResultSub}\n\n${vrChessResultLeaderboardBlock}`
                    : vrChessResultSub || vrChessResultLeaderboardBlock;
            showVrChessResultDomOverlay(vrChessResultText, domSub);
            if (!xrRig) {
                showChessNotice(`${vrChessResultText} — ${String(domSub || '').slice(0, 200)}`, 25000);
                return;
            }
            if (fetchChessRankFallback && !vrChessResultLeaderboardBlock) {
                const uid = localUserId != null ? Number(localUserId) : null;
                const req =
                    lastVrBoardGameOverlayKind === 'da'
                        ? Number.isFinite(uid) && uid > 0
                            ? getDamaLeaderboardRankByUser(uid)
                            : getDamaLeaderboardRank(leaderboardSaveName())
                        : Number.isFinite(uid) && uid > 0
                          ? getChessLeaderboardRankByUser(uid)
                          : getChessLeaderboardRank(leaderboardSaveName());
                req
                    .then((rr) => {
                        if (!vrChessResultOpen || rr?.rank == null) return;
                        const elo = Math.round(Number(rr.elo) || 1500);
                        const w = Number(rr.wins) || 0;
                        const l = Number(rr.losses) || 0;
                        const d = Number(rr.draws) || 0;
                        const g = Number(rr.games) || 0;
                        const tp = Number(rr.total_players) || 0;
                        vrChessResultLeaderboardBlock = [
                            `Elo ${elo} · G${w} M${l}${d ? ` B${d}` : ''} · ${g} oyun`,
                            tp > 0 ? `Sıra ${rr.rank}/${tp}.` : `Sıra ${rr.rank}.`
                        ].join('\n');
                        updateVrChessResultWindow();
                    })
                    .catch(() => {});
            }
            initVrChessResultWindow();
            updateVrChessResultWindow();
            attachVrChessResultHud();
            if (vrChessResultWindow) {
                vrChessResultWindow.visible = true;
                vrChessResultWindow.frustumCulled = false;
                snapVrChessResultWindowToView();
            }
            requestAnimationFrame(() => {
                if (!vrChessResultOpen) return;
                updateVrChessResultWindow();
                attachVrChessResultHud();
                if (vrChessResultWindow?.visible) snapVrChessResultWindowToView();
            });
        }

        function closeVrChessResult() {
            vrChessResultOpen = false;
            vrChessResultLeaderboardBlock = '';
            hideVrChessResultDomOverlay();
            if (vrChessResultWindow) {
                vrChessResultWindow.visible = false;
                if (camera && vrChessResultWindow.parent === camera && xrRig) {
                    camera.remove(vrChessResultWindow);
                    xrRig.add(vrChessResultWindow);
                }
                if (xrRig && vrChessResultWindow.parent === xrRig) {
                    vrChessResultWindow.position.set(0, 1.32, -1.72);
                    vrChessResultWindow.rotation.set(0, 0, 0);
                    vrChessResultWindow.scale.setScalar(1);
                }
            }
            vrChessResultPointerLeft = null;
            vrChessResultPointerRight = null;
        }

        function closeVrChessCheckNotice() {
            vrChessCheckOpen = false;
            vrChessCheckText = '';
            vrChessCheckPointerLeft = null;
            vrChessCheckPointerRight = null;
            if (vrChessCheckWindow) {
                vrChessCheckWindow.visible = false;
                if (xrRig && vrChessCheckWindow.parent === xrRig) {
                    vrChessCheckWindow.position.set(0, 1.32, -1.72);
                    vrChessCheckWindow.scale.setScalar(1);
                }
            }
        }

        function openVrChessCheckNotice(line) {
            const t = String(line || '').trim();
            if (!t || !xrRig || vrChessResultOpen) return;
            vrChessCheckText = t;
            vrChessCheckOpen = true;
            initVrChessCheckWindow();
            updateVrChessCheckWindow();
            attachVrChessCheckHud();
            if (vrChessCheckWindow) {
                vrChessCheckWindow.visible = true;
                vrChessCheckWindow.frustumCulled = false;
                snapVrChessCheckWindowToView();
            }
            requestAnimationFrame(() => {
                if (!vrChessCheckOpen) return;
                updateVrChessCheckWindow();
                attachVrChessCheckHud();
                if (vrChessCheckWindow?.visible) snapVrChessCheckWindowToView();
            });
        }

        function initVrChessCheckWindow() {
            if (vrChessCheckWindow || !xrRig) return;
            vrChessCheckCanvas = document.createElement('canvas');
            vrChessCheckCanvas.width = 720;
            vrChessCheckCanvas.height = 380;
            vrChessCheckCtx = vrChessCheckCanvas.getContext('2d');
            vrChessCheckTexture = new THREE.CanvasTexture(vrChessCheckCanvas);
            const mat = new THREE.MeshBasicMaterial({
                map: vrChessCheckTexture,
                transparent: true,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false
            });
            vrChessCheckWindow = new THREE.Mesh(makeCurvedMenuGeometry(1.22, 0.58, 22, 0.17), mat);
            vrChessCheckWindow.position.set(0, 1.28, -1.65);
            vrChessCheckWindow.renderOrder = 997;
            vrChessCheckWindow.visible = false;
            xrRig.add(vrChessCheckWindow);
        }

        function attachVrChessCheckHud() {
            if (!vrChessCheckWindow || !xrRig) return;
            if (vrChessCheckWindow.parent && vrChessCheckWindow.parent !== xrRig) {
                vrChessCheckWindow.parent.remove(vrChessCheckWindow);
            }
            if (vrChessCheckWindow.parent !== xrRig) {
                xrRig.add(vrChessCheckWindow);
            }
            vrChessCheckWindow.scale.setScalar(VR_CHESS_CHECK_HUD_SCALE);
        }

        function snapVrChessCheckWindowToView() {
            if (!vrChessCheckWindow || !xrRig || !renderer?.xr || !camera) return;
            const xrCam = renderer.xr.getCamera(camera);
            if (!xrCam) return;
            const camPos = new THREE.Vector3();
            const fwd = new THREE.Vector3();
            xrCam.getWorldPosition(camPos);
            xrCam.getWorldDirection(fwd);
            const targetWorld = camPos.clone()
                .add(fwd.multiplyScalar(VR_CHESS_CHECK_PANEL_DIST))
                .add(new THREE.Vector3(0, -0.06, 0));
            const targetLocal = xrRig.worldToLocal(targetWorld.clone());
            vrChessCheckWindow.position.copy(targetLocal);
            vrChessCheckWindow.lookAt(camPos);
        }

        function updateVrChessCheckTransform(dt) {
            if (!isVrSessionPresenting() || !vrChessCheckOpen || !vrChessCheckWindow || !vrChessCheckWindow.visible || !xrRig) {
                return;
            }
            if (!renderer?.xr || !camera) return;
            const xrCam = renderer.xr.getCamera(camera);
            if (!xrCam) return;
            const camPos = new THREE.Vector3();
            const fwd = new THREE.Vector3();
            xrCam.getWorldPosition(camPos);
            xrCam.getWorldDirection(fwd);
            const targetWorld = camPos.clone()
                .add(fwd.multiplyScalar(VR_CHESS_CHECK_PANEL_DIST))
                .add(new THREE.Vector3(0, -0.06, 0));
            const targetLocal = xrRig.worldToLocal(targetWorld.clone());
            const k = 1 - Math.exp(-dt * 10);
            vrChessCheckWindow.position.x += (targetLocal.x - vrChessCheckWindow.position.x) * k;
            vrChessCheckWindow.position.y += (targetLocal.y - vrChessCheckWindow.position.y) * k;
            vrChessCheckWindow.position.z += (targetLocal.z - vrChessCheckWindow.position.z) * k;
            vrChessCheckWindow.lookAt(camPos);
        }

        function updateVrChessCheckWindow() {
            if (!vrChessCheckCtx || !vrChessCheckTexture || !vrChessCheckCanvas) return;
            const c = vrChessCheckCtx;
            const W = vrChessCheckCanvas.width;
            const H = vrChessCheckCanvas.height;
            c.clearRect(0, 0, W, H);
            c.fillStyle = 'rgba(10, 18, 32, 0.94)';
            c.fillRect(0, 0, W, H);
            c.strokeStyle = 'rgba(255, 200, 120, 0.55)';
            c.lineWidth = 4;
            c.strokeRect(10, 10, W - 20, H - 20);
            c.fillStyle = '#ffe8c8';
            c.font = 'bold 34px Segoe UI, Arial, sans-serif';
            const maxW = W - 56;
            let subY = wrapCanvasText(c, vrChessCheckText || 'ŞAH', 28, 64, maxW, 38);
            const btnW = Math.min(400, W - 56);
            const btnH = 88;
            const btnX = (W - btnW) / 2;
            const btnY = Math.max(200, subY + 36);
            c.fillStyle = 'rgba(64, 168, 98, 0.35)';
            c.fillRect(btnX, btnY, btnW, btnH);
            c.strokeStyle = 'rgba(126, 255, 164, 0.9)';
            c.lineWidth = 3;
            c.strokeRect(btnX, btnY, btnW, btnH);
            c.fillStyle = '#eaffef';
            c.font = 'bold 40px Arial';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('TAMAM', btnX + btnW / 2, btnY + btnH / 2 + 2);
            c.textAlign = 'left';
            c.textBaseline = 'alphabetic';
            vrChessCheckHitOk = { x: btnX, y: btnY, w: btnW, h: btnH };
            c.fillStyle = '#8ec8ff';
            c.font = '18px Arial';
            c.fillText('Tetik ile kapat', 28, H - 22);
            if (vrChessCheckPointerLeft) {
                c.beginPath();
                c.strokeStyle = '#59c7ff';
                c.lineWidth = 3;
                c.arc(vrChessCheckPointerLeft.x, vrChessCheckPointerLeft.y, 12, 0, Math.PI * 2);
                c.stroke();
            }
            if (vrChessCheckPointerRight) {
                c.beginPath();
                c.strokeStyle = '#8cff8c';
                c.lineWidth = 3;
                c.arc(vrChessCheckPointerRight.x, vrChessCheckPointerRight.y, 12, 0, Math.PI * 2);
                c.stroke();
            }
            vrChessCheckTexture.needsUpdate = true;
        }

        function getVrChessCheckHit(src, session) {
            if (!vrChessCheckOpen || !vrChessCheckWindow?.visible || !vrChessCheckCanvas) return null;
            const ctrl = getVrControllerForSource(session, src);
            if (!ctrl) return null;
            const origin = new THREE.Vector3();
            const dir = new THREE.Vector3();
            vrControllerRayWorld(ctrl, origin, dir);
            const hit = new THREE.Raycaster(origin, dir).intersectObject(vrChessCheckWindow, false)[0];
            if (!hit?.uv) return null;
            return {
                x: hit.uv.x * vrChessCheckCanvas.width,
                y: (1 - hit.uv.y) * vrChessCheckCanvas.height
            };
        }

        function clickVrChessCheckAt(hit) {
            if (!hit || !vrChessCheckOpen || !vrChessCheckCanvas) return false;
            const ok = vrChessCheckHitOk;
            const inOk = hit.x >= ok.x && hit.x <= ok.x + ok.w && hit.y >= ok.y && hit.y <= ok.y + ok.h;
            if (!inOk) return false;
            vrInputCooldownUntil = performance.now() + 350;
            closeVrChessCheckNotice();
            return true;
        }

        /** Uzun sonuç metnini canvas'ta satırlara böler; son çizilen satırın Y'si. \n ile paragraflar. */
        function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
            let yy = y;
            let lastY = y;
            const paras = String(text).split(/\n/);
            for (let p = 0; p < paras.length; p++) {
                const chunk = paras[p].trim();
                if (!chunk) {
                    yy += lineHeight * 0.45;
                    continue;
                }
                const words = chunk.split(/\s+/);
                let line = '';
                for (let n = 0; n < words.length; n++) {
                    const testLine = line + words[n] + ' ';
                    if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
                        ctx.fillText(line.trim(), x, yy);
                        lastY = yy;
                        line = `${words[n]} `;
                        yy += lineHeight;
                    } else {
                        line = testLine;
                    }
                }
                if (line.trim()) {
                    ctx.fillText(line.trim(), x, yy);
                    lastY = yy;
                    yy += lineHeight;
                }
            }
            return lastY;
        }

        function initVrChessResultWindow() {
            if (vrChessResultWindow || !xrRig) return;
            vrChessResultCanvas = document.createElement('canvas');
            vrChessResultCanvas.width = 900;
            vrChessResultCanvas.height = IS_QUEST ? 680 : 600;
            vrChessResultCtx = vrChessResultCanvas.getContext('2d');
            vrChessResultTexture = new THREE.CanvasTexture(vrChessResultCanvas);
            const mat = new THREE.MeshBasicMaterial({
                map: vrChessResultTexture,
                transparent: true,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false
            });
            vrChessResultWindow = new THREE.Mesh(makeCurvedMenuGeometry(1.52, 0.70, 26, 0.19), mat);
            vrChessResultWindow.position.set(0, 1.32, -1.72);
            vrChessResultWindow.renderOrder = 999;
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
            // Web'deki chess result modal / ESC paneli ile aynı çizgi: ince mavi çerçeve
            const pad = 12;
            c.strokeStyle = 'rgba(150,185,255,.45)';
            c.lineWidth = 5;
            c.strokeRect(pad + 2, pad + 2, W - (pad + 2) * 2, H - (pad + 2) * 2);

            const titlePx = IS_QUEST ? 34 : 38;
            const subPx = IS_QUEST ? 19 : 21;
            const lbPx = IS_QUEST ? 18 : 20;
            const subLH = IS_QUEST ? 26 : 28;
            const lbLH = IS_QUEST ? 23 : 25;
            c.fillStyle = '#e7f0ff';
            c.font = `bold ${titlePx}px Segoe UI, Arial, sans-serif`;
            c.fillText(vrChessResultText || 'Oyun bitti', 32, 68);
            c.fillStyle = 'rgba(231,240,255,.9)';
            c.font = `${subPx}px Segoe UI, Arial, sans-serif`;
            let subBottomY = 108;
            if (vrChessResultSub) {
                const maxW = W - 64;
                subBottomY = wrapCanvasText(c, String(vrChessResultSub), 32, 108, maxW, subLH);
            }
            if (vrChessResultLeaderboardBlock) {
                c.fillStyle = 'rgba(160, 210, 255, 0.95)';
                c.font = `${lbPx}px Segoe UI, Arial, sans-serif`;
                subBottomY += 10;
                const maxW = W - 64;
                subBottomY = wrapCanvasText(c, String(vrChessResultLeaderboardBlock), 32, subBottomY + subLH, maxW, lbLH);
            }

            const btnW = Math.min(460, W - 64);
            const btnH = IS_QUEST ? 92 : 100;
            const btnX = (W - btnW) / 2;
            const btnY = Math.min(H - btnH - 36, Math.max(180, subBottomY + 22));
            c.fillStyle = 'rgba(64, 168, 98, 0.30)';
            c.fillRect(btnX, btnY, btnW, btnH);
            c.strokeStyle = 'rgba(126, 255, 164, 0.92)';
            c.lineWidth = 3;
            c.strokeRect(btnX, btnY, btnW, btnH);
            c.fillStyle = '#eaffef';
            c.font = 'bold 44px Arial';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText('TAMAM', btnX + btnW / 2, btnY + btnH / 2 + 2);
            c.textAlign = 'left';
            c.textBaseline = 'alphabetic';

            vrChessResultHitOk = { x: btnX, y: btnY, w: btnW, h: btnH };

            c.fillStyle = '#9ed3ff';
            c.font = `${IS_QUEST ? 17 : 19}px Arial`;
            c.fillText('Tetik / tık: Tamam', 32, H - 22);

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
            if (!isVrSessionPresenting() || !vrChessResultOpen || !vrChessResultWindow || !vrChessResultWindow.visible || !xrRig) return;
            if (!renderer?.xr || !camera) return;
            const xrCam = renderer.xr.getCamera(camera);
            if (!xrCam) return;

            const camPos = new THREE.Vector3();
            const fwd = new THREE.Vector3();
            xrCam.getWorldPosition(camPos);
            xrCam.getWorldDirection(fwd);

            const targetWorld = camPos.clone()
                .add(fwd.multiplyScalar(VR_CHESS_RESULT_PANEL_DIST))
                .add(new THREE.Vector3(0, -0.10, 0));

            // xrRig local uzayına çevir.
            const targetLocal = xrRig.worldToLocal(targetWorld.clone());

            const k = 1 - Math.exp(-dt * 10);
            vrChessResultWindow.position.x += (targetLocal.x - vrChessResultWindow.position.x) * k;
            vrChessResultWindow.position.y += (targetLocal.y - vrChessResultWindow.position.y) * k;
            vrChessResultWindow.position.z += (targetLocal.z - vrChessResultWindow.position.z) * k;

            vrChessResultWindow.lookAt(camPos);
        }

        function getVrChessResultHit(src, session) {
            if (!vrChessResultOpen || !vrChessResultWindow?.visible || !vrChessResultCanvas) return null;
            const ctrl = getVrControllerForSource(session, src);
            if (!ctrl) return null;
            const origin = new THREE.Vector3();
            const dir = new THREE.Vector3();
            vrControllerRayWorld(ctrl, origin, dir);
            const hit = new THREE.Raycaster(origin, dir).intersectObject(vrChessResultWindow, false)[0];
            if (!hit?.uv) return null;
            return {
                x: hit.uv.x * vrChessResultCanvas.width,
                y: (1 - hit.uv.y) * vrChessResultCanvas.height
            };
        }

        function clickVrChessResultAt(hit) {
            if (!hit || !vrChessResultOpen || !vrChessResultCanvas) return false;
            const ok = vrChessResultHitOk;
            const inOk = hit.x >= ok.x && hit.x <= ok.x + ok.w && hit.y >= ok.y && hit.y <= ok.y + ok.h;
            if (!inOk) return false;
            vrInputCooldownUntil = performance.now() + 450;
            if (lastVrBoardGameOverlayKind === 'da') softResetDamaForReplay();
            else softResetChessForReplay();
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
            const exitBoardTitle =
                onlineDama.active || onlineDama.watching ? 'Dama Alanı Dışı' : 'Satranç Alanı Dışı';
            c.fillText(exitBoardTitle, 36, 62);
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
            vrControllerRayWorld(ctrl, origin, dir);
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
                closeChessExitConfirm();
                if (onlineDama.active || onlineDama.watching) {
                    const mid = onlineDama.matchId;
                    if (onlineDama.watching) {
                        if (mid != null) mpClient?.leaveDamaWatch?.(mid);
                        onlineDama.watching = false;
                        onlineDama.matchId = null;
                        onlineDama.lastState = null;
                        clearVrDama();
                        endGame(-1);
                        mpClient?.getDamaQueue?.();
                        vrInputCooldownUntil = performance.now() + 450;
                        return true;
                    }
                    onlineDama.exiting = true;
                    onlineDama.active = false;
                    const w = onlineDama.white;
                    const b = onlineDama.black;
                    let winnerUid = null;
                    let winnerName = 'Rakip';
                    if (w && b && localUserId != null) {
                        if (Number(w.userId) === Number(localUserId)) {
                            winnerUid = b.userId;
                            winnerName = String(b.username || 'Rakip');
                        } else {
                            winnerUid = w.userId;
                            winnerName = String(w.username || 'Rakip');
                        }
                    }
                    if (isVrSessionPresenting()) {
                        if (mid != null) {
                            finalizeDamaMatchFromServer({
                                matchId: mid,
                                winnerUserId: winnerUid != null ? Number(winnerUid) : null,
                                winnerUsername: winnerName,
                                reason: 'exit',
                                message: `Ayrıldın. ${winnerName} kazandı.`
                            });
                        } else {
                            openVrChessResult({
                                title: 'Alandan ayrıldın',
                                sub: winnerName ? `${winnerName} kazandı.` : 'Rakip kazandı.',
                                boardKind: 'da'
                            });
                            endGame(-1);
                        }
                    }
                    if (mid && mpClient?.confirmExitDamaMatch) mpClient.confirmExitDamaMatch(mid);
                    mpClient?.getDamaQueue?.();
                    vrInputCooldownUntil = performance.now() + 450;
                    return true;
                }
                const mid = onlineChess.matchId;
                if (onlineChess.watching) {
                    if (mid != null) mpClient?.leaveChessWatch?.(mid);
                    onlineChess.watching = false;
                    onlineChess.matchId = null;
                    onlineChess.lastState = null;
                    clearVrChess();
                    endGame(-1);
                    mpClient?.getChessQueue?.();
                    vrInputCooldownUntil = performance.now() + 450;
                    return true;
                }
                onlineChess.exiting = true;
                onlineChess.active = false;
                const w = onlineChess.white;
                const b = onlineChess.black;
                let winnerUid = null;
                let winnerName = 'Rakip';
                if (w && b && localUserId != null) {
                    if (Number(w.userId) === Number(localUserId)) {
                        winnerUid = b.userId;
                        winnerName = String(b.username || 'Rakip');
                    } else {
                        winnerUid = w.userId;
                        winnerName = String(w.username || 'Rakip');
                    }
                }
                // VR: endGame(-1) hemen çağrılırsa çevrimiçi dal sonuç paneli açmıyor ve tahta kalabiliyor.
                // Sunucu mesajı gecikse bile finalize ile tahta temizlenir ve HUD sonucu gösterilir.
                if (isVrSessionPresenting()) {
                    if (mid != null) {
                        finalizeChessMatchFromServer({
                            matchId: mid,
                            winnerUserId: winnerUid != null ? Number(winnerUid) : null,
                            winnerUsername: winnerName,
                            reason: 'exit',
                            message: `Ayrıldın. ${winnerName} kazandı.`
                        });
                    } else {
                        openVrChessResult({
                            title: 'Alandan ayrıldın',
                            sub: winnerName ? `${winnerName} kazandı.` : 'Rakip kazandı.'
                        });
                        endGame(-1);
                    }
                }
                if (mid && mpClient?.confirmExitMatch) mpClient.confirmExitMatch(mid);
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
            if (onlineChess.active || onlineChess.watching) {
                const spot = getChessSpotPos();
                const dx = x - spot.x;
                const dz = z - spot.z;
                if (dx * dx + dz * dz > 8.3 * 8.3) return false;
            }
            if (onlineDama.active || onlineDama.watching) {
                const spot = getDamaSpotPos();
                const dx = x - spot.x;
                const dz = z - spot.z;
                if (dx * dx + dz * dz > 8.3 * 8.3) return false;
            }
            return true;
        }

        /** İstek Oluştur / Şimdi Oynayın — kullanıcı paneli kapatıp gezebilsin (web / mobil / VR). */
        function shouldShowChessSpotKapatButton() {
            if (activeSpot?.game !== 'ch') return false;
            if (onlineChess.active || onlineChess.watching || onlineChess.queued) return false;
            if (xrActive && onlineChess.activeMatch && !isLocalPlayerInActiveMatch(onlineChess.activeMatch)) return false;
            return true;
        }

        function shouldShowDamaSpotKapatButton() {
            if (activeSpot?.game !== 'da') return false;
            if (onlineDama.active || onlineDama.watching || onlineDama.queued) return false;
            if (xrActive && onlineDama.activeMatch && !isLocalPlayerInActiveMatch(onlineDama.activeMatch)) return false;
            return true;
        }

        function dismissChessSpotPanel() {
            refusedSpot = activeSpot;
            activeSpot = null;
            const ip = document.getElementById('interact-prompt');
            if (ip) ip.style.display = 'none';
            if (vrSpotWindow) vrSpotWindow.visible = false;
        }

        function dismissDamaSpotPanel() {
            dismissChessSpotPanel();
        }

        function getVrSpotPlayAreaLayout() {
            const W = vrSpotCanvas.width;
            const playX = 36;
            const playW = W - 72;
            const playY = 156;
            const vrQueueConflict =
                (activeSpot?.game === 'ch' && onlineDama.queued) ||
                (activeSpot?.game === 'da' && onlineChess.queued);
            if (vrQueueConflict) {
                return { playX, playY, playW, playH: 172, closeY: null, closeH: null, hasClose: false };
            }
            if (
                (activeSpot?.game === 'ch' && (shouldShowChessSpotKapatButton() || onlineChess.queued)) ||
                (activeSpot?.game === 'da' && (shouldShowDamaSpotKapatButton() || onlineDama.queued))
            ) {
                const playH = 108;
                const closeY = playY + playH + 8;
                const closeH = 58;
                return { playX, playY, playW, playH, closeY, closeH, hasClose: true };
            }
            return { playX, playY, playW, playH: 132, closeY: null, closeH: null, hasClose: false };
        }

        function updateChessQueueUi() {
            const noElReset = document.getElementById('ip-no');
            if (activeSpot?.game !== 'ch') {
                if (noElReset) {
                    noElReset.style.display = '';
                    noElReset.textContent = 'Hayır';
                }
                return;
            }
            const titleEl = document.getElementById('ip-title');
            const subEl = document.getElementById('ip-sub');
            const yesEl = document.getElementById('ip-yes');
            const noEl = document.getElementById('ip-no');
            if (!titleEl || !subEl || !yesEl || !noEl) return;
            noEl.style.display = 'none';
            if (onlineChess.active) {
                titleEl.textContent = 'Online satranç maçın aktif';
                subEl.textContent = `Renk: ${onlineChess.myColor === 'white' ? 'Beyaz' : 'Siyah'}`;
                yesEl.textContent = 'Maça Dön';
                return;
            }
            if (onlineChess.exiting) {
                titleEl.textContent = 'Çıkış işleniyor…';
                subEl.textContent = 'Maç sonuçlandırılıyor. Lütfen bekle.';
                yesEl.textContent = 'Kapat';
                noEl.style.display = 'none';
                return;
            }
            if (onlineChess.watching) {
                titleEl.textContent = 'Canlı maçı izliyorsun';
                subEl.textContent = 'Dünya tahtası canlı güncelleniyor.';
                yesEl.textContent = 'İzlemeye Devam';
                return;
            }
            if (onlineDama.queued) {
                titleEl.textContent = 'Zaten dama kuyruğundasın';
                subEl.textContent = 'Satranç kuyruğuna giremezsin; önce dama kuyruğundan çık.';
                yesEl.textContent = 'Kapat';
                noEl.style.display = 'none';
                return;
            }
            if (onlineChess.queued) {
                titleEl.textContent = 'Kuyrukta bekliyorsun';
                subEl.textContent = 'Beklerken kampüste gezmeye devam edebilirsin.';
                yesEl.textContent = 'Kuyruktan Çık';
                noEl.textContent = 'Kapat';
                noEl.style.display = '';
                return;
            }
            if (onlineChess.waitingPlayer && !isWaitingPlayerSelf()) {
                titleEl.textContent = `Kuyrukta: ${onlineChess.waitingPlayer.username}`;
                subEl.textContent = 'Oyuncu seni bekliyor';
                yesEl.textContent = 'Şimdi Oynayın';
                noEl.textContent = 'Kapat';
                noEl.style.display = '';
                return;
            }
            const am = onlineChess.activeMatch;
            // PC/mobil sanal masa (0): aktif maç olsa bile kuyruk serbest; "devam eden maç var" gösterme.
            if (xrActive && am && !isLocalPlayerInActiveMatch(am)) {
                titleEl.textContent = 'Devam eden maç var';
                subEl.textContent = 'Masadaki taşlar canlı güncellenir.';
                yesEl.textContent = 'Tamam';
                return;
            }
            titleEl.textContent = 'Online satranç oynamak ister misin?';
            subEl.textContent = 'Şu an oyun bekleyen kimse yok';
            yesEl.textContent = 'İstek Oluştur';
            noEl.textContent = 'Kapat';
            noEl.style.display = '';
        }

        function updateDamaQueueUi() {
            const noElReset = document.getElementById('ip-no');
            if (activeSpot?.game !== 'da') {
                if (noElReset) {
                    noElReset.style.display = '';
                    noElReset.textContent = 'Hayır';
                }
                return;
            }
            const titleEl = document.getElementById('ip-title');
            const subEl = document.getElementById('ip-sub');
            const yesEl = document.getElementById('ip-yes');
            const noEl = document.getElementById('ip-no');
            if (!titleEl || !subEl || !yesEl || !noEl) return;
            noEl.style.display = 'none';
            if (onlineDama.active) {
                titleEl.textContent = 'Online dama maçın aktif';
                subEl.textContent = `Renk: ${onlineDama.myColor === 'white' ? 'Beyaz' : 'Siyah'}`;
                yesEl.textContent = 'Maça Dön';
                return;
            }
            if (onlineDama.exiting) {
                titleEl.textContent = 'Çıkış işleniyor…';
                subEl.textContent = 'Maç sonuçlandırılıyor. Lütfen bekle.';
                yesEl.textContent = 'Kapat';
                noEl.style.display = 'none';
                return;
            }
            if (onlineDama.watching) {
                titleEl.textContent = 'Canlı dama maçını izliyorsun';
                subEl.textContent = 'Dünya tahtası canlı güncelleniyor.';
                yesEl.textContent = 'İzlemeye Devam';
                return;
            }
            if (onlineChess.queued) {
                titleEl.textContent = 'Zaten satranç kuyruğundasın';
                subEl.textContent = 'Dama kuyruğuna giremezsin; önce satranç kuyruğundan çık.';
                yesEl.textContent = 'Kapat';
                noEl.style.display = 'none';
                return;
            }
            if (onlineDama.queued) {
                titleEl.textContent = 'Dama kuyruğunda bekliyorsun';
                subEl.textContent = 'Beklerken kampüste gezmeye devam edebilirsin.';
                yesEl.textContent = 'Kuyruktan Çık';
                noEl.textContent = 'Kapat';
                noEl.style.display = '';
                return;
            }
            if (onlineDama.waitingPlayer && !isWaitingDamaPlayerSelf()) {
                titleEl.textContent = `Kuyrukta: ${onlineDama.waitingPlayer.username}`;
                subEl.textContent = 'Oyuncu seni bekliyor';
                yesEl.textContent = 'Şimdi Oynayın';
                noEl.textContent = 'Kapat';
                noEl.style.display = '';
                return;
            }
            const am = onlineDama.activeMatch;
            if (xrActive && am && !isLocalPlayerInActiveMatch(am)) {
                titleEl.textContent = 'Devam eden dama maçı var';
                subEl.textContent = 'Masadaki taşlar canlı güncellenir.';
                yesEl.textContent = 'Tamam';
                return;
            }
            titleEl.textContent = 'Online dama oynamak ister misin?';
            subEl.textContent = 'Şu an oyun bekleyen kimse yok';
            yesEl.textContent = 'İstek Oluştur';
            noEl.textContent = 'Kapat';
            noEl.style.display = '';
        }

        function isWaitingPlayerSelf() {
            const wp = onlineChess.waitingPlayer;
            if (!wp) return false;
            if (localUserId != null && Number(wp.userId) === Number(localUserId)) return true;
            const a = String(wp.username || '').trim().toLowerCase();
            const b = String(localNickname || '').trim().toLowerCase();
            return !!a && !!b && a === b;
        }

        function isWaitingDamaPlayerSelf() {
            const wp = onlineDama.waitingPlayer;
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
            const mid = mesaIdForQueueState({
                xrActive,
                activeSpotGame: activeSpot?.game,
                activeSpotMesaId: activeSpot?.mesaId,
                fallbackMesaId: onlineChess.mesaId ?? 1
            });
            mpClient.getChessQueue(mid);
        }

        function requestDamaQueueState(force = false) {
            if (!mpClient?.getDamaQueue) return;
            const now = performance.now();
            if (!force && now - damaQueueLastRequestAt < 850) return;
            damaQueueLastRequestAt = now;
            const mid = mesaIdForQueueState({
                xrActive,
                activeSpotGame: activeSpot?.game,
                activeSpotMesaId: activeSpot?.mesaId,
                fallbackMesaId: onlineDama.mesaId ?? 1
            });
            mpClient.getDamaQueue(mid);
        }

        function getVrSpotPrimaryButtonState() {
            if (activeSpot?.game === 'ch' && onlineDama.queued) {
                return {
                    label: 'KAPAT',
                    sub: 'Zaten dama kuyruğundasın. Satranç kuyruğuna girmek için önce dama kuyruğundan çık.',
                    mode: 'queue_conflict'
                };
            }
            if (activeSpot?.game === 'da' && onlineChess.queued) {
                return {
                    label: 'KAPAT',
                    sub: 'Zaten satranç kuyruğundasın. Dama kuyruğuna girmek için önce satranç kuyruğundan çık.',
                    mode: 'queue_conflict'
                };
            }
            if (activeSpot?.game === 'da') {
                if (onlineDama.active) {
                    return {
                        label: 'MACA DON',
                        sub: onlineDama.myColor === 'white' ? 'Rol: BEYAZ' : 'Rol: SIYAH',
                        mode: 'resume'
                    };
                }
                if (onlineDama.watching) {
                    return { label: 'IZLEME', sub: 'Canli dama', mode: 'watch_resume' };
                }
                if (onlineDama.queued) {
                    return { label: 'KUYRUKTAN CIK', sub: 'Beklerken kampuste gezebilirsin', mode: 'leave' };
                }
                if (onlineDama.waitingPlayer && !isWaitingDamaPlayerSelf()) {
                    return {
                        label: 'SIMDI OYNAYIN',
                        sub: `Kuyrukta: ${onlineDama.waitingPlayer.username}`,
                        mode: 'join'
                    };
                }
                const am = onlineDama.activeMatch;
                // Sadece VR masaları (1-2) "dolu" kabul edilir; PC/mobil sanal masa (0) paralel maçlara izin verir.
                if (xrActive && am && !isLocalPlayerInActiveMatch(am)) {
                    return { label: 'TAMAM', sub: 'Canli mac masada', mode: 'live_dismiss' };
                }
                return { label: 'ISTEK OLUSTUR', sub: 'Dama kuyrugu', mode: 'queue' };
            }
            if (activeSpot?.game !== 'ch') return { label: 'OYNA', sub: 'Oyunu baslat', mode: 'default' };
            if (onlineChess.active) {
                return { label: 'MACA DON', sub: onlineChess.myColor === 'white' ? 'Rol: BEYAZ' : 'Rol: SIYAH', mode: 'resume' };
            }
            if (onlineChess.watching) {
                return { label: 'IZLEME', sub: 'Canli mac', mode: 'watch_resume' };
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
            const am = onlineChess.activeMatch;
            if (xrActive && am && !isLocalPlayerInActiveMatch(am)) {
                return {
                    label: 'TAMAM',
                    sub: 'Canli mac masada',
                    mode: 'live_dismiss'
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
            // Davranış:
            // - PC/mobil vs PC/mobil (mesaId=0): ışınlanma yok (overlay oynanır)
            // - VR masası üstünde oynanan maç (mesaId=1/2): PC/mobil oyuncu da masanın karşısına ışınlanabilir
            const mid = Number(onlineChess.mesaId ?? onlineChess.lastState?.mesaId ?? 0);
            if (!xrActive && mid === 0) return;
            const seat = getChessSeat(
                normalizeChessPlayerColor({
                    yourColor: onlineChess.myColor,
                    white: onlineChess.white,
                    black: onlineChess.black
                })
            );
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

        function resolveChessMatchEndId(p) {
            const midSrc =
                p.matchId != null
                    ? p.matchId
                    : p.match_id != null
                      ? p.match_id
                      : onlineChess.matchId != null
                        ? onlineChess.matchId
                        : onlineChess.lastState?.matchId != null
                          ? onlineChess.lastState.matchId
                          : onlineChess3d?.matchId != null
                            ? onlineChess3d.matchId
                            : onlineChess3dViewport?.matchId != null
                              ? onlineChess3dViewport.matchId
                              : null;
            let mid = Number(midSrc);
            if (!Number.isFinite(mid) && midSrc != null) {
                const t = parseInt(String(midSrc).replace(/[^\d.-]/g, ''), 10);
                if (Number.isFinite(t)) mid = t;
            }
            return mid;
        }

        function resolveDamaMatchEndId(p) {
            const midSrc =
                p.matchId != null
                    ? p.matchId
                    : p.match_id != null
                      ? p.match_id
                      : onlineDama.matchId != null
                        ? onlineDama.matchId
                        : onlineDama.lastState?.matchId != null
                          ? onlineDama.lastState.matchId
                          : onlineDama3d?.matchId != null
                            ? onlineDama3d.matchId
                            : onlineDama3dViewport?.matchId != null
                              ? onlineDama3dViewport.matchId
                              : null;
            let mid = Number(midSrc);
            if (!Number.isFinite(mid) && midSrc != null) {
                const t = parseInt(String(midSrc).replace(/[^\d.-]/g, ''), 10);
                if (Number.isFinite(t)) mid = t;
            }
            return mid;
        }

        /** Yerel VR (VrChessStandalone) veya çevrimiçi VR (OnlineChess3D world) tahtası. */
        function getVrChessBoard() {
            return vrChessStandalone || (onlineChess3d?.runtime === 'world' ? onlineChess3d : null);
        }

        /** VR satranç oyunu aktif (tahta + hamle); G.gameRunning kullanılmaz. */
        function isVrChessPlayActive() {
            return !!(
                getVrChessBoard() &&
                chessUiPhase === ChessUIPhase.PLAYING &&
                currentGameType === 'ch' &&
                xrActive
            );
        }

        function getVrDamaBoard() {
            return onlineDama3d?.runtime === 'world' ? onlineDama3d : null;
        }

        function isVrDamaPlayActive() {
            return !!(
                getVrDamaBoard() &&
                damaUiPhase === DamaUIPhase.PLAYING &&
                currentGameType === 'da' &&
                xrActive
            );
        }

        /** Sonuç / maç sırasında kuyruk & spot tıklaması kilitli mi? */
        function shouldLockChessSpotControls() {
            if (G.gameRunning) return true;
            if (chessUiPhase === ChessUIPhase.RESULT || chessUiPhase === ChessUIPhase.CLEANUP) return true;
            if (damaUiPhase === DamaUIPhase.RESULT || damaUiPhase === DamaUIPhase.CLEANUP) return true;
            if (
                chessUiPhase === ChessUIPhase.PLAYING &&
                currentGameType === 'ch' &&
                (xrActive ||
                    onlineChess3d ||
                    onlineChess3dViewport ||
                    (IS_MOB && lastVrChessWasOnlinePvp && onlineChess.active))
            ) {
                return true;
            }
            if (
                damaUiPhase === DamaUIPhase.PLAYING &&
                currentGameType === 'da' &&
                (xrActive ||
                    onlineDama3d ||
                    onlineDama3dViewport ||
                    (IS_MOB && lastVrDamaWasOnlinePvp && onlineDama.active))
            ) {
                return true;
            }
            return false;
        }

        function removeOrphanChessDomHuds() {
            document.querySelectorAll('#vr-chess-harran-hud').forEach((el) => {
                if (onlineChess3d?.persistWorld && el === onlineChess3d.hud) return;
                el.remove();
            });
        }

        /**
         * Aşama 1 — RESULT: sunucu maç bitti; sonuç UI + faz.
         * VR dahil 3D tahta hemen kaldırılır (tahta sonuç panelinde kalmasın).
         */
        function applyChessMatchResultPhase(payload) {
            const p = payload && typeof payload === 'object' ? payload : {};
            const mid = resolveChessMatchEndId(p);
            // Aynı maç için tekrar tekrar sonuç işleme (idempotency)
            if (Number.isFinite(mid) && processedChessMatchEndId === mid) return;
            if (!Number.isFinite(mid) && processedChessMatchEndId === 'nomid') return;

            // Sadece gerçek VR oturumu: web/masaüstü dünya tahtası için VR sonuç paneli DEĞİL, PC dalı (modal + softReset).
            const useVrHeadsetUi =
                isVrSessionPresenting() || !!xrActive || !!(renderer?.xr?.isPresenting);

            try {
                const wasSpectator = onlineChess.watching;
                // Bu istemci maçın oyuncusu değilse "Kaybettin/Kazandın" gösterme.
                // (Sunucu yanlış broadcast ederse veya oda üyeliği kaçarsa güvenlik.)
                const meUid = localUserId != null ? Number(localUserId) : null;
                const wUid = p.white?.userId != null ? Number(p.white.userId) : null;
                const bUid = p.black?.userId != null ? Number(p.black.userId) : null;
                const winUid = p.winnerUserId != null ? Number(p.winnerUserId) : null;
                const loseUid = p.loserUserId != null ? Number(p.loserUserId) : null;
                const amParticipant =
                    meUid != null &&
                    (
                        (wUid != null && meUid === wUid) ||
                        (bUid != null && meUid === bUid) ||
                        (winUid != null && meUid === winUid) ||
                        (loseUid != null && meUid === loseUid)
                    );
                if (!wasSpectator && !amParticipant) {
                    // UI/state yine de temizlensin diye minimum cleanup:
                    closeChessExitConfirm();
                    closeVrChessCheckNotice();
                    removeOrphanChessDomHuds();
                    return;
                }
                const chessSnap =
                    onlineChess.lastState && typeof onlineChess.lastState === 'object'
                        ? { ...onlineChess.lastState }
                        : null;
                chessUiPhase = ChessUIPhase.RESULT;
                showChessNotice(p.message || 'Oyun bitti', 2300);
                onlineChess.active = false;
                onlineChess.watching = false;
                onlineChess.queued = false;
                onlineChess.exiting = false;
                onlineChess.matchId = null;
                onlineChess.lastState = null;
                if (Number.isFinite(mid) && wasSpectator) mpClient?.leaveChessWatch?.(mid);
                if (currentGame?.onChessMatchEnded) currentGame.onChessMatchEnded(p);
                const vrb = getVrChessBoard();
                if (vrb?.onMatchEnded) vrb.onMatchEnded(p);

                closeChessExitConfirm();
                closeVrChessCheckNotice();
                removeOrphanChessDomHuds();

                const reason = String(p.reason || '').toLowerCase();
                const winnerId = p.winnerUserId != null ? Number(p.winnerUserId) : null;
                const me = localUserId != null ? Number(localUserId) : null;
                const winnerName = String(p.winnerUsername || '').trim().toLowerCase();
                const meName = String(localNickname || '').trim().toLowerCase();
                const loserId = p.loserUserId != null ? Number(p.loserUserId) : null;
                const amParticipantByIds =
                    me != null &&
                    ((winnerId != null && me === winnerId) || (loserId != null && me === loserId));
                const iWon =
                    (winnerId != null && me != null && winnerId === me) ||
                    (!!winnerName && !!meName && winnerName === meName);
                const wnDisp = (p.winnerUsername && String(p.winnerUsername).trim()) || 'Rakip';
                const oppDisp =
                    chessOpponentFromLastState(chessSnap, me, meName) ||
                    (p.loserUsername && String(p.loserUsername).trim()) ||
                    'Rakip';

                const lbMeta =
                    !wasSpectator && me != null && p.leaderboard && typeof p.leaderboard === 'object'
                        ? p.leaderboard[String(me)]
                        : null;
                let chessOutcome = 'loss';
                if (reason === 'stalemate') chessOutcome = 'draw';
                else if (iWon) chessOutcome = 'win';
                const leaderboardBlock = lbMeta ? buildChessLeaderboardBlock(lbMeta, chessOutcome) : '';

                let endTitle = 'Oyun bitti';
                let endSub = String(p.message || 'Maç sona erdi.');
                let vrTitle = endTitle;
                let vrSub = endSub;

                if (wasSpectator) {
                    endTitle = 'Maç bitti';
                    endSub = p.message || 'İzlenen maç sona erdi.';
                    vrTitle = 'Maç bitti';
                    vrSub = 'İzleme sona erdi.';
                } else if (reason === 'stalemate') {
                    endTitle = 'Berabere!';
                    endSub = 'Pat — her iki tarafa +0,5 turnuva puanı.';
                    vrTitle = 'Berabere';
                    vrSub = 'Pat — beraberlik (+0,5 puan).';
                } else if (reason === 'checkmate') {
                    if (iWon) {
                        endTitle = 'Kazandın!';
                        endSub = `Şah mat. ${oppDisp} oyuncusunu mağlup ettin.`;
                        vrTitle = 'Kazandın!';
                        vrSub = `Şah mat.\n\n${oppDisp} oyuncusunu mağlup ettin.`;
                    } else {
                        endTitle = 'Kaybettin!';
                        endSub = `Şah mat. ${wnDisp} oyuncusu kazandı.`;
                        vrTitle = 'Kaybettin!';
                        vrSub = `Şah mat.\n\n${wnDisp} oyuncusu kazandı.`;
                    }
                } else if (reason === 'exit' || reason === 'disconnect' || reason === 'resign') {
                    if (iWon) {
                        endTitle = 'Kazandın!';
                        endSub = `Rakip oyundan ayrıldı. ${oppDisp} mağlup.`;
                        vrTitle = 'Kazandın!';
                        vrSub = `Rakip oyundan ayrıldı.\n\n${oppDisp} yenildi.`;
                    } else {
                        endTitle = 'Kaybettin!';
                        endSub = `Oyunu terk ettin. ${wnDisp} kazandı.`;
                        vrTitle = 'Kaybettin!';
                        vrSub = `Oyunu terk ettin.\n\n${wnDisp} kazandı.`;
                    }
                } else if (winnerId != null && me != null) {
                    endTitle = iWon ? 'Kazandın!' : 'Kaybettin!';
                    endSub = p.message || endSub;
                    vrTitle = iWon ? 'Kazandın!' : 'Kaybettin!';
                    vrSub = endSub;
                }

                const pcSubFull =
                    leaderboardBlock && !wasSpectator ? `${endSub}\n\n${leaderboardBlock}` : endSub;

                // Masaüstü + VR: maç bitince kuyruk/istek UI masadan çıkıp gelene kadar (tüm platformlar).
                onlineChess.suppressChessSpotOfferUntilLeaveZone = true;
                if (useVrHeadsetUi) {
                    openVrChessResult({
                        title: vrTitle,
                        sub: vrSub,
                        leaderboardBlock,
                        fetchChessRankFallback: !wasSpectator && !leaderboardBlock
                    });
                    endGame(-1, { chessResultPhase: true });
                } else {
                    const pcTitle =
                        endTitle === 'Kazandın!'
                            ? 'Kazandın!'
                            : endTitle === 'Kaybettin!'
                              ? 'Kaybettin!'
                              : endTitle;
                    openChessResultModal({ title: pcTitle, sub: pcSubFull });
                    setTimeout(() => {
                        if (G.gameRunning) endGame(-1);
                    }, 900);
                    setTimeout(() => {
                        if (!onlineChess.active && !onlineChess.watching && !G.gameRunning) softResetChessForReplay();
                    }, 650);
                }
                mpClient?.getChessQueue?.();
                processedChessMatchEndId = Number.isFinite(mid) ? mid : 'nomid';
            } catch (err) {
                console.error('applyChessMatchResultPhase', err);
                try {
                    clearVrChess();
                    removeOrphanChessDomHuds();
                } catch (_) { /* ignore */ }
            }
        }

        function finalizeChessMatchFromServer(payload) {
            // Önce tahta + HUD (idempotency / apply dalından bağımsız)
            try {
                clearVrChess();
                removeOrphanChessDomHuds();
            } catch (_) { /* ignore */ }
            applyChessMatchResultPhase(payload);
        }

        function applyDamaMatchResultPhase(payload) {
            const p = payload && typeof payload === 'object' ? payload : {};
            const mid = resolveDamaMatchEndId(p);
            if (Number.isFinite(mid) && processedDamaMatchEndId === mid) return;
            if (!Number.isFinite(mid) && processedDamaMatchEndId === 'nomid') return;

            const useVrHeadsetUi =
                isVrSessionPresenting() || !!xrActive || !!(renderer?.xr?.isPresenting);

            try {
                const wasSpectator = onlineDama.watching;
                const meUid = localUserId != null ? Number(localUserId) : null;
                const wUid = p.white?.userId != null ? Number(p.white.userId) : null;
                const bUid = p.black?.userId != null ? Number(p.black.userId) : null;
                const winUid = p.winnerUserId != null ? Number(p.winnerUserId) : null;
                const loseUid = p.loserUserId != null ? Number(p.loserUserId) : null;
                const amParticipant =
                    meUid != null &&
                    (
                        (wUid != null && meUid === wUid) ||
                        (bUid != null && meUid === bUid) ||
                        (winUid != null && meUid === winUid) ||
                        (loseUid != null && meUid === loseUid)
                    );
                if (!wasSpectator && !amParticipant) {
                    closeChessExitConfirm();
                    closeVrChessCheckNotice();
                    removeOrphanChessDomHuds();
                    return;
                }
                const damaSnap =
                    onlineDama.lastState && typeof onlineDama.lastState === 'object'
                        ? { ...onlineDama.lastState }
                        : null;
                damaUiPhase = DamaUIPhase.RESULT;
                showChessNotice(p.message || 'Oyun bitti', 2300);
                onlineDama.active = false;
                onlineDama.watching = false;
                onlineDama.queued = false;
                onlineDama.exiting = false;
                onlineDama.matchId = null;
                onlineDama.lastState = null;
                if (Number.isFinite(mid) && wasSpectator) mpClient?.leaveDamaWatch?.(mid);
                if (currentGame?.onDamaMatchEnded) currentGame.onDamaMatchEnded(p);
                const vrb = getVrDamaBoard();
                if (vrb?.onMatchEnded) vrb.onMatchEnded(p);

                closeChessExitConfirm();
                closeVrChessCheckNotice();
                removeOrphanChessDomHuds();

                const winnerId = p.winnerUserId != null ? Number(p.winnerUserId) : null;
                const me = localUserId != null ? Number(localUserId) : null;
                const winnerName = String(p.winnerUsername || '').trim().toLowerCase();
                const meName = String(localNickname || '').trim().toLowerCase();
                const iWon =
                    (winnerId != null && me != null && winnerId === me) ||
                    (!!winnerName && !!meName && winnerName === meName);
                const wnDisp = (p.winnerUsername && String(p.winnerUsername).trim()) || 'Rakip';
                const oppDisp =
                    chessOpponentFromLastState(damaSnap, me, meName) ||
                    (p.loserUsername && String(p.loserUsername).trim()) ||
                    'Rakip';

                const lbMeta =
                    !wasSpectator && me != null && p.leaderboard && typeof p.leaderboard === 'object'
                        ? p.leaderboard[String(me)]
                        : null;
                const damaOutcome = iWon ? 'win' : 'loss';
                const leaderboardBlock = lbMeta ? buildChessLeaderboardBlock(lbMeta, damaOutcome) : '';

                let endTitle = 'Oyun bitti';
                let endSub = String(p.message || 'Maç sona erdi.');
                let vrTitle = endTitle;
                let vrSub = endSub;

                if (wasSpectator) {
                    endTitle = 'Maç bitti';
                    endSub = p.message || 'İzlenen maç sona erdi.';
                    vrTitle = 'Maç bitti';
                    vrSub = 'İzleme sona erdi.';
                } else if (iWon) {
                    endTitle = 'Kazandın!';
                    endSub = p.message || `Tebrikler! ${oppDisp} oyuncusunu mağlup ettin.`;
                    vrTitle = 'Kazandın!';
                    vrSub = p.message || `Dama: kazandın.\n\n${oppDisp} yenildi.`;
                } else {
                    endTitle = 'Kaybettin!';
                    endSub = p.message || `${wnDisp} kazandı.`;
                    vrTitle = 'Kaybettin!';
                    vrSub = p.message || `Dama: ${wnDisp} kazandı.`;
                }

                const pcSubFull =
                    leaderboardBlock && !wasSpectator ? `${endSub}\n\n${leaderboardBlock}` : endSub;

                onlineDama.suppressDamaSpotOfferUntilLeaveZone = true;
                if (useVrHeadsetUi) {
                    openVrChessResult({
                        title: vrTitle,
                        sub: vrSub,
                        leaderboardBlock,
                        fetchChessRankFallback: !wasSpectator && !leaderboardBlock,
                        boardKind: 'da'
                    });
                    endGame(-1, { chessResultPhase: true });
                } else {
                    const pcTitle =
                        endTitle === 'Kazandın!'
                            ? 'Kazandın!'
                            : endTitle === 'Kaybettin!'
                              ? 'Kaybettin!'
                              : endTitle;
                    openChessResultModal({ title: pcTitle, sub: pcSubFull });
                    setTimeout(() => {
                        if (G.gameRunning) endGame(-1);
                    }, 900);
                    setTimeout(() => {
                        if (!onlineDama.active && !onlineDama.watching && !G.gameRunning) softResetDamaForReplay();
                    }, 650);
                }
                mpClient?.getDamaQueue?.();
                processedDamaMatchEndId = Number.isFinite(mid) ? mid : 'nomid';
            } catch (err) {
                console.error('applyDamaMatchResultPhase', err);
                try {
                    clearVrDama();
                } catch (_) { /* ignore */ }
            }
        }

        function finalizeDamaMatchFromServer(payload) {
            try {
                clearVrDama();
                removeOrphanChessDomHuds();
            } catch (_) { /* ignore */ }
            applyDamaMatchResultPhase(payload);
        }

        function softResetDamaForReplay() {
            closeVrChessResult();
            closeChessResultModal();
            damaUiPhase = DamaUIPhase.CLEANUP;
            processedDamaMatchEndId = null;
            onlineDama.active = false;
            onlineDama.watching = false;
            onlineDama.queued = false;
            onlineDama.matchId = null;
            onlineDama.lastState = null;
            closeChessExitConfirm();
            lastVrDamaWasOnlinePvp = false;
            lastVrBoardGameOverlayKind = 'ch';
            currentGameId = null;
            currentGameTitle = null;
            currentGameType = null;
            if (currentGame) {
                try {
                    currentGame.destroy?.();
                } catch (_) { /* ignore */ }
                currentGame = null;
            }
            clearVrDama();
            if (G.gameRunning) endGame(-1);
            damaUiPhase = DamaUIPhase.IDLE;

            const daSpot = SPOTS.find((s) => s.game === 'da');
            if (daSpot) activeSpot = daSpot;

            requestDamaQueueState(true);
            updateDamaQueueUi();

            if (xrActive) {
                initVrSpotWindow();
                updateVrSpotWindow();
                if (!onlineDama.suppressDamaSpotOfferUntilLeaveZone) {
                    if (vrSpotWindow) vrSpotWindow.visible = !!(!escMenuOpen && activeSpot);
                    forceShowVrDamaQueueMenu(12000);
                } else if (vrSpotWindow) {
                    vrSpotWindow.visible = false;
                }
            } else {
                const prompt = document.getElementById('interact-prompt');
                if (prompt && activeSpot?.game === 'da' && !onlineDama.suppressDamaSpotOfferUntilLeaveZone) {
                    prompt.style.display = 'block';
                }
            }
        }

        function setupMultiplayer() {
            mpClient = createMultiplayerClient({
                nickname: localNickname,
                username: localNickname,
                sessionToken: localSessionToken
            }, {
                onRoomFull: () => alert('Oda dolu: Şimdilik en fazla 50 oyuncu destekleniyor.'),
                onAuthError: (msg) => alert(sanitizePlainText(msg || 'Oturum doğrulanamadı, tekrar giriş yap.', 400)),
                onSelfInit: ({ id, players }) => {
                    localPlayerId = id;
                    players.forEach((p) => {
                        if (p.id === localPlayerId) {
                            localUserId = p.userId || null;
                            localDisplayCrown = nameTagCrownOpts(p);
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
                            refreshLocalPlayerNameTag();
                            return;
                        }
                        if (!remotePlayers.has(p.id)) createRemotePlayer(p);
                    });
                    requestChessQueueState(true);
                    requestDamaQueueState(true);
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
                    if (p.crownGame !== undefined || p.crownPlace !== undefined) {
                        const nextCrown = nameTagCrownOpts(p);
                        const prevG = avatar.userData.lastCrownGame;
                        const prevP = avatar.userData.lastCrownPlace;
                        const ch =
                            (nextCrown?.game || null) !== (prevG || null) ||
                            (nextCrown?.place ?? null) !== (prevP ?? null);
                        if (ch) {
                            avatar.userData.lastCrownGame = nextCrown?.game ?? null;
                            avatar.userData.lastCrownPlace = nextCrown?.place ?? null;
                            refreshRemotePlayerNameTag(
                                avatar,
                                avatar.userData.remoteNickname || p.nickname,
                                nextCrown
                            );
                        }
                    }
                },
                onPlayerCrownUpdated: ({ id, crownGame, crownPlace } = {}) => {
                    if (id === localPlayerId) {
                        localDisplayCrown =
                            crownGame && crownPlace != null
                                ? { game: String(crownGame), place: Number(crownPlace) }
                                : null;
                        refreshLocalPlayerNameTag();
                        void refreshCharacterCrownSelect();
                        return;
                    }
                    const avatar = remotePlayers.get(id);
                    if (!avatar) return;
                    const crown =
                        crownGame && crownPlace != null
                            ? { game: String(crownGame), place: Number(crownPlace) }
                            : null;
                    avatar.userData.lastCrownGame = crown?.game ?? null;
                    avatar.userData.lastCrownPlace = crown?.place ?? null;
                    refreshRemotePlayerNameTag(
                        avatar,
                        avatar.userData.remoteNickname || 'Oyuncu',
                        crown
                    );
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
                    const mid = payload?.mesaId != null ? Number(payload.mesaId) : 1;
                    chessQueueStateByMesa.set(mid, {
                        waitingPlayer: payload?.waitingPlayer || null,
                        totalWaiting: payload?.totalWaiting || 0,
                        selfQueued: !!payload?.selfQueued,
                        activeMatch: payload?.activeMatch ?? null,
                        activeMatches: Array.isArray(payload?.activeMatches)
                            ? payload.activeMatches
                            : null
                    });

                    // UI/state: sadece şu an baktığımız/oturduğumuz masanın kuyruğunu yansıt.
                    const curMid =
                        activeSpot?.game === 'ch'
                            ? (xrActive ? Number(activeSpot.mesaId ?? 1) : 0)
                            : Number(onlineChess.mesaId ?? 1);
                    const cur = chessQueueStateByMesa.get(curMid);
                    if (!cur) return;

                    onlineChess.waitingPlayer = cur.waitingPlayer;
                    onlineChess.totalWaiting = cur.totalWaiting;
                    onlineChess.queued = !!cur.selfQueued;
                    onlineChess.activeMatch = cur.activeMatch;

                    if (cur.selfQueued && !onlineChess.active) {
                        chessUiPhase = ChessUIPhase.QUEUED;
                    } else if (
                        !cur.selfQueued &&
                        !onlineChess.active &&
                        chessUiPhase !== ChessUIPhase.PLAYING &&
                        chessUiPhase !== ChessUIPhase.RESULT &&
                        chessUiPhase !== ChessUIPhase.CLEANUP
                    ) {
                        chessUiPhase = ChessUIPhase.IDLE;
                    }
                    if (activeSpot?.game === 'ch') {
                        updateChessQueueUi();
                        updateVrSpotWindow();
                    }
                    if (escMenuOpen && escMenuTab === 'live') escLiveRefreshList();
                },
                onDamaQueueState: (payload) => {
                    const mid = payload?.mesaId != null ? Number(payload.mesaId) : 1;
                    damaQueueStateByMesa.set(mid, {
                        waitingPlayer: payload?.waitingPlayer || null,
                        totalWaiting: payload?.totalWaiting || 0,
                        selfQueued: !!payload?.selfQueued,
                        activeMatch: payload?.activeMatch ?? null,
                        activeMatches: Array.isArray(payload?.activeMatches)
                            ? payload.activeMatches
                            : null
                    });

                    const curMid =
                        activeSpot?.game === 'da'
                            ? (xrActive ? Number(activeSpot.mesaId ?? 1) : 0)
                            : Number(onlineDama.mesaId ?? 1);
                    const cur = damaQueueStateByMesa.get(curMid);
                    if (!cur) return;

                    onlineDama.waitingPlayer = cur.waitingPlayer;
                    onlineDama.totalWaiting = cur.totalWaiting;
                    onlineDama.queued = !!cur.selfQueued;
                    onlineDama.activeMatch = cur.activeMatch;

                    if (cur.selfQueued && !onlineDama.active) {
                        damaUiPhase = DamaUIPhase.QUEUED;
                    } else if (
                        !cur.selfQueued &&
                        !onlineDama.active &&
                        damaUiPhase !== DamaUIPhase.PLAYING &&
                        damaUiPhase !== DamaUIPhase.RESULT &&
                        damaUiPhase !== DamaUIPhase.CLEANUP
                    ) {
                        damaUiPhase = DamaUIPhase.IDLE;
                    }
                    if (activeSpot?.game === 'da') {
                        updateDamaQueueUi();
                        updateVrSpotWindow();
                    }
                    if (escMenuOpen && escMenuTab === 'live') escLiveRefreshList();
                },
                onChessMatchStarted: (payload) => {
                    lastVrChessCheckNoticeKey = '';
                    processedChessMatchEndId = null;
                    onlineChess.suppressChessSpotOfferUntilLeaveZone = false;
                    chessUiPhase = ChessUIPhase.PLAYING;
                    onlineChess.active = true;
                    onlineChess.watching = false;
                    onlineChess.queued = false;
                    onlineChess.matchId = payload.matchId;
                    onlineChess.mesaId = payload?.mesaId != null ? Number(payload.mesaId) : (activeSpot?.game === 'ch' ? (activeSpot.mesaId ?? 1) : (onlineChess.mesaId ?? 1));
                    onlineChess.myColor = normalizeChessPlayerColor(payload);
                    onlineChess.white = payload.white;
                    onlineChess.black = payload.black;
                    onlineChess.lastState = payload;
                    applyChessTeleport();
                    if (!isVrChessPlayActive() && !G.gameRunning) {
                        const chSpot = SPOTS.find((s) => s.game === 'ch' && Number(s.mesaId || 1) === Number(onlineChess.mesaId || 1));
                        startGame('ch', chSpot?.id || `satranc_online_${payload.matchId || ''}`, chSpot?.title || 'Satranç', {
                            mode: 'pvp',
                            matchId: payload.matchId,
                            matchPayload: payload
                        });
                    } else {
                        syncWorldPvpChessFromPayload(payload, { spectator: false });
                    }
                    updateChessQueueUi();
                    updateVrSpotWindow();
                },
                onChessMatchResumed: (payload) => {
                    lastVrChessCheckNoticeKey = '';
                    processedChessMatchEndId = null;
                    onlineChess.suppressChessSpotOfferUntilLeaveZone = false;
                    chessUiPhase = ChessUIPhase.PLAYING;
                    onlineChess.active = true;
                    onlineChess.watching = false;
                    onlineChess.queued = false;
                    onlineChess.matchId = payload.matchId;
                    onlineChess.mesaId = payload?.mesaId != null ? Number(payload.mesaId) : (activeSpot?.game === 'ch' ? (activeSpot.mesaId ?? 1) : (onlineChess.mesaId ?? 1));
                    onlineChess.myColor = normalizeChessPlayerColor(payload);
                    onlineChess.white = payload.white;
                    onlineChess.black = payload.black;
                    onlineChess.lastState = payload;
                    applyChessTeleport();
                    if (!isVrChessPlayActive() && !G.gameRunning) {
                        const chSpot = SPOTS.find((s) => s.game === 'ch' && Number(s.mesaId || 1) === Number(onlineChess.mesaId || 1));
                        startGame('ch', chSpot?.id || `satranc_online_${payload.matchId || ''}`, chSpot?.title || 'Satranç', {
                            mode: 'pvp',
                            matchId: payload.matchId,
                            matchPayload: payload
                        });
                    } else {
                        syncWorldPvpChessFromPayload(payload, { spectator: false });
                    }
                    updateChessQueueUi();
                    updateVrSpotWindow();
                },
                onChessWatchAck: (payload) => {
                    if (!payload?.matchId) return;
                    const mid = Number(payload.matchId);
                    // ESC > Canlı sekmesinde izleme: overlay açma, sadece 2D tahtayı güncelle.
                    if (escMenuOpen && escMenuTab === 'live' && escLiveWatch?.kind === 'ch' && Number(escLiveWatch.matchId) === mid) {
                        escLiveChessPayload = payload;
                        if (escLiveStatus) escLiveStatus.textContent = `♟️ Satranç izleniyor · #${mid}`;
                        escLiveRenderCanvas();
                        return;
                    }
                    if (
                        onlineChess3d?.matchId != null &&
                        Number(onlineChess3d.matchId) === mid &&
                        onlineChess.watching
                    ) {
                        onlineChess.lastState = payload;
                        syncWorldPvpChessFromPayload(payload, { spectator: true });
                        updateChessQueueUi();
                        updateVrSpotWindow();
                        return;
                    }
                    lastVrChessCheckNoticeKey = '';
                    processedChessMatchEndId = null;
                    onlineChess.suppressChessSpotOfferUntilLeaveZone = false;
                    chessUiPhase = ChessUIPhase.PLAYING;
                    onlineChess.watching = true;
                    onlineChess.active = false;
                    onlineChess.queued = false;
                    onlineChess.matchId = payload.matchId;
                    onlineChess.mesaId = payload?.mesaId != null ? Number(payload.mesaId) : (activeSpot?.game === 'ch' ? (activeSpot.mesaId ?? 1) : (onlineChess.mesaId ?? 1));
                    onlineChess.myColor = 'spectator';
                    onlineChess.white = payload.white;
                    onlineChess.black = payload.black;
                    onlineChess.lastState = payload;
                    applyChessTeleportSpectator();
                    if (!isVrChessPlayActive() && !G.gameRunning) {
                        const chSpot = SPOTS.find((s) => s.game === 'ch' && Number(s.mesaId || 1) === Number(onlineChess.mesaId || 1));
                        if (chSpot) {
                            startGame('ch', chSpot.id, chSpot.title, {
                                mode: 'pvp',
                                spectator: true,
                                matchId: payload.matchId,
                                matchPayload: payload
                            });
                        }
                    } else {
                        syncWorldPvpChessFromPayload(payload, { spectator: true });
                    }
                    updateChessQueueUi();
                    updateVrSpotWindow();
                },
                onChessStateUpdate: (payload) => {
                    if (escMenuOpen && escMenuTab === 'live' && escLiveWatch?.kind === 'ch' && payload?.matchId != null && Number(payload.matchId) === Number(escLiveWatch.matchId)) {
                        escLiveChessPayload = payload;
                        escLiveRenderCanvas();
                    }
                    const snapshotMatchId = onlineChess.matchId;
                    onlineChess.lastState = payload;
                    if (payload?.matchId != null) onlineChess.matchId = payload.matchId;
                    if (payload.checkBy && payload.checkedPlayer) {
                        if (!isVrSessionPresenting()) {
                            showChessNotice(`${payload.checkBy} ${payload.checkedPlayer} oyuncusuna şah çekti`, 1600);
                        }
                    }
                    if (
                        isVrSessionPresenting() &&
                        payload?.inCheck &&
                        payload?.checkBy &&
                        !vrChessResultOpen &&
                        chessUiPhase === ChessUIPhase.PLAYING &&
                        (onlineChess.active || onlineChess.watching || lastVrChessWasOnlinePvp)
                    ) {
                        const pid = payload.matchId != null ? Number(payload.matchId) : null;
                        const curMid = snapshotMatchId != null ? Number(snapshotMatchId) : null;
                        if (pid == null || curMid == null || pid === curMid) {
                            const me = String(localNickname || '').trim().toLowerCase();
                            const attacker = String(payload.checkBy || '').trim().toLowerCase();
                            const skipSelfAttack =
                                !onlineChess.watching && attacker && me && attacker === me;
                            if (!skipSelfAttack) {
                                const key = `${payload.matchId}|${payload.fen || ''}`;
                                if (key !== lastVrChessCheckNoticeKey) {
                                    lastVrChessCheckNoticeKey = key;
                                    const nm = String(payload.checkBy || '').trim() || 'Rakip';
                                    openVrChessCheckNotice(`${nm} oyuncusu ŞAH çekti`);
                                }
                            }
                        }
                    }
                    const inOnlineChess =
                        lastVrChessWasOnlinePvp ||
                        onlineChess.active ||
                        onlineChess.watching ||
                        !!vrChessStandalone ||
                        !!onlineChess3d ||
                        !!onlineChess3dViewport ||
                        (currentGameType === 'ch' &&
                            currentGame &&
                            typeof currentGame.onChessStateUpdate === 'function');
                    const pid = payload?.matchId != null ? Number(payload.matchId) : null;
                    const snapNum = snapshotMatchId != null ? Number(snapshotMatchId) : null;
                    const terminalBoard =
                        (payload.checkmate || payload.stalemate) &&
                        pid != null &&
                        (snapNum == null || pid === snapNum) &&
                        inOnlineChess;

                    if (currentGame?.onChessStateUpdate) currentGame.onChessStateUpdate(payload);
                    try {
                        // Maç/sonuç sonrası (RESULT vb.) gecikmeli paketler taşları yeniden yüklemesin.
                        if (
                            chessUiPhase === ChessUIPhase.PLAYING &&
                            onlineChess3d?.runtime === 'world' &&
                            onlineChess3d?.onServerStateUpdate
                        ) {
                            onlineChess3d.onServerStateUpdate(payload);
                        }
                    } catch (err) {
                        console.error('VR satranç state güncelleme hatası:', err);
                    }
                    if (terminalBoard && inOnlineChess) {
                        const reason = payload.checkmate ? 'checkmate' : 'stalemate';
                        const message = payload.checkmate
                            ? (payload.resultText || `${payload.winnerUsername || 'Oyuncu'} kazandı — şah mat!`)
                            : 'Oyun berabere bitti.';
                        finalizeChessMatchFromServer({
                            matchId: payload.matchId,
                            winnerUserId: payload.checkmate ? payload.winnerUserId ?? null : null,
                            winnerUsername: payload.checkmate ? payload.winnerUsername ?? null : null,
                            reason,
                            message
                        });
                    }
                },
                onChessStateWorld: (payload) => {
                    if (!payload?.matchId || !payload?.fen) return;
                    const am = onlineChess.activeMatch;
                    if (am != null && Number(am.matchId) !== Number(payload.matchId)) return;
                    const mid = payload?.mesaId != null ? Number(payload.mesaId) : 1;
                    // Web/mobil "sanal masa" (0) world masalara yansıtılmasın.
                    if (mid === 0) return;
                    ensureWorldChessBoard(mid);
                    onlineChess3dByMesa.get(mid)?.syncWorldBoardFromLivePayload?.(payload);
                },
                onChessMatchEnded: (payload) => {
                    finalizeChessMatchFromServer(payload || {});
                },
                onChessError: (message) => {
                    if (!message) return;
                    showChessNotice(message, 1700);
                },
                onDamaMatchStarted: (payload) => {
                    processedDamaMatchEndId = null;
                    onlineDama.suppressDamaSpotOfferUntilLeaveZone = false;
                    damaUiPhase = DamaUIPhase.PLAYING;
                    onlineDama.active = true;
                    onlineDama.watching = false;
                    onlineDama.queued = false;
                    onlineDama.matchId = payload.matchId;
                    onlineDama.mesaId = payload?.mesaId != null ? Number(payload.mesaId) : (activeSpot?.game === 'da' ? (activeSpot.mesaId ?? 1) : (onlineDama.mesaId ?? 1));
                    onlineDama.myColor = normalizeDamaPlayerColor(payload);
                    onlineDama.white = payload.white;
                    onlineDama.black = payload.black;
                    onlineDama.lastState = payload;
                    applyDamaTeleport();
                    if (!isVrDamaPlayActive() && !G.gameRunning) {
                        const daSpot = SPOTS.find((s) => s.game === 'da' && Number(s.mesaId || 1) === Number(onlineDama.mesaId || 1));
                        startGame('da', daSpot?.id || `dama_online_${payload.matchId || ''}`, daSpot?.title || 'Dama', {
                            mode: 'pvp',
                            matchId: payload.matchId,
                            matchPayload: payload
                        });
                    } else {
                        syncWorldPvpDamaFromPayload(payload, { spectator: false });
                    }
                    updateDamaQueueUi();
                    updateVrSpotWindow();
                },
                onDamaMatchResumed: (payload) => {
                    processedDamaMatchEndId = null;
                    onlineDama.suppressDamaSpotOfferUntilLeaveZone = false;
                    damaUiPhase = DamaUIPhase.PLAYING;
                    onlineDama.active = true;
                    onlineDama.watching = false;
                    onlineDama.queued = false;
                    onlineDama.matchId = payload.matchId;
                    onlineDama.mesaId = payload?.mesaId != null ? Number(payload.mesaId) : (activeSpot?.game === 'da' ? (activeSpot.mesaId ?? 1) : (onlineDama.mesaId ?? 1));
                    onlineDama.myColor = normalizeDamaPlayerColor(payload);
                    onlineDama.white = payload.white;
                    onlineDama.black = payload.black;
                    onlineDama.lastState = payload;
                    applyDamaTeleport();
                    if (!isVrDamaPlayActive() && !G.gameRunning) {
                        const daSpot = SPOTS.find((s) => s.game === 'da' && Number(s.mesaId || 1) === Number(onlineDama.mesaId || 1));
                        startGame('da', daSpot?.id || `dama_online_${payload.matchId || ''}`, daSpot?.title || 'Dama', {
                            mode: 'pvp',
                            matchId: payload.matchId,
                            matchPayload: payload
                        });
                    } else {
                        syncWorldPvpDamaFromPayload(payload, { spectator: false });
                    }
                    updateDamaQueueUi();
                    updateVrSpotWindow();
                },
                onDamaWatchAck: (payload) => {
                    if (!payload?.matchId) return;
                    const mid = Number(payload.matchId);
                    if (escMenuOpen && escMenuTab === 'live' && escLiveWatch?.kind === 'da' && Number(escLiveWatch.matchId) === mid) {
                        escLiveDamaPayload = payload;
                        if (escLiveStatus) escLiveStatus.textContent = `⛀ Dama izleniyor · #${mid}`;
                        escLiveRenderCanvas();
                        return;
                    }
                    if (
                        onlineDama3d?.matchId != null &&
                        Number(onlineDama3d.matchId) === mid &&
                        onlineDama.watching
                    ) {
                        onlineDama.lastState = payload;
                        syncWorldPvpDamaFromPayload(payload, { spectator: true });
                        updateDamaQueueUi();
                        updateVrSpotWindow();
                        return;
                    }
                    processedDamaMatchEndId = null;
                    onlineDama.suppressDamaSpotOfferUntilLeaveZone = false;
                    damaUiPhase = DamaUIPhase.PLAYING;
                    onlineDama.watching = true;
                    onlineDama.active = false;
                    onlineDama.queued = false;
                    onlineDama.matchId = payload.matchId;
                    onlineDama.mesaId = payload?.mesaId != null ? Number(payload.mesaId) : (activeSpot?.game === 'da' ? (activeSpot.mesaId ?? 1) : (onlineDama.mesaId ?? 1));
                    onlineDama.myColor = 'spectator';
                    onlineDama.white = payload.white;
                    onlineDama.black = payload.black;
                    onlineDama.lastState = payload;
                    applyDamaTeleportSpectator();
                    if (!isVrDamaPlayActive() && !G.gameRunning) {
                        const daSpot = SPOTS.find((s) => s.game === 'da' && Number(s.mesaId || 1) === Number(onlineDama.mesaId || 1));
                        if (daSpot) {
                            startGame('da', daSpot.id, daSpot.title, {
                                mode: 'pvp',
                                spectator: true,
                                matchId: payload.matchId,
                                matchPayload: payload
                            });
                        }
                    } else {
                        syncWorldPvpDamaFromPayload(payload, { spectator: true });
                    }
                    updateDamaQueueUi();
                    updateVrSpotWindow();
                },
                onDamaStateUpdate: (payload) => {
                    if (escMenuOpen && escMenuTab === 'live' && escLiveWatch?.kind === 'da' && payload?.matchId != null && Number(payload.matchId) === Number(escLiveWatch.matchId)) {
                        escLiveDamaPayload = payload;
                        escLiveRenderCanvas();
                    }
                    const snapshotMatchId = onlineDama.matchId;
                    onlineDama.lastState = payload;
                    if (payload?.matchId != null) onlineDama.matchId = payload.matchId;
                    const inOnlineDama =
                        lastVrDamaWasOnlinePvp ||
                        onlineDama.active ||
                        onlineDama.watching ||
                        !!onlineDama3d ||
                        !!onlineDama3dViewport ||
                        (currentGameType === 'da' &&
                            currentGame &&
                            typeof currentGame.onDamaStateUpdate === 'function');
                    if (currentGame?.onDamaStateUpdate) currentGame.onDamaStateUpdate(payload);
                    try {
                        if (
                            damaUiPhase === DamaUIPhase.PLAYING &&
                            onlineDama3d?.runtime === 'world' &&
                            onlineDama3d?.onServerStateUpdate
                        ) {
                            onlineDama3d.onServerStateUpdate(payload);
                        }
                    } catch (err) {
                        console.error('VR dama state güncelleme hatası:', err);
                    }
                },
                onDamaStateWorld: (payload) => {
                    if (!payload?.matchId || !payload?.board) return;
                    // Dünya tahtası: kampüsteki 3. kişiler canlı güncellemeyi her zaman görmeli.
                    // Sadece "izleme" modunda belirli bir maça kilitliysek farklı matchId'leri ignore et.
                    if (onlineDama.watching && onlineDama.matchId != null && Number(onlineDama.matchId) !== Number(payload.matchId)) {
                        return;
                    }
                    const mid = payload?.mesaId != null ? Number(payload.mesaId) : 1;
                    // Web/mobil sanal masa (0) world masaya yansımasın.
                    if (mid === 0) return;
                    ensureWorldDamaBoard(mid);
                    onlineDama3dByMesa.get(mid)?.syncWorldBoardFromLivePayload?.(payload);
                },
                onDamaMatchEnded: (payload) => {
                    finalizeDamaMatchFromServer(payload || {});
                },
                onDamaError: () => {
                    try {
                        onlineDama3d?.clearPendingMoveAfterError?.();
                        onlineDama3dViewport?.clearPendingMoveAfterError?.();
                    } catch (_) { /* ignore */ }
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

        function stopCharacterPreviewLoop() {
            if (charPreviewRaf != null) {
                cancelAnimationFrame(charPreviewRaf);
                charPreviewRaf = null;
            }
        }

        function resizeCharacterPreview3d() {
            const host = document.getElementById('char-preview-3d-host');
            if (!host || !charPreviewRenderer || !charPreviewCamera) return;
            const w = Math.max(200, Math.floor(host.clientWidth || host.getBoundingClientRect().width) || 260);
            const h = Math.max(260, Math.floor(host.clientHeight || host.getBoundingClientRect().height) || 320);
            charPreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            charPreviewRenderer.setSize(w, h, false);
            charPreviewCamera.aspect = w / h;
            charPreviewCamera.updateProjectionMatrix();
        }

        function tickCharacterPreview3d() {
            charPreviewRaf = requestAnimationFrame(tickCharacterPreview3d);
            if (!charPreviewRenderer || !charPreviewScene || !charPreviewCamera) return;
            if (!escMenuOpen || escMenuTab !== 'character' || xrActive) {
                stopCharacterPreviewLoop();
                return;
            }
            const dt = charPreviewClock.getDelta();
            if (charPreviewMannequin) walkAnim(charPreviewMannequin, dt, false);
            const prevTag = charPreviewMannequin?.userData?.previewNameTag;
            if (prevTag && charPreviewCamera) prevTag.quaternion.copy(charPreviewCamera.quaternion);
            charPreviewRenderer.render(charPreviewScene, charPreviewCamera);
        }

        function startCharacterPreviewLoop() {
            if (xrActive || charPreviewRaf != null || !charPreviewRenderer) return;
            charPreviewClock.getDelta();
            tickCharacterPreview3d();
        }

        function ensureCharacterPreview3d() {
            if (xrActive || charPreviewRenderer) return;
            const host = document.getElementById('char-preview-3d-host');
            if (!host) return;
            charPreviewRenderer = new THREE.WebGLRenderer({ antialias: !IS_MOB && !IS_QUEST, alpha: false });
            const w = Math.max(200, Math.floor(host.clientWidth) || 260);
            const h = Math.max(260, Math.floor(host.clientHeight) || 320);
            charPreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            charPreviewRenderer.setSize(w, h, false);
            charPreviewRenderer.setClearColor(0x0c1528, 1);
            charPreviewRenderer.outputColorSpace = THREE.SRGBColorSpace;
            charPreviewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
            charPreviewRenderer.toneMappingExposure = 1.02;
            host.textContent = '';
            host.appendChild(charPreviewRenderer.domElement);
            const cv = charPreviewRenderer.domElement;
            cv.style.cssText = 'display:block;width:100%;height:100%;vertical-align:top;border-radius:12px;';
            charPreviewScene = new THREE.Scene();
            charPreviewCamera = new THREE.PerspectiveCamera(36, w / h, 0.08, 80);
            charPreviewCamera.position.set(0, 1.2, 3.35);
            charPreviewCamera.lookAt(0, 1.02, 0);
            charPreviewScene.add(new THREE.AmbientLight(0xffffff, 0.52));
            const dir = new THREE.DirectionalLight(0xfff2dd, 1.05);
            dir.position.set(2.5, 5.2, 3.8);
            charPreviewScene.add(dir);
            const rim = new THREE.DirectionalLight(0xa8c8ff, 0.38);
            rim.position.set(-2.8, 3.5, -2.2);
            charPreviewScene.add(rim);
            charPreviewMannequin = makeHuman(0x1a4f8a, 0x1a2a3a);
            charPreviewMannequin.scale.setScalar(0.92);
            charPreviewMannequin.rotation.y = Math.PI + 0.28;
            charPreviewScene.add(charPreviewMannequin);
            applyPendingAppearanceToMannequin();
            if (typeof ResizeObserver !== 'undefined') {
                charPreviewResizeObs?.disconnect();
                charPreviewResizeObs = new ResizeObserver(() => resizeCharacterPreview3d());
                charPreviewResizeObs.observe(host);
            }
        }

        /* ════════════════ NPCs ═════════════════════════ */
        function spawnNPCs() {
            const zones = [[0, 54, 13], [0, -18, 13], [-38, 2, 10], [38, 2, 10], [0, -36, 8], [-12, 42, 8], [12, 42, 8], [-55, -20, 8], [55, -20, 8]];
            const npcCount = IS_QUEST ? Math.min(8, CFG.npcCount) : CFG.npcCount;
            for (let i = 0; i < npcCount; i++) {
                const [zx, zz, zr] = zones[i % zones.length];
                let a = 0, r = 0, sx = zx, sz = zz;
                // Spawn: kutu + daire collider’lardan kaçır.
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

            // VR girdi (tetik, satranç sonuç TAMAM vb.); bazı cihazlarda isPresenting true iken xrActive gecikebilir.
            if (isVrSessionPresenting()) updateVRMovement(dt);
            // VR'da ayak konumu rig'te; player sadece joystick hareketinde güncelleniyordu — durunca kayıp senkron,
            // çıkış/girişte yanlış konum veya "harita başı" hissi (minimap / ağ / NPC / sonraki sessionstart).
            if (xrActive && player && xrRig) {
                player.position.x = xrRig.position.x;
                player.position.z = xrRig.position.z;
            }
            if (xrActive) updateControllerVelocity(dt);
            if (xrActive) updateVRHandAnimations();
            if (xrActive && vrSpotWindow) updateVrSpotTransform(dt);
            const vrChessCtrl0 = xrActive ? xrCtrl0 : null;
            const vrChessCtrl1 = xrActive ? xrCtrl1 : null;
            if (onlineChess3d?.runtime === 'world') onlineChess3d.update(vrChessCtrl0, vrChessCtrl1);
            else if (vrChessStandalone && xrActive) vrChessStandalone.update(vrChessCtrl0, vrChessCtrl1);
            if (onlineDama3d?.runtime === 'world') onlineDama3d.update(vrChessCtrl0, vrChessCtrl1);
            if (xrActive && chessExitConfirmOpen && vrChessExitWindow?.visible) updateVrChessExitWindow();
            if (isVrSessionPresenting() && chessExitConfirmOpen && vrChessExitWindow?.visible) updateVrChessExitTransform(dt);
            if (isVrSessionPresenting() && vrChessCheckOpen && vrChessCheckWindow?.visible) updateVrChessCheckWindow();
            if (isVrSessionPresenting() && vrChessCheckOpen && vrChessCheckWindow?.visible) updateVrChessCheckTransform(dt);
            if (isVrSessionPresenting() && vrChessResultOpen && vrChessResultWindow?.visible) updateVrChessResultWindow();
            if (isVrSessionPresenting() && vrChessResultOpen && vrChessResultWindow?.visible) updateVrChessResultTransform(dt);
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
                checkInteractSpots();
                if (xrActive) updateVRRaycast();
            }
            // Minigame / VR satranç sırasında da NPC'ler yürüsün; PC'de overlay arkası, VR'da sahne canlı kalsın.
            updateNPCs(dt);

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

            if (isJumping) {
                jumpVel -= 18 * dt;
                player.position.y = Math.max(0, player.position.y + jumpVel * dt);
                if (xrActive && xrRig) xrRig.position.y = player.position.y + getVrRigEyeOffset();
                if (player.position.y <= 0) {
                    player.position.y = 0;
                    if (xrActive && xrRig) xrRig.position.y = getVrRigEyeOffset();
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
            if (universityGateRoot) {
                const d = player?.position?.distanceTo?.(universityGateRoot.position) ?? Infinity;
                universityGateRoot.visible = d < 72;
            }
            updateProxLabels();
            updateBubbles();
            drawMinimap();
            updateWaypointMarker(dt);
            if (xrActive && vrMenuWindow) updateVrMenuTransform(dt);
            if (xrActive) updateVrCharacterMannequinTransform(dt);

            renderer.render(scene, camera);
            if (!firstWorldFrameDrawn) firstWorldFrameDrawn = true;
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
                if ((onlineChess.active || onlineChess.watching) && !isInsideChessBoundary(nx, nz)) {
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
        let forceVrDamaQueueUntil = 0;
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
            if (xrRig && onlineChess.suppressChessSpotOfferUntilLeaveZone && isNearChessSpot(xrRig.position.x, xrRig.position.z)) {
                if (vrSpotWindow) vrSpotWindow.visible = false;
                return;
            }
            if (vrSpotWindow) vrSpotWindow.visible = !!(xrActive && !escMenuOpen && !shouldLockChessSpotControls() && activeSpot);
        }

        function forceShowVrDamaQueueMenu(ms = 8000) {
            const now = performance.now();
            forceVrDamaQueueUntil = Math.max(forceVrDamaQueueUntil, now + ms);
            const daSpot = SPOTS.find((s) => s.game === 'da');
            if (daSpot) activeSpot = daSpot;
            initVrSpotWindow();
            updateVrSpotWindow();
            if (xrRig && onlineDama.suppressDamaSpotOfferUntilLeaveZone && isNearDamaSpot(xrRig.position.x, xrRig.position.z)) {
                if (vrSpotWindow) vrSpotWindow.visible = false;
                return;
            }
            if (vrSpotWindow) vrSpotWindow.visible = !!(xrActive && !escMenuOpen && !shouldLockChessSpotControls() && activeSpot);
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

            // VR: rakip şah çekti paneli
            if (vrChessCheckOpen && vrChessCheckWindow?.visible) {
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
                        vrChessCheckPointerLeft = getVrChessCheckHit(src, session);
                        if (clickJustDown && vrChessCheckPointerLeft) clickVrChessCheckAt(vrChessCheckPointerLeft);
                        prevClickLeft = clickPressed;
                    } else if (src.handedness === 'right') {
                        vrChessCheckPointerRight = getVrChessCheckHit(src, session);
                        if (clickJustDown && vrChessCheckPointerRight) clickVrChessCheckAt(vrChessCheckPointerRight);
                        prevClickRight = clickPressed;
                    }
                }
                updateVrChessCheckWindow();
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

            if (escMenuOpen && escMenuTab === 'character' && xrActive && vrCharWindow?.visible) {
                const inputSourcesList = listXrInputSources(session);
                for (const src of inputSourcesList) {
                    const gp = src.gamepad;
                    if (!gp) continue;
                    if (src.handedness === 'left') {
                        const altGripDown = (gp.buttons?.[1]?.value || 0) > 0.42 || !!gp.buttons?.[1]?.pressed;
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

            const inputSourcesList = listXrInputSources(session)
                .slice()
                .sort((a, b) => {
                    const rank = (h) => (h === 'left' ? 0 : h === 'none' ? 1 : h === 'right' ? 2 : 3);
                    return rank(a.handedness) - rank(b.handedness);
                });
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
                        if (!(isVrChessPlayActive() && getVrChessBoard()?.onSqueezeStart?.(xrCtrl0))) {
                            if (!inputCoolingDown && !escMenuOpen && !G.gameRunning && player) {
                                const py = player.position.y;
                                if (!isJumping && py <= 0.001) {
                                    isJumping = true;
                                    jumpVel = 7.2;
                                }
                            }
                        }
                    } else if (!altGripDown && prevAltGripLeft) {
                        if (!(isVrChessPlayActive() && getVrChessBoard()?.onSqueezeEnd?.())) {
                            /* zıplama anlık tetik; bırakışta ek iş yok */
                        }
                    }
                    prevAltGripLeft = altGripDown;

                    if (!inputCoolingDown && yOrBPressed && !vrMenuToggleLatch) {
                        setEscMenuOpen(!escMenuOpen);
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
                    const runMul = triggerVal > 0.65 ? 1.8 : 1;
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

                    const kVel = 1 - Math.exp(-dt * (hasMove ? 24 : 16));
                    vrVelX += (targetVX - vrVelX) * kVel;
                    vrVelZ += (targetVZ - vrVelZ) * kVel;

                    if (Math.abs(vrVelX) > 0.0005 || Math.abs(vrVelZ) > 0.0005) {
                        vrMoveVec.set(vrVelX * dt, 0, vrVelZ * dt);

                        let nx = xrRig.position.x + vrMoveVec.x;
                        let nz = xrRig.position.z + vrMoveVec.z;
                        nx = Math.max(-94, Math.min(94, nx));
                        nz = Math.max(-98, Math.min(118, nz));
                        if ((onlineChess.active || onlineChess.watching) && !isInsideChessBoundary(nx, nz)) {
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
                        if (!(isVrChessPlayActive() && getVrChessBoard()?.onSqueezeStart?.(xrCtrl1))) {
                            tryGrabObject('right');
                        }
                    } else if (!altGripDown && prevAltGripRight) {
                        if (!(isVrChessPlayActive() && getVrChessBoard()?.onSqueezeEnd?.())) {
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
            const px = xrRig.position.x;
            const pz = xrRig.position.z;
            if (onlineChess.suppressChessSpotOfferUntilLeaveZone && !isNearChessSpot(px, pz)) {
                onlineChess.suppressChessSpotOfferUntilLeaveZone = false;
            }
            if (onlineDama.suppressDamaSpotOfferUntilLeaveZone && !isNearDamaSpot(px, pz)) {
                onlineDama.suppressDamaSpotOfferUntilLeaveZone = false;
            }
            if (performance.now() < forceVrChessQueueUntil) {
                if (onlineChess.suppressChessSpotOfferUntilLeaveZone && isNearChessSpot(px, pz)) {
                    if (vrSpotWindow) vrSpotWindow.visible = false;
                    return;
                }
                const chSpot = SPOTS.find((s) => s.game === 'ch');
                if (chSpot) {
                    activeSpot = chSpot;
                    requestChessQueueState();
                    updateChessQueueUi();
                    initVrSpotWindow();
                    if (vrSpotWindow) {
                        vrSpotWindow.visible = !!(xrActive && !escMenuOpen && !shouldLockChessSpotControls() && activeSpot);
                        if (vrSpotWindow.visible) updateVrSpotWindow();
                    }
                }
                return;
            }
            if (performance.now() < forceVrDamaQueueUntil) {
                if (onlineDama.suppressDamaSpotOfferUntilLeaveZone && isNearDamaSpot(px, pz)) {
                    if (vrSpotWindow) vrSpotWindow.visible = false;
                    return;
                }
                const daSpot = SPOTS.find((s) => s.game === 'da');
                if (daSpot) {
                    activeSpot = daSpot;
                    requestDamaQueueState();
                    updateDamaQueueUi();
                    initVrSpotWindow();
                    if (vrSpotWindow) {
                        vrSpotWindow.visible = !!(xrActive && !escMenuOpen && !shouldLockChessSpotControls() && activeSpot);
                        if (vrSpotWindow.visible) updateVrSpotWindow();
                    }
                }
                return;
            }

            let nearest = null, nearDist = Infinity;
            SPOTS.forEach(sp => {
                const dx = px - sp.pos.x;
                const dz = pz - sp.pos.z;
                const d = Math.sqrt(dx * dx + dz * dz);
                if (d < CFG.interactDist && d < nearDist) { nearDist = d; nearest = sp; }
            });

            if (refusedSpot && nearest?.id !== refusedSpot.id) refusedSpot = null;

            if (nearest && nearest.id !== refusedSpot?.id) {
                activeSpot = nearest;
                if (nearest.game === 'ch') {
                    requestChessQueueState();
                    updateChessQueueUi();
                }
                if (nearest.game === 'da') {
                    requestDamaQueueState();
                    updateDamaQueueUi();
                }
            } else {
                activeSpot = null;
            }
            if (vrSpotWindow) {
                const suppressNear =
                    (onlineChess.suppressChessSpotOfferUntilLeaveZone && isNearChessSpot(px, pz)) ||
                    (onlineDama.suppressDamaSpotOfferUntilLeaveZone && isNearDamaSpot(px, pz));
                const showSpot = !!(xrActive && !escMenuOpen && !shouldLockChessSpotControls() && activeSpot && !suppressNear);
                vrSpotWindow.visible = showSpot;
                if (vrSpotWindow.visible) updateVrSpotWindow();
            }
        }

        /* ════════════════ CAMERA ════════════════════════ */
        function updateCamera() {
            updateFollowCamera({ camera, player, playerYaw, playerPitch, CFG });
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

            if (onlineChess.suppressChessSpotOfferUntilLeaveZone && !isNearChessSpot(player.position.x, player.position.z)) {
                onlineChess.suppressChessSpotOfferUntilLeaveZone = false;
            }
            if (onlineDama.suppressDamaSpotOfferUntilLeaveZone && !isNearDamaSpot(player.position.x, player.position.z)) {
                onlineDama.suppressDamaSpotOfferUntilLeaveZone = false;
            }

            let nearest = null, nearDist = Infinity;
            SPOTS.forEach(sp => {
                const dx = player.position.x - sp.pos.x, dz = player.position.z - sp.pos.z;
                const d = Math.sqrt(dx * dx + dz * dz);
                if (d < CFG.interactDist && d < nearDist) { nearDist = d; nearest = sp; }
            });

            if (refusedSpot && nearest?.id !== refusedSpot.id) refusedSpot = null;

            const prompt = document.getElementById('interact-prompt');
            if (nearest && nearest.id === refusedSpot?.id) return;

            if (
                nearest?.game === 'ch' &&
                onlineChess.suppressChessSpotOfferUntilLeaveZone &&
                isNearChessSpot(player.position.x, player.position.z)
            ) {
                const changed = !activeSpot || activeSpot.id !== nearest.id;
                activeSpot = nearest;
                if (changed && nearest.game === 'ch') {
                    requestChessQueueState();
                    updateChessQueueUi();
                }
                prompt.style.display = 'none';
                return;
            }

            if (
                nearest?.game === 'da' &&
                onlineDama.suppressDamaSpotOfferUntilLeaveZone &&
                isNearDamaSpot(player.position.x, player.position.z)
            ) {
                const changed = !activeSpot || activeSpot.id !== nearest.id;
                activeSpot = nearest;
                if (changed && nearest.game === 'da') {
                    requestDamaQueueState();
                    updateDamaQueueUi();
                }
                prompt.style.display = 'none';
                return;
            }

            if (nearest) {
                const changed = !activeSpot || activeSpot.id !== nearest.id;
                activeSpot = nearest;
                if (changed) {
                    document.getElementById('ip-icon').textContent = nearest.icon;
                    if (nearest.game !== 'ch' && nearest.game !== 'da') {
                        document.getElementById('ip-title').textContent = nearest.title + ' oynamak ister misin?';
                        document.getElementById('ip-sub').textContent = nearest.sub;
                    }
                }
                if (nearest.game === 'ch') {
                    requestChessQueueState();
                }
                if (nearest.game === 'da') {
                    requestDamaQueueState();
                }
                if (nearest.game === 'ch') {
                    updateChessQueueUi();
                } else if (nearest.game === 'da') {
                    updateDamaQueueUi();
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
                    // VR: gerçek masalar (1-2). Web/mobil: sanal masa (0) → world masalarını doldurmaz.
                    const mesaId = mesaIdForQueueJoin({ xrActive, spotMesaId: activeSpot.mesaId });
                    if (onlineChess.active) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        document.getElementById('interact-prompt').style.display = 'none';
                        return;
                    }
                    if (onlineChess.watching) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        document.getElementById('interact-prompt').style.display = 'none';
                        return;
                    }
                    if (onlineDama.queued) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        document.getElementById('interact-prompt').style.display = 'none';
                        return;
                    }
                    if (
                        onlineChess.activeMatch &&
                        !isLocalPlayerInActiveMatch(onlineChess.activeMatch)
                        && xrActive
                    ) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        document.getElementById('interact-prompt').style.display = 'none';
                        return;
                    }
                    if (onlineChess.queued) {
                        onlineChess.queued = false;
                        mpClient?.leaveChessQueue?.(mesaId);
                        document.getElementById('interact-prompt').style.display = 'none';
                        updateChessQueueUi();
                        return;
                    }
                    onlineChess.mesaId = mesaId;
                    mpClient?.joinChessQueue?.(mesaId);
                    document.getElementById('interact-prompt').style.display = 'none';
                    updateChessQueueUi();
                    return;
                }
                if (activeSpot.game === 'da') {
                    const mesaId = mesaIdForQueueJoin({ xrActive, spotMesaId: activeSpot.mesaId });
                    if (onlineDama.active) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        document.getElementById('interact-prompt').style.display = 'none';
                        return;
                    }
                    if (onlineDama.watching) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        document.getElementById('interact-prompt').style.display = 'none';
                        return;
                    }
                    if (onlineChess.queued) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        document.getElementById('interact-prompt').style.display = 'none';
                        return;
                    }
                    if (
                        onlineDama.activeMatch &&
                        !isLocalPlayerInActiveMatch(onlineDama.activeMatch)
                        && xrActive
                    ) {
                        refusedSpot = activeSpot;
                        activeSpot = null;
                        document.getElementById('interact-prompt').style.display = 'none';
                        return;
                    }
                    if (onlineDama.queued) {
                        onlineDama.queued = false;
                        mpClient?.leaveDamaQueue?.(mesaId);
                        document.getElementById('interact-prompt').style.display = 'none';
                        updateDamaQueueUi();
                        return;
                    }
                    onlineDama.mesaId = mesaId;
                    mpClient?.joinDamaQueue?.(mesaId);
                    document.getElementById('interact-prompt').style.display = 'none';
                    updateDamaQueueUi();
                    return;
                }
                document.getElementById('interact-prompt').style.display = 'none';
                if (isLocked && document.exitPointerLock) document.exitPointerLock();
                startGame(activeSpot.game, activeSpot.id, activeSpot.title);
            });
            document.getElementById('ip-no').addEventListener('click', () => {
                if (activeSpot?.game === 'ch') {
                    dismissChessSpotPanel();
                    return;
                }
                if (activeSpot?.game === 'da') {
                    dismissDamaSpotPanel();
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

        /** Minimap / ESC haritada kullanılan yuvarlatılmış dikdörtgen. */
        function rr(ctx, x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }

        /** Kampüs minimap çizimi (VR menüdeki harita escMapCanvas’e throttled). */
        function drawCampusMapCanvas(ctx, S) {
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
        }

        /* ════════════════ MINIMAP ══════════════════════ */
        function drawMinimap() {
            // VR: harita sadece 3B ESC menüde (drawCampusMapCanvas + throttled); burada 2D çizme.
            if (xrActive) return;
            if (mmCtx) drawCampusMapCanvas(mmCtx, mmSize);
            if (escMenuOpen && escMapCtx) drawCampusMapCanvas(escMapCtx, escMapSize);
        }

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

            window.addEventListener('keydown', (e) => {
                keys[e.code] = true;
                if (['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
            });
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
                        if (['bldg-panel', 'lb-panel', 'mm-wrap', 'interact-prompt', 'score-modal', 'game-overlay', 'game-hud', 'game-quit-btn', 'esc-menu-card', 'esc-menu-backdrop'].includes(id2)) return true;
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
                    const btnEl = document.getElementById(btnId);
                    if (!btnEl) return;
                    btnEl.addEventListener('click', () => {
                        const p = document.getElementById(panelId);
                        clearTimeout(getT());
                        const op = !p.classList.contains('mob-open');
                        p.classList.toggle('mob-open', op);
                        if (op) { setT(setTimeout(() => p.classList.remove('mob-open'), 3000)); if (panelId === 'lb-panel') loadLeaderboard(currentLbGame); }
                    });
                });
                document.getElementById('m-esc-btn')?.addEventListener('click', () => setEscMenuOpen(true));
            }

            document.getElementById('game-quit-btn').addEventListener('click', () => {
                // PC satranç maçında çıkış: sunucu maçı bitirir (turnuva +1 / 0).
                if (!xrActive && currentGameType === 'ch' && onlineChess.matchId) {
                    if (onlineChess.watching) {
                        mpClient?.leaveChessWatch?.(onlineChess.matchId);
                        openChessResultModal({ title: 'İzleme', sub: 'Maç izlemeyi bıraktın.' });
                        endGame(-1);
                        return;
                    }
                    if (onlineChess.active) {
                        // Uyarı + onay paneli (Çıkarsan kaybedersin).
                        openChessExitConfirm();
                        return;
                    }
                }
                if (!xrActive && currentGameType === 'da' && onlineDama.matchId) {
                    if (onlineDama.watching) {
                        mpClient?.leaveDamaWatch?.(onlineDama.matchId);
                        openChessResultModal({ title: 'İzleme', sub: 'Dama maç izlemeyi bıraktın.' });
                        endGame(-1);
                        return;
                    }
                    if (onlineDama.active) {
                        // Uyarı + onay paneli (Çıkarsan kaybedersin).
                        openChessExitConfirm();
                        return;
                    }
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
            const eloBtn = document.getElementById('lb-chess-elo-info');
            if (eloBtn) eloBtn.style.display = isLbEloGame(game) ? 'inline-flex' : 'none';
            if (!isLbEloGame(game)) {
                document.getElementById('lb-elo-info-modal')?.classList.remove('active');
            }
            const list = document.getElementById('lb-list');
            list.innerHTML = '<div id="lb-loading">Yükleniyor…</div>';
            let data = null;
            try {
                data = await getLeaderboard(game);
            } catch (e) {
                data = null;
            }
            if (!data) {
                list.innerHTML =
                    '<div class="lb-empty">Bağlantı yok. <code>npm run server</code> (örn. :4000) çalışıyor mu? Ön yüzü Vite ile açın; <code>/api</code> proxy kullanılır. PostgreSQL <code>.env</code> ayarlarını kontrol edin.</div>';
                return;
            }
            if (!data.length) { list.innerHTML = '<div class="lb-empty">Henüz kayıt yok! İlk sen ol 🏅</div>'; return; }
            if (isLbEloGame(game)) {
                list.innerHTML = data
                    .map((row, i) => {
                        const place = i + 1;
                        const w = Number(row.wins) || 0;
                        const l = Number(row.losses) || 0;
                        const d = Number(row.draws) || 0;
                        const g = Number(row.games) || 0;
                        const elo = Math.round(Number(row.elo) || 1500);
                        const medal =
                            place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : '';
                        return `
                    <div class="lb-row lb-row--chess" data-lb-vr-place="${place}" data-lb-vr-medal="${medal}">
                      <span class="lb-rank">${lbRankMedalHtml(place)}</span>
                      <span class="lb-name">${esc(row.player_name)}</span>
                      <span class="lb-chess-meta" title="Arpad Elo: beklenti skoru ve K katsayısı ile güncellenir.">Elo: ${elo} · G: ${w} · M: ${l} · B: ${d} · Oyun: ${g}</span>
                    </div>`;
                    })
                    .join('');
            } else {
                list.innerHTML = data
                    .map((row, i) => {
                        const place = i + 1;
                        const medal =
                            place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : '';
                        return `
                    <div class="lb-row" data-lb-vr-place="${place}" data-lb-vr-medal="${medal}">
                      <span class="lb-rank">${lbRankMedalHtml(place)}</span>
                      <span class="lb-name">${esc(row.player_name)}</span>
                      <span class="lb-score">${row.score}</span>
                    </div>`;
                    })
                    .join('');
            }
        }

        function setupLeaderboard() {
            const lbBody = document.getElementById('lb-body');
            const lbTabs = document.getElementById('lb-tabs');
            if (lbBody && lbTabs && !document.getElementById('lb-chess-elo-info')) {
                const row = document.createElement('div');
                row.className = 'lb-tabs-row';
                lbTabs.parentNode.insertBefore(row, lbTabs);
                row.appendChild(lbTabs);
                const eloBtn = document.createElement('button');
                eloBtn.type = 'button';
                eloBtn.id = 'lb-chess-elo-info';
                eloBtn.className = 'lb-chess-elo-info-btn';
                eloBtn.textContent = 'ⓘ';
                eloBtn.title = 'Elo (Satranç ve Dama) nasıl çalışır?';
                eloBtn.setAttribute('aria-label', 'Elo sistemi bilgisi');
                eloBtn.style.display = 'none';
                eloBtn.addEventListener('click', () => {
                    document.getElementById('lb-elo-info-modal')?.classList.add('active');
                });
                row.appendChild(eloBtn);
            }
            if (!document.getElementById('lb-elo-info-modal')) {
                const modal = document.createElement('div');
                modal.id = 'lb-elo-info-modal';
                modal.className = 'lb-elo-info-modal';
                modal.innerHTML = `
<div class="lb-elo-info-card" role="dialog" aria-modal="true" aria-labelledby="lb-elo-info-title">
  <h3 id="lb-elo-info-title">Satranç ve Dama — Elo (Arpad Elo)</h3>
  <p>Bu sekmelerde sıralama <strong>Elo rating</strong> ile yapılır. Sistem, fizikçi ve satranç ustası <strong>Arpad Elo</strong>’nun önerdiği matematiksel modele dayanır; satranç ve dama liderlik tabloları aynı ilkelere göre güncellenir.</p>
  <ul class="lb-elo-info-list">
    <li><strong>Başlangıç:</strong> İlk kayıtta Elo <strong>1500</strong> kabul edilir.</li>
    <li><strong>Beklenen skor:</strong> Güçlü rakibe karşı galibiyet beklenenden fazla puan getirir; zayıf rakibe yenilince daha çok puan kaybedilir.</li>
    <li><strong>K katsayısı:</strong> İlk 30 maçta <strong>K = 40</strong> (hızlı yerleşim); sonrasında genelde <strong>20</strong>, çok yüksek ratingde <strong>10</strong>.</li>
    <li><strong>Beraberlik:</strong> Pat gibi beraberliklerde her iki tarafın Elo’su beklenen sonuca göre güncellenir (0,5 gerçek skor).</li>
    <li><strong>Sıra:</strong> Listede önce <strong>yüksek Elo</strong>; eşitlikte daha az maça göre ikincil sıra kullanılır.</li>
  </ul>
  <p class="lb-elo-info-note">Taçlar: Satranç veya damada ilk 3’te olduğunda Ayarlar’dan taçını seçebilirsin (liderlik listesinde yalnız taç ikonu gösterilir).</p>
  <button type="button" class="lb-elo-info-close" data-close-elo="1">Kapat</button>
</div>`;
                modal.addEventListener('click', (e) => {
                    if (e.target === modal || e.target?.dataset?.closeElo === '1') modal.classList.remove('active');
                });
                document.body.appendChild(modal);
            }
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

        function leaderboardSaveName() {
            return String(localNickname || 'Oyuncu').trim().slice(0, 64) || 'Oyuncu';
        }

        /** Kampüs oyunları: bu tur skoru vs listedeki rekor; `savedRow.unchanged` → rekor düşmediyse övünç yok. */
        function applyScoreModalRankUi(gameId, roundScore, savedRow, rank) {
            const ri = document.getElementById('sm-rank-info');
            const recEl = document.getElementById('sm-score-record');
            const roundNum = Number(roundScore);
            const bestNum =
                savedRow && savedRow.score != null && savedRow.score !== ''
                    ? Number(savedRow.score)
                    : roundNum;

            if (recEl) {
                if (
                    !isLbEloGame(gameId) &&
                    Number.isFinite(bestNum) &&
                    Number.isFinite(roundNum) &&
                    bestNum !== roundNum
                ) {
                    recEl.style.display = 'block';
                    recEl.textContent = `Liderlikte tutulan en iyi skor: ${bestNum}`;
                } else {
                    recEl.style.display = 'none';
                    recEl.textContent = '';
                }
            }

            if (!ri) return;

            if (isLbEloGame(gameId)) {
                if (rank === 1) ri.textContent = '🥇 Tebrikler! 1. sıradasın!';
                else if (rank === 2) ri.textContent = '🥈 Harika! 2. sıradasın!';
                else if (rank === 3) ri.textContent = '🥉 Güzel! 3. sıradasın!';
                else if (rank != null && Number.isFinite(rank)) ri.textContent = `🎉 ${rank}. sıradasın!`;
                else ri.textContent = '✅ Kaydedildi!';
                return;
            }

            const recordUnchanged = savedRow?.unchanged === true;
            if (recordUnchanged) {
                if (rank != null && Number.isFinite(rank)) {
                    ri.textContent = `Bu tur ${roundNum} oldu; rekorun güncellenmedi. En iyi skorun (${bestNum}) ile ${rank}. sıradasın.`;
                } else {
                    ri.textContent = `Bu tur ${roundNum}. Rekorun aynı kaldı (en iyi: ${bestNum}).`;
                }
                return;
            }

            if (rank === 1) ri.textContent = '🥇 Tebrikler! En iyi skorunla 1. sıradasın!';
            else if (rank === 2) ri.textContent = '🥈 Harika! En iyi skorunla 2. sıradasın!';
            else if (rank === 3) ri.textContent = '🥉 Güzel! En iyi skorunla 3. sıradasın!';
            else if (rank != null && Number.isFinite(rank)) ri.textContent = `🎉 En iyi skorunla ${rank}. sıradasın!`;
            else ri.textContent = '✅ Kaydedildi!';
        }

        function showScoreModal(gameId, gameTitle, score) {
            void runScoreModalAutoSave(gameId, gameTitle, score);
        }

        async function runScoreModalAutoSave(gameId, gameTitle, score) {
            if (gameId == null || gameId === '' || String(gameTitle).toLowerCase() === 'null') {
                console.warn('Skor modalı atlandı: geçersiz oyun bilgisi');
                return;
            }
            pendingGame = gameId;
            pendingScore = score;
            const saveName = leaderboardSaveName();
            document.getElementById('sm-game-name').textContent = gameTitle + ' – Oyun Bitti!';
            document.getElementById('sm-score-val').textContent =
                isLbEloGame(gameId) ? String(score) : `Bu tur: ${score}`;
            {
                const sr = document.getElementById('sm-score-record');
                if (sr) {
                    sr.style.display = 'none';
                    sr.textContent = '';
                }
            }
            const nameEl = document.getElementById('sm-name');
            if (nameEl) {
                nameEl.value = saveName;
                nameEl.style.display = 'none';
            }
            const hint = document.getElementById('sm-hint');
            if (hint) hint.textContent = `Skorun «${saveName}» olarak kaydediliyor…`;
            document.getElementById('sm-rank-info').className = '';
            document.getElementById('sm-rank-info').textContent = '';
            document.getElementById('sm-close-btn').className = '';
            document.getElementById('sm-save').style.display = 'none';
            document.getElementById('sm-skip').style.display = 'none';
            document.getElementById('score-modal').classList.add('active');

            const ri = document.getElementById('sm-rank-info');
            ri.textContent = 'Kaydediliyor…';
            ri.classList.add('visible');

            try {
                const savedRow = await saveScore(gameId, saveName, score, localSessionToken || undefined);
                const scoreForRank =
                    savedRow && savedRow.score != null && savedRow.score !== ''
                        ? Number(savedRow.score)
                        : Number(score);
                let rank = null;
                if (gameId === 'satranc') {
                    const rr =
                        localUserId != null
                            ? await getChessLeaderboardRankByUser(Number(localUserId)).catch(() => null)
                            : await getChessLeaderboardRank(saveName).catch(() => null);
                    rank = rr?.rank != null ? Number(rr.rank) : null;
                } else if (gameId === 'dama') {
                    const rr =
                        localUserId != null
                            ? await getDamaLeaderboardRankByUser(Number(localUserId)).catch(() => null)
                            : await getDamaLeaderboardRank(saveName).catch(() => null);
                    rank = rr?.rank != null ? Number(rr.rank) : null;
                } else {
                    const rankRes = await getRank(gameId, scoreForRank).catch(() => null);
                    rank = rankRes?.rank != null ? Number(rankRes.rank) : null;
                }
                document.getElementById('sm-save').style.display = 'none';
                document.getElementById('sm-skip').style.display = 'none';
                    if (hint) {
                        if (!isLbEloGame(gameId) && savedRow?.unchanged) {
                            hint.textContent = `Bu tur ${score}. Liderlik rekorun değişmedi.`;
                        } else {
                            hint.textContent = `Skor «${saveName}» adıyla kaydedildi.`;
                        }
                    }
                applyScoreModalRankUi(gameId, score, savedRow, rank);
                ri.classList.add('visible');
                document.getElementById('sm-close-btn').classList.add('visible');
                loadLeaderboard(gameId);
                document.querySelectorAll('.lb-tab').forEach((t) => {
                    if (t.dataset.game === gameId) t.click();
                });
            } catch (err) {
                console.error('Skor kaydetme hatası:', err);
                ri.textContent = `❌ Kaydedilemedi: ${err.message || err}. Tekrar dene.`;
                ri.classList.add('visible');
                document.getElementById('sm-save').style.display = '';
                document.getElementById('sm-save').textContent = 'Tekrar dene';
                document.getElementById('sm-save').disabled = false;
                document.getElementById('sm-skip').style.display = '';
            }
        }

        function setupScoreModal() {
            document.getElementById('sm-save').addEventListener('click', async () => {
                const name = leaderboardSaveName();
                document.getElementById('sm-save').textContent = 'Kaydediliyor…';
                document.getElementById('sm-save').disabled = true;
                try {
                    const savedRow = await saveScore(
                        pendingGame,
                        name,
                        pendingScore,
                        localSessionToken || undefined
                    );
                    const scoreForRank =
                        savedRow && savedRow.score != null && savedRow.score !== ''
                            ? Number(savedRow.score)
                            : Number(pendingScore);
                    let rank = null;
                    if (pendingGame === 'satranc') {
                        const rr =
                            localUserId != null
                                ? await getChessLeaderboardRankByUser(Number(localUserId)).catch(() => null)
                                : await getChessLeaderboardRank(name).catch(() => null);
                        rank = rr?.rank != null ? Number(rr.rank) : null;
                    } else if (pendingGame === 'dama') {
                        const rr =
                            localUserId != null
                                ? await getDamaLeaderboardRankByUser(Number(localUserId)).catch(() => null)
                                : await getDamaLeaderboardRank(name).catch(() => null);
                        rank = rr?.rank != null ? Number(rr.rank) : null;
                    } else {
                        const rankRes = await getRank(pendingGame, scoreForRank).catch(() => null);
                        rank = rankRes?.rank != null ? Number(rankRes.rank) : null;
                    }
                    document.getElementById('sm-save').style.display = 'none';
                    document.getElementById('sm-skip').style.display = 'none';
                    const smHint = document.getElementById('sm-hint');
                    if (smHint) {
                        if (!isLbEloGame(pendingGame) && savedRow?.unchanged) {
                            smHint.textContent = `Bu tur ${pendingScore}. Liderlik rekorun değişmedi.`;
                        } else {
                            smHint.textContent = `Skor «${name}» adıyla kaydedildi.`;
                        }
                    }
                    applyScoreModalRankUi(pendingGame, pendingScore, savedRow, rank);
                    const ri = document.getElementById('sm-rank-info');
                    ri.classList.add('visible');
                    document.getElementById('sm-close-btn').classList.add('visible');
                    loadLeaderboard(pendingGame);
                    document.querySelectorAll('.lb-tab').forEach((t) => {
                        if (t.dataset.game === pendingGame) t.click();
                    });
                } catch (err) {
                    console.error('Skor kaydetme hatası:', err);
                    const ri = document.getElementById('sm-rank-info');
                    ri.textContent = `❌ Kaydedilemedi: ${err.message || err}`;
                    ri.classList.add('visible');
                    document.getElementById('sm-save').textContent = 'Tekrar dene';
                    document.getElementById('sm-save').disabled = false;
                }
            });

            document.getElementById('sm-skip').addEventListener('click', () => {
                document.getElementById('score-modal').classList.remove('active');
                if (!IS_MOB && !G.gameRunning) setTimeout(() => renderer.domElement.requestPointerLock(), 300);
            });
            document.getElementById('sm-close-btn').addEventListener('click', () => {
                document.getElementById('score-modal').classList.remove('active');
                document.getElementById('sm-save').textContent = 'Tekrar dene';
                document.getElementById('sm-save').disabled = false;
                if (!IS_MOB && !G.gameRunning) setTimeout(() => renderer.domElement.requestPointerLock(), 300);
            });
        }

        /* ════════════════════════════════════════════════
           ══ MINI GAME ENGINE ═════════════════════════
        ════════════════════════════════════════════════ */
        let currentGame = null, currentGameId = null, currentGameTitle = null, currentGameType = null;
        function setupMiniGames() { setupScoreModal(); }

        const WEB_CHESS_VIEW_MODE_KEY = 'vrHarranWebChessViewMode';

        function getWebChessDesktopView2d() {
            try {
                return localStorage.getItem(WEB_CHESS_VIEW_MODE_KEY) === '2d';
            } catch (_) {
                return false;
            }
        }

        function syncWebChessDesktopViewToolbar() {
            const b2 = document.getElementById('web-chess-view-2d');
            const b3 = document.getElementById('web-chess-view-3d');
            const is2d = getWebChessDesktopView2d();
            if (b2) {
                b2.classList.toggle('web-chess-view-mode-active', is2d);
                b2.setAttribute('aria-pressed', is2d ? 'true' : 'false');
            }
            if (b3) {
                b3.classList.toggle('web-chess-view-mode-active', !is2d);
                b3.setAttribute('aria-pressed', !is2d ? 'true' : 'false');
            }
        }

        /** 2D modda wrap flex:1 boşluk yaratıp tahtayı aşağı iter; sıkı paket + dikey ortalama. */
        function setGameChess3dWrapCompact(compact) {
            const w = document.getElementById('game-chess-3d-wrap');
            if (!w) return;
            if (compact) {
                w.style.flex = '0 0 auto';
                w.style.flexGrow = '0';
                w.style.flexShrink = '0';
                w.style.maxHeight = 'none';
            } else {
                w.style.flex = '1 1 auto';
                w.style.flexGrow = '1';
                w.style.maxHeight = 'min(88vh, 720px)';
            }
        }

        function applyWebChessDesktopLayout(is2d) {
            const canvas = document.getElementById('game-canvas');
            const host = document.getElementById('web-chess-3d-host');
            const chess3dWrap = document.getElementById('game-chess-3d-wrap');
            if (!canvas || !host) return;
            if (chess3dWrap) chess3dWrap.style.display = 'flex';
            setGameChess3dWrapCompact(!!is2d);
            const goLay = document.getElementById('game-overlay');
            if (goLay?.classList.contains('active')) {
                goLay.classList.toggle('game-overlay--web-chess-2d', !!is2d);
            }
            if (is2d) {
                canvas.style.display = 'block';
                host.style.display = 'none';
                document.querySelectorAll('.web-chess-3d-cam-only').forEach((el) => {
                    el.style.display = 'none';
                });
            } else {
                canvas.style.display = 'none';
                host.style.display = '';
                document.querySelectorAll('.web-chess-3d-cam-only').forEach((el) => {
                    el.style.display = '';
                });
            }
        }

        /**
         * Web masaüstü çevrimiçi maçta 2D ↔ 3D anlık geçiş (FEN + maç bağlamı korunur).
         */
        function swapWebChessDesktopViewMode(to2d) {
            if (IS_MOB || xrActive) return;
            if (currentGameType !== 'ch' || onlineChess.matchId == null) return;
            if (chessUiPhase !== ChessUIPhase.PLAYING) return;
            const is2dNow = !!(currentGame && currentGame !== onlineChess3dViewport);
            if (to2d === is2dNow) return;
            try {
                try {
                    localStorage.setItem(WEB_CHESS_VIEW_MODE_KEY, to2d ? '2d' : '3d');
                } catch (_) { /* ignore */ }
                syncWebChessDesktopViewToolbar();
                const st = onlineChess.lastState || {};
                const mid = Number(onlineChess.matchId);
                const isSpectator = !!onlineChess.watching;
                const fen =
                    (onlineChess3dViewport && onlineChess3dViewport.chess?.fen?.()) ||
                    (currentGame && currentGame.chess && typeof currentGame.chess.fen === 'function'
                        ? currentGame.chess.fen()
                        : null) ||
                    st.fen ||
                    null;
                const matchPayload = {
                    matchId: mid,
                    fen: fen || undefined,
                    yourColor: isSpectator ? 'spectator' : onlineChess.myColor === 'black' ? 'black' : 'white',
                    white: st.white || onlineChess.white,
                    black: st.black || onlineChess.black,
                    role: isSpectator ? 'spectator' : undefined
                };
                const ctxOpts = {
                    enabled: !isSpectator,
                    matchId: mid,
                    myColor: isSpectator ? null : onlineChess.myColor,
                    onMatchOver: (p) => finalizeChessMatchFromServer(p)
                };
                const webChess3dHost = document.getElementById('web-chess-3d-host');
                if (!webChess3dHost) return;
                if (currentGame) {
                    const wasV = currentGame === onlineChess3dViewport;
                    try {
                        currentGame.destroy?.();
                    } catch (_) { /* ignore */ }
                    currentGame = null;
                    if (wasV) onlineChess3dViewport = null;
                }
                const W = Math.min(600, innerWidth * 0.98);
                const H = Math.min(420, innerHeight * 0.72);
                const canvas = document.getElementById('game-canvas');
                canvas.width = W;
                canvas.height = H;
                canvas.style.width = `${W}px`;
                canvas.style.height = `${H}px`;
                applyWebChessDesktopLayout(to2d);
                if (to2d) {
                    currentGame = new ChessGame(canvas, W, H, endGame, {
                        mode: 'pvp',
                        localPlayerId,
                        matchId: mid,
                        multiplayer: mpClient,
                        spectator: isSpectator
                    });
                    currentGame.onChessMatchStarted(matchPayload);
                    currentGame.start();
                } else {
                    onlineChess3dViewport = new OnlineChess3D({
                        runtime: 'viewport',
                        host: webChess3dHost,
                        done: endGame,
                        mode: 'pvp',
                        matchId: mid,
                        multiplayer: mpClient,
                        spectator: isSpectator,
                        viewerUserId: localUserId != null ? Number(localUserId) : null
                    });
                    onlineChess3dViewport.setOnlineContext(ctxOpts);
                    onlineChess3dViewport.onChessMatchStarted(matchPayload);
                    onlineChess3dViewport.start();
                    currentGame = onlineChess3dViewport;
                }
                mpClient?.getChessState?.(mid);
            } catch (err) {
                console.error('swapWebChessDesktopViewMode', err);
            }
        }

        function setupWebChessDesktopViewMode() {
            if (IS_MOB) return;
            const b2 = document.getElementById('web-chess-view-2d');
            const b3 = document.getElementById('web-chess-view-3d');
            if (!b2 || !b3) return;
            syncWebChessDesktopViewToolbar();
            b2.addEventListener('click', () => {
                try {
                    localStorage.setItem(WEB_CHESS_VIEW_MODE_KEY, '2d');
                } catch (_) { /* ignore */ }
                syncWebChessDesktopViewToolbar();
                swapWebChessDesktopViewMode(true);
            });
            b3.addEventListener('click', () => {
                try {
                    localStorage.setItem(WEB_CHESS_VIEW_MODE_KEY, '3d');
                } catch (_) { /* ignore */ }
                syncWebChessDesktopViewToolbar();
                swapWebChessDesktopViewMode(false);
            });
        }

        const WEB_DAMA_VIEW_MODE_KEY = 'vrHarranWebDamaViewMode';

        function getWebDamaDesktopView2d() {
            try {
                return localStorage.getItem(WEB_DAMA_VIEW_MODE_KEY) === '2d';
            } catch (_) {
                return false;
            }
        }

        function syncWebDamaDesktopViewToolbar() {
            const b2 = document.getElementById('web-dama-view-2d');
            const b3 = document.getElementById('web-dama-view-3d');
            const is2d = getWebDamaDesktopView2d();
            if (b2) {
                b2.classList.toggle('web-chess-view-mode-active', is2d);
                b2.setAttribute('aria-pressed', is2d ? 'true' : 'false');
            }
            if (b3) {
                b3.classList.toggle('web-chess-view-mode-active', !is2d);
                b3.setAttribute('aria-pressed', !is2d ? 'true' : 'false');
            }
        }

        function setGameDama3dWrapCompact(compact) {
            const w = document.getElementById('game-dama-3d-wrap');
            if (!w) return;
            if (compact) {
                w.style.flex = '0 0 auto';
                w.style.flexGrow = '0';
                w.style.flexShrink = '0';
                w.style.maxHeight = 'none';
            } else {
                w.style.flex = '1 1 auto';
                w.style.flexGrow = '1';
                w.style.maxHeight = 'min(88vh, 720px)';
            }
        }

        function applyWebDamaDesktopLayout(is2d) {
            const overlay = document.getElementById('game-overlay');
            if (overlay?.classList.contains('active')) {
                overlay.classList.toggle('game-overlay--web-chess-2d', !!is2d);
            }
            setGameDama3dWrapCompact(!!is2d);
            document.querySelectorAll('#game-dama-3d-wrap .web-chess-3d-cam-only').forEach((el) => {
                el.style.display = is2d ? 'none' : '';
            });
        }

        function swapWebDamaDesktopViewMode(to2d) {
            if (IS_MOB || xrActive) return;
            if (currentGameType !== 'da' || onlineDama.matchId == null) return;
            if (damaUiPhase !== DamaUIPhase.PLAYING) return;
            if (currentGame !== onlineDama3dViewport || !onlineDama3dViewport?.setWebViewMode) return;
            const already2d = onlineDama3dViewport.webViewMode === '2d';
            if (to2d === already2d) return;
            try {
                try {
                    localStorage.setItem(WEB_DAMA_VIEW_MODE_KEY, to2d ? '2d' : '3d');
                } catch (_) { /* ignore */ }
                syncWebDamaDesktopViewToolbar();
                applyWebDamaDesktopLayout(to2d);
                onlineDama3dViewport.setWebViewMode(to2d ? '2d' : '3d');
            } catch (err) {
                console.error('swapWebDamaDesktopViewMode', err);
            }
        }

        function setupWebDamaDesktopViewMode() {
            if (IS_MOB) return;
            const b2 = document.getElementById('web-dama-view-2d');
            const b3 = document.getElementById('web-dama-view-3d');
            if (!b2 || !b3) return;
            syncWebDamaDesktopViewToolbar();
            b2.addEventListener('click', () => swapWebDamaDesktopViewMode(true));
            b3.addEventListener('click', () => swapWebDamaDesktopViewMode(false));
        }

        /** Yerel VR satranç + web overlay; kampüs dünya tahtası kalır */
        function clearVrChessOverlaysOnly() {
            if (vrChessStandalone) {
                try {
                    vrChessStandalone.dispose?.();
                } catch (_) { /* ignore */ }
                vrChessStandalone = null;
            }
            if (onlineChess3dViewport) {
                if (currentGame === onlineChess3dViewport) currentGame = null;
                try {
                    onlineChess3dViewport.dispose?.();
                } catch (_) { /* ignore */ }
                onlineChess3dViewport = null;
            }
        }

        function clearVrDamaOverlaysOnly() {
            if (onlineDama3dViewport) {
                if (currentGame === onlineDama3dViewport) currentGame = null;
                try {
                    onlineDama3dViewport.dispose?.();
                } catch (_) { /* ignore */ }
                onlineDama3dViewport = null;
            }
        }

        /** Ana meydandaki çevrimiçi tahta — bir kez monte, maç bitince resetToIdle */
        function ensureWorldChessBoard(mesaId = 1) {
            const mid = mesaId != null ? Number(mesaId) : 1;
            const existing = onlineChess3dByMesa.get(mid);
            if (existing?.runtime === 'world' && existing.persistWorld && existing.scene === scene) {
                onlineChess3d = existing;
                return;
            }
            const chSpot = SPOTS.find((s) => s.game === 'ch' && Number(s.mesaId || 1) === mid);
            if (!chSpot || !scene) return;
            const anchor = { x: chSpot.pos.x, y: 0.56, z: chSpot.pos.z, yaw: 0 };
            const b = new OnlineChess3D({
                runtime: 'world',
                scene,
                anchor,
                onEnd: () => {},
                mode: 'pvp',
                matchId: null,
                multiplayer: mpClient,
                persistWorld: true,
                viewerUserId: localUserId != null ? Number(localUserId) : null
            });
            b.root.userData.persistWorldChess = true;
            b.setOnlineContext({ enabled: false, matchId: null, myColor: null });
            b.mount();
            if (!xrActive) b.bindScreenPointerInput(camera, renderer.domElement);
            onlineChess3dByMesa.set(mid, b);
            onlineChess3d = b;
        }

        function syncWorldPvpChessFromPayload(payload, { spectator = false } = {}) {
            if (!payload?.matchId) return;
            const mid = payload?.mesaId != null ? Number(payload.mesaId) : (onlineChess.mesaId ?? 1);
            ensureWorldChessBoard(mid);
            const isSpectator = !!spectator;
            const ctx = {
                enabled: !isSpectator,
                matchId: payload.matchId,
                myColor: isSpectator ? null : normalizeChessPlayerColor(payload),
                onMatchOver: (p) => finalizeChessMatchFromServer(p)
            };
            onlineChess3d.setSpectator(isSpectator);
            onlineChess3d.setOnlineContext(ctx);
            onlineChess3d.onChessMatchStarted(payload);
            if (!xrActive) onlineChess3d.bindScreenPointerInput(camera, renderer.domElement);
            if (onlineChess3dViewport) {
                onlineChess3dViewport.setSpectator(isSpectator);
                onlineChess3dViewport.setOnlineContext(ctx);
                onlineChess3dViewport.onChessMatchStarted(payload);
            }
        }

        function ensureWorldDamaBoard(mesaId = 1) {
            const mid = mesaId != null ? Number(mesaId) : 1;
            const existing = onlineDama3dByMesa.get(mid);
            if (existing?.runtime === 'world' && existing.persistWorld && existing.scene === scene) {
                onlineDama3d = existing;
                return;
            }
            const daSpot = SPOTS.find((s) => s.game === 'da' && Number(s.mesaId || 1) === mid);
            if (!daSpot || !scene) return;
            const anchor = { x: daSpot.pos.x, y: 0.56, z: daSpot.pos.z, yaw: 0 };
            const b = new OnlineDama3D({
                runtime: 'world',
                scene,
                anchor,
                onEnd: () => {},
                mode: 'pvp',
                matchId: null,
                multiplayer: mpClient,
                persistWorld: true,
                viewerUserId: localUserId != null ? Number(localUserId) : null,
                onDamaUiHint: (msg) => showChessNotice(msg, 2800)
            });
            b.root.userData.persistWorldDama = true;
            b.setOnlineContext({ enabled: false, matchId: null, myColor: null });
            b.mount();
            if (!xrActive) b.bindScreenPointerInput(camera, renderer.domElement);
            onlineDama3dByMesa.set(mid, b);
            onlineDama3d = b;
        }

        function syncWorldPvpDamaFromPayload(payload, { spectator = false } = {}) {
            if (!payload?.matchId) return;
            const mid = payload?.mesaId != null ? Number(payload.mesaId) : (onlineDama.mesaId ?? 1);
            ensureWorldDamaBoard(mid);
            const isSpectator = !!spectator;
            const mergedColor =
                isSpectator ? null : onlineDama.myColor || payload.yourColor || normalizeDamaPlayerColor(payload);
            const ctx = {
                enabled: !isSpectator,
                matchId: payload.matchId,
                myColor: mergedColor,
                onMatchOver: (p) => finalizeDamaMatchFromServer(p)
            };
            const payloadForVp = { ...payload, yourColor: mergedColor || payload.yourColor };
            onlineDama3d.setSpectator(isSpectator);
            onlineDama3d.setOnlineContext(ctx);
            onlineDama3d.onDamaMatchStarted(payloadForVp);
            if (!xrActive) onlineDama3d.bindScreenPointerInput(camera, renderer.domElement);
            if (onlineDama3dViewport) {
                onlineDama3dViewport.setSpectator(isSpectator);
                onlineDama3dViewport.setOnlineContext(ctx);
                onlineDama3dViewport.onDamaMatchStarted(payloadForVp);
            }
        }

        function clearVrChess() {
            clearVrChessOverlaysOnly();
            if (onlineChess3d?.runtime === 'world' && typeof onlineChess3d.resetToIdle === 'function') {
                try {
                    onlineChess3d.resetToIdle();
                } catch (_) { /* ignore */ }
                return;
            }
            if (onlineChess3d) {
                try {
                    onlineChess3d.dispose?.();
                } catch (_) { /* ignore */ }
                onlineChess3d = null;
            }
            disposeLooseVrChessBoardsInScene();
        }

        function clearVrDama() {
            clearVrDamaOverlaysOnly();
            if (onlineDama3d?.runtime === 'world' && typeof onlineDama3d.resetToIdle === 'function') {
                try {
                    onlineDama3d.resetToIdle();
                } catch (_) { /* ignore */ }
                return;
            }
            if (onlineDama3d) {
                try {
                    onlineDama3d.dispose?.();
                } catch (_) { /* ignore */ }
                onlineDama3d = null;
            }
            disposeLooseVrChessBoardsInScene();
        }

        /** Referans kaybı / yarım dispose sonrası sahnede kalan VR tahta köklerini temizler */
        function disposeLooseVrChessBoardsInScene() {
            if (!scene) return;
            const roots = [];
            scene.traverse((obj) => {
                if (obj.name === 'OnlineChessBoard3D' && obj.userData.persistWorldChess) return;
                if (obj.name === 'OnlineDamaBoard3D' && obj.userData.persistWorldDama) return;
                if (obj.name === 'VrChessStandalone' || obj.name === 'OnlineChessBoard3D' || obj.name === 'OnlineDamaBoard3D')
                    roots.push(obj);
            });
            for (const root of roots) {
                root.traverse((o) => {
                    if (o.isMesh) {
                        o.geometry?.dispose?.();
                        const mat = o.material;
                        if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
                        else mat?.dispose?.();
                    }
                });
                root.removeFromParent();
            }
        }

        function isVrSessionPresenting() {
            return !!xrActive || !!(renderer?.xr?.isPresenting);
        }

        function softResetChessForReplay() {
            // Tamam / yeni tur: Aşama 2 CLEANUP — tahta kaldırılır, kuyruk tekrar açılır.
            closeVrChessResult();
            closeChessResultModal();
            chessUiPhase = ChessUIPhase.CLEANUP;
            processedChessMatchEndId = null;
            onlineChess.active = false;
            onlineChess.watching = false;
            onlineChess.queued = false;
                onlineChess.exiting = false;
            onlineChess.matchId = null;
            onlineChess.lastState = null;
            closeChessExitConfirm();
            lastVrChessWasOnlinePvp = false;
            currentGameId = null;
            currentGameTitle = null;
            currentGameType = null;
            if (currentGame) {
                try {
                    currentGame.destroy?.();
                } catch (_) { /* ignore */ }
                currentGame = null;
            }
            clearVrChess();
            removeOrphanChessDomHuds();
            if (G.gameRunning) endGame(-1);
            chessUiPhase = ChessUIPhase.IDLE;

            const chSpot = SPOTS.find((s) => s.game === 'ch');
            if (chSpot) activeSpot = chSpot;

            requestChessQueueState(true);
            updateChessQueueUi();

            if (xrActive) {
                initVrSpotWindow();
                updateVrSpotWindow();
                if (!onlineChess.suppressChessSpotOfferUntilLeaveZone) {
                    if (vrSpotWindow) vrSpotWindow.visible = !!(!escMenuOpen && activeSpot);
                    forceShowVrChessQueueMenu(12000);
                } else if (vrSpotWindow) {
                    vrSpotWindow.visible = false;
                }
            } else {
                const prompt = document.getElementById('interact-prompt');
                if (prompt && activeSpot?.game === 'ch' && !onlineChess.suppressChessSpotOfferUntilLeaveZone) {
                    prompt.style.display = 'block';
                }
            }
        }

        function startGame(type, id, title, options = {}) {
            if (escMenuOpen) setEscMenuOpen(false);
            const startingVrChess = type === 'ch' && xrActive;
            const startingVrDama = type === 'da' && xrActive;
            /** Sadece VR + çevrimiçi PvP: dünya tahtası G.gameRunning kullanmaz. Web masaüstü PvP overlay kapanışı için gerekli. */
            const startingWorldPvpChess = type === 'ch' && options.mode === 'pvp' && xrActive;
            const startingWorldPvpDama = type === 'da' && options.mode === 'pvp' && xrActive;
            if (!startingVrChess && !startingWorldPvpChess && !startingVrDama && !startingWorldPvpDama) G.gameRunning = true;
            if (vrSpotWindow) vrSpotWindow.visible = false;
            currentGameId = id;
            currentGameTitle = title;
            currentGameType = type;
            if (IS_MOB) {
                resetJoy(); LOOK.active = false; LOOK.id = -1;
                ['joy-base', 'joy-label', 'm-bldg-btn', 'm-map-btn', 'm-lb-btn', 'm-esc-btn'].forEach(id2 => {
                    const el = document.getElementById(id2); if (el) el.style.display = 'none';
                });
            }
            const overlay = document.getElementById('game-overlay');
            const isVrChess = type === 'ch' && xrActive;
            const isVrDama = type === 'da' && xrActive;
            if (!isVrChess && !isVrDama) overlay.classList.add('active');
            const canvas = document.getElementById('game-canvas');
            const chess3dWrap = document.getElementById('game-chess-3d-wrap');
            const dama3dWrap = document.getElementById('game-dama-3d-wrap');
            const webChess3dHost = document.getElementById('web-chess-3d-host');
            const webDama3dHost = document.getElementById('web-dama-3d-host');
            const useWebChessPvpPanel = type === 'ch' && options.mode === 'pvp' && !xrActive && !IS_MOB;
            const webChessDesktop2d = useWebChessPvpPanel && getWebChessDesktopView2d();
            const useWebDamaPvpPanel = type === 'da' && options.mode === 'pvp' && !xrActive && !IS_MOB;
            const webDamaDesktop2d = useWebDamaPvpPanel && getWebDamaDesktopView2d();
            if (chess3dWrap && canvas) {
                if (useWebChessPvpPanel) {
                    if (dama3dWrap) dama3dWrap.style.display = 'none';
                    chess3dWrap.style.display = 'flex';
                    if (webChessDesktop2d) {
                        setGameChess3dWrapCompact(true);
                        canvas.style.display = 'block';
                        if (webChess3dHost) webChess3dHost.style.display = 'none';
                        document.querySelectorAll('.web-chess-3d-cam-only').forEach((el) => {
                            el.style.display = 'none';
                        });
                    } else {
                        setGameChess3dWrapCompact(false);
                        canvas.style.display = 'none';
                        if (webChess3dHost) webChess3dHost.style.display = '';
                        document.querySelectorAll('.web-chess-3d-cam-only').forEach((el) => {
                            el.style.display = '';
                        });
                    }
                    overlay.classList.toggle('game-overlay--web-chess-2d', webChessDesktop2d);
                } else {
                    chess3dWrap.style.display = 'none';
                    if (dama3dWrap) dama3dWrap.style.display = 'none';
                    setGameChess3dWrapCompact(false);
                    overlay.classList.remove('game-overlay--web-chess-2d');
                    canvas.style.display = 'block';
                    if (webChess3dHost) webChess3dHost.style.display = '';
                    document.querySelectorAll('.web-chess-3d-cam-only').forEach((el) => {
                        el.style.display = '';
                    });
                }
            }
            if (dama3dWrap && canvas) {
                if (type === 'da' && options.mode === 'pvp' && !xrActive) {
                    if (chess3dWrap) chess3dWrap.style.display = 'none';
                    dama3dWrap.style.display = 'flex';
                    const damaViewModeEl = dama3dWrap.querySelector('.web-dama-view-mode-wrap');
                    if (damaViewModeEl) damaViewModeEl.style.display = useWebDamaPvpPanel ? '' : 'none';
                    canvas.style.display = 'none';
                    if (webDama3dHost) webDama3dHost.style.display = '';
                    if (useWebDamaPvpPanel) {
                        if (webDamaDesktop2d) {
                            setGameDama3dWrapCompact(true);
                            document.querySelectorAll('#game-dama-3d-wrap .web-chess-3d-cam-only').forEach((el) => {
                                el.style.display = 'none';
                            });
                        } else {
                            setGameDama3dWrapCompact(false);
                            document.querySelectorAll('#game-dama-3d-wrap .web-chess-3d-cam-only').forEach((el) => {
                                el.style.display = '';
                            });
                        }
                        overlay.classList.toggle('game-overlay--web-chess-2d', !!webDamaDesktop2d);
                    } else {
                        setGameDama3dWrapCompact(false);
                        document.querySelectorAll('#game-dama-3d-wrap .web-chess-3d-cam-only').forEach((el) => {
                            el.style.display = '';
                        });
                    }
                } else {
                    dama3dWrap.style.display = 'none';
                }
            }
            const W = Math.min(IS_MOB ? innerWidth * .98 : 600, innerWidth * .98);
            const H = Math.min(IS_MOB ? innerHeight * .7 : 420, innerHeight * .72);
            canvas.width = W; canvas.height = H;
            canvas.style.width = W + 'px'; canvas.style.height = H + 'px';

            const regGame = createMiniGameInstance(type, { canvas, W, H, endGame, options });
            if (regGame) currentGame = regGame;
            else if (type === 'ch' && options.mode === 'pvp') {
                try {
                    const isSpectator = options.spectator === true;
                    clearVrChessOverlaysOnly();
                    lastVrChessWasOnlinePvp = true;
                    if (options.matchPayload) {
                        syncWorldPvpChessFromPayload(options.matchPayload, { spectator: isSpectator });
                    } else {
                        ensureWorldChessBoard();
                        onlineChess3d.setSpectator(isSpectator);
                        onlineChess3d.setOnlineContext({
                            enabled: !isSpectator,
                            matchId: options.matchId || null,
                            myColor: isSpectator ? null : onlineChess.myColor,
                            onMatchOver: (p) => finalizeChessMatchFromServer(p)
                        });
                    }

                    const ctxOpts = {
                        enabled: !isSpectator,
                        matchId: options.matchId || options.matchPayload?.matchId || null,
                        myColor: isSpectator
                            ? null
                            : options.matchPayload?.yourColor || onlineChess.myColor,
                        onMatchOver: (p) => finalizeChessMatchFromServer(p)
                    };

                    if (!xrActive && webChess3dHost && !IS_MOB) {
                        if (webChessDesktop2d) {
                            currentGame = new ChessGame(canvas, W, H, endGame, {
                                mode: 'pvp',
                                localPlayerId,
                                matchId: options.matchId || options.matchPayload?.matchId || null,
                                multiplayer: mpClient,
                                spectator: isSpectator
                            });
                            if (options.matchPayload) currentGame.onChessMatchStarted(options.matchPayload);
                        } else {
                            onlineChess3dViewport = new OnlineChess3D({
                                runtime: 'viewport',
                                host: webChess3dHost,
                                done: endGame,
                                mode: 'pvp',
                                matchId: options.matchId || options.matchPayload?.matchId || null,
                                multiplayer: mpClient,
                                spectator: isSpectator,
                                viewerUserId: localUserId != null ? Number(localUserId) : null
                            });
                            onlineChess3dViewport.setOnlineContext(ctxOpts);
                            if (options.matchPayload) onlineChess3dViewport.onChessMatchStarted(options.matchPayload);
                            onlineChess3dViewport.start();
                            currentGame = onlineChess3dViewport;
                        }
                    } else if (!xrActive && IS_MOB && !isSpectator) {
                        currentGame = new ChessGame(canvas, W, H, endGame, {
                            mode: 'pvp',
                            localPlayerId,
                            matchId: options.matchId || options.matchPayload?.matchId || null,
                            multiplayer: mpClient
                        });
                        if (options.matchPayload) currentGame.onChessMatchStarted(options.matchPayload);
                    } else {
                        currentGame = { destroy() {} };
                        if (!xrActive) onlineChess3d.bindScreenPointerInput(camera, renderer.domElement);
                    }

                    if (chessUiPhase !== ChessUIPhase.PLAYING) chessUiPhase = ChessUIPhase.PLAYING;
                } catch (err) {
                    console.error('Online chess (world) start failed:', err);
                    chessUiPhase = ChessUIPhase.IDLE;
                    clearVrChessOverlaysOnly();
                    currentGame = null;
                    G.gameRunning = false;
                    return;
                }
            } else if (type === 'ch' && !xrActive) {
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
                    lastVrChessWasOnlinePvp = false;
                    const chSpot = SPOTS.find((s) => s.game === 'ch')?.pos || { x: 10, z: 42 };
                    const anchor = {
                        x: chSpot.x,
                        y: 0.56,
                        z: chSpot.z,
                        yaw: 0
                    };
                    currentGame = { destroy() {} };
                    vrChessStandalone = new VrChessStandalone({
                        scene,
                        anchor,
                        onEnd: (sc) => endGame(sc)
                    });
                    vrChessStandalone.mount();
                    if (chessUiPhase !== ChessUIPhase.PLAYING) chessUiPhase = ChessUIPhase.PLAYING;
                } catch (err) {
                    console.error('VR chess start failed:', err);
                    chessUiPhase = ChessUIPhase.IDLE;
                    clearVrChess();
                    currentGame = null;
                    G.gameRunning = false;
                    return;
                }
            } else if (type === 'da' && options.mode === 'pvp') {
                try {
                    const isSpectator = options.spectator === true;
                    clearVrDamaOverlaysOnly();
                    lastVrDamaWasOnlinePvp = true;
                    if (options.matchPayload) {
                        syncWorldPvpDamaFromPayload(options.matchPayload, { spectator: isSpectator });
                    } else {
                        ensureWorldDamaBoard();
                        onlineDama3d.setSpectator(isSpectator);
                        onlineDama3d.setOnlineContext({
                            enabled: !isSpectator,
                            matchId: options.matchId || null,
                            myColor: isSpectator ? null : onlineDama.myColor,
                            onMatchOver: (p) => finalizeDamaMatchFromServer(p)
                        });
                    }

                    const mp = options.matchPayload || {};
                    /* VR ile aynı kaynak: socket bazen yourColor taşımıyor; kampüs onlineDama.myColor zaten doğru. */
                    const damaWebColor =
                        isSpectator ? null : onlineDama.myColor || mp.yourColor || null;
                    const ctxOpts = {
                        enabled: !isSpectator,
                        matchId: options.matchId || mp.matchId || null,
                        myColor: damaWebColor,
                        onMatchOver: (p) => finalizeDamaMatchFromServer(p)
                    };

                    if (!xrActive && webDama3dHost) {
                        onlineDama3dViewport = new OnlineDama3D({
                            runtime: 'viewport',
                            host: webDama3dHost,
                            done: endGame,
                            mode: 'pvp',
                            matchId: options.matchId || options.matchPayload?.matchId || null,
                            multiplayer: mpClient,
                            spectator: isSpectator,
                            viewerUserId: localUserId != null ? Number(localUserId) : null,
                            onDamaUiHint: (msg) => showChessNotice(msg, 2600)
                        });
                        onlineDama3dViewport.setOnlineContext(ctxOpts);
                        if (options.matchPayload) {
                            const vpPayload = {
                                ...options.matchPayload,
                                yourColor: damaWebColor || options.matchPayload.yourColor
                            };
                            onlineDama3dViewport.onDamaMatchStarted(vpPayload);
                        }
                        onlineDama3dViewport.start();
                        syncWebDamaDesktopViewToolbar();
                        if (useWebDamaPvpPanel) {
                            onlineDama3dViewport.setWebViewMode(webDamaDesktop2d ? '2d' : '3d');
                        }
                        currentGame = onlineDama3dViewport;
                    } else {
                        currentGame = { destroy() {} };
                        if (!xrActive) onlineDama3d.bindScreenPointerInput(camera, renderer.domElement);
                    }

                    if (damaUiPhase !== DamaUIPhase.PLAYING) damaUiPhase = DamaUIPhase.PLAYING;
                } catch (err) {
                    console.error('Online dama (world) start failed:', err);
                    damaUiPhase = DamaUIPhase.IDLE;
                    clearVrDamaOverlaysOnly();
                    currentGame = null;
                    G.gameRunning = false;
                    return;
                }
            }

            currentGame?.start?.();
        }

        function endGame(score = -1, opts = {}) {
            const preserveVrChess = opts.preserveVrChess === true;
            // PC/mobil: çevrimiçi maç sırasında "oyundan çıkış" iki tarafta da bitmeli.
            // Bu yüzden aktif maç varken endGame(-1) doğrudan kapatmasın; çıkış onayı + server forfeit çalışsın.
            if (!xrActive && score === -1 && opts.forceExit !== true) {
                if (currentGameType === 'ch' && onlineChess.matchId && onlineChess.active && !onlineChess.exiting) {
                    openChessExitConfirm();
                    return;
                }
                if (currentGameType === 'da' && onlineDama.matchId && onlineDama.active && !onlineDama.exiting) {
                    openChessExitConfirm();
                    return;
                }
            }
            if (G.gameRaf) { cancelAnimationFrame(G.gameRaf); G.gameRaf = null; }
            const endedType = currentGameType;
            const endedTitle = currentGameTitle;
            if (score === -1 && currentGame) {
                if (currentGame.totalScore !== undefined) score = currentGame.totalScore;
                else if (currentGame.score !== undefined) score = currentGame.score;
                else if (currentGame.goals !== undefined) score = currentGame.goals * 10;
                else if (currentGame.points !== undefined) score = currentGame.points;
            }
            if (currentGame) {
                const wasViewport = currentGame === onlineChess3dViewport;
                const wasDamaViewport = currentGame === onlineDama3dViewport;
                currentGame.destroy();
                currentGame = null;
                if (wasViewport) onlineChess3dViewport = null;
                if (wasDamaViewport) onlineDama3dViewport = null;
            }
            document.getElementById('game-overlay').classList.remove('active', 'game-overlay--web-chess-2d');
            if (!preserveVrChess) {
                clearVrChess();
                clearVrDama();
            }
            G.gameRunning = false;
            closeChessExitConfirm();
            activeSpot = null;
            if (vrSpotWindow) vrSpotWindow.visible = false;
            if (IS_MOB) {
                document.getElementById('joy-base').style.display = 'block';
                document.getElementById('joy-label').style.display = 'block';
                ['m-bldg-btn', 'm-map-btn', 'm-lb-btn', 'm-esc-btn'].forEach(id2 => {
                    const el = document.getElementById(id2); if (el) el.style.display = '';
                });
            }
            // VR satranç: çevrimiçi maç bittiğinde tahta zaten applyChessMatchResultPhase içinde kalktı; TAMAM = kuyruk/spot sıfırı (softResetChessForReplay).
            if (isVrSessionPresenting() && endedType === 'ch') {
                const wasOnlinePvp = lastVrChessWasOnlinePvp;
                if (!wasOnlinePvp && (score === 50 || score === 0)) {
                    chessUiPhase = ChessUIPhase.RESULT;
                    openVrChessResult({
                        title: score === 50 ? 'Şah mat' : 'Berabere',
                        sub: score === 50 ? 'Kazandın.' : 'Pat.'
                    });
                }
                lastVrChessWasOnlinePvp = false;
                const vrResultShown =
                    wasOnlinePvp || (score === 50 || score === 0) || vrChessResultOpen || opts.chessResultPhase === true;
                if (!vrResultShown) softResetChessForReplay();
                return;
            }

            if (isVrSessionPresenting() && endedType === 'da') {
                const wasOnlinePvp = lastVrDamaWasOnlinePvp;
                lastVrDamaWasOnlinePvp = false;
                const vrResultShown =
                    wasOnlinePvp || vrChessResultOpen || opts.chessResultPhase === true;
                if (!vrResultShown) softResetDamaForReplay();
                return;
            }

            if (score >= 0) {
                if (endedType === 'ch' && lastVrChessWasOnlinePvp) {
                    /* Satranç çevrimiçi: puan sunucu / skor tablosu; genel skor kaydı yok */
                } else if (endedType === 'da' && lastVrDamaWasOnlinePvp) {
                    /* Dama çevrimiçi: Elo sunucuda; genel skor modalı yok */
                } else if (currentGameId) {
                    showScoreModal(currentGameId, endedTitle || currentGameTitle || 'Oyun', score);
                }
            }
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
        // Boot overlay'i "gerçekten ilk dünya karesi çizildi" sinyali gelmeden kapatma.
        // Bazı cihazlarda initGame bitse bile ilk render gecikebiliyor.
        let firstWorldFrameDrawn = false;

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
            firstWorldFrameDrawn = false;
            localNickname = String(username || 'Oyuncu').slice(0, 24);
            localSessionToken = String(sessionToken || '');
            showCampusBootOverlay('Kampüs hazırlanıyor…');
            const waitForFirstWorldFrame = async ({ timeoutMs = 9000 } = {}) => {
                const to = Math.max(0, Number(timeoutMs) || 0);
                const start = performance.now();
                while (!firstWorldFrameDrawn) {
                    if (to && performance.now() - start > to) break;
                    await new Promise((r) => requestAnimationFrame(r));
                }
            };
            try {
                await initGame();
                initAudio();
                // İlk karede bazı cihazlarda kamera henüz "player takip" konumuna oturmadan
                // render görülebiliyor (boşlukta/havadaymış gibi). Burada kamerayı senkronla
                // ve bir kez render al ki overlay kalktığında dünya hazır olsun.
                try {
                    if (!xrActive && player && camera && renderer && scene) {
                        updateCamera();
                        renderer.render(scene, camera);
                        firstWorldFrameDrawn = true;
                    }
                } catch (_) { /* ignore */ }
                if (!IS_MOB && !IS_QUEST) {
                    const lockPromise = renderer.domElement.requestPointerLock();
                    if (lockPromise instanceof Promise) {
                        lockPromise.catch(() => { });
                    }
                }
                if (IS_QUEST) {
                    // Quest'te pointer lock kullanılmıyor
                }
                // Boot overlay'i, gerçek dünya ilk kez çizildikten sonra kapat.
                await waitForFirstWorldFrame({ timeoutMs: 9000 });
                hideCampusBootOverlay();
            } catch (err) {
                campusStarted = false;
                console.error('Oyun başlatma hatası:', err);
                const authScreen = document.getElementById('auth-screen');
                if (authScreen) authScreen.style.display = 'flex';
                alert('Oyun başlatılırken hata oluştu: ' + sanitizePlainText(err?.message || '', 300));
                hideCampusBootOverlay();
            } finally {
            }
        }
