/**
 * Example service skeleton for an online game ("ttt").
 *
 * This file is NOT wired into `server/src/app.js`.
 * It exists so new developers can copy the pattern used by chess/dama services.
 */

import {
    DEFAULT_GAME_MESA_ID,
    upsertQueueEntry,
    removeQueueEntry,
    getFirstWaitingQueueEntry,
    getQueueCount,
    isUserQueued,
    createMatch,
    getActiveMatchForUser,
    getFirstActiveMatch
} from './ttt.model.js';

function roomName(matchId) {
    return `ttt-match-${matchId}`;
}

function randomColors(userA, userB) {
    if (Math.random() < 0.5) return { whiteUserId: userA, blackUserId: userB };
    return { whiteUserId: userB, blackUserId: userA };
}

function buildQueueStatePayload({ mesaId, selfQueued, waitingPlayer, totalWaiting, activeMatch }) {
    return {
        mesaId,
        selfQueued: !!selfQueued,
        waitingPlayer: waitingPlayer
            ? {
                  userId: Number(waitingPlayer.user_id),
                  username: waitingPlayer.username,
                  joinedAt: waitingPlayer.joined_at
              }
            : null,
        totalWaiting: Number(totalWaiting || 0),
        activeMatch
    };
}

export function createTttService({ io, resolvePlayerBySocketId, resolveSocketIdByUserId }) {
    async function emitQueueState(userId, socket) {
        const mesaId = socket?.data?.mesaId != null ? Number(socket.data.mesaId) : DEFAULT_GAME_MESA_ID;
        const waiting = await getFirstWaitingQueueEntry(userId, mesaId);
        const totalWaiting = await getQueueCount(mesaId);
        const selfQueued = await isUserQueued(userId, mesaId);
        const live = await getFirstActiveMatch(mesaId);
        const activeMatch = live
            ? {
                  matchId: Number(live.id),
                  whiteUserId: Number(live.white_user_id),
                  blackUserId: Number(live.black_user_id)
              }
            : null;
        socket.emit(
            'ttt:queue:state',
            buildQueueStatePayload({ mesaId, selfQueued, waitingPlayer: waiting, totalWaiting, activeMatch })
        );
    }

    async function broadcastQueueStates() {
        const all = io.sockets.sockets;
        for (const socket of all.values()) {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) continue;
            // Example: publish all mesas. In real games you can tune this list.
            for (const mesaId of [0, 1, 2]) {
                socket.data.mesaId = mesaId;
                await emitQueueState(player.userId, socket);
            }
        }
    }

    async function emitMatchStart(match, playersByUserId) {
        const whiteSocketId = resolveSocketIdByUserId(Number(match.white_user_id));
        const blackSocketId = resolveSocketIdByUserId(Number(match.black_user_id));
        const room = roomName(match.id);
        const sockets = [];
        if (whiteSocketId) sockets.push(io.sockets.sockets.get(whiteSocketId));
        if (blackSocketId) sockets.push(io.sockets.sockets.get(blackSocketId));

        const white = playersByUserId?.get?.(Number(match.white_user_id)) || { userId: match.white_user_id };
        const black = playersByUserId?.get?.(Number(match.black_user_id)) || { userId: match.black_user_id };

        const basePayload = {
            matchId: Number(match.id),
            mesaId: Number(match.mesa_id),
            white: { userId: Number(white.userId), username: white.username || `user-${white.userId}` },
            black: { userId: Number(black.userId), username: black.username || `user-${black.userId}` },
            // Example game state:
            state: { kind: 'ttt', board: Array(9).fill(null), turn: 'white' }
        };

        sockets.forEach((s) => {
            if (!s) return;
            s.join(room);
            const player = resolvePlayerBySocketId(s.id);
            const yourColor =
                Number(player?.userId) === Number(match.white_user_id) ? 'white' : 'black';
            s.emit('ttt:match:started', { ...basePayload, yourColor });
        });
    }

    function bindSocket(socket, playersByUserId) {
        socket.on('ttt:queue:join', async ({ mesaId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            const mid = mesaId != null ? Number(mesaId) : DEFAULT_GAME_MESA_ID;

            const active = await getActiveMatchForUser(player.userId);
            if (active) {
                socket.emit('ttt:error', { message: 'Aktif maçın varken kuyruğa giremezsin.' });
                return;
            }

            const alreadyQueued = await isUserQueued(player.userId, mid);
            if (alreadyQueued) {
                await broadcastQueueStates();
                return;
            }

            const waiting = await getFirstWaitingQueueEntry(player.userId, mid);
            if (waiting) {
                const colors = randomColors(player.userId, Number(waiting.user_id));
                const match = await createMatch({
                    whiteUserId: colors.whiteUserId,
                    blackUserId: colors.blackUserId,
                    stateJson: JSON.stringify({ kind: 'ttt', board: Array(9).fill(null), turn: 'white' }),
                    mesaId: mid
                });
                await emitMatchStart(match, playersByUserId);
                await broadcastQueueStates();
                return;
            }

            // Example capacity rule:
            const currentCount = await getQueueCount(mid);
            if (mid !== 0 && currentCount >= 2) {
                socket.emit('ttt:error', { message: 'Kuyruk dolu (maks 2).' });
                return;
            }

            await upsertQueueEntry({
                userId: player.userId,
                username: player.username,
                socketId: socket.id,
                mesaId: mid
            });
            await broadcastQueueStates();
            socket.data.mesaId = mid;
            await emitQueueState(player.userId, socket);
        });

        socket.on('ttt:queue:leave', async ({ mesaId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            const mid = mesaId != null ? Number(mesaId) : DEFAULT_GAME_MESA_ID;
            await removeQueueEntry(player.userId, mid);
            await broadcastQueueStates();
            socket.data.mesaId = mid;
            await emitQueueState(player.userId, socket);
        });

        socket.on('ttt:queue:list', async ({ mesaId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            socket.data.mesaId = mesaId != null ? Number(mesaId) : DEFAULT_GAME_MESA_ID;
            await emitQueueState(player.userId, socket);
        });
    }

    return { bindSocket };
}

