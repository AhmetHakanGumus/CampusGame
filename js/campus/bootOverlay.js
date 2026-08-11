'use strict';

export function campusBootOverlayEl() {
    return document.getElementById('campus-boot-overlay');
}

export function setCampusBootStatus(message) {
    const el = campusBootOverlayEl();
    if (!el) return;
    const st = el.querySelector('[data-boot-status]');
    if (st) st.textContent = message || '';
}

export function showCampusBootOverlay(message = '') {
    if (document.body.classList.contains('hand-preview-mode')) return;
    const el = campusBootOverlayEl();
    if (!el) return;
    el.setAttribute('aria-hidden', 'false');
    el.setAttribute('aria-busy', 'true');
    el.classList.add('is-visible');
    setCampusBootStatus(message);
}

export function hideCampusBootOverlay() {
    const el = campusBootOverlayEl();
    if (!el || !el.classList.contains('is-visible')) return;
    el.classList.remove('is-visible');
    el.setAttribute('aria-busy', 'false');
    window.setTimeout(() => {
        el.setAttribute('aria-hidden', 'true');
    }, 480);
}

