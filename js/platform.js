'use strict';

import { IS_MOB, IS_QUEST } from './config.js';

export function applyPlatformDom() {
    const pcControls = document.getElementById('pc-controls');
    const mobControls = document.getElementById('mob-controls');
    const vrControls = document.getElementById('vr-controls');

    if (IS_MOB) {
        if (pcControls) pcControls.style.display = 'none';
        if (mobControls) mobControls.style.display = 'grid';
    }
    if (IS_QUEST) {
        if (pcControls) pcControls.style.display = 'none';
        if (mobControls) mobControls.style.display = 'none';
        if (vrControls) vrControls.style.display = 'grid';
        document.body.classList.add('is-quest');
    }
}
