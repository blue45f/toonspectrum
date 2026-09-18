/** Executes the production TypeScript helpers, without a browser or an API server. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'toonstudio-offline-'));
process.on('exit', () => rmSync(temporary, { recursive: true, force: true }));
const base = 'apps/web/src';
const files = [
  `${base}/app/service-worker/studio-service-worker-navigation.ts`,
  `${base}/app/service-worker/studio-service-worker-offline.ts`,
  `${base}/shared/lib/studio-offline-protocol.ts`,
];
for (const file of files) {
  const target = join(temporary, file.replace(/\.ts$/u, '.js'));
  mkdirSync(dirname(target), { recursive: true });
  const { outputText, diagnostics } = ts.transpileModule(readFileSync(join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true, fileName: file,
  });
  assert.equal(diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error).length, 0);
  writeFileSync(target, outputText);
}
const { resolveStudioNavigation, isUsableStudioShell } = require(join(temporary, files[0].replace(/\.ts$/u, '.js')));
const { prepareStudioOfflineResources } = require(join(temporary, files[1].replace(/\.ts$/u, '.js')));
const protocol = require(join(temporary, files[2].replace(/\.ts$/u, '.js')));
const origin = 'https://www.toonstudio.cloud';
const shell = (isolated = true, body = '<html>studio</html>') => new Response(body, { headers: {
  'content-type': 'text/html; charset=utf-8',
  ...(isolated ? { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'credentialless' } : {}),
} });
function navigation(overrides = {}) {
  const writes = [];
  const waited = [];
  return { writes, waited, options: {
    request: new Request(`${origin}/studio`), isolated: true, shellUrls: ['/', '/studio'],
    preloadResponse: Promise.resolve(undefined), readShell: async () => shell(),
    refreshShell: async (response) => { writes.push(await response.text()); },
    waitUntil: (promise) => { waited.push(promise); }, fetcher: async () => shell(true, '<html>fresh</html>'),
    ...overrides,
  } };
}

test('shell validation preserves cross-origin isolation and rejects non-HTML responses', () => {
  assert.equal(isUsableStudioShell(shell(), true), true);
  assert.equal(isUsableStudioShell(shell(false), true), false);
  assert.equal(isUsableStudioShell(shell(false), false), true);
  assert.equal(isUsableStudioShell(new Response('{}', { headers: { 'content-type': 'application/json' } }), false), false);
  assert.equal(isUsableStudioShell(new Response(null, { status: 204 }), false), false);
});
for (const status of [408, 500, 502, 503, 504, 599]) {
  test(`HTTP ${status} uses the validated isolated shell`, async () => {
    const state = navigation({ fetcher: async () => new Response('down', { status }) });
    const response = await resolveStudioNavigation(state.options);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.match(response.headers.get('server-timing'), /toonstudio-offline/u);
    assert.equal(await response.text(), '<html>studio</html>');
    assert.equal(state.writes.length, 0);
  });
}
for (const status of [401, 403, 404, 429]) {
  test(`HTTP ${status} is not hidden by a cached shell`, async () => {
    const state = navigation({ fetcher: async () => new Response('original', { status }) });
    assert.equal((await resolveStudioNavigation(state.options)).status, status);
    assert.equal(state.writes.length, 0);
  });
}
test('healthy canonical HTML refreshes cache without consuming the page response', async () => {
  const state = navigation();
  assert.equal(await (await resolveStudioNavigation(state.options)).text(), '<html>fresh</html>');
  await Promise.all(state.waited);
  assert.deepEqual(state.writes, ['<html>fresh</html>']);
});
test('query-specific navigation never overwrites the canonical shell', async () => {
  const state = navigation({ request: new Request(`${origin}/studio?account=private`) });
  await resolveStudioNavigation(state.options);
  await Promise.all(state.waited);
  assert.equal(state.writes.length, 0);
});
test('preloaded HTTP 503 falls back without a redundant network fetch', async () => {
  const state = navigation({ preloadResponse: Promise.resolve(new Response('down', { status: 503 })),
    fetcher: async () => { assert.fail('unnecessary fetch'); } });
  assert.equal((await resolveStudioNavigation(state.options)).status, 200);
});
test('rejected preload still tries a normal network fetch', async () => {
  let fetches = 0;
  const state = navigation({ preloadResponse: Promise.reject(new Error('preload failure')),
    fetcher: async () => { fetches += 1; return shell(); } });
  await resolveStudioNavigation(state.options);
  assert.equal(fetches, 1);
});
test('a hanging network request is aborted and falls back within the deadline', async () => {
  let signal;
  const state = navigation({ timeoutMs: 10, fetcher: async (_request, init) => {
    signal = init.signal;
    return new Promise(() => {});
  } });
  assert.equal((await resolveStudioNavigation(state.options)).status, 200);
  assert.equal(signal.aborted, true);
});
test('a hanging preload cannot delay the fallback indefinitely or issue a late fetch', async () => {
  let finish;
  let fetches = 0;
  const state = navigation({ timeoutMs: 10,
    preloadResponse: new Promise((done) => { finish = done; }),
    fetcher: async () => { fetches += 1; return shell(); } });
  assert.equal((await resolveStudioNavigation(state.options)).status, 200);
  finish(undefined);
  await new Promise((done) => setImmediate(done));
  assert.equal(fetches, 0);
  assert.equal(state.writes.length, 0);
});
test('late success after fallback never overwrites the known good shell', async () => {
  let finish;
  const state = navigation({ timeoutMs: 10, fetcher: () => new Promise((done) => { finish = done; }) });
  await resolveStudioNavigation(state.options);
  finish(shell(true, 'late'));
  await new Promise((done) => setImmediate(done));
  assert.equal(state.writes.length, 0);
});
test('missing cache preserves the real server error', async () => {
  const state = navigation({ readShell: async () => undefined, fetcher: async () => new Response('down', { status: 503 }) });
  const response = await resolveStudioNavigation(state.options);
  assert.equal(response.status, 503);
  assert.equal(await response.text(), 'down');
});
test('missing isolated headers do not silently downgrade the drawing storage runtime', async () => {
  const state = navigation({ readShell: async () => shell(false), fetcher: async () => { throw new Error('offline'); } });
  await assert.rejects(resolveStudioNavigation(state.options), /offline/u);
});
test('cache read and write failures do not mask successful online responses', async () => {
  const state = navigation({ readShell: async () => { throw new Error('denied'); },
    refreshShell: async () => { throw new Error('quota'); } });
  assert.equal((await resolveStudioNavigation(state.options)).status, 200);
  await Promise.all(state.waited);
});

test('only bounded, same-origin static build URLs are admitted', () => {
  assert.equal(protocol.normalizeStudioOfflineAssetUrl(`${origin}/assets/brush-a.js`, origin), '/assets/brush-a.js');
  for (const input of ['https://other.test/assets/a.js', '/api/works', '/assets/a.js?token=x',
    // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic URL-userinfo rejection fixture
    '/assets/a.js#x', 'https://user:secret@www.toonstudio.cloud/assets/a.js', '/assets/../api/a.js', '/assets/private.json', 'x'.repeat(2049)]) {
    assert.equal(protocol.normalizeStudioOfflineAssetUrl(input, origin), null);
  }
  assert.equal(protocol.isStudioOfflinePreparationMessage({ type: protocol.STUDIO_OFFLINE_PREPARE_MESSAGE, urls: [] }), true);
  assert.equal(protocol.isStudioOfflinePreparationMessage({ type: protocol.STUDIO_OFFLINE_PREPARE_MESSAGE, urls: Array(protocol.STUDIO_OFFLINE_MAX_RESOURCES + 1).fill('/assets/a.js') }), false);
});

function preparation(overrides = {}) {
  const stored = new Map();
  const fetched = [];
  const asset = () => new Response('export const brush = 1;', { headers: { 'content-type': 'text/javascript' } });
  stored.set('/', shell(false)); stored.set('/studio', shell());
  stored.set('/assets/index-a.js', asset());
  stored.set('/i18n/studio/ko.json', new Response('{}', { headers: { 'content-type': 'application/json' } }));
  const options = {
    origin, buildId: 'test-build', urls: ['/assets/brush-a.js'], shellUrls: ['/', '/studio'],
    criticalUrls: ['/assets/index-a.js'], warmUrls: ['/i18n/studio/ko.json'],
    read: async (url) => stored.get(url)?.clone(),
    write: async (url, response) => { stored.set(url, response); },
    fetcher: async (url) => { fetched.push(String(url)); return asset(); },
    ...overrides,
  };
  return { options, stored, fetched, asset };
}
test('explicit preparation downloads missing code, then verifies the complete requested set', async () => {
  const state = preparation();
  const result = await prepareStudioOfflineResources(state.options);
  assert.equal(result.complete, true);
  assert.equal(result.checked, 5);
  assert.equal(result.cached, 5);
  assert.equal(result.downloadedBytes, 23);
  assert.deepEqual(state.fetched, [`${origin}/assets/brush-a.js`]);
});
test('a fully cached editor can recheck readiness without network requests', async () => {
  const state = preparation(); state.stored.set('/assets/brush-a.js', state.asset());
  const result = await prepareStudioOfflineResources(state.options);
  assert.equal(result.complete, true);
  assert.equal(result.downloadedBytes, 0);
  assert.deepEqual(state.fetched, []);
});
test('quota failures cannot be reported as a completed offline preparation', async () => {
  const state = preparation({ write: async () => undefined });
  const result = await prepareStudioOfflineResources(state.options);
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ['/assets/brush-a.js']);
});
test('eviction of an earlier item is detected by the final whole-set verification', async () => {
  const state = preparation();
  state.options.write = async (url, response) => { state.stored.set(url, response); state.stored.delete('/assets/index-a.js'); };
  const result = await prepareStudioOfflineResources(state.options);
  assert.equal(result.complete, false);
  assert.ok(result.missing.includes('/assets/index-a.js'));
});
test('SPA error HTML is not stored as drawing JavaScript', async () => {
  const state = preparation({ fetcher: async () => shell(false) });
  const result = await prepareStudioOfflineResources(state.options);
  assert.equal(result.complete, false);
  assert.equal(state.stored.has('/assets/brush-a.js'), false);
});
test('oversized resources are cancelled instead of exhausting browser storage', async () => {
  let cancelled = false;
  const state = preparation({ fetcher: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
    headers: { 'content-type': 'text/javascript', 'content-length': String(9 * 1024 * 1024) },
  }) });
  const result = await prepareStudioOfflineResources(state.options);
  assert.equal(result.complete, false);
  assert.equal(cancelled, true);
});
test('opaque/private/external URLs never enter the preparation download path', async () => {
  const state = preparation({ urls: ['https://evil.test/private', '/api/works/secret'] });
  const result = await prepareStudioOfflineResources(state.options);
  assert.equal(result.complete, false);
  assert.deepEqual(state.fetched, []);
});
test('oversized message lists are rejected before any storage or network access', async () => {
  const state = preparation({ urls: Array(protocol.STUDIO_OFFLINE_MAX_RESOURCES + 1).fill('/assets/a.js'), read: async () => { assert.fail('should not read'); } });
  const result = await prepareStudioOfflineResources(state.options);
  assert.equal(result.complete, false);
  assert.equal(result.checked, 0);
  assert.deepEqual(state.fetched, []);
});
test('worker code without its isolation resource header is not marked ready', async () => {
  const state = preparation({ urls: ['/assets/studio-draw.worker-abc.js'] });
  const result = await prepareStudioOfflineResources(state.options);
  assert.equal(result.complete, false);
  assert.ok(result.missing.includes('/assets/studio-draw.worker-abc.js'));
});
