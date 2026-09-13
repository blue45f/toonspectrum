export interface GeneratedClip { blob:Blob;caption:string }
/** Real generated frames, not a substituted pan/zoom animation. Output format follows encoder support. */
export async function exportGeneratedClips(clips:GeneratedClip[],signal:AbortSignal,onProgress:(value:number)=>void):Promise<Blob>{
  if(!clips.length||clips.length>8)throw new Error("1~8개 생성 영상을 선택해 주세요.");
  const mime=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/mp4"].find(type=>typeof MediaRecorder!=="undefined"&&MediaRecorder.isTypeSupported(type));
  if(!mime)throw new Error("이 브라우저는 영상 연결 녹화를 지원하지 않아요. 개별 생성 영상은 다운로드할 수 있습니다.");
  const canvas=document.createElement("canvas");canvas.width=832;canvas.height=480;const ctx=canvas.getContext("2d");if(!ctx||!canvas.captureStream)throw new Error("영상 합성을 지원하지 않아요.");
  const videos:HTMLVideoElement[]=[],urls:string[]=[];let stream:MediaStream|undefined,recorder:MediaRecorder|undefined;
  let frame=0;const chunks:Blob[]=[];
  try{
    for(const clip of clips){
      signal.throwIfAborted();const url=URL.createObjectURL(clip.blob);urls.push(url);const video=document.createElement("video");video.muted=true;video.playsInline=true;video.preload="auto";videos.push(video);
      await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>finish(new Error("영상을 읽는 시간이 초과됐어요.")),10000);const abort=()=>finish(new DOMException("Aborted","AbortError"));const finish=(error?:Error)=>{clearTimeout(timeout);signal.removeEventListener("abort",abort);video.onloadeddata=null;video.onerror=null;error?reject(error):resolve();};video.onloadeddata=()=>finish();video.onerror=()=>finish(new Error("생성 영상을 읽지 못했어요."));signal.addEventListener("abort",abort,{once:true});video.src=url;});
      if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>30)throw new Error("개별 영상 길이는 최대 30초여야 해요.");
    }
    stream=canvas.captureStream(24);recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6_000_000});
    const finished=new Promise<void>((resolve,reject)=>{recorder!.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder!.onstop=()=>resolve();recorder!.onerror=()=>reject(new Error("영상 인코딩이 중단되었어요."));});
    // Attach a rejection observer immediately, including while individual video playback awaits.
    void finished.catch(()=>{});recorder.start(250);
    const total=videos.reduce((sum,video)=>sum+video.duration,0);let completed=0;
    for(let index=0;index<videos.length;index++){
      const video=videos[index];await video.play();const deadline=performance.now()+video.duration*2000+5000;
      await new Promise<void>((resolve,reject)=>{
        const render=()=>{
          if(signal.aborted){reject(new DOMException("Aborted","AbortError"));return;}
          if(document.hidden||performance.now()>deadline){reject(new Error("화면을 계속 켜 둔 상태에서 영상 연결을 다시 실행해 주세요."));return;}
          ctx.fillStyle="#10151f";ctx.fillRect(0,0,canvas.width,canvas.height);const fit=Math.min(canvas.width/video.videoWidth,canvas.height/video.videoHeight);ctx.drawImage(video,(canvas.width-video.videoWidth*fit)/2,(canvas.height-video.videoHeight*fit)/2,video.videoWidth*fit,video.videoHeight*fit);
          const caption=clips[index].caption.slice(0,100);if(caption){ctx.fillStyle="rgba(0,0,0,.72)";ctx.fillRect(24,canvas.height-68,canvas.width-48,48);ctx.fillStyle="#ffffff";ctx.font="20px system-ui";ctx.fillText(caption,40,canvas.height-38,canvas.width-80);}
          onProgress(Math.min(1,(completed+video.currentTime)/total));
          if(video.ended){resolve();return;}frame=requestAnimationFrame(render);
        };frame=requestAnimationFrame(render);
      });completed+=video.duration;
    }
    recorder.stop();await finished;onProgress(1);return new Blob(chunks,{type:mime.split(";")[0]});
  }finally{cancelAnimationFrame(frame);for(const video of videos){video.pause();video.removeAttribute("src");video.load();}if(recorder&&recorder.state!=="inactive")recorder.stop();stream?.getTracks().forEach(track=>track.stop());urls.forEach(url=>URL.revokeObjectURL(url));canvas.width=canvas.height=1;}
}
