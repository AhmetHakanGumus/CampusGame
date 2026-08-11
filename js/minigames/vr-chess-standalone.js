/**
 * VR-Harran için vr-chess (Masaüstü/vr-chess) projesinden uyarlanmış VR satranç.
 * Yerel iki oyuncu; select ile taş seç → select bırakınca hedef kareye yerleş.
 */
'use strict';

import * as THREE from 'three';
import { Chess } from 'chess.js/dist/esm/chess.js';
import { playChessMove } from '../audio.js';
import { createPieceModel, cloneMaterialsOnPieceGroup } from './chess-3d-pieces.js';

const PIECE_SYMBOLS = {
    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

class ChessEngine {
    constructor() {
        this.board = this.initBoard();
        this.turn = 'white';
        this.castling = { K: true, Q: true, k: true, q: true };
        this.enPassant = null;
        this.capturedWhite = [];
        this.capturedBlack = [];
    }

    initBoard() {
        const b = Array(8).fill(null).map(() => Array(8).fill(null));
        const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
        for (let c = 0; c < 8; c++) {
            b[0][c] = { type: back[c], color: 'white' };
            b[1][c] = { type: 'P', color: 'white' };
            b[6][c] = { type: 'P', color: 'black' };
            b[7][c] = { type: back[c], color: 'black' };
        }
        return b;
    }

    at(r, c) {
        if (r < 0 || r > 7 || c < 0 || c > 7) return undefined;
        return this.board[r][c];
    }

    isEnemy(r, c, color) {
        const p = this.at(r, c);
        return p && p.color !== color;
    }

    isEmpty(r, c) {
        return r >= 0 && r <= 7 && c >= 0 && c <= 7 && !this.board[r][c];
    }

    getValidMoves(row, col) {
        const piece = this.at(row, col);
        if (!piece) return [];
        const moves = [];
        const color = piece.color;
        const dir = color === 'white' ? 1 : -1;

        const addIf = (r, c) => {
            if (r < 0 || r > 7 || c < 0 || c > 7) return false;
            if (this.isEmpty(r, c)) { moves.push([r, c]); return true; }
            if (this.isEnemy(r, c, color)) { moves.push([r, c]); return false; }
            return false;
        };

        const slide = (dr, dc) => {
            for (let i = 1; i < 8; i++) {
                if (!addIf(row + dr * i, col + dc * i)) break;
            }
        };

        switch (piece.type) {
            case 'P':
                if (this.isEmpty(row + dir, col)) {
                    moves.push([row + dir, col]);
                    const startRow = color === 'white' ? 1 : 6;
                    if (row === startRow && this.isEmpty(row + 2 * dir, col)) moves.push([row + 2 * dir, col]);
                }
                [-1, 1].forEach((dc) => {
                    const nr = row + dir, nc = col + dc;
                    if (this.isEnemy(nr, nc, color)) moves.push([nr, nc]);
                    if (this.enPassant && this.enPassant[0] === nr && this.enPassant[1] === nc) moves.push([nr, nc]);
                });
                break;
            case 'R': slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1); break;
            case 'B': slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1); break;
            case 'Q':
                slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1);
                slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1);
                break;
            case 'N':
                [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => addIf(row + dr, col + dc));
                break;
            case 'K': {
                [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => addIf(row + dr, col + dc));
                const baseRow = color === 'white' ? 0 : 7;
                const ck = color === 'white' ? 'K' : 'k';
                const cq = color === 'white' ? 'Q' : 'q';
                if (row === baseRow && col === 4) {
                    if (this.castling[ck] && this.isEmpty(baseRow, 5) && this.isEmpty(baseRow, 6) && this.at(baseRow, 7)?.type === 'R') moves.push([baseRow, 6]);
                    if (this.castling[cq] && this.isEmpty(baseRow, 3) && this.isEmpty(baseRow, 2) && this.isEmpty(baseRow, 1) && this.at(baseRow, 0)?.type === 'R') moves.push([baseRow, 2]);
                }
                break;
            }
        }

        return moves.filter(([mr, mc]) => {
            const saved = this.board[mr][mc];
            const orig = this.board[row][col];
            this.board[mr][mc] = orig;
            this.board[row][col] = null;
            const inCheck = this.isKingInCheck(color);
            this.board[row][col] = orig;
            this.board[mr][mc] = saved;
            return !inCheck;
        });
    }

    isKingInCheck(color) {
        let kr = -1, kc = -1;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.board[r][c]?.type === 'K' && this.board[r][c]?.color === color) { kr = r; kc = c; }
            }
        }
        if (kr < 0) return false;
        const enemy = color === 'white' ? 'black' : 'white';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (!p || p.color !== enemy) continue;
                const atk = this.getRawAttacks(r, c, p);
                if (atk.some(([ar, ac]) => ar === kr && ac === kc)) return true;
            }
        }
        return false;
    }

    getRawAttacks(row, col, piece) {
        const attacks = [];
        const dir = piece.color === 'white' ? 1 : -1;

        const slideAtk = (dr, dc) => {
            for (let i = 1; i < 8; i++) {
                const r = row + dr * i, c = col + dc * i;
                if (r < 0 || r > 7 || c < 0 || c > 7) break;
                attacks.push([r, c]);
                if (this.board[r][c]) break;
            }
        };

        switch (piece.type) {
            case 'P':
                [-1, 1].forEach((dc) => {
                    const r = row + dir, c = col + dc;
                    if (r >= 0 && r <= 7 && c >= 0 && c <= 7) attacks.push([r, c]);
                });
                break;
            case 'R': slideAtk(1, 0); slideAtk(-1, 0); slideAtk(0, 1); slideAtk(0, -1); break;
            case 'B': slideAtk(1, 1); slideAtk(1, -1); slideAtk(-1, 1); slideAtk(-1, -1); break;
            case 'Q':
                slideAtk(1, 0); slideAtk(-1, 0); slideAtk(0, 1); slideAtk(0, -1);
                slideAtk(1, 1); slideAtk(1, -1); slideAtk(-1, 1); slideAtk(-1, -1);
                break;
            case 'N':
                [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => {
                    const r = row + dr, c = col + dc;
                    if (r >= 0 && r <= 7 && c >= 0 && c <= 7) attacks.push([r, c]);
                });
                break;
            case 'K':
                [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => {
                    const r = row + dr, c = col + dc;
                    if (r >= 0 && r <= 7 && c >= 0 && c <= 7) attacks.push([r, c]);
                });
                break;
        }
        return attacks;
    }

    makeMove(fromR, fromC, toR, toC) {
        const piece = this.board[fromR][fromC];
        if (!piece) return false;
        const captured = this.board[toR][toC];

        if (piece.type === 'P' && this.enPassant && toR === this.enPassant[0] && toC === this.enPassant[1]) {
            const epR = piece.color === 'white' ? toR - 1 : toR + 1;
            const epCaptured = this.board[epR][toC];
            if (epCaptured) {
                if (epCaptured.color === 'white') this.capturedWhite.push(epCaptured);
                else this.capturedBlack.push(epCaptured);
            }
            this.board[epR][toC] = null;
        }

        if (captured) {
            if (captured.color === 'white') this.capturedWhite.push(captured);
            else this.capturedBlack.push(captured);
        }

        if (piece.type === 'K') {
            const baseRow = piece.color === 'white' ? 0 : 7;
            if (fromC === 4 && toC === 6) { this.board[baseRow][5] = this.board[baseRow][7]; this.board[baseRow][7] = null; }
            if (fromC === 4 && toC === 2) { this.board[baseRow][3] = this.board[baseRow][0]; this.board[baseRow][0] = null; }
            if (piece.color === 'white') { this.castling.K = false; this.castling.Q = false; }
            else { this.castling.k = false; this.castling.q = false; }
        }
        if (piece.type === 'R') {
            const baseRow = piece.color === 'white' ? 0 : 7;
            if (fromR === baseRow && fromC === 0) this.castling[piece.color === 'white' ? 'Q' : 'q'] = false;
            if (fromR === baseRow && fromC === 7) this.castling[piece.color === 'white' ? 'K' : 'k'] = false;
        }

        this.enPassant = null;
        if (piece.type === 'P' && Math.abs(toR - fromR) === 2) this.enPassant = [(fromR + toR) / 2, fromC];

        this.board[toR][toC] = piece;
        this.board[fromR][fromC] = null;

        if (piece.type === 'P' && (toR === 0 || toR === 7)) this.board[toR][toC] = { type: 'Q', color: piece.color };

        this.turn = this.turn === 'white' ? 'black' : 'white';
        return true;
    }

    isCheckmate(color) {
        if (!this.isKingInCheck(color)) return false;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.board[r][c]?.color === color && this.getValidMoves(r, c).length > 0) return false;
            }
        }
        return true;
    }

    isStalemate(color) {
        if (this.isKingInCheck(color)) return false;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.board[r][c]?.color === color && this.getValidMoves(r, c).length > 0) return false;
            }
        }
        return true;
    }
}

export class VrChessStandalone {
    /**
     * @param {object} opts
     * @param {import('three').Scene} opts.scene
     * @param {{ x: number, y: number, z: number, yaw?: number }} opts.anchor — tahta merkezi (dünya); yaw opsiyonel (rad)
     * @param {(score: number) => void} opts.onEnd
     */
    constructor({ scene, anchor, onEnd }) {
        this.scene = scene;
        this.anchor = anchor;
        this.onEnd = onEnd;
        this.chess = new ChessEngine();
        this.pieceMeshes = Array(8).fill(null).map(() => Array(8).fill(null));
        this.highlightMeshes = [];
        this.selectedPiece = null;
        this.validMoves = [];
        this.selectedSquareOverlay = null;
        this.grabbedPiece = null;
        this.grabbedFrom = null;
        this.gameOver = false;
        this.clock = new THREE.Clock();
        /** @type {ReturnType<typeof setTimeout>|null} */
        this._endTimer = null;
        this.online = {
            enabled: false,
            matchId: null,
            myColor: null,
            onMoveTry: null,
            /** @type {((p: object) => void) | null} */
            onMatchOver: null
        };
        this.pendingMove = null;
        this._lastFenForSound = null;
        this.resultMessage = '';
        /** @type {THREE.Object3D|null} */
        this._hoverPieceGroup = null;

        // VR için satranç setini biraz daha yere yaklaştır (metre cinsinden).
        // Masa/tahta/taşlar birlikte offset alır; birbirinin üstünde düzgün durmaya devam eder.
        this.yOffset = -0.08;

        this.boardDarkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.7, metalness: 0.1 });
        this.boardLightMat = new THREE.MeshStandardMaterial({ color: 0xdec9a1, roughness: 0.6, metalness: 0.05 });
        this.whitePieceMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.3, metalness: 0.2 });
        this.blackPieceMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.3 });
        this.highlightMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, transparent: true, opacity: 0.55, emissive: 0x22c55e, emissiveIntensity: 0.4 });
        this.captureMat = new THREE.MeshStandardMaterial({ color: 0xef4444, transparent: true, opacity: 0.55, emissive: 0xef4444, emissiveIntensity: 0.4 });
        this.selectedMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.6, emissive: 0xfbbf24, emissiveIntensity: 0.5 });

        this.root = new THREE.Group();
        this.root.name = 'VrChessStandalone';
        this.boardGroup = new THREE.Group();
        this.boardGroup.position.set(-3.5, 0, -3.5);
        this.root.add(this.boardGroup);

        this._buildBoard();
        this._spawnAllPieces();
        this._createHud();
        this.updateUI();
    }

    _y(v) { return v + this.yOffset; }

    setOnlineContext({ enabled = false, matchId = null, myColor = null, onMoveTry = null, onMatchOver = null } = {}) {
        this.online.enabled = !!enabled;
        this.online.matchId = matchId;
        this.online.myColor = myColor;
        this.online.onMoveTry = onMoveTry;
        this.online.onMatchOver = onMatchOver || null;
        this.pendingMove = null;
    }

    setOnlineIdentity({ matchId = null, yourColor = null } = {}) {
        if (matchId != null) this.online.matchId = matchId;
        if (yourColor) this.online.myColor = yourColor;
    }

    _coordsToSquare(row, col) {
        return `${'abcdefgh'[col]}${row + 1}`;
    }

    _squareToCoords(square) {
        const col = 'abcdefgh'.indexOf(square?.[0] || '');
        const row = Number(square?.[1]) - 1;
        if (col < 0 || row < 0 || row > 7) return null;
        return [row, col];
    }

    _loadFenToEngine(fen) {
        if (!fen) return;
        let parsed = null;
        try {
            parsed = new Chess(fen);
        } catch (_err) {
            return;
        }
        const board = Array(8)
            .fill(null)
            .map(() => Array(8).fill(null));
        for (let rank = 1; rank <= 8; rank++) {
            for (let fi = 0; fi < 8; fi++) {
                const sq = `${'abcdefgh'[fi]}${rank}`;
                const p = parsed.get(sq);
                if (!p) continue;
                board[rank - 1][fi] = {
                    type: String(p.type || 'p').toUpperCase(),
                    color: p.color === 'w' ? 'white' : 'black'
                };
            }
        }
        this.chess.board = board;
        this.chess.turn = parsed.turn() === 'w' ? 'white' : 'black';
        const parts = String(fen).split(' ');
        const castling = parts[2] || '-';
        this.chess.castling = {
            K: castling.includes('K'),
            Q: castling.includes('Q'),
            k: castling.includes('k'),
            q: castling.includes('q')
        };
        const ep = parts[3] || '-';
        this.chess.enPassant = ep === '-' ? null : this._squareToCoords(ep);
        this.chess.capturedWhite = [];
        this.chess.capturedBlack = [];
        this._spawnAllPieces();
        this.updateUI();
    }

    onServerStateUpdate(payload) {
        if (!payload) return;
        // Maç bitti / sonuç paneli: gecikmeli state paketleri taşları yeniden çizmesin.
        if (this.gameOver) return;
        if (payload.matchId != null && this.online.matchId != null && Number(payload.matchId) !== Number(this.online.matchId)) {
            return;
        }
        // matchId önce payload ile senkron (aksi halde this.online.matchId null kalıp mat dalı hiç çalışmıyordu).
        this.setOnlineIdentity({ matchId: payload.matchId, yourColor: payload.yourColor });

        // Mat/pat: son pozisyonu bir kare göster, sonra kampüs bitişi (panel + tahta kaldırma).
        // online.enabled şartı kaldırıldı — bazı oturumlarda maç sonu hiç tetiklenmiyordu.
        if (
            typeof this.online.onMatchOver === 'function' &&
            payload.matchId != null &&
            this.online.matchId != null &&
            Number(payload.matchId) === Number(this.online.matchId) &&
            (payload.checkmate || payload.stalemate)
        ) {
            this.pendingMove = null;
            if (payload.fen) {
                const prevFen = this._lastFenForSound;
                this._loadFenToEngine(payload.fen);
                if (prevFen != null && payload.fen !== prevFen) {
                    playChessMove();
                }
                this._lastFenForSound = payload.fen;
            }
            // finalizeChessMatchFromServer yalnızca campus-app onChessStateUpdate yedeği + chess:match:ended ile çağrılır
            // (çift finalize / onlineChess.matchId yarışı VR'da sessiz kalıyordu).
            return;
        }
        this.pendingMove = null;
        this.resultMessage = payload.checkBy && payload.checkedPlayer
            ? `${payload.checkBy} ${payload.checkedPlayer} oyuncusuna şah çekti`
            : '';
        if (payload.fen) {
            const prevFen = this._lastFenForSound;
            this._loadFenToEngine(payload.fen);
            if (prevFen != null && payload.fen !== prevFen) {
                playChessMove();
            }
            this._lastFenForSound = payload.fen;
        }
    }

    onMatchEnded(payload) {
        this.gameOver = true;
        this.pendingMove = null;
        this.resultMessage = payload?.message || 'Oyun bitti';
        this.updateUI();
    }

    _buildBoard() {
        const g = this.boardGroup;
        const tableGeo = new THREE.BoxGeometry(10, 0.3, 10);
        const tableMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.8 });
        const table = new THREE.Mesh(tableGeo, tableMat);
        table.position.set(3.5, this._y(-0.25), 3.5);
        table.receiveShadow = true;
        g.add(table);

        const borderGeo = new THREE.BoxGeometry(8.6, 0.15, 8.6);
        const borderMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.7 });
        const border = new THREE.Mesh(borderGeo, borderMat);
        border.position.set(3.5, this._y(-0.025), 3.5);
        border.receiveShadow = true;
        g.add(border);

        this.squares = [];
        for (let r = 0; r < 8; r++) {
            this.squares[r] = [];
            for (let c = 0; c < 8; c++) {
                const sqGeo = new THREE.BoxGeometry(1, 0.1, 1);
                const mat = (r + c) % 2 === 0 ? this.boardLightMat : this.boardDarkMat;
                const sq = new THREE.Mesh(sqGeo, mat);
                sq.position.set(c, this._y(0.05), r);
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
                const p = this.chess.at(r, c);
                if (p) {
                    const mesh = createPieceModel(p.type, p.color, this.whitePieceMat, this.blackPieceMat);
                    cloneMaterialsOnPieceGroup(mesh);
                    mesh.position.set(c, this._y(0.1), r);
                    mesh.userData = { row: r, col: c, isPiece: true, pieceColor: p.color, pieceType: p.type };
                    this.boardGroup.add(mesh);
                    this.pieceMeshes[r][c] = mesh;
                }
            }
        }
    }

    _createHud() {
        this.hud = document.createElement('div');
        this.hud.id = 'vr-chess-harran-hud';
        this.hud.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:200;background:rgba(0,0,0,.78);backdrop-filter:blur(10px);padding:12px 24px;border-radius:12px;border:1px solid rgba(255,255,255,.1);text-align:center;font-family:Segoe UI,sans-serif;color:#e0e0e0;pointer-events:none;';
        this.hud.innerHTML = '<div id="vr-ch-turn" style="font-size:18px;font-weight:700"></div><div style="opacity:.6;font-size:12px;margin-top:4px">Tetik veya Grip: taş seç / sürükleyip bırak — yeşil kare, kırmızı halka = yeme</div><div id="vr-ch-cap" style="margin-top:8px;font-size:13px;opacity:.85"></div>';
        document.body.appendChild(this.hud);
    }

    clearHighlights() {
        this.highlightMeshes.forEach((m) => this.boardGroup.remove(m));
        this.highlightMeshes.length = 0;
        if (this.selectedSquareOverlay) {
            this.boardGroup.remove(this.selectedSquareOverlay);
            this.selectedSquareOverlay = null;
        }
    }

    showValidMoves(row, col) {
        this.clearHighlights();
        const moves = this.chess.getValidMoves(row, col);
        const selGeo = new THREE.BoxGeometry(0.95, 0.12, 0.95);
        this.selectedSquareOverlay = new THREE.Mesh(selGeo, this.selectedMat);
        this.selectedSquareOverlay.position.set(col, this._y(0.11), row);
        this.boardGroup.add(this.selectedSquareOverlay);
        this.highlightMeshes.push(this.selectedSquareOverlay);

        moves.forEach(([mr, mc]) => {
            const isCapture = this.chess.at(mr, mc) !== null;
            const isEP = this.chess.at(row, col)?.type === 'P' && this.chess.enPassant && mr === this.chess.enPassant[0] && mc === this.chess.enPassant[1];
            if (isCapture || isEP) {
                const ringGeo = new THREE.RingGeometry(0.35, 0.47, 24);
                const ring = new THREE.Mesh(ringGeo, this.captureMat);
                ring.rotation.x = -Math.PI / 2;
                ring.position.set(mc, this._y(0.12), mr);
                this.boardGroup.add(ring);
                this.highlightMeshes.push(ring);
            } else {
                const dotGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 16);
                const dot = new THREE.Mesh(dotGeo, this.highlightMat);
                dot.position.set(mc, this._y(0.11), mr);
                this.boardGroup.add(dot);
                this.highlightMeshes.push(dot);
            }
        });
        return moves;
    }

    updateUI() {
        const turnEl = this.hud?.querySelector('#vr-ch-turn');
        const capEl = this.hud?.querySelector('#vr-ch-cap');
        if (!turnEl) return;
        const t = this.chess.turn;
        if (this.resultMessage) {
            turnEl.textContent = this.resultMessage;
            turnEl.style.color = '#f59e0b';
        } else if (this.pendingMove) {
            turnEl.textContent = 'Hamle gönderildi...';
            turnEl.style.color = '#93c5fd';
        } else if (this.chess.isCheckmate(t)) {
            const winner = t === 'white' ? 'Siyah' : 'Beyaz';
            turnEl.textContent = `${winner} kazandı (şah mat)`;
            turnEl.style.color = '#f59e0b';
        } else if (this.chess.isStalemate(t)) {
            turnEl.textContent = 'Pat — berabere';
            turnEl.style.color = '#8b5cf6';
        } else if (this.chess.isKingInCheck(t)) {
            turnEl.textContent = `${t === 'white' ? '♔ Beyaz' : '♚ Siyah'} — ŞAH!`;
            turnEl.style.color = '#ef4444';
        } else {
            turnEl.textContent = `${t === 'white' ? '♔ Beyaz' : '♚ Siyah'} oynuyor`;
            turnEl.style.color = '#e0e0e0';
        }
        if (capEl) {
            const wSym = this.chess.capturedWhite.map((p) => PIECE_SYMBOLS[p.type]).join('');
            const bSym = this.chess.capturedBlack.map((p) => PIECE_SYMBOLS[p.type.toLowerCase()]).join('');
            capEl.textContent = `Yenen: ⬜ ${wSym || '—'}   ⬛ ${bSym || '—'}`;
        }
    }

    _releaseGrabVisual() {
        if (this.grabbedPiece) {
            this.grabbedPiece.userData.grabbed = false;
            this.grabbedPiece.userData.controller = null;
        }
        this.grabbedPiece = null;
        this.grabbedFrom = null;
    }

    _maybeEndGame() {
        if (this._endTimer != null) return;
        const t = this.chess.turn;
        if (this.chess.isCheckmate(t)) {
            this.gameOver = true;
            this.updateUI();
            this._endTimer = setTimeout(() => {
                this._endTimer = null;
                this.onEnd(50);
            }, 650);
            return;
        }
        if (this.chess.isStalemate(t)) {
            this.gameOver = true;
            this.updateUI();
            this._endTimer = setTimeout(() => {
                this._endTimer = null;
                this.onEnd(0);
            }, 650);
        }
    }

    mount() {
        const a = this.anchor;
        this.root.position.set(a.x, a.y, a.z);
        this.root.scale.setScalar(0.17);
        this.root.rotation.y = a.yaw ?? 0;
        this.scene.add(this.root);
    }

    dispose() {
        if (this._endTimer != null) {
            clearTimeout(this._endTimer);
            this._endTimer = null;
        }
        if (this.hud?.parentNode) this.hud.parentNode.removeChild(this.hud);
        this.hud = null;
        this.clearHighlights();
        this._releaseGrabVisual();
        this.root.removeFromParent();
        this.root.traverse((o) => {
            if (o.isMesh) {
                o.geometry?.dispose?.();
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach((m) => {
                    if (m?.userData?._chessPieceMatOwned) m.dispose();
                });
            }
        });
        this.grabbedPiece = null;
        this.grabbedFrom = null;
        this.selectedPiece = null;
        this.validMoves = [];
    }

    destroy() {
        this.dispose();
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

    _clearAllPieceMaterialsEmissive() {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const g = this.pieceMeshes[r][c];
                if (g) this._resetPieceMaterials(g);
            }
        }
    }

    /** Şah çekilen tarafın şah taşı (hamle sırasındaki renk). */
    _findCheckedKingGroup() {
        if (this.gameOver || !this.chess.isKingInCheck(this.chess.turn)) return null;
        const color = this.chess.turn;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.chess.at(r, c);
                if (p?.type === 'K' && p.color === color) return this.pieceMeshes[r][c];
            }
        }
        return null;
    }

    /** VR lazer: en yakın taş grubu (kare değil). */
    _pickHoverPieceGroup(ctrl0, ctrl1) {
        let best = null;
        let bestD = Infinity;
        for (const ctrl of [ctrl0, ctrl1]) {
            if (!ctrl) continue;
            const inter = this._intersectController(ctrl);
            if (!inter?.object?.userData?.isPiece) continue;
            if (inter.distance >= bestD) continue;
            bestD = inter.distance;
            best = inter.object;
        }
        return best;
    }

    _isPieceGroupWhite(group) {
        const c = group?.userData?.pieceColor;
        return c === 'white' || c === 'w';
    }

    /**
     * @param {number} [intensityMul] — açık taşlarda şah kırmızısı için >1
     */
    _applyPieceEmissivePulse(group, emissiveHex, baseInt, pulseAmp, t, phase, intensityMul = 1) {
        const pulse = (baseInt + pulseAmp * (0.5 + 0.5 * Math.sin(t * phase))) * intensityMul;
        this._forEachPieceMeshMaterial(group, (mat) => {
            mat.emissive.setHex(emissiveHex);
            mat.emissiveIntensity = pulse;
        });
    }

    _applyCheckKingGlow(group, t) {
        const white = this._isPieceGroupWhite(group);
        // Beyaz şah: açık materyalde kırmızı için çok yüksek çarpan
        this._applyPieceEmissivePulse(group, 0xff0000, 0.75, 0.62, t, 5.5, white ? 9.8 : 1.25);
    }

    _applyHoverGlow(group, t) {
        this._applyPieceEmissivePulse(group, 0x00d0ff, 1.65, 0.72, t, 5.2, 1.85);
    }

    /** Sadece sıra VR oyuncusundayken lazer altı taş vurgusu (çevrimiçi). */
    _allowVrHoverHighlight() {
        if (this.gameOver) return false;
        if (!this.online.enabled) return true;
        if (this.pendingMove) return false;
        return this.online.myColor != null && this.chess.turn === this.online.myColor;
    }

    /**
     * @param {number} t
     * @param {import('three').Object3D | null} ctrl0
     * @param {import('three').Object3D | null} ctrl1
     */
    _updatePieceGlowVr(t, ctrl0, ctrl1) {
        this._clearAllPieceMaterialsEmissive();
        const kingG = this._findCheckedKingGroup();
        if (kingG) {
            this._applyCheckKingGlow(kingG, t);
        }
        const hoverG =
            this._allowVrHoverHighlight() && (ctrl0 || ctrl1)
                ? this._pickHoverPieceGroup(ctrl0, ctrl1)
                : null;
        this._hoverPieceGroup = hoverG;
        if (hoverG && hoverG !== this.grabbedPiece && (!kingG || hoverG !== kingG)) {
            this._applyHoverGlow(hoverG, t);
        }
    }

    /**
     * @returns {boolean} true ise olay tüketildi (Harran diğer select işlemlerini atlamalı)
     */
    onSelectStart(controller) {
        if (!controller || this.gameOver) return false;
        if (this.online.enabled && this.pendingMove) return true;
        const hit = this._hitFromController(controller);
        if (!hit) {
            this.clearHighlights();
            this.selectedPiece = null;
            this.validMoves = [];
            return true;
        }
        const { row, col } = hit.userData;

        if (this.selectedPiece && this.validMoves.some(([mr, mc]) => mr === row && mc === col)) {
            const [fromR, fromC] = this.selectedPiece;
            if (this.online.enabled) {
                const from = this._coordsToSquare(fromR, fromC);
                const to = this._coordsToSquare(row, col);
                this.pendingMove = { from, to };
                this.online.onMoveTry?.({
                    matchId: this.online.matchId,
                    from,
                    to,
                    promotion: 'q'
                });
            } else {
                this.chess.makeMove(fromR, fromC, row, col);
                this._spawnAllPieces();
                playChessMove();
            }
            this.clearHighlights();
            this.selectedPiece = null;
            this.validMoves = [];
            this._releaseGrabVisual();
            this.updateUI();
            if (!this.online.enabled) this._maybeEndGame();
            return true;
        }

        const piece = this.chess.at(row, col);
        const canPick =
            piece &&
            piece.color === this.chess.turn &&
            (!this.online.enabled || piece.color === this.online.myColor);
        if (canPick) {
            this.selectedPiece = [row, col];
            this.validMoves = this.showValidMoves(row, col);
            this.grabbedPiece = this.pieceMeshes[row][col];
            this.grabbedFrom = [row, col];
            if (this.grabbedPiece) {
                this.grabbedPiece.userData.grabbed = true;
                this.grabbedPiece.userData.controller = controller;
            }
            return true;
        }

        this.clearHighlights();
        this.selectedPiece = null;
        this.validMoves = [];
        return true;
    }

    onSelectEnd() {
        if (!this.grabbedPiece || !this.selectedPiece) {
            this._releaseGrabVisual();
            return false;
        }
        if (this.online.enabled && this.pendingMove) {
            this._releaseGrabVisual();
            return true;
        }
        const pieceWorldPos = new THREE.Vector3();
        this.grabbedPiece.getWorldPosition(pieceWorldPos);
        const localPos = this.boardGroup.worldToLocal(pieceWorldPos.clone());
        const nearestCol = Math.max(0, Math.min(7, Math.round(localPos.x)));
        const nearestRow = Math.max(0, Math.min(7, Math.round(localPos.z)));

        if (this.validMoves.some(([mr, mc]) => mr === nearestRow && mc === nearestCol)) {
            const [fromR, fromC] = this.selectedPiece;
            const gp = this.grabbedPiece;
            if (gp) {
                gp.userData.grabbed = false;
                gp.userData.controller = null;
            }
            this.grabbedPiece = null;
            this.grabbedFrom = null;
            if (this.online.enabled) {
                const from = this._coordsToSquare(fromR, fromC);
                const to = this._coordsToSquare(nearestRow, nearestCol);
                this.pendingMove = { from, to };
                this.online.onMoveTry?.({
                    matchId: this.online.matchId,
                    from,
                    to,
                    promotion: 'q'
                });
            } else {
                this.chess.makeMove(fromR, fromC, nearestRow, nearestCol);
                this._spawnAllPieces();
                playChessMove();
            }
            this.clearHighlights();
            this.selectedPiece = null;
            this.validMoves = [];
            this.updateUI();
            if (!this.online.enabled) this._maybeEndGame();
        } else {
            const [origR, origC] = this.grabbedFrom;
            this.grabbedPiece.position.set(origC, this._y(0.1), origR);
            this.grabbedPiece.userData.grabbed = false;
            this.grabbedPiece.userData.controller = null;
            this.grabbedPiece = null;
            this.grabbedFrom = null;
        }
        return true;
    }

    /** Kampüsteki grip (squeeze) ile aynı hareket — taş tutma / bırakma */
    onSqueezeStart(controller) {
        return this.onSelectStart(controller);
    }

    onSqueezeEnd() {
        return this.onSelectEnd();
    }

    /**
     * @param {import('three').Object3D | null} [ctrl0]
     * @param {import('three').Object3D | null} [ctrl1]
     */
    update(ctrl0, ctrl1) {
        const t = this.clock.getElapsedTime();
        this.highlightMeshes.forEach((m, i) => {
            if (m !== this.selectedSquareOverlay && m.geometry?.type === 'CylinderGeometry') {
                m.position.y = this._y(0.11) + Math.sin(t * 3 + i * 0.5) * 0.02;
            }
        });
        if (ctrl0 || ctrl1) {
            this._updatePieceGlowVr(t, ctrl0 || null, ctrl1 || null);
        } else {
            this._clearAllPieceMaterialsEmissive();
            const kingG = this._findCheckedKingGroup();
            if (kingG) this._applyCheckKingGlow(kingG, t);
        }
        if (this.grabbedPiece?.userData.grabbed) {
            const ctrl = this.grabbedPiece.userData.controller;
            if (ctrl) {
                const worldPos = new THREE.Vector3();
                ctrl.getWorldPosition(worldPos);
                const localPos = this.boardGroup.worldToLocal(worldPos.clone());
                this.grabbedPiece.position.set(localPos.x, localPos.y + 0.5, localPos.z);
            }
        }
    }
}
