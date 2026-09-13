import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getApiErrorMessage } from "@/infrastructure/api";
import { localSpatialImage } from "../spatial-reader/spatial-book";
import { GlbCapture } from "./GlbCapture";
import { cancelInferenceJob, createInferenceJob, getInferenceJob, inferenceArtifact, inferenceStatus, isInferenceTerminal, listInferenceJobs, type InferenceJob, type InferenceKind, type InferenceRequest, type InferenceStatus } from "./media-inference-client";
import { exportGeneratedClips, type GeneratedClip } from "./generated-video-export";
import "./advanced-studio.css";

const LABELS:Record<InferenceKind,string>={"image-to-video":"만화 → 생성형 애니메이션","image-to-3d":"2D 캐릭터 → 3D 모델","render-to-2d":"3D 캐릭터 → 2D 일러스트"};
const STATES:Record<string,string>={submitting:"입력 전달 중",queued:"GPU 작업 대기",running:"모델 추론 중","submission-unknown":"접수 여부 확인 중 · 자동 재제출 안 함","cancel-requested":"취소 확인 중",succeeded:"생성 완료",failed:"생성 실패",cancelled:"취소 완료"};
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export function StudioGenerativePage(){
  const [kind,setKind]=useState<InferenceKind>("image-to-video"),[image,setImage]=useState(""),[glb,setGlb]=useState<File|null>(null);
  const [prompt,setPrompt]=useState("캐릭터가 자연스럽게 눈을 깜빡이고 머리카락이 부드럽게 움직입니다."),[negative,setNegative]=useState("");
  const [seed,setSeed]=useState(42),[frames,setFrames]=useState<49|81|121>(81),[aspect,setAspect]=useState<InferenceRequest["aspect"]>("landscape"),[strength,setStrength]=useState(.45);
  const [status,setStatus]=useState<InferenceStatus|null>(null),[job,setJob]=useState<InferenceJob|null>(null),[history,setHistory]=useState<InferenceJob[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<{url:string;blob:Blob;job:InferenceJob}|null>(null);
  const [clips,setClips]=useState<GeneratedClip[]>([]),[exportProgress,setExportProgress]=useState<number|null>(null);
  const lifetime=useRef(new AbortController()),operation=useRef<{fingerprint:string;key:string}|null>(null),urls=useRef(new Set<string>()),exportAbort=useRef<AbortController|null>(null);
  const imageSequence=useRef(0);
  useEffect(()=>()=>{if(result){URL.revokeObjectURL(result.url);urls.current.delete(result.url);}},[result]);
  async function chooseImage(file:File){const sequence=++imageSequence.current;try{const source=await localSpatialImage(file,1024);if(sequence===imageSequence.current&&!lifetime.current.signal.aborted)setImage(source);}catch(cause){if(sequence===imageSequence.current)setError(String(cause));}}
  useEffect(()=>{
    const controller=new AbortController();lifetime.current=controller;const ownedUrls=urls.current;
    void inferenceStatus(controller.signal).then(setStatus).catch(async cause=>{if(!controller.signal.aborted)setError(await getApiErrorMessage(cause,"추론 서버 준비 상태를 확인하지 못했어요."));});
    return()=>{controller.abort();exportAbort.current?.abort();for(const url of ownedUrls)URL.revokeObjectURL(url);ownedUrls.clear();};
  },[]);
  const jobId=job?.id;const jobState=job?.state;
  useEffect(()=>{
    if(!jobId||!jobState||isInferenceTerminal(jobState))return;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;let failures=0;
    const id=jobId;const started=Date.now();
    const poll=async()=>{
      if(controller.signal.aborted)return;
      if(Date.now()-started>30*60*1000){setError("상태 자동 확인을 멈췄어요. 작업은 자동 재생성하지 않습니다. 내 작업 목록에서 이어서 확인하세요.");return;}
      try{const current=await getInferenceJob(id,controller.signal);if(controller.signal.aborted)return;setJob(current);failures=0;if(isInferenceTerminal(current.state))return;}
      catch(cause){if(controller.signal.aborted)return;failures++;setError(await getApiErrorMessage(cause,"상태 확인이 지연되고 있어요. 기존 작업 ID를 유지합니다."));}
      timer=setTimeout(()=>void poll(),Math.min(15000,3000*2**Math.min(3,failures)));
    };timer=setTimeout(()=>void poll(),2000);
    return()=>{controller.abort();clearTimeout(timer);};
  },[jobId,jobState]);
  const available=status?.configured&&status.capabilities.some(capability=>capability.kind===kind&&capability.ready);
  const active=job&&!isInferenceTerminal(job.state);
  async function run(){
    if(busy||active)return;setError("");setBusy(true);
    try{
      if(!image)throw new Error("변환할 캐릭터 이미지 또는 3D 구도를 먼저 준비해 주세요.");
      const input:InferenceRequest={kind,image,prompt,negative,seed,frames,aspect,strength};
      const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(input)))),x=>x.toString(16).padStart(2,"0")).join("");
      if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,key:crypto.randomUUID()};
      const created=await createInferenceJob(input,operation.current.key,lifetime.current.signal);setJob(created);setResult(null);
    }catch(cause){if(!lifetime.current.signal.aborted)setError(await getApiErrorMessage(cause,"생성을 접수하지 못했어요. 같은 입력을 다시 제출하면 기존 작업 ID를 재사용합니다."));}
    finally{setBusy(false);}
  }
  async function loadResult(){if(!job||busy)return;setBusy(true);setError("");try{const blob=await inferenceArtifact(job,lifetime.current.signal);const url=URL.createObjectURL(blob);urls.current.add(url);setResult({url,blob,job});}catch(cause){setError(await getApiErrorMessage(cause,"결과를 불러오지 못했어요."));}finally{setBusy(false);}}
  async function loadHistory(){setError("");try{setHistory(await listInferenceJobs(lifetime.current.signal));}catch(cause){setError(await getApiErrorMessage(cause,"로그인 후 작업 목록을 불러와 주세요."));}}
  async function assemble(){
    if(exportProgress!==null)return;const controller=new AbortController();exportAbort.current=controller;setExportProgress(0);setError("");
    try{const blob=await exportGeneratedClips(clips,controller.signal,setExportProgress);download(blob,`toonstudio-generated-promo.${blob.type==="video/mp4"?"mp4":"webm"}`);}catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"영상 연결에 실패했어요.");}finally{setExportProgress(null);exportAbort.current=null;}
  }
  return <main className="advanced-studio">
    <header><div><p className="eyebrow">TOONSTUDIO / GENERATIVE LAB</p><h1>캐릭터에서, 움직이는 이야기로</h1><p>원본을 보존하면서 영상·3D·2D 결과를 별도 에셋으로 생성합니다.</p></div><nav><Link to="/read/spatial">공간 웹툰 감상</Link><Link to="/showcase/promo">컷 기반 홍보 영상</Link><a href="/offline-drawing.html">로컬 드로잉</a></nav></header>
    <section className="advanced-notice"><strong>{status?.configured?"자체 추론 서버 연결됨":"자체 GPU 추론 서버 준비 필요"}</strong><p>실제 모델이 설치되고 작업 저장소가 준비된 기능만 실행할 수 있습니다. 외부 유료 생성 서비스로 자동 전환하지 않습니다. 결과의 캐릭터 동일성·형태·저작권은 최종 사용 전에 확인해 주세요.</p>{status?.capabilities.map(capability=><p key={capability.kind}>{LABELS[capability.kind]} · {capability.ready?"준비됨":`준비 안 됨: ${capability.missing.join(", ")}`}</p>)}</section>
    {error&&<p role="alert" className="advanced-error">{error}</p>}
    <div className="advanced-columns"><section className="advanced-card"><h2>1. 변환 입력</h2>
      <label>변환 종류<select value={kind} disabled={Boolean(active)||busy} onChange={event=>{setKind(event.target.value as InferenceKind);setResult(null);}}>{Object.entries(LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      {kind==="render-to-2d"?<><label>3D 캐릭터 GLB <input type="file" accept=".glb" onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file){setGlb(file);setImage("");}}}/></label><p className="muted">30MB 이하의 텍스처 내장 GLB를 사용하세요. 포즈를 맞춘 3D 캡처 PNG도 입력할 수 있습니다.</p></>:null}
      <label>{kind==="image-to-3d"?"캐릭터 정면 이미지 · 배경이 제거된 PNG 권장":"만화 컷 / 구도 PNG"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file)void chooseImage(file);}}/></label>
      {kind==="render-to-2d"&&glb&&<GlbCapture file={glb} onCapture={source=>{setImage(source);setKind("render-to-2d");}} onError={setError}/>}
      {image&&<img className="advanced-reference" src={image} alt="원본 변환 입력"/>}
      <label>연출 / 표현 설명<textarea value={prompt} maxLength={2000} onChange={event=>setPrompt(event.target.value)} rows={4}/></label>
      <label>피하고 싶은 표현<textarea value={negative} maxLength={1000} onChange={event=>setNegative(event.target.value)} rows={2}/></label>
      <div className="advanced-row"><label>재현 시드<input type="number" min={0} max={2147483647} value={seed} onChange={event=>setSeed(Number(event.target.value))}/></label>{kind==="image-to-video"&&<><label>길이<select value={frames} onChange={event=>setFrames(Number(event.target.value) as 49|81|121)}>{[49,81,121].map(value=><option key={value} value={value}>{(value/24).toFixed(2)}초 · {value}프레임</option>)}</select></label><label>화면 비율<select value={aspect} onChange={event=>setAspect(event.target.value as InferenceRequest["aspect"])}><option value="landscape">가로</option><option value="portrait">세로</option><option value="square">정사각형</option></select></label></>}</div>
      {kind==="render-to-2d"&&<label>변환 강도 {strength.toFixed(2)}<input type="range" min={.15} max={.8} step={.05} value={strength} onChange={event=>setStrength(Number(event.target.value))}/><span className="muted">낮을수록 원본 구도, 높을수록 2D 스타일 변화가 강합니다.</span></label>}
      {kind==="image-to-3d"&&<p className="muted">이 경로는 Hunyuan3D의 형상 추론으로 GLB 메시를 생성합니다. 자동 리깅·PBR 텍스처를 완성하는 단계는 포함하지 않습니다.</p>}
      <button className="primary" disabled={!available||!image||busy||Boolean(active)} onClick={()=>void run()}>{busy?"처리 중…":"실제 모델로 생성"}</button>
    </section><section className="advanced-card"><h2>2. 결과 확인</h2>
      {job?<><p role="status"><strong>{STATES[job.state]??job.state}</strong></p><code>{job.id}</code>{job.error&&<p className="advanced-error">{job.error}</p>}
      <div className="advanced-row">{!isInferenceTerminal(job.state)&&<button onClick={()=>void cancelInferenceJob(job.id).then(setJob).catch(async cause=>setError(await getApiErrorMessage(cause,"취소를 확인하지 못했어요.")))}>서버 작업 취소</button>}{job.state==="succeeded"&&<button disabled={busy} onClick={()=>void loadResult()}>검증된 결과 불러오기</button>}</div></>:<p className="muted">접수·대기·추론·완료 상태를 구분합니다. 결과가 없으면 완료로 표시하지 않습니다.</p>}
      {result&&<><div className="advanced-result">{result.blob.type.startsWith("video/")?<video controls muted playsInline src={result.url}/>:result.blob.type.startsWith("image/")?<img src={result.url} alt="AI 생성 결과"/>:<p>3D 모델 생성 완료 · {Math.round(result.blob.size/1024)}KB</p>}</div><div className="advanced-row"><button onClick={()=>download(result.blob,result.job.artifacts[0].name)}>원본 결과 다운로드</button>
      {result.blob.type.startsWith("video/")&&<button disabled={clips.length>=8} onClick={()=>setClips(current=>[...current,{blob:result.blob,caption:""}])}>홍보 영상 목록에 추가</button>}
      {result.blob.type==="model/gltf-binary"&&<button onClick={()=>{setGlb(new File([result.blob],`${result.job.id}.glb`,{type:result.blob.type}));setKind("render-to-2d");setImage("");}}>3D 미리보기 / 2D 재변환</button>}</div></>}
      <hr/><h3>작업 이어서 확인</h3><button onClick={()=>void loadHistory()}>내 작업 목록 불러오기</button><div className="advanced-history">{history.map(item=><button key={item.id} disabled={busy} onClick={()=>{setJob(item);setResult(null);}}>{LABELS[item.kind]} · {STATES[item.state]} · {item.id.slice(0,8)}</button>)}</div>
    </section></div>
    <section className="advanced-card"><h2>3. 생성 영상을 홍보 영상으로 연결</h2><p>생성한 영상을 원하는 순서로 놓고 자막을 넣어 한 파일로 저장합니다. 생성 모델의 실제 프레임을 사용하며, 녹화 중에는 이 화면을 열어 두세요. 현재 연결 출력은 가로 832×480이며 원본 비율은 여백으로 보존합니다.</p>
      {clips.map((clip,index)=><div className="advanced-row" key={index}><span>{index+1}번 영상</span><input aria-label={`${index+1}번 영상 자막`} value={clip.caption} maxLength={100} onChange={event=>setClips(current=>current.map((item,i)=>i===index?{...item,caption:event.target.value}:item))}/><button disabled={index===0||exportProgress!==null} onClick={()=>setClips(current=>{const next=[...current];[next[index-1],next[index]]=[next[index],next[index-1]];return next;})}>위로</button><button disabled={exportProgress!==null} onClick={()=>setClips(current=>current.filter((_,i)=>i!==index))}>제거</button></div>)}
      <button disabled={!clips.length||exportProgress!==null} onClick={()=>void assemble()}>연결 영상 내보내기</button>{exportProgress!==null&&<><progress max={1} value={exportProgress}/><button onClick={()=>exportAbort.current?.abort()}>내보내기 취소</button></>}
    </section>
  </main>;
}
