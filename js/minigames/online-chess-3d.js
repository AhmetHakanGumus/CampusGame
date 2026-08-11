'use strict';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Chess } from 'chess.js/dist/esm/chess.js';
import { playChessMove } from '../audio.js';
import { createPieceModel, cloneMaterialsOnPieceGroup } from './chess-3d-pieces.js';
import { G } from '../runtime.js';

function squareToRowCol(sq) {
    const col = 'abcdefgh'.indexOf(sq[0]);
    const row = Number(sq[1]) - 1;
    if (col < 0 || row < 0 || row > 7) return null;
    return { row, col };
}

function squareFromRowCol(row, col) {
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return `${'abcdefgh'[col]}${row + 1}`;
}

/** Hamle sırasındaki renkteki şahın karesi (şah / şah mat anında inCheck ile uyumludur). */
function findKingSquareForColor(chess, color) {
    for (let rank = 1; rank <= 8; rank++) {
        for (let fi = 0; fi < 8; fi++) {
            const sq = `${'abcdefgh'[fi]}${rank}`;
            const p = chess.get(sq);
            if (p && p.type === 'k' && p.color === color) return sq;
        }
    }
    return null;
}

export class OnlineChess3D {
    /**
     * @param {object} opts
     * @param {'world'|'viewport'} opts.runtime
     * @param {import('three').Scene} [opts.scene] — world
     * @param {{ x:number,y:number,z:number,yaw?:number }} [opts.anchor] — world
     * @param {(n:number)=>void} [opts.onEnd] — world (yerel mat için; online’da maç sunucuda biter)
     * @param {HTMLElement} [opts.host] — viewport
     * @param {(n:number)=>void} [opts.done] — viewport endGame
     * @param {string} [opts.mode]
     * @param {number|null} [opts.matchId]
     * @param {object} [opts.multiplayer]
     */
    constructor(opts = {}) {
        this.runtime = opts.runtime === 'world' ? 'world' : 'viewport';
        this.mode = opts.mode || 'pvp';
        /** İzleyici: tahta sadece sunucu FEN ile güncellenir, hamle yok */
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
        this.chess = new Chess();
        this.selectedSquare = null;
        this.legalTargets = [];
        this._lastFenForSound = null;

        this.online = {
            enabled: this.mode === 'pvp' && !this.spectator,
            matchId: this.matchId,
            myColor: null,
            onMoveTry: null,
            onMatchOver: null
        };

        this.grabbedPiece = null;
        this.grabbedFromSquare = null;
        this.clock = this.runtime === 'world' ? new THREE.Clock() : null;

        this.whitePieceMat = new THREE.MeshStandardMaterial({
            color: 0xf5f0e8,
            roughness: 0.3,
            metalness: 0.2
        });
        this.blackPieceMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.4,
            metalness: 0.3
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
        this.inCheckMat = new THREE.MeshBasicMaterial({
            color: 0xff1e3c,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.highlightMeshes = [];
        this.checkIndicatorMesh = null;
        /** @type {THREE.Object3D|null} */
        this._hoverPieceGroup = null;
        this.selectedSquareOverlay = null;
        this.pieceMeshes = Array(8)
            .fill(null)
            .map(() => Array(8).fill(null));
        this.squares = [];

        this.yOffset = this.runtime === 'world' ? -0.08 : 0.02;
        this._y = (v) => v + this.yOffset;

        this.root = new THREE.Group();
        this.root.name = 'OnlineChessBoard3D';
        /** Kampüs: tek dünya tahtası dispose edilmez, maç bitince resetToIdle */
        this.persistWorld = opts.persistWorld === true;
        this.boardGroup = new THREE.Group();
        this.boardGroup.position.set(-3.5, 0, -3.5);
        this.root.add(this.boardGroup);

        this._buildBoard();

        if (this.runtime === 'world') {
            this.scene = opts.scene;
            this.anchor = opts.anchor || { x: 0, y: 0, z: 0, yaw: 0 };
            this.onEnd = opts.onEnd || (() => {});
            this.renderer = null;
            this.camera = null;
            this.controls = null;
            this.host = null;
            this._screenRaycaster = new THREE.Raycaster();
            this._screenCamera = null;
            this._screenDom = null;
            this._onWorldPointerDown = (e) => this._handleWorldPointerDown(e);
            // Üstteki DOM HUD yok — VR spot / masaüstü zaten durum gösteriyor.
        } else {
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x0a1020);
            this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
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
            this.controls.enabled = false;

            this._raycaster = new THREE.Raycaster();
            // Tahta merkezi ~0: rank 1 (beyaz) düşük z, rank 8 (siyah) yüksek z — oyuncu kendi tarafından bakar.
            this._camPosWhite = new THREE.Vector3(0, 10, -15);
            this._camPosBlack = new THREE.Vector3(0, 10, 15);
            this._checkPulseClock = new THREE.Clock();

            this._onResize = () => this._resize();
            this._onPointerDown = (e) => this._handlePointerDown(e);
            this._loop = () => this._tick();
        }
    }

    setOnlineContext({ enabled = false, matchId = null, myColor = null, onMoveTry = null, onMatchOver = null } = {}) {
        this.online.enabled = !!enabled;
        this.online.matchId = matchId;
        this.online.myColor = myColor;
        this.online.onMoveTry = onMoveTry;
        this.online.onMatchOver = onMatchOver || null;
        this.matchId = matchId;
        this.pendingMove = null;
    }

    /** Maç / izleme oturumu için (constructor sonrası) */
    setSpectator(v) {
        this.spectator = !!v;
        this.waitingOpponent = this.mode === 'pvp' && !this.spectator && !!this.matchId;
    }

    /**
     * Maç bitti veya iptal: başlangıç FEN, hamle yok (masa sahada kalır).
     */
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
        this.chess.reset();
        this._lastFenForSound = null;
        this.clearHighlights();
        this.selectedSquare = null;
        this.legalTargets = [];
        this._releaseGrabVisual();
        this.side = 'w';
        this._applyBoardOrientation();
        this._spawnAllPieces();
        if (this.runtime === 'viewport') {
            this._resetCamera();
            this._updateStatusEl();
        } else {
            const turnEl = this.hud?.querySelector('#vr-ch-turn');
            if (turnEl) {
                turnEl.textContent = 'Satranç masası';
                turnEl.style.color = '#a8b8c8';
            }
            const hint = this.hud?.querySelector('#vr-ch-hint');
            if (hint) {
                hint.textContent = 'Online maç için sıra oluştur veya canlı maçı izle.';
            }
            this._updateVrHud();
        }
    }

    /**
     * Tüm istemcilerde kampüs masası canlı FEN (oyuncu VR/Web aynı tahtayı state:update ile zaten güncelliyorsa atlanır).
     */
    syncWorldBoardFromLivePayload(payload) {
        if (!payload?.fen || this.runtime !== 'world') return;
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
        const prev = this._lastFenForSound;
        try {
            this.chess.load(payload.fen);
        } catch (_) {
            return;
        }
        if (prev != null && payload.fen !== prev) playChessMove();
        this._lastFenForSound = payload.fen;
        this.clearHighlights();
        this.selectedSquare = null;
        this.legalTargets = [];
        this._spawnAllPieces();
        this.side = 'w';
        this._applyBoardOrientation();
        if (payload.move?.byUsername) {
            this.lastServerMessage = `${payload.move.byUsername} hamle yaptı (${payload.move.san || ''})`.trim();
        } else if (payload.checkBy && payload.checkedPlayer) {
            this.lastServerMessage = `${payload.checkBy} ${payload.checkedPlayer} oyuncusuna şah çekti`;
        } else {
            this.lastServerMessage = '';
        }
        this._updateVrHud();
    }

    setOnlineIdentity({ matchId = null, yourColor = null } = {}) {
        if (matchId != null) {
            this.online.matchId = matchId;
            this.matchId = matchId;
        }
        if (yourColor && !this.spectator) {
            this.online.myColor = yourColor;
            const yc = String(yourColor).trim().toLowerCase();
            if (yc === 'black' || yc === 'white') {
                const next = yc === 'black' ? 'b' : 'w';
                if (this.side !== next) {
                    this.side = next;
                    this._applyBoardOrientation();
                    if (this.runtime === 'viewport') this._resetCamera();
                }
            }
        }
    }

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
        for (let rank = 1; rank <= 8; rank++) {
            for (let fi = 0; fi < 8; fi++) {
                const sq = `${'abcdefgh'[fi]}${rank}`;
                const piece = this.chess.get(sq);
                if (!piece) continue;
                const r = rank - 1;
                const c = fi;
                const type = piece.type.toUpperCase();
                const color = piece.color === 'w' ? 'white' : 'black';
                const mesh = createPieceModel(type, color, this.whitePieceMat, this.blackPieceMat);
                if (this.runtime === 'world') cloneMaterialsOnPieceGroup(mesh);
                mesh.position.set(c, this._y(0.1), r);
                mesh.userData = {
                    row: r,
                    col: c,
                    isPiece: true,
                    pieceColor: piece.color,
                    pieceType: piece.type
                };
                this.boardGroup.add(mesh);
                this.pieceMeshes[r][c] = mesh;
            }
        }
        this._updateCheckIndicator();
    }

    _clearCheckIndicator() {
        if (this.checkIndicatorMesh) {
            this.boardGroup.remove(this.checkIndicatorMesh);
            this.checkIndicatorMesh.geometry?.dispose?.();
            this.checkIndicatorMesh = null;
        }
    }

    /**
     * Şah: hamle sırasındaki şahın karesinde kırmızı halka (VR + web 3D).
     */
    _updateCheckIndicator() {
        this._clearCheckIndicator();
        if (this.gameOver || !this.chess.inCheck()) return;
        if (this.runtime === 'world') return;
        const kingSq = findKingSquareForColor(this.chess, this.chess.turn());
        if (!kingSq) return;
        const rc = squareToRowCol(kingSq);
        if (!rc) return;
        const ringGeo = new THREE.RingGeometry(0.3, 0.52, 40);
        const ring = new THREE.Mesh(ringGeo, this.inCheckMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(rc.col, this._y(0.056), rc.row);
        ring.renderOrder = 3;
        ring.name = 'ChessCheckRing';
        this.boardGroup.add(ring);
        this.checkIndicatorMesh = ring;
    }

    _applyBoardOrientation() {
        if (this.runtime === 'world') {
            // Tek dünya tahtası: iki VR oyuncu aynı mesh’i paylaşır; siyah için π döndürmek
            // birinde doğru diğerinde ters tahta yaratır. Yön sadece anchor (masa) ile sabitlenir.
            const a = this.anchor;
            this.root.rotation.y = a ? (a.yaw ?? 0) : 0;
            return;
        }
        // Viewport: kamera tarafı kullanıcıya göre; mesh hep dünya ekseninde.
        this.root.rotation.y = 0;
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
        if (!this.selectedSquare) return;
        const fromRc = squareToRowCol(this.selectedSquare);
        if (fromRc) {
            const selGeo = new THREE.BoxGeometry(0.95, 0.12, 0.95);
            const mat = this.runtime === 'world' ? this.selectedMat : this.highlightMat;
            this.selectedSquareOverlay = new THREE.Mesh(selGeo, mat);
            this.selectedSquareOverlay.position.set(fromRc.col, this._y(0.12), fromRc.row);
            this.boardGroup.add(this.selectedSquareOverlay);
            this.highlightMeshes.push(this.selectedSquareOverlay);
        }
        this.legalTargets.forEach((tsq) => {
            const rc = squareToRowCol(tsq);
            if (!rc) return;
            const targetPiece = this.chess.get(tsq);
            const isCap = !!targetPiece;
            const dotGeo = new THREE.CylinderGeometry(isCap ? 0.38 : 0.16, isCap ? 0.38 : 0.16, 0.06, 24);
            const mat = isCap ? this.captureHintMat : this.highlightMat;
            const dot = new THREE.Mesh(dotGeo, mat);
            dot.position.set(rc.col, this._y(0.13), rc.row);
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

    _hitFromController(controller) {
        const inter = this._intersectController(controller);
        return inter ? inter.object : null;
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

    _findCheckedKingGroupWorld() {
        if (this.gameOver || !this.chess.inCheck()) return null;
        const kingSq = findKingSquareForColor(this.chess, this.chess.turn());
        if (!kingSq) return null;
        const rc = squareToRowCol(kingSq);
        if (!rc) return null;
        return this.pieceMeshes[rc.row][rc.col];
    }

    _pickHoverPieceGroupWorld(ctrl0, ctrl1) {
        let best = null;
        let bestD = Infinity;
        for (const ctrl of [ctrl0, ctrl1]) {
            if (!ctrl) continue;
            const inter = this._intersectController(ctrl);
            if (!inter?.object) continue;
            let g = inter.object;
            while (g && !g.userData?.isPiece) g = g.parent;
            if (!g?.userData?.isPiece) continue;
            if (inter.distance >= bestD) continue;
            bestD = inter.distance;
            best = g;
        }
        return best;
    }

    _isPieceGroupWhiteWorld(group) {
        const c = group?.userData?.pieceColor;
        return c === 'white' || c === 'w';
    }

    _applyPieceEmissivePulseWorld(group, emissiveHex, baseInt, pulseAmp, t, phase, intensityMul = 1) {
        const pulse = (baseInt + pulseAmp * (0.5 + 0.5 * Math.sin(t * phase))) * intensityMul;
        this._forEachPieceMeshMaterial(group, (mat) => {
            mat.emissive.setHex(emissiveHex);
            mat.emissiveIntensity = pulse;
        });
    }

    _applyCheckKingGlowWorld(group, t) {
        const white = this._isPieceGroupWhiteWorld(group);
        this._applyPieceEmissivePulseWorld(group, 0xff0000, 0.75, 0.62, t, 5.5, white ? 9.8 : 1.25);
    }

    _applyHoverGlowWorld(group, t) {
        this._applyPieceEmissivePulseWorld(group, 0x00d0ff, 1.65, 0.72, t, 5.2, 1.85);
    }

    /** Sıra bende ve maç aktifken VR lazer hover. */
    _allowVrHoverHighlightWorld() {
        if (this.gameOver || !this.matchId || this.spectator || this.waitingOpponent) return false;
        if (this.pendingMove) return false;
        return this.chess.turn() === this.side;
    }

    _updatePieceGlowWorld(t, ctrl0, ctrl1) {
        this._clearAllPieceMaterialsEmissiveWorld();
        const kingG = this._findCheckedKingGroupWorld();
        if (kingG) {
            this._applyCheckKingGlowWorld(kingG, t);
        }
        const hoverG =
            this._allowVrHoverHighlightWorld() && (ctrl0 || ctrl1)
                ? this._pickHoverPieceGroupWorld(ctrl0, ctrl1)
                : null;
        this._hoverPieceGroup = hoverG;
        if (hoverG && hoverG !== this.grabbedPiece && (!kingG || hoverG !== kingG)) {
            this._applyHoverGlowWorld(hoverG, t);
        }
    }

    /**
     * Masaüstü / mobil: kampüs ana kamerası + canvas üzerinde tıkla (taş → hedef kare).
     * VR oyuncusu bu yolu kullanmaz; kontrolcü `onSelectStart` ile oynar.
     */
    bindScreenPointerInput(camera, domElement) {
        if (this.runtime !== 'world' || !camera || !domElement) return;
        this._unbindScreenPointerInput();
        this._screenCamera = camera;
        this._screenDom = domElement;
        domElement.addEventListener('pointerdown', this._onWorldPointerDown, { passive: false });
        const hint = this.hud?.querySelector('#vr-ch-hint');
        if (hint) {
            hint.textContent =
                'Web: taş → hedef kare. VR: tetik + lazer — taş karesi, sonra hedef (elde tutma yok).';
        }
    }

    _unbindScreenPointerInput() {
        if (this._screenDom && this._onWorldPointerDown) {
            this._screenDom.removeEventListener('pointerdown', this._onWorldPointerDown);
        }
        this._screenDom = null;
        this._screenCamera = null;
    }

    _handleWorldPointerDown(e) {
        if (this.spectator) return;
        if (!this.matchId) return;
        if (this.gameOver || !this._screenCamera || !this._screenDom) return;
        if (e.button != null && e.button !== 0) return;

        const rect = this._screenDom.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this._screenRaycaster.setFromCamera(new THREE.Vector2(x, y), this._screenCamera);
        const intersects = this._screenRaycaster.intersectObjects(this._getClickables(), true);
        if (intersects.length === 0) return;

        e.preventDefault();
        e.stopPropagation();

        let hit = intersects[0].object;
        while (hit && !hit.userData.isSquare && !hit.userData.isPiece) hit = hit.parent;
        if (!hit?.userData || hit.userData.row == null || hit.userData.col == null) return;
        const { row, col } = hit.userData;
        const square = squareFromRowCol(row, col);

        if (this.selectedSquare && this.legalTargets.includes(square)) {
            this.tryMove(this.selectedSquare, square);
            return;
        }
        if (this.selectedSquare && square === this.selectedSquare) {
            this.clearHighlights();
            this.selectedSquare = null;
            this.legalTargets = [];
            this._updateVrHud();
            return;
        }

        if (!this.canInteract()) {
            this._updateVrHud();
            return;
        }

        const piece = this.chess.get(square);
        if (piece && piece.color === this.chess.turn()) {
            if (this.mode === 'pvp' && piece.color !== this.side) return;
            this.selectedSquare = square;
            const moves = this.chess.moves({ square, verbose: true });
            this.legalTargets = moves.map((m) => m.to);
            this._showHighlightsFromSelection();
        } else {
            this.clearHighlights();
            this.selectedSquare = null;
            this.legalTargets = [];
        }
        this._updateVrHud();
    }

    _updateVrHud() {
        const turnEl = this.hud?.querySelector('#vr-ch-turn');
        if (!turnEl) return;
        if (!this.matchId && this.runtime === 'world' && !this.gameOver) {
            turnEl.textContent = 'Satranç masası';
            turnEl.style.color = '#a8b8c8';
            return;
        }
        if (this.resultText || this.gameOver) {
            turnEl.textContent = this.resultText || 'Oyun bitti';
            turnEl.style.color = '#f59e0b';
            return;
        }
        if (this.pendingMove) {
            turnEl.textContent = 'Hamle gönderiliyor…';
            turnEl.style.color = '#93c5fd';
            return;
        }
        const t = this.chess.turn();
        let line = t === this.side ? 'Sıra: Sen' : 'Sıra: Rakip';
        if (this.chess.inCheck()) {
            line += ' · ŞAH!';
            turnEl.style.color = '#fb7185';
        } else {
            turnEl.style.color = '#e0e0e0';
        }
        turnEl.textContent = line;
    }

    mount() {
        if (this.runtime !== 'world') return;
        const a = this.anchor;
        this.root.position.set(a.x, a.y, a.z);
        this.root.scale.setScalar(0.17);
        this.root.rotation.y = a.yaw ?? 0;
        this.scene.add(this.root);
        this._spawnAllPieces();
        const hint = this.hud?.querySelector('#vr-ch-hint');
        if (hint) {
            hint.textContent =
                'VR: tetik — lazerle önce taşın karesi, sonra hedef kare (elde tutma yok).';
        }
        this._updateVrHud();
    }

    onSelectStart(controller) {
        if (this.spectator) return false;
        if (!this.matchId) return false;
        if (this.runtime !== 'world' || !controller || this.gameOver) return false;
        if (this.online.enabled && this.pendingMove) return true;
        const hit = this._hitFromController(controller);
        if (!hit?.userData || hit.userData.row == null || hit.userData.col == null) {
            this.clearHighlights();
            this.selectedSquare = null;
            this.legalTargets = [];
            this._updateVrHud();
            return true;
        }
        const { row, col } = hit.userData;
        const sq = squareFromRowCol(row, col);

        if (this.selectedSquare && this.legalTargets.includes(sq)) {
            this.tryMove(this.selectedSquare, sq);
            return true;
        }
        if (this.selectedSquare && sq === this.selectedSquare) {
            this.clearHighlights();
            this.selectedSquare = null;
            this.legalTargets = [];
            this._updateVrHud();
            return true;
        }

        if (!this.canInteract()) {
            this._updateVrHud();
            return true;
        }

        const piece = this.chess.get(sq);
        if (piece && piece.color === this.chess.turn()) {
            if (this.mode === 'pvp' && piece.color !== this.side) {
                this._updateVrHud();
                return true;
            }
            this.selectedSquare = sq;
            const moves = this.chess.moves({ square: sq, verbose: true });
            this.legalTargets = moves.map((m) => m.to);
            this._showHighlightsFromSelection();
            this._updateVrHud();
            return true;
        }

        this.clearHighlights();
        this.selectedSquare = null;
        this.legalTargets = [];
        this._updateVrHud();
        return true;
    }

    onSelectEnd() {
        if (this.runtime !== 'world') return false;
        this._releaseGrabVisual();
        return false;
    }

    onSqueezeStart() {
        return false;
    }

    onSqueezeEnd() {
        return false;
    }

    _releaseGrabVisual() {
        if (this.grabbedPiece) {
            this.grabbedPiece.userData.grabbed = false;
            this.grabbedPiece.userData.controller = null;
        }
        this.grabbedPiece = null;
        this.grabbedFromSquare = null;
    }

    /**
     * @param {import('three').Object3D | null} [ctrl0]
     * @param {import('three').Object3D | null} [ctrl1]
     */
    update(ctrl0, ctrl1) {
        if (this.runtime !== 'world') return;
        const t = this.clock.getElapsedTime();
        this.highlightMeshes.forEach((m, i) => {
            if (m !== this.selectedSquareOverlay && m.geometry?.type === 'CylinderGeometry') {
                m.position.y = this._y(0.13) + Math.sin(t * 3 + i * 0.5) * 0.02;
            }
        });
        if (this.checkIndicatorMesh) {
            const pulse = 1 + Math.sin(t * 5) * 0.07;
            this.checkIndicatorMesh.scale.set(pulse, pulse, pulse);
        }
        if (ctrl0 || ctrl1) {
            this._updatePieceGlowWorld(t, ctrl0 || null, ctrl1 || null);
        } else {
            this._clearAllPieceMaterialsEmissiveWorld();
            const kingG = this._findCheckedKingGroupWorld();
            if (kingG) this._applyCheckKingGlowWorld(kingG, t);
        }
    }

    onServerStateUpdate(payload) {
        if (!payload) return;
        if (this.gameOver) return;
        if (payload.matchId != null && this.matchId != null && Number(payload.matchId) !== Number(this.matchId)) {
            return;
        }
        this.setOnlineIdentity({ matchId: payload.matchId, yourColor: payload.yourColor });
        const lr = this._resolvePlayingSideFromPayload(payload);
        this.side = lr.side;
        if (lr.myColor) this.online.myColor = lr.myColor;
        this._applyBoardOrientation();
        if (this.runtime === 'viewport') this._resetCamera();

        if (
            typeof this.online.onMatchOver === 'function' &&
            payload.matchId != null &&
            this.matchId != null &&
            Number(payload.matchId) === Number(this.matchId) &&
            (payload.checkmate || payload.stalemate)
        ) {
            this.pendingMove = null;
            if (payload.fen) {
                const prevFen = this._lastFenForSound;
                try {
                    this.chess.load(payload.fen);
                } catch (_err) {}
                if (prevFen != null && payload.fen !== prevFen) playChessMove();
                this._lastFenForSound = payload.fen;
            }
            this._spawnAllPieces();
            if (this.runtime === 'world') this._updateVrHud();
            return;
        }

        this.pendingMove = null;
        if (payload.fen) {
            const prevFen = this._lastFenForSound;
            try {
                this.chess.load(payload.fen);
            } catch (_err) {}
            if (prevFen != null && payload.fen !== prevFen) playChessMove();
            this._lastFenForSound = payload.fen;
        }
        this._spawnAllPieces();
        this.clearHighlights();
        this.selectedSquare = null;
        this.legalTargets = [];
        if (payload.checkBy && payload.checkedPlayer) {
            this.lastServerMessage = `${payload.checkBy} ${payload.checkedPlayer} oyuncusuna şah çekti`;
        } else if (payload.move?.byUsername) {
            this.lastServerMessage = `${payload.move.byUsername} hamle yaptı (${payload.move.san || ''})`.trim();
        } else {
            this.lastServerMessage = '';
        }
        if (this.runtime === 'viewport') this._updateStatusEl();
        else this._updateVrHud();
    }

    onMatchEnded(payload) {
        if (this.persistWorld && this.runtime === 'world') {
            this.resetToIdle();
            return;
        }
        this.gameOver = true;
        this.pendingMove = null;
        this.resultText = payload?.message || 'Oyun bitti';
        this._updateCheckIndicator();
        if (this.runtime === 'viewport') {
            this._updateStatusEl();
        } else {
            this._updateVrHud();
        }
    }

    tryMove(fromSq, toSq) {
        if (this.spectator) return;
        if (!fromSq || !toSq) return;
        this._releaseGrabVisual();
        const possible = this.chess.moves({ square: fromSq, verbose: true }).find((m) => m.to === toSq);
        if (!possible) {
            this.clearHighlights();
            this.selectedSquare = null;
            this.legalTargets = [];
            return;
        }
        this.clearHighlights();
        this.selectedSquare = null;
        this.legalTargets = [];

        if (!this.matchId || !this.mp?.sendChessMove) return;
        this.pendingMove = { from: fromSq, to: toSq };
        this.mp.sendChessMove({
            matchId: this.matchId,
            from: fromSq,
            to: toSq,
            promotion: possible.promotion || 'q'
        });
        if (this.runtime === 'viewport') this._updateStatusEl();
        else this._updateVrHud();
    }

    /* ——— Viewport (web) ——— */

    _resize() {
        if (!this.host || !this.renderer) return;
        const w = Math.max(this.host.clientWidth || 640, 200);
        const h = Math.max(this.host.clientHeight || 400, 200);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
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
        if (!hit?.userData) return null;
        const { row, col } = hit.userData;
        return { row, col, square: squareFromRowCol(row, col) };
    }

    _resetCamera() {
        this._applyBoardOrientation();
        const pos = this.side === 'b' ? this._camPosBlack : this._camPosWhite;
        this.camera.position.copy(pos);
        this.controls.target.set(0, 0, 0);
        this.camera.lookAt(this.controls.target);
        this.controls.update();
    }

    _bindToolbar() {
        const camToggle = document.getElementById('web-chess-3d-camera-toggle');
        const camReset = document.getElementById('web-chess-3d-camera-reset');
        if (camToggle) {
            camToggle.onclick = () => {
                this.controls.enabled = !this.controls.enabled;
                camToggle.textContent = this.controls.enabled ? 'Hamle modu' : 'Kamera (döndür)';
                this.clearHighlights();
                this.selectedSquare = null;
                this.legalTargets = [];
            };
        }
        if (camReset) {
            camReset.onclick = () => {
                this.controls.enabled = false;
                if (camToggle) camToggle.textContent = 'Kamera (döndür)';
                this._resetCamera();
            };
        }
    }

    _updateStatusEl() {
        const el = document.getElementById('web-chess-3d-status');
        if (!el) return;
        let line = '';
        if (this.waitingOpponent) line = 'Rakip bekleniyor…';
        else if (this.pendingMove) line = 'Hamle gönderiliyor…';
        else if (this.gameOver) line = this.resultText || 'Oyun bitti';
        else {
            const t = this.chess.turn();
            line = t === this.side ? 'Sıra: Sen — tıkla taş, tıkla hedef' : 'Sıra: Rakip';
            if (this.chess.inCheck()) line += ' · ŞAH!';
        }
        if (this.lastServerMessage && !this.gameOver) line += ` — ${this.lastServerMessage}`;
        el.textContent = line;
    }

    _handlePointerDown(e) {
        if (this.spectator) return;
        if (this.gameOver || this.controls.enabled) return;
        if (e.button !== 0) return;
        e.preventDefault();
        const pick = this._pickSquare(e.clientX, e.clientY);
        if (!pick) {
            this.clearHighlights();
            this.selectedSquare = null;
            this.legalTargets = [];
            this._updateStatusEl();
            return;
        }
        const { square } = pick;

        if (this.selectedSquare && this.legalTargets.includes(square)) {
            this.tryMove(this.selectedSquare, square);
            return;
        }
        if (this.selectedSquare && square === this.selectedSquare) {
            this.clearHighlights();
            this.selectedSquare = null;
            this.legalTargets = [];
            this._updateStatusEl();
            return;
        }

        if (!this.canInteract()) {
            this._updateStatusEl();
            return;
        }

        const piece = this.chess.get(square);
        if (piece && piece.color === this.chess.turn()) {
            if (this.mode === 'pvp' && piece.color !== this.side) return;
            this.selectedSquare = square;
            const moves = this.chess.moves({ square, verbose: true });
            this.legalTargets = moves.map((m) => m.to);
            this._showHighlightsFromSelection();
        } else {
            this.clearHighlights();
            this.selectedSquare = null;
            this.legalTargets = [];
        }
        this._updateStatusEl();
    }

    canInteract() {
        if (this.spectator) return false;
        if (this.gameOver) return false;
        if (this.waitingOpponent) return false;
        if (this.pendingMove) return false;
        if (!this.matchId) return false;
        return this.chess.turn() === this.side;
    }

    _tick() {
        G.gameRaf = requestAnimationFrame(this._loop);
        this.controls.update();
        if (this.checkIndicatorMesh && this._checkPulseClock) {
            const t = this._checkPulseClock.getElapsedTime();
            const pulse = 1 + Math.sin(t * 5) * 0.07;
            this.checkIndicatorMesh.scale.set(pulse, pulse, pulse);
        }
        this.renderer.render(this.scene, this.camera);
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
        this._bindToolbar();
        this._spawnAllPieces();
        this._updateStatusEl();

        window.addEventListener('resize', this._onResize);
        this.renderer.domElement.addEventListener('pointerdown', this._onPointerDown, { passive: false });
        this._loop();
    }

    onChessMatchStarted(payload) {
        if (!payload) return;
        this.matchId = payload.matchId ?? this.matchId;
        this.online.matchId = this.matchId;
        this.waitingOpponent = false;
        const lr = this._resolvePlayingSideFromPayload(payload);
        this.side = lr.side;
        if (lr.myColor) this.online.myColor = lr.myColor;
        this.pendingMove = null;
        if (payload.fen) {
            try {
                this.chess.load(payload.fen);
            } catch (_err) {
                this.chess.reset();
            }
            this._lastFenForSound = payload.fen;
        } else {
            this._lastFenForSound = this.chess.fen();
        }
        this._applyBoardOrientation();
        if (this.runtime === 'viewport') this._resetCamera();
        this._spawnAllPieces();
        if (this.runtime === 'viewport') this._updateStatusEl();
        else this._updateVrHud();
    }

    onChessStateUpdate(payload) {
        this.onServerStateUpdate(payload);
    }

    onChessMatchEnded(payload) {
        this.onMatchEnded(payload);
    }

    dispose() {
        if (this.runtime === 'world') {
            if (this.persistWorld) return;
            this._unbindScreenPointerInput();
            if (this.hud?.parentNode) this.hud.parentNode.removeChild(this.hud);
            this.hud = null;
            this.clearHighlights();
            this._releaseGrabVisual();
            this._clearCheckIndicator();
            this.inCheckMat?.dispose?.();
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
            this.selectedSquare = null;
            this.legalTargets = [];
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
        this._clearCheckIndicator();
        this.inCheckMat?.dispose?.();
        this.boardGroup.traverse((o) => {
            if (o.isMesh) o.geometry?.dispose?.();
        });
        this.renderer?.dispose();
        if (this.host) this.host.innerHTML = '';

        const camToggle = document.getElementById('web-chess-3d-camera-toggle');
        const camReset = document.getElementById('web-chess-3d-camera-reset');
        if (camToggle) camToggle.onclick = null;
        if (camReset) camReset.onclick = null;

        const wrap = document.getElementById('game-chess-3d-wrap');
        const canvas2d = document.getElementById('game-canvas');
        if (wrap) wrap.style.display = 'none';
        if (canvas2d) canvas2d.style.display = 'block';
    }

    destroy() {
        this.dispose();
    }
}

/** Eski import uyumluluğu */
export { OnlineChess3D as WebChess3D };
