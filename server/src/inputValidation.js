/**
 * SQL enjeksiyonu ve kötüye kullanımı azaltmak için sunucu tarafı girdi sınırları.
 * Tüm SQL sorguları $1..$n parametreleri ile kalmalı; burada ek olarak anlam doğrulaması yapılır.
 */

/** Kampüs leaderboard sekmeleriyle aynı kimlikler (client js/campus-app.js lbGames). */
export const LEADERBOARD_GAME_IDS = new Set([
    'satranc',
    'dama',
    'masa_tenisi',
    'flappy_bird',
    'penalti',
    'okculuk',
    'basket'
]);

export function assertLeaderboardGameId(raw) {
    const g = String(raw || '').trim();
    if (!LEADERBOARD_GAME_IDS.has(g)) {
        const e = new Error('Geçersiz oyun.');
        e.statusCode = 400;
        throw e;
    }
    return g;
}

/** Kayıt / giriş: Unicode harf ve rakam + alt çizgi (Türkçe ı, ş, ğ …). */
export function sanitizeUsernameForAuth(raw) {
    const s = String(raw || '').trim();
    if (s.length < 3 || s.length > 64) return null;
    if (!/^[\p{L}\p{N}_]+$/u.test(s)) return null;
    return s;
}

/** Skor tablosu oyuncu adı: harf/rakam, boşluk ve güvenli noktalama; kontrol / SQL meta karakterleri yok. */
export function sanitizeLeaderboardPlayerName(raw) {
    let s = String(raw || '').trim().slice(0, 64);
    if (!s) return null;
    s = s.replace(/[\u0000-\u001F\u007F]/g, '');
    if (!s) return null;
    if (!/^[\p{L}\p{N}\s._\-#]+$/u.test(s)) return null;
    return s;
}

export function assertFiniteScore(n) {
    const x = Number(n);
    if (!Number.isFinite(x) || x < 0 || x > 1e9) {
        const e = new Error('Geçersiz skor.');
        e.statusCode = 400;
        throw e;
    }
    return Math.trunc(x);
}
