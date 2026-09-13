import { api, apiPath } from "@/infrastructure/api";

export type InferenceKind = "image-to-video" | "image-to-3d" | "render-to-2d";
export interface InferenceJob { id: string; kind: InferenceKind; state: string; error: string|null; createdAt: string; updatedAt: string; artifacts: Array<{index:number;mime:string;name:string}> }
export interface InferenceStatus { configured:boolean; capabilities:Array<{kind:InferenceKind;ready:boolean;missing:string[]}> }
export interface InferenceRequest { kind:InferenceKind;image:string;prompt:string;negative:string;seed:number;frames:49|81|121;aspect:"landscape"|"portrait"|"square";strength:number }
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const STATES=["submitting","queued","running","submission-unknown","cancel-requested","succeeded","failed","cancelled"];
function object(value:unknown):value is Record<string,unknown>{return Boolean(value&&typeof value==="object"&&!Array.isArray(value));}
export function parseInferenceJob(value:unknown):InferenceJob{
  if(!object(value)||typeof value.id!=="string"||!UUID.test(value.id)||(typeof value.state!=="string"||!STATES.includes(value.state))||(typeof value.kind!=="string"||!["image-to-video","image-to-3d","render-to-2d"].includes(value.kind))||!Array.isArray(value.artifacts)||value.artifacts.length>1)throw new Error("생성 작업 응답을 확인하지 못했어요.");
  if(typeof value.createdAt!=="string"||!Number.isFinite(Date.parse(value.createdAt))||typeof value.updatedAt!=="string"||!Number.isFinite(Date.parse(value.updatedAt)))throw new Error("작업 시간 정보를 확인하지 못했어요.");
  const expectedMime=value.kind==="image-to-video"?"video/webm":value.kind==="image-to-3d"?"model/gltf-binary":"image/png";
  const artifacts=value.artifacts.map(item=>{if(!object(item)||!Number.isSafeInteger(item.index)||Number(item.index)!==0||item.mime!==expectedMime||typeof item.name!=="string"||!/^result_[A-Za-z0-9_.-]+$/u.test(item.name))throw new Error("결과 파일 정보를 확인하지 못했어요.");return{index:Number(item.index),mime:String(item.mime),name:item.name};});
  if(value.state==="succeeded"&&!artifacts.length)throw new Error("완료된 작업에 결과물이 없어요.");
  return{id:value.id,kind:value.kind as InferenceKind,state:String(value.state),error:typeof value.error==="string"?value.error.slice(0,160):null,createdAt:String(value.createdAt),updatedAt:String(value.updatedAt),artifacts};
}
export const isInferenceTerminal=(state:string)=>["succeeded","failed","cancelled"].includes(state);
export async function inferenceStatus(signal:AbortSignal):Promise<InferenceStatus>{
  const value=await api.get<unknown>("/studio-ai/media/status",{signal,timeout:35000});
  if(!object(value)||typeof value.configured!=="boolean"||!Array.isArray(value.capabilities))throw new Error("추론 서버 준비 상태를 확인하지 못했어요.");
  return{configured:value.configured,capabilities:value.capabilities.filter(item=>object(item)&&["image-to-video","image-to-3d","render-to-2d"].includes(String(item.kind))).map(item=>({kind:item.kind as InferenceKind,ready:item.ready===true,missing:Array.isArray(item.missing)?item.missing.filter((x:unknown)=>typeof x==="string").slice(0,30):[]}))};
}
export async function listInferenceJobs(signal:AbortSignal):Promise<InferenceJob[]>{const values=await api.get<unknown>("/studio-ai/media/jobs",{signal,timeout:15000});if(!Array.isArray(values))throw new Error("작업 목록을 확인하지 못했어요.");return values.slice(0,30).map(parseInferenceJob);}
export async function createInferenceJob(input:InferenceRequest,key:string,signal:AbortSignal):Promise<InferenceJob>{return parseInferenceJob(await api.post<unknown>("/studio-ai/media/jobs",input,{signal,timeout:110000,headers:{"Idempotency-Key":key}}));}
export async function getInferenceJob(id:string,signal:AbortSignal):Promise<InferenceJob>{if(!UUID.test(id))throw new Error("잘못된 작업 ID예요.");return parseInferenceJob(await api.get<unknown>(`/studio-ai/media/jobs/${id}`,{signal,timeout:20000}));}
export async function cancelInferenceJob(id:string):Promise<InferenceJob>{if(!UUID.test(id))throw new Error("잘못된 작업 ID예요.");return parseInferenceJob(await api.post<unknown>(`/studio-ai/media/jobs/${id}/cancel`,{},{timeout:35000}));}
export async function inferenceArtifact(job:InferenceJob,signal:AbortSignal):Promise<Blob>{
  if(!UUID.test(job.id)||job.state!=="succeeded"||!job.artifacts.length)throw new Error("완료된 작업을 선택해 주세요.");
  const artifact=job.artifacts[0];const response=await api.raw.get(apiPath(`/studio-ai/media/jobs/${job.id}/artifacts/${artifact.index}`),{signal,timeout:45000});
  const mime=(response.headers.get("content-type")??"").split(";")[0];const expected=response.headers.get("x-content-sha256");
  if(mime!==artifact.mime||!expected||!/^[0-9a-f]{64}$/u.test(expected)||Number(response.headers.get("content-length")??0)>80*1024*1024||!response.body)throw new Error("생성 결과의 형식이나 검증 정보를 확인하지 못했어요.");
  const chunks:Uint8Array<ArrayBuffer>[]=[];const reader=response.body.getReader();let size=0;
  try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>80*1024*1024)throw new Error("생성 파일이 80MB를 초과했어요.");chunks.push(new Uint8Array(item.value));}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const blob=new Blob(chunks,{type:mime});const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer())),byte=>byte.toString(16).padStart(2,"0")).join("");
  if(digest!==expected)throw new Error("생성 파일이 전송 중 변경되었어요. 다시 받아주세요.");return blob;
}
