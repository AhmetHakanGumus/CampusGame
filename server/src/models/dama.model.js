import { pool } from '../db.js';

export const DEFAULT_GAME_MESA_ID = 1;

export async function upsertQueueEntry({ userId, username, socketId, mesaId = DEFAULT_GAME_MESA_ID }) {
    const result = await pool.query(
        `
        INSERT INTO dama_queue (mesa_id, user_id, username, status, socket_id, joined_at, last_seen_at)
        VALUES ($1, $2, $3, 'waiting', $4, NOW(), NOW())
        ON CONFLICT (mesa_id, user_id)
        DO UPDATE SET
            username = EXCLUDED.username,
            status = 'waiting',
            socket_id = EXCLUDED.socket_id,
            last_seen_at = NOW()
        RETURNING mesa_id, user_id, username, status, socket_id, joined_at, last_seen_at
        `,
        [mesaId, userId, username, socketId || null]
    );
    return result.rows[0] || null;
}

export async function removeQueueEntry(userId, mesaId = DEFAULT_GAME_MESA_ID) {
    await pool.query('DELETE FROM dama_queue WHERE user_id = $1 AND mesa_id = $2', [userId, mesaId]);
}

export async function removeQueueEntryBySocketId(socketId) {
    if (!socketId) return;
    await pool.query('DELETE FROM dama_queue WHERE socket_id = $1', [socketId]);
}

export async function touchQueueEntry(userId, socketId = null, mesaId = DEFAULT_GAME_MESA_ID) {
    await pool.query(
        `
        UPDATE dama_queue
        SET last_seen_at = NOW(),
            socket_id = COALESCE($2, socket_id)
        WHERE user_id = $1 AND mesa_id = $3
        `,
        [userId, socketId, mesaId]
    );
}

export async function getFirstWaitingQueueEntry(exceptUserId = null, mesaId = DEFAULT_GAME_MESA_ID) {
    const result = await pool.query(
        `
        SELECT mesa_id, user_id, username, status, socket_id, joined_at, last_seen_at
        FROM dama_queue
        WHERE status = 'waiting'
          AND mesa_id = $2
          AND ($1::INTEGER IS NULL OR user_id <> $1)
        ORDER BY joined_at ASC
        LIMIT 1
        `,
        [exceptUserId, mesaId]
    );
    return result.rows[0] || null;
}

export async function getQueueCount(mesaId = DEFAULT_GAME_MESA_ID) {
    const result = await pool.query(
        `SELECT COUNT(*)::INTEGER AS total FROM dama_queue WHERE status = 'waiting' AND mesa_id = $1`,
        [mesaId]
    );
    return result.rows[0]?.total || 0;
}

export async function isUserQueued(userId, mesaId = DEFAULT_GAME_MESA_ID) {
    const result = await pool.query(
        `
        SELECT EXISTS (
            SELECT 1 FROM dama_queue
            WHERE user_id = $1
              AND mesa_id = $2
              AND status = 'waiting'
        ) AS queued
        `,
        [userId, mesaId]
    );
    return !!result.rows[0]?.queued;
}

export async function clearQueueSocketBySocketId(socketId) {
    await pool.query(
        `
        UPDATE dama_queue
        SET socket_id = NULL
        WHERE socket_id = $1
        `,
        [socketId]
    );
}

export async function createMatch({
    whiteUserId,
    blackUserId,
    board,
    turn,
    mesaId = DEFAULT_GAME_MESA_ID
}) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const matchRes = await client.query(
            `
            INSERT INTO dama_matches (white_user_id, black_user_id, status, mesa_id)
            VALUES ($1, $2, 'active', $3)
            RETURNING id, white_user_id, black_user_id, status, winner_user_id, exit_reason, started_at, ended_at, mesa_id
            `,
            [whiteUserId, blackUserId, mesaId]
        );
        const match = matchRes.rows[0];
        await client.query(
            `
            INSERT INTO dama_match_state (match_id, board, turn, last_move_san, chain_from_r, chain_from_c, last_event_at)
            VALUES ($1, $2, $3, NULL, NULL, NULL, NOW())
            `,
            [match.id, board, turn]
        );
        await client.query(
            // Kuşaklar arası eşleşmede (örn. PC=0, VR=1/2) iki oyuncu farklı mesaId'lerde beklemiş olabilir.
            // Bu yüzden kullanıcı bazında her mesadan temizliyoruz.
            'DELETE FROM dama_queue WHERE user_id = $1 OR user_id = $2',
            [whiteUserId, blackUserId]
        );
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
            m.mesa_id,
            s.board,
            s.turn,
            s.last_move_san,
            s.chain_from_r,
            s.chain_from_c
        FROM dama_matches m
        JOIN dama_match_state s ON s.match_id = m.id
        WHERE m.status = 'active'
          AND (m.white_user_id = $1 OR m.black_user_id = $1)
        ORDER BY m.started_at DESC
        LIMIT 1
        `,
        [userId]
    );
    return result.rows[0] || null;
}

export async function getFirstActiveMatch(mesaId = DEFAULT_GAME_MESA_ID) {
    const result = await pool.query(
        `
        SELECT m.id, m.white_user_id, m.black_user_id, m.status, m.mesa_id
        FROM dama_matches m
        WHERE m.status = 'active'
          AND m.mesa_id = $1
        ORDER BY m.started_at DESC NULLS LAST, m.id DESC
        LIMIT 1
        `,
        [mesaId]
    );
    return result.rows[0] || null;
}

/** İzleyici listesi için: masa üzerindeki tüm aktif maçlar (son N adet). */
export async function getActiveMatches(mesaId = DEFAULT_GAME_MESA_ID, limit = 25) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 25));
    const result = await pool.query(
        `
        SELECT m.id, m.white_user_id, m.black_user_id, m.status, m.mesa_id
        FROM dama_matches m
        WHERE m.status = 'active'
          AND m.mesa_id = $1
        ORDER BY m.started_at DESC NULLS LAST, m.id DESC
        LIMIT $2
        `,
        [mesaId, safeLimit]
    );
    return result.rows || [];
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
            m.mesa_id,
            s.board,
            s.turn,
            s.last_move_san,
            s.chain_from_r,
            s.chain_from_c
        FROM dama_matches m
        LEFT JOIN dama_match_state s ON s.match_id = m.id
        WHERE m.id = $1
        LIMIT 1
        `,
        [matchId]
    );
    return result.rows[0] || null;
}

/** Eski `#` damalı tahtayı Türk açılışına çeker (sıra ve zincir sıfırlanır). */
export async function resetDamaMatchOpeningState(matchId, board, turn = 'w') {
    await pool.query(
        `
        UPDATE dama_match_state
        SET board = $2,
            turn = $3,
            last_move_san = NULL,
            chain_from_r = NULL,
            chain_from_c = NULL,
            last_event_at = NOW()
        WHERE match_id = $1
        `,
        [matchId, board, turn]
    );
}

/** Tahta ile uyumsuz kalan zincir satırını DB’den siler (hayalet zincir onarımı). */
export async function clearDamaChainOnly(matchId) {
    await pool.query(
        `
        UPDATE dama_match_state
        SET chain_from_r = NULL,
            chain_from_c = NULL,
            last_event_at = NOW()
        WHERE match_id = $1
        `,
        [matchId]
    );
}

export async function appendMoveAndUpdateState({
    matchId,
    san,
    boardAfter,
    turnAfter,
    chainFromR = null,
    chainFromC = null
}) {
    await pool.query(
        `
        UPDATE dama_match_state
        SET board = $2,
            turn = $3,
            last_move_san = $4,
            chain_from_r = $5,
            chain_from_c = $6,
            last_event_at = NOW()
        WHERE match_id = $1
        `,
        [matchId, boardAfter, turnAfter, san, chainFromR, chainFromC]
    );
}

export async function finishMatch({ matchId, winnerUserId = null, exitReason = null }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `
            UPDATE dama_matches
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
        if (result.rows[0]) {
            await client.query('DELETE FROM dama_match_state WHERE match_id = $1', [matchId]);
        }
        await client.query('COMMIT');
        return result.rows[0] || null;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
