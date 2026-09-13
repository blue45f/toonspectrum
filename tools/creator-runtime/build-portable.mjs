/** Deterministic, self-contained emergency editor. No font, CDN, API or service-worker dependency. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const directory = path.resolve('apps/web/public/offline-draw');
const read = name => fs.readFileSync(path.join(directory, name), 'utf8');
const script = ['model.js', 'storage.js', 'editor.js'].map(name => read(name).replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '')).join('\n');
const hash = createHash('sha256').update(script).digest('base64');
let html = read('index.html').replace('<link rel="stylesheet" href="/offline-draw/styles.css">', `<style>${read('styles.css')}</style>`)
  .replace('<script type="module" src="/offline-draw/editor.js"></script>', `<script type="module">${script}</script>`)
  .replace(/<a id="portable"[\s\S]*?<\/a>/, '')
  .replace('href="/studio"', 'href="https://www.toonstudio.cloud/studio"')
  .replace('<meta name="theme-color"', `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'"><meta name="theme-color"`);
if (process.argv.includes('--check')) {
  if (read('portable.html') !== html) throw new Error('Portable editor is stale. Run build-portable.mjs.');
} else fs.writeFileSync(path.join(directory, 'portable.html'), html);
console.log(`Portable editor: ${Buffer.byteLength(html)} bytes; no external dependencies`);
