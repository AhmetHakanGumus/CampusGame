import { pool } from './db.js';

/** PostgreSQL: oyuncu kimliği = LOWER(TRIM(name)); aynı kişi tek satır (en iyi skor). */
export const CAMPUS_BEST_ROWS_CTE = `best_rows AS (
  SELECT DISTINCT ON (LOWER(TRIM(BOTH FROM player_name)))
    id,
    player_name,
    score,
    created_at
  FROM campus_scores
  WHERE game = $1
  ORDER BY LOWER(TRIM(BOTH FROM player_name)), score DESC, created_at ASC
)`;

/**
 * @param {string} game
 * @param {number} limit
 */
export async function queryCampusLeaderboardTop(game, limit = 10) {
    const lim = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 10)));
    const r = await pool.query(
        `WITH ${CAMPUS_BEST_ROWS_CTE}
         SELECT player_name, score
         FROM best_rows
         ORDER BY score DESC, created_at ASC, LOWER(TRIM(BOTH FROM player_name)) ASC
         LIMIT $2`,
        [game, lim]
    );
    return r.rows;
}

/**
 * Kaç oyuncunun (normalize) en iyi skoru bu skordan yüksek.
 */
export async function countCampusPlayersWithBetterScore(game, score) {
    const s = Number(score);
    const r = await pool.query(
        `WITH ${CAMPUS_BEST_ROWS_CTE}
         SELECT COUNT(*)::int AS c FROM best_rows WHERE score > $2`,
        [game, s]
    );
    return Number(r.rows[0]?.c) || 0;
}

/**
 * @param {string} game
 * @param {string} normalizedCompareName — sanitize edilmiş isim
 * @returns {number|null} 1–10 veya yok
 */
export async function getCampusPlaceInTop10(game, compareName) {
    const r = await pool.query(
        `WITH ${CAMPUS_BEST_ROWS_CTE},
        ranked AS (
          SELECT player_name,
            ROW_NUMBER() OVER (
              ORDER BY score DESC, created_at ASC, LOWER(TRIM(BOTH FROM player_name)) ASC
            ) AS place
          FROM best_rows
        )
        SELECT place FROM ranked
        WHERE LOWER(TRIM(BOTH FROM player_name)) = LOWER(TRIM(BOTH FROM $2::text))
          AND place <= 10`,
        [game, compareName]
    );
    const p = Number(r.rows[0]?.place);
    return Number.isFinite(p) ? p : null;
}

/**
 * Aynı oyun + normalize isimde tek satır (uniq_campus_scores_game_player_norm).
 * Yeni skor eskisinden düşük veya eşitse tablo değişmez; yanıtta mevcut rekor döner.
 * @returns {{ row: object }}
 */
export async function upsertCampusScore(client, game, playerName, score) {
    const s = Number(score);
    const r = await client.query(
        `INSERT INTO campus_scores (game, player_name, score) VALUES ($1, $2, $3)
         ON CONFLICT (game, (LOWER(TRIM(BOTH FROM player_name))))
         DO UPDATE SET
           score = GREATEST(campus_scores.score, EXCLUDED.score),
           player_name = CASE
             WHEN EXCLUDED.score > campus_scores.score THEN EXCLUDED.player_name
             ELSE campus_scores.player_name
           END,
           created_at = CASE
             WHEN EXCLUDED.score > campus_scores.score THEN NOW()
             ELSE campus_scores.created_at
           END
         RETURNING id, game, player_name, score`,
        [game, playerName, s]
    );
    const row = r.rows[0];
    const unchanged = Number(row.score) > s;
    return { row: unchanged ? { ...row, unchanged: true } : row };
}
