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
        'SELECT id, username, password_hash, COALESCE(is_guest, FALSE) AS is_guest FROM users WHERE username = $1',
        [String(username)]
    );
    return result.rows[0] || null;
}
