'use strict';

import { io } from 'socket.io-client';

export function createMultiplayerClient({ nickname, username, sessionToken }, handlers = {}) {
    const socket = io(import.meta.env.VITE_SOCKET_URL || '/', {
        path: '/socket.io',
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        socket.emit('join-campus', { nickname, username, sessionToken });
    });

    socket.on('room-full', () => {
        handlers.onRoomFull?.();
    });
    socket.on('self-init', (payload) => {
        handlers.onSelfInit?.(payload);
    });
    socket.on('player-joined', (player) => {
        handlers.onPlayerJoined?.(player);
    });
    socket.on('player-moved', (player) => {
        handlers.onPlayerMoved?.(player);
    });
    socket.on('player-left', ({ id }) => {
        handlers.onPlayerLeft?.(id);
    });
    socket.on('player-crown-updated', (payload) => {
        handlers.onPlayerCrownUpdated?.(payload || {});
    });
    socket.on('online-users', ({ users }) => {
        handlers.onOnlineUsers?.(users || []);
    });
    socket.on('auth-error', ({ message }) => {
        handlers.onAuthError?.(message || 'Oturum hatası');
    });
    socket.on('ball-state', (payload) => {
        handlers.onBallState?.(payload || {});
    });
    socket.on('chess:queue:state', (payload) => {
        handlers.onChessQueueState?.(payload || {});
    });
    socket.on('chess:match:started', (payload) => {
        handlers.onChessMatchStarted?.(payload || {});
    });
    socket.on('chess:match:resumed', (payload) => {
        handlers.onChessMatchResumed?.(payload || {});
    });
    socket.on('chess:state:update', (payload) => {
        handlers.onChessStateUpdate?.(payload || {});
    });
    socket.on('chess:state:world', (payload) => {
        handlers.onChessStateWorld?.(payload || {});
    });
    socket.on('chess:match:ended', (payload) => {
        handlers.onChessMatchEnded?.(payload || {});
    });
    socket.on('chess:error', ({ message }) => {
        handlers.onChessError?.(message || 'Satranç hatası');
    });
    socket.on('chess:watch:ack', (payload) => {
        handlers.onChessWatchAck?.(payload || {});
    });
    socket.on('dama:queue:state', (payload) => {
        handlers.onDamaQueueState?.(payload || {});
    });
    socket.on('dama:match:started', (payload) => {
        handlers.onDamaMatchStarted?.(payload || {});
    });
    socket.on('dama:match:resumed', (payload) => {
        handlers.onDamaMatchResumed?.(payload || {});
    });
    socket.on('dama:state:update', (payload) => {
        handlers.onDamaStateUpdate?.(payload || {});
    });
    socket.on('dama:state:world', (payload) => {
        handlers.onDamaStateWorld?.(payload || {});
    });
    socket.on('dama:match:ended', (payload) => {
        handlers.onDamaMatchEnded?.(payload || {});
    });
    socket.on('dama:error', ({ message }) => {
        handlers.onDamaError?.(message || 'Dama hatası');
    });
    socket.on('dama:watch:ack', (payload) => {
        handlers.onDamaWatchAck?.(payload || {});
    });

    return {
        sendCrownChoice(payload) {
            socket.emit('crown-choice-update', payload || {});
        },
        sendMove(state) {
            socket.emit('player-move', state);
        },
        sendBallState(state) {
            socket.emit('ball-state', state);
        },
        joinChessQueue(mesaId) {
            socket.emit('chess:queue:join', mesaId != null ? { mesaId } : {});
        },
        leaveChessQueue(mesaId) {
            socket.emit('chess:queue:leave', mesaId != null ? { mesaId } : {});
        },
        getChessQueue(mesaId) {
            socket.emit('chess:queue:list', mesaId != null ? { mesaId } : {});
        },
        startChessWithWaitingPlayer(mesaId) {
            socket.emit('chess:match:start', mesaId != null ? { mesaId } : {});
        },
        getChessState(matchId) {
            socket.emit('chess:state:get', { matchId });
        },
        sendChessMove(move) {
            socket.emit('chess:move:try', move || {});
        },
        requestExitMatch(matchId) {
            socket.emit('chess:exit:request', { matchId });
        },
        confirmExitMatch(matchId) {
            socket.emit('chess:exit:confirm', { matchId });
        },
        watchChessMatch(matchId) {
            socket.emit('chess:watch', { matchId });
        },
        leaveChessWatch(matchId) {
            socket.emit('chess:watch:leave', { matchId });
        },
        joinDamaQueue(mesaId) {
            socket.emit('dama:queue:join', mesaId != null ? { mesaId } : {});
        },
        leaveDamaQueue(mesaId) {
            socket.emit('dama:queue:leave', mesaId != null ? { mesaId } : {});
        },
        getDamaQueue(mesaId) {
            socket.emit('dama:queue:list', mesaId != null ? { mesaId } : {});
        },
        startDamaWithWaitingPlayer(mesaId) {
            socket.emit('dama:match:start', mesaId != null ? { mesaId } : {});
        },
        getDamaState(matchId) {
            socket.emit('dama:state:get', { matchId });
        },
        sendDamaMove(move) {
            socket.emit('dama:move:try', move || {});
        },
        requestExitDamaMatch(matchId) {
            socket.emit('dama:exit:request', { matchId });
        },
        confirmExitDamaMatch(matchId) {
            socket.emit('dama:exit:confirm', { matchId });
        },
        watchDamaMatch(matchId) {
            socket.emit('dama:watch', { matchId });
        },
        leaveDamaWatch(matchId) {
            socket.emit('dama:watch:leave', { matchId });
        },
        disconnect() {
            socket.disconnect();
        }
    };
}
