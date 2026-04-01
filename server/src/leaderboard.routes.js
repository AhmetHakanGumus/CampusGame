import express from 'express';
import { pool } from './db.js';

const router = express.Router();

router.get('/:game', async (req, res) => {
    try {
        const { game } = req.params;
        // Satrançta puan "galibiyet başına 50" birikir; diğer oyunlarda tek skor kaydı mantığı korunur.
        const isChess = String(game) === 'satranc';
        const result = isChess
            ? await pool.query(
                  `SELECT player_name, SUM(score)::INTEGER AS score
                   FROM campus_scores
                   WHERE game = $1
                   GROUP BY player_name
                   ORDER BY score DESC, MIN(created_at) ASC
                   LIMIT 10`,
                  [game]
              )
            : await pool.query(
                  `SELECT player_name, score
                   FROM campus_scores
                   WHERE game = $1
                   ORDER BY score DESC, created_at ASC
                   LIMIT 10`,
                  [game]
              );
        return res.json(result.rows);
    } catch (error) {
        return res.status(500).json({ message: 'Leaderboard alınamadı.' });
    }
});

router.get('/:game/rank', async (req, res) => {
    try {
        const { game } = req.params;
        const score = Number(req.query.score || 0);
        const isChess = String(game) === 'satranc';
        const result = isChess
            ? await pool.query(
                  `WITH totals AS (
                       SELECT player_name, SUM(score)::INTEGER AS total
                       FROM campus_scores
                       WHERE game = $1
                       GROUP BY player_name
                   )
                   SELECT COUNT(*)::int AS better_count
                   FROM totals
                   WHERE total > $2`,
                  [game, score]
              )
            : await pool.query(
                  `SELECT COUNT(*)::int AS better_count
                   FROM campus_scores
                   WHERE game = $1 AND score > $2`,
                  [game, score]
              );
        return res.json({ rank: result.rows[0].better_count + 1 });
    } catch (error) {
        return res.status(500).json({ message: 'Sıralama alınamadı.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { game, player_name, score } = req.body || {};
        if (!game || !player_name || Number.isNaN(Number(score))) {
            return res.status(400).json({ message: 'game, player_name, score zorunlu.' });
        }
        const result = await pool.query(
            `INSERT INTO campus_scores (game, player_name, score)
             VALUES ($1, $2, $3)
             RETURNING id, game, player_name, score`,
            [String(game), String(player_name).slice(0, 64), Number(score)]
        );
        return res.status(201).json(result.rows[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Skor kaydedilemedi.' });
    }
});

export default router;

