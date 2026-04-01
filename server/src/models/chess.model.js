import { pool } from '../db.js';

export async function upsertQueueEntry({ userId, username, socketId }) {
    const result = await pool.query(
        `
        INSERT INTO chess_queue (user_id, username, status, socket_id, joined_at, last_seen_at)
        VALUES ($1, $2, 'waiting', $3, NOW(), NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
            username = EXCLUDED.username,
            status = 'waiting',
            socket_id = EXCLUDED.socket_id,
            last_seen_at = NOW()
        RETURNING user_id, username, status, socket_id, joined_at, last_seen_at
        `,
        [userId, username, socketId || null]
    );
    return result.rows[0] || null;
}

export async function removeQueueEntry(userId) {
    await pool.query('DELETE FROM chess_queue WHERE user_id = $1', [userId]);
}

export async function removeQueueEntryBySocketId(socketId) {
    if (!socketId) return;
    await pool.query('DELETE FROM chess_queue WHERE socket_id = $1', [socketId]);
}

export async function touchQueueEntry(userId, socketId = null) {
    await pool.query(
        `
        UPDATE chess_queue
        SET last_seen_at = NOW(),
            socket_id = COALESCE($2, socket_id)
        WHERE user_id = $1
        `,
        [userId, socketId]
    );
}

export async function getFirstWaitingQueueEntry(exceptUserId = null) {
    const result = await pool.query(
        `
        SELECT user_id, username, status, socket_id, joined_at, last_seen_at
        FROM chess_queue
        WHERE status = 'waiting'
          AND ($1::INTEGER IS NULL OR user_id <> $1)
        ORDER BY joined_at ASC
        LIMIT 1
        `,
        [exceptUserId]
    );
    return result.rows[0] || null;
}

export async function getQueueCount() {
    const result = await pool.query(
        `SELECT COUNT(*)::INTEGER AS total FROM chess_queue WHERE status = 'waiting'`
    );
    return result.rows[0]?.total || 0;
}

export async function isUserQueued(userId) {
    const result = await pool.query(
        `
        SELECT EXISTS (
            SELECT 1 FROM chess_queue
            WHERE user_id = $1
              AND status = 'waiting'
        ) AS queued
        `,
        [userId]
    );
    return !!result.rows[0]?.queued;
}

export async function clearQueueSocketBySocketId(socketId) {
    await pool.query(
        `
        UPDATE chess_queue
        SET socket_id = NULL
        WHERE socket_id = $1
        `,
        [socketId]
    );
}

export async function createMatch({
    whiteUserId,
    blackUserId,
    fen,
    turn
}) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const matchRes = await client.query(
            `
            INSERT INTO chess_matches (white_user_id, black_user_id, status)
            VALUES ($1, $2, 'active')
            RETURNING id, white_user_id, black_user_id, status, winner_user_id, exit_reason, started_at, ended_at
            `,
            [whiteUserId, blackUserId]
        );
        const match = matchRes.rows[0];
        await client.query(
            `
            INSERT INTO chess_match_state (match_id, fen, turn, last_move_san, last_event_at)
            VALUES ($1, $2, $3, NULL, NOW())
            `,
            [match.id, fen, turn]
        );
        await client.query('DELETE FROM chess_queue WHERE user_id = $1 OR user_id = $2', [
            whiteUserId,
            blackUserId
        ]);
        await client.query('COMMIT');
        return match;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function getActiveMatchForUser(userId) {
    const result = await pool.query(
        `
        SELECT
            m.id,
            m.white_user_id,
            m.black_user_id,
            m.status,
            m.winner_user_id,
            m.exit_reason,
            m.started_at,
            m.ended_at,
            s.fen,
            s.turn,
            s.last_move_san
        FROM chess_matches m
        JOIN chess_match_state s ON s.match_id = m.id
        WHERE m.status = 'active'
          AND (m.white_user_id = $1 OR m.black_user_id = $1)
        ORDER BY m.started_at DESC
        LIMIT 1
        `,
        [userId]
    );
    return result.rows[0] || null;
}

export async function getMatchById(matchId) {
    const result = await pool.query(
        `
        SELECT
            m.id,
            m.white_user_id,
            m.black_user_id,
            m.status,
            m.winner_user_id,
            m.exit_reason,
            m.started_at,
            m.ended_at,
            s.fen,
            s.turn,
            s.last_move_san
        FROM chess_matches m
        JOIN chess_match_state s ON s.match_id = m.id
        WHERE m.id = $1
        LIMIT 1
        `,
        [matchId]
    );
    return result.rows[0] || null;
}

export async function appendMoveAndUpdateState({
    matchId,
    ply,
    from,
    to,
    promotion,
    san,
    fenAfter,
    movedByUserId,
    turnAfter
}) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `
            INSERT INTO chess_moves (match_id, ply, from_sq, to_sq, promotion, san, fen_after, moved_by_user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [matchId, ply, from, to, promotion || null, san, fenAfter, movedByUserId]
        );
        await client.query(
            `
            UPDATE chess_match_state
            SET fen = $2,
                turn = $3,
                last_move_san = $4,
                last_event_at = NOW()
            WHERE match_id = $1
            `,
            [matchId, fenAfter, turnAfter, san]
        );
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function finishMatch({ matchId, winnerUserId = null, exitReason = null }) {
    const result = await pool.query(
        `
        UPDATE chess_matches
        SET status = 'finished',
            winner_user_id = $2,
            exit_reason = $3,
            ended_at = NOW()
        WHERE id = $1
          AND status = 'active'
        RETURNING id, white_user_id, black_user_id, winner_user_id, exit_reason, ended_at
        `,
        [matchId, winnerUserId, exitReason]
    );
    return result.rows[0] || null;
}

export async function getMoveCount(matchId) {
    const result = await pool.query(
        `SELECT COUNT(*)::INTEGER AS total FROM chess_moves WHERE match_id = $1`,
        [matchId]
    );
    return result.rows[0]?.total || 0;
}
