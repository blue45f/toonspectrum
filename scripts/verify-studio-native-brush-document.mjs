/** Actual inspector/Worker/document-codec test, isolated from production accounts and services. */
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("../.qa/engine-resume/", import.meta.url);
const built = process.argv.includes("--built-worker");
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws:; img-src 'self' data: blob:";
let workerUrl = null;
if (built) {
  const names = (await readdir(new URL("../dist/assets/", import.meta.url)))
    .filter((name) => /^studio-native-brush-probe\.worker-[a-zA-Z0-9_-]+\.js$/u.test(name));
  assert.equal(names.length, 1, "Build the current app first; expected one native Worker artifact");
  workerUrl = "/__native_built/assets/" + names[0];
}
const entry = root + "__native_document.entry.tsx";
const server = await createServer({
  configFile: false, envFile: false, root,
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { dedupe: ["react", "react-dom"], alias: { "@": root + "apps/web/src" } },
  optimizeDeps: { noDiscovery: true, include: ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom/client", "perfect-freehand", "canvaskit-wasm", "zod"] },
  server: { host: "127.0.0.1", port: 5279, strictPort: true },
  plugins: [{ name: "native-document-verifier",
    resolveId(source) { if (source === "/__native_document.entry.tsx") return entry; },
    load(id) {
      if (id !== entry) return;
      return `import React, { useState } from 'react'; import { createRoot } from 'react-dom/client';
        import Inspector from '/apps/web/src/domains/creator/brush/StudioNativeBrushDocumentInspector.tsx';
        import { prepareStudioNativeBrushDocumentCommit } from '/apps/web/src/domains/creator/brush/studio-native-brush-document-commit.ts';
        import { serializeStudioProjectDocument, parseStudioProjectDocument } from '/apps/web/src/domains/creator/studio-project-document.ts';
        import { exportPageToSvg } from '/apps/web/src/domains/creator/export/studio-svg-export.ts';
        const makeSource = () => ({ id:'original',type:'draw',kind:'freehand',mode:'pen',brush:'gpen',stroke:'#123456',strokeWidth:12,opacity:0.45,
          points:Array.from({length:64},(_,i)=>[150+i*5,180+Math.sin(i/8)*36]).flat(),
          pressures:Array.from({length:64},(_,i)=>0.2+Math.sin(i/63*Math.PI)*0.7),
          tiltXs:Array(64).fill(20),tiltYs:Array(64).fill(10),sampleTimeOffsets:Array.from({length:64},(_,i)=>i*8) });
        let history=[[makeSource()]], index=0, updates=()=>{};
        const read=()=>({pageId:'p',masterEditMode:false,historyIdentity:history,historyIndex:index,elements:history[index],groups:[],documentWidth:720,documentHeight:1000});
        globalThis.__nativeDocumentHarness={
          state:()=>JSON.parse(JSON.stringify(read().elements)),
          reset:()=>{history=[[makeSource()]];index=0;updates();},
          undo:()=>{if(index>0){index--;updates();}}, redo:()=>{if(index<history.length-1){index++;updates();}},
          mutateFrontier:()=>{history=[...history];},
          roundTrip:async()=>{
            const raw={version:2,title:'Native brush verification',currentPageId:'p',pagesList:[{id:'p',elements:history[index],canvasH:1000,bg:'#ffffff',bgGrad:null}]};
            const json=serializeStudioProjectDocument(raw,{documentId:'native-check',revision:1,createdAt:'2026-09-19T00:00:00.000Z',updatedAt:'2026-09-19T00:00:00.000Z'});
            const loaded=await parseStudioProjectDocument(json), elements=loaded.project.pagesList[0].elements;
            const exported=exportPageToSvg({width:720,height:1000,bg:'#ffffff',elements});
            return {bytes:json.length,elements,svg:exported.svg};
          }
        };
        function App(){const [,setTick]=useState(0);updates=()=>setTick(n=>n+1);
          const onPrepare=(target)=>prepareStudioNativeBrushDocumentCommit(target,{read,canMutate:()=>true,
            commit:(elements)=>{history=[...history.slice(0,index+1),elements];index++;updates();return true;},onCommitted:()=>{}});
          return <Inspector selected={history[index][0]} documentWidth={720} documentHeight={1000} pageId="p" masterEditMode={false} disabled={false} onPrepare={onPrepare}/>;
        }
        createRoot(document.getElementById('root')).render(<App/>);`;
    },
    configureServer(instance) {
      instance.middlewares.use((request, response, next) => {
        const prefix = request.url?.startsWith("/__native_built/assets/") ? "/__native_built/assets/"
          : built && request.url?.startsWith("/assets/") ? "/assets/" : null;
        if (prefix) {
          const name = request.url.slice(prefix.length);
          if (!/^[a-zA-Z0-9_.-]+\.(js|wasm)$/u.test(name)) { response.statusCode = 404; response.end(); return; }
          response.setHeader("Content-Type", name.endsWith(".wasm") ? "application/wasm" : "text/javascript");
          response.setHeader("Content-Security-Policy", CSP);
          void readFile(new URL("../dist/assets/" + name, import.meta.url)).then(
            (bytes) => response.end(bytes), () => { response.statusCode = 404; response.end(); });
          return;
        }
        if (request.url !== "/__native_document") return next();
        response.setHeader("Content-Type", "text/html"); response.setHeader("Content-Security-Policy", CSP);
        response.end('<!doctype html><meta charset="utf-8"><title>Native document conversion</title><style>body{font:16px system-ui;max-width:720px;margin:24px}button,select,summary{min-height:44px;margin:4px}p{line-height:1.6}</style><div id="root"></div><script type="module" src="/__native_document.entry.tsx"></script>');
      });
    },
  }],
});
let browser;
try {
  await mkdir(output, { recursive: true }); await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((compiledUrl) => {
    Reflect.set(globalThis, "__zod_globalConfig", { jitless: true });
    const stats = { created: 0, active: 0, peak: 0, heldDocumentReplies: 0 };
    globalThis.__nativeDocumentWorkers = stats; globalThis.__nativeDocumentCsp = [];
    document.addEventListener("securitypolicyviolation", (event) => globalThis.__nativeDocumentCsp.push(event.violatedDirective));
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class extends NativeWorker {
      stopped = false;
      constructor(url, options) {
        super(compiledUrl && String(url).includes("studio-native-brush-probe.worker") ? compiledUrl : url, options);
        stats.created++; stats.active++; stats.peak = Math.max(stats.peak, stats.active);
        // Fault-injection seam for cancellation only. Rendering is real; hold the final reply
        // before client delivery so faster engines cannot finish before Playwright clicks Cancel.
        this.addEventListener("message", (event) => {
          if (globalThis.__nativeDocumentHoldReply && event.data?.type === "document") {
            stats.heldDocumentReplies++;
            event.stopImmediatePropagation();
          }
        }, { capture: true });
      }
      terminate() { if (!this.stopped) { this.stopped = true; stats.active--; } return super.terminate(); }
    };
  }, workerUrl);
  await page.goto("http://127.0.0.1:5279/__native_document");
  await page.locator("summary").click();
  assert.equal(await page.evaluate(() => globalThis.__nativeDocumentWorkers.created), 0);
  await page.getByRole("checkbox", { name: "연속 미리보기 가속" }).uncheck();
  const engines = [];
  for (const engine of ["libmypaint", "canvaskit", "vello"]) {
    await page.evaluate(() => globalThis.__nativeDocumentHarness.reset());
    await page.getByRole("combobox", { name: "문서 변환 엔진", exact: true }).selectOption(engine);
    const original = await page.evaluate(() => globalThis.__nativeDocumentHarness.state());
    await page.getByRole("button", { name: "선택 획 변환", exact: true }).click();
    await page.waitForFunction(() => globalThis.__nativeDocumentHarness.state().some((element) => element.type === "image"), undefined, { timeout: 45_000 });
    const converted = await page.evaluate(() => globalThis.__nativeDocumentHarness.state());
    assert.equal(converted.length, 2); assert.deepEqual(converted[0], { ...original[0], hidden: true });
    assert.equal(converted[1].opacity, original[0].opacity);
    const pixels = await page.evaluate(async (element) => {
      const image = new Image(); image.src = element.src; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
      const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0, mass = 0;
      for (let i = 3; i < bytes.length; i += 4) { if (bytes[i]) visible++; mass += bytes[i]; }
      return { width: image.width, height: image.height, visible, alphaMass: mass };
    }, converted[1]);
    assert.ok(pixels.visible > 100); assert.equal(pixels.width, converted[1].width); assert.equal(pixels.height, converted[1].height);
    const reopened = await page.evaluate(() => globalThis.__nativeDocumentHarness.roundTrip());
    assert.equal(reopened.elements[1].src, converted[1].src); assert.equal(reopened.elements[0].hidden, true);
    assert.equal(reopened.svg.match(/<image\b/gu)?.length, 1); assert.ok(reopened.svg.includes(converted[1].src));
    await page.evaluate(() => globalThis.__nativeDocumentHarness.undo());
    assert.deepEqual(await page.evaluate(() => globalThis.__nativeDocumentHarness.state()), original);
    await page.evaluate(() => globalThis.__nativeDocumentHarness.redo());
    assert.deepEqual(await page.evaluate(() => globalThis.__nativeDocumentHarness.state()), converted);
    assert.equal(await page.evaluate(() => globalThis.__nativeDocumentWorkers.active), 0);
    engines.push({ engine, ...pixels, serializedBytes: reopened.bytes, preservedOriginal: true, undoRedoExact: true, canonicalReload: true, svgEmbeddedPng: true });
  }
  const previews = [];
  await page.getByRole("checkbox", { name: "연속 미리보기 가속" }).check();
  for (const engine of ["libmypaint", "canvaskit", "vello"]) {
    await page.evaluate(() => globalThis.__nativeDocumentHarness.reset());
    await page.getByRole("combobox", { name: "문서 변환 엔진", exact: true }).selectOption(engine);
    const before = await page.evaluate(() => ({ source: globalThis.__nativeDocumentHarness.state(), created: globalThis.__nativeDocumentWorkers.created }));
    let previousSrc;
    for (let run = 0; run < 3; run++) {
      await page.getByRole("button", { name: "결과 미리보기", exact: true }).click();
      await page.getByRole("button", { name: "미리보기 적용", exact: true }).waitFor();
      const src = await page.getByRole("img", { name: engine + " 선택 획 미리보기", exact: true }).getAttribute("src");
      if (previousSrc) assert.equal(src, previousSrc, "Reused engine changed its PNG");
      previousSrc = src;
      assert.deepEqual(await page.evaluate(() => globalThis.__nativeDocumentHarness.state()), before.source);
    }
    assert.equal(await page.evaluate(() => globalThis.__nativeDocumentWorkers.created), before.created + 1);
    await page.getByRole("button", { name: "미리보기 적용", exact: true }).click();
    const applied = await page.evaluate(() => globalThis.__nativeDocumentHarness.state());
    assert.equal(applied.length, 2); assert.equal(applied[1].src, previousSrc);
    await page.locator("summary").click(); // Actual close UI releases the idle lease.
    await page.waitForFunction(() => globalThis.__nativeDocumentWorkers.active === 0, undefined, { timeout: 2000 });
    assert.equal(await page.evaluate(() => globalThis.__nativeDocumentWorkers.active), 0);
    await page.locator("summary").click();
    previews.push({ engine, previewCount: 3, workerInitializations: 1, originalUntouchedUntilApply: true, appliedExactPreview: true, closeReleasesWorker: true });
  }
  // A preview can outlive a document-history edit: applying it must fail, not regenerate.
  await page.evaluate(() => globalThis.__nativeDocumentHarness.reset());
  await page.getByRole("combobox", { name: "문서 변환 엔진", exact: true }).selectOption("libmypaint");
  await page.getByRole("button", { name: "결과 미리보기", exact: true }).click();
  await page.getByRole("button", { name: "미리보기 적용", exact: true }).waitFor();
  await page.evaluate(() => globalThis.__nativeDocumentHarness.mutateFrontier());
  await page.getByRole("button", { name: "미리보기 적용", exact: true }).click();
  assert.equal(await page.evaluate(() => globalThis.__nativeDocumentHarness.state().length), 1);
  assert.equal(await page.evaluate(() => globalThis.__nativeDocumentWorkers.active), 0);
  await page.evaluate(() => globalThis.__nativeDocumentHarness.reset());
  await page.getByRole("combobox", { name: "문서 변환 엔진", exact: true }).selectOption("libmypaint");
  // Trigger synchronously so the history changes before the asynchronous Worker can finish.
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button')).find((button) => button.textContent === '선택 획 변환').click();
    globalThis.__nativeDocumentHarness.mutateFrontier();
  });
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes('이력이 변경'), undefined, { timeout: 45_000 });
  assert.equal(await page.evaluate(() => globalThis.__nativeDocumentHarness.state().length), 1);
  await page.evaluate(() => globalThis.__nativeDocumentHarness.reset());
  await page.evaluate(() => { globalThis.__nativeDocumentHoldReply = true; });
  await page.getByRole("button", { name: "선택 획 변환", exact: true }).click();
  await page.waitForFunction(() => globalThis.__nativeDocumentWorkers.heldDocumentReplies === 1, undefined, { timeout: 45_000 });
  await page.getByRole("button", { name: "변환 취소", exact: true }).click();
  await page.evaluate(() => { globalThis.__nativeDocumentHoldReply = false; });
  assert.equal(await page.evaluate(() => globalThis.__nativeDocumentHarness.state().length), 1);
  assert.equal(await page.evaluate(() => globalThis.__nativeDocumentWorkers.active), 0);
  await page.screenshot({ path: fileURLToPath(new URL("native-document-inspector.png", output)) });
  const sessionLifecycle = await page.evaluate(async () => {
    const { verifyNativeBrushSessions } = await import("/scripts/studio-native-brush-session-browser.mjs");
    return verifyNativeBrushSessions();
  });
  const workers = await page.evaluate(() => globalThis.__nativeDocumentWorkers);
  const csp = await page.evaluate(() => globalThis.__nativeDocumentCsp);
  assert.equal(workers.peak, 1); assert.equal(workers.active, 0); assert.deepEqual(csp, []); assert.deepEqual(errors, []);
  const report = { scope: "real inspector + Dedicated Workers + production transaction planner/codec/SVG; isolated history host, not complete Studio UI or physical stylus certification",
    browser: browser.version(), previews, sessionLifecycle, workerArtifact: workerUrl ?? "Vite development Worker", engines, cancelledPreservesOriginal: true,
    staleHistoryRejected: true, cancellationFault: "real completed Worker reply deliberately held before client delivery", workers, cspViolations: csp, pageErrors: errors };
  await writeFile(new URL(built ? "native-brush-document-built.json" : "native-brush-document-browser.json", output), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); await server.close(); }
