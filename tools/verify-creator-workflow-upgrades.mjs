/** Scoped executable contracts; not a replacement for protected CI, browser, device or provider QA. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
async function check(name, run) { await run(); checks.push(name); }
function load(path, imports = {}, context = {}) {
  const source = readFileSync(resolve(root, path), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true, fileName: path });
  assert.equal(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, path);
  const exports = {};
  vm.runInNewContext(result.outputText, { exports, require: name => { if (!(name in imports)) throw new Error(`Unprovided import: ${name}`); return imports[name]; }, URL, URLSearchParams, Headers, Response, Blob, File, AbortController, TextDecoder, TextEncoder, atob, btoa, crypto: webcrypto, Promise, setTimeout, clearTimeout, ...context }, { filename: path, timeout: 3000 });
  return exports;
}
const language = load('packages/core/src/reference-query-language.ts');
const r = language.resolveReferenceQuery;
for (const [input, expected] of [['숲','forest'], ['손을','hand'], ['검','sword'], ['중세갑옷','medieval armor'], ['한복의','Korean costume'], ['손 포즈','hand gesture'], ['한복, 도자기','Korean costume ceramics'], ['수묵화','ink painting'], ['갑옷'.normalize('NFD'),'armor']]) {
  await check(`Korean search: ${input}`, () => assert.equal(r(input).providerQuery, expected));
}
await check('English and unknown cultural names are preserved', () => { for (const input of ['Victorian dress', '한국화', '김한국은', '우주해적선']) assert.equal(r(input).providerQuery, input); });
await check('Partial search never discards unknown words', () => { assert.equal(r('갑옷 우주해적선').providerQuery, 'armor 우주해적선'); assert.equal(r('갑옷 우주해적선').status, 'partial'); });
await check('Malformed and over-budget queries remain invalid', () => { for (const input of ['', 'a', 'ㅁ', '갑옷\n', '갑옷\0', 'x'.repeat(81)]) assert.equal(r(input).status, 'invalid'); });
await check('Expanded queries stay within the provider budget', () => { const result = r('중세 '.repeat(26).trim()); assert.equal(result.status, 'unsupported'); assert.ok(result.providerQuery.length <= 80); });
await check('Other providers and filters retain authority', () => { const input = { provider: 'met', q: '숲', page: '3', field: 'tags' }; const out = language.localizeReferenceProviderQuery(input); assert.equal(out.q, 'forest'); assert.equal(out.page, '3'); assert.equal(out.field, 'tags'); assert.equal(input.q, '숲'); const kakao = { provider: 'kakao', q: '숲' }; assert.equal(language.localizeReferenceProviderQuery(kakao), kakao); });
const assets = load('apps/web/src/shared/lib/reference-assets.ts', { '../../../../../packages/core/src/reference-query-language': language });
await check('Single-character terms pass the actual results-page validator', () => { assert.equal(assets.referenceSearchValidation({ ...assets.defaultReferenceSearchState(), query: '숲' }), ''); assert.notEqual(assets.referenceSearchValidation({ ...assets.defaultReferenceSearchState(), query: 'a' }), ''); });
await check('Date validation is not weakened by bilingual search', () => { assert.notEqual(assets.referenceSearchValidation({ ...assets.defaultReferenceSearchState(), query: '숲', dateBegin: '2000', dateEnd: '1900' }), ''); });
await check('URL and API queries keep the Korean original', () => { const search = { ...assets.defaultReferenceSearchState(), query: '손' }; assert.equal(assets.buildReferenceApiParams(search).get('q'), '손'); assert.equal(assets.parseReferenceUrlParams(assets.buildReferenceUrlParams(search, assets.defaultReferenceViewState())).search.query, '손'); });
await check('Korean filtering also works on locally saved English metadata', () => { const items = [{ id: '1', title: 'A study of a hand', asset: { tags: [] } }, { id: '2', title: 'Castle', asset: { tags: [] } }]; const result = assets.filterAndSortReferenceItems(items, { ...assets.defaultReferenceViewState(), mode: 'saved', within: '손' }, new Set(['1','2'])); assert.equal(result.length, 1); assert.equal(result[0].id, '1'); assert.equal(assets.filterAndSortReferenceItems(items, { ...assets.defaultReferenceViewState(), within: '손 우주해적선' }, new Set()).length, 0); });
const promo = load('apps/web/src/domains/creator/promo/promo-model.ts');
const panel = (id, caption = '') => ({ id, src: 'data:image/png;base64,AAAA', description: '설명', caption, motion: 'push-in', fit: 'contain', weight: 1 });
for (const motion of promo.PROMO_MOTIONS) {
  await check(`Motion trajectory stays finite and crop-safe: ${motion}`, () => {
    for (const progress of [-1, 0, .1, .3, .5, .8, 1, 2, NaN, Infinity]) {
      const pose = promo.promoMotionAt(motion, progress);
      for (const value of Object.values(pose)) assert.ok(Number.isFinite(value));
      assert.ok(pose.scale >= 1 && pose.scale <= 1.2);
      assert.ok(Math.abs(pose.x) <= (pose.scale - 1) / 2 + 1e-8);
      assert.ok(Math.abs(pose.y) <= (pose.scale - 1) / 2 + 1e-8);
    }
  });
}
await check('New motions follow distinct paths, not renamed constants', () => { const samples = promo.PROMO_MOTIONS.map(motion => JSON.stringify([.17,.43,.79].map(t => promo.promoMotionAt(motion,t)))); assert.equal(new Set(samples).size, promo.PROMO_MOTIONS.length); });
await check('Every panel count and supported duration preserves exact timeline budget', () => { for (const seconds of [15,30,60]) for (let count=1; count<=12; count++) { const project = { ...promo.emptyPromoProject(), seconds, panels: Array.from({ length:count }, (_,i) => ({ ...panel(String(i)), weight: i%2 ? .5 : 3 })) }; const scenes=promo.promoTimeline(project); let end=0; for (const scene of scenes) { assert.equal(scene.from,end); assert.ok(scene.duration>=15); end+=scene.duration; } assert.equal(end, seconds*30-60); } });
await check('Long captions get more readable local planning without changing assets', () => { const project={...promo.emptyPromoProject(), panels:[panel('a','짧음'),panel('b','긴'.repeat(110))]}; const planned=promo.localPromoPlan(project); assert.ok(planned[1].weight>planned[0].weight); assert.equal(planned[0].src,project.panels[0].src); assert.equal(project.panels[0].weight,1); });
await check('New motions round trip in portable project JSON', () => { for (const motion of promo.PROMO_MOTIONS) { const project={...promo.emptyPromoProject(),panels:[{...panel('a'),motion}]}; assert.equal(promo.parsePromoProject(JSON.parse(JSON.stringify(project))).panels[0].motion,motion); } });
await check('AI cannot add images, duplicate panels, or replace original assets', () => { const project={...promo.emptyPromoProject(),panels:[panel('a'),panel('b')]}; const plan=JSON.stringify({scenes:[{id:'b',caption:'반전',motion:'arc-left',weight:2},{id:'a',caption:'시작',motion:'breathing',weight:1}]}); const result=promo.parsePromoAiPlan(plan,project); assert.equal(result[0].src,project.panels[1].src); assert.throws(()=>promo.parsePromoAiPlan(plan.replace('"id":"a"','"id":"b"'),project)); assert.ok(!promo.promoAiPrompt(project).user.includes('data:image')); });
await check('Malformed imported media and numeric values fail closed', () => { for (const src of ['https://example.test/x.png','data:image/svg+xml;base64,AAAA','data:image/png;base64,AA!A']) assert.throws(()=>promo.parsePromoProject({...promo.emptyPromoProject(),panels:[{...panel('a'),src}]})); assert.throws(()=>promo.promoTimeline({...promo.emptyPromoProject(),panels:[{...panel('a'),weight:NaN}]})); });
await check('Audio endpoints are silent and malformed volume cannot overflow', () => { assert.equal(promo.promoAudioGain(0,450,1),0); assert.equal(promo.promoAudioGain(449,450,1),0); assert.equal(promo.promoAudioGain(100,450,NaN),0); assert.equal(promo.promoAudioGain(100,450,2),1); });
await check('Video dimensions are even and bounded', () => { for (const ratio of ['9:16','16:9','1:1']) { const size=promo.promoSize(ratio,721); assert.equal(size.width%2,0); assert.equal(size.height%2,0); } assert.throws(()=>promo.promoSize('9:16',Infinity)); });
await check('SRT includes the ending inside the requested 15 seconds', () => { const srt=promo.promoSrt({...promo.emptyPromoProject(),panels:[panel('a','첫\n장면')]}); assert.match(srt,/00:00:13,000 --> 00:00:15,000/u); assert.match(srt,/첫 장면/u); });
const offlinePath='apps/web/src/domains/marketing/creator-offline-readiness.ts';
const offline=load(offlinePath);
const html='<script type="module" src="/assets/app.js"></script><link rel="modulepreload" href="/assets/editor.js"><link rel="stylesheet" href="/assets/app.css"><script src="https://elsewhere.test/track.js"></script>';
await check('Offline audit inventories only bounded same-origin startup assets', () => { const urls=offline.creatorDrawingDependencyUrls(html,'https://example.test'); assert.equal(urls.length,5); assert.ok(urls.includes('/i18n/studio/ko.json')); assert.ok(!urls.some(url=>url.includes('elsewhere'))); assert.equal(offline.creatorDrawingDependencyUrls('<html/>','https://example.test'),null); assert.equal(offline.creatorDrawingDependencyUrls('x'.repeat(1_000_001),'https://example.test'),null); });
await check('Offline audit cannot grow past its asset budget', () => { assert.equal(offline.creatorDrawingDependencyUrls(Array.from({length:130},(_,i)=>`<script src="/assets/${i}.js"></script>`).join(''),'https://example.test'),null); });
function offlineEnvironment(missing='') {
  let reads=0;
  const window={isSecureContext:true,location:{origin:'https://example.test'},caches:{match:async input=>{
    reads++; const path=new URL(String(input)).pathname;
    if(path==='/studio') return new Response(html,{headers:{'content-type':'text/html','cross-origin-opener-policy':'same-origin','cross-origin-embedder-policy':'credentialless'}});
    if(path===missing) return new Response('<html/>',{headers:{'content-type':'text/html'}});
    return new Response(path.endsWith('.json')?'{}':'export {};',{headers:{'content-type':path.endsWith('.json')?'application/json':path.endsWith('.css')?'text/css':'text/javascript'}});
  }}};
  return {window,navigator:{onLine:true,serviceWorker:{controller:{}}},reads:()=>reads};
}
await check('HTML fallbacks are not accepted as cached editor JavaScript', async()=>{const env=offlineEnvironment('/assets/editor.js');const api=load(offlinePath,{},env);const result=await api.inspectCreatorDrawingDependencies();assert.equal(result.status,'missing');assert.equal(result.missing[0],'/assets/editor.js');});
await check('Cached dependencies do not claim saved-project readiness',async()=>{const env=offlineEnvironment();const api=load(offlinePath,{},env);const result=await api.inspectCreatorDrawingDependencies();assert.equal(result.status,'cached');assert.equal(result.checked,5);assert.equal('projectReady' in result,false);});
await check('Denied browser APIs settle as unknown without writes',async()=>{const navigator={onLine:false};Object.defineProperty(navigator,'storage',{get(){throw new Error('blocked');}});Object.defineProperty(navigator,'serviceWorker',{get(){throw new Error('blocked');}});const api=load(offlinePath,{}, {window:{isSecureContext:true,location:{origin:'https://example.test'}},navigator});const snapshot=await api.inspectCreatorOfflineReadiness();assert.equal(snapshot.persisted,null);assert.equal(snapshot.controlled,false);assert.equal(snapshot.shellCached,null);});
await check('Storage pressure distinguishes unknown, normal and low space',()=>{assert.equal(offline.creatorStoragePressure(null,100),'unknown');assert.equal(offline.creatorStoragePressure(100*1024**2,1024**3),'normal');assert.equal(offline.creatorStoragePressure(900*1024**2,1024**3),'low');assert.equal(offline.creatorStoragePressure(NaN,100),'unknown');});
await check('Stalled storage operation has a deadline',async()=>assert.equal(await offline.boundedStorageRead(new Promise(()=>{}),null),null));
const ai=load('apps/web/src/domains/creator/ai/studio-3d-generation-client.ts');
const job={id:'job-1',state:'generating-geometry',generation:2,estimatedCredits:1,createdAtMs:1,updatedAtMs:2,deadlineAtMs:100,request:{mode:'text-to-3d',provider:'hyper3d-rodin',model:'Rodin Gen-2.5',tier:'Gen-2.5-Medium',transport:'server'}};
const json=(payload,status=200,headers={})=>new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json',...headers}});
await check('Authenticated idempotent API contract remains compatible',async()=>{let call;const client=new ai.Studio3dGenerationHttpClient({userId:'user-1',providerApiKey:()=> 'session-only-key',fetchImpl:async(url,init)=>{call={url,init};return json(job);}});await client.create({mode:'text-to-3d',prompt:'a chair'},'request-1');assert.equal(new Headers(call.init.headers).get('Idempotency-Key'),'request-1');assert.ok(!call.init.body.includes('session-only-key'));assert.equal(call.init.credentials,'include');});
await check('Ready without artifact metadata cannot masquerade as success',()=>assert.throws(()=>ai.validateStudio3dGenerationJob({...job,state:'ready'})));
await check('Invalid job state and non-finite credits are rejected',()=>{assert.throws(()=>ai.validateStudio3dGenerationJob({...job,state:'done'}));assert.throws(()=>ai.validateStudio3dGenerationJob({...job,estimatedCredits:NaN}));});
await check('HTML upstream failures become readable errors, not JSON syntax leaks',async()=>{const client=new ai.Studio3dGenerationHttpClient({userId:'user-1',fetchImpl:async()=>new Response('<html>proxy error</html>',{status:502})});await assert.rejects(()=>client.list(),e=>e.status===502&&!e.message.includes('<html>'));});
await check('Successful malformed JSON is also rejected',async()=>{const client=new ai.Studio3dGenerationHttpClient({userId:'user-1',fetchImpl:async()=>new Response('<html/>')});await assert.rejects(()=>client.status());});
await check('Rate limits retain HTTP status and bounded retry guidance',async()=>{const client=new ai.Studio3dGenerationHttpClient({userId:'user-1',fetchImpl:async()=>json({message:'credit budget exceeded'},429,{'retry-after':'12'})});await assert.rejects(()=>client.list(),e=>e.status===429&&e.retryAfterMs===12000&&e.message==='credit budget exceeded');});
const bytes=new TextEncoder().encode('known artifact bytes');
const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
const revision={id:'revision-1',modelId:'model-1',contentHashSha256:hash,byteLength:bytes.length,mimeType:'application/octet-stream',createdAtMs:3,sourceJobId:'job-1'};
await check('Known artifact SHA-256 and byte length are verified before insertion',async()=>{const client=new ai.Studio3dGenerationHttpClient({userId:'user-1',fetchImpl:async url=>String(url).includes('/artifacts/')?new Response(bytes):json({...job,state:'ready',artifactRevision:revision})});await client.get('job-1');assert.equal((await client.downloadArtifact('revision-1')).size,bytes.length);});
await check('Corrupted artifact with the right length is rejected',async()=>{const corrupted=bytes.slice();corrupted[0]^=1;const client=new ai.Studio3dGenerationHttpClient({userId:'user-1',fetchImpl:async url=>String(url).includes('/artifacts/')?new Response(corrupted):json({...job,state:'ready',artifactRevision:revision})});await client.get('job-1');await assert.rejects(()=>client.downloadArtifact('revision-1'),/검증/u);});
await check('Consumer mutation cannot replace the expected artifact checksum',async()=>{const client=new ai.Studio3dGenerationHttpClient({userId:'user-1',fetchImpl:async url=>String(url).includes('/artifacts/')?new Response(bytes):json({...job,state:'ready',artifactRevision:revision})});const loaded=await client.get('job-1');loaded.artifactRevision.contentHashSha256='0'.repeat(64);assert.equal((await client.downloadArtifact('revision-1')).size,bytes.length);});
await check('Streaming JSON budget is enforced without trusting Content-Length',async()=>{const client=new ai.Studio3dGenerationHttpClient({userId:'user-1',fetchImpl:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(4*1024*1024+1));controller.close();}}))});await assert.rejects(()=>client.status(),/크기/u);});
await check('File encoding rejects invalid budgets and honors cancellation',async()=>{const file=new File([new Uint8Array([1,2,3])],'a.png',{type:'image/png'});const input=await ai.studioFileToGenerationInput(file,100);assert.equal(input.dataBase64,'AQID');await assert.rejects(()=>ai.studioFileToGenerationInput(file,NaN));await assert.rejects(()=>ai.studioFileToGenerationInput(file,2));const controller=new AbortController();controller.abort();await assert.rejects(()=>ai.studioFileToGenerationInput(file,100,undefined,controller.signal),e=>e.name==='AbortError');});
// Wiring checks below are static only, not a browser/device success claim.
await check('Actual search forms accept one-character nouns and guard Korean IME Enter',()=>{for(const path of ['apps/web/src/domains/marketing/CreatorReferenceSearch.tsx','apps/web/src/domains/creator-resources/ReferenceAssetDiscovery.tsx']){const src=readFileSync(resolve(root,path),'utf8');assert.match(src,/isComposing/u);assert.doesNotMatch(src,/minLength=\{2\}/u);}});
await check('Simple mode keeps its escape route and locked-zoom controls',()=>{const src=readFileSync(resolve(root,'apps/web/src/domains/creator/canvas/StudioCanvasStageHud.tsx'),'utf8');assert.match(src,/showDetails \|\| zoomLocked/u);assert.match(src,/setStudioUiDensity\(mode\)/u);assert.match(src,/<span[^>]*>\{studioUiDensityLabel\(mode, t\)\}<\/span>/u);});
await check('XR timeout never automatically requests a session or bypasses known denial',()=>{const src=readFileSync(resolve(root,'apps/web/src/domains/creator/bg3d/StudioBg3dImmersivePanel.tsx'),'utf8');assert.match(src,/setTimeout\(\(\) => setSlowProbe\(true\), 5000\)/u);assert.match(src,/blockingProbe \|\| transitionActive \|\| sessionActive/u);assert.match(src,/if \(!arDisabled\) invokeControlledAction/u);});
await check('3D-to-AI guidance separates composition, identity and style roles',()=>{const src=readFileSync(resolve(root,'apps/web/src/domains/creator/scene-3d/studio-3d-ai-reference-application.ts'),'utf8');assert.match(src,/Subject/u);assert.match(src,/Style/u);assert.match(src,/와이어프레임/u);assert.doesNotMatch(src,/!existing\s*&&/u);});
const changedSources=[
  'packages/core/src/reference-query-language.ts',
  'apps/web/src/shared/lib/reference-assets.ts',
  'apps/web/src/domains/creator-resources/ReferenceAssetDiscovery.tsx',
  'apps/web/src/domains/creator/promo/promo-model.ts',
  'apps/web/src/domains/creator/ai/studio-3d-generation-client.ts',
  'apps/web/src/domains/creator/bg3d/StudioBg3dImmersivePanel.tsx',
  'apps/web/src/domains/creator/canvas/StudioCanvasStageHud.tsx',
  'apps/web/src/domains/creator/scene-3d/studio-3d-ai-reference-application.ts',
  'apps/web/src/domains/marketing/CreatorReferenceSearch.tsx',
  'apps/web/src/domains/marketing/CreatorWorkspaceReadiness.tsx',
  'apps/web/src/domains/marketing/creator-offline-readiness.ts',
];
await check('All changed TypeScript and TSX parse successfully',()=>{for(const path of changedSources){const src=readFileSync(resolve(root,path),'utf8');const result=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX},fileName:path,reportDiagnostics:true});assert.equal(result.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,path);}});
console.log(JSON.stringify({status:'passed',count:checks.length,checks,scope:'Runtime contracts for bilingual search, promo, offline cache inspection and AI transport; static UI wiring/syntax checks. Full app typecheck, actual React/browser/device rendering and live AI inference remain separate gates.'},null,2));
