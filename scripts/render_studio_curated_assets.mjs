#!/usr/bin/env node
/** Validate real files and capture three views; never substitutes for artistic review. */
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

if(!process.argv[2]||!process.argv[3])throw new Error('Usage: renderer OUTPUT REPOSITORY');
const output=await realpath(path.resolve(process.argv[2]));
const tools=await realpath(path.resolve(process.argv[3]));
const requireTools=createRequire(path.join(tools,'package.json'));
const {chromium}=requireTools('playwright');
const validator=requireTools('gltf-validator');
const threeRoot=path.dirname(path.dirname(requireTools.resolve('three')));
const manifestPath=path.join(output,'manifest.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
if(!Array.isArray(manifest.assets)||manifest.assets.length>2400)throw new Error('Invalid manifest budget');
await mkdir(path.join(output,'previews'),{recursive:true});
const pageHtml=`<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script><style>body{margin:0}canvas{display:block}</style><script type="module">
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setSize(512,512);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=0.85;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const pmrem=new THREE.PMREMGenerator(renderer), room=new RoomEnvironment();
const environment=pmrem.fromScene(room,0.04);scene.environment=environment.texture;scene.environmentIntensity=0.55;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xffffff,0x545968,0.7));
const key=new THREE.DirectionalLight(0xffffff,2.0);key.position.set(4,7,5);scene.add(key);
const fill=new THREE.DirectionalLight(0xffffff,0.35);fill.position.set(-4,2,-3);scene.add(fill);
const camera=new THREE.PerspectiveCamera(38,1,0.01,100);
const loader=new GLTFLoader(), textureLoader=new THREE.TextureLoader();
function dispose(root){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
 for(const texture of textures){texture.source?.data?.close?.();texture.dispose();}
 for(const material of materials)material.dispose();for(const geometry of geometries)geometry.dispose();
 root.removeFromParent();renderer.renderLists.dispose();
}
window.renderAsset=async(asset)=>{
 let root,group;const pendingTextures=[];
 try{
  if(asset.kind==='model')root=(await loader.loadAsync('/'+asset.path)).scene;
  else {
   const map=await textureLoader.loadAsync('/'+asset.path);pendingTextures.push(map);map.colorSpace=THREE.SRGBColorSpace;
   const normalMap=await textureLoader.loadAsync('/'+asset.pbrMaps.normal.path);pendingTextures.push(normalMap);
   const roughnessMap=await textureLoader.loadAsync('/'+asset.pbrMaps.roughness.path);pendingTextures.push(roughnessMap);
   root=new THREE.Mesh(new THREE.SphereGeometry(1,64,48),new THREE.MeshStandardMaterial({map,normalMap,roughnessMap,roughness:1,metalness:0}));
  }
  root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root,true);
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  if(box.isEmpty()||![...size.toArray(),...center.toArray()].every(Number.isFinite)||Math.max(...size.toArray())<=0)throw new Error('Empty or non-finite bounds');
  const fitScale=2/Math.max(...size.toArray());group=new THREE.Group();group.add(root);group.scale.setScalar(fitScale);group.position.copy(center).multiplyScalar(-fitScale);scene.add(group);
  const views=[];
  for(let i=0;i<3;i++){
   const angle=Math.PI/4+i*2*Math.PI/3;camera.position.set(4.4*Math.sin(angle),2.8,4.4*Math.cos(angle));camera.lookAt(0,0,0);camera.updateMatrixWorld();
   renderer.render(scene,camera);const gl=renderer.getContext();if(gl.isContextLost())throw new Error('WebGL context lost');
   const pixels=new Uint8Array(512*512*4);gl.readPixels(0,0,512,512,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   let visiblePixels=0,brightness=0,brightPixels=0;for(let p=0;p<pixels.length;p+=4){if(pixels[p+3]>16){visiblePixels++;brightness+=(pixels[p]+pixels[p+1]+pixels[p+2])/3;if(Math.min(pixels[p],pixels[p+1],pixels[p+2])>245)brightPixels++;}}
   if(visiblePixels<30)throw new Error('Empty rendered view '+i);
   views.push({view:i,visiblePixels,meanLuminance:brightness/visiblePixels,highlightFraction:brightPixels/visiblePixels,triangles:renderer.info.render.triangles,image:renderer.domElement.toDataURL('image/png')});
  }
  return {sourceBounds:size.toArray(),fitScale,views,renderer:'Three.js '+THREE.REVISION};
 }finally{if(root)dispose(root);else for(const texture of pendingTextures)texture.dispose();if(group)group.removeFromParent();}
};window.rendererReady=true;
</script>`;
const mime={'.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer(async(request,response)=>{
 try{
  const requestPath=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  if(requestPath==='/'){response.writeHead(200,{'Content-Type':'text/html'});response.end(pageHtml);return;}
  const vendor=requestPath.startsWith('/three/'),root=vendor?threeRoot:output;
  const resolved=await realpath(path.resolve(root,'.'+(vendor?requestPath.slice(6):requestPath)));
  if(!resolved.startsWith(root+path.sep)||!(await stat(resolved)).isFile()||!mime[path.extname(resolved)])throw new Error('Not found');
  response.writeHead(200,{'Content-Type':mime[path.extname(resolved)]});createReadStream(resolved).pipe(response);
 }catch{response.writeHead(404);response.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const baseUrl='http://127.0.0.1:'+server.address().port;
let browser;const evidence=[],failed=[];
try{
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:512,height:512},deviceScaleFactor:1});
 await context.route('**/*',route=>route.request().url().startsWith(baseUrl+'/')?route.continue():route.abort());
 const page=await context.newPage();await page.goto(baseUrl);await page.waitForFunction(()=>window.rendererReady,undefined,{timeout:30000});
 for(const [index,asset] of manifest.assets.entries()){
  if(asset.kind!=='model'&&!asset.pbrMaps)continue;
  try{
   let validation;
   if(asset.kind==='model'){
    const file=await realpath(path.resolve(output,asset.path));if(!file.startsWith(output+path.sep))throw new Error('Unsafe model path');
    const bytes=await readFile(file);if(bytes.length>48*1024*1024)throw new Error('Model exceeds render budget');
    validation=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:50,uri:asset.path,externalResourceFunction:()=>Promise.reject(new Error('External resource not permitted'))});
    if(validation.issues.numErrors>0)throw new Error('glTF validation failed: '+JSON.stringify(validation.issues.messages.filter(i=>i.severity===0).slice(0,4)));
   }
   const result=await page.evaluate(asset=>Promise.race([window.renderAsset(asset),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Asset rendering deadline')),30000))]),asset);
   const metrics=[];asset.reviewPaths=[];
   for(const view of result.views){
    const previewPath='previews/'+asset.id+'-view-'+view.view+'.png';
    await writeFile(path.join(output,previewPath),Buffer.from(view.image.split(',')[1],'base64'));
    asset.reviewPaths.push(previewPath);const {image,...rest}=view;metrics.push(rest);
   }
   asset.previewPath=asset.reviewPaths[0];asset.browserRenderVerified=true;
   asset.sourceBounds=result.sourceBounds;asset.previewFitScale=result.fitScale;
   asset.technicalChecks=[...new Set([...asset.technicalChecks,'neutral-light-three-view-render',...(asset.kind==='model'?['Khronos-glTF-validation-zero-errors']:[])])];
   evidence.push({id:asset.id,views:metrics,renderer:result.renderer,sourceBounds:result.sourceBounds,validatorWarnings:validation?.issues.numWarnings??0});
  }catch(error){
   failed.push({id:asset.id,reason:String(error).slice(0,1200)});
   await page.goto(baseUrl);await page.waitForFunction(()=>window.rendererReady,undefined,{timeout:30000});
  }
  if((index+1)%20===0)console.log('CURATED RENDER',index+1,'/',manifest.assets.length,'failed',failed.length);
 }
 const rejected=new Set(failed.map(item=>item.id));manifest.assets=manifest.assets.filter(asset=>!rejected.has(asset.id));
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 await writeFile(path.join(output,'curated-render-evidence.json'),JSON.stringify({rendered:evidence,failed,artisticApproval:false,studioSaveRestoreVerified:false},null,2)+'\n');
 const report=JSON.parse(await readFile(path.join(output,'delivery-report.json'),'utf8'));
 Object.assign(report,{deliveredOriginals:manifest.assets.length,browserRenderedModels:evidence.filter(e=>manifest.assets.find(a=>a.id===e.id)?.kind==='model').length,browserRenderedMaterials:evidence.filter(e=>manifest.assets.find(a=>a.id===e.id)?.kind==='surface-texture').length,renderFailures:failed});
 await writeFile(path.join(output,'delivery-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log('CURATED RENDER COMPLETE',JSON.stringify({rendered:evidence.length,failed,admitted:manifest.assets.length}));
 if(!evidence.length)throw new Error('No actual assets rendered');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
