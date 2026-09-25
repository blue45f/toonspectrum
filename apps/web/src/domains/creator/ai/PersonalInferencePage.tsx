import { Box, Cloud, Download, EyeOff, Film, Loader2, PackageCheck, RefreshCw, Server, Square, WalletCards, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { Container } from "@/shared/components/section";
import { useUnifiedAiAuxSettings } from "@/shared/ai/unified-ai-settings";

import {
  cancelPersonalInferenceJob,
  downloadPersonalInferenceArtifact,
  listPersonalInferenceJobs,
  personalInferenceCapabilities,
  submitPersonalInferenceJob,
  uploadPersonalInferenceAsset,
  type PersonalInferenceCapabilities,
  type PersonalInferenceJob,
  type PersonalInferenceMode,
} from "./personal-inference-client";

const INPUT = "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";
const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-bold text-fg-2 hover:bg-raised disabled:opacity-50";
const MODES: Array<{ id: PersonalInferenceMode; title: string; description: string; icon: typeof Film }> = [
  { id: "image-to-video", title: "컷 → 애니메이션", description: "원본 디자인을 참고한 짧은 움직임을 만듭니다.", icon: Film },
  { id: "image-to-3d", title: "2D → 3D", description: "단일 캐릭터 이미지에서 텍스처 GLB를 추론합니다.", icon: Box },
  { id: "model-to-2d", title: "3D → 웹툰 이미지", description: "GLB 렌더를 웹툰 이미지로 변환합니다.", icon: Square },
];

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function PersonalInferencePage() {
  useDocumentTitle("개인 AI 변환실 · ToonStudio");
  const aux = useUnifiedAiAuxSettings();
  const configured = Boolean(aux.settings.creatorRuntimeBaseUrl && aux.settings.creatorRuntimeToken);
  const [mode, setMode] = useState<PersonalInferenceMode>("image-to-video");
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("캐릭터의 외형과 색상을 유지하고 자연스럽게 눈을 깜빡이며 옷자락이 움직입니다.");
  const [negative, setNegative] = useState("");
  const [seed, setSeed] = useState(42);
  const [frames, setFrames] = useState(49);
  const [steps, setSteps] = useState(30);
  const [strength, setStrength] = useState(0.45);
  const [yaw, setYaw] = useState(0);
  const [capabilities, setCapabilities] = useState<PersonalInferenceCapabilities | null>(null);
  const [jobs, setJobs] = useState<PersonalInferenceJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState("통합 AI 설정의 관리형 클라우드 런타임만 사용합니다. 다른 GPU·모델·키로 자동 전환하지 않습니다.");
  const [error, setError] = useState("");
  const operation = useRef<AbortController | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!configured) {
      setCapabilities(null);
      setJobs([]);
      return;
    }
    const [nextCapabilities, nextJobs] = await Promise.all([
      personalInferenceCapabilities(signal),
      listPersonalInferenceJobs(signal),
    ]);
    if (!signal?.aborted) {
      setCapabilities(nextCapabilities);
      setJobs(nextJobs);
    }
  }, [configured]);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void refresh(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "클라우드 추론 런타임 상태를 확인하지 못했습니다.");
    });
    const timer = globalThis.setInterval(() => {
      if (!document.hidden && configured) void refresh(controller.signal).catch(() => undefined);
    }, 5_000);
    return () => {
      controller.abort();
      globalThis.clearInterval(timer);
      operation.current?.abort();
    };
  }, [aux.revision, configured, refresh]);

  const start = async () => {
    if (!file || busy || !configured) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      setNotice("원본을 관리형 클라우드 런타임으로 분할 업로드하고 SHA-256으로 확인하는 중입니다.");
      const assetId = await uploadPersonalInferenceAsset(file, controller.signal, setProgress);
      const job = await submitPersonalInferenceJob({
        mode,
        assets: [assetId],
        prompt: prompt.slice(0, 2_000),
        negativePrompt: negative.slice(0, 2_000),
        captions: [file.name.replace(/\.[^.]+$/u, "").slice(0, 800)],
        seed,
        frames,
        steps,
        strength,
        yaw,
      }, crypto.randomUUID(), controller.signal);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      setNotice("클라우드 런타임이 작업을 접수했습니다. 같은 요청을 자동 재전송하지 않습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "클라우드 추론 작업을 시작하지 못했습니다.");
    } finally {
      operation.current = null;
      setBusy(false);
    }
  };

  const cancel = async (job: PersonalInferenceJob) => {
    try {
      const next = await cancelPersonalInferenceJob(job.id);
      setJobs((current) => current.map((item) => item.id === next.id ? next : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "취소 요청에 실패했습니다.");
    }
  };

  const download = async (job: PersonalInferenceJob, artifact: PersonalInferenceJob["artifacts"][number]) => {
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      const blob = await downloadPersonalInferenceArtifact(job, artifact, controller.signal, setProgress);
      saveBlob(blob, artifact.name);
      setNotice("결과 파일의 SHA-256 무결성을 확인했습니다. Studio에 가져오기 전 형태와 권리를 검토하세요.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "결과 파일을 받지 못했습니다.");
    } finally {
      operation.current = null;
      setBusy(false);
    }
  };

  return (
    <Container size="wide" className="py-7 sm:py-10">
      <header className="rounded-3xl border border-line bg-panel/60 p-6 sm:p-8">
        <p className="eyebrow text-accent">PERSONAL CREATOR RUNTIME</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-5xl">내 GPU·내 모델로 만드는 변환실</h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-fg-2">영상·2D↔3D 생성은 통합 설정에 등록한 관리형 클라우드 Creator Runtime으로 브라우저가 직접 요청합니다. 운영측 AI 비용·자동 유료 폴백·숨은 재시도는 없습니다.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/settings/ai" className={`${BUTTON} bg-accent text-on-accent`}><Server size={16} /> 클라우드 런타임 설정</Link>
          <Link to="/studio/ecosystem" className={BUTTON}>창작 생태계 작업대</Link>
          <Link to="/studio" className={BUTTON}>Studio</Link>
        </div>
      </header>

      <section className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="AI 실행 준비 상태">
        {[
          { icon: Cloud, label: "실행 위치", value: configured ? "연결한 Creator Runtime" : "연결 필요", detail: "브라우저가 지정한 주소로 직접 요청" },
          { icon: WalletCards, label: "비용", value: "운영측 자동 결제 없음", detail: "내 런타임·공급자 비용만 적용" },
          { icon: EyeOff, label: "데이터", value: "원본 외부 전송", detail: "선택한 런타임에만 업로드" },
          { icon: PackageCheck, label: "결과", value: "SHA-256 확인", detail: "모델·시드·설정을 작업 기록에 보존" },
        ].map(({ icon: Icon, label, value, detail }) => (
          <article key={label} className="rounded-2xl border border-line bg-card/75 p-4">
            <Icon size={17} className="text-accent" aria-hidden="true" />
            <p className="mt-3 text-[0.64rem] font-black uppercase tracking-[0.13em] text-fg-3">{label}</p>
            <strong className="mt-1 block text-sm text-fg">{value}</strong>
            <span className="mt-1 block text-xs leading-5 text-fg-3">{detail}</span>
          </article>
        ))}
      </section>

      <p className="my-5 rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg-2" role="status">{notice}</p>
      {error ? <p className="mb-5 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad" role="alert">{error}</p> : null}
      {!configured ? (
        <section className="rounded-2xl border border-warn/40 bg-warn/10 p-5">
          <h2 className="font-black text-fg">클라우드 런타임 연결이 필요합니다.</h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">Creator Runtime 주소와 32자 이상의 토큰을 통합 AI 설정에 등록하세요. CORS는 ToonStudio origin만 명시적으로 허용하세요.</p>
        </section>
      ) : null}

      <section className="mt-8 grid gap-3 md:grid-cols-3" aria-label="변환 방식">
        {MODES.map((item) => {
          const Icon = item.icon;
          const ready = capabilities?.engines[item.id]?.configured === true;
          return (
            <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => { setMode(item.id); setFile(null); }} className={`rounded-2xl border p-4 text-left ${mode === item.id ? "border-accent bg-accent-soft" : "border-line bg-card"}`}>
              <Icon size={20} className="text-accent" />
              <strong className="mt-3 block text-fg">{item.title}</strong>
              <span className="mt-1 block text-xs leading-5 text-fg-3">{item.description}</span>
              <small className={ready ? "mt-3 block text-good" : "mt-3 block font-semibold text-fg-2"}>{ready ? capabilities?.engines[item.id]?.model : "클라우드 모델 준비 필요"}</small>
            </button>
          );
        })}
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-lg font-black text-fg">생성 설정</h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-bold text-fg">원본 파일
              <input className={INPUT} type="file" accept={mode === "model-to-2d" ? ".glb,model/gltf-binary" : "image/png,image/jpeg,image/webp"} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
            <label className="grid gap-1 text-sm font-bold text-fg">연출·그림 설명
              <textarea className={`${INPUT} min-h-28`} maxLength={2_000} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-bold text-fg">피하고 싶은 표현
              <textarea className={INPUT} maxLength={2_000} value={negative} onChange={(event) => setNegative(event.target.value)} />
            </label>
            <details className="rounded-xl border border-line p-3 text-sm">
              <summary className="min-h-11 cursor-pointer font-bold">재현·품질 설정</summary>
              <div className="grid gap-2">
                <label>시드<input className={INPUT} type="number" min={0} max={2_147_483_647} value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label>
                <label>단계<input className={INPUT} type="number" min={10} max={50} value={steps} onChange={(event) => setSteps(Number(event.target.value))} /></label>
                {mode === "image-to-video" ? <label>프레임<select className={INPUT} value={frames} onChange={(event) => setFrames(Number(event.target.value))}><option value={33}>33</option><option value={49}>49</option><option value={81}>81</option></select></label> : null}
                {mode === "model-to-2d" ? <><label>스타일 강도<input className={INPUT} type="number" min={0.15} max={0.85} step={0.05} value={strength} onChange={(event) => setStrength(Number(event.target.value))} /></label><label>시점<input className={INPUT} type="number" min={-180} max={180} step={15} value={yaw} onChange={(event) => setYaw(Number(event.target.value))} /></label></> : null}
              </div>
            </details>
            <button type="button" className={`${BUTTON} bg-accent text-on-accent`} disabled={!configured || !file || busy || capabilities?.engines[mode]?.configured !== true} onClick={() => void start()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Server size={16} />} 생성 시작
            </button>
            {busy ? <button type="button" className={BUTTON} onClick={() => operation.current?.abort()}><X size={15} /> 현재 전송 중지</button> : null}
            {busy ? <progress className="w-full" max={100} value={progress}>{progress}%</progress> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-black text-fg">클라우드 런타임 작업</h2>
            <button type="button" className={BUTTON} onClick={() => void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "새로고침 실패"))}><RefreshCw size={15} /> 새로고침</button>
          </div>
          {!jobs.length ? <p className="mt-4 text-sm text-fg-3">아직 작업이 없습니다.</p> : (
            <div className="mt-4 grid gap-3">{jobs.map((job) => (
              <article key={job.id} className="rounded-xl border border-line bg-panel p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><strong className="text-sm text-fg">{MODES.find((item) => item.id === job.mode)?.title}</strong><p className="mt-1 text-xs text-fg-3">{job.state} · {job.progress}% · {job.stage}</p></div>
                  {!(["succeeded", "failed", "cancelled", "interrupted"] as string[]).includes(job.state) ? <button type="button" className={BUTTON} onClick={() => void cancel(job)}>취소</button> : null}
                </div>
                {job.error ? <p className="mt-2 text-xs text-bad">{job.error}</p> : null}
                {job.artifacts.map((artifact) => <button key={artifact.name} type="button" className={`${BUTTON} mt-3`} onClick={() => void download(job, artifact)} disabled={busy}><Download size={15} /> {artifact.name}</button>)}
              </article>
            ))}</div>
          )}
        </section>
      </div>
    </Container>
  );
}
