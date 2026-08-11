import { pool } from './db.js';
import { assertLeaderboardGameId, sanitizeLeaderboardPlayerName } from './inputValidation.js';
import { getCampusPlaceInTop10 } from './campusScores.util.js';

const NON_CHESS_GAMES = ['masa_tenisi', 'flappy_bird', 'penalti', 'okculuk', 'basket'];

/**
 * Satranç: user_id ile ilk 10 içindeki sıra (Elo listesi).
 * @returns {number|null} 1–10 veya yok
 */
export async function getDamaLeaderboardPlaceByUserId(userId) {
    const uid = Number(userId);
    if (!Number.isFinite(uid)) return null;
    const r = await pool.query(
        `WITH ranked AS (
            SELECT user_id,
                ROW_NUMBER() OVER (ORDER BY elo DESC, games_played ASC, user_id ASC) AS place
            FROM dama_elo_ratings
        )
        SELECT place FROM ranked WHERE user_id = $1`,
        [uid]
    );
    const p = Number(r.rows[0]?.place);
    return Number.isFinite(p) ? p : null;
}

export async function getChessLeaderboardPlaceByUserId(userId) {
    const uid = Number(userId);
    if (!Number.isFinite(uid)) return null;
    const r = await pool.query(
        `WITH ranked AS (
            SELECT user_id,
                ROW_NUMBER() OVER (ORDER BY elo DESC, games_played ASC, user_id ASC) AS place
            FROM chess_elo_ratings
        )
        SELECT place FROM ranked WHERE user_id = $1`,
        [uid]
    );
    const p = Number(r.rows[0]?.place);
    return Number.isFinite(p) ? p : null;
}

/**
 * Oyuncu başına en yüksek skor; ana liderlik API’si ile aynı sıra (yinelenen satırlar tek satır).
 * @returns {number|null} 1–10 veya listede yoksa null
 */
export async function getCampusGamePlaceByPlayerName(game, playerName) {
    const g = assertLeaderboardGameId(game);
    const name = sanitizeLeaderboardPlayerName(playerName);
    if (!name) return null;
    return getCampusPlaceInTop10(g, name);
}

function uniqueSanitizedNames(rawList) {
    const seen = new Set();
    const out = [];
    for (const raw of rawList || []) {
        const s = sanitizeLeaderboardPlayerName(raw);
        if (!s) continue;
        const key = s.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
    }
    return out;
}

/**
 * Taç için: yalnızca ilk 3 (her oyun).
 * @param {number} userId
 * @param {string|string[]} nicknameOrNames — kullanıcı adı ve/veya istemciden gelen takma ad (campus_scores eşleşmesi)
 * @returns {Promise<Array<{ game: string, place: number }>>}
 */
export async function getEligibleCrownBadges(userId, nicknameOrNames) {
    const uid = Number(userId);
    const badges = [];
    if (Number.isFinite(uid)) {
        const cp = await getChessLeaderboardPlaceByUserId(uid);
        if (cp != null && cp <= 3) badges.push({ game: 'satranc', place: cp });
        const dp = await getDamaLeaderboardPlaceByUserId(uid);
        if (dp != null && dp <= 3) badges.push({ game: 'dama', place: dp });
    }
    const names = uniqueSanitizedNames(
        Array.isArray(nicknameOrNames) ? nicknameOrNames : [nicknameOrNames]
    );
    for (const g of NON_CHESS_GAMES) {
        let best = null;
        for (const n of names) {
            const p = await getCampusGamePlaceByPlayerName(g, n);
            if (p != null && p <= 3 && (best == null || p < best)) best = p;
        }
        if (best != null) badges.push({ game: g, place: best });
    }
    return badges;
}

export function resolveEquippedCrown(eligible, crownGame, crownPlace) {
    if (!eligible?.length) return null;
    const cg = crownGame != null ? String(crownGame).trim() : '';
    const cp = Number(crownPlace);
    if (cg && Number.isFinite(cp) && cp >= 1 && cp <= 3) {
        const ok = eligible.some((b) => b.game === cg && b.place === cp);
        if (ok) return { game: cg, place: cp };
    }
    if (eligible.length === 1) return { game: eligible[0].game, place: eligible[0].place };
    return null;
}
