'use strict';

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
        throw new Error(data.message || `API error ${res.status}`);
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

export function saveScore(game, player_name, score) {
    return jsonFetch('/api/leaderboard', {
        method: 'POST',
        body: JSON.stringify({ game, player_name, score })
    });
}

export function getRank(game, score) {
    return jsonFetch(
        `/api/leaderboard/${encodeURIComponent(game)}/rank?score=${encodeURIComponent(
            score
        )}`
    );
}

