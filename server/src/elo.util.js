/**
 * Arpad Elo tabanlı klasik satranç Elo’su (USCF/FIDE’ye yakın K katsayıları).
 * Beklenen skor: E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 */

const ELO_MIN = 100;
const ELO_MAX = 4000;
const START_ELO = 1500;

/** İlk 30 partide K=40, 2400+ için K=10, aksi K=20 */
export function eloKFactor(gamesPlayedBeforeMatch, ratingBeforeMatch) {
    const g = Number(gamesPlayedBeforeMatch) || 0;
    const r = Number(ratingBeforeMatch) || START_ELO;
    if (g < 30) return 40;
    if (r >= 2400) return 10;
    return 20;
}

export function expectedScore(ra, rb) {
    return 1 / (1 + Math.pow(10, (Number(rb) - Number(ra)) / 400));
}

/**
 * @param {number} ra
 * @param {number} rb
 * @param {number} scoreA — 1 galibiyet, 0.5 beraberlik, 0 mağlubiyet
 * @param {number} kA
 * @param {number} kB
 */
export function applyEloPair(ra, rb, scoreA, kA, kB) {
    const a = Number(ra);
    const b = Number(rb);
    const sa = Math.min(1, Math.max(0, Number(scoreA)));
    const sb = 1 - sa;
    const ea = expectedScore(a, b);
    const eb = expectedScore(b, a);
    let na = Math.round(a + kA * (sa - ea));
    let nb = Math.round(b + kB * (sb - eb));
    na = Math.max(ELO_MIN, Math.min(ELO_MAX, na));
    nb = Math.max(ELO_MIN, Math.min(ELO_MAX, nb));
    return { newRa: na, newRb: nb, expectedA: ea, expectedB: eb };
}

export { START_ELO, ELO_MIN, ELO_MAX };
