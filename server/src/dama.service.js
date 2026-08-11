import {
    appendMoveAndUpdateState,
    clearDamaChainOnly,
    clearQueueSocketBySocketId,
    createMatch,
    DEFAULT_GAME_MESA_ID,
    finishMatch,
    getActiveMatchForUser,
    getFirstActiveMatch,
    getActiveMatches,
    getFirstWaitingQueueEntry,
    getMatchById,
    resetDamaMatchOpeningState,
    getQueueCount,
    isUserQueued,
    removeQueueEntryBySocketId,
    removeQueueEntry,
    touchQueueEntry,
    upsertQueueEntry
} from './models/dama.model.js';
import { recordDamaWinLossAndMeta } from './damaLeaderboard.util.js';
import {
    initialBoardStr,
    tryMove,
    boardValid,
    isLegacyDamaBoard,
    isDeprecatedDamaOpening,
    normalizeDamaBoard,
    normalizeDamaTurn,
    chainContinuationActive,
    isCaptureMandatory
} from '../../js/minigames/dama-engine.js';

function roomName(matchId) {
    return `dama-match-${matchId}`;
}

function randomColors(userA, userB) {
    if (Math.random() < 0.5) {
        return { whiteUserId: userA, blackUserId: userB };
    }
    return { whiteUserId: userB, blackUserId: userA };
}

function parseChain(match) {
    const r = match?.chain_from_r;
    const c = match?.chain_from_c;
    if (r == null || c == null) return { chainFr: null, chainFc: null };
    const fr = Math.trunc(Number(r));
    const fc = Math.trunc(Number(c));
    if (!Number.isFinite(fr) || !Number.isFinite(fc)) return { chainFr: null, chainFc: null };
    if (fr < 0 || fr > 7 || fc < 0 || fc > 7) return { chainFr: null, chainFc: null };
    return { chainFr: fr, chainFc: fc };
}

export function createDamaService({ io, resolvePlayerBySocketId, resolveSocketIdByUserId }) {
    async function ensureDamaMatchBoardMigrated(match) {
        if (!match?.id || !match.board) return match;
        if (!isLegacyDamaBoard(match.board) && !isDeprecatedDamaOpening(match.board)) return match;
        await resetDamaMatchOpeningState(Number(match.id), initialBoardStr(), 'w');
        return (await getMatchById(Number(match.id))) || match;
    }

    /**
     * Hayalet zincir: o kareden yasal hamle yok VE o kareden hamle yeme de yok → DB zincirini sil.
     * Hamle yeme hâlâ var ama liste boşsa (max-yeme filtresi) zinciri silme; silersen aynı turda başka taşla oynama açılır.
     */
    async function ensureDamaChainValid(match) {
        if (!match?.id) return match;
        if (match.chain_from_r == null && match.chain_from_c == null) return match;
        if (!match.board || !boardValid(match.board)) return match;
        const fr = Math.trunc(Number(match.chain_from_r));
        const fc = Math.trunc(Number(match.chain_from_c));
        if (!Number.isFinite(fr) || !Number.isFinite(fc) || fr < 0 || fr > 7 || fc < 0 || fc > 7) {
            await clearDamaChainOnly(Number(match.id));
            return (await getMatchById(Number(match.id))) || match;
        }
        const boardNorm = normalizeDamaBoard(match.board);
        const turn = normalizeDamaTurn(match.turn);
        if (chainContinuationActive(boardNorm, turn, fr, fc)) return match;
        if (isCaptureMandatory(boardNorm, turn, fr, fc)) return match;
        await clearDamaChainOnly(Number(match.id));
        return (await getMatchById(Number(match.id))) || match;
    }
    function emitDamaMatchEnded(match, payload) {
        const id = Number(match.id);
        io.to(roomName(id)).emit('dama:match:ended', payload);
        const seen = new Set();
        for (const uid of [match.white_user_id, match.black_user_id]) {
            const sid = resolveSocketIdByUserId(Number(uid));
            if (!sid || seen.has(sid)) continue;
            seen.add(sid);
            const sock = io.sockets.sockets.get(sid);
            if (sock) sock.emit('dama:match:ended', payload);
        }
    }

    const buildStatePayload = ({ match, moveMeta = null, playersByUserId }) => {
        const white = playersByUserId.get(Number(match.white_user_id));
        const black = playersByUserId.get(Number(match.black_user_id));
        const turn = String(match.turn || 'w');
        const turnColor = turn === 'w' ? 'white' : 'black';
        const { chainFr, chainFc } = parseChain(match);
        const payload = {
            matchId: Number(match.id),
            mesaId: match.mesa_id != null ? Number(match.mesa_id) : DEFAULT_GAME_MESA_ID,
            board: match.board,
            turn,
            turnColor,
            chain: chainFr != null ? { r: chainFr, c: chainFc } : null,
            white: {
                userId: Number(match.white_user_id),
                username: white?.username || `user-${match.white_user_id}`
            },
            black: {
                userId: Number(match.black_user_id),
                username: black?.username || `user-${match.black_user_id}`
            },
            move: moveMeta,
            gameOver: false
        };
        return payload;
    };

    /** Oda içindeki her sokete kendi yourColor değeriyle gönder (tek yayında yok; istemci tahta yönü için gerekli). */
    async function emitDamaStateUpdateToRoom(match, playersByUserId, moveMeta = null) {
        if (!match?.id) return;
        const statePayload = buildStatePayload({ match, moveMeta, playersByUserId });
        const room = roomName(Number(match.id));
        const wid = Number(match.white_user_id);
        const bid = Number(match.black_user_id);
        try {
            const socks = await io.in(room).fetchSockets();
            for (const rs of socks) {
                const pl = resolvePlayerBySocketId(rs.id);
                const uid = pl?.userId != null ? Number(pl.userId) : null;
                let yourColor;
                if (uid != null && uid === wid) yourColor = 'white';
                else if (uid != null && uid === bid) yourColor = 'black';
                rs.emit('dama:state:update', { ...statePayload, yourColor });
            }
        } catch (_e) {
            io.to(room).emit('dama:state:update', statePayload);
        }
    }

    async function emitQueueState(userId, socket) {
        const mesaId = socket?.data?.mesaId != null ? Number(socket.data.mesaId) : DEFAULT_GAME_MESA_ID;
        const waiting = await getFirstWaitingQueueEntry(userId, mesaId);
        const totalWaiting = await getQueueCount(mesaId);
        const selfQueued = await isUserQueued(userId, mesaId);
        const live = await getFirstActiveMatch(mesaId);
        // PC/mobil sanal masa (0): aynı anda birden fazla aktif maç olabilir.
        const liveList = mesaId === 0 ? await getActiveMatches(mesaId, 50) : null;
        let activeMatch = null;
        if (live) {
            activeMatch = {
                matchId: Number(live.id),
                whiteUserId: Number(live.white_user_id),
                blackUserId: Number(live.black_user_id)
            };
        }
        const activeMatches =
            Array.isArray(liveList) && liveList.length
                ? liveList.map((m) => ({
                      matchId: Number(m.id),
                      whiteUserId: Number(m.white_user_id),
                      blackUserId: Number(m.black_user_id)
                  }))
                : null;
        const payload = {
            mesaId,
            selfQueued,
            waitingPlayer: waiting
                ? {
                      userId: Number(waiting.user_id),
                      username: waiting.username,
                      joinedAt: waiting.joined_at
                  }
                : null,
            totalWaiting,
            activeMatch,
            activeMatches
        };
        socket.emit('dama:queue:state', payload);
    }

    async function broadcastQueueStates() {
        const all = io.sockets.sockets;
        for (const socket of all.values()) {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) continue;
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
        let full = await getMatchById(match.id);
        full = await ensureDamaMatchBoardMigrated(full);
        full = await ensureDamaChainValid(full);
        const payload = buildStatePayload({ match: full, playersByUserId });
        if (payload.mesaId === 1 || payload.mesaId === 2) {
            io.emit('dama:state:world', payload);
        }
        sockets.forEach((s) => {
            if (!s) return;
            s.join(room);
            const player = resolvePlayerBySocketId(s.id);
            /* Satranç (chess.service emitMatchStart) ile aynı: beyaz değilse siyah. */
            const color =
                Number(player?.userId) === Number(match.white_user_id) ? 'white' : 'black';
            s.emit('dama:match:started', { ...payload, yourColor: color });
        });
        await emitDamaStateUpdateToRoom(full, playersByUserId, null);
    }

    async function tryResumeForUser(socket, userId, playersByUserId) {
        let active = await getActiveMatchForUser(userId);
        if (!active) return;
        active = await ensureDamaMatchBoardMigrated(active);
        active = await ensureDamaChainValid(active);
        socket.join(roomName(active.id));
        const payload = buildStatePayload({ match: active, playersByUserId });
        const color = Number(userId) === Number(active.white_user_id) ? 'white' : 'black';
        socket.emit('dama:match:resumed', { ...payload, yourColor: color });
    }

    async function onPlayerConnected(socket) {
        const player = resolvePlayerBySocketId(socket.id);
        if (!player?.userId) return;
        await touchQueueEntry(player.userId, socket.id);
    }

    async function onPlayerDisconnected(socketId, disconnectedPlayer = null) {
        await removeQueueEntryBySocketId(socketId);
        await clearQueueSocketBySocketId(socketId);

        const player = disconnectedPlayer || resolvePlayerBySocketId(socketId);
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
            exitReason: 'disconnect'
        });

        const leaderboard = await recordDamaWinLossAndMeta(
            winnerPlayer?.nickname || winnerPlayer?.username || `Oyuncu${winnerUserId}`,
            player?.nickname || player?.username || `Oyuncu${player.userId}`,
            winnerUserId,
            Number(player.userId)
        );

        emitDamaMatchEnded(active, {
            matchId: Number(active.id),
            winnerUserId: finished?.winner_user_id || winnerUserId,
            winnerUsername: winnerPlayer?.username || `user-${winnerUserId}`,
            loserUserId: Number(player.userId),
            loserUsername: player?.username || `user-${player.userId}`,
            reason: 'disconnect',
            message: `${player?.username || 'Oyuncu'} bağlantıyı kapattı. ${winnerPlayer?.username || 'Rakip'} kazandı.`,
            leaderboard
        });

        await broadcastQueueStates();
    }

    function bindSocket(socket, playersByUserId) {
        socket.on('dama:queue:join', async ({ mesaId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            const mid = mesaId != null ? Number(mesaId) : DEFAULT_GAME_MESA_ID;
            const active = await getActiveMatchForUser(player.userId);
            if (active) {
                return;
            }
            const alreadyQueued = await isUserQueued(player.userId, mid);
            if (alreadyQueued) {
                await broadcastQueueStates();
                return;
            }
            // VR (1-2) ve PC/mobil (0) kuyrukları ayrı ama çapraz eşleşebilsin:
            // - VR sıraya girerse: önce kendi masası, sonra PC/mobil (0)
            // - PC/mobil sıraya girerse: önce PC/mobil (0), sonra VR masaları (1-2)
            const candidateMesaIds = mid === 0 ? [0, 1, 2] : [mid, 0];
            let waiting = null;
            let waitingMid = mid;
            for (const cmid of candidateMesaIds) {
                const w = await getFirstWaitingQueueEntry(player.userId, cmid);
                if (w) {
                    waiting = w;
                    waitingMid = cmid;
                    break;
                }
            }
            if (waiting) {
                const otherActive = await getActiveMatchForUser(Number(waiting.user_id));
                if (otherActive) {
                    await removeQueueEntry(waiting.user_id, waitingMid);
                } else {
                    // Karma eşleşmede maç VR masasının üzerinde oluşsun ki VR masada oynasın.
                    const matchMesaId = mid === 0 ? waitingMid : mid;
                    const colors = randomColors(player.userId, Number(waiting.user_id));
                    const board = initialBoardStr();
                    const match = await createMatch({
                        whiteUserId: colors.whiteUserId,
                        blackUserId: colors.blackUserId,
                        board,
                        turn: 'w',
                        mesaId: matchMesaId
                    });
                    await emitMatchStart(match, playersByUserId);
                    await broadcastQueueStates();
                    return;
                }
            }
            const currentCount = await getQueueCount(mid);
            // VR masaları (1-2) fiziksel kapasite: 2 kişi.
            // PC/mobil sanal masa (0) aynı anda çoklu maç üretebilir; kuyruk limiti koymuyoruz.
            if (mid !== 0 && currentCount >= 2) {
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

        socket.on('dama:queue:leave', async ({ mesaId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            const mid = mesaId != null ? Number(mesaId) : DEFAULT_GAME_MESA_ID;
            await removeQueueEntry(player.userId, mid);
            await broadcastQueueStates();
            socket.data.mesaId = mid;
            await emitQueueState(player.userId, socket);
        });

        socket.on('dama:queue:list', async ({ mesaId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            socket.data.mesaId = mesaId != null ? Number(mesaId) : DEFAULT_GAME_MESA_ID;
            await emitQueueState(player.userId, socket);
        });

        socket.on('dama:watch', async ({ matchId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId || matchId == null) return;
            let match = await getMatchById(Number(matchId));
            if (!match || match.status !== 'active') {
                return;
            }
            match = await ensureDamaMatchBoardMigrated(match);
            match = await ensureDamaChainValid(match);
            const uid = Number(player.userId);
            if (uid === Number(match.white_user_id) || uid === Number(match.black_user_id)) {
                return;
            }
            socket.join(roomName(match.id));
            const payload = buildStatePayload({ match, playersByUserId });
            socket.emit('dama:watch:ack', {
                ...payload,
                yourColor: 'spectator',
                role: 'spectator'
            });
        });

        socket.on('dama:watch:leave', ({ matchId } = {}) => {
            if (matchId == null) return;
            socket.leave(roomName(Number(matchId)));
        });

        socket.on('dama:match:start', async ({ mesaId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            const mid = mesaId != null ? Number(mesaId) : DEFAULT_GAME_MESA_ID;
            const active = await getActiveMatchForUser(player.userId);
            if (active) {
                return;
            }
            const waiting = await getFirstWaitingQueueEntry(player.userId, mid);
            if (!waiting) {
                await broadcastQueueStates();
                return;
            }
            const otherActive = await getActiveMatchForUser(Number(waiting.user_id));
            if (otherActive) {
                await removeQueueEntry(waiting.user_id, mid);
                await broadcastQueueStates();
                return;
            }
            await removeQueueEntry(player.userId, mid);
            const colors = randomColors(player.userId, Number(waiting.user_id));
            const board = initialBoardStr();
            const match = await createMatch({
                whiteUserId: colors.whiteUserId,
                blackUserId: colors.blackUserId,
                board,
                turn: 'w',
                mesaId: mid
            });
            await emitMatchStart(match, playersByUserId);
            await broadcastQueueStates();
        });

        socket.on('dama:state:get', async ({ matchId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            let match = null;
            if (matchId != null) {
                match = await getMatchById(Number(matchId));
            } else {
                match = await getActiveMatchForUser(player.userId);
            }
            match = await ensureDamaMatchBoardMigrated(match);
            if (!match) {
                return;
            }
            if (match.status !== 'active' || !boardValid(match.board)) {
                return;
            }
            match = await ensureDamaChainValid(match);
            const allowed =
                Number(match.white_user_id) === Number(player.userId) ||
                Number(match.black_user_id) === Number(player.userId);
            if (!allowed) {
                return;
            }
            const payload = buildStatePayload({ match, playersByUserId });
            const color = Number(player.userId) === Number(match.white_user_id) ? 'white' : 'black';
            socket.emit('dama:state:update', { ...payload, yourColor: color });
        });

        socket.on('dama:move:try', async ({ matchId, from, to } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            if (!matchId || !from || !to) return;
            const fr = Math.trunc(Number(from.r ?? from.row));
            const fc = Math.trunc(Number(from.c ?? from.col));
            const tr = Math.trunc(Number(to.r ?? to.row));
            const tc = Math.trunc(Number(to.c ?? to.col));
            if (![fr, fc, tr, tc].every((n) => Number.isFinite(n) && n >= 0 && n <= 7)) {
                let badCoordMatch = await getMatchById(Number(matchId));
                badCoordMatch = await ensureDamaMatchBoardMigrated(badCoordMatch);
                badCoordMatch = await ensureDamaChainValid(badCoordMatch);
                if (
                    badCoordMatch?.status === 'active' &&
                    badCoordMatch.board &&
                    boardValid(badCoordMatch.board)
                ) {
                    const syncPayload = buildStatePayload({
                        match: badCoordMatch,
                        moveMeta: null,
                        playersByUserId
                    });
                    await emitDamaStateUpdateToRoom(badCoordMatch, playersByUserId, null);
                    if (syncPayload.mesaId === 1 || syncPayload.mesaId === 2) {
                        io.emit('dama:state:world', syncPayload);
                    }
                }
                return;
            }

            let match = await getMatchById(Number(matchId));
            if (!match || match.status !== 'active') {
                return;
            }
            match = await ensureDamaMatchBoardMigrated(match);
            match = await ensureDamaChainValid(match);
            if (!match.board || !boardValid(match.board)) {
                return;
            }
            const isWhite = Number(match.white_user_id) === Number(player.userId);
            const isBlack = Number(match.black_user_id) === Number(player.userId);
            if (!isWhite && !isBlack) {
                return;
            }
            const expectedTurn = isWhite ? 'w' : 'b';
            if (normalizeDamaTurn(match.turn) !== expectedTurn) {
                const syncPayload = buildStatePayload({
                    match,
                    moveMeta: null,
                    playersByUserId
                });
                await emitDamaStateUpdateToRoom(match, playersByUserId, null);
                if (syncPayload.mesaId === 1 || syncPayload.mesaId === 2) {
                    io.emit('dama:state:world', syncPayload);
                }
                return;
            }
            const { chainFr, chainFc } = parseChain(match);
            const res = tryMove(match.board, match.turn, chainFr, chainFc, fr, fc, tr, tc);
            if (!res.ok) {
                let fresh = await getMatchById(Number(matchId));
                fresh = await ensureDamaMatchBoardMigrated(fresh);
                fresh = await ensureDamaChainValid(fresh);
                if (fresh?.status === 'active' && fresh.board && boardValid(fresh.board)) {
                    const syncPayload = buildStatePayload({
                        match: fresh,
                        moveMeta: null,
                        playersByUserId
                    });
                    await emitDamaStateUpdateToRoom(fresh, playersByUserId, null);
                    if (syncPayload.mesaId === 1 || syncPayload.mesaId === 2) {
                        io.emit('dama:state:world', syncPayload);
                    }
                }
                return;
            }

            await appendMoveAndUpdateState({
                matchId: Number(matchId),
                san: res.san,
                boardAfter: res.board,
                turnAfter: res.turn,
                chainFromR: res.chainFr,
                chainFromC: res.chainFc
            });

            let updated = await getMatchById(Number(matchId));
            updated = await ensureDamaChainValid(updated);
            const moveMeta = {
                from: { r: fr, c: fc },
                to: { r: tr, c: tc },
                san: res.san,
                byUserId: player.userId,
                byUsername: player.username
            };
            const statePayload = buildStatePayload({
                match: updated,
                moveMeta,
                playersByUserId
            });
            await emitDamaStateUpdateToRoom(updated, playersByUserId, moveMeta);
            if (statePayload.mesaId === 1 || statePayload.mesaId === 2) {
                io.emit('dama:state:world', statePayload);
            }

            if (res.gameOver && res.winner) {
                const winnerUserId =
                    res.winner === 'w' ? Number(match.white_user_id) : Number(match.black_user_id);
                const loserUserId =
                    res.winner === 'w' ? Number(match.black_user_id) : Number(match.white_user_id);
                const finished = await finishMatch({
                    matchId: Number(match.id),
                    winnerUserId,
                    exitReason: 'win'
                });
                const winnerPlayer = playersByUserId.get(Number(winnerUserId));
                const loserPlayer = playersByUserId.get(Number(loserUserId));
                const leaderboard = await recordDamaWinLossAndMeta(
                    winnerPlayer?.nickname || winnerPlayer?.username || `Oyuncu${winnerUserId}`,
                    loserPlayer?.nickname || loserPlayer?.username || `Oyuncu${loserUserId}`,
                    winnerUserId,
                    loserUserId
                );
                emitDamaMatchEnded(match, {
                    matchId: Number(match.id),
                    winnerUserId: finished?.winner_user_id || winnerUserId,
                    winnerUsername: winnerPlayer?.username || `user-${winnerUserId}`,
                    loserUserId,
                    loserUsername: loserPlayer?.username || `user-${loserUserId}`,
                    reason: 'win',
                    message: res.resultText || `${winnerPlayer?.username || 'Oyuncu'} kazandı.`,
                    leaderboard
                });
                await broadcastQueueStates();
            }
        });

        socket.on('dama:exit:confirm', async ({ matchId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId || !matchId) return;
            const match = await getMatchById(Number(matchId));
            if (!match || match.status !== 'active') return;
            const isWhite = Number(match.white_user_id) === Number(player.userId);
            const isBlack = Number(match.black_user_id) === Number(player.userId);
            if (!isWhite && !isBlack) return;
            const winnerUserId = isWhite ? Number(match.black_user_id) : Number(match.white_user_id);
            const winnerPlayer = playersByUserId.get(winnerUserId);
            const loserPlayer = playersByUserId.get(Number(player.userId));
            const finished = await finishMatch({
                matchId: Number(match.id),
                winnerUserId,
                exitReason: 'exit'
            });
            const leaderboard = await recordDamaWinLossAndMeta(
                winnerPlayer?.nickname || winnerPlayer?.username || `Oyuncu${winnerUserId}`,
                loserPlayer?.nickname || loserPlayer?.username || `Oyuncu${player.userId}`,
                winnerUserId,
                Number(player.userId)
            );
            emitDamaMatchEnded(match, {
                matchId: Number(match.id),
                winnerUserId: finished?.winner_user_id || winnerUserId,
                winnerUsername: winnerPlayer?.username || `user-${winnerUserId}`,
                loserUserId: Number(player.userId),
                loserUsername: loserPlayer?.username || `user-${player.userId}`,
                reason: 'exit',
                message: `${loserPlayer?.username || 'Oyuncu'} oyundan ayrıldı. ${
                    winnerPlayer?.username || 'Rakip'
                } kazandı.`,
                leaderboard
            });
            await broadcastQueueStates();
        });

        socket.on('dama:exit:request', async ({ matchId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId || !matchId) return;
            const match = await getMatchById(Number(matchId));
            if (!match || match.status !== 'active') return;
            const allowed =
                Number(match.white_user_id) === Number(player.userId) ||
                Number(match.black_user_id) === Number(player.userId);
            if (!allowed) return;
            socket.emit('dama:exit:request:ack', { matchId: Number(matchId) });
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
