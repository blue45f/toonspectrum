/* Tiny recovery entry, independent of React, authentication, localization and API bootstrap. */
(() => {
  const isStudio = location.pathname === '/studio' || location.pathname.startsWith('/studio/');
  if (!isStudio) return;
  let offered = false;
  function offer() {
    if (offered || !document.body) return;
    offered = true;
    const host = document.createElement('aside'); host.id = 'toon-local-recovery';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{position:fixed;bottom:18px;right:18px;z-index:2147482000;max-width:calc(100vw - 36px);font:13px/1.6 system-ui;color:#f4f5ff}div{padding:14px;border:1px solid #8c82b8;border-radius:12px;background:#242337;box-shadow:0 8px 30px #0005}a{display:inline-block;margin:8px 10px 0 0;padding:8px 12px;background:#7454d8;color:white;border-radius:8px;text-decoration:none}button{color:#ccc;background:transparent;border:0;cursor:pointer;padding:8px}';
    const box = document.createElement('div');
    const message = document.createElement('span'); message.textContent = '스튜디오 연결이 어려운가요? 서버 없이 기본 드로잉을 계속할 수 있습니다.';
    const link = document.createElement('a'); link.href = '/offline-draw/'; link.target = '_blank'; link.rel = 'noopener'; link.textContent = '로컬 작업실 새 창으로 열기';
    const dismiss = document.createElement('button'); dismiss.textContent = '닫기'; dismiss.onclick = () => host.remove();
    box.append(message, document.createElement('br'), link, dismiss); root.append(style, box); document.body.append(host);
  }
  window.addEventListener('offline', offer);
  window.addEventListener('error', (event) => { if (event.target?.tagName === 'SCRIPT') offer(); }, true);
  setTimeout(() => {
    if (!navigator.onLine || !document.getElementById('root')?.firstElementChild) offer();
  }, 10000);
  const prepare = async () => {
    try {
      await import('/offline-draw/cache.js');
      await globalThis.ToonLocalCache.prepare();
      if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/offline-draw/sw.js', { scope: '/offline-draw/' });
      document.documentElement.dataset.localDrawingPrepared = 'true';
    } catch { document.documentElement.dataset.localDrawingPrepared = 'false'; }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(() => { void prepare(); }, { timeout: 3000 });
  else setTimeout(() => { void prepare(); }, 1000);
})();
