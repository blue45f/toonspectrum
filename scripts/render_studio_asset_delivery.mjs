#!/usr/bin/env node
/** Actual Three.js load/render evidence. This is not an artistic-approval assertion. */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const output = path.resolve(process.argv[2] ?? '');
const tools = path.resolve(process.argv[3] ?? '');
if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: renderer OUTPUT ISOLATED_TOOLS_DIRECTORY');
const requireTools = createRequire(path.join(tools, 'package.json'));
const { chromium } = requireTools('playwright');
const threeRoot = path.dirname(path.dirname(requireTools.resolve('three')));
const manifestPath = path.join(output, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const modelAssets = manifest.assets.filter(asset => asset.kind === 'model');
if (modelAssets.length > 1600) throw new Error('Batch exceeds reviewed rendering budget');
const previewRoot = path.join(output, 'previews');
await mkdir(previewRoot, { recursive: true });
const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script><style>body{margin:0}canvas{display:block}</style></head><body><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setSize(384,384); renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff,0x646479,2.6));
const key = new THREE.DirectionalLight(0xffffff,3.2); key.position.set(4,7,5);scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff,1.1); fill.position.set(-4,2,-3);scene.add(fill);
const camera = new THREE.PerspectiveCamera(38,1,0.01,100);
const loader = new GLTFLoader();
function dispose(root) {
 const geometries=new Set(), materials=new Set(), textures=new Set();
 root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){materials.add(material);for(const value of Object.values(material)){if(value?.isTexture)textures.add(value);}}});
 for(const texture of textures){texture.source?.data?.close?.();texture.dispose();}
 for(const material of materials)material.dispose();
 for(const geometry of geometries)geometry.dispose();
 root.removeFromParent();renderer.renderLists.dispose();
}
window.renderAsset=async(url)=>{
 let root, group;
 try{
  const gltf=await loader.loadAsync(url); root=gltf.scene;
  root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root,true), size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
  if(box.isEmpty()||![...size.toArray(),...center.toArray()].every(Number.isFinite)||Math.max(...size.toArray())<=0)throw new Error('Non-finite or empty visible bounds');
  const sourceBounds=size.toArray();
  const fitScale=2/Math.max(...sourceBounds);
  group=new THREE.Group();group.add(root);group.scale.setScalar(fitScale);group.position.copy(center).multiplyScalar(-fitScale);scene.add(group);
  const views=[];let preview;
  for(let i=0;i<3;i++){
   const angle=Math.PI/4+i*2*Math.PI/3;
   camera.position.set(4.2*Math.sin(angle),2.9,4.2*Math.cos(angle));camera.lookAt(0,0,0);camera.updateMatrixWorld();
   renderer.render(scene,camera);
   const gl=renderer.getContext();if(gl.isContextLost())throw new Error('WebGL context lost');
   const pixels=new Uint8Array(384*384*4);gl.readPixels(0,0,384,384,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   let visiblePixels=0;for(let p=3;p<pixels.length;p+=4)if(pixels[p]>16)visiblePixels++;
   if(visiblePixels<30)throw new Error('Empty rendered view '+i);
   views.push({view:i,visiblePixels,triangles:renderer.info.render.triangles});
   if(i===0)preview=renderer.domElement.toDataURL('image/png');
  }
  return {sourceBounds,fitScale,views,preview,renderer:'Three.js '+THREE.REVISION};
 } finally {if(root)dispose(root);if(group)group.removeFromParent();}
};
window.rendererReady=true;
</script></body></html>`;

const mime = {'.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server = createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (requestPath === '/') { response.writeHead(200, {'Content-Type':'text/html'}); response.end(pageHtml); return; }
    const vendor = requestPath.startsWith('/three/');
    const root = vendor ? threeRoot : output;
    const file = path.resolve(root, '.' + (vendor ? requestPath.slice('/three'.length) : requestPath));
    if (!file.startsWith(root + path.sep) || !(await stat(file)).isFile()) throw new Error('Not found');
    response.writeHead(200, {'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream'});
    createReadStream(file).pipe(response);
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let browser;
const evidence = [], failed = [];
try {
  browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const context = await browser.newContext({viewport:{width:384,height:384},deviceScaleFactor:1});
  await context.route('**/*', route => route.request().url().startsWith(baseUrl + '/') ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.rendererReady, undefined, {timeout:30000});
  for (const [index, asset] of modelAssets.entries()) {
    try {
      const result = await page.evaluate(url => window.renderAsset(url), baseUrl + '/' + asset.path);
      const {preview, ...metrics} = result;
      const previewPath = `previews/${asset.id}.png`;
      await writeFile(path.join(output, previewPath), Buffer.from(preview.split(',')[1], 'base64'));
      Object.assign(asset, {previewPath, browserRenderVerified:true, sourceBounds:metrics.sourceBounds, previewFitScale:metrics.fitScale});
      asset.technicalChecks.push('Three.js-load', 'three-angle-nonempty-render', 'GPU-resource-disposal');
      evidence.push({id:asset.id, ...metrics});
    } catch(error) {
      failed.push({id:asset.id,reason:String(error).slice(0,500)});
      await unlink(path.join(output,asset.path));
    }
    if ((index+1)%50===0) console.log(`RENDERED ${index+1}/${modelAssets.length}, rejected ${failed.length}`);
  }
  const failedIds = new Set(failed.map(item=>item.id));
  manifest.assets = manifest.assets.filter(asset=>!failedIds.has(asset.id));
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  const reportPath=path.join(output,'delivery-report.json');
  const report=JSON.parse(await readFile(reportPath,'utf8'));
  report.deliveredOriginals=manifest.assets.length;
  report.byKind=Object.fromEntries([...new Set(manifest.assets.map(a=>a.kind))].map(kind=>[kind,manifest.assets.filter(a=>a.kind===kind).length]));
  report.byCategory=Object.fromEntries([...new Set(manifest.assets.map(a=>a.category))].map(category=>[category,manifest.assets.filter(a=>a.category===category).length]));
  report.browserRenderedModels=evidence.length;
  report.browserRejectedModels=failed.length;
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  await writeFile(path.join(output,'browser-render-evidence.json'),JSON.stringify({rendered:evidence,failed,artisticApproval:false,studioRoundTripVerified:false},null,2)+'\n');
  console.log('BROWSER RENDER SUMMARY',JSON.stringify({passed:evidence.length,failed:failed.length,failedExamples:failed.slice(0,10)}));
  if(evidence.length===0)throw new Error('No models passed actual rendering');
} finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
