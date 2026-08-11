'use strict';

/**
 * Reload sonrası spawn'ı saklama/okuma yardımcıları.
 * campus-app.js içindeki eski davranışla uyumlu tutulur.
 */

export function createSpawnStore(storageKey = 'vrh_spawn_v1') {
    const KEY = String(storageKey || 'vrh_spawn_v1');

    return {
        save({ xrActive, xrRig, player, playerYaw }) {
            try {
                const src = xrActive && xrRig ? xrRig : player;
                if (!src) return;
                const x = src.position?.x ?? 0;
                const z = src.position?.z ?? 108;
                const yaw = (src.rotation?.y ?? playerYaw ?? 0);
                localStorage.setItem(KEY, JSON.stringify({
                    x,
                    z,
                    yaw,
                    t: Date.now(),
                }));
            } catch (_) { /* ignore */ }
        },
        read() {
            try {
                const raw = localStorage.getItem(KEY);
                if (!raw) return null;
                const d = JSON.parse(raw);
                if (!d || typeof d !== 'object') return null;
                const x = Number(d.x);
                const z = Number(d.z);
                const yaw = Number(d.yaw);
                if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(yaw)) return null;
                return { x, z, yaw };
            } catch (_) {
                return null;
            }
        }
    };
}

