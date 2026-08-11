'use strict';

/**
 * Türk daması (8×8, 64 kare).
 * Dizilim (r=0 üst): r=0,7 boş; r=1,2 beyaz; r=3,4 boş; r=5,6 siyah.
 * Çelebi: sadece ileri + sağ + sol, 1 kare; geri ve çapraz yok.
 * Yeme: düz komşu üzerinden atlama (çelébi 4 yön, dama kale yeme).
 * Zorunlu yeme; en çok taş yeme zorunlu. Son sıradaki çelébi anında dama olur.
 * Yeme ile aynı hamlede mars olan çelébi: tur biter (aynı turda dama olarak ek yeme yok). Zincir yalnız mars olmayan yeme adımlarında sürer.
 * Dama: kale gibi kayar; karşı uç sıraya (beyaz r=7, siyah r=0) varınca olur.
 */

const SIZE = 8;

/** DB / socket: 'W', ' w', 'b' gibi gürültüyü sök. */
export function normalizeDamaTurn(t) {
    const s = String(t === undefined || t === null ? 'w' : t)
        .trim()
        .toLowerCase();
    return s.charAt(0) === 'b' ? 'b' : 'w';
}

/** Zincir sadece her iki koordinat da 0..SIZE-1 tamsayıysa geçerlidir (0 geçerli satır). */
function normalizeOptionalChain(chainFr, chainFc) {
    if (chainFr == null || chainFc == null) return null;
    const fr = Math.trunc(Number(chainFr));
    const fc = Math.trunc(Number(chainFc));
    if (!Number.isFinite(fr) || !Number.isFinite(fc)) return null;
    if (fr < 0 || fr >= SIZE || fc < 0 || fc >= SIZE) return null;
    return { fr, fc };
}

/** İstemci: sunucu `chain` nesnesini güvenli biçime çevir; eksik veya tahta dışı ise null. */
export function normalizeDamaChainPayload(r, c) {
    const ch = normalizeOptionalChain(r, c);
    return ch ? { r: ch.fr, c: ch.fc } : null;
}

/** Önceki sürüm açılışı (siyah üst iki sıra r<2, beyaz alt r>5) — normalize edilir. */
const DEPRECATED_INITIAL_BOTTOM_WHITE = (() => {
    let s = '';
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (r < 2) s += 'b';
            else if (r > 5) s += 'w';
            else s += '.';
        }
    }
    return s;
})();

const ORTH = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
];

/** Beyaz ileri +r; siyah ileri -r. Sağ/sol aynı satırda. */
function manDirsQuiet(turn) {
    if (turn === 'w') return [[1, 0], [0, -1], [0, 1]];
    return [[-1, 0], [0, -1], [0, 1]];
}

export function initialBoardStr() {
    let s = '';
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (r === 1 || r === 2) s += 'w';
            else if (r === 5 || r === 6) s += 'b';
            else s += '.';
        }
    }
    return s;
}

export function cellAt(board, r, c) {
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
    return board[r * SIZE + c];
}

function setCell(board, r, c, ch) {
    const i = r * SIZE + c;
    return board.slice(0, i) + ch + board.slice(i + 1);
}

function isPlayable(board, r, c) {
    const ch = cellAt(board, r, c);
    return ch != null && ch !== '#';
}

function mine(turn, ch) {
    if (turn === 'w') return ch === 'w' || ch === 'W';
    if (turn === 'b') return ch === 'b' || ch === 'B';
    return false;
}

function enemy(turn, ch) {
    if (turn === 'w') return ch === 'b' || ch === 'B';
    if (turn === 'b') return ch === 'w' || ch === 'W';
    return false;
}

/** Çelébi yemede 4 düz yön (geri dahil) — sadece sessiz yürüyüşte geri yasak. */
function manCaptureHops(board, turn, fr, fc) {
    const ch = cellAt(board, fr, fc);
    if (!mine(turn, ch) || ch === 'W' || ch === 'B') return [];
    const out = [];
    for (const [dr, dc] of ORTH) {
        const mr = fr + dr;
        const mc = fc + dc;
        const tr = fr + 2 * dr;
        const tc = fc + 2 * dc;
        if (!isPlayable(board, tr, tc)) continue;
        if (cellAt(board, tr, tc) !== '.') continue;
        const mid = cellAt(board, mr, mc);
        if (!enemy(turn, mid)) continue;
        out.push({ tr, tc, capturedR: mr, capturedC: mc });
    }
    return out;
}

function kingSlideTargets(board, turn, fr, fc) {
    const ch = cellAt(board, fr, fc);
    if ((ch !== 'W' && ch !== 'B') || !mine(turn, ch)) return [];
    const out = [];
    for (const [dr, dc] of ORTH) {
        let r = fr + dr;
        let c = fc + dc;
        while (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
            if (!isPlayable(board, r, c)) break;
            if (cellAt(board, r, c) !== '.') break;
            out.push({ tr: r, tc: c });
            r += dr;
            c += dc;
        }
    }
    return out;
}

function kingCaptureHops(board, turn, fr, fc) {
    const ch = cellAt(board, fr, fc);
    if ((ch !== 'W' && ch !== 'B') || !mine(turn, ch)) return [];
    const out = [];
    for (const [dr, dc] of ORTH) {
        let r = fr + dr;
        let c = fc + dc;
        while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && isPlayable(board, r, c) && cellAt(board, r, c) === '.') {
            r += dr;
            c += dc;
        }
        if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
        if (!isPlayable(board, r, c)) continue;
        if (!enemy(turn, cellAt(board, r, c))) continue;
        let er = r + dr;
        let ec = c + dc;
        while (
            er >= 0 &&
            er < SIZE &&
            ec >= 0 &&
            ec < SIZE &&
            isPlayable(board, er, ec) &&
            cellAt(board, er, ec) === '.'
        ) {
            out.push({ tr: er, tc: ec, capturedR: r, capturedC: c });
            er += dr;
            ec += dc;
        }
    }
    return out;
}

function capturesFromSquare(board, turn, fr, fc) {
    const ch = cellAt(board, fr, fc);
    if (!mine(turn, ch)) return [];
    if (ch === 'w' || ch === 'b') return manCaptureHops(board, turn, fr, fc);
    return kingCaptureHops(board, turn, fr, fc);
}

function boardAfterCaptureStep(board, fr, fc, tr, tc, capturedR, capturedC) {
    return normalizeDamaBoard(applyMoveOnBoard(board, fr, fc, tr, tc, capturedR, capturedC));
}

/** Bu yeme adımından sonra aynı turda kalan yeme derinliği; çelébi bu hamlede mars olduysa 0. */
function maxCapturesRemainingSameTurnAfterHop(board, turn, fr, fc, tr, tc, capturedR, capturedC) {
    const fromCh = cellAt(board, fr, fc);
    const nb = boardAfterCaptureStep(board, fr, fc, tr, tc, capturedR, capturedC);
    const toCh = cellAt(nb, tr, tc);
    const manJustPromoted =
        (fromCh === 'w' || fromCh === 'b') &&
        ((fromCh === 'w' && toCh === 'W') || (fromCh === 'b' && toCh === 'B'));
    if (manJustPromoted) return 0;
    return maxCapturesChainLength(nb, turn, tr, tc);
}

function maxCapturesChainLength(board, turn, fr, fc) {
    board = normalizeDamaBoard(board);
    const hops = capturesFromSquare(board, turn, fr, fc);
    if (hops.length === 0) return 0;
    let best = 0;
    for (const h of hops) {
        best = Math.max(
            best,
            1 +
                maxCapturesRemainingSameTurnAfterHop(board, turn, fr, fc, h.tr, h.tc, h.capturedR, h.capturedC)
        );
    }
    return best;
}

function globalMaxCaptures(board, turn) {
    let M = 0;
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const ch = cellAt(board, r, c);
            if (!mine(turn, ch)) continue;
            M = Math.max(M, maxCapturesChainLength(board, turn, r, c));
        }
    }
    return M;
}

/** Yeme zorunlu mu (zincirde: bu kareden devam yeme var mı). */
export function isCaptureMandatory(board, turn, chainFr, chainFc) {
    board = normalizeDamaBoard(board);
    turn = normalizeDamaTurn(turn);
    const ch = normalizeOptionalChain(chainFr, chainFc);
    if (ch) {
        const sq = cellAt(board, ch.fr, ch.fc);
        if (!mine(turn, sq)) return false;
        return capturesFromSquare(board, turn, ch.fr, ch.fc).length > 0;
    }
    return globalMaxCaptures(board, turn) > 0;
}

function legalCaptureFirstMoves(board, turn) {
    const M = globalMaxCaptures(board, turn);
    if (M === 0) return [];
    const out = [];
    const seen = new Set();
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const ch = cellAt(board, r, c);
            if (!mine(turn, ch)) continue;
            if (maxCapturesChainLength(board, turn, r, c) !== M) continue;
            for (const h of capturesFromSquare(board, turn, r, c)) {
                const rest = maxCapturesRemainingSameTurnAfterHop(
                    board,
                    turn,
                    r,
                    c,
                    h.tr,
                    h.tc,
                    h.capturedR,
                    h.capturedC
                );
                if (1 + rest !== M) continue;
                const key = `${r},${c}-${h.tr},${h.tc}`;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ fr: r, fc: c, tr: h.tr, tc: h.tc, capturedR: h.capturedR, capturedC: h.capturedC });
            }
        }
    }
    return out;
}

function legalChainContinuations(board, turn, chainFr, chainFc) {
    const Mrem = maxCapturesChainLength(board, turn, chainFr, chainFc);
    if (Mrem === 0) return [];
    const out = [];
    for (const h of capturesFromSquare(board, turn, chainFr, chainFc)) {
        const rest = maxCapturesRemainingSameTurnAfterHop(
            board,
            turn,
            chainFr,
            chainFc,
            h.tr,
            h.tc,
            h.capturedR,
            h.capturedC
        );
        if (1 + rest !== Mrem) continue;
        out.push({
            fr: chainFr,
            fc: chainFc,
            tr: h.tr,
            tc: h.tc,
            capturedR: h.capturedR,
            capturedC: h.capturedC
        });
    }
    return out;
}

function manQuietMoves(board, turn, fr, fc) {
    const ch = cellAt(board, fr, fc);
    if ((ch !== 'w' && ch !== 'b') || !mine(turn, ch)) return [];
    if (ch === 'w' && fr === SIZE - 1) return [];
    if (ch === 'b' && fr === 0) return [];
    const out = [];
    for (const [dr, dc] of manDirsQuiet(turn)) {
        const tr = fr + dr;
        const tc = fc + dc;
        if (!isPlayable(board, tr, tc)) continue;
        if (cellAt(board, tr, tc) !== '.') continue;
        out.push({ tr, tc });
    }
    return out;
}

function allQuietMoves(board, turn) {
    const moves = [];
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const ch = cellAt(board, r, c);
            if (!mine(turn, ch)) continue;
            if (ch === 'w' || ch === 'b') {
                for (const h of manQuietMoves(board, turn, r, c)) {
                    moves.push({ fr: r, fc: c, tr: h.tr, tc: h.tc, capturedR: null, capturedC: null });
                }
            } else {
                for (const h of kingSlideTargets(board, turn, r, c)) {
                    moves.push({ fr: r, fc: c, tr: h.tr, tc: h.tc, capturedR: null, capturedC: null });
                }
            }
        }
    }
    return moves;
}

/**
 * Sunucu/istemci: DB veya socket’te zincir karesi yazılı olsa bile, o kareden yasal devam yoksa
 * zincir sayılmamalı (aksi halde “hayalet zincir” ile başka taş kilitlenir).
 */
export function chainContinuationActive(board, turn, chainFr, chainFc) {
    board = normalizeDamaBoard(board);
    turn = normalizeDamaTurn(turn);
    const ch = normalizeOptionalChain(chainFr, chainFc);
    if (!ch) return false;
    return listLegalMoves(board, turn, ch.fr, ch.fc).length > 0;
}

export function listLegalMoves(board, turn, chainFr, chainFc) {
    board = normalizeDamaBoard(board);
    turn = normalizeDamaTurn(turn);
    const chain = normalizeOptionalChain(chainFr, chainFc);
    if (chain) {
        const caps = legalChainContinuations(board, turn, chain.fr, chain.fc);
        if (caps.length) return caps;
        const chSq = cellAt(board, chain.fr, chain.fc);
        const mustContinue =
            mine(turn, chSq) && capturesFromSquare(board, turn, chain.fr, chain.fc).length > 0;
        if (mustContinue) return [];
        /* Zincir karesi için yasal devam yok: aynı turda başka taşla hamle yok; sıra sunucu güncellemesiyle rakibe geçer. */
        return [];
    }
    const mustCapture = globalMaxCaptures(board, turn) > 0;
    const captures = mustCapture ? legalCaptureFirstMoves(board, turn) : [];
    if (mustCapture) {
        if (captures.length > 0) return captures;
        return [];
    }
    return allQuietMoves(board, turn);
}

export function countPieces(board, turn) {
    let n = 0;
    for (let i = 0; i < board.length; i++) {
        const ch = board[i];
        if (turn === 'w') {
            if (ch === 'w' || ch === 'W') n++;
        } else {
            if (ch === 'b' || ch === 'B') n++;
        }
    }
    return n;
}

export function applyMoveOnBoard(board, fr, fc, tr, tc, capturedR, capturedC) {
    let next = board;
    const moving = cellAt(next, fr, fc);
    next = setCell(next, fr, fc, '.');
    if (capturedR != null && capturedC != null) {
        next = setCell(next, capturedR, capturedC, '.');
    }
    let landed = moving;
    /* Son sıraya inen çünbi hemen dama olur; zincir devamında da dama gücüyle yeme geçerli. */
    if (moving === 'w' && tr === SIZE - 1) landed = 'W';
    if (moving === 'b' && tr === 0) landed = 'B';
    next = setCell(next, tr, tc, landed);
    return next;
}

function toIntSq(n) {
    const x = Math.trunc(Number(n));
    return Number.isFinite(x) ? x : NaN;
}

export function tryMove(board, turn, chainFr, chainFc, fr, fc, tr, tc) {
    board = normalizeDamaBoard(board);
    turn = normalizeDamaTurn(turn);
    fr = toIntSq(fr);
    fc = toIntSq(fc);
    tr = toIntSq(tr);
    tc = toIntSq(tc);
    if (![fr, fc, tr, tc].every((n) => n >= 0 && n < SIZE)) {
        return { ok: false, reason: 'illegal' };
    }
    const legal = listLegalMoves(board, turn, chainFr, chainFc);
    const hit = legal.find((m) => m.fr === fr && m.fc === fc && m.tr === tr && m.tc === tc);
    if (!hit) return { ok: false, reason: 'illegal' };

    const fromPiece = cellAt(board, fr, fc);
    const nextBoard = normalizeDamaBoard(
        applyMoveOnBoard(board, fr, fc, tr, tc, hit.capturedR, hit.capturedC)
    );
    const toPiece = cellAt(nextBoard, tr, tc);
    const wasCapture = hit.capturedR != null;
    const manPromotedThisCapture =
        wasCapture &&
        (fromPiece === 'w' || fromPiece === 'b') &&
        ((fromPiece === 'w' && toPiece === 'W') || (fromPiece === 'b' && toPiece === 'B'));
    let nextTurn = turn;
    let nextChainFr = null;
    let nextChainFc = null;

    if (wasCapture) {
        if (manPromotedThisCapture) {
            nextTurn = turn === 'w' ? 'b' : 'w';
        } else {
            const cont = legalChainContinuations(nextBoard, turn, tr, tc);
            if (cont.length) {
                nextChainFr = tr;
                nextChainFc = tc;
            } else {
                nextTurn = turn === 'w' ? 'b' : 'w';
            }
        }
    } else {
        nextTurn = turn === 'w' ? 'b' : 'w';
    }

    const san = `${fr},${fc}-${tr},${tc}`;

    const opp = nextTurn;
    if (nextChainFr == null && countPieces(nextBoard, opp) === 0) {
        return {
            ok: true,
            board: nextBoard,
            turn: nextTurn,
            chainFr: null,
            chainFc: null,
            san,
            gameOver: true,
            winner: turn,
            resultText: 'Tüm taşlar yendi'
        };
    }

    if (nextChainFr == null) {
        const oppMoves = listLegalMoves(nextBoard, nextTurn, null, null);
        if (oppMoves.length === 0) {
            return {
                ok: true,
                board: nextBoard,
                turn: nextTurn,
                chainFr: null,
                chainFc: null,
                san,
                gameOver: true,
                winner: turn,
                resultText: 'Rakip hamle yapamıyor'
            };
        }
    }

    return {
        ok: true,
        board: nextBoard,
        turn: nextTurn,
        chainFr: nextChainFr,
        chainFc: nextChainFc,
        san,
        gameOver: false
    };
}

export function boardValid(board) {
    return typeof board === 'string' && board.length === SIZE * SIZE;
}

export function isLegacyDamaBoard(board) {
    return boardValid(board) && board.includes('#');
}

export function isDeprecatedDamaOpening(board) {
    return boardValid(board) && board === DEPRECATED_INITIAL_BOTTOM_WHITE;
}

export function normalizeDamaBoard(board) {
    if (!boardValid(board)) return initialBoardStr();
    if (isLegacyDamaBoard(board) || isDeprecatedDamaOpening(board)) return initialBoardStr();
    let b = board;
    for (let c = 0; c < SIZE; c++) {
        if (cellAt(b, SIZE - 1, c) === 'w') b = setCell(b, SIZE - 1, c, 'W');
        if (cellAt(b, 0, c) === 'b') b = setCell(b, 0, c, 'B');
    }
    return b;
}
