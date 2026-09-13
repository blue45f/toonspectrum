/** Build a self-contained drawing application. No external script/font/model/network dependency. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'apps/web/public');
const destination = resolve(process.argv[2] || join(root, 'artifacts/local-first/toonstudio-local-offline.html'));
const model = readFileSync(join(base, 'offline-drawing/model.js'), 'utf8').replace(/^export /gm, '');
const app = readFileSync(join(base, 'offline-drawing/app.js'), 'utf8').replace(/^import[^\n]+\n/, '');
const css = readFileSync(join(base, 'offline-drawing/style.css'), 'utf8');
const runtime = `${model}\n${app}`.replace(/<\/script/gi, '<\\/script');
let html = readFileSync(join(base, 'offline-drawing.html'), 'utf8');
html = html.replace(/<link\b[^>]*href="\/offline-drawing\/style\.css"[^>]*>/, () => `<style id="local-style">${css}</style>`);
html = html.replace(/<script\b[^>]*src="\/offline-drawing\/app\.js"[^>]*><\/script>/, () => `<script id="local-runtime" type="module">${runtime}</script>`);
// No stylesheet/script URL is allowed to survive in a portable build.
if (/<script\b[^>]*\bsrc=|<link\b[^>]*rel="stylesheet"/i.test(html)) throw new Error('Portable build contains external resources');
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, html);
console.log(`Portable drawing application: ${destination}`);
