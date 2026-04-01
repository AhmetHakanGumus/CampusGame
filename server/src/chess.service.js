import { Chess } from 'chess.js';
import {
    appendMoveAndUpdateState,
    clearQueueSocketBySocketId,
    createMatch,
    finishMatch,
    getActiveMatchForUser,
    getFirstWaitingQueueEntry,
    getMatchById,
    getMoveCount,
    getQueueCount,
    isUserQueued,
    removeQueueEntryBySocketId,
    removeQueueEntry,
    touchQueueEntry,
    upsertQueueEntry
} from './models/chess.model.js';
import { pool } from './db.js';

function roomName(matchId) {
    return `chess-match-${matchId}`;
}

function randomColors(userA, userB) {
    if (Math.random() < 0.5) {
        return { whiteUserId: userA, blackUserId: userB };
    }
    return { whiteUserId: userB, blackUserId: userA };
}

export function createChessService({ io, resolvePlayerBySocketId, resolveSocketIdByUserId }) {
    const engineByMatchId = new Map();

    const ensureEngine = async (match) => {
        const id = Number(match.id);
        if (engineByMatchId.has(id)) return engineByMatchId.get(id);
        const engine = new Chess(match.fen);
        engineByMatchId.set(id, engine);
        return engine;
    };

    const buildStatePayload = ({ match, engine, moveMeta = null, playersByUserId }) => {
        const white = playersByUserId.get(Number(match.white_user_id));
        const black = playersByUserId.get(Number(match.black_user_id));
        const turnColor = engine.turn() === 'w' ? 'white' : 'black';
        const payload = {
            matchId: Number(match.id),
            fen: engine.fen(),
            turn: engine.turn(),
            turnColor,
            white: {
                userId: Number(match.white_user_id),
                username: white?.username || `user-${match.white_user_id}`
            },
            black: {
                userId: Number(match.black_user_id),
                username: black?.username || `user-${match.black_user_id}`
            },
            move: moveMeta,
            inCheck: engine.inCheck(),
            checkmate: engine.isCheckmate(),
            stalemate: engine.isStalemate(),
            gameOver: engine.isGameOver()
        };
        if (payload.inCheck) {
            payload.checkBy = moveMeta?.byUsername || null;
            payload.checkedPlayer =
                turnColor === 'white' ? payload.white.username : payload.black.username;
        }
        if (payload.checkmate) {
            const loserColor = turnColor;
            const winnerColor = loserColor === 'white' ? 'black' : 'white';
            payload.winnerColor = winnerColor;
            payload.winnerUserId =
                winnerColor === 'white' ? payload.white.userId : payload.black.userId;
            payload.winnerUsername =
                winnerColor === 'white' ? payload.white.username : payload.black.username;
            payload.resultText = `${payload.winnerUsername} Kazandı - Şah Mat!`;
        }
        return payload;
    };

    async function emitQueueState(userId, socket) {
        const waiting = await getFirstWaitingQueueEntry(userId);
        const totalWaiting = await getQueueCount();
        const selfQueued = await isUserQueued(userId);
        const payload = {
            selfQueued,
            waitingPlayer: waiting
                ? {
                      userId: Number(waiting.user_id),
                      username: waiting.username,
                      joinedAt: waiting.joined_at
                  }
                : null,
            totalWaiting
        };
        socket.emit('chess:queue:state', payload);
    }

    async function broadcastQueueStates() {
        const all = io.sockets.sockets;
        for (const socket of all.values()) {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) continue;
            await emitQueueState(player.userId, socket);
        }
    }

    async function emitMatchStart(match, playersByUserId) {
        const whiteSocketId = resolveSocketIdByUserId(Number(match.white_user_id));
        const blackSocketId = resolveSocketIdByUserId(Number(match.black_user_id));
        const room = roomName(match.id);
        const sockets = [];
        if (whiteSocketId) sockets.push(io.sockets.sockets.get(whiteSocketId));
        if (blackSocketId) sockets.push(io.sockets.sockets.get(blackSocketId));
        const engine = await ensureEngine(match);
        const payload = buildStatePayload({ match, engine, playersByUserId });
        sockets.forEach((s) => {
            if (!s) return;
            s.join(room);
            const player = resolvePlayerBySocketId(s.id);
            const color =
                Number(player?.userId) === Number(match.white_user_id) ? 'white' : 'black';
            s.emit('chess:match:started', { ...payload, yourColor: color });
        });
    }

    async function tryResumeForUser(socket, userId, playersByUserId) {
        const active = await getActiveMatchForUser(userId);
        if (!active) return;
        const engine = await ensureEngine(active);
        socket.join(roomName(active.id));
        const base = buildStatePayload({ match: active, engine, playersByUserId });
        const color = Number(userId) === Number(active.white_user_id) ? 'white' : 'black';
        socket.emit('chess:match:resumed', { ...base, yourColor: color });
    }

    async function onPlayerConnected(socket) {
        const player = resolvePlayerBySocketId(socket.id);
        if (!player?.userId) return;
        await touchQueueEntry(player.userId, socket.id);
    }

    async function onPlayerDisconnected(socketId) {
        // Oyuncu sekmeyi kapatırsa / bağlantı koparsa kuyruktan da çıksın.
        // (Aksi halde status=waiting kalıp "hayalet" sıra oluşturabiliyor.)
        await removeQueueEntryBySocketId(socketId);
        await clearQueueSocketBySocketId(socketId);

        // Aktif maç varsa "exit" olarak bitir ve rakibe yayınla.
        const player = resolvePlayerBySocketId(socketId);
        if (!player?.userId) return;
        const active = await getActiveMatchForUser(Number(player.userId));
        if (!active || active.status !== 'active') return;

        const isWhite = Number(active.white_user_id) === Number(player.userId);
        const isBlack = Number(active.black_user_id) === Number(player.userId);
        if (!isWhite && !isBlack) return;

        const winnerUserId = isWhite ? Number(active.black_user_id) : Number(active.white_user_id);
        const winnerSocketId = resolveSocketIdByUserId(Number(winnerUserId));
        const winnerPlayer = winnerSocketId ? resolvePlayerBySocketId(winnerSocketId) : null;

        const finished = await finishMatch({
            matchId: Number(active.id),
            winnerUserId,
            exitReason: 'exit'
        });

        if (winnerPlayer?.nickname || winnerPlayer?.username) {
            await pool.query(
                `INSERT INTO campus_scores (game, player_name, score) VALUES ($1, $2, $3)`,
                ['satranc', String(winnerPlayer.nickname || winnerPlayer.username).slice(0, 64), 50]
            );
        }

        engineByMatchId.delete(Number(active.id));
        io.to(roomName(active.id)).emit('chess:match:ended', {
            matchId: Number(active.id),
            winnerUserId: finished?.winner_user_id || winnerUserId,
            winnerUsername: winnerPlayer?.username || `user-${winnerUserId}`,
            reason: 'exit',
            message: `${player?.username || 'Oyuncu'} bağlantıyı kapattı. ${winnerPlayer?.username || 'Rakip'} kazandı.`
        });

        await broadcastQueueStates();
    }

    function bindSocket(socket, playersByUserId) {
        socket.on('chess:queue:join', async () => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            const active = await getActiveMatchForUser(player.userId);
            if (active) {
                socket.emit('chess:error', { message: 'Aktif maçın varken kuyruğa giremezsin.' });
                return;
            }
            const alreadyQueued = await isUserQueued(player.userId);
            if (alreadyQueued) {
                await broadcastQueueStates();
                return;
            }
            const waiting = await getFirstWaitingQueueEntry(player.userId);
            if (waiting) {
                const otherActive = await getActiveMatchForUser(Number(waiting.user_id));
                if (otherActive) {
                    await removeQueueEntry(waiting.user_id);
                } else {
                    const colors = randomColors(player.userId, Number(waiting.user_id));
                    const initial = new Chess();
                    const match = await createMatch({
                        whiteUserId: colors.whiteUserId,
                        blackUserId: colors.blackUserId,
                        fen: initial.fen(),
                        turn: initial.turn()
                    });
                    engineByMatchId.set(Number(match.id), initial);
                    await emitMatchStart(match, playersByUserId);
                    await broadcastQueueStates();
                    return;
                }
            }
            const currentCount = await getQueueCount();
            if (currentCount >= 2) {
                socket.emit('chess:error', { message: 'Kuyruk dolu (maks 2). Biraz sonra tekrar dene.' });
                return;
            }
            await upsertQueueEntry({
                userId: player.userId,
                username: player.username,
                socketId: socket.id
            });
            await broadcastQueueStates();
        });

        socket.on('chess:queue:leave', async () => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            await removeQueueEntry(player.userId);
            await broadcastQueueStates();
        });

        socket.on('chess:queue:list', async () => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            await emitQueueState(player.userId, socket);
        });

        socket.on('chess:match:start', async () => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            const active = await getActiveMatchForUser(player.userId);
            if (active) {
                socket.emit('chess:error', { message: 'Zaten aktif maçın var.' });
                return;
            }
            const waiting = await getFirstWaitingQueueEntry(player.userId);
            if (!waiting) {
                socket.emit('chess:error', { message: 'Bekleyen oyuncu bulunamadı.' });
                await broadcastQueueStates();
                return;
            }
            const otherActive = await getActiveMatchForUser(Number(waiting.user_id));
            if (otherActive) {
                await removeQueueEntry(waiting.user_id);
                socket.emit('chess:error', { message: 'Bekleyen oyuncu artık müsait değil.' });
                await broadcastQueueStates();
                return;
            }
            await removeQueueEntry(player.userId);
            const colors = randomColors(player.userId, Number(waiting.user_id));
            const initial = new Chess();
            const match = await createMatch({
                whiteUserId: colors.whiteUserId,
                blackUserId: colors.blackUserId,
                fen: initial.fen(),
                turn: initial.turn()
            });
            engineByMatchId.set(Number(match.id), initial);
            await emitMatchStart(match, playersByUserId);
            await broadcastQueueStates();
        });

        socket.on('chess:state:get', async ({ matchId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            let match = null;
            if (matchId != null) {
                match = await getMatchById(Number(matchId));
            } else {
                match = await getActiveMatchForUser(player.userId);
            }
            if (!match) {
                socket.emit('chess:error', { message: 'Aktif maç bulunamadı.' });
                return;
            }
            const allowed =
                Number(match.white_user_id) === Number(player.userId) ||
                Number(match.black_user_id) === Number(player.userId);
            if (!allowed) {
                socket.emit('chess:error', { message: 'Bu maça erişim yok.' });
                return;
            }
            const engine = await ensureEngine(match);
            const payload = buildStatePayload({ match, engine, playersByUserId });
            const color = Number(player.userId) === Number(match.white_user_id) ? 'white' : 'black';
            socket.emit('chess:state:update', { ...payload, yourColor: color });
        });

        socket.on('chess:move:try', async ({ matchId, from, to, promotion } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            if (!matchId || !from || !to) return;
            const match = await getMatchById(Number(matchId));
            if (!match || match.status !== 'active') {
                socket.emit('chess:error', { message: 'Maç aktif değil.' });
                return;
            }
            const isWhite = Number(match.white_user_id) === Number(player.userId);
            const isBlack = Number(match.black_user_id) === Number(player.userId);
            if (!isWhite && !isBlack) {
                socket.emit('chess:error', { message: 'Bu maçın oyuncusu değilsin.' });
                return;
            }
            const expectedTurn = isWhite ? 'w' : 'b';
            const engine = await ensureEngine(match);
            if (engine.turn() !== expectedTurn) {
                socket.emit('chess:error', { message: 'Sıra sende değil.' });
                return;
            }
            const move = engine.move({
                from: String(from).toLowerCase(),
                to: String(to).toLowerCase(),
                promotion: promotion || 'q'
            });
            if (!move) {
                socket.emit('chess:error', { message: 'Geçersiz hamle.' });
                return;
            }
            const ply = (await getMoveCount(Number(matchId))) + 1;
            await appendMoveAndUpdateState({
                matchId: Number(matchId),
                ply,
                from: move.from,
                to: move.to,
                promotion: move.promotion || null,
                san: move.san,
                fenAfter: engine.fen(),
                movedByUserId: player.userId,
                turnAfter: engine.turn()
            });
            const statePayload = buildStatePayload({
                match,
                engine,
                moveMeta: {
                    from: move.from,
                    to: move.to,
                    san: move.san,
                    byUserId: player.userId,
                    byUsername: player.username
                },
                playersByUserId
            });
            io.to(roomName(match.id)).emit('chess:state:update', statePayload);

            if (statePayload.checkmate || statePayload.stalemate) {
                const finished = await finishMatch({
                    matchId: Number(match.id),
                    winnerUserId: statePayload.checkmate ? statePayload.winnerUserId : null,
                    exitReason: statePayload.checkmate ? 'checkmate' : 'stalemate'
                });
                if (statePayload.checkmate && statePayload.winnerUserId != null) {
                    const winnerPlayer = playersByUserId.get(Number(statePayload.winnerUserId));
                    const winnerName = winnerPlayer?.nickname || winnerPlayer?.username || statePayload.winnerUsername;
                    await pool.query(
                        `INSERT INTO campus_scores (game, player_name, score) VALUES ($1, $2, $3)`,
                        ['satranc', String(winnerName || 'Oyuncu').slice(0, 64), 50]
                    );
                }
                engineByMatchId.delete(Number(match.id));
                io.to(roomName(match.id)).emit('chess:match:ended', {
                    matchId: Number(match.id),
                    winnerUserId: finished?.winner_user_id || null,
                    winnerUsername: statePayload.winnerUsername || null,
                    reason: finished?.exit_reason || (statePayload.checkmate ? 'checkmate' : 'stalemate'),
                    message: statePayload.checkmate
                        ? `${statePayload.winnerUsername} Kazandı - Şah Mat!`
                        : 'Oyun berabere bitti.'
                });
                await broadcastQueueStates();
            }
        });

        socket.on('chess:exit:confirm', async ({ matchId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId || !matchId) return;
            const match = await getMatchById(Number(matchId));
            if (!match || match.status !== 'active') return;
            const isWhite = Number(match.white_user_id) === Number(player.userId);
            const isBlack = Number(match.black_user_id) === Number(player.userId);
            if (!isWhite && !isBlack) return;
            const winnerUserId = isWhite
                ? Number(match.black_user_id)
                : Number(match.white_user_id);
            const winnerPlayer = playersByUserId.get(winnerUserId);
            const loserPlayer = playersByUserId.get(Number(player.userId));
            const finished = await finishMatch({
                matchId: Number(match.id),
                winnerUserId,
                exitReason: 'exit'
            });
            if (winnerPlayer?.nickname || winnerPlayer?.username) {
                await pool.query(
                    `INSERT INTO campus_scores (game, player_name, score) VALUES ($1, $2, $3)`,
                    ['satranc', String(winnerPlayer.nickname || winnerPlayer.username).slice(0, 64), 50]
                );
            }
            engineByMatchId.delete(Number(match.id));
            io.to(roomName(match.id)).emit('chess:match:ended', {
                matchId: Number(match.id),
                winnerUserId: finished?.winner_user_id || winnerUserId,
                winnerUsername: winnerPlayer?.username || `user-${winnerUserId}`,
                reason: 'exit',
                message: `${loserPlayer?.username || 'Oyuncu'} oyundan ayrıldı. ${
                    winnerPlayer?.username || 'Rakip'
                } kazandı.`
            });
            await broadcastQueueStates();
        });

        socket.on('chess:exit:request', async ({ matchId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId || !matchId) return;
            const match = await getMatchById(Number(matchId));
            if (!match || match.status !== 'active') return;
            const allowed =
                Number(match.white_user_id) === Number(player.userId) ||
                Number(match.black_user_id) === Number(player.userId);
            if (!allowed) return;
            socket.emit('chess:exit:request:ack', { matchId: Number(matchId) });
        });
    }

    return {
        bindSocket,
        onPlayerConnected,
        onPlayerDisconnected,
        tryResumeForUser,
        emitQueueStateFor(socket) {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return Promise.resolve();
            return emitQueueState(player.userId, socket);
        },
        broadcastQueueStates
    };
}
