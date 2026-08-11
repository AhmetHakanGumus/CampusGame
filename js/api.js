'use strict';

import { sanitizePlainText } from './security.js';

// Vite dev sunucusu `/api` isteklerini backend'e proxy'lediği için
// fallback'te aynı origin'e istek atmak yeterli olur.
// (Production'da gerekiyorsa VITE_API_BASE ile tam URL verilebilir.)
const API_BASE = import.meta.env.VITE_API_BASE || '';

async function jsonFetch(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const m = data.message != null ? sanitizePlainText(data.message, 500) : '';
        throw new Error(m || `API error ${res.status}`);
    }
    return data;
}

export function registerUser(username, password) {
    return jsonFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });
}

export function loginUser(username, password) {
    return jsonFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });
}

export function guestLogin() {
    return jsonFetch('/api/auth/guest', {
        method: 'POST',
        body: JSON.stringify({})
    });
}

export function getLeaderboard(game) {
    return jsonFetch(`/api/leaderboard/${encodeURIComponent(game)}`);
}

export function saveScore(game, player_name, score, sessionToken) {
    const body = { game, player_name, score };
    if (sessionToken) body.sessionToken = String(sessionToken);
    return jsonFetch('/api/leaderboard', {
        method: 'POST',
        body: JSON.stringify(body)
    });
}

export function getRank(game, score) {
    return jsonFetch(
        `/api/leaderboard/${encodeURIComponent(game)}/rank?score=${encodeURIComponent(
            score
        )}`
    );
}

/** Satranç: Elo sıralaması (tercihen user_id). */
export function getChessLeaderboardRankByUser(userId) {
    return jsonFetch(
        `/api/leaderboard/satranc/rank-by-player?user_id=${encodeURIComponent(userId)}`
    );
}

/** Satranç: oyuncu adı ile (tabloda kayıtlı isim). */
export function getChessLeaderboardRank(player_name) {
    return jsonFetch(
        `/api/leaderboard/satranc/rank-by-player?player_name=${encodeURIComponent(player_name)}`
    );
}

export function getDamaLeaderboardRankByUser(userId) {
    return jsonFetch(
        `/api/leaderboard/dama/rank-by-player?user_id=${encodeURIComponent(userId)}`
    );
}

export function getDamaLeaderboardRank(player_name) {
    return jsonFetch(
        `/api/leaderboard/dama/rank-by-player?player_name=${encodeURIComponent(player_name)}`
    );
}

export function getMyLeaderboardBadges(sessionToken, nickname) {
    const q = new URLSearchParams();
    q.set('sessionToken', String(sessionToken || ''));
    if (nickname) q.set('nickname', String(nickname).slice(0, 64));
    return jsonFetch(`/api/me/leaderboard-badges?${q}`);
}

export function saveCrownChoice(sessionToken, game, place, nickname) {
    return jsonFetch('/api/me/crown-choice', {
        method: 'POST',
        body: JSON.stringify({
            sessionToken: String(sessionToken || ''),
            game,
            place,
            nickname: nickname != null ? String(nickname).slice(0, 64) : undefined
        })
    });
}

export function clearCrownChoice(sessionToken) {
    return jsonFetch('/api/me/crown-choice', {
        method: 'POST',
        body: JSON.stringify({ sessionToken: String(sessionToken || ''), clear: true })
    });
}

