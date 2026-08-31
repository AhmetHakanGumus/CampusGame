'use strict';

let bootPercentValue = 0;

export function campusBootOverlayEl() {
    return document.getElementById('campus-boot-overlay');
}

export function setCampusBootStatus(message) {
    const el = campusBootOverlayEl();
    if (!el) return;
    const st = el.querySelector('[data-boot-status]');
    if (st) st.textContent = message || '';
}

export function setCampusBootPercent(percent) {
    const el = campusBootOverlayEl();
    if (!el) return;
    const n = Number(percent);
    const pct = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
    // İlerleme geri gitmesin (paralel yükleme adımlarında titreme olmasın).
    if (pct < bootPercentValue && pct !== 0) return;
    bootPercentValue = pct;
    const node = el.querySelector('[data-boot-percent]');
    if (node) node.textContent = `${bootPercentValue}%`;
    el.setAttribute('aria-valuenow', String(bootPercentValue));
}

export function showCampusBootOverlay(message = '', percent = 0) {
    if (document.body.classList.contains('hand-preview-mode')) return;
    const el = campusBootOverlayEl();
    if (!el) return;
    bootPercentValue = 0;
    el.setAttribute('aria-hidden', 'false');
    el.setAttribute('aria-busy', 'true');
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');
    el.classList.add('is-visible');
    setCampusBootStatus(message);
    setCampusBootPercent(percent);
}

export function hideCampusBootOverlay() {
    const el = campusBootOverlayEl();
    if (!el || !el.classList.contains('is-visible')) return;
    setCampusBootPercent(100);
    el.classList.remove('is-visible');
    el.setAttribute('aria-busy', 'false');
    window.setTimeout(() => {
        el.setAttribute('aria-hidden', 'true');
        bootPercentValue = 0;
    }, 480);
}
