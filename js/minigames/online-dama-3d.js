'use strict';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { playChessMove } from '../audio.js';
import { cloneMaterialsOnPieceGroup } from './chess-3d-pieces.js';
import { G } from '../runtime.js';
import {
    boardValid,
    cellAt,
    chainContinuationActive,
    initialBoardStr,
    isCaptureMandatory,
    listLegalMoves,
    normalizeDamaBoard,
    normalizeDamaChainPayload,
    normalizeDamaTurn
} from './dama-engine.js';

function squareKey(r, c) {
    return `${r},${c}`;
}

function parseSquareKey(k) {
    const [a, b] = String(k).split(',');
    const r = Number(a);
    const c = Number(b);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
    return { r, c };
}

function createDiscMesh(isWhite, isKing, whiteMat, blackMat) {
    const mat = isWhite ? whiteMat : blackMat;
    const h = isKing ? 0.13 : 0.09;
    const r = 0.36;
    const g = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, h, 28), mat);
    cyl.castShadow = true;
    cyl.receiveShadow = true;
    g.add(cyl);
    if (isKing) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.5, 0.035, 8, 20), mat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = h * 0.5 + 0.025;
        g.add(ring);
    }
    return g;
}

export class OnlineDama3D {
    constructor(opts = {}) {
        this.runtime = opts.runtime === 'world' ? 'world' : 'viewport';
        this.mode = opts.mode || 'pvp';
        this.spectator = opts.spectator === true;
        this.mp = opts.multiplayer || null;
        this.matchId = opts.matchId != null ? opts.matchId : null;
        this.done = opts.done || opts.onEnd || (() => {});
        this.pendingMove = null;
        this.waitingOpponent = this.mode === 'pvp' && !this.spectator;
        this.side = 'w';
        const _vu = opts.viewerUserId;
        this.viewerUserId =
            _vu != null && _vu !== '' && Number.isFinite(Number(_vu)) ? Number(_vu) : null;
        this.gameOver = false;
        this.lastServerMessage = '';
        this.resultText = '';
        this.boardStr = initialBoardStr();
        this.turn = 'w';
        this.chain = null;
        this.selectedKey = null;
        this.legalTargetKeys = [];
        this._lastBoardForSound = null;
        this._damaModalBound = false;
        this.onDamaUiHint = typeof opts.onDamaUiHint === 'function' ? opts.onDamaUiHint : null;

        this.online = {
            enabled: this.mode === 'pvp' && !this.spectator,
            matchId: this.matchId,
            myColor: null,
            onMoveTry: null,
            onMatchOver: null
        };

        this.hud = null;
        this.grabbedPiece = null;
        this.clock = this.runtime === 'world' ? new THREE.Clock() : null;

        this.whitePieceMat = new THREE.MeshStandardMaterial({
            color: 0xf2ebe3,
            roughness: 0.35,
            metalness: 0.15
        });
        this.blackPieceMat = new THREE.MeshStandardMaterial({
            color: 0x1e1e1e,
            roughness: 0.45,
            metalness: 0.25
        });
        this.boardDarkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.7, metalness: 0.1 });
        this.boardLightMat = new THREE.MeshStandardMaterial({ color: 0xdec9a1, roughness: 0.6, metalness: 0.05 });
        this.highlightMat = new THREE.MeshStandardMaterial({
            color: 0x22c55e,
            transparent: true,
            opacity: 0.5,
            emissive: 0x114422,
            emissiveIntensity: 0.2
        });
        this.captureHintMat = new THREE.MeshStandardMaterial({
            color: 0xef4444,
            transparent: true,
            opacity: 0.45,
            emissive: 0x441111,
            emissiveIntensity: 0.2
        });
        this.selectedMat = new THREE.MeshStandardMaterial({
            color: 0xfbbf24,
            transparent: true,
            opacity: 0.55,
            emissive: 0xfbbf24,
            emissiveIntensity: 0.45
        });

        this.highlightMeshes = [];
        this.selectedSquareOverlay = null;
        this.pieceMeshes = Array(8)
            .fill(null)
            .map(() => Array(8).fill(null));
        this.squares = [];

        this.yOffset = this.runtime === 'world' ? -0.08 : 0.02;
        this._y = (v) => v + this.yOffset;

        this.root = new THREE.Group();
        this.root.name = 'OnlineDamaBoard3D';
        this.persistWorld = opts.persistWorld === true;
        this.boardGroup = new THREE.Group();
        this.boardGroup.position.set(-3.5, 0, -3.5);
        this.root.add(this.boardGroup);

        this._buildBoard();

        if (this.runtime === 'world') {
            this.scene = opts.scene;
            this.anchor = opts.anchor || { x: 0, y: 0, z: 0, yaw: 0 };
            this.renderer = null;
            this.camera = null;
            this._screenRaycaster = new THREE.Raycaster();
            this._screenCamera = null;
            this._screenDom = null;
            this._onWorldPointerDown = (e) => this._handleWorldPointerDown(e);
        } else {
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x0a1020);
            this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
            this._perspCamera = this.camera;
            this._orthoCamera = new THREE.OrthographicCamera(-4.5, 4.5, 4.5, -4.5, 0.1, 200);
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.host = opts.host || null;
            this.scene.add(this.root);
            const amb = new THREE.AmbientLight(0xffffff, 0.55);
            const dir = new THREE.DirectionalLight(0xfff5e8, 0.88);
            dir.position.set(5, 16, 12);
            dir.castShadow = true;
            dir.shadow.mapSize.set(1024, 1024);
            this.scene.add(amb, dir);
            this.controls = new OrbitControls(this.camera, this.renderer.domElement);
            this.controls.target.set(0, 0, 0);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.08;
            this.controls.minDistance = 5;
            this.controls.maxDistance = 32;
            /* Hamle modu: kapalı — yoksa tek parmak taş seçimini yutar. Kamera modunda açılır. */
            this.controls.enabled = false;
            this.controls.enableRotate = false;
            this.controls.mouseButtons.LEFT = undefined;
            this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
            if (THREE.TOUCH) {
                this._orbitTouchHamle = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
                this._orbitTouchKamera = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
                this.controls.touches = { ...this._orbitTouchHamle };
            }
            this._raycaster = new THREE.Raycaster();
            /** Beyaz r=1,2 (küçük Z); siyah r=5,6 (büyük Z). */
            this._camPosWhite = new THREE.Vector3(0, 10, -15);
            this._camPosBlack = new THREE.Vector3(0, 10, 15);
            this.webViewMode = '3d';
            this._onResize = () => this._resize();
            this._onPointerDown = (e) => this._handlePointerDown(e);
            this._loop = () => this._tick();
        }
    }

    /** OnlineChess3D.setOnlineContext ile aynı: sadece oturum alanları — tahta yönü onDamaMatchStarted / setOnlineIdentity. */
    setOnlineContext({ enabled = false, matchId = null, myColor = null, onMoveTry = null, onMatchOver = null } = {}) {
        this.online.enabled = !!enabled;
        this.online.matchId = matchId;
        this.online.myColor = myColor;
        this.online.onMoveTry = onMoveTry;
        this.online.onMatchOver = onMatchOver || null;
        this.matchId = matchId;
        this.pendingMove = null;
    }

    /** Tahta yönü: önce viewerUserId ↔ sunucu white/black.userId, yoksa yourColor / myColor. */
    _resolvePlayingSideFromPayload(payload) {
        if (this.spectator || payload?.yourColor === 'spectator' || payload?.role === 'spectator') {
            return { side: 'w', myColor: null };
        }
        const uid = this.viewerUserId;
        const wUid = payload?.white?.userId != null ? Number(payload.white.userId) : null;
        const bUid = payload?.black?.userId != null ? Number(payload.black.userId) : null;
        if (uid != null && Number.isFinite(uid) && wUid != null && Number.isFinite(wUid) && uid === wUid) {
            return { side: 'w', myColor: 'white' };
        }
        if (uid != null && Number.isFinite(uid) && bUid != null && Number.isFinite(bUid) && uid === bUid) {
            return { side: 'b', myColor: 'black' };
        }
        const raw = payload?.yourColor != null ? payload.yourColor : this.online.myColor;
        const yc = String(raw || '').trim().toLowerCase();
        const side = yc === 'black' ? 'b' : 'w';
        const myColor = yc === 'black' || yc === 'white' ? yc : null;
        return { side, myColor };
    }

    setSpectator(v) {
        this.spectator = !!v;
        this.waitingOpponent = this.mode === 'pvp' && !this.spectator && !!this.matchId;
    }

    resetToIdle() {
        this.gameOver = false;
        this.resultText = '';
        this.pendingMove = null;
        this.waitingOpponent = false;
        this.lastServerMessage = '';
        this.matchId = null;
        this.online.matchId = null;
        this.online.enabled = false;
        this.online.myColor = null;
        this.spectator = false;
        this.boardStr = initialBoardStr();
        this.turn = 'w';
        this.chain = null;
        this._lastBoardForSound = null;
        this.clearHighlights();
        this.selectedKey = null;
        this.legalTargetKeys = [];
        this.side = 'w';
        if (this.runtime === 'viewport' && this.webViewMode === '2d') {
            this.webViewMode = '3d';
            if (this._perspCamera) {
                this.camera = this._perspCamera;
                this.controls.object = this.camera;
            }
        }
        this._applyBoardOrientation();
        this._spawnAllPieces();
        if (this.runtime === 'viewport') {
            this._resetCamera();
            this._updateStatusEl();
        }
    }

    syncWorldBoardFromLivePayload(payload) {
        if (!payload?.board || this.runtime !== 'world') return;
        if (
            !this.spectator &&
            this.online.enabled &&
            this.matchId != null &&
            payload.matchId != null &&
            Number(this.matchId) === Number(payload.matchId)
        ) {
            return;
        }
        if (this.gameOver) return;
        const prev = this._lastBoardForSound;
        if (!boardValid(payload.board)) return;
        const nb = normalizeDamaBoard(payload.board);
        this.boardStr = nb;
        this.turn = normalizeDamaTurn(payload.turn ?? this.turn);
        this.chain = normalizeDamaChainPayload(payload.chain?.r, payload.chain?.c);
        if (prev != null && nb !== prev) playChessMove();
        this._lastBoardForSound = nb;
        this.clearHighlights();
        this.selectedKey = null;
        this.legalTargetKeys = [];
        this._spawnAllPieces();
        if (this.spectator) {
            this.side = 'w';
        } else if (this.online.myColor === 'black') {
            this.side = 'b';
        } else if (this.online.myColor === 'white') {
            this.side = 'w';
        }
        this._applyBoardOrientation();
        if (payload.move?.byUsername) {
            this.lastServerMessage = `${payload.move.byUsername} hamle yaptı`.trim();
        } else {
            this.lastServerMessage = '';
        }
    }

    setOnlineIdentity({ matchId = null, yourColor = null } = {}) {
        if (matchId != null) {
            this.online.matchId = matchId;
            this.matchId = matchId;
        }
        if (yourColor && !this.spectator) {
            const yc = String(yourColor).trim().toLowerCase();
            if (yc === 'black' || yc === 'white') {
                this.online.myColor = yc;
                const next = yc === 'black' ? 'b' : 'w';
                if (this.side !== next) {
                    this.side = next;
                    this._applyBoardOrientation();
                    if (this.runtime === 'viewport') this._resetCamera();
                }
            }
        }
    }

    _buildBoard() {
        const g = this.boardGroup;
        const th = this.runtime === 'world' ? 0.3 : 0.25;
        const tableGeo = new THREE.BoxGeometry(10, th, 10);
        const tableMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.8 });
        const table = new THREE.Mesh(tableGeo, tableMat);
        table.position.set(3.5, this._y(-0.25 - (th - 0.25) * 0.5), 3.5);
        table.receiveShadow = true;
        g.add(table);

        const borderGeo = new THREE.BoxGeometry(8.6, this.runtime === 'world' ? 0.15 : 0.12, 8.6);
        const borderMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.7 });
        const border = new THREE.Mesh(borderGeo, borderMat);
        border.position.set(3.5, this._y(-0.02), 3.5);
        border.receiveShadow = true;
        g.add(border);

        for (let r = 0; r < 8; r++) {
            this.squares[r] = [];
            for (let c = 0; c < 8; c++) {
                const sqH = this.runtime === 'world' ? 0.1 : 0.08;
                const sqGeo = new THREE.BoxGeometry(1, sqH, 1);
                const mat = (r + c) % 2 === 0 ? this.boardLightMat : this.boardDarkMat;
                const sq = new THREE.Mesh(sqGeo, mat);
                sq.position.set(c, this._y(0.04), r);
                sq.receiveShadow = true;
                sq.userData = { row: r, col: c, isSquare: true };
                g.add(sq);
                this.squares[r][c] = sq;
            }
        }
    }

    _spawnAllPieces() {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.pieceMeshes[r][c]) {
                    this.boardGroup.remove(this.pieceMeshes[r][c]);
                    this.pieceMeshes[r][c] = null;
                }
            }
        }
        if (!boardValid(this.boardStr)) this.boardStr = initialBoardStr();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const ch = cellAt(this.boardStr, r, c);
                if (ch === '.' || ch === '#' || !ch) continue;
                const isWhite = ch === 'w' || ch === 'W';
                const isKing = ch === 'W' || ch === 'B';
                const mesh = createDiscMesh(isWhite, isKing, this.whitePieceMat, this.blackPieceMat);
                if (this.runtime === 'world') cloneMaterialsOnPieceGroup(mesh);
                mesh.position.set(c, this._y(0.1), r);
                mesh.userData = {
                    row: r,
                    col: c,
                    isPiece: true,
                    pieceChar: ch,
                    pieceSide: isWhite ? 'w' : 'b'
                };
                this.boardGroup.add(mesh);
                this.pieceMeshes[r][c] = mesh;
            }
        }
    }

    _applyBoardOrientation() {
        if (this.runtime === 'world') {
            const a = this.anchor;
            const base = a ? (a.yaw ?? 0) : 0;
            /*
             * Kampüs dünyasında tek tahta mesh’i paylaşılır (VR oyuncu + 3. kişi).
             * Tahtayı renge göre döndürmek bir istemcide doğruyken diğerinde ters görüntü yaratır.
             * Bu yüzden world’de yön sadece masanın anchor yaw’ı ile sabitlenir; oyuncu tarafı
             * kameranın/teleportun konumuyla belirlenir.
             */
            this.root.rotation.y = base;
            return;
        }
        /*
         * Viewport: satrançtaki gibi mesh sabit kalsın; taraf hissi kamera ile verilir.
         * Tahtayı döndürürsek siyah kamera + π rotasyon birlikte "çifte çevirme" yapıp
         * siyah oyuncuda taşları ters tarafta gösterebiliyor.
         */
        this.root.rotation.y = 0;
    }

    /** Web masaüstü: üstten bakış (ortho) ↔ perspektif. */
    setWebViewMode(mode) {
        if (this.runtime !== 'viewport' || !this._perspCamera || !this._orthoCamera) return;
        const next = mode === '2d' ? '2d' : '3d';
        if (this.webViewMode === next) return;
        this.webViewMode = next;
        if (next === '2d') {
            this.camera = this._orthoCamera;
            this.controls.enabled = false;
        } else {
            this.camera = this._perspCamera;
            this.controls.object = this.camera;
            this.controls.enabled = !!this.controls.enableRotate;
        }
        this.controls.object = this.camera;
        this._resize();
        this._applyBoardOrientation();
        this._resetCamera();
    }

    clearHighlights() {
        this.highlightMeshes.forEach((m) => this.boardGroup.remove(m));
        this.highlightMeshes.length = 0;
        if (this.selectedSquareOverlay) {
            this.boardGroup.remove(this.selectedSquareOverlay);
            this.selectedSquareOverlay = null;
        }
    }

    _showHighlightsFromSelection() {
        this.clearHighlights();
        if (!this.selectedKey) return;
        const from = parseSquareKey(this.selectedKey);
        if (from) {
            const selGeo = new THREE.BoxGeometry(0.95, 0.12, 0.95);
            const mat = this.runtime === 'world' ? this.selectedMat : this.highlightMat;
            this.selectedSquareOverlay = new THREE.Mesh(selGeo, mat);
            this.selectedSquareOverlay.position.set(from.c, this._y(0.12), from.r);
            this.boardGroup.add(this.selectedSquareOverlay);
            this.highlightMeshes.push(this.selectedSquareOverlay);
        }
        const fromRc = from;
        const movesFrom = fromRc ? this._legalMovesFrom(fromRc.r, fromRc.c) : [];
        this.legalTargetKeys.forEach((tk) => {
            const rc = parseSquareKey(tk);
            if (!rc) return;
            const isCap = movesFrom.some(
                (m) => m.tr === rc.r && m.tc === rc.c && m.capturedR != null && m.capturedC != null
            );
            const dotGeo = new THREE.CylinderGeometry(isCap ? 0.38 : 0.16, isCap ? 0.38 : 0.16, 0.06, 24);
            const mat = isCap ? this.captureHintMat : this.highlightMat;
            const dot = new THREE.Mesh(dotGeo, mat);
            dot.position.set(rc.c, this._y(0.13), rc.r);
            this.boardGroup.add(dot);
            this.highlightMeshes.push(dot);
        });
    }

    _getClickables() {
        const objs = [];
        this.boardGroup.traverse((child) => {
            if (!child.isMesh) return;
            if (child.userData.isSquare || child.userData.isPiece) {
                objs.push(child);
                return;
            }
            let p = child.parent;
            while (p) {
                if (p.userData?.isPiece) {
                    objs.push(child);
                    return;
                }
                p = p.parent;
            }
        });
        return objs;
    }

    /**
     * @returns {{ object: THREE.Object3D, distance: number } | null}
     */
    _intersectController(controller) {
        if (!controller) return null;
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        const raycaster = new THREE.Raycaster();
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
        const intersects = raycaster.intersectObjects(this._getClickables(), true);
        for (let i = 0; i < intersects.length; i++) {
            let hit = intersects[i].object;
            while (hit && !hit.userData.isSquare && !hit.userData.isPiece) hit = hit.parent;
            if (hit) return { object: hit, distance: intersects[i].distance };
        }
        return null;
    }

    _hitFromController(controller) {
        const inter = this._intersectController(controller);
        return inter ? inter.object : null;
    }

    _forEachPieceMeshMaterial(group, fn) {
        if (!group) return;
        group.traverse((obj) => {
            if (!obj.isMesh || !obj.material) return;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((mat) => {
                if (mat && mat.isMeshStandardMaterial) fn(mat);
            });
        });
    }

    _resetPieceMaterials(group) {
        this._forEachPieceMeshMaterial(group, (mat) => {
            if (mat.emissive) mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0;
        });
    }

    _clearAllPieceMaterialsEmissiveWorld() {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const g = this.pieceMeshes[r][c];
                if (g) this._resetPieceMaterials(g);
            }
        }
    }

    _pickHoverPieceGroupWorld(ctrl0, ctrl1) {
        let best = null;
        let bestD = Infinity;
        const tempMatrix = new THREE.Matrix4();
        for (const ctrl of [ctrl0, ctrl1]) {
            if (!ctrl) continue;
            tempMatrix.identity().extractRotation(ctrl.matrixWorld);
            const raycaster = new THREE.Raycaster();
            raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
            raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
            const list = raycaster.intersectObjects(this._getClickables(), true);
            for (let i = 0; i < list.length; i++) {
                let g = list[i].object;
                while (g && !g.userData?.isPiece) g = g.parent;
                if (!g?.userData?.isPiece) continue;
                const d = list[i].distance;
                if (d < bestD) {
                    bestD = d;
                    best = g;
                }
            }
        }
        return best;
    }

    _applyPieceEmissivePulseWorld(group, emissiveHex, baseInt, pulseAmp, t, phase, intensityMul = 1) {
        const pulse = (baseInt + pulseAmp * (0.5 + 0.5 * Math.sin(t * phase))) * intensityMul;
        this._forEachPieceMeshMaterial(group, (mat) => {
            mat.emissive.setHex(emissiveHex);
            mat.emissiveIntensity = pulse;
        });
    }

    _applyHoverGlowWorld(group, t) {
        this._applyPieceEmissivePulseWorld(group, 0x00d0ff, 1.65, 0.72, t, 5.2, 1.85);
    }

    _allowVrHoverHighlightWorld() {
        if (this.gameOver || !this.matchId || this.spectator || this.waitingOpponent) return false;
        if (this.pendingMove) return false;
        return normalizeDamaTurn(this.turn) === this.side;
    }

    _updatePieceGlowWorld(t, ctrl0, ctrl1) {
        this._clearAllPieceMaterialsEmissiveWorld();
        const hoverG =
            this._allowVrHoverHighlightWorld() && (ctrl0 || ctrl1)
                ? this._pickHoverPieceGroupWorld(ctrl0, ctrl1)
                : null;
        if (hoverG && hoverG !== this.grabbedPiece) {
            this._applyHoverGlowWorld(hoverG, t);
        }
    }

    /**
     * Sunucu ensureDamaChainValid ile aynı fikir: zincir karesi listede yoksa bile
     * o kareden yeme zorunluysa zincir modunda kal (başka taşla oynamayı kapat).
     * turn her zaman normalizeDamaTurn ile 'w'|'b' olmalı; aksi halde zincir/ sıra çözülür.
     */
    _chainFrFc() {
        const ch = normalizeDamaChainPayload(this.chain?.r, this.chain?.c);
        if (!ch) return { chainFr: null, chainFc: null };
        const turn = normalizeDamaTurn(this.turn);
        const active = chainContinuationActive(this.boardStr, turn, ch.r, ch.c);
        if (active) return { chainFr: ch.r, chainFc: ch.c };
        if (isCaptureMandatory(this.boardStr, turn, ch.r, ch.c)) {
            return { chainFr: ch.r, chainFc: ch.c };
        }
        return { chainFr: null, chainFc: null };
    }

    _bindDamaMandatoryModalOnce() {
        if (this._damaModalBound) return;
        const modal = document.getElementById('web-dama-capture-rule-modal');
        const ok = document.getElementById('web-dama-capture-rule-ok');
        if (!modal || !ok) return;
        this._damaModalBound = true;
        const close = () => {
            modal.style.display = 'none';
        };
        ok.onclick = close;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });
    }

    /**
     * Zorunlu yeme varken oyuncu yiyemeyecek taşa tıkladığında (web / mobil / VR dünya).
     * Sıra başında veya state güncellemesinde otomatik gösterilmez.
     */
    _notifyWrongCapturePiece() {
        if (this.spectator || this.gameOver || !this.matchId) return;
        if (this.pendingMove || normalizeDamaTurn(this.turn) !== this.side) return;
        const { chainFr, chainFc } = this._chainFrFc();
        if (!isCaptureMandatory(this.boardStr, this.turn, chainFr, chainFc)) return;
        this._bindDamaMandatoryModalOnce();
        const modal = document.getElementById('web-dama-capture-rule-modal');
        if (modal) modal.style.display = 'flex';
        this.onDamaUiHint?.(
            'Yeme zorunlu: Bu taşla yeme yok. En çok taşı yiyebilen taşı seç.'
        );
    }

    _legalMovesFrom(fr, fc) {
        const { chainFr, chainFc } = this._chainFrFc();
        const all = listLegalMoves(this.boardStr, this.turn, chainFr, chainFc);
        return all.filter((m) => m.fr === fr && m.fc === fc);
    }

    canInteract() {
        if (this.spectator) return false;
        if (this.gameOver) return false;
        if (this.waitingOpponent) return false;
        if (this.pendingMove) return false;
        if (!this.matchId) return false;
        return normalizeDamaTurn(this.turn) === this.side;
    }

    mount() {
        if (this.runtime !== 'world') return;
        const a = this.anchor;
        this.root.position.set(a.x, a.y, a.z);
        this.root.scale.setScalar(0.17);
        this._applyBoardOrientation();
        this.scene.add(this.root);
        this._spawnAllPieces();
    }

    bindScreenPointerInput(camera, domElement) {
        if (this.runtime !== 'world' || !camera || !domElement) return;
        this._unbindScreenPointerInput();
        this._screenCamera = camera;
        this._screenDom = domElement;
        domElement.addEventListener('pointerdown', this._onWorldPointerDown, { passive: false });
    }

    _unbindScreenPointerInput() {
        if (this._screenDom && this._onWorldPointerDown) {
            this._screenDom.removeEventListener('pointerdown', this._onWorldPointerDown);
        }
        this._screenDom = null;
        this._screenCamera = null;
    }

    _pickRowColFromEvent(e) {
        const rect = this._screenDom.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this._screenRaycaster.setFromCamera(new THREE.Vector2(x, y), this._screenCamera);
        const intersects = this._screenRaycaster.intersectObjects(this._getClickables(), true);
        if (intersects.length === 0) return null;
        let hit = intersects[0].object;
        while (hit && !hit.userData.isSquare && !hit.userData.isPiece) hit = hit.parent;
        if (!hit?.userData || hit.userData.row == null) return null;
        return { r: hit.userData.row, c: hit.userData.col };
    }

    _handleWorldPointerDown(e) {
        if (this.spectator) return;
        if (!this.matchId || this.gameOver || !this._screenCamera || !this._screenDom) return;
        if (e.button != null && e.button !== 0) return;
        const rc = this._pickRowColFromEvent(e);
        if (!rc) return;
        e.preventDefault();
        e.stopPropagation();
        const key = squareKey(rc.r, rc.c);

        if (this.selectedKey && this.legalTargetKeys.includes(key)) {
            this.tryMove(this.selectedKey, key);
            return;
        }
        if (this.selectedKey && key === this.selectedKey) {
            this.clearHighlights();
            this.selectedKey = null;
            this.legalTargetKeys = [];
            return;
        }
        if (!this.canInteract()) return;

        const ch = cellAt(this.boardStr, rc.r, rc.c);
        const isMine =
            ch === (this.side === 'w' ? 'w' : 'b') || ch === (this.side === 'w' ? 'W' : 'B');
        if (!isMine) {
            this.clearHighlights();
            this.selectedKey = null;
            this.legalTargetKeys = [];
            return;
        }
        const { chainFr, chainFc } = this._chainFrFc();
        if (chainFr != null && (rc.r !== chainFr || rc.c !== chainFc)) {
            this.onDamaUiHint?.('Zincir yeme devam ediyor: yemeye devam eden taşı seç.');
            return;
        }

        const moves = this._legalMovesFrom(rc.r, rc.c);
        if (!moves.length) {
            this.clearHighlights();
            this.selectedKey = null;
            this.legalTargetKeys = [];
            if (isCaptureMandatory(this.boardStr, this.turn, chainFr, chainFc)) {
                this._notifyWrongCapturePiece();
            }
            return;
        }
        this.selectedKey = key;
        this.legalTargetKeys = moves.map((m) => squareKey(m.tr, m.tc));
        this._showHighlightsFromSelection();
    }

    onSelectStart(controller) {
        if (this.spectator) return false;
        if (!this.matchId || this.runtime !== 'world' || this.gameOver) return false;
        if (this.online.enabled && this.pendingMove) return true;
        const hit = this._hitFromController(controller);
        if (!hit?.userData || hit.userData.row == null) {
            this.clearHighlights();
            this.selectedKey = null;
            this.legalTargetKeys = [];
            return true;
        }
        const { row: r, col: c } = hit.userData;
        const key = squareKey(r, c);

        if (this.selectedKey && this.legalTargetKeys.includes(key)) {
            this.tryMove(this.selectedKey, key);
            return true;
        }
        if (this.selectedKey && key === this.selectedKey) {
            this.clearHighlights();
            this.selectedKey = null;
            this.legalTargetKeys = [];
            return true;
        }
        if (!this.canInteract()) return true;

        const ch = cellAt(this.boardStr, r, c);
        const isMine =
            ch === (this.side === 'w' ? 'w' : 'b') || ch === (this.side === 'w' ? 'W' : 'B');
        if (!isMine) {
            this.clearHighlights();
            this.selectedKey = null;
            this.legalTargetKeys = [];
            return true;
        }
        const { chainFr, chainFc } = this._chainFrFc();
        if (chainFr != null && (r !== chainFr || c !== chainFc)) {
            this.onDamaUiHint?.('Zincir yeme devam ediyor: yemeye devam eden taşı seç.');
            return true;
        }

        const moves = this._legalMovesFrom(r, c);
        if (!moves.length) {
            this.clearHighlights();
            this.selectedKey = null;
            this.legalTargetKeys = [];
            if (isCaptureMandatory(this.boardStr, this.turn, chainFr, chainFc)) {
                this._notifyWrongCapturePiece();
            }
            return true;
        }
        this.selectedKey = key;
        this.legalTargetKeys = moves.map((m) => squareKey(m.tr, m.tc));
        this._showHighlightsFromSelection();
        return true;
    }

    onSelectEnd() {
        return false;
    }

    tryMove(fromKey, toKey) {
        if (this.spectator) return;
        const f = parseSquareKey(fromKey);
        const t = parseSquareKey(toKey);
        if (!f || !t) return;
        const moves = this._legalMovesFrom(f.r, f.c);
        const ok = moves.some((m) => m.tr === t.r && m.tc === t.c);
        if (!ok) {
            this.clearHighlights();
            this.selectedKey = null;
            this.legalTargetKeys = [];
            return;
        }
        this.clearHighlights();
        this.selectedKey = null;
        this.legalTargetKeys = [];
        if (!this.matchId || !this.mp?.sendDamaMove) return;
        this.pendingMove = { from: f, to: t };
        this.mp.sendDamaMove({
            matchId: this.matchId,
            from: { r: f.r, c: f.c },
            to: { r: t.r, c: t.c }
        });
        if (this.runtime === 'viewport') this._updateStatusEl();
    }

    onServerStateUpdate(payload) {
        if (!payload) return;
        if (this.gameOver) return;
        if (this.matchId != null && payload.matchId != null && Number(payload.matchId) !== Number(this.matchId)) {
            return;
        }
        this.setOnlineIdentity({
            matchId: payload.matchId,
            yourColor: payload.yourColor ?? this.online.myColor
        });
        const lr = this._resolvePlayingSideFromPayload(payload);
        this.side = lr.side;
        if (lr.myColor) this.online.myColor = lr.myColor;
        this._applyBoardOrientation();
        if (this.runtime === 'viewport') this._resetCamera();
        this.pendingMove = null;
        if (boardValid(payload.board)) {
            const prev = this._lastBoardForSound;
            const nb = normalizeDamaBoard(payload.board);
            this.boardStr = nb;
            if (prev != null && nb !== prev) playChessMove();
            this._lastBoardForSound = nb;
        }
        this.turn = normalizeDamaTurn(payload.turn ?? this.turn);
        this.chain = normalizeDamaChainPayload(payload.chain?.r, payload.chain?.c);
        this._spawnAllPieces();
        this.clearHighlights();
        this.selectedKey = null;
        this.legalTargetKeys = [];
        if (payload.move?.byUsername) {
            this.lastServerMessage = `${payload.move.byUsername} hamle yaptı`.trim();
        } else {
            this.lastServerMessage = '';
        }
        if (this.runtime === 'viewport') this._updateStatusEl();
    }

    onDamaMatchStarted(payload) {
        if (!payload) return;
        this.matchId = payload.matchId ?? this.matchId;
        this.online.matchId = this.matchId;
        this.waitingOpponent = false;
        const lr = this._resolvePlayingSideFromPayload(payload);
        this.side = lr.side;
        if (lr.myColor) this.online.myColor = lr.myColor;
        this.pendingMove = null;
        if (boardValid(payload.board)) {
            const nb = normalizeDamaBoard(payload.board);
            this.boardStr = nb;
            this._lastBoardForSound = nb;
        }
        this.turn = normalizeDamaTurn(payload.turn ?? 'w');
        this.chain = normalizeDamaChainPayload(payload.chain?.r, payload.chain?.c);
        this._applyBoardOrientation();
        if (this.runtime === 'viewport') this._resetCamera();
        this._spawnAllPieces();
        if (this.runtime === 'viewport') this._updateStatusEl();
    }

    onDamaStateUpdate(payload) {
        this.onServerStateUpdate(payload);
    }

    /** Sunucu hata / iptal: pending kilitlenmesini kaldır. */
    clearPendingMoveAfterError() {
        this.pendingMove = null;
        if (this.runtime === 'viewport') this._updateStatusEl();
    }

    onDamaMatchEnded(payload) {
        if (this.persistWorld && this.runtime === 'world') {
            this.resetToIdle();
            return;
        }
        this.gameOver = true;
        this.pendingMove = null;
        this.resultText = payload?.message || 'Oyun bitti';
        if (this.runtime === 'viewport') this._updateStatusEl();
    }

    /** campus-app VR sonuç akışı (satrançtaki onMatchEnded ile aynı rol) */
    onMatchEnded(payload) {
        this.onDamaMatchEnded(payload);
    }

    update(ctrl0, ctrl1) {
        if (this.runtime !== 'world') return;
        const t = this.clock.getElapsedTime();
        this._updatePieceGlowWorld(t, ctrl0, ctrl1);
        this.highlightMeshes.forEach((m, i) => {
            if (m !== this.selectedSquareOverlay && m.geometry?.type === 'CylinderGeometry') {
                m.position.y = this._y(0.13) + Math.sin(t * 3 + i * 0.5) * 0.02;
            }
        });
    }

    _resize() {
        if (!this.host || !this.renderer) return;
        const w = Math.max(this.host.clientWidth || 640, 200);
        const h = Math.max(this.host.clientHeight || 400, 200);
        if (this.webViewMode === '2d' && this._orthoCamera) {
            const aspect = w / h;
            const frustum = 4.85;
            this._orthoCamera.left = -frustum * aspect;
            this._orthoCamera.right = frustum * aspect;
            this._orthoCamera.top = frustum;
            this._orthoCamera.bottom = -frustum;
            this._orthoCamera.updateProjectionMatrix();
        } else if (this._perspCamera) {
            this._perspCamera.aspect = w / h;
            this._perspCamera.updateProjectionMatrix();
        }
        this.renderer.setSize(w, h, false);
    }

    _pickSquare(clientX, clientY) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const x = ((clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((clientY - rect.top) / rect.height) * 2 + 1;
        this._raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
        const hits = this._raycaster.intersectObjects(this._getClickables(), true);
        if (hits.length === 0) return null;
        let hit = hits[0].object;
        while (hit && !hit.userData.isSquare && !hit.userData.isPiece) hit = hit.parent;
        if (!hit?.userData || hit.userData.row == null) return null;
        return { r: hit.userData.row, c: hit.userData.col };
    }

    _resetCamera() {
        this._applyBoardOrientation();
        if (this.webViewMode === '2d' && this._orthoCamera) {
            this.camera = this._orthoCamera;
            this.controls.object = this.camera;
            this.camera.position.set(0, 18, 0);
            /* Üstten bakış: 3D’de beyaz/siyah kamera simetrik; 2D’de tek up her iki renk için ters görünüyordu. */
            this.camera.up.set(0, 0, this.side === 'b' ? -1 : 1);
            this.camera.lookAt(0, 0, 0);
            this.controls.target.set(0, 0, 0);
        } else if (this._perspCamera) {
            this.camera = this._perspCamera;
            this.controls.object = this.camera;
            const pos = this.side === 'b' ? this._camPosBlack : this._camPosWhite;
            this.camera.up.set(0, 1, 0);
            this.camera.position.copy(pos);
            this.controls.target.set(0, 0, 0);
            this.camera.lookAt(this.controls.target);
        }
        this.controls.update();
    }

    _updateStatusEl() {
        const el = document.getElementById('web-dama-3d-status');
        if (!el) return;
        let line = '';
        if (this.waitingOpponent) line = 'Rakip bekleniyor…';
        else if (this.pendingMove) line = 'Hamle gönderiliyor…';
        else if (this.gameOver) line = this.resultText || 'Oyun bitti';
        else {
            line =
                normalizeDamaTurn(this.turn) === this.side
                    ? 'Sıra: Sen — taş ve hedef kare'
                    : 'Sıra: Rakip';
        }
        if (this.lastServerMessage && !this.gameOver) line += ` — ${this.lastServerMessage}`;
        el.textContent = line;
    }

    _handlePointerDown(e) {
        if (this.spectator) return;
        if (this.gameOver) return;
        if (this.runtime === 'viewport' && this.controls?.enabled && this.controls?.enableRotate) return;
        if (e.button !== 0) return;
        e.preventDefault();
        const pick = this._pickSquare(e.clientX, e.clientY);
        if (!pick) {
            this.clearHighlights();
            this.selectedKey = null;
            this.legalTargetKeys = [];
            this._updateStatusEl();
            return;
        }
        const key = squareKey(pick.r, pick.c);
        if (this.selectedKey && this.legalTargetKeys.includes(key)) {
            this.tryMove(this.selectedKey, key);
            return;
        }
        if (this.selectedKey && key === this.selectedKey) {
            this.clearHighlights();
            this.selectedKey = null;
            this.legalTargetKeys = [];
            this._updateStatusEl();
            return;
        }
        if (!this.canInteract()) {
            this._updateStatusEl();
            return;
        }
        const ch = cellAt(this.boardStr, pick.r, pick.c);
        const isMine =
            ch === (this.side === 'w' ? 'w' : 'b') || ch === (this.side === 'w' ? 'W' : 'B');
        if (!isMine) {
            this.clearHighlights();
            this.selectedKey = null;
            this.legalTargetKeys = [];
            this._updateStatusEl();
            return;
        }
        const { chainFr, chainFc } = this._chainFrFc();
        if (chainFr != null && (pick.r !== chainFr || pick.c !== chainFc)) {
            this.onDamaUiHint?.('Zincir yeme devam ediyor: yemeye devam eden taşı seç.');
            this._updateStatusEl();
            return;
        }
        const moves = this._legalMovesFrom(pick.r, pick.c);
        if (!moves.length) {
            this.clearHighlights();
            this.selectedKey = null;
            this.legalTargetKeys = [];
            if (isCaptureMandatory(this.boardStr, this.turn, chainFr, chainFc)) {
                this._notifyWrongCapturePiece();
            }
            this._updateStatusEl();
            return;
        }
        this.selectedKey = key;
        this.legalTargetKeys = moves.map((m) => squareKey(m.tr, m.tc));
        this._showHighlightsFromSelection();
        this._updateStatusEl();
    }

    _tick() {
        G.gameRaf = requestAnimationFrame(this._loop);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    _bindDamaToolbar() {
        const camToggle = document.getElementById('web-dama-3d-camera-toggle');
        const camReset = document.getElementById('web-dama-3d-camera-reset');
        if (camToggle) {
            camToggle.onclick = () => {
                const on = !this.controls.enableRotate;
                this.controls.enableRotate = on;
                this.controls.enabled = on && this.webViewMode === '3d';
                if (THREE.TOUCH && this._orbitTouchHamle && this._orbitTouchKamera) {
                    this.controls.touches = on ? { ...this._orbitTouchKamera } : { ...this._orbitTouchHamle };
                }
                if (on) {
                    this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
                    camToggle.textContent = 'Hamle modu';
                } else {
                    this.controls.mouseButtons.LEFT = undefined;
                    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
                    camToggle.textContent = 'Kamera (döndür)';
                }
                this.clearHighlights();
                this.selectedKey = null;
                this.legalTargetKeys = [];
            };
        }
        if (camReset) {
            camReset.onclick = () => {
                this.controls.enableRotate = false;
                this.controls.enabled = false;
                if (THREE.TOUCH && this._orbitTouchHamle) {
                    this.controls.touches = { ...this._orbitTouchHamle };
                }
                this.controls.mouseButtons.LEFT = undefined;
                this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
                if (camToggle) camToggle.textContent = 'Kamera (döndür)';
                this._resetCamera();
            };
        }
    }

    start() {
        if (this.runtime !== 'viewport' || !this.host) return;
        this.host.innerHTML = '';
        this.host.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.display = 'block';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.touchAction = 'none';
        this._resize();
        this._resetCamera();
        this.controls.enabled = false;
        this.controls.enableRotate = false;
        if (THREE.TOUCH && this._orbitTouchHamle) {
            this.controls.touches = { ...this._orbitTouchHamle };
        }
        this.controls.mouseButtons.LEFT = undefined;
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
        this._bindDamaToolbar();
        this._bindDamaMandatoryModalOnce();
        this._spawnAllPieces();
        this._updateStatusEl();
        window.addEventListener('resize', this._onResize);
        this.renderer.domElement.addEventListener('pointerdown', this._onPointerDown, { passive: false });
        this._loop();
    }

    dispose() {
        if (this.runtime === 'world') {
            if (this.persistWorld) return;
            this._unbindScreenPointerInput();
            this.clearHighlights();
            if (this.root.parent) this.root.removeFromParent();
            this.root.traverse((o) => {
                if (o.isMesh) {
                    o.geometry?.dispose?.();
                    const mats = Array.isArray(o.material) ? o.material : [o.material];
                    mats.forEach((m) => {
                        if (m?.userData?._chessPieceMatOwned) m.dispose();
                    });
                }
            });
            return;
        }
        window.removeEventListener('resize', this._onResize);
        if (this.renderer?.domElement) {
            this.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
        }
        if (G.gameRaf) {
            cancelAnimationFrame(G.gameRaf);
            G.gameRaf = null;
        }
        this.controls?.dispose();
        this.clearHighlights();
        this.boardGroup.traverse((o) => {
            if (o.isMesh) o.geometry?.dispose?.();
        });
        this.renderer?.dispose();
        if (this.host) this.host.innerHTML = '';
        const camToggle = document.getElementById('web-dama-3d-camera-toggle');
        const camReset = document.getElementById('web-dama-3d-camera-reset');
        if (camToggle) camToggle.onclick = null;
        if (camReset) camReset.onclick = null;
        const wrap = document.getElementById('game-dama-3d-wrap');
        const canvas2d = document.getElementById('game-canvas');
        if (wrap) wrap.style.display = 'none';
        if (canvas2d) canvas2d.style.display = 'block';
    }

    destroy() {
        this.dispose();
    }
}
