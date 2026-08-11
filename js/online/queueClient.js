/**
 * Minimal, explicit client wrapper for multiplayer queue/match features.
 *
 * Why:
 * - `campus-app.js` historically calls `mpClient.joinChessQueue(...)` etc directly.
 * - New developers adding online games should have a single pattern to follow.
 *
 * This wrapper is intentionally thin: it doesn't hide the socket protocol,
 * it just normalizes naming + provides a predictable surface.
 */

export function createQueueClient(mpClient) {
    const c = mpClient || {};

    return {
        // Chess queue
        chess: {
            join: (mesaId) => c.joinChessQueue?.(mesaId),
            leave: (mesaId) => c.leaveChessQueue?.(mesaId),
            state: (mesaId) => c.getChessQueue?.(mesaId),
            watch: (matchId) => c.watchChessMatch?.(matchId),
            leaveWatch: (matchId) => c.leaveChessWatch?.(matchId),
            confirmExit: (matchId) => c.confirmExitMatch?.(matchId)
        },
        // Dama queue
        dama: {
            join: (mesaId) => c.joinDamaQueue?.(mesaId),
            leave: (mesaId) => c.leaveDamaQueue?.(mesaId),
            state: (mesaId) => c.getDamaQueue?.(mesaId),
            watch: (matchId) => c.watchDamaMatch?.(matchId),
            leaveWatch: (matchId) => c.leaveDamaWatch?.(matchId),
            confirmExit: (matchId) => c.confirmExitDamaMatch?.(matchId)
        }
    };
}

