import { multiply, transform, perspective, panelSize, rayHits } from './story.js';
/** One WebGL owner for desktop and XR. No third-party textures or runtime CDN downloads. */
export class SpatialRenderer {
  constructor(canvas, onAction, onStatus) {
    this.canvas=canvas;this.onAction=onAction;this.onStatus=onStatus;this.session=null;this.frame=0;
    this.images=new Map();this.textures=new Map();this.buttons=new Map();this.panels=[];this.index=0;
    this.center={x:0,y:0,z:-2.8,yaw:0};this.scale=1;this.pan=0;this.targets=[];this.disposed=false;
    this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,xrCompatible:true,premultipliedAlpha:false});
    if(!this.gl)throw new Error('WebGL을 사용할 수 없습니다. 일반 감상으로 전환하세요.');
    this.lost=(event)=>{event.preventDefault();this.onStatus('그래픽 연결이 끊겼습니다. 일반 감상으로 전환하거나 새로고침하세요.');void this.end();};
    canvas.addEventListener('webglcontextlost',this.lost);this.setup();
  }
  setup(){
    const gl=this.gl;
    const compile=(kind,text)=>{const s=gl.createShader(kind);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('셰이더 초기화 실패');return s;};
    const vs=compile(gl.VERTEX_SHADER,'attribute vec2 a; uniform mat4 m; varying vec2 uv; void main(){uv=vec2(a.x+.5,.5-a.y);gl_Position=m*vec4(a,0.,1.);}');
    const fs=compile(gl.FRAGMENT_SHADER,'precision mediump float; varying vec2 uv; uniform sampler2D tex; void main(){gl_FragColor=texture2D(tex,uv);}');
    this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('그래픽 프로그램 초기화 실패');
    gl.useProgram(this.program);this.matrix=gl.getUniformLocation(this.program,'m');
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,-.5,.5,.5,-.5,.5,.5]),gl.STATIC_DRAW);
    const a=gl.getAttribLocation(this.program,'a');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);
    for(const [key,label]of[['prev','◀'],['next','▶'],['exit','EXIT'],['place','＋']])this.buttons.set(key,this.textTexture(label));
  }
  texture(image){
    // GPU textures cap at 1024px independently of portable source resolution.
    const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
    if(Math.max(w,h)>1024){const c=document.createElement('canvas');const scale=1024/Math.max(w,h);c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);image=c;}
    const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);return t;}
  textTexture(text,caption=false){const c=document.createElement('canvas');c.width=caption?1024:256;c.height=caption?256:128;const ctx=c.getContext('2d');ctx.fillStyle='rgba(20,22,36,.94)';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#fff';ctx.font=caption?'32px sans-serif':'bold 50px sans-serif';ctx.textBaseline='middle';if(!caption)ctx.fillText(text,32,64);else{let line='',y=34;for(const char of text.slice(0,250)){if(ctx.measureText(line+char).width>960||char==='\n'){ctx.fillText(line,24,y);line='';y+=42;if(y>235)break;}if(char!=='\n')line+=char;}if(y<=235)ctx.fillText(line,24,y);}return this.texture(c);}
  async setPanels(panels,index){
    const token=(this.loadToken??0)+1;this.loadToken=token;
    const wanted=new Set(panels.slice(Math.max(0,index-1),index+2).flatMap(p=>p.layers.map(l=>l.image)));
    const decoded=await Promise.all([...wanted].map(async source=>{if(this.images.has(source))return[source,this.images.get(source)];const image=new Image();image.src=source;await image.decode();if(image.naturalWidth>2048||image.naturalHeight>2048)throw new Error('감상 이미지 크기 제한은 2048px입니다. 이미지를 다시 가져오세요.');return[source,image];}));
    if(this.disposed||token!==this.loadToken)return;
    for(const[source,t]of this.textures)if(!wanted.has(source)){this.gl.deleteTexture(t);this.textures.delete(source);this.images.delete(source);}
    for(const[source,image]of decoded){this.images.set(source,image);if(!this.textures.has(source))this.textures.set(source,this.texture(image));}
    this.panels=panels;this.index=index;
    if(this.caption)this.gl.deleteTexture(this.caption);this.caption=this.textTexture(`${index+1} / ${panels.length}   ${panels[index]?.caption??''}`,true);
    this.drawDesktop();
  }
  local(x,y,z=0){const c=Math.cos(this.center.yaw),s=Math.sin(this.center.yaw);return{x:this.center.x+c*x*this.scale+s*z*this.scale,y:this.center.y+y*this.scale,z:this.center.z-s*x*this.scale+c*z*this.scale,yaw:this.center.yaw};}
  quad(texture,view,position,w,h){if(!texture)return;const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniformMatrix4fv(this.matrix,false,multiply(view,transform(position.x,position.y,position.z,position.yaw,w*this.scale,h*this.scale)));gl.drawArrays(gl.TRIANGLES,0,6);}
  scene(view){
    this.targets=[];
    if(this.mode==='immersive-ar'&&!this.placed){if(this.hit)this.quad(this.buttons.get('place'),view,{...this.hit,yaw:this.center.yaw},.18,.18);return;}
    for(let i=Math.max(0,this.index-1);i<=Math.min(this.panels.length-1,this.index+1);i++){
      const panel=this.panels[i];const[w,h]=panelSize(panel);const x=(i-this.index)*2.9;
      for(const layer of [...panel.layers].sort((a,b)=>a.depth-b.depth))this.quad(this.textures.get(layer.image),view,this.local(x+layer.x,layer.y,layer.depth),w*layer.scale,h*layer.scale);
    }
    if(this.caption)this.quad(this.caption,view,this.local(0,-1.05,.05),2.4,.6);
    if(this.session){for(const[key,x]of[['prev',-.6],['next',0],['exit',.6]]){const target={...this.local(x,-1.52,.1),w:.48*this.scale,h:.24*this.scale,key};this.targets.push(target);this.quad(this.buttons.get(key),view,target,.48,.24);}}
  }
  drawDesktop(){if(this.session||this.disposed||document.hidden)return;const gl=this.gl;const dpr=Math.min(devicePixelRatio||1,1.5),w=Math.max(1,Math.round(this.canvas.clientWidth*dpr)),h=Math.max(1,Math.round(this.canvas.clientHeight*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);gl.clearColor(.055,.06,.095,1);gl.clear(gl.COLOR_BUFFER_BIT);this.center={x:0,y:0,z:-2.8,yaw:0};this.scene(multiply(perspective(w/h),transform(-this.pan,0,0)));}
  async start(mode){
    if(this.session||!this.panels.length)throw new Error('먼저 감상할 컷을 가져오세요.');
    if(!navigator.xr||!isSecureContext)throw new Error('이 브라우저에서는 XR을 사용할 수 없습니다. 일반/공간 감상을 이용하세요.');
    // Permission request happens immediately within the explicit button gesture.
    const session=await navigator.xr.requestSession(mode,{optionalFeatures:mode==='immersive-ar'?['local-floor','hit-test','dom-overlay']:['local-floor'],...(mode==='immersive-ar'?{domOverlay:{root:document.getElementById('xr-overlay')}}:{})});
    this.session=session;this.mode=mode;this.placed=mode!=='immersive-ar';this.hit=null;this.recenter=true;
    session.addEventListener('end',()=>{this.hitSource?.cancel();this.hitSource=null;this.session=null;this.ref=null;this.scale=1;this.mode='desktop';this.placed=true;this.onStatus('XR 감상을 종료했습니다.');this.drawDesktop();},{once:true});
    try{
      await this.gl.makeXRCompatible();session.updateRenderState({baseLayer:new XRWebGLLayer(session,this.gl,{alpha:mode==='immersive-ar',framebufferScaleFactor:.8})});
      this.ref=await session.requestReferenceSpace('local-floor').catch(()=>session.requestReferenceSpace('local'));
      if(mode==='immersive-ar'){
        try{const viewer=await session.requestReferenceSpace('viewer');this.hitSource=await session.requestHitTestSource({space:viewer});this.onStatus('바닥을 비춘 뒤 + 위치를 선택해 웹툰을 배치하세요.');}
        catch{this.onStatus('표면 감지가 없습니다. 화면을 눌러 시선 앞에 배치하세요.');}
      }else this.onStatus('VR 감상 · 컨트롤러로 ◀ ▶ EXIT를 선택하세요.');
      session.addEventListener('select',(event)=>this.select(event));
      session.requestAnimationFrame((time,frame)=>this.xrFrame(time,frame));
    }catch(error){await session.end();throw error;}
  }
  xrFrame(time,frame){
    const session=this.session;if(!session||this.disposed)return;
    session.requestAnimationFrame((t,f)=>this.xrFrame(t,f));const pose=frame.getViewerPose(this.ref);if(!pose)return;
    const p=pose.transform.position,m=pose.transform.matrix;
    if(this.recenter){this.center={x:p.x-m[8]*2.5,y:p.y,z:p.z-m[10]*2.5,yaw:Math.atan2(m[8],m[10])};this.recenter=false;}
    if(this.hitSource&&!this.placed){const hit=frame.getHitTestResults(this.hitSource)[0]?.getPose(this.ref);if(hit)this.hit={x:hit.transform.position.x,y:hit.transform.position.y+.1,z:hit.transform.position.z};}
    this.lastViewer={x:p.x,y:p.y,z:p.z};
    if(session.visibilityState==='visible')for(const input of session.inputSources){const axes=input.gamepad?.axes??[];const value=axes.length>=4?axes[2]:(axes[0]??0);if(Math.abs(value)>.75&&time-(this.lastStep??0)>650){this.lastStep=time;this.onAction(value>0?'next':'prev');}}
    const gl=this.gl,layer=session.renderState.baseLayer;gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);gl.clearColor(0,0,0,this.mode==='immersive-ar'?0:1);gl.clear(gl.COLOR_BUFFER_BIT);
    for(const view of pose.views){const viewport=layer.getViewport(view);gl.viewport(viewport.x,viewport.y,viewport.width,viewport.height);this.scene(multiply(view.projectionMatrix,view.transform.inverse.matrix));}
  }
  select(event){
    if(this.mode==='immersive-ar'&&!this.placed){if(this.hit){const p=this.lastViewer;this.center={x:this.hit.x,y:this.hit.y+.75,z:this.hit.z,yaw:Math.atan2(p.x-this.hit.x,p.z-this.hit.z)};this.scale=.6;}this.placed=true;this.onStatus('배치 완료 · 다음/이전 컷으로 감상하세요.');return;}
    const pose=event.frame.getPose(event.inputSource.targetRaySpace,this.ref);if(!pose)return;
    const m=pose.transform.matrix,origin=[m[12],m[13],m[14]],direction=[-m[8],-m[9],-m[10]];
    const hit=this.targets.find(target=>rayHits(origin,direction,target));if(hit){if(hit.key==='exit')void this.end();else this.onAction(hit.key);}
  }
  async end(){if(this.session)await this.session.end();}
  dispose(){this.disposed=true;void this.end();this.canvas.removeEventListener('webglcontextlost',this.lost);for(const t of [...this.textures.values(),...this.buttons.values(),this.caption].filter(Boolean))this.gl.deleteTexture(t);this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);this.images.clear();this.textures.clear();}
}
