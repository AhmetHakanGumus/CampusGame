'use strict';

/**
 * Gap Yenev: Blender referansı — merkez daire + üç kanat (dış yay, iç yay, hub arası yay), 120° simetri.
 * `BUILDINGS` içindeki ilgili kaydı runtime'da günceller (mapPolygon, x, z).
 *
 * @param {Array<{ name?: string, mapPolygon?: unknown, x?: number, z?: number }>} buildings
 */
export function initGapYenevTriskelionMapPolygon(buildings) {
    const spec = buildings.find((b) => b.name === 'Gap Yenev');
    if (!spec) return;
    const cx = 36;
    const cz = 50;
    const rot = -Math.PI / 6;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const toWorld = (lx, lz) => ({
        x: cx + lx * cosR - lz * sinR,
        z: cz + lx * sinR + lz * cosR
    });

    const R_hub = 2.6;
    const R_inner = 4.0;
    const R_outer = 11;
    const alpha = 0.4;
    const TAU = Math.PI * 2;
    const nHub = 10;
    const nInner = 14;
    const nOuter = 22;
    const nRad = 1;

    const pts = [];
    const push = (lx, lz) => pts.push(toWorld(lx, lz));
    const pushArc = (r, a0, a1, nSeg, skipFirst) => {
        for (let i = skipFirst ? 1 : 0; i <= nSeg; i++) {
            const t = i / nSeg;
            const a = a0 + (a1 - a0) * t;
            push(r * Math.cos(a), r * Math.sin(a));
        }
    };
    const pushRadial = (r0, r1, ang, skipFirst) => {
        for (let i = skipFirst ? 1 : 0; i <= nRad; i++) {
            const t = i / nRad;
            const r = r0 + (r1 - r0) * t;
            push(r * Math.cos(ang), r * Math.sin(ang));
        }
    };

    for (let k = 0; k < 3; k++) {
        const phi = k * (TAU / 3);
        const phiPrev = phi - TAU / 3;
        pushArc(R_hub, phiPrev - alpha, phi - alpha, nHub, pts.length > 0);
        pushRadial(R_hub, R_inner, phi - alpha, false);
        pushArc(R_inner, phi - alpha, phi + alpha, nInner, true);
        pushRadial(R_inner, R_outer, phi + alpha, true);
        pushArc(R_outer, phi + alpha, phi - alpha, nOuter, true);
        pushRadial(R_outer, R_hub, phi - alpha, true);
    }

    spec.mapPolygon = pts;
    let sx = 0;
    let sz = 0;
    pts.forEach((p) => {
        sx += p.x;
        sz += p.z;
    });
    spec.x = sx / pts.length;
    spec.z = sz / pts.length;
}
