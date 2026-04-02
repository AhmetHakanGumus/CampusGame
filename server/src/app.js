import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import authRoutes from './auth.routes.js';
import { guest as authGuest } from './controllers/auth.controller.js';
import leaderboardRoutes from './leaderboard.routes.js';
import { initDatabase } from './db.js';
import { findUserByUsername } from './models/user.model.js';
import { createChessService } from './chess.service.js';
import {
    getOnlineUsernames,
    getSessionByToken,
    markSessionOnline,
    markSocketOffline
} from './session.store.js';

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

app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
    res.json({ message: 'API ayakta' });
});

// Misafir girişi: router’dan önce tanımlı (eski süreç / cache karışıklığında da kolay görünür).
app.post('/api/auth/guest', authGuest);

app.use('/api/auth', authRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

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
            const cleanUsername = String(username || '').trim();
            if (
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
            const player = {
                id: socket.id,
                userId: Number(user.id),
                nickname: sanitizeNick(nickname),
                username: cleanUsername,
                x: spawn.x,
                y: spawn.y,
                z: spawn.z,
                yaw: 0,
                jumping: false,
                running: false,
                bc: 0x1a4f8a,
                face: 'neutral'
            };
            players.set(socket.id, player);
            playersByUserId.set(Number(user.id), player);
            socket.join(ROOM_ID);
            socket.emit('self-init', { id: socket.id, players: Array.from(players.values()) });
            socket.to(ROOM_ID).emit('player-joined', player);
            broadcastOnlineUsers();
            await chessService.onPlayerConnected(socket);
            await chessService.broadcastQueueStates();
            await chessService.tryResumeForUser(socket, Number(user.id), playersByUserId);
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
        socket.to(ROOM_ID).emit('player-moved', { ...cur });
    });

    socket.on('ball-state', (payload = {}) => {
        if (!players.has(socket.id)) return;
        socket.to(ROOM_ID).emit('ball-state', { ...payload, by: socket.id });
    });

    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        const hadPlayer = !!player;
        if (hadPlayer) {
            players.delete(socket.id);
            if (player?.userId) playersByUserId.delete(Number(player.userId));
            socket.to(ROOM_ID).emit('player-left', { id: socket.id });
        }
        const offlineUsername = markSocketOffline(socket.id);
        chessService.onPlayerDisconnected(socket.id).catch(() => {});
        if (hadPlayer || offlineUsername) {
            broadcastOnlineUsers();
        }
        chessService.broadcastQueueStates().catch(() => {});
    });

    chessService.bindSocket(socket, playersByUserId);
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

