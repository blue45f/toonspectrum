/** Offline review of already acquired glTF files; no network asset acquisition or art approval.
 * Usage: node review-studio-curated-models.mjs <asset-root> <new-output-directory>
 * Dependencies: three 0.184.0, playwright 1.62.1, gltf-validator 2.0.0-dev.3.10.
 * Every render is produced from the acquired geometry/materials, not a promotional image.
 */
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, readdir, realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import validator from 'gltf-validator';
const root=await realpath(process.argv[2]);
const output=path.resolve(process.argv[3]);
await mkdir(output,{recursive:false});
await mkdir(path.join(output,'renders'));
const threeRoot=path.dirname(path.dirname(fileURLToPath(import.meta.resolve('three'))));
const selected=new Set(['CommonTree_1','Pine_3','TwistedTree_2','DeadTree_1','Bush_Common_Flowers','Fern_1','Flower_3_Group','Mushroom_Common','Grass_Wispy_Tall','Rock_Medium_2','RockPath_Round_Wide','Plant_7_Big','Wall_Plaster_Window_Wide_Flat','Wall_UnevenBrick_Door_Round','Door_2_Round','WindowShutters_Wide_Round_Open','Stair_Interior_Rails','Stairs_Exterior_Straight','Roof_RoundTiles_4x4','Roof_Dormer_RoundTile','Prop_Wagon','Prop_Crate','Prop_Chimney','Balcony_Cross_Corner']);
async function within(base, relative){
  if(typeof relative!=='string'||relative.includes('\\')||relative.split('/').includes('..')||path.isAbsolute(relative))throw new Error('unsafe dependency path');
  const resolved=await realpath(path.join(base,relative));
  if(!resolved.startsWith(base+path.sep))throw new Error('dependency outside root');
  if((await stat(resolved)).size>128*1024*1024)throw new Error('file budget');
  return resolved;
}
async function walk(dir){
  const result=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw new Error('symlink not allowed');
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())result.push(...await walk(p));
    else if(entry.name.endsWith('.gltf'))result.push(p);
  }
  return result.sort();
}
const paths=await walk(root);
if(!paths.length||paths.length>1000)throw new Error('invalid model count');
const report={engine:'three@0.184.0',validator:'gltf-validator@2.0.0-dev.3.10',modelFiles:paths.length,records:[],failures:[],approvedOriginals:0,productionPublished:0,notice:'Structural validation and rendered review evidence, not final artistic approval or ToonStudio document round-trip verification.'};
const html=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#eef0f1}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script><script type="module">
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(768,768);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0xeef0f1);
scene.add(new THREE.HemisphereLight(0xffffff,0x8b8174,2.2));
const key=new THREE.DirectionalLight(0xfff4df,3.5);key.position.set(4,7,5);scene.add(key);
const fill=new THREE.DirectionalLight(0xe2efff,1.0);fill.position.set(-4,3,-3);scene.add(fill);
const camera=new THREE.PerspectiveCamera(32,1,0.01,1000);
let current;
function dispose(object){const geometries=new Set(),materials=new Set(),textures=new Set();object.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});for(const x of geometries)x.dispose();for(const x of textures)x.dispose();for(const x of materials)x.dispose();}
window.renderModel=async(url,angle)=>{
 if(current){scene.remove(current);dispose(current);current=null;}
 const gltf=await new GLTFLoader().loadAsync(url); current=gltf.scene;scene.add(current);current.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(current);if(bounds.isEmpty())throw new Error('empty model');
 const size=bounds.getSize(new THREE.Vector3()), center=bounds.getCenter(new THREE.Vector3());
 if(![...size,...center].every(Number.isFinite)||size.length()===0)throw new Error('invalid bounds');
 const radius=size.length()/2, distance=radius/Math.sin(THREE.MathUtils.degToRad(16))*1.13;
 const direction=new THREE.Vector3(Math.sin(angle),0.55,Math.cos(angle)).normalize();
 camera.position.copy(center).addScaledVector(direction,distance);camera.near=Math.max(0.001,distance-radius*2);camera.far=distance+radius*4+10;camera.lookAt(center);camera.updateProjectionMatrix();
 let triangles=0,meshes=0;const textureSizes=[];const seen=new Set();current.traverse(n=>{if(n.isMesh){meshes++;triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;for(const m of Array.isArray(n.material)?n.material:[n.material])for(const t of Object.values(m))if(t?.isTexture&&!seen.has(t.uuid)){seen.add(t.uuid);textureSizes.push([t.image?.width??0,t.image?.height??0]);}}});
 await renderer.compileAsync(scene,camera);renderer.render(scene,camera);await new Promise(requestAnimationFrame);renderer.render(scene,camera);
 return {bounds:size.toArray(),meshes,triangles,textureSizes,rendererMemory:{...renderer.info.memory},angle};
};
window.ready=true;
</script>`;
const mime={'.js':'text/javascript','.gltf':'model/gltf+json','.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
const server=createServer(async(req,res)=>{
 try{
   const u=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(u==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return;}
   let file;
   if(u.startsWith('/three/'))file=await within(threeRoot,u.slice(7));
   else if(u.startsWith('/assets/'))file=await within(root,u.slice(8));
   else {res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream'});res.end(await readFile(file));
 }catch{res.writeHead(400);res.end('invalid file');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:768,height:768},deviceScaleFactor:1});
page.setDefaultTimeout(60000);
const browserErrors=[];page.on('pageerror',e=>browserErrors.push(String(e)));
try{
 await page.goto(`http://127.0.0.1:${port}/`);await page.waitForFunction(()=>window.ready===true);
 for(let index=0;index<paths.length;index++){
   const file=paths[index], relative=path.relative(root,file).split(path.sep).join('/');
   const id=String(index+1).padStart(3,'0')+'-'+path.basename(file,'.gltf');
   try{
     const bytes=await readFile(file);
     const result=await validator.validateBytes(new Uint8Array(bytes),{uri:path.basename(file),maxIssues:500,externalResourceFunction:async uri=>new Uint8Array(await readFile(await within(path.dirname(file),decodeURIComponent(uri))))});
     const encoded=relative.split('/').map(encodeURIComponent).join('/');
     const angles=selected.has(path.basename(file,'.gltf'))?[0.68,-1.8,3.4]:[0.68];
     const renders=[];
     for(let a=0;a<angles.length;a++){
       const runtime=await page.evaluate(async({url,angle})=>window.renderModel(url,angle),{url:`http://127.0.0.1:${port}/assets/${encoded}`,angle:angles[a]});
       const preview=`renders/${id}-${a}.png`;
       await page.locator('canvas').screenshot({path:path.join(output,preview)});
       renders.push({preview,...runtime});
     }
     report.records.push({id,path:relative,sha256:createHash('sha256').update(bytes).digest('hex'),issues:result.issues,renders});
     console.log(index+1,paths.length,id,'errors',result.issues.numErrors,'warnings',result.issues.numWarnings);
   }catch(error){report.failures.push({path:relative,error:String(error)});console.error('MODEL FAILURE',relative,String(error));}
   await writeFile(path.join(output,'model-review.json'),JSON.stringify(report,null,2));
 }
}finally{
 report.browserErrors=browserErrors;
 await writeFile(path.join(output,'model-review.json'),JSON.stringify(report,null,2));
 await browser.close();await new Promise(resolve=>server.close(resolve));
}
if(report.failures.length||browserErrors.length||report.records.some(r=>r.issues.numErrors>0))process.exitCode=1;
