/** Real browser + actual built service worker. Requires pnpm build and installed Playwright Chromium.
 * Run: node scripts/verify-local-first-browser.mjs
 * This script is a release gate, not a claim that it was executed successfully in the authoring environment.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const dist=resolve(process.env.LOCAL_FIRST_DIST || 'dist');
const evidence=resolve('artifacts/local-first/browser');mkdirSync(evidence,{recursive:true});
for(const path of ['sw.js','offline-drawing.html','index.html'])assert.ok(existsSync(join(dist,path)),`Missing ${path}; run pnpm build first`);
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
let outage=false;let apiRequests=0;const results=[];let browser;
const server=createServer((request,response)=>{void(async()=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){apiRequests++;response.writeHead(503);response.end('API disabled for offline test');return;}
  if(outage&&pathname.startsWith('/studio')){response.writeHead(503,{'Content-Type':'text/html'});response.end('<h1>Controlled origin outage</h1>');return;}
  let path=resolve(dist,`.${decodeURIComponent(pathname)}`);
  if(path!==dist&&!path.startsWith(dist+sep)){response.writeHead(403);response.end();return;}
  const info=await stat(path).catch(()=>null);
  if(!info?.isFile())path=join(dist,'index.html');
  response.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store','Cross-Origin-Resource-Policy':'cross-origin',...(pathname.startsWith('/studio')?{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}:{})});
  createReadStream(path).on('error',()=>response.destroy()).pipe(response);
})().catch(()=>{response.writeHead(500);response.end('Fixture server error');});});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const saved=page=>page.waitForFunction(()=>document.getElementById('status').textContent.includes('저장 완료'));
async function ink(page){return page.locator('#canvas').evaluate(canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<240)count++;return count;});}
async function stroke(page){const box=await page.locator('#canvas').boundingBox();assert.ok(box);await page.mouse.move(box.x+box.width*.25,box.y+box.height*.25);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.65,{steps:20});await page.mouse.up();await saved(page);}
async function check(name,fn){await fn();results.push({name,passed:true});}
try{
  browser=await chromium.launch();const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:960}});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`${origin}/offline-drawing.html`);
  await page.waitForFunction(()=>document.getElementById('readiness').textContent.includes('준비 완료'),{},{timeout:30000});
  await check('real active service worker confirms all rescue files cached',async()=>assert.ok(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller))));
  let originalInk;
  await check('pen produces pixels and autosave commits',async()=>{await stroke(page);originalInk=await ink(page);assert.ok(originalInk>500);});
  await check('network-offline reload restores identical drawing',async()=>{await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!document.getElementById('undo').disabled);assert.equal(await ink(page),originalInk);});
  await check('undo and redo preserve drawing offline',async()=>{await page.click('#undo');await page.waitForFunction(()=>document.getElementById('undo').disabled);assert.equal(await ink(page),0);await page.click('#redo');await saved(page);assert.equal(await ink(page),originalInk);});
  await check('origin 503 navigation opens independent drawing rescue',async()=>{await context.setOffline(false);outage=true;await page.goto(`${origin}/studio?document=unavailable`);await page.locator('h1').filter({hasText:'서버 없이'}).waitFor();await page.waitForFunction(()=>!document.getElementById('undo').disabled);assert.equal(await ink(page),originalInk);});
  await check('simultaneous real IDB transactions fork a stale revision',async()=>{const result=await page.evaluate(async()=>{const m=await import('/offline-drawing/model.js');const db=await m.openDrawingDatabase();const first=await m.saveDocument(db,m.newDocument(),0);const both=await Promise.all([m.saveDocument(db,{...first.document,title:'Tab A'},1),m.saveDocument(db,{...first.document,title:'Tab B'},1)]);const all=await m.listDocuments(db);db.close();return{distinct:both[0].document.id!==both[1].document.id,forks:both.filter(x=>x.forked).length,preserved:both.every(x=>all.some(y=>y.id===x.document.id))};});assert.deepEqual(result,{distinct:true,forks:1,preserved:true});});
  await check('malformed import leaves current artwork intact',async()=>{await page.locator('#import').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"format":"wrong"}')});await page.waitForFunction(()=>document.getElementById('status').dataset.error==='true');assert.equal(await ink(page),originalInk);});
  await check('portable HTML opens saved strokes in a new network-offline browser context',async()=>{const pending=page.waitForEvent('download');await page.click('#portable');const file=await pending;const path=join(evidence,'portable-test.html');await file.saveAs(path);const isolated=await browser.newContext();await isolated.setOffline(true);const local=await isolated.newPage();await local.goto(pathToFileURL(path).href);await local.waitForFunction(()=>!document.getElementById('undo').disabled);assert.equal(await ink(local),originalInk);await isolated.close();});
  await check('basic drawing performs zero API requests and has no page errors',async()=>{assert.equal(apiRequests,0);assert.deepEqual(errors,[]);});
  await page.screenshot({path:join(evidence,'offline-drawing.png'),fullPage:true});await context.close();
}catch(error){results.push({name:'browser release gate',passed:false,error:String(error)});process.exitCode=1;}
finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));writeFileSync(join(evidence,'results.json'),JSON.stringify({scope:'Actual browser, IndexedDB and built service worker; no GPU/PostgreSQL/XR hardware',results},null,2));}
console.log(JSON.stringify(results,null,2));
