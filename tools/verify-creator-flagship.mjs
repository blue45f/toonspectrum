/** Scoped dependency-light contracts. Not a substitute for the protected core or browser gates. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
async function check(name, run) { await run(); checks.push(name); }
function load(path, context = {}) {
  const source = readFileSync(resolve(root, path), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true, fileName: path });
  assert.equal(result.diagnostics?.filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0, path);
  const exports = {};
  vm.runInNewContext(result.outputText, { exports, URLSearchParams, URL, Promise, setTimeout, clearTimeout, ...context }, { filename: path, timeout: 1000 });
  return exports;
}
const language = load('packages/core/src/reference-query-language.ts');
const mode = load('apps/web/src/domains/creator/studio-launch-mode.ts');
const r = language.resolveReferenceQuery;
for (const [input, output] of [['중세 갑옷','medieval armor'], ['한복','Korean costume'], ['도포','Korean robe'], ['건축','architecture'], ['도자기','ceramics'], ['비 오는 골목','rain alley'], ['한국 전통 의상','Korean costume'], ['고양이','cat']]) {
  await check(`Korean vocabulary: ${input}`, () => assert.equal(r(input).providerQuery, output));
}
await check('English remains unchanged', () => { assert.equal(r('Victorian dress').providerQuery, 'Victorian dress'); assert.equal(r('Victorian dress').status, 'unchanged'); });
await check('Unknown Korean is never invented or discarded', () => { assert.equal(r('우주해적선').providerQuery, '우주해적선'); assert.equal(r('우주해적선').status, 'unsupported'); });
await check('No substring replacement inside cultural terms or names', () => assert.equal(r('한국화').providerQuery, '한국화'));
await check('Partial translations preserve unknown tokens', () => { const result = r('갑옷 우주해적선'); assert.equal(result.providerQuery, 'armor 우주해적선'); assert.equal(result.status, 'partial'); assert.equal(result.unresolved[0], '우주해적선'); });
await check('NFC-normalized Hangul', () => assert.equal(r('갑옷'.normalize('NFD')).providerQuery, 'armor'));
await check('Mixed English and Korean', () => assert.equal(r('medieval 갑옷').providerQuery, 'medieval armor'));
await check('Whitespace normalized without losing original intent', () => assert.equal(r('  중세   갑옷  ').providerQuery, 'medieval armor'));
for (const input of ['', 'a', '갑옷\n', '갑옷\u0000', 'x'.repeat(81)]) {
  await check(`Invalid query preserved: ${JSON.stringify(input).slice(0,28)}`, () => { assert.equal(r(input).status, 'invalid'); assert.equal(r(input).providerQuery, input); });
}
await check('Expansion never exceeds the upstream query budget', () => { const input = '중세 '.repeat(26).trim(); const result = r(input); assert.equal(result.status, 'unsupported'); assert.equal(result.providerQuery, input); assert.ok(result.providerQuery.length <= 80); });
await check('Prototype-shaped token is not interpreted', () => assert.equal(r('갑옷 __proto__').providerQuery, 'armor __proto__'));
await check('Met adapter preserves page and filters without mutating input', () => { const input = { provider: 'met', q: '갑옷', page: '3', field: 'tags', departmentId: '4' }; const out = language.localizeReferenceProviderQuery(input); assert.equal(input.q, '갑옷'); assert.equal(out.q, 'armor'); assert.equal(out.page, '3'); assert.equal(out.field, 'tags'); assert.equal(out.departmentId, '4'); });
for (const input of [{ provider: 'kakao', q: '갑옷' }, { provider: 'openlibrary', q: '갑옷' }, { provider: 'met', q: ['갑옷'] }, { provider: ['met'], q: '갑옷' }, { provider: 'met', q: '갑옷\n' }]) {
  await check(`Adapter keeps validation/provider authority: ${JSON.stringify(input)}`, () => assert.equal(language.localizeReferenceProviderQuery(input), input));
}
for (const [query, expected] of [['?uiMode=simple','focus'], ['?uiMode=studio','full'], ['',null], ['?uiMode=other',null], ['?uiMode=simple&uiMode=studio',null], ['?uiMode=SIMPLE',null], ['?room=private&uiMode=simple','focus']]) {
  await check(`Launch mode: ${query || '(absent)'}`, () => assert.equal(mode.readStudioLaunchDensity(query), expected));
}
await check('Launch preserves all unrelated preferences and does not mutate', () => { const settings = { general: { densityMode: 'full', locale: 'ko' }, toolbar: { visibleIds: ['brush'] }, input: { pressure: .6 } }; const next = mode.applyStudioLaunchDensity(settings, 'focus'); assert.equal(next.general.densityMode, 'focus'); assert.equal(settings.general.densityMode, 'full'); assert.equal(next.general.locale, 'ko'); assert.equal(next.toolbar, settings.toolbar); assert.equal(next.input, settings.input); assert.equal(mode.applyStudioLaunchDensity(settings, null), settings); assert.equal(mode.applyStudioLaunchDensity(settings, 'full'), settings); });
const offlinePath = 'apps/web/src/domains/marketing/creator-offline-readiness.ts';
const baseWindow = { isSecureContext: true, location: { origin: 'https://example.test' } };
await check('Missing browser APIs produce unknowns, not false ready', async () => { const api = load(offlinePath, { window: baseWindow, navigator: { onLine: true } }); const s = await api.inspectCreatorOfflineReadiness(); assert.equal(s.persisted, null); assert.equal(s.shellCached, null); assert.equal(s.controlled, false); assert.equal(s.quota, null); });
await check('Readiness never requests persistence implicitly', async () => { let writes = 0; const api = load(offlinePath, { window: baseWindow, navigator: { onLine: true, storage: { persist: () => { writes++; return true; }, persisted: async () => false, estimate: async () => ({ usage: 8, quota: 100 }) } } }); const s = await api.inspectCreatorOfflineReadiness(); assert.equal(writes, 0); assert.equal(s.persisted, false); assert.equal(s.usage, 8); });
await check('Blocked storage and service worker getters are contained', async () => { const navigator = { onLine: false }; Object.defineProperty(navigator, 'storage', { get() { throw new Error('blocked'); } }); Object.defineProperty(navigator, 'serviceWorker', { get() { throw new Error('blocked'); } }); const api = load(offlinePath, { window: baseWindow, navigator }); const s = await api.inspectCreatorOfflineReadiness(); assert.equal(s.persisted, null); assert.equal(s.controlled, false); assert.equal(s.online, false); });
await check('Public non-isolated HTML cannot be labelled as a cached editor shell', async () => { const api = load(offlinePath, { window: { ...baseWindow, caches: { match: async () => new Response('<html/>', { headers: { 'content-type': 'text/html' } }) } }, navigator: { onLine: true } }); assert.equal((await api.inspectCreatorOfflineReadiness()).shellCached, false); });
await check('Isolated cached shell is detected without claiming project readiness', async () => { const api = load(offlinePath, { window: { ...baseWindow, caches: { match: async () => new Response('<html/>', { headers: { 'content-type': 'text/html', 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' } }) } }, navigator: { onLine: true, serviceWorker: { controller: {} } } }); const s = await api.inspectCreatorOfflineReadiness(); assert.equal(s.shellCached, true); assert.equal(s.controlled, true); assert.equal('projectReady' in s, false); });
await check('Storage values reject NaN, infinity and negative numbers', () => { const api = load(offlinePath); for (const value of [NaN, Infinity, -1, '2', null, undefined]) assert.equal(api.finiteStorageBytes(value), null); assert.equal(api.finiteStorageBytes(0), 0); });
await check('Rejected browser promises settle safely', async () => { const api = load(offlinePath); assert.equal(await api.boundedStorageRead(Promise.reject(new Error('denied')), null), null); });
await check('Stalled browser promise has a deadline', async () => { const api = load(offlinePath); assert.equal(await api.boundedStorageRead(new Promise(() => {}), null), null); });
await check('Actual root has one coherent experience', () => { const rootSource = readFileSync(resolve(root, 'apps/web/src/domains/creator-resources/CreatorHomePage.tsx'), 'utf8'); assert.match(rootSource, /<CreatorHomeExperience \/>/u); assert.doesNotMatch(rootSource, /<ProductIntentStart/u); const intent = readFileSync(resolve(root, 'apps/web/src/domains/creator-resources/ProductIntentStart.tsx'), 'utf8'); assert.doesNotMatch(intent, /<h1\b/u); });
await check('Server request and search explanation both use the shared resolver', () => { assert.match(readFileSync(resolve(root, 'apps/api/src/modules/creator-resources/creator-resources.module.ts'), 'utf8'), /engine\.search\(localizeReferenceProviderQuery\(query\)/u); assert.match(readFileSync(resolve(root, 'apps/web/src/domains/creator-resources/ReferenceQueryExplanation.tsx'), 'utf8'), /resolveReferenceQuery\(query\)/u); });
console.log(JSON.stringify({ status: 'passed', count: checks.length, checks, scope: 'Pure function and source wiring contracts only; full app typecheck, React browser tests and deployment are separate gates.' }, null, 2));
