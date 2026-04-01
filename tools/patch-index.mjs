import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let h = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const s = h.indexOf('<style>');
const e = h.indexOf('</style>') + 8;
h = h.slice(0, s) + '<link rel="stylesheet" href="/css/main.css">' + h.slice(e);
const s2 = h.indexOf('<script>', h.indexOf('three.min.js'));
const e2 = h.lastIndexOf('</script>') + 9;
h = h.slice(0, s2) + '<script type="module" src="/js/main.js"></script>' + h.slice(e2);
fs.writeFileSync(path.join(root, 'index.html'), h);
