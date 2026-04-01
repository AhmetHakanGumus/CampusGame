import crypto from 'crypto';

const sessionsByToken = new Map();
const onlineTokenByUsername = new Map();
const tokenBySocketId = new Map();

function normalizeUsername(username) {
    return String(username || '')
        .trim()
        .toLowerCase();
}

export function isUsernameOnline(username) {
    return onlineTokenByUsername.has(normalizeUsername(username));
}

export function createLoginSession(username) {
    const token = crypto.randomBytes(32).toString('hex');
    sessionsByToken.set(token, {
        username: String(username),
        online: false
    });
    return token;
}

export function getSessionByToken(token) {
    return sessionsByToken.get(String(token)) || null;
}

export function markSessionOnline({ token, username, socketId }) {
    const t = String(token);
    const u = normalizeUsername(username);
    const session = sessionsByToken.get(t);
    if (!session || normalizeUsername(session.username) !== u) return false;
    if (onlineTokenByUsername.has(u)) return false;
    session.online = true;
    session.socketId = socketId;
    onlineTokenByUsername.set(u, t);
    tokenBySocketId.set(socketId, t);
    return true;
}

export function markSocketOffline(socketId) {
    const token = tokenBySocketId.get(socketId);
    if (!token) return null;
    tokenBySocketId.delete(socketId);
    const session = sessionsByToken.get(token);
    if (!session) return null;
    onlineTokenByUsername.delete(normalizeUsername(session.username));
    sessionsByToken.delete(token);
    return session.username;
}

export function getOnlineUsernames() {
    return Array.from(onlineTokenByUsername.keys());
}
