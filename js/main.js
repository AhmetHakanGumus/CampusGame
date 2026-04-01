'use strict';

import { startCampusExperience, startWebHandPreview } from './campus-app.js';
import { setupAuthUI } from './auth-ui.js';

const handPreviewOn = new URLSearchParams(location.search).get('handPreview') === '1';
if (handPreviewOn) {
    document.body.classList.add('hand-preview-mode');
    startWebHandPreview();
} else {
    setupAuthUI((username, sessionToken) => startCampusExperience(username, sessionToken));
}
