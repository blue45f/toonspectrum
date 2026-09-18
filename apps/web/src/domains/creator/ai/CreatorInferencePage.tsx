import { useUserAi } from "@/shared/ai/user-ai-store";
import { UnifiedAiSettings } from "@/shared/ai/UnifiedAiSettings";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/compat/router-link";
import { getApiErrorMessage } from "@/infrastructure/api";
import {
  cancelInferenceJob, cleanupUserInferenceUploads, deleteUserInferenceJob, downloadInferenceArtifact,
  inferenceCapabilities, listInferenceJobs, removeUserInferenceUpload, submitInferenceJob, uploadInferenceAsset,
  type InferenceArtifact, type InferenceCapabilities, type InferenceJob, type InferenceMode, type InferenceRequest,
} from "./creator-inference-client";
import "./creator-inference.css";

const MODES: { value: InferenceMode; title: string; description: string }[] = [
  { value: "image-to-video", title: "컷 → 생성형 애니메이션", description: "Wan으로 새로운 프레임을 생성합니다. 최대 8컷을 순서대로 생성·연결하고 자막 파일을 함께 만듭니다." },
  { value: "image-to-3d", title: "2D 캐릭터 → 3D", description: "TripoSR로 입체 형상을 추론하고 색상 포함 GLB로 내보냅니다. 투명 배경 캐릭터를 권장합니다." },
  { value: "model-to-2d", title: "3D 캐릭터 → 2D", description: "GLB를 렌더링한 뒤 SDXL ControlNet으로 선·구도를 참조하는 웹툰 이미지를 생성합니다." },
];
const STATE = { queued: "대기 중", running: "생성 중", succeeded: "결과 준비됨", failed: "생성 실패", cancelled: "취소됨", interrupted: "서버 재시작으로 중단됨" };
const TERMINAL = new Set(["succeeded", "failed", "cancelled", "interrupted"]);
export function CreatorInferencePage() {
  const userAi = useUserAi();
  const [mode, setMode] = useState<InferenceMode>("image-to-video");
  const [files, setFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState("캐릭터가 자연스럽게 눈을 깜빡이고 머리카락과 옷자락이 바람에 움직입니다. 원본 디자인과 색상을 유지하세요.");
  const [negative, setNegative] = useState("");
  const [seed, setSeed] = useState(42), [frames, setFrames] = useState(49), [steps, setSteps] = useState(30), [strength, setStrength] = useState(.45), [yaw, setYaw] = useState(0);
  const [caps, setCaps] = useState<InferenceCapabilities | null>(null);
  const [jobs, setJobs] = useState<InferenceJob[]>([]);
  const [message, setMessage] = useState("클라우드 추론 런타임 연결 확인 중…"), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [uncertain, setUncertain] = useState(false);
  const [preview, setPreview] = useState<{ url: string; mime: string; name: string } | null>(null);
  const operation = useRef<AbortController | null>(null);
  const pending = useRef<{ body: InferenceRequest; key: string } | null>(null);
  const mounted = useRef(false), previewUrl = useRef<string | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await listInferenceJobs(signal);
    if (mounted.current && !signal?.aborted) setJobs(next);
  }, []);
  useEffect(() => {
    pending.current = null; setUncertain(false); setJobs([]);
    mounted.current = true; const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    void inferenceCapabilities(controller.signal).then((status) => {
      if (!mounted.current) return;
      setCaps(status); setMessage(status.enabled ? "관리형 클라우드 추론 런타임 연결됨 · 준비된 모델이 필요합니다." : status.reason ?? "클라우드 추론 런타임 또는 모델이 활성화되지 않았습니다. 연결 장애 시 다른 경로로 중복 전송하지 않습니다.");
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "추론 상태 확인 실패"); });
    const poll = async () => {
      try { if (!document.hidden) await refresh(controller.signal); }
      catch (reason) { if (!controller.signal.aborted && mounted.current) setError(await getApiErrorMessage(reason, "작업 목록을 보려면 로그인과 서버 연결이 필요합니다.")); }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => { void poll(); }, 4_000); }
    };
    if (userAi.configuration.assignments.inference) void poll();
    return () => { mounted.current = false; controller.abort(); clearTimeout(timer); operation.current?.abort(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); };
  }, [refresh, userAi.revision, userAi.configuration.assignments.inference]);
  const notifyError = async (reason: unknown) => { const text = await getApiErrorMessage(reason, "작업을 완료하지 못했습니다."); if (mounted.current) setError(text); };
  const run = async () => {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(""); setProgress(0);
    const uploaded: string[] = [];
    try {
      if (!pending.current) {
        if (!files.length || files.length > (mode === "image-to-video" ? 8 : 1)) throw new Error("사용할 파일 개수를 확인하세요.");
        for (let i = 0; i < files.length; i++) {
          setMessage(`${i + 1} / ${files.length} 파일 업로드 중 · 원본 파일은 변경하지 않습니다.`);
          uploaded.push(await uploadInferenceAsset(files[i]!, controller.signal, (value) => { if (mounted.current) setProgress(Math.round((i + value / 100) * 100 / files.length)); }));
        }
        pending.current = { key: crypto.randomUUID(), body: { mode, assets: uploaded, prompt, negativePrompt: negative, seed, frames, steps, strength, yaw, captions: files.map((file) => file.name.replace(/\.[^.]+$/u, "").slice(0, 800)) } };
      }
      setMessage("생성 요청 확인 중… 연결이 끊겨도 같은 요청 키로 중복 생성을 방지합니다.");
      const job = await submitInferenceJob(pending.current.body, pending.current.key, controller.signal);
      pending.current = null; if (!mounted.current) return; setUncertain(false); setJobs((previous) => [job, ...previous.filter((item) => item.id !== job.id)]);
      setMessage("작업을 접수했습니다. 아래에서 상태를 확인하고 필요하면 취소할 수 있습니다. 원본은 보존됩니다.");
    } catch (reason) {
      if (pending.current) setUncertain(true);
      else for (const id of uploaded) void removeUserInferenceUpload(id).catch(() => undefined);
      if (controller.signal.aborted && mounted.current) setMessage("전송을 중지했습니다. 이미 접수된 생성 작업은 목록에서 별도로 취소하세요.");
      else await notifyError(reason);
    } finally { operation.current = null; if (mounted.current) setBusy(false); }
  };
  const download = async (job: InferenceJob, artifact: InferenceArtifact) => {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(""); setProgress(0);
    try {
      setMessage(`${artifact.name} 내려받기 · 파일 무결성 검사 후 제공합니다.`);
      const blob = await downloadInferenceArtifact(job, artifact, controller.signal, (value) => { if (mounted.current) setProgress(Math.min(100, value)); });
      controller.signal.throwIfAborted(); if (!mounted.current) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = artifact.name; anchor.click();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = url;
      setPreview({ url, mime: artifact.mime, name: artifact.name }); setMessage("SHA-256 검사 완료 · 결과를 검토한 뒤 스튜디오에 가져오세요. AI 결과는 원본과 달라질 수 있습니다.");
    } catch (reason) { if (!controller.signal.aborted) await notifyError(reason); }
    finally { operation.current = null; if (mounted.current) setBusy(false); }
  };
  const cancel = async (job: InferenceJob) => { try { await cancelInferenceJob(job.id); await refresh(); } catch (reason) { await notifyError(reason); } };
  return <div className="creator-inference-page">
    <nav aria-label="제작실 이동"><Link href="/studio">← 스튜디오</Link><Link href="/showcase/promo">컷 기반 홍보 영상</Link><a href="/spatial-reader/">공간형 감상</a></nav>
    <header><p className="inference-kicker">MANAGED CLOUD CREATIVE ENGINES</p><h1>그림에서 움직임으로.<br />입체에서 새로운 그림으로.</h1><p>실제 모델 추론으로 만드는 제작실입니다. 모델과 GPU가 준비되지 않으면 생성 성공으로 표시하지 않습니다.</p></header>
    <details className="my-6 rounded-xl border border-line p-4"><summary className="min-h-11 cursor-pointer font-semibold">통합 AI 설정 · 클라우드 런타임 연결</summary><UnifiedAiSettings /></details>
    <section className="inference-modes" aria-label="추론 방식">{MODES.map((option) => <button key={option.value} type="button" aria-pressed={mode === option.value} disabled={busy || uncertain} onClick={() => { setMode(option.value); setFiles([]); setPrompt(option.value === "image-to-video" ? "The character blinks naturally. Hair and clothes move gently in the breeze. Preserve the original character design and colors." : "Clean Korean webtoon character illustration, faithful silhouette, expressive eyes, refined cel shading."); }}><strong>{option.title}</strong><span>{option.description}</span><small>{caps?.enabled && caps.engines[option.value]?.configured ? "모델 설정 확인됨 · 실제 품질은 결과 검토 필요" : "모델 준비 필요"}</small></button>)}</section>
    <div className="inference-layout"><form onSubmit={(event) => { event.preventDefault(); void run(); }}>
      <h2>생성 설정</h2><fieldset disabled={busy || uncertain}>
        <label>{mode === "model-to-2d" ? "GLB 캐릭터 파일 (최대 32MB)" : `원본 이미지 (파일당 8MB${mode === "image-to-video" ? " · 최대 8컷" : " · 1장"})`}
          <input key={mode} type="file" accept={mode === "model-to-2d" ? ".glb" : "image/png,image/jpeg,image/webp"} multiple={mode === "image-to-video"} onChange={(event) => setFiles(Array.from(event.currentTarget.files ?? []))} /></label>
        {!!files.length && <ol>{files.map((file, index) => <li key={`${index}-${file.name}`}><span>{index + 1}. {file.name}</span>{mode === "image-to-video" && <button type="button" disabled={index === 0} onClick={() => setFiles((previous) => { const next = [...previous]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; return next; })}>앞으로</button>}</li>)}</ol>}
        {mode === "image-to-3d" && <p className="inference-note">단일 이미지 추론이므로 보이지 않는 뒷면은 추정됩니다. 결과는 리깅되지 않은 메시입니다. 투명 배경이 아니면 클라우드 런타임에 배경 제거 모델도 필요합니다.</p>}
        <label>연출 / 그림 설명<textarea rows={4} maxLength={2000} value={prompt} required={mode !== "image-to-3d"} onChange={(event) => setPrompt(event.target.value)} /></label>
        <details><summary>품질과 재현 설정</summary><label>피하고 싶은 표현<textarea rows={2} maxLength={2000} value={negative} onChange={(event) => setNegative(event.target.value)} /></label>
          <label>시드<input type="number" min={0} max={2147483647} value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label>
          <label>추론 단계<input type="number" min={10} max={50} value={steps} onChange={(event) => setSteps(Number(event.target.value))} /></label>
          {mode === "image-to-video" && <label>컷당 길이<select value={frames} onChange={(event) => setFrames(Number(event.target.value))}><option value={33}>약 2초 (33프레임)</option><option value={49}>약 3초 (49프레임)</option><option value={81}>약 5초 (81프레임)</option></select></label>}
          {mode === "model-to-2d" && <><label>스타일 변화 강도<input type="range" min={.15} max={.85} step={.05} value={strength} onChange={(event) => setStrength(Number(event.target.value))} /><output>{strength}</output></label><label>모델 시점<input type="range" min={-180} max={180} step={15} value={yaw} onChange={(event) => setYaw(Number(event.target.value))} /><output>{yaw}°</output></label></>}
        </details>
      </fieldset>
      <p className="inference-note">생성을 누르면 선택한 파일이 설정한 관리형 클라우드 런타임으로 업로드됩니다. 비용은 연결한 클라우드 계정에 청구될 수 있으며 다른 유료 경로로 자동 전환하지 않습니다.</p>
      <button className="inference-primary" type="submit" disabled={busy || (!uncertain && (!caps?.enabled || !caps.engines[mode]?.configured || !files.length))}>{uncertain ? "같은 요청으로 접수 여부 다시 확인" : "생성 시작"}</button>
      {uncertain && <button type="button" disabled={busy} onClick={() => { if (window.confirm("이전 요청이 이미 접수됐을 수 있습니다. 작업 목록을 확인했으며 새 요청을 만들까요?")) { pending.current = null; setUncertain(false); } }}>새 요청으로 전환</button>}
      {busy && <button type="button" onClick={() => operation.current?.abort()}>전송 중지</button>}
    </form><section className="inference-results"><h2>작업과 결과</h2><p role="status" aria-live="polite">{message}</p>{busy && <progress value={progress} max={100} aria-label="파일 전송 진행률" />}{error && <p role="alert" className="inference-error">{error}</p>}
      <button type="button" onClick={() => { void refresh().catch(notifyError); }}>작업 목록 새로고침</button>
      <button type="button" disabled={busy || uncertain} onClick={() => { if (window.confirm("사용 중인 작업을 제외한 서버 입력 파일을 삭제할까요? 생성 결과는 보존됩니다.")) void cleanupUserInferenceUploads().then((deleted) => { if (mounted.current) setMessage(`사용하지 않는 입력 파일 ${deleted}개를 정리했습니다.`); }).catch(notifyError); }}>사용하지 않는 서버 입력 정리</button>
      {!jobs.length && <p className="inference-note">아직 표시할 작업이 없습니다. 로그인 후 생성 작업을 접수하면 이곳에 표시됩니다.</p>}
      {jobs.map((job) => <article key={job.id}><div className="inference-job-heading"><h3>{MODES.find((item) => item.value === job.mode)?.title}</h3><span>{STATE[job.state]}</span></div><small>{job.id.slice(0, 12)} · {job.stage}</small>{!TERMINAL.has(job.state) && <><progress value={job.progress} max={100} aria-label="생성 진행률" /><button type="button" onClick={() => { void cancel(job); }}>이 생성 작업 취소</button></>}{job.error && <p className="inference-error">{job.error}</p>}
        {job.artifacts.map((artifact) => <button key={artifact.name} type="button" disabled={busy} onClick={() => { void download(job, artifact); }}>{artifact.name} · {(artifact.bytes / 1048576).toFixed(1)}MB · 검증 후 받기</button>)}
        {TERMINAL.has(job.state) && <button type="button" onClick={() => { if (window.confirm("서버의 생성 결과를 삭제할까요? 필요한 파일을 먼저 보관하세요.")) void deleteUserInferenceJob(job.id).then(() => refresh()).catch(notifyError); }}>서버 결과 삭제</button>}
      </article>)}
      {preview && <figure><figcaption>{preview.name} · 무결성 검증된 파일</figcaption>{preview.mime === "video/mp4" ? <video key={preview.url} src={preview.url} controls muted playsInline preload="metadata" aria-label={`${preview.name} · 소리 없이 재생되는 생성형 애니메이션 미리보기`} /> : preview.mime === "image/png" ? <img src={preview.url} alt="선택한 생성 작업의 결과 또는 참조 이미지" /> : <p>파일을 저장했습니다. GLB는 3D 스튜디오, PNG는 드로잉, MP4는 영상 편집에서 불러올 수 있습니다.</p>}</figure>}
    </section></div>
  </div>;
}
