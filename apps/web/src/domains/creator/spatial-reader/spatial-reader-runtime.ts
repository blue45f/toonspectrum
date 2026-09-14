import { CanvasTexture, Color, DoubleSide, Group, LinearFilter, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Raycaster, RingGeometry, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, type Texture } from "three";
import { spatialCaptionPages as captionPages } from "./spatial-caption-pages";
import { nextSpatialPanel, visibleSpatialPanels, type SpatialBook } from "./spatial-book";
export interface SpatialReaderRuntime {
  focus(index: number): void;
  enter(mode: "immersive-vr" | "immersive-ar"): Promise<void>;
  exit(): Promise<void>;
  setScale(scale: number): void;
  destroy(): void;
}
function release(group: Group): void {
  group.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) { if (material instanceof MeshBasicMaterial) material.map?.dispose(); material.dispose(); } } });
  group.clear();
}
function label(text: string): CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 256;
  const context = canvas.getContext("2d"); if (!context) throw new Error("캔버스를 지원하지 않는 브라우저예요.");
  context.fillStyle = "#162435"; context.fillRect(0,0,1024,256); context.fillStyle = "#ffffff"; context.font = "32px system-ui";
  let line = "", y = 48;
  for (const character of Array.from(text)) { if (context.measureText(line+character).width > 960 || character === "\n") { context.fillText(line,32,y); line = ""; y += 43; if (y > 230) break; } if (character !== "\n") line += character; }
  if (y <= 230) context.fillText(line,32,y);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.generateMipmaps = false; texture.minFilter = LinearFilter; return texture;
}
async function rasterTexture(src: string): Promise<{ texture: Texture; aspect: number }> {
  const image = new Image();
  await new Promise<void>((resolve,reject) => { image.onload=()=>resolve(); image.onerror=()=>reject(new Error("컷 이미지를 읽지 못했어요.")); image.src=src; });
  if (image.width*image.height > 32_000_000) throw new Error("컷 이미지가 너무 커요.");
  const scale = Math.min(1,1024/Math.max(image.width,image.height)); const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext("2d");if(!context)throw new Error("이미지를 처리하지 못했어요.");context.drawImage(image,0,0,canvas.width,canvas.height);
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=LinearFilter;
  return {texture,aspect:image.width/image.height};
}
/** One scene owner. At most five base images and the focused cut's three depth layers are resident. */
export function createSpatialReader(element: HTMLElement, book: SpatialBook, initialIndex: number, onFocus: (index: number)=>void, onStatus: (message: string)=>void, onFatal: (message: string)=>void): SpatialReaderRuntime {
  const renderer=new WebGLRenderer({antialias:true,alpha:true,powerPreference:"low-power"});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.xr.enabled=true;
  renderer.domElement.style.width="100%";renderer.domElement.style.height="100%";renderer.domElement.style.touchAction="pan-y";
  element.replaceChildren(renderer.domElement);
  const scene=new Scene();scene.background=new Color(0x0b1420);
  const camera=new PerspectiveCamera(55,1,.02,100);camera.position.set(0,1.45,0);
  const root=new Group(),panels=new Group(),buttons=new Group();root.add(panels,buttons);scene.add(root);
  const reticle=new Mesh(new RingGeometry(.12,.15,32).rotateX(-Math.PI/2),new MeshBasicMaterial({color:0x7be1c3,side:DoubleSide}));reticle.visible=false;reticle.matrixAutoUpdate=false;scene.add(reticle);
  let index=nextSpatialPanel(initialIndex,0,book.panels.length),generation=0,disposed=false,entering=false,ar=false,placing=false;
  let session: XRSession|null=null,hitSource: XRHitTestSource|null=null;
  let targets: Mesh[]=[];let scale=1;let captionPage=0;
  const ray=new Raycaster(),rotation=new Matrix4(),direction=new Vector3(),position=new Vector3();
  const mesh=(texture:Texture,width:number,height:number)=>new Mesh(new PlaneGeometry(width,height),new MeshBasicMaterial({map:texture,side:DoubleSide,transparent:true,depthWrite:false}));
  function navigation() {
    release(buttons);
    for(const [name,delta,x] of [["← 이전",-1,-.75],["다음 →",1,.75]] as const){const button=mesh(label(name),.65,.18);button.position.set(x,.18,ar?.1:-2.8);button.userData.delta=delta;buttons.add(button);}
  }
  function focus(next:number) {
    if(disposed)return;const nextIndex=nextSpatialPanel(next,0,book.panels.length);if(nextIndex!==index)captionPage=0;index=nextIndex;const version=++generation;release(panels);targets=[];
    for(const slot of visibleSpatialPanels(index,book.panels.length)){
      const panel=book.panels[slot],delta=slot-index;const group=new Group();group.position.set(delta*2.25,1.45,(ar?0:-3)-Math.abs(delta)*.4);group.rotation.y=-delta*.1;panels.add(group);
      const pages=captionPages(panel.caption);const page=delta===0?captionPage%pages.length:0;
      const caption=mesh(label(`${slot+1}/${book.panels.length} · ${panel.title.replace(/\s+/gu," ").slice(0,12)} · 대사 ${page+1}/${pages.length}\n${pages[page]}`),1.9,.48);caption.position.y=-1.06;caption.userData.index=slot;if(delta===0&&pages.length>1)caption.userData.captionStep=1;group.add(caption);targets.push(caption);
      const add=async(src:string,depth:number)=>{
        const {texture,aspect}=await rasterTexture(src);
        if(disposed||version!==generation){texture.dispose();return;}
        const height=Math.min(1.65,1.95/aspect),width=height*aspect;const plane=mesh(texture,width,height);plane.position.z=depth;plane.userData.index=slot;group.add(plane);targets.push(plane);
      };
      void add(panel.src,0).catch(error=>{if(!disposed&&version===generation)onStatus(String(error));});
      if(delta===0)for(const layer of panel.layers)void add(layer.src,layer.depth).catch(error=>{if(!disposed&&version===generation)onStatus(String(error));});
    }
    navigation();if(captionPages(book.panels[index].caption).length>1){const button=mesh(label("대사 다음 쪽"),.65,.18);button.position.set(0,.18,ar?.1:-2.8);button.userData.captionStep=1;buttons.add(button);}
    onFocus(index);
  }
  function activate(object: Mesh|undefined) {
    if(!object)return;
    if(object.userData.captionStep===1){captionPage++;focus(index);}
    else if(typeof object.userData.index==="number")focus(object.userData.index);
    else if(typeof object.userData.delta==="number")focus(index+object.userData.delta);
  }
  function select(controller?: Group) {
    if(ar&&placing){if(reticle.visible){root.position.setFromMatrixPosition(reticle.matrix);root.visible=true;placing=false;reticle.visible=false;onStatus("웹툰을 배치했어요. 컨트롤러 또는 화면의 이전·다음 버튼으로 감상하세요.");}return;}
    if(controller){rotation.identity().extractRotation(controller.matrixWorld);position.setFromMatrixPosition(controller.matrixWorld);direction.set(0,0,-1).applyMatrix4(rotation);ray.set(position,direction);}
    else ray.setFromCamera(new Vector2(0,0),camera);
    activate(ray.intersectObjects([...targets,...buttons.children],false)[0]?.object as Mesh|undefined);
  }
  const controllers=[renderer.xr.getController(0),renderer.xr.getController(1)];
  const selectHandlers=controllers.map(controller=>()=>select(controller));
  controllers.forEach((controller,i)=>{scene.add(controller);controller.addEventListener("select",selectHandlers[i]);});
  let pointerStart:{x:number;y:number}|null=null;
  const pointerDown=(event:PointerEvent)=>{pointerStart={x:event.clientX,y:event.clientY};};
  const pointerUp=(event:PointerEvent)=>{
    if(session||!pointerStart||Math.hypot(pointerStart.x-event.clientX,pointerStart.y-event.clientY)>10)return;
    const bounds=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new Vector2((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1),camera);
    activate(ray.intersectObjects([...targets,...buttons.children],false)[0]?.object as Mesh|undefined);pointerStart=null;
  };
  renderer.domElement.addEventListener("pointerdown",pointerDown);renderer.domElement.addEventListener("pointerup",pointerUp);
  const contextLost=(event:Event)=>{event.preventDefault();onFatal("그래픽 장치가 중단되어 일반 감상 모드로 전환했어요.");};renderer.domElement.addEventListener("webglcontextlost",contextLost);
  const resize=()=>{if(disposed)return;const width=Math.max(1,element.clientWidth),height=Math.max(1,element.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(element);resize();
  const end=()=>{hitSource?.cancel();hitSource=null;session=null;ar=false;placing=false;reticle.visible=false;scene.background=new Color(0x0b1420);root.visible=true;root.position.set(0,0,0);root.scale.setScalar(1);if(!disposed){focus(index);onStatus("공간 세션을 종료했어요. 현재 컷에서 이어서 감상할 수 있어요.");}};
  renderer.setAnimationLoop((_time,frame)=>{
    if(disposed||document.hidden&&!session)return;
    if(ar&&placing&&frame&&hitSource){const space=renderer.xr.getReferenceSpace();const hit=frame.getHitTestResults(hitSource)[0];const pose=space&&hit?hit.getPose(space):null;reticle.visible=Boolean(pose);if(pose)reticle.matrix.fromArray(pose.transform.matrix);}
    renderer.render(scene,camera);
  });
  focus(index);
  return {
    focus,
    async enter(mode){
      if(disposed||entering||session)throw new Error("공간 감상 화면을 준비 중이거나 이미 실행 중이에요.");
      if(!isSecureContext||!navigator.xr)throw new Error("AR/VR은 지원 기기의 보안 연결에서 사용할 수 있어요. 일반 감상은 계속 사용할 수 있습니다.");
      entering=true;
      try{
        // requestSession stays on the explicit click call stack; no pre-permission async probe.
        const next=await navigator.xr.requestSession(mode,{requiredFeatures:mode==="immersive-vr"?["local-floor"]:["local"],optionalFeatures:["hit-test","hand-tracking","dom-overlay"],domOverlay:{root:element.parentElement??element}});
        if(disposed){await next.end();return;}
        session=next;ar=mode==="immersive-ar";next.addEventListener("end",end,{once:true});
        renderer.xr.setReferenceSpaceType(ar?"local":"local-floor");await renderer.xr.setSession(next);scene.background=ar?null:new Color(0x0b1420);root.scale.setScalar(ar?scale:1);
        focus(index);
        if(ar){
          root.position.set(0,-1.45,-2);root.visible=true;
          try{const viewer=await next.requestReferenceSpace("viewer");const source=await next.requestHitTestSource?.({space:viewer});if(source&&!disposed&&session===next){hitSource=source;placing=true;root.visible=false;onStatus("바닥의 원을 가리킨 뒤 탭하거나 선택 버튼을 눌러 웹툰을 배치하세요.");}else source?.cancel();}
          catch{onStatus("평면 감지를 사용할 수 없어 정면에 웹툰을 표시했어요.");}
        }else onStatus("VR 감상 중 · 컨트롤러로 컷 또는 이전·다음 버튼을 선택하세요. 기기 메뉴로 종료할 수 있어요.");
      }catch(error){const current=session;session=null;if(current)await current.end().catch(()=>{});throw error;}
      finally{entering=false;}
    },
    async exit(){await session?.end();},
    setScale(next){scale=Math.max(.25,Math.min(1.5,next));if(ar)root.scale.setScalar(scale);},
    destroy(){if(disposed)return;disposed=true;generation++;observer.disconnect();hitSource?.cancel();hitSource=null;
      const current=session;session=null;if(current){current.removeEventListener("end",end);void current.end().catch(()=>{});}
      controllers.forEach((controller,i)=>controller.removeEventListener("select",selectHandlers[i]));
      renderer.setAnimationLoop(null);renderer.domElement.removeEventListener("pointerdown",pointerDown);renderer.domElement.removeEventListener("pointerup",pointerUp);renderer.domElement.removeEventListener("webglcontextlost",contextLost);
      release(panels);release(buttons);reticle.geometry.dispose();reticle.material.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();scene.clear();
    },
  };
}
