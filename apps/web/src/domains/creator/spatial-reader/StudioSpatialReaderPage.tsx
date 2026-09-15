import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { localSpatialImage, nextSpatialPanel, parseSpatialBook, type SpatialBook, type SpatialPanel } from "./spatial-book";
import { spatialBookVtt } from "./spatial-book-captions";
import type { SpatialReaderRuntime } from "./spatial-reader-runtime";
import "../generative/advanced-studio.css";

function savedIndex(book:SpatialBook):number{try{return nextSpatialPanel(Number(localStorage.getItem(`toonstudio-spatial-progress:${book.id}`))||0,0,book.panels.length);}catch{return 0;}}
function downloadBook(book:SpatialBook){const url=URL.createObjectURL(new Blob([JSON.stringify(parseSpatialBook(book))],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download="toonstudio-spatial-book.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export function StudioSpatialReaderPage(){
  const [book,setBook]=useState<SpatialBook|null>(null),[index,setIndex]=useState(0),[view,setView]=useState<"2d"|"spatial">("2d"),[auto,setAuto]=useState(false);
  const [status,setStatus]=useState("이미지 컷이나 공간 웹툰 파일을 열어주세요."),[error,setError]=useState(""),[busy,setBusy]=useState(false),[scale,setScale]=useState(.65);
  const host=useRef<HTMLDivElement>(null),runtime=useRef<SpatialReaderRuntime|null>(null),audio=useRef<HTMLAudioElement>(null),loadGeneration=useRef(0);
  const indexRef=useRef(index);indexRef.current=index;
  const scaleRef=useRef(scale);scaleRef.current=scale;
  const bookRef=useRef(book);bookRef.current=book;
  const panel=book?.panels[index];
  const [captionUrl,setCaptionUrl]=useState("");
  useEffect(()=>{
    if(!book?.audio){setCaptionUrl("");return;}
    const url=URL.createObjectURL(new Blob([spatialBookVtt(book)],{type:"text/vtt"}));setCaptionUrl(url);
    return()=>URL.revokeObjectURL(url);
  },[book]);
  useEffect(()=>{
    if(!book||view!=="spatial"||!host.current)return;
    let disposed=false;let current:SpatialReaderRuntime|null=null;const element=host.current;
    void import("./spatial-reader-runtime").then(({createSpatialReader})=>{
      if(disposed)return;current=createSpatialReader(element,book,indexRef.current,setIndex,setStatus,message=>{setError(message);setView("2d");});runtime.current=current;current.setScale(scaleRef.current);
    }).catch(cause=>{if(!disposed){setError(cause instanceof Error?cause.message:"공간 화면을 준비하지 못했어요.");setView("2d");}});
    return()=>{disposed=true;current?.destroy();if(runtime.current===current)runtime.current=null;};
  },[book,view]);
  useEffect(()=>{if(book){try{localStorage.setItem(`toonstudio-spatial-progress:${book.id}`,String(index));}catch{/* Reading never depends on browser storage. */}}},[book,index]);
  useEffect(()=>{
    if(!book||!auto)return;
    const timer=setTimeout(()=>{if(document.hidden){setAuto(false);audio.current?.pause();return;}if(index>=book.panels.length-1){setAuto(false);audio.current?.pause();return;}const next=index+1;runtime.current?.focus(next);setIndex(next);},book.panels[index].seconds*1000);
    return()=>clearTimeout(timer);
  },[auto,book,index]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(!book||event.isComposing||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||event.target instanceof HTMLSelectElement)return;if(["ArrowRight","ArrowLeft","Home","End"].includes(event.key)){event.preventDefault();const next=event.key==="Home"?0:event.key==="End"?book.panels.length-1:nextSpatialPanel(index,event.key==="ArrowRight"?1:-1,book.panels.length);runtime.current?.focus(next);setIndex(next);setAuto(false);}};
    const visibility=()=>{if(document.hidden){setAuto(false);audio.current?.pause();}};
    window.addEventListener("keydown",key);document.addEventListener("visibilitychange",visibility);
    return()=>{window.removeEventListener("keydown",key);document.removeEventListener("visibilitychange",visibility);};
  },[book,index]);
  async function openImages(files:File[]){
    const version=++loadGeneration.current;setBusy(true);setError("");setAuto(false);
    try{
      if(!files.length||files.length>32)throw new Error("1~32컷을 선택해 주세요.");
      const panels:SpatialPanel[]=[];let total=0;
      for(const file of [...files].sort((a,b)=>a.name.localeCompare(b.name,"ko",{numeric:true}))){const src=await localSpatialImage(file);if(version!==loadGeneration.current)return;total+=src.length;if(total>64_000_000)throw new Error("이미지 총량이 너무 커요. 작품을 나누어 주세요.");panels.push({id:crypto.randomUUID(),title:file.name.replace(/\.[^.]+$/u,"").slice(0,120),caption:"",alt:file.name.slice(0,120),src,seconds:6,layers:[]});}
      const next=parseSpatialBook({format:"toonstudio-spatial-book",version:1,id:crypto.randomUUID(),title:"나의 공간 웹툰",panels});setBook(next);setIndex(0);setStatus("파일 이름 순서로 컷을 열었어요. 내보내기를 하면 이미지·자막·깊이 레이어를 함께 보관합니다.");
    }catch(cause){setError(cause instanceof Error?cause.message:"이미지를 열지 못했어요.");}finally{if(version===loadGeneration.current)setBusy(false);}
  }
  async function openBook(file:File){const version=++loadGeneration.current;setBusy(true);setError("");setAuto(false);try{if(file.size>80_000_000)throw new Error("공간 웹툰 파일은 80MB 이하여야 해요.");const next=parseSpatialBook(JSON.parse(await file.text()));if(version!==loadGeneration.current)return;setBook(next);setIndex(savedIndex(next));setStatus("저장한 공간 웹툰과 감상 위치를 불러왔어요.");}catch(cause){setError(cause instanceof Error?cause.message:"공간 웹툰을 열지 못했어요.");}finally{if(version===loadGeneration.current)setBusy(false);}}
  function focus(next:number){if(!book)return;const clamped=nextSpatialPanel(next,0,book.panels.length);runtime.current?.focus(clamped);setIndex(clamped);setAuto(false);}
  function updatePanel(update:Partial<SpatialPanel>){setBook(current=>current?{...current,panels:current.panels.map((item,i)=>i===index?{...item,...update}:item)}:null);}
  async function enter(mode:"immersive-vr"|"immersive-ar"){setError("");setAuto(false);try{if(!runtime.current)throw new Error("먼저 공간 보기를 켠 뒤 AR/VR 버튼을 눌러주세요.");await runtime.current.enter(mode);}catch(cause){setError(cause instanceof Error?cause.message:"이 기기에서 공간 세션을 열지 못했어요. 일반 감상은 사용할 수 있습니다.");}}
  return <main className="advanced-studio"><header><div><p className="eyebrow">TOONSTUDIO / SPATIAL READER</p><h1>웹툰의 공간 안으로</h1><p>컷·대사·깊이 레이어를 보존하는 감상 모드. 일반 화면, VR, AR에서 같은 작품을 읽습니다.</p></div><nav><Link to="/studio/generate">생성형 스튜디오</Link><Link to="/studio">스튜디오 홈 · 오프라인 자동 전환</Link></nav></header>
    <section className="advanced-notice"><strong>권한 요청은 AR/VR 실행 버튼을 누를 때만 합니다.</strong><p>이미지·작품 파일은 이 브라우저에서 읽으며 서버에 업로드하지 않습니다. 감상 위치만 이 기기에 저장됩니다. AR/VR 미지원 기기에서는 일반 보기와 키보드·터치로 모든 컷을 감상할 수 있습니다.</p></section>
    <div className="advanced-row"><label>컷 이미지 여러 장<input disabled={busy} type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={event=>{const files=Array.from(event.target.files??[]);event.target.value="";if(files.length)void openImages(files);}}/></label><label>공간 웹툰 JSON<input disabled={busy} type="file" accept=".json" onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file)void openBook(file);}}/></label></div>
    {error&&<p role="alert" className="advanced-error">{error}</p>}<p role="status">{busy?"작품을 읽는 중…":status}</p>
    {book&&panel&&<><div className="advanced-row"><h2>{book.title}</h2><button aria-pressed={view==="2d"} onClick={()=>{setView("2d");setAuto(false);}}>일반 보기</button><button aria-pressed={view==="spatial"} onClick={()=>setView("spatial")}>공간 보기</button>{view==="spatial"&&<><button onClick={()=>void enter("immersive-vr")}>VR 감상 시작</button><button onClick={()=>void enter("immersive-ar")}>AR에 배치</button><button onClick={()=>void runtime.current?.exit().catch(cause=>setError(String(cause)))}>AR/VR 종료</button></>}<button onClick={()=>{try{downloadBook(book);}catch(cause){setError(String(cause));}}}>작품 파일 내보내기</button></div>
      {view==="spatial"?<div className="spatial-viewport" ref={host} aria-label={`${index+1}번째 컷의 공간 감상 화면`}/>:<div className="spatial-2d"><img src={panel.src} alt={panel.alt||panel.title}/></div>}
      <div className="spatial-caption" aria-live="polite"><strong>{index+1} / {book.panels.length} · {panel.title}</strong><p>{panel.caption}</p></div>
      <div className="advanced-row"><button disabled={index===0} onClick={()=>focus(index-1)}>이전 컷</button><button aria-pressed={auto} onClick={()=>{setAuto(value=>!value);if(auto)audio.current?.pause();else if(audio.current)void audio.current.play().catch(()=>setStatus("음악은 재생 버튼을 눌러 시작해 주세요."));}}>{auto?"자동 넘김 멈춤":"자동 넘김 시작"}</button><button disabled={index===book.panels.length-1} onClick={()=>focus(index+1)}>다음 컷</button><span className="muted">← → / Home / End</span></div>
      <div className="spatial-cuts" aria-label="전체 컷 탐색">{book.panels.map((item,i)=><button key={item.id} aria-current={i===index} aria-label={`${i+1}번째 컷 ${item.title}`} onClick={()=>focus(i)}><img loading="lazy" src={item.src} alt=""/>{i+1}</button>)}</div>
      {book.audio&&<audio ref={audio} controls src={book.audio} aria-label="작품 음악 또는 내레이션"><track kind="captions" src={captionUrl || undefined} srcLang="ko" label="작가가 입력한 컷 대사" default /></audio>}
      <details className="advanced-card"><summary>작품 정보 · 자막 · 깊이 레이어 편집</summary><p className="muted">깊이 레이어는 별도로 준비한 투명 PNG를 사용합니다. 자동으로 추론한 3D라고 표시하지 않습니다. 편집하면 열린 AR/VR 세션을 종료하고 화면을 다시 구성합니다.</p>
        <label>작품 제목<input value={book.title} maxLength={160} onChange={event=>setBook({...book,title:event.target.value})}/></label><label>현재 컷 제목<input value={panel.title} maxLength={120} onChange={event=>updatePanel({title:event.target.value})}/></label>
        <label>대사 / 자막<textarea rows={3} value={panel.caption} maxLength={2000} onChange={event=>updatePanel({caption:event.target.value})}/></label><label>화면 설명 · 스크린리더용<textarea rows={2} value={panel.alt} maxLength={2000} onChange={event=>updatePanel({alt:event.target.value})}/></label>
        <div className="advanced-row"><label>컷 감상 시간 · 초<input type="number" min={2} max={60} value={panel.seconds} onChange={event=>updatePanel({seconds:Math.max(2,Math.min(60,Number(event.target.value)||6))})}/></label><label>AR 크기<input type="range" min={.25} max={1.5} step={.05} value={scale} onChange={event=>{const next=Number(event.target.value);setScale(next);runtime.current?.setScale(next);}}/></label></div>
        <label>현재 컷에 앞 레이어 PNG 추가 · 최대 3개<input type="file" accept="image/png" disabled={panel.layers.length>=3} onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(!file)return;const id=panel.id;void localSpatialImage(file).then(src=>{const current=bookRef.current;if(!current||!current.panels.some(item=>item.id===id))return;setBook(parseSpatialBook({...current,panels:current.panels.map(item=>item.id===id?{...item,layers:[...item.layers,{src,depth:.12}].slice(0,3)}:item)}));}).catch(cause=>setError(String(cause)));}}/></label>
        {panel.layers.map((layer,i)=><div className="advanced-row" key={i}><label>레이어 {i+1} 깊이<input type="range" min={.02} max={.6} step={.02} value={layer.depth} onChange={event=>updatePanel({layers:panel.layers.map((item,j)=>j===i?{...item,depth:Number(event.target.value)}:item)})}/></label><button onClick={()=>updatePanel({layers:panel.layers.filter((_,j)=>j!==i)})}>레이어 제거</button></div>)}
        <label>음악 / 내레이션 내장 · 10MB 이하<input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4" onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(!file)return;if(file.size>10*1024*1024){setError("오디오는 10MB 이하여야 해요.");return;}const id=book.id;const reader=new FileReader();reader.onload=()=>{try{const current=bookRef.current;if(current?.id!==id)return;const next=parseSpatialBook({...current,audio:reader.result});setBook(next);}catch(cause){setError(String(cause));}};reader.onerror=()=>setError("오디오를 읽지 못했어요.");reader.readAsDataURL(file);}}/></label>
      </details>
    </>}
  </main>;
}
