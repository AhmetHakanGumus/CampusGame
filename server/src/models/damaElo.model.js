import { pool } from '../db.js';
import { applyEloPair, eloKFactor, START_ELO } from '../elo.util.js';

export async function ensureDamaRatingRow(userId, displayName) {
    const uid = Number(userId);
    if (!Number.isFinite(uid)) return null;
    const name = String(displayName || `user-${uid}`).trim().slice(0, 64) || `user-${uid}`;
    const result = await pool.query(
        `INSERT INTO dama_elo_ratings (user_id, player_name, elo, games_played, wins, losses, draws)
         VALUES ($1, $2, $3, 0, 0, 0, 0)
         ON CONFLICT (user_id) DO UPDATE SET player_name = EXCLUDED.player_name, updated_at = NOW()
         RETURNING user_id, player_name, elo, games_played, wins, losses, draws`,
        [uid, name, START_ELO]
    );
    return result.rows[0] || null;
}

export async function countDamaRatedPlayers() {
    const r = await pool.query(`SELECT COUNT(*)::INTEGER AS c FROM dama_elo_ratings`);
    return Number(r.rows[0]?.c) || 0;
}

export async function getDamaRankSnapshotForUser(userId) {
    const uid = Number(userId);
    if (!Number.isFinite(uid)) {
        const total = await countDamaRatedPlayers();
        return {
            rank: total + 1,
            totalPlayers: total,
            elo: START_ELO,
            games: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            inTop10: false
        };
    }
    const total = await countDamaRatedPlayers();
    const result = await pool.query(
        `WITH ranked AS (
            SELECT user_id, player_name, elo, games_played AS games, wins, losses, draws,
                ROW_NUMBER() OVER (
                    ORDER BY elo DESC, games_played ASC, user_id ASC
                ) AS rank
            FROM dama_elo_ratings
        )
        SELECT * FROM ranked WHERE user_id = $1`,
        [uid]
    );
    if (!result.rows[0]) {
        return {
            rank: total + 1,
            totalPlayers: total,
            elo: START_ELO,
            games: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            inTop10: false
        };
    }
    const row = result.rows[0];
    const rank = Number(row.rank) || 1;
    return {
        rank,
        totalPlayers: Math.max(total, rank),
        elo: Number(row.elo) || START_ELO,
        games: Number(row.games) || 0,
        wins: Number(row.wins) || 0,
        losses: Number(row.losses) || 0,
        draws: Number(row.draws) || 0,
        inTop10: rank <= 10,
        playerName: row.player_name
    };
}

export async function queryDamaEloTop(limit = 10) {
    const lim = Math.max(1, Math.min(100, Number(limit) || 10));
    const result = await pool.query(
        `SELECT player_name, elo, games_played AS games, wins, losses, draws, user_id
         FROM dama_elo_ratings
         ORDER BY elo DESC, games_played ASC, user_id ASC
         LIMIT $1`,
        [lim]
    );
    return result.rows;
}

export async function applyDamaEloWinLoss(winnerUserId, loserUserId, winnerDisplayName, loserDisplayName) {
    const wid = Number(winnerUserId);
    const lid = Number(loserUserId);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureDamaRatingRowTx(client, wid, winnerDisplayName);
        await ensureDamaRatingRowTx(client, lid, loserDisplayName);
        const rw = await getRowTx(client, wid);
        const rl = await getRowTx(client, lid);
        const kW = eloKFactor(Number(rw.games_played), Number(rw.elo));
        const kL = eloKFactor(Number(rl.games_played), Number(rl.elo));
        const { newRa, newRb } = applyEloPair(Number(rw.elo), Number(rl.elo), 1, kW, kL);
        await client.query(
            `UPDATE dama_elo_ratings SET elo = $2, games_played = games_played + 1, wins = wins + 1, updated_at = NOW() WHERE user_id = $1`,
            [wid, newRa]
        );
        await client.query(
            `UPDATE dama_elo_ratings SET elo = $2, games_played = games_played + 1, losses = losses + 1, updated_at = NOW() WHERE user_id = $1`,
            [lid, newRb]
        );
        await client.query('COMMIT');
        return { winnerElo: newRa, loserElo: newRb };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

export async function applyDamaEloDraw(whiteUserId, blackUserId, whiteName, blackName) {
    const wuid = Number(whiteUserId);
    const buid = Number(blackUserId);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureDamaRatingRowTx(client, wuid, whiteName);
        await ensureDamaRatingRowTx(client, buid, blackName);
        const rw = await getRowTx(client, wuid);
        const rb = await getRowTx(client, buid);
        const kW = eloKFactor(Number(rw.games_played), Number(rw.elo));
        const kB = eloKFactor(Number(rb.games_played), Number(rb.elo));
        const { newRa, newRb } = applyEloPair(Number(rw.elo), Number(rb.elo), 0.5, kW, kB);
        await client.query(
            `UPDATE dama_elo_ratings SET elo = $2, games_played = games_played + 1, draws = draws + 1, updated_at = NOW() WHERE user_id = $1`,
            [wuid, newRa]
        );
        await client.query(
            `UPDATE dama_elo_ratings SET elo = $2, games_played = games_played + 1, draws = draws + 1, updated_at = NOW() WHERE user_id = $1`,
            [buid, newRb]
        );
        await client.query('COMMIT');
        return { whiteElo: newRa, blackElo: newRb };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function ensureDamaRatingRowTx(client, userId, displayName) {
    const uid = Number(userId);
    const name = String(displayName || `user-${uid}`).trim().slice(0, 64) || `user-${uid}`;
    await client.query(
        `INSERT INTO dama_elo_ratings (user_id, player_name, elo, games_played, wins, losses, draws)
         VALUES ($1, $2, $3, 0, 0, 0, 0)
         ON CONFLICT (user_id) DO UPDATE SET player_name = EXCLUDED.player_name, updated_at = NOW()`,
        [uid, name, START_ELO]
    );
}

async function getRowTx(client, userId) {
    const r = await client.query(`SELECT * FROM dama_elo_ratings WHERE user_id = $1`, [userId]);
    return r.rows[0];
}
