'use strict';

import { Chess } from 'chess.js/dist/esm/chess.js';
import { G } from '../runtime.js';

function cancelDragState(self) {
    self.dragging = false;
    self.dragFrom = null;
    self.dragPiece = null;
    self.selected = null;
    self.legalTargets = [];
}

/** local = aynı cihazda iki oyuncu (beyaz/siyah sırayla); pvp = çevrimiçi (socket) */
export class ChessGame {
    constructor(canvas, W, H, done, opts = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.W = W;
        this.H = H;
        this.done = done;
        this.mode = opts.mode || 'local';
        this.localPlayerId = opts.localPlayerId || null;
        this.mp = opts.multiplayer || null;
        this.chess = new Chess();
        this.selected = null;
        this.legalTargets = [];
        this.dragging = false;
        this.dragFrom = null;
        this.dragPiece = null;
        this.hoverSq = null;
        this.side = 'w';
        this.waitingOpponent = this.mode === 'pvp';
        this.gameOver = false;
        this.resultText = '';
        this.squareSize = Math.min(this.W, this.H) * 0.86 / 8;
        this.boardPx = this.squareSize * 8;
        this.offX = (this.W - this.boardPx) * 0.5;
        this.offY = (this.H - this.boardPx) * 0.5;
        this._pd = (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            this.onPointerDown(e);
        };
        this._pm = (e) => this.onPointerMove(e);
        this._pu = (e) => this.onPointerUp(e);
    }

    start() {
        this.canvas.addEventListener('pointerdown', this._pd, { passive: false });
        this.canvas.addEventListener('pointermove', this._pm);
        window.addEventListener('pointerup', this._pu);
        window.addEventListener('pointercancel', this._pu);

        if (this.mode === 'pvp' && this.mp?.joinChess) {
            this.mp.joinChess();
        }
        this.loop();
    }

    destroy() {
        this.canvas.removeEventListener('pointerdown', this._pd);
        this.canvas.removeEventListener('pointermove', this._pm);
        window.removeEventListener('pointerup', this._pu);
        window.removeEventListener('pointercancel', this._pu);
    }

    onChessReady(payload) {
        if (!payload) return;
        this.waitingOpponent = false;
        this.side = payload.whiteId === this.localPlayerId ? 'w' : 'b';
    }

    onChessMove(payload) {
        if (!payload?.from || !payload?.to || this.gameOver) return;
        this.chess.move({ from: payload.from, to: payload.to, promotion: payload.promotion || 'q' });
        this.postMove();
    }

    onChessEnded() {
        if (this.gameOver) return;
        this.gameOver = true;
        this.resultText = 'Rakip ayrıldı';
        setTimeout(() => this.done(0), 1200);
    }

    loop() {
        G.gameRaf = requestAnimationFrame(() => this.loop());
        this.draw();
    }

    pointToSquare(x, y) {
        const file = Math.floor((x - this.offX) / this.squareSize);
        const rankFromTop = Math.floor((y - this.offY) / this.squareSize);
        if (file < 0 || file > 7 || rankFromTop < 0 || rankFromTop > 7) return null;
        const rank = 8 - rankFromTop;
        return `${'abcdefgh'[file]}${rank}`;
    }

    squareToCenter(sq) {
        const file = 'abcdefgh'.indexOf(sq[0]);
        const rank = Number(sq[1]);
        const x = this.offX + (file + 0.5) * this.squareSize;
        const y = this.offY + (8 - rank + 0.5) * this.squareSize;
        return { x, y };
    }

    getMovesFrom(square) {
        return this.chess.moves({ square, verbose: true }) || [];
    }

    canInteract() {
        if (this.gameOver) return false;
        if (this.mode === 'local') return true;
        if (this.waitingOpponent) return false;
        return this.chess.turn() === this.side;
    }

    beginDrag(square) {
        if (!this.canInteract()) return;
        if (!square) return;
        const piece = this.chess.get(square);
        if (!piece) return;
        if (piece.color !== this.chess.turn()) return;
        this.selected = square;
        this.dragFrom = square;
        this.dragPiece = piece;
        this.dragging = true;
        const moves = this.getMovesFrom(square);
        this.legalTargets = moves.map((m) => m.to);
    }

    tryMove(toSquare) {
        if (!this.dragFrom) return false;
        if (!toSquare) return false;
        if (toSquare === this.dragFrom) {
            cancelDragState(this);
            return false;
        }
        let move = null;
        try {
            move = this.chess.move({ from: this.dragFrom, to: toSquare, promotion: 'q' });
        } catch (e) {
            cancelDragState(this);
            return false;
        }
        cancelDragState(this);
        if (!move) return false;
        if (this.mode === 'pvp' && this.mp?.sendChessMove) {
            this.mp.sendChessMove({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
        }
        this.postMove();
        return true;
    }

    postMove() {
        if (this.chess.isGameOver()) {
            this.gameOver = true;
            let score = 0;
            if (this.chess.isCheckmate()) {
                const loser = this.chess.turn();
                const winner = loser === 'w' ? 'b' : 'w';
                if (this.mode === 'local') {
                    this.resultText = winner === 'w' ? 'Mat! Beyaz kazandı' : 'Mat! Siyah kazandı';
                    score = 50;
                } else {
                    const humanWon = winner === this.side;
                    score = humanWon ? 50 : 0;
                    this.resultText = humanWon ? 'Mat! +50 puan' : 'Mat oldun';
                }
            } else {
                this.resultText = 'Berabere';
            }
            setTimeout(() => this.done(score), 1400);
            return;
        }
    }

    getPointerPos(e) {
        const r = this.canvas.getBoundingClientRect();
        const sx = this.W / Math.max(r.width, 1e-6);
        const sy = this.H / Math.max(r.height, 1e-6);
        return {
            x: (e.clientX - r.left) * sx,
            y: (e.clientY - r.top) * sy
        };
    }
    onPointerMove(e) {
        const p = this.getPointerPos(e);
        this.hoverSq = this.pointToSquare(p.x, p.y);
    }
    onPointerDown(e) {
        const p = this.getPointerPos(e);
        const sq = this.pointToSquare(p.x, p.y);
        // Taş seçiliyken (tıkla-bırak sonrası dragging=false) ikinci tıklama = hedef veya yeni taş
        if (!this.dragging && this.dragFrom && this.legalTargets?.length) {
            if (!sq) return;
            if (sq === this.dragFrom) {
                cancelDragState(this);
                return;
            }
            if (this.legalTargets.includes(sq)) {
                this.tryMove(sq);
                return;
            }
            const pc = this.chess.get(sq);
            if (pc && pc.color === this.chess.turn()) {
                cancelDragState(this);
                this.beginDrag(sq);
            }
            return;
        }
        this.beginDrag(sq);
    }
    onPointerUp(e) {
        if (!this.dragging) return;
        const p = this.getPointerPos(e);
        let sq = this.pointToSquare(p.x, p.y);
        if (!sq && this.hoverSq && this.legalTargets.includes(this.hoverSq)) {
            sq = this.hoverSq;
        }
        // Aynı karede bırakıldı: seçim kalsın (ikinci tıklamada hedef kareye hamle)
        if (sq === this.dragFrom) {
            this.dragging = false;
            return;
        }
        // Tahta dışında bırakıldı: seçim kalsın (ikinci tıklama hâlâ geçerli)
        if (!sq) {
            this.dragging = false;
            return;
        }
        this.tryMove(sq);
    }

    draw() {
        const c = this.ctx;
        c.fillStyle = '#0f1724';
        c.fillRect(0, 0, this.W, this.H);

        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const light = (r + f) % 2 === 0;
                c.fillStyle = light ? '#e8d9bd' : '#8b6b4a';
                c.fillRect(this.offX + f * this.squareSize, this.offY + r * this.squareSize, this.squareSize, this.squareSize);
            }
        }

        if (this.hoverSq) {
            const p = this.squareToCenter(this.hoverSq);
            c.fillStyle = 'rgba(80,160,255,.25)';
            c.fillRect(
                p.x - this.squareSize * 0.5,
                p.y - this.squareSize * 0.5,
                this.squareSize,
                this.squareSize
            );
        }

        if (this.dragFrom && this.legalTargets.length) {
            const p = this.squareToCenter(this.dragFrom);
            c.fillStyle = 'rgba(120, 180, 255, .28)';
            c.fillRect(
                p.x - this.squareSize * 0.5,
                p.y - this.squareSize * 0.5,
                this.squareSize,
                this.squareSize
            );
        }

        if (this.dragFrom && this.legalTargets.length) {
            c.fillStyle = 'rgba(20, 30, 45, .5)';
            this.legalTargets.forEach((sq) => {
                const p = this.squareToCenter(sq);
                c.beginPath();
                c.arc(p.x, p.y, this.squareSize * 0.12, 0, Math.PI * 2);
                c.fill();
            });
        }

        const uni = {
            p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', k: '♔'
        };
        const uniB = {
            p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚'
        };
        c.font = `${this.squareSize * 0.74}px serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        for (let rank = 1; rank <= 8; rank++) {
            for (let fi = 0; fi < 8; fi++) {
                const sq = `${'abcdefgh'[fi]}${rank}`;
                const piece = this.chess.get(sq);
                if (!piece) continue;
                const center = this.squareToCenter(sq);
                c.fillStyle = piece.color === 'w' ? '#fff' : '#0b0f16';
                c.strokeStyle = piece.color === 'w' ? '#111' : '#ddd';
                c.lineWidth = 1.2;
                const ch = piece.color === 'w' ? uni[piece.type] : uniB[piece.type];
                c.strokeText(ch, center.x, center.y + 1);
                c.fillText(ch, center.x, center.y);
            }
        }

        c.fillStyle = '#e8f0ff';
        c.font = `${Math.max(14, this.H * 0.042)}px Inter,Arial`;
        c.textAlign = 'left';
        let turnLine = '';
        if (this.mode === 'local') {
            turnLine = this.chess.turn() === 'w' ? 'Sıra: Beyaz' : 'Sıra: Siyah';
        } else if (this.waitingOpponent) {
            turnLine = 'Rakip bekleniyor...';
        } else {
            turnLine = `Sıra: ${this.chess.turn() === this.side ? 'Sen' : 'Rakip'}`;
        }
        c.fillText(turnLine, 12, 24);
        if (this.resultText) {
            c.fillStyle = '#ffd86a';
            c.fillText(this.resultText, 12, 50);
        }
    }
}
