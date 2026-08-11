import express from 'express';
import { pool } from './db.js';
import {
    assertLeaderboardGameId,
    assertFiniteScore,
    sanitizeLeaderboardPlayerName
} from './inputValidation.js';
import {
    getChessLeaderboardSnapshot,
    getChessLeaderboardSnapshotByUserId,
    queryChessLeaderboardRows
} from './chessLeaderboard.util.js';
import {
    getDamaLeaderboardSnapshot,
    getDamaLeaderboardSnapshotByUserId,
    queryDamaLeaderboardRows
} from './damaLeaderboard.util.js';
import { countCampusPlayersWithBetterScore, queryCampusLeaderboardTop, upsertCampusScore } from './campusScores.util.js';
import { getSessionByToken } from './session.store.js';
import { findUserByUsername } from './models/user.model.js';
import { requestCampusCrownRoomRefresh } from './campusCrownSync.registry.js';

const router = express.Router();

function handleValidationError(res, err) {
    if (err && err.statusCode === 400) {
        return res.status(400).json({ message: err.message || 'Geçersiz istek.' });
    }
    return null;
}

/** Satranç: Elo sıralaması. Önerilen: user_id. Alternatif: player_name (tablodaki oyuncu adı). */
router.get('/dama/rank-by-player', async (req, res) => {
    try {
        const userId = Number(req.query.user_id);
        let s;
        if (Number.isFinite(userId)) {
            s = await getDamaLeaderboardSnapshotByUserId(userId);
        } else {
            const player_name = sanitizeLeaderboardPlayerName(req.query.player_name);
            if (!player_name) {
                return res.status(400).json({ message: 'user_id veya player_name gerekli.' });
            }
            s = await getDamaLeaderboardSnapshot(player_name);
        }
        return res.json({
            rank: s.rank,
            total_players: s.totalPlayers,
            elo: s.elo,
            wins: s.wins,
            losses: s.losses,
            draws: s.draws,
            games: s.games
        });
    } catch (error) {
        const v = handleValidationError(res, error);
        if (v) return v;
        return res.status(500).json({ message: 'Sıralama alınamadı.' });
    }
});

router.get('/satranc/rank-by-player', async (req, res) => {
    try {
        const userId = Number(req.query.user_id);
        let s;
        if (Number.isFinite(userId)) {
            s = await getChessLeaderboardSnapshotByUserId(userId);
        } else {
            const player_name = sanitizeLeaderboardPlayerName(req.query.player_name);
            if (!player_name) {
                return res.status(400).json({ message: 'user_id veya player_name gerekli.' });
            }
            s = await getChessLeaderboardSnapshot(player_name);
        }
        return res.json({
            rank: s.rank,
            total_players: s.totalPlayers,
            elo: s.elo,
            wins: s.wins,
            losses: s.losses,
            draws: s.draws,
            games: s.games
        });
    } catch (error) {
        const v = handleValidationError(res, error);
        if (v) return v;
        return res.status(500).json({ message: 'Sıralama alınamadı.' });
    }
});

router.get('/:game', async (req, res) => {
    try {
        const game = assertLeaderboardGameId(req.params.game);
        const isChess = String(game) === 'satranc';
        const isDama = String(game) === 'dama';
        const result = isChess
            ? { rows: await queryChessLeaderboardRows(10) }
            : isDama
              ? { rows: await queryDamaLeaderboardRows(10) }
              : { rows: await queryCampusLeaderboardTop(game, 10) };
        return res.json(result.rows);
    } catch (error) {
        const v = handleValidationError(res, error);
        if (v) return v;
        return res.status(500).json({ message: 'Leaderboard alınamadı.' });
    }
});

router.get('/:game/rank', async (req, res) => {
    try {
        const game = assertLeaderboardGameId(req.params.game);
        const score = Number(req.query.score || 0);
        const isChess = String(game) === 'satranc';
        const isDama = String(game) === 'dama';
        const betterCount =
            isChess
                ? (
                      await pool.query(
                          `SELECT COUNT(*)::int AS better_count
                           FROM chess_elo_ratings
                           WHERE elo > $1`,
                          [score]
                      )
                  ).rows[0].better_count
                : isDama
                  ? (
                        await pool.query(
                            `SELECT COUNT(*)::int AS better_count
                             FROM dama_elo_ratings
                             WHERE elo > $1`,
                            [score]
                        )
                    ).rows[0].better_count
                  : await countCampusPlayersWithBetterScore(game, score);
        return res.json({ rank: betterCount + 1 });
    } catch (error) {
        const v = handleValidationError(res, error);
        if (v) return v;
        return res.status(500).json({ message: 'Sıralama alınamadı.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { game: rawGame, player_name: rawName, score: rawScore, sessionToken: rawTok } =
            req.body || {};
        const game = assertLeaderboardGameId(rawGame);
        let player_name = sanitizeLeaderboardPlayerName(rawName);
        const tok = String(rawTok || '').trim();
        if (tok) {
            const session = getSessionByToken(tok);
            if (session?.username) {
                const u = await findUserByUsername(session.username);
                const forced = sanitizeLeaderboardPlayerName(u?.username || session.username);
                if (forced) player_name = forced;
            }
        }
        if (!player_name) {
            return res.status(400).json({ message: 'player_name gerekli veya geçersiz.' });
        }
        const score = assertFiniteScore(rawScore);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { row } = await upsertCampusScore(client, game, player_name, score);
            await client.query('COMMIT');
            requestCampusCrownRoomRefresh();
            return res.status(200).json(row);
        } catch (e) {
            try {
                await client.query('ROLLBACK');
            } catch (_r) {
                /* ignore */
            }
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        const v = handleValidationError(res, error);
        if (v) return v;
        return res.status(500).json({ message: 'Skor kaydedilemedi.' });
    }
});

export default router;

