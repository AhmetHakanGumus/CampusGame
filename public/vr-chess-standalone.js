/**
 * VR-Harran için vr-chess (Masaüstü/vr-chess) projesinden uyarlanmış VR satranç.
 * Yerel iki oyuncu; select ile taş seç → select bırakınca hedef kareye yerleş.
 */
'use strict';

import * as THREE from 'three';

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

function createPieceModel(type, color, whitePieceMat, blackPieceMat) {
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
            const body = new THREE.Mesh(bodyGeo, mat); body.position.y = 0.3; body.castShadow = true; group.add(body);
            const headGeo = new THREE.SphereGeometry(0.18, 12, 10);
            const head = new THREE.Mesh(headGeo, mat); head.position.y = 0.6; head.castShadow = true; group.add(head);
            break;
        }
        case 'R': {
            const bodyGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.55, 8);
            const body = new THREE.Mesh(bodyGeo, mat); body.position.y = 0.38; body.castShadow = true; group.add(body);
            const topGeo = new THREE.CylinderGeometry(0.28, 0.22, 0.15, 8);
            const top = new THREE.Mesh(topGeo, mat); top.position.y = 0.73; top.castShadow = true; group.add(top);
            for (let i = 0; i < 4; i++) {
                const bGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
                const b = new THREE.Mesh(bGeo, mat);
                const angle = (i / 4) * Math.PI * 2;
                b.position.set(Math.cos(angle) * 0.2, 0.87, Math.sin(angle) * 0.2);
                b.castShadow = true; group.add(b);
            }
            break;
        }
        case 'N': {
            const bodyGeo = new THREE.CylinderGeometry(0.18, 0.26, 0.45, 10);
            const body = new THREE.Mesh(bodyGeo, mat); body.position.y = 0.33; body.castShadow = true; group.add(body);
            const headGeo = new THREE.BoxGeometry(0.18, 0.35, 0.38);
            const head = new THREE.Mesh(headGeo, mat); head.position.set(0, 0.7, 0.05); head.rotation.x = 0.3; head.castShadow = true; group.add(head);
            const noseGeo = new THREE.BoxGeometry(0.14, 0.12, 0.2);
            const nose = new THREE.Mesh(noseGeo, mat); nose.position.set(0, 0.58, 0.22); nose.castShadow = true; group.add(nose);
            break;
        }
        case 'B': {
            const bodyGeo = new THREE.CylinderGeometry(0.12, 0.25, 0.6, 12);
            const body = new THREE.Mesh(bodyGeo, mat); body.position.y = 0.4; body.castShadow = true; group.add(body);
            const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
            const head = new THREE.Mesh(headGeo, mat); head.position.y = 0.78; head.castShadow = true; group.add(head);
            const tipGeo = new THREE.SphereGeometry(0.06, 8, 6);
            const tip = new THREE.Mesh(tipGeo, mat); tip.position.y = 0.98; tip.castShadow = true; group.add(tip);
            break;
        }
        case 'Q': {
            const bodyGeo = new THREE.CylinderGeometry(0.1, 0.28, 0.7, 12);
            const body = new THREE.Mesh(bodyGeo, mat); body.position.y = 0.45; body.castShadow = true; group.add(body);
            const crownGeo = new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
            const crown = new THREE.Mesh(crownGeo, mat); crown.position.y = 0.85; crown.castShadow = true; group.add(crown);
            const tipGeo = new THREE.SphereGeometry(0.08, 8, 6);
            const tip = new THREE.Mesh(tipGeo, mat); tip.position.y = 1.05; tip.castShadow = true; group.add(tip);
            break;
        }
        case 'K': {
            const bodyGeo = new THREE.CylinderGeometry(0.12, 0.28, 0.75, 12);
            const body = new THREE.Mesh(bodyGeo, mat); body.position.y = 0.48; body.castShadow = true; group.add(body);
            const headGeo = new THREE.CylinderGeometry(0.18, 0.14, 0.2, 12);
            const head = new THREE.Mesh(headGeo, mat); head.position.y = 0.92; head.castShadow = true; group.add(head);
            const crossVGeo = new THREE.BoxGeometry(0.06, 0.22, 0.06);
            const crossV = new THREE.Mesh(crossVGeo, mat); crossV.position.y = 1.13; crossV.castShadow = true; group.add(crossV);
            const crossHGeo = new THREE.BoxGeometry(0.18, 0.06, 0.06);
            const crossH = new THREE.Mesh(crossHGeo, mat); crossH.position.y = 1.18; crossH.castShadow = true; group.add(crossH);
            break;
        }
    }
    return group;
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

    _buildBoard() {
        const g = this.boardGroup;
        const tableGeo = new THREE.BoxGeometry(10, 0.3, 10);
        const tableMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.8 });
        const table = new THREE.Mesh(tableGeo, tableMat);
        table.position.set(3.5, -0.25, 3.5);
        table.receiveShadow = true;
        g.add(table);

        const borderGeo = new THREE.BoxGeometry(8.6, 0.15, 8.6);
        const borderMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.7 });
        const border = new THREE.Mesh(borderGeo, borderMat);
        border.position.set(3.5, -0.025, 3.5);
        border.receiveShadow = true;
        g.add(border);

        this.squares = [];
        for (let r = 0; r < 8; r++) {
            this.squares[r] = [];
            for (let c = 0; c < 8; c++) {
                const sqGeo = new THREE.BoxGeometry(1, 0.1, 1);
                const mat = (r + c) % 2 === 0 ? this.boardLightMat : this.boardDarkMat;
                const sq = new THREE.Mesh(sqGeo, mat);
                sq.position.set(c, 0.05, r);
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
                    mesh.position.set(c, 0.1, r);
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
        this.hud.innerHTML = '<div id="vr-ch-turn" style="font-size:18px;font-weight:700"></div><div style="opacity:.6;font-size:12px;margin-top:4px">Select: taş seç / bırak — yeşil = gidiş, kırmızı halka = yeme</div><div id="vr-ch-cap" style="margin-top:8px;font-size:13px;opacity:.85"></div>';
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
        this.selectedSquareOverlay.position.set(col, 0.11, row);
        this.boardGroup.add(this.selectedSquareOverlay);
        this.highlightMeshes.push(this.selectedSquareOverlay);

        moves.forEach(([mr, mc]) => {
            const isCapture = this.chess.at(mr, mc) !== null;
            const isEP = this.chess.at(row, col)?.type === 'P' && this.chess.enPassant && mr === this.chess.enPassant[0] && mc === this.chess.enPassant[1];
            if (isCapture || isEP) {
                const ringGeo = new THREE.RingGeometry(0.35, 0.47, 24);
                const ring = new THREE.Mesh(ringGeo, this.captureMat);
                ring.rotation.x = -Math.PI / 2;
                ring.position.set(mc, 0.12, mr);
                this.boardGroup.add(ring);
                this.highlightMeshes.push(ring);
            } else {
                const dotGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 16);
                const dot = new THREE.Mesh(dotGeo, this.highlightMat);
                dot.position.set(mc, 0.11, mr);
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
        if (this.chess.isCheckmate(t)) {
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
        const t = this.chess.turn;
        if (this.chess.isCheckmate(t)) {
            this.gameOver = true;
            this.updateUI();
            setTimeout(() => this.onEnd(50), 650);
            return;
        }
        if (this.chess.isStalemate(t)) {
            this.gameOver = true;
            this.updateUI();
            setTimeout(() => this.onEnd(0), 650);
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
        if (this.hud?.parentNode) this.hud.parentNode.removeChild(this.hud);
        this.hud = null;
        this.root.removeFromParent();
        this.clearHighlights();
        this.grabbedPiece = null;
        this.grabbedFrom = null;
        this.selectedPiece = null;
        this.validMoves = [];
    }

    _getClickables() {
        const objs = [];
        this.boardGroup.traverse((child) => {
            if (child.isMesh && (child.userData.isSquare || child.userData.isPiece)) objs.push(child);
        });
        return objs;
    }

    _hitFromController(controller) {
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        const raycaster = new THREE.Raycaster();
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
        const intersects = raycaster.intersectObjects(this._getClickables(), true);
        if (intersects.length === 0) return null;
        let hit = intersects[0].object;
        while (hit && !hit.userData.isSquare && !hit.userData.isPiece) hit = hit.parent;
        return hit;
    }

    /**
     * @returns {boolean} true ise olay tüketildi (Harran diğer select işlemlerini atlamalı)
     */
    onSelectStart(controller) {
        if (!controller || this.gameOver) return false;
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
            this.chess.makeMove(fromR, fromC, row, col);
            this._spawnAllPieces();
            this.clearHighlights();
            this.selectedPiece = null;
            this.validMoves = [];
            this._releaseGrabVisual();
            this.updateUI();
            this._maybeEndGame();
            return true;
        }

        const piece = this.chess.at(row, col);
        if (piece && piece.color === this.chess.turn) {
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
            this.chess.makeMove(fromR, fromC, nearestRow, nearestCol);
            this._spawnAllPieces();
            this.clearHighlights();
            this.selectedPiece = null;
            this.validMoves = [];
            this.updateUI();
            this._maybeEndGame();
        } else {
            const [origR, origC] = this.grabbedFrom;
            this.grabbedPiece.position.set(origC, 0.1, origR);
            this.grabbedPiece.userData.grabbed = false;
            this.grabbedPiece.userData.controller = null;
            this.grabbedPiece = null;
            this.grabbedFrom = null;
        }
        return true;
    }

    update() {
        const t = this.clock.getElapsedTime();
        this.highlightMeshes.forEach((m, i) => {
            if (m !== this.selectedSquareOverlay && m.geometry?.type === 'CylinderGeometry') {
                m.position.y = 0.11 + Math.sin(t * 3 + i * 0.5) * 0.02;
            }
        });
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
