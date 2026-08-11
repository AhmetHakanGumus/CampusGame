/** Başlangıç materyali (şah hariç): 8+6+6+10+9 = 39. */
const START_SIDE_MATERIAL = 39;

function pieceValueChar(ch) {
    if (!ch || ch === '/') return 0;
    const c = ch.toLowerCase();
    if (c === 'p') return 1;
    if (c === 'n' || c === 'b') return 3;
    if (c === 'r') return 5;
    if (c === 'q') return 9;
    return 0;
}

/**
 * FEN tahta kısmından beyaz/siyah taş değerlerini (şah sayılmaz) toplar.
 * @param {string} fen
 * @returns {{ w: number, b: number }}
 */
export function materialOnBoardFromFen(fen) {
    const placement = String(fen || '').trim().split(/\s+/)[0] || '';
    let w = 0;
    let b = 0;
    for (let i = 0; i < placement.length; i++) {
        const ch = placement[i];
        if (ch === '/') continue;
        if (ch >= '1' && ch <= '8') continue;
        const v = pieceValueChar(ch);
        if (!v) continue;
        if (ch === ch.toUpperCase()) w += v;
        else b += v;
    }
    return { w, b };
}

/**
 * Rakipten alınan taşların toplam puanı (p=1, n/b=3, r=5, q=9).
 * @param {string} fen
 * @param {'w'|'b'} color — hangi taraf için hesaplanacak
 */
export function materialCapturedBySide(fen, color) {
    const { w, b } = materialOnBoardFromFen(fen);
    if (color === 'w') return Math.max(0, START_SIDE_MATERIAL - b);
    return Math.max(0, START_SIDE_MATERIAL - w);
}
