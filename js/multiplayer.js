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
    socket.on('chess:match:ended', (payload) => {
        handlers.onChessMatchEnded?.(payload || {});
    });
    socket.on('chess:error', ({ message }) => {
        handlers.onChessError?.(message || 'Satranç hatası');
    });

    return {
        sendMove(state) {
            socket.emit('player-move', state);
        },
        sendBallState(state) {
            socket.emit('ball-state', state);
        },
        joinChessQueue() {
            socket.emit('chess:queue:join');
        },
        leaveChessQueue() {
            socket.emit('chess:queue:leave');
        },
        getChessQueue() {
            socket.emit('chess:queue:list');
        },
        startChessWithWaitingPlayer() {
            socket.emit('chess:match:start');
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
        disconnect() {
            socket.disconnect();
        }
    };
}
