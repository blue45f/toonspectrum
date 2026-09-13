import { MAX_PANELS, MAX_BYTES, validateStory, makeStory, normalizedImage } from './story.js';
import { SpatialRenderer } from './renderer.js';
const $=id=>document.getElementById(id);
let initialized=false,story=makeStory(),index=0,renderer=null,mode='flat',timer=0,auto=false,busy=false,saveTimer=0,db=null,epoch=0,dirty=false,saveChain=Promise.resolve();
function error(e){$('error').textContent=e instanceof Error?e.message:String(e);$('error').hidden=false;}
$('error').onclick=()=>{$('error').hidden=true;};
function status(message){$('status').textContent=message;}
async function database(){if(db)return db;return new Promise((resolve,reject)=>{const r=indexedDB.open('toonstudio-spatial-reader-v1',1);const t=setTimeout(()=>reject(new Error('로컬 저장소를 사용할 수 없습니다. 챕터 파일로 저장하세요.')),4000);r.onupgradeneeded=()=>r.result.createObjectStore('chapters');r.onerror=()=>{clearTimeout(t);reject(r.error);};r.onblocked=()=>{clearTimeout(t);reject(new Error('다른 탭이 저장소를 사용 중입니다.'));};r.onsuccess=()=>{clearTimeout(t);db=r.result;db.onversionchange=()=>{db.close();db=null;};resolve(db);};});}
async function readSaved(){const databaseValue=await database();return new Promise((resolve,reject)=>{const req=databaseValue.transaction('chapters').objectStore('chapters').get('last');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function persist(){
  if(!story.panels.length)return;dirty=true;const revision=++epoch;clearTimeout(saveTimer);$('save-status').textContent='로컬 저장 대기 중…';
  const snapshot=structuredClone(story);
  saveTimer=setTimeout(()=>{saveChain=saveChain.catch(()=>undefined).then(async()=>{
    const databaseValue=await database();await new Promise((resolve,reject)=>{const tx=databaseValue.transaction('chapters','readwrite');tx.objectStore('chapters').put(snapshot,snapshot.id);tx.objectStore('chapters').put(snapshot,'last');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error??new Error('저장 실패'));tx.onerror=()=>{};});
    void listSaved();if(revision===epoch){dirty=false;$('save-status').textContent='이 기기에 저장됨 · 원본 파일과 챕터 백업도 보관하세요.';}
  }).catch(e=>{$('save-status').textContent='저장 실패 · 챕터 파일로 보관하세요.';error(e);});},300);
}
function remember(key,value){try{localStorage.setItem('toonspace:'+story.id+':'+key,String(value));return true;}catch{status('책갈피를 저장하지 못했습니다.');return false;}}
function remembered(key){try{return Number(localStorage.getItem('toonspace:'+story.id+':'+key)??0);}catch{return 0;}}
function scheduleAuto(){clearTimeout(timer);if(auto&&story.panels.length&&!document.hidden)timer=setTimeout(()=>{if(index>=story.panels.length-1){auto=false;$('auto').setAttribute('aria-pressed','false');status('마지막 컷입니다.');}else{void go(index+1);}},story.panels[index].seconds*1000);}
function ensureRenderer(){if(!renderer)renderer=new SpatialRenderer($('scene'),action=>{void go(index+(action==='next'?1:-1));},status);return renderer;}
async function show(){
  const panel=story.panels[index];$('position').textContent=`${panel?index+1:0} / ${story.panels.length}`;$('prev').disabled=!panel||index===0;$('next').disabled=!panel||index===story.panels.length-1;$('panel-edit').disabled=!panel;
  $('empty').hidden=!!panel;$('caption').value=panel?.caption??'';$('seconds').value=String(panel?.seconds??6);$('spoken-caption').textContent=panel?.caption??'';
  $('flat-page').replaceChildren();
  if(panel){const wrap=document.createElement('div');wrap.className='panel';for(const[layerIndex,layer]of panel.layers.entries()){const img=new Image();img.src=layer.image;img.alt=layerIndex===0?panel.caption||`컷 ${index+1}`:'';if(layerIndex){img.className='foreground';img.style.transform=`translate(${layer.x*100}%,${-layer.y*100}%) scale(${layer.scale})`;}wrap.append(img);}$('flat-page').append(wrap);}
  document.querySelectorAll('[data-panel]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.panel)===index)));
  if(panel&&(mode==='spatial'||renderer?.session)){try{await ensureRenderer().setPanels(story.panels,index);}catch(e){error(e);setMode('flat');}}
  remember('progress',index);scheduleAuto();document.documentElement.dataset.spatialReaderReady='true';
}
function list(){
  $('title').value=story.title;$('chapters').replaceChildren();story.panels.forEach((panel,i)=>{const li=document.createElement('li'),b=document.createElement('button'),image=new Image();image.src=panel.layers[0].image;image.alt='';b.dataset.panel=String(i);b.append(image,document.createTextNode(`${i+1}. ${panel.caption.slice(0,32)||'컷'}`));b.onclick=()=>{void go(i);};li.append(b);$('chapters').append(li);});
}
async function go(next){index=Math.max(0,Math.min(story.panels.length-1,Number.isFinite(next)?Math.trunc(next):0));await show();}
function setMode(next){mode=next;$('flat-page').hidden=next!=='flat';$('scene').hidden=next!=='spatial';$('flat').setAttribute('aria-pressed',String(next==='flat'));$('spatial').setAttribute('aria-pressed',String(next==='spatial'));if(next==='flat')void renderer?.end();void show();}
async function edit(operation){if(busy||!initialized)return;busy=true;try{const next=structuredClone(story);await operation(next);story=validateStory(next);index=Math.min(index,story.panels.length-1);list();await show();persist();}catch(e){error(e);}finally{busy=false;}}
$('images').onchange=async event=>{const files=[...event.target.files];event.target.value='';if(!files.length)return;await edit(async next=>{if(next.panels.length+files.length>MAX_PANELS)throw new Error('최대 40컷입니다.');for(const file of files){const image=await normalizedImage(file);next.panels.push({id:crypto.randomUUID(),caption:file.name.replace(/\.[^.]+$/,''),seconds:6,aspect:image.aspect,layers:[{image:image.image,depth:0,x:0,y:0,scale:1}]});}});};
$('foreground').onchange=async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;await edit(async next=>{const p=next.panels[index];if(p.layers.length>=4)throw new Error('컷당 최대 4개 레이어입니다.');const image=await normalizedImage(file);p.layers.push({image:image.image,depth:.15,x:0,y:0,scale:1});});};
$('open').onchange=async event=>{const file=event.target.files[0];event.target.value='';if(!file||busy||!initialized)return;busy=true;try{if(file.size>MAX_BYTES)throw new Error('챕터 파일은 48MB 이하만 지원합니다.');const next=validateStory(JSON.parse(await file.text()));await validateImages(next);if(dirty&&!confirm('저장하지 않은 변경이 있습니다. 현재 챕터 파일을 저장하지 않고 다른 챕터를 열까요?'))return;next.id=crypto.randomUUID();story=next;index=0;list();await show();persist();}catch(e){error(e);}finally{busy=false;}};
$('export').onclick=()=>{try{const value=validateStory(story),url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=story.title.replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,80)+'.toonspace';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){error(e);}};
$('title').onchange=()=>{if(!initialized)return;story.title=$('title').value.slice(0,150)||'나의 공간형 웹툰';persist();};
$('caption').onchange=()=>edit(next=>{next.panels[index].caption=$('caption').value;});
$('seconds').onchange=()=>edit(next=>{next.panels[index].seconds=Number($('seconds').value);});
$('depth').onchange=()=>edit(next=>{const layers=next.panels[index].layers;if(layers.length<2)throw new Error('먼저 전경 레이어를 추가하세요.');layers.at(-1).depth=Number($('depth').value)/100;});
$('remove-layer').onclick=()=>edit(next=>{if(next.panels[index].layers.length>1)next.panels[index].layers.pop();});
for(const[id,delta]of[['up',-1],['down',1]])$(id).onclick=()=>edit(next=>{const target=index+delta;if(target<0||target>=next.panels.length)return;[next.panels[index],next.panels[target]]=[next.panels[target],next.panels[index]];index=target;});
$('remove').onclick=()=>edit(next=>{if(next.panels.length===1)throw new Error('챕터에는 최소 한 컷이 필요합니다.');next.panels.splice(index,1);});
$('prev').onclick=()=>{void go(index-1);};$('next').onclick=()=>{void go(index+1);};$('flat').onclick=()=>setMode('flat');$('spatial').onclick=()=>setMode('spatial');
$('auto').onclick=()=>{auto=!auto;$('auto').setAttribute('aria-pressed',String(auto));scheduleAuto();};$('bookmark').onclick=()=>{if(remember('bookmark',index))status(`${index+1}컷에 책갈피를 보관했습니다.`);};$('resume').onclick=()=>{void go(remembered('bookmark'));};
$('recenter').onclick=()=>{if(renderer){renderer.recenter=true;renderer.pan=0;renderer.drawDesktop();}};
for(const[id,type]of[['vr','immersive-vr'],['ar','immersive-ar']])$(id).onclick=()=>{
  try{const r=ensureRenderer();if(!r.panels.length){setMode('spatial');status('공간 화면을 준비하고 있습니다. 준비된 뒤 입장 버튼을 다시 눌러 주세요.');return;}void r.start(type).catch(error);}catch(e){error(e);}
};
$('exit-xr').onclick=()=>{void renderer?.end();};
$('xr-overlay').addEventListener('beforexrselect',event=>event.preventDefault());
window.addEventListener('keydown',event=>{if(event.isComposing||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;if(event.key==='ArrowRight'){event.preventDefault();void go(index+1);}if(event.key==='ArrowLeft'){event.preventDefault();void go(index-1);}if(event.key==='Escape'){auto=false;scheduleAuto();$('auto').setAttribute('aria-pressed','false');void renderer?.end();}});
window.addEventListener('resize',()=>renderer?.drawDesktop());document.addEventListener('visibilitychange',()=>{scheduleAuto();if(!document.hidden)renderer?.drawDesktop();});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});window.addEventListener('pagehide',()=>{clearTimeout(timer);renderer?.dispose();renderer=null;});window.addEventListener('pageshow',event=>{if(event.persisted)void show();});
(async()=>{try{const saved=await readSaved();if(saved){story=validateStory(saved);index=Math.max(0,Math.min(story.panels.length-1,remembered('progress')));story.id=crypto.randomUUID();$('save-status').textContent='이 기기의 마지막 챕터를 복구했습니다.';}else $('save-status').textContent='컷을 추가해 감상을 시작하세요.';}catch(e){error(e);$('save-status').textContent='자동 저장을 사용할 수 없습니다. 챕터 파일을 보관하세요.';}initialized=true;list();await show();await listSaved();})().catch(error);

async function validateImages(chapter){
  for(const source of new Set(chapter.panels.flatMap(p=>p.layers.map(l=>l.image)))){
    const image=new Image();image.src=source;
    try{await image.decode();if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth>2048||image.naturalHeight>2048)throw new Error('invalid dimensions');}
    catch{throw new Error('챕터 이미지가 손상되었거나 2048px 제한을 초과했습니다. 원본 컷을 다시 추가하세요.');}
  }
}
async function listSaved(){
  try{const d=await database();const values=await new Promise((resolve,reject)=>{const rows=[],r=d.transaction('chapters').objectStore('chapters').openCursor();r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c){resolve(rows);return;}if(c.key!=='last')rows.push({id:c.key,title:c.value.title});c.continue();};});
    const select=$('saved');select.replaceChildren(new Option('이 기기에 보관한 챕터', ''));for(const row of values)select.append(new Option(row.title,row.id));
  }catch{/* Autosave status reports database failure; drawing/reading remain usable. */}
}
$('saved').onchange=async event=>{
  const id=event.target.value;event.target.value='';if(!id||busy||!initialized)return;
  busy=true;try{const d=await database();const saved=await new Promise((resolve,reject)=>{const r=d.transaction('chapters').objectStore('chapters').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    const next=validateStory(saved);await validateImages(next);if(dirty&&!confirm('저장되지 않은 변경을 두고 보관한 챕터를 열까요?'))return;
    next.id=crypto.randomUUID();story=next;index=0;list();await show();persist();
  }catch(e){error(e);}finally{busy=false;}
};
