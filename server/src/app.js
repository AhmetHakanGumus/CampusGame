import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import authRoutes from './auth.routes.js';
import { guest as authGuest } from './controllers/auth.controller.js';
import leaderboardRoutes from './leaderboard.routes.js';
import meRoutes from './me.routes.js';
import { initDatabase } from './db.js';
import { findUserByUsername, clearUserCrownChoice, updateUserCrownChoice } from './models/user.model.js';
import { createChessService } from './chess.service.js';
import { createDamaService } from './dama.service.js';
import {
    getOnlineUsernames,
    getSessionByToken,
    markSessionOnline,
    markSocketOffline
} from './session.store.js';
import { sanitizeUsernameForAuth } from './inputValidation.js';
import { getEligibleCrownBadges, resolveEquippedCrown } from './leaderboardBadges.util.js';
import { registerCampusCrownRoomRefresh } from './campusCrownSync.registry.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);
const httpServer = createServer(app);

const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(
    cors(
        corsOrigin === '*'
            ? { origin: true, credentials: true }
            : { origin: corsOrigin.split(',').map((v) => v.trim()), credentials: true }
    )
);

app.use(express.json({ limit: '48kb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
    res.json({ message: 'API ayakta' });
});

// Misafir girişi: router’dan önce tanımlı (eski süreç / cache karışıklığında da kolay görünür).
app.post('/api/auth/guest', authGuest);

app.use('/api/auth', authRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/me', meRoutes);

const io = new SocketIOServer(httpServer, {
    cors: {
        origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map((v) => v.trim()),
        methods: ['GET', 'POST']
    }
});

const ROOM_ID = 'campus-main';
const MAX_PLAYERS = 50;
const players = new Map();
const playersByUserId = new Map();

function resolvePlayerBySocketId(socketId) {
    return players.get(socketId) || null;
}

function resolveSocketIdByUserId(userId) {
    const p = playersByUserId.get(Number(userId));
    return p?.id || null;
}

const chessService = createChessService({
    io,
    resolvePlayerBySocketId,
    resolveSocketIdByUserId
});

const damaService = createDamaService({
    io,
    resolvePlayerBySocketId,
    resolveSocketIdByUserId
});

function pruneDisconnectedPlayers(ioServer) {
    for (const id of Array.from(players.keys())) {
        if (!ioServer.sockets.sockets.has(id)) {
            const stale = players.get(id);
            if (stale?.userId) playersByUserId.delete(Number(stale.userId));
            players.delete(id);
        }
    }
}

function sanitizeNick(value) {
    const nick = String(value || 'Oyuncu').trim();
    return nick.slice(0, 24) || 'Oyuncu';
}

function normalizeUsername(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

function getSpawnPoint(index) {
    return index === 0 ? { x: -2, y: 0, z: 108 } : { x: 2, y: 0, z: 110 };
}

function broadcastOnlineUsers() {
    io.to(ROOM_ID).emit('online-users', {
        users: getOnlineUsernames()
    });
}

const CROWN_REFRESH_MS = Number(process.env.CAMPUS_CROWN_REFRESH_MS || 20000);

/**
 * Liderlik değişince (başkası geçti, hak düştü vb.) bellekteki taçı DB + güncel haklarla hizalar;
 * geçersiz crown_choice satırını siler ve gerekirse player-crown-updated yayınlar.
 */
async function refreshAllCampusPlayerCrowns() {
    for (const cur of players.values()) {
        if (!cur?.userId || !cur.username) continue;
        let user;
        try {
            user = await findUserByUsername(cur.username);
        } catch {
            continue;
        }
        if (!user) continue;
        let eligible = [];
        try {
            eligible = await getEligibleCrownBadges(Number(user.id), cur.nickname);
        } catch {
            continue;
        }
        let cg = user.crown_choice_game != null ? String(user.crown_choice_game).trim() : '';
        let cp = user.crown_choice_place;
        const cpNum = Number(cp);
        const hadStoredChoice = Boolean(cg) && Number.isFinite(cpNum) && cpNum >= 1 && cpNum <= 3;
        const choiceStillValid =
            hadStoredChoice && eligible.some((b) => b.game === cg && b.place === cpNum);
        if (hadStoredChoice && !choiceStillValid) {
            try {
                await clearUserCrownChoice(user.id);
            } catch {
                /* ignore */
            }
            cg = '';
            cp = null;
        }
        const resolved = user.crown_choice_hidden
            ? null
            : resolveEquippedCrown(
                  eligible,
                  choiceStillValid ? cg : null,
                  choiceStillValid ? cpNum : null
              );
        const nextG = resolved?.game ?? null;
        const nextP = resolved?.place != null ? Number(resolved.place) : null;
        const prevG = cur.crownGame != null ? String(cur.crownGame) : null;
        const prevP = cur.crownPlace != null ? Number(cur.crownPlace) : null;
        const pg = prevG || null;
        const ng = nextG || null;
        if (pg !== ng || prevP !== nextP) {
            cur.crownGame = ng;
            cur.crownPlace = nextP;
            io.to(ROOM_ID).emit('player-crown-updated', {
                id: cur.id,
                crownGame: ng,
                crownPlace: nextP
            });
        }
    }
}

registerCampusCrownRoomRefresh(() => {
    refreshAllCampusPlayerCrowns().catch(() => {});
});

setInterval(() => {
    refreshAllCampusPlayerCrowns().catch(() => {});
}, CROWN_REFRESH_MS);

io.on('connection', (socket) => {
    socket.on('join-campus', async ({ nickname, username, sessionToken } = {}) => {
        try {
            // Dev/HMR veya ani sekme kapanışlarında stale kayıt kalabiliyor.
            pruneDisconnectedPlayers(io);

            // Aynı socket ikinci kez join gönderdiyse mevcut kaydı kullan.
            if (players.has(socket.id)) {
                socket.emit('self-init', { id: socket.id, players: Array.from(players.values()) });
                return;
            }

            const session = getSessionByToken(sessionToken);
            const cleanUsername = sanitizeUsernameForAuth(username);
            if (
                !cleanUsername ||
                !session ||
                normalizeUsername(session.username) !== normalizeUsername(cleanUsername)
            ) {
                socket.emit('auth-error', { message: 'Geçersiz oturum. Lütfen tekrar giriş yap.' });
                return;
            }

            const existsInRoom = Array.from(players.values()).some(
                (p) => normalizeUsername(p.username) === normalizeUsername(cleanUsername)
            );
            if (existsInRoom) {
                socket.emit('auth-error', { message: 'Bu hesap zaten aktif. İkinci giriş engellendi.' });
                return;
            }

            const marked = markSessionOnline({
                token: sessionToken,
                username: cleanUsername,
                socketId: socket.id
            });
            if (!marked) {
                socket.emit('auth-error', { message: 'Bu hesap zaten çevrimiçi.' });
                return;
            }

            if (players.size >= MAX_PLAYERS) {
                markSocketOffline(socket.id);
                socket.emit('room-full');
                return;
            }
            const user = await findUserByUsername(cleanUsername);
            if (!user) {
                markSocketOffline(socket.id);
                socket.emit('auth-error', { message: 'Kullanıcı verisi bulunamadı.' });
                return;
            }
            const spawn = getSpawnPoint(players.size);
            const nick = sanitizeNick(nickname);
            let crownGame = null;
            let crownPlace = null;
            try {
                const eligible = await getEligibleCrownBadges(Number(user.id), nick);
                const crown = user.crown_choice_hidden
                    ? null
                    : resolveEquippedCrown(eligible, user.crown_choice_game, user.crown_choice_place);
                if (crown) {
                    crownGame = crown.game;
                    crownPlace = crown.place;
                }
            } catch (_e) {
                /* ignore crown resolution */
            }
            const player = {
                id: socket.id,
                userId: Number(user.id),
                nickname: nick,
                username: cleanUsername,
                x: spawn.x,
                y: spawn.y,
                z: spawn.z,
                yaw: 0,
                jumping: false,
                running: false,
                bc: 0x1a4f8a,
                face: 'neutral',
                crownGame,
                crownPlace
            };
            players.set(socket.id, player);
            playersByUserId.set(Number(user.id), player);
            socket.join(ROOM_ID);
            socket.emit('self-init', { id: socket.id, players: Array.from(players.values()) });
            socket.to(ROOM_ID).emit('player-joined', player);
            broadcastOnlineUsers();
            await chessService.onPlayerConnected(socket);
            await damaService.onPlayerConnected(socket);
            await chessService.broadcastQueueStates();
            await damaService.broadcastQueueStates();
            await chessService.tryResumeForUser(socket, Number(user.id), playersByUserId);
            await damaService.tryResumeForUser(socket, Number(user.id), playersByUserId);
        } catch (err) {
            console.error('join-campus error:', err);
            socket.emit('auth-error', { message: 'Bağlantı kurulurken hata oluştu.' });
        }
    });

    socket.on('player-move', (next = {}) => {
        const cur = players.get(socket.id);
        if (!cur) return;
        cur.x = Number(next.x) || 0;
        cur.y = Number(next.y) || 0;
        cur.z = Number(next.z) || 0;
        cur.yaw = Number(next.yaw) || 0;
        cur.jumping = Boolean(next.jumping);
        cur.running = Boolean(next.running);
        // Görünüm (isteğe bağlı)
        if (Number.isFinite(next.bc)) cur.bc = Number(next.bc);
        if (typeof next.face === 'string' && next.face) cur.face = String(next.face);
        // Taç burada gönderilmez: her karede bellekteki eski tacı tekrar basmak sıra değişince
        // "hayalet" altın taça yol açıyordu. Tacı yalnızca join + player-crown-updated taşır.
        socket.to(ROOM_ID).emit('player-moved', {
            id: cur.id,
            nickname: cur.nickname,
            x: cur.x,
            y: cur.y,
            z: cur.z,
            yaw: cur.yaw,
            jumping: cur.jumping,
            running: cur.running,
            bc: cur.bc,
            face: cur.face
        });
    });

    socket.on('crown-choice-update', async ({ sessionToken, game, place, nickname, clear } = {}) => {
        const cur = players.get(socket.id);
        if (!cur?.userId) return;
        const session = getSessionByToken(String(sessionToken || ''));
        if (!session || normalizeUsername(session.username) !== normalizeUsername(cur.username)) {
            return;
        }
        try {
            const user = await findUserByUsername(cur.username);
            if (!user) return;
            if (clear === true || game === '' || game == null) {
                await clearUserCrownChoice(user.id);
                cur.crownGame = null;
                cur.crownPlace = null;
                io.to(ROOM_ID).emit('player-crown-updated', {
                    id: socket.id,
                    crownGame: null,
                    crownPlace: null
                });
                return;
            }
            const assertLeaderboardGameId = (await import('./inputValidation.js')).assertLeaderboardGameId;
            const g = assertLeaderboardGameId(game);
            const p = Number(place);
            if (!Number.isFinite(p) || p < 1 || p > 3) return;
            const nick = String(nickname || cur.nickname || user.username).trim().slice(0, 64);
            const eligible = await getEligibleCrownBadges(user.id, nick);
            const ok = eligible.some((b) => b.game === g && b.place === p);
            if (!ok) return;
            await updateUserCrownChoice(user.id, g, p);
            cur.crownGame = g;
            cur.crownPlace = p;
            io.to(ROOM_ID).emit('player-crown-updated', {
                id: socket.id,
                crownGame: g,
                crownPlace: p
            });
        } catch (_e) {
            /* ignore */
        }
    });

    socket.on('ball-state', (payload = {}) => {
        if (!players.has(socket.id)) return;
        socket.to(ROOM_ID).emit('ball-state', { ...payload, by: socket.id });
    });

    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        const hadPlayer = !!player;
        // Satranç: onPlayerDisconnected içinde userId gerekli; players silinmeden snapshot gönder.
        chessService.onPlayerDisconnected(socket.id, player || null).catch(() => {});
        damaService.onPlayerDisconnected(socket.id, player || null).catch(() => {});
        if (hadPlayer) {
            players.delete(socket.id);
            if (player?.userId) playersByUserId.delete(Number(player.userId));
            socket.to(ROOM_ID).emit('player-left', { id: socket.id });
        }
        const offlineUsername = markSocketOffline(socket.id);
        if (hadPlayer || offlineUsername) {
            broadcastOnlineUsers();
        }
        chessService.broadcastQueueStates().catch(() => {});
        damaService.broadcastQueueStates().catch(() => {});
    });

    chessService.bindSocket(socket, playersByUserId);
    damaService.bindSocket(socket, playersByUserId);
});

initDatabase()
    .then(() => {
        httpServer.listen(PORT, () => {
            console.log(`Backend running on http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Database init hatası:', error);
        process.exit(1);
    });

