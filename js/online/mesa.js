/**
 * mesaId rules (single source of truth).
 *
 * Terminology:
 * - mesaId=0  : PC/mobil "sanal masa" (kampüsteki fiziksel masaları doldurmaz)
 * - mesaId=1/2: VR fiziksel masalar (kampüste taşlar canlı güncellenir)
 *
 * Goal:
 * - PC/mobil normalde 0'da kuyruklanır (overlay oynar).
 * - Karma eşleşmede (VR+PC) server maç mesaId'sini 1/2 yapabilir; bu durumda PC/mobil avatarı masaya ışınlanabilir.
 */

export const MESA_PC = 0;
export const MESA_VR_DEFAULT = 1;
export const MESA_VR_ALT = 2;

export function normalizeMesaId(mesaId, fallback = MESA_VR_DEFAULT) {
    const n = Number(mesaId);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Spot'a yaklaşınca "hangi kuyruğa gireyim?" kararı.
 * - VR: spot.mesaId (yoksa 1)
 * - PC/mobil: 0
 */
export function mesaIdForQueueJoin({ xrActive, spotMesaId }) {
    if (xrActive) return normalizeMesaId(spotMesaId, MESA_VR_DEFAULT);
    return MESA_PC;
}

/**
 * Queue state isteği için mid.
 * - Eğer spot üstündeysek: spot bazlı karar
 * - Değilsek: önce last mesaId (online state), yoksa 1
 */
export function mesaIdForQueueState({ xrActive, activeSpotGame, activeSpotMesaId, fallbackMesaId }) {
    if (activeSpotGame === 'ch' || activeSpotGame === 'da') {
        return mesaIdForQueueJoin({ xrActive, spotMesaId: activeSpotMesaId });
    }
    return normalizeMesaId(fallbackMesaId, MESA_VR_DEFAULT);
}

