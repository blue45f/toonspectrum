/** Test-only CommonJS wrapping of the REAL service worker entry; no rewritten routing logic. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let ts; try { ts = require('typescript'); } catch { ts = require('/usr/local/slides_js/node_modules/typescript'); }
const root = process.cwd(), dir = path.join(root, 'apps/web/src/app/service-worker');
let text = `const __STUDIO_SERVICE_WORKER_MANIFEST__ = ${JSON.stringify({buildId:'outage-regression',criticalUrls:[],shellUrls:['/studio'],warmUrls:[]})};\nconst modules = {}, cache = {};\nfunction require(id){ if(cache[id]) return cache[id].exports; const m={exports:{}};cache[id]=m;modules[id](m,m.exports,require);return m.exports;}\n`;
for (const name of ['studio-service-worker-policy', 'emergency-drawing', 'studio-service-worker-entry']) {
 const compiled = ts.transpileModule(fs.readFileSync(path.join(dir, name+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 text += `modules['./${name}'] = function(module,exports,require){\n${compiled}\n};\n`;
}
text += "require('./studio-service-worker-entry');";
fs.writeFileSync(path.join(root,'apps/web/public/__test-sw.js'),text);
