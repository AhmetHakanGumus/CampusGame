import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
let s = fs.readFileSync(path.join(root, 'js', 'minigames', '_raw.js'), 'utf8');
s = s.replace(/\bgameRaf\b/g, 'G.gameRaf');
s = s.replace(/\bgameRunning\b/g, 'G.gameRunning');
const lines = s.split(/\r?\n/).map((l) => l.replace(/^        /, ''));
s = lines.join('\n');
const head = `'use strict';

import { IS_MOB } from '../config.js';
import { G } from '../runtime.js';
import { playBeep, playArrowShoot } from '../audio.js';

`;
const tail = `

export { TableTennis, FlappyBird, Penalti, Archery, Basketball };
`;
fs.writeFileSync(path.join(root, 'js', 'minigames', 'games.js'), head + s.trim() + tail);
