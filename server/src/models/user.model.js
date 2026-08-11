import { pool } from '../db.js';

export async function createUser(username, passwordHash, isGuest = false) {
    const result = await pool.query(
        'INSERT INTO users (username, password_hash, is_guest) VALUES ($1, $2, $3) RETURNING id, username, is_guest',
        [String(username), String(passwordHash), !!isGuest]
    );
    return result.rows[0];
}

export async function findUserByUsername(username) {
    const result = await pool.query(
        `SELECT id, username, password_hash, COALESCE(is_guest, FALSE) AS is_guest,
                crown_choice_game, crown_choice_place, COALESCE(crown_choice_hidden, FALSE) AS crown_choice_hidden
         FROM users WHERE username = $1`,
        [String(username)]
    );
    return result.rows[0] || null;
}

export async function updateUserCrownChoice(userId, game, place) {
    await pool.query(
        `UPDATE users
         SET crown_choice_game = $2,
             crown_choice_place = $3,
             crown_choice_hidden = FALSE
         WHERE id = $1`,
        [Number(userId), String(game), Number(place)]
    );
}

export async function clearUserCrownChoice(userId) {
    await pool.query(
        `UPDATE users
         SET crown_choice_game = NULL,
             crown_choice_place = NULL,
             crown_choice_hidden = TRUE
         WHERE id = $1`,
        [Number(userId)]
    );
}
