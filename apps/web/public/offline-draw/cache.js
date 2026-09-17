/** Classic script usable in the page and dedicated worker. Cache files only, never artwork. */
(() => {
  const name = 'toonstudio-emergency-drawing-shell-v2';
  const ready = '/offline-draw/ready-v2';
  const legacyNames = ['toonstudio-emergency-drawing-shell-v1'];
  const files = [
    ['/offline-draw/index.html', /text\/html/i],
    ['/offline-draw/install.html', /text\/html/i],
    ['/offline-draw/portable.html', /text\/html/i],
    ['/offline-draw/styles.css', /text\/css/i],
    ['/offline-draw/install.css', /text\/css/i],
    ['/offline-draw/model.js', /(javascript|ecmascript)/i],
    ['/offline-draw/storage.js', /(javascript|ecmascript)/i],
    ['/offline-draw/editor.js', /(javascript|ecmascript)/i],
    ['/offline-draw/install.js', /(javascript|ecmascript)/i],
    ['/offline-draw/cache.js', /(javascript|ecmascript)/i],
    ['/offline-draw/bootstrap.js', /(javascript|ecmascript)/i],
    ['/offline-draw/manifest.webmanifest', /(manifest\+json|application\/json)/i],
  ];
  let preparing = null;
  const cleanupLegacy = () => Promise.all(
    legacyNames.map((legacyName) => caches.delete(legacyName).catch(() => false)),
  );
  async function prepare() {
    if (preparing) return preparing;
    preparing = (async () => {
      const cache = await caches.open(name);
      const existing = await cache.match(ready);
      if (existing && (await Promise.all(files.map(([url]) => cache.match(url)))).every(Boolean)) {
        await cleanupLegacy();
        return true;
      }
      // Fetch and validate the whole set before any put. Never cache a proxy's HTML error as JS.
      const responses = await Promise.all(files.map(async ([url, mime]) => {
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
        try {
          const response = await fetch(url, { cache: 'reload', credentials: 'same-origin', signal: controller.signal });
          if (!response.ok || response.redirected || !mime.test(response.headers.get('content-type') ?? '')) throw new Error(`로컬 드로잉 파일 준비 실패: ${url}`);
          const body = await response.clone().arrayBuffer();
          if (!body.byteLength || body.byteLength > 1048576) throw new Error('로컬 실행 파일 크기 오류');
          return response;
        } finally { clearTimeout(timer); }
      }));
      await cache.delete(ready);
      await Promise.all(files.map(([url], i) => cache.put(url, responses[i])));
      await cache.put(ready, new Response('ready-v2', { headers: { 'content-type': 'text/plain' } }));
      await cleanupLegacy();
      return true;
    })().finally(() => { preparing = null; });
    return preparing;
  }
  async function respond(request) {
    if (request.method !== 'GET' || request.headers.has('range')) return null;
    const url = new URL(request.url);
    if (url.origin !== location.origin) return null;
    const path = url.pathname === '/offline-draw/' || url.pathname === '/offline-draw' ? '/offline-draw/index.html' : url.pathname;
    if (!files.some(([file]) => file === path)) return null;
    const cache = await caches.open(name);
    if (!(await cache.match(ready))) return null;
    return (await cache.match(path)) ?? null;
  }
  globalThis.ToonLocalCache = Object.freeze({ name, ready, files, prepare, respond });
})();
