#!/usr/bin/env node
/** Render genuine high-resolution derivatives. These are NOT independent originals. */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

if (process.argv.length !== 4) throw new Error('Usage: render-studio-premium-props.mjs STAGE TOOLS');
const stage = path.resolve(process.argv[2]);
const tools = createRequire(path.join(path.resolve(process.argv[3]), 'package.json'));
const { chromium } = tools('playwright');
const threeRoot = path.dirname(path.dirname(tools.resolve('three')));
const manifest = JSON.parse(await readFile(path.join(stage, 'manifest.json'), 'utf8'));
const models = manifest.assets.filter(asset => asset.kind === 'model' && asset.browserRenderVerified === true);
// One per use-case first, then a bounded second pass. Do not create rotation variants.
const selected = [], terms = new Set();
for (const model of models) {
  if (!terms.has(model.selectionTerm)) { selected.push(model); terms.add(model.selectionTerm); }
}
for (const model of models) if (selected.length < 48 && !selected.includes(model)) selected.push(model);
const candidates = selected.slice(0, 48);
const renderDir = path.join(stage, 'high-resolution-props');
await mkdir(renderDir, { recursive: true });
const html = `<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script><script type="module">
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const renderer = new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setSize(1536,1536); renderer.setPixelRatio(1);
renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1;
const scene=new T.Scene();
const pmrem=new T.PMREMGenerator(renderer), room=new RoomEnvironment();
const environment=pmrem.fromScene(room,0.04);
scene.environment=environment.texture;
room.dispose(); pmrem.dispose();
scene.add(new T.HemisphereLight(0xffffff,0x697787,1.3));
const key=new T.DirectionalLight(0xffffff,2.4);key.position.set(4,7,6);scene.add(key);
const rim=new T.DirectionalLight(0xffffff,1.2);rim.position.set(-4,3,-4);scene.add(rim);
const camera=new T.PerspectiveCamera(34,1,.01,100);
const loader=new GLTFLoader();
window.renderProp=async url=>{
 let root,group;
 try{
  root=(await loader.loadAsync(url)).scene; root.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(root,true),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
  if(box.isEmpty()||![...size.toArray(),...center.toArray()].every(Number.isFinite))throw new Error('Invalid model bounds');
  const longest=Math.max(...size.toArray());if(longest<=0)throw new Error('Empty model');
  const scale=2/longest;group=new T.Group();group.add(root);group.scale.setScalar(scale);group.position.copy(center).multiplyScalar(-scale);scene.add(group);
  camera.position.set(3.25,2.1,4.25);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  renderer.render(scene,camera);
  const gl=renderer.getContext();if(gl.isContextLost())throw new Error('Lost GPU context');
  const pixels=new Uint8Array(1536*1536*4);gl.readPixels(0,0,1536,1536,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let visible=0,border=0;
  for(let y=0;y<1536;y++)for(let x=0;x<1536;x++)if(pixels[(y*1536+x)*4+3]>16){visible++;if(x<4||y<4||x>=1532||y>=1532)border++;}
  if(visible<3000||border>0)throw new Error('Empty or clipped prop render');
  return {png:renderer.domElement.toDataURL('image/png'),visiblePixels:visible,width:1536,height:1536,renderer:'Three.js '+T.REVISION,triangles:renderer.info.render.triangles};
 }finally{
  if(root){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});for(const t of textures){t.source?.data?.close?.();t.dispose();}for(const m of materials)m.dispose();for(const g of geometries)g.dispose();}
  group?.removeFromParent();renderer.renderLists.dispose();
 }
};
window.ready=true;
</script>`;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(html); return; }
    const vendor = pathname.startsWith('/three/');
    const root = vendor ? threeRoot : stage;
    const file = path.resolve(root, '.' + (vendor ? pathname.slice(6) : pathname));
    if (!file.startsWith(root + path.sep) || !(await stat(file)).isFile()) throw new Error('Invalid resource');
    response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'model/gltf-binary' });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const rendered = [], rejected = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(base); await page.waitForFunction(() => window.ready, undefined, { timeout: 30000 });
  for (const model of candidates) {
    try {
      if (!/^assets\/[a-z0-9-]+\/[a-zA-Z0-9_.-]+\.glb$/u.test(model.path)) throw new Error('Unsafe model path');
      const result = await page.evaluate(url => window.renderProp(url), base + '/' + model.path);
      const { png, ...metrics } = result;
      const relative = `high-resolution-props/${model.id}.png`;
      await writeFile(path.join(stage, relative), Buffer.from(png.split(',')[1], 'base64'));
      rendered.push({ sourceId: model.id, sourceSha256: model.sha256, path: relative, ...metrics });
      console.log('HIGH RESOLUTION DERIVATIVE', model.id);
    } catch (error) { rejected.push({ sourceId: model.id, reason: String(error).slice(0, 500) }); }
  }
  await writeFile(path.join(stage, 'rendered-prop-candidates.json'), JSON.stringify({ rendered, rejected, independentOriginals: 0, artisticApproval: false }, null, 2) + '\n');
  if (!rendered.length) throw new Error('No high-resolution prop passed rendering');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
