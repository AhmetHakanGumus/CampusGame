import { Chess } from 'chess.js';
import {
    appendMoveAndUpdateState,
    clearQueueSocketBySocketId,
    createMatch,
    DEFAULT_GAME_MESA_ID,
    finishMatch,
    getActiveMatchForUser,
    getFirstActiveMatch,
    getActiveMatches,
    getFirstWaitingQueueEntry,
    getMatchById,
    getQueueCount,
    isUserQueued,
    removeQueueEntryBySocketId,
    removeQueueEntry,
    touchQueueEntry,
    upsertQueueEntry
} from './models/chess.model.js';
import { recordChessWinLossAndMeta, recordChessDrawAndMeta } from './chessLeaderboard.util.js';

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

    /** Oda yayını + beyaz/siyah socket'ine doğrudan (bazı VR istemcilerde oda üyeliği kaçabiliyor). */
    function emitChessMatchEnded(match, payload) {
        const id = Number(match.id);
        io.to(roomName(id)).emit('chess:match:ended', payload);
        const seen = new Set();
        for (const uid of [match.white_user_id, match.black_user_id]) {
            const sid = resolveSocketIdByUserId(Number(uid));
            if (!sid || seen.has(sid)) continue;
            seen.add(sid);
            const sock = io.sockets.sockets.get(sid);
            if (sock) sock.emit('chess:match:ended', payload);
        }
    }

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
            mesaId: match.mesa_id != null ? Number(match.mesa_id) : DEFAULT_GAME_MESA_ID,
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
        // İstemci hangi masayı soruyorsa onun kuyruğunu gösterir; göndermezse varsayılan 1.
        // Not: broadcastQueueStates tüm masaları ayrı ayrı yayınladığı için bu alan çoğu zaman dolu gelir.
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
        socket.emit('chess:queue:state', payload);
    }

    async function broadcastQueueStates() {
        const all = io.sockets.sockets;
        for (const socket of all.values()) {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) continue;
            // 3 masa: 0 (PC/mobil sanal), 1-2 (VR masaları). Her mesa ayrı kuyruk/state.
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
        const engine = await ensureEngine(match);
        const payload = buildStatePayload({ match, engine, playersByUserId });
        // Sadece gerçek kampüs masaları (1-2) world güncellemesi yayınlar.
        // Web/mobil "sanal masa" (0) kampüsteki masaları doldurmasın.
        if (payload.mesaId === 1 || payload.mesaId === 2) {
            io.emit('chess:state:world', payload);
        }
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

    /**
     * @param {string} socketId
     * @param {{ userId?: number, username?: string } | null} disconnectedPlayer — app.js disconnect'te players silinmeden önce verilir; aksi halde resolvePlayer her zaman null kalırdı.
     */
    async function onPlayerDisconnected(socketId, disconnectedPlayer = null) {
        // Oyuncu sekmeyi kapatırsa / bağlantı koparsa kuyruktan da çıksın.
        // (Aksi halde status=waiting kalıp "hayalet" sıra oluşturabiliyor.)
        await removeQueueEntryBySocketId(socketId);
        await clearQueueSocketBySocketId(socketId);

        // Aktif maç varsa "exit" olarak bitir ve rakibe yayınla.
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

        const fenForLb = active.fen || new Chess().fen();

        const finished = await finishMatch({
            matchId: Number(active.id),
            winnerUserId,
            exitReason: 'disconnect'
        });

        const leaderboard = await recordChessWinLossAndMeta(
            winnerPlayer?.nickname || winnerPlayer?.username || `Oyuncu${winnerUserId}`,
            player?.nickname || player?.username || `Oyuncu${player.userId}`,
            winnerUserId,
            Number(player.userId),
            {
                fen: fenForLb,
                whiteUserId: active.white_user_id,
                blackUserId: active.black_user_id
            }
        );

        engineByMatchId.delete(Number(active.id));
        emitChessMatchEnded(active, {
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
        socket.on('chess:queue:join', async ({ mesaId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            const mid = mesaId != null ? Number(mesaId) : DEFAULT_GAME_MESA_ID;
            const active = await getActiveMatchForUser(player.userId);
            if (active) {
                socket.emit('chess:error', { message: 'Aktif maçın varken kuyruğa giremezsin.' });
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
            const candidateMesaIds =
                mid === 0 ? [0, 1, 2] : [mid, 0];
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
                    // (PC/mobil oyuncu overlay'de oynar ama avatarı masaya ışınlanabilir.)
                    const matchMesaId = mid === 0 ? waitingMid : mid;
                    const colors = randomColors(player.userId, Number(waiting.user_id));
                    const initial = new Chess();
                    const match = await createMatch({
                        whiteUserId: colors.whiteUserId,
                        blackUserId: colors.blackUserId,
                        fen: initial.fen(),
                        turn: initial.turn(),
                        mesaId: matchMesaId
                    });
                    engineByMatchId.set(Number(match.id), initial);
                    await emitMatchStart(match, playersByUserId);
                    await broadcastQueueStates();
                    return;
                }
            }
            const currentCount = await getQueueCount(mid);
            // VR masaları (1-2) fiziksel kapasite: 2 kişi.
            // PC/mobil sanal masa (0) aynı anda çoklu maç üretebilir; kuyruk limiti koymuyoruz.
            if (mid !== 0 && currentCount >= 2) {
                socket.emit('chess:error', { message: 'Kuyruk dolu (maks 2). Biraz sonra tekrar dene.' });
                return;
            }
            await upsertQueueEntry({
                userId: player.userId,
                username: player.username,
                socketId: socket.id,
                mesaId: mid
            });
            await broadcastQueueStates();
            // Sanal masa (0) gibi yayınlanmayan masalarda da bu socket'e anlık state ver.
            socket.data.mesaId = mid;
            await emitQueueState(player.userId, socket);
        });

        socket.on('chess:queue:leave', async ({ mesaId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            const mid = mesaId != null ? Number(mesaId) : DEFAULT_GAME_MESA_ID;
            await removeQueueEntry(player.userId, mid);
            await broadcastQueueStates();
            socket.data.mesaId = mid;
            await emitQueueState(player.userId, socket);
        });

        socket.on('chess:queue:list', async ({ mesaId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            socket.data.mesaId = mesaId != null ? Number(mesaId) : DEFAULT_GAME_MESA_ID;
            await emitQueueState(player.userId, socket);
        });

        /** Oyuncu olmayan istemciler maç odasına katılır; chess:state:update yayınını alır (izleyici). */
        socket.on('chess:watch', async ({ matchId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId || matchId == null) return;
            const match = await getMatchById(Number(matchId));
            if (!match || match.status !== 'active') {
                socket.emit('chess:error', { message: 'Maç yok veya bitti.' });
                return;
            }
            const uid = Number(player.userId);
            if (uid === Number(match.white_user_id) || uid === Number(match.black_user_id)) {
                socket.emit('chess:error', { message: 'Zaten bu maçın oyuncususun.' });
                return;
            }
            socket.join(roomName(match.id));
            const engine = await ensureEngine(match);
            const payload = buildStatePayload({ match, engine, playersByUserId });
            socket.emit('chess:watch:ack', {
                ...payload,
                yourColor: 'spectator',
                role: 'spectator'
            });
        });

        socket.on('chess:watch:leave', ({ matchId } = {}) => {
            if (matchId == null) return;
            socket.leave(roomName(Number(matchId)));
        });

        socket.on('chess:match:start', async ({ mesaId } = {}) => {
            const player = resolvePlayerBySocketId(socket.id);
            if (!player?.userId) return;
            const mid = mesaId != null ? Number(mesaId) : DEFAULT_GAME_MESA_ID;
            const active = await getActiveMatchForUser(player.userId);
            if (active) {
                socket.emit('chess:error', { message: 'Zaten aktif maçın var.' });
                return;
            }
            const waiting = await getFirstWaitingQueueEntry(player.userId, mid);
            if (!waiting) {
                socket.emit('chess:error', { message: 'Bekleyen oyuncu bulunamadı.' });
                await broadcastQueueStates();
                return;
            }
            const otherActive = await getActiveMatchForUser(Number(waiting.user_id));
            if (otherActive) {
                await removeQueueEntry(waiting.user_id, mid);
                socket.emit('chess:error', { message: 'Bekleyen oyuncu artık müsait değil.' });
                await broadcastQueueStates();
                return;
            }
            await removeQueueEntry(player.userId, mid);
            const colors = randomColors(player.userId, Number(waiting.user_id));
            const initial = new Chess();
            const match = await createMatch({
                whiteUserId: colors.whiteUserId,
                blackUserId: colors.blackUserId,
                fen: initial.fen(),
                turn: initial.turn(),
                mesaId: mid
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
            if (match.status !== 'active' || !match.fen) {
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
                const syncPayload = buildStatePayload({ match, engine, playersByUserId });
                io.to(roomName(match.id)).emit('chess:state:update', syncPayload);
                if (syncPayload.mesaId === 1 || syncPayload.mesaId === 2) {
                    io.emit('chess:state:world', syncPayload);
                }
                return;
            }
            await appendMoveAndUpdateState({
                matchId: Number(matchId),
                san: move.san,
                fenAfter: engine.fen(),
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
            if (statePayload.mesaId === 1 || statePayload.mesaId === 2) {
                io.emit('chess:state:world', statePayload);
            }

            if (statePayload.checkmate || statePayload.stalemate) {
                const finished = await finishMatch({
                    matchId: Number(match.id),
                    winnerUserId: statePayload.checkmate ? statePayload.winnerUserId : null,
                    exitReason: statePayload.checkmate ? 'checkmate' : 'stalemate'
                });
                let leaderboard = {};
                if (statePayload.checkmate && statePayload.winnerUserId != null) {
                    const winnerPlayer = playersByUserId.get(Number(statePayload.winnerUserId));
                    const winnerName = winnerPlayer?.nickname || winnerPlayer?.username || statePayload.winnerUsername;
                    const loserUid =
                        Number(statePayload.winnerUserId) === Number(match.white_user_id)
                            ? Number(match.black_user_id)
                            : Number(match.white_user_id);
                    const loserPlayer = playersByUserId.get(loserUid);
                    const loserName = loserPlayer?.nickname || loserPlayer?.username;
                    leaderboard = await recordChessWinLossAndMeta(
                        winnerName || 'Oyuncu',
                        loserName || `Oyuncu${loserUid}`,
                        Number(statePayload.winnerUserId),
                        loserUid,
                        {
                            fen: engine.fen(),
                            whiteUserId: match.white_user_id,
                            blackUserId: match.black_user_id
                        }
                    );
                } else if (statePayload.stalemate) {
                    const wP = playersByUserId.get(Number(match.white_user_id));
                    const bP = playersByUserId.get(Number(match.black_user_id));
                    leaderboard = await recordChessDrawAndMeta(
                        wP?.nickname || wP?.username || `user-${match.white_user_id}`,
                        bP?.nickname || bP?.username || `user-${match.black_user_id}`,
                        match.white_user_id,
                        match.black_user_id,
                        { fen: engine.fen() }
                    );
                }
                engineByMatchId.delete(Number(match.id));
                const loserUidMat =
                    statePayload.checkmate && statePayload.winnerUserId != null
                        ? Number(statePayload.winnerUserId) === Number(match.white_user_id)
                            ? Number(match.black_user_id)
                            : Number(match.white_user_id)
                        : null;
                const loserPMat = loserUidMat != null ? playersByUserId.get(loserUidMat) : null;
                emitChessMatchEnded(match, {
                    matchId: Number(match.id),
                    winnerUserId: finished?.winner_user_id || null,
                    winnerUsername: statePayload.winnerUsername || null,
                    loserUserId: loserUidMat,
                    loserUsername:
                        loserPMat?.username ||
                        loserPMat?.nickname ||
                        (loserUidMat != null ? `user-${loserUidMat}` : null),
                    reason: finished?.exit_reason || (statePayload.checkmate ? 'checkmate' : 'stalemate'),
                    message: statePayload.checkmate
                        ? `${statePayload.winnerUsername} Kazandı - Şah Mat!`
                        : 'Oyun berabere bitti.',
                    leaderboard
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
            const fenForLb = match.fen || new Chess().fen();
            const finished = await finishMatch({
                matchId: Number(match.id),
                winnerUserId,
                exitReason: 'exit'
            });
            const leaderboard = await recordChessWinLossAndMeta(
                winnerPlayer?.nickname || winnerPlayer?.username || `Oyuncu${winnerUserId}`,
                loserPlayer?.nickname || loserPlayer?.username || `Oyuncu${player.userId}`,
                winnerUserId,
                Number(player.userId),
                {
                    fen: fenForLb,
                    whiteUserId: match.white_user_id,
                    blackUserId: match.black_user_id
                }
            );
            engineByMatchId.delete(Number(match.id));
            emitChessMatchEnded(match, {
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
