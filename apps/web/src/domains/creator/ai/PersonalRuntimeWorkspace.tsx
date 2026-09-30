import { Box, Download, Film, LoaderCircle, RefreshCw, Server, Sparkles, Square, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { useUnifiedAiAuxSettings } from "@/shared/ai/unified-ai-settings";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import { AI_RUNTIME_ANCHOR } from "./ai-studio-hub";
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
const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-bold text-fg-2 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-50";
const POLL_INTERVAL_MS = 5_000;
const PROMPT_LIMIT = 2_000;

const TERMINAL_STATES: ReadonlySet<PersonalInferenceJob["state"]> = new Set(["succeeded", "failed", "cancelled", "interrupted"]);

const MODES: readonly {
  readonly id: PersonalInferenceMode;
  readonly icon: LucideIcon;
  readonly title: { readonly ko: string; readonly en: string };
  readonly description: { readonly ko: string; readonly en: string };
}[] = [
  { id: "image-to-video", icon: Film, title: { ko: "컷 → 애니메이션", en: "Panel → animation" }, description: { ko: "원본 디자인을 참고한 짧은 움직임을 만듭니다.", en: "Creates short motion based on the source design." } },
  { id: "image-to-3d", icon: Box, title: { ko: "2D → 3D", en: "2D → 3D" }, description: { ko: "단일 캐릭터 이미지에서 텍스처 GLB를 추론합니다.", en: "Infers a textured GLB from a single character image." } },
  { id: "model-to-2d", icon: Square, title: { ko: "3D → 웹툰 이미지", en: "3D → webtoon image" }, description: { ko: "GLB 렌더를 웹툰 이미지로 변환합니다.", en: "Converts a GLB render into a webtoon image." } },
];

const JOB_STATE_LABELS: Readonly<Record<PersonalInferenceJob["state"], { readonly ko: string; readonly en: string }>> = {
  queued: { ko: "대기 중", en: "Queued" },
  running: { ko: "변환 중", en: "Running" },
  succeeded: { ko: "완료", en: "Done" },
  failed: { ko: "실패", en: "Failed" },
  cancelled: { ko: "취소됨", en: "Cancelled" },
  interrupted: { ko: "중단됨", en: "Interrupted" },
};

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

/**
 * 사용자가 통합 AI 설정에 등록한 Creator Runtime으로 영상·3D 변환을 직접 요청하는 작업대.
 * 다른 GPU·모델·키로 자동 전환하지 않고, 같은 요청을 숨은 재시도로 다시 보내지 않는다.
 */
export function PersonalRuntimeWorkspace() {
  const bt = useBilingual("PersonalInferencePage");
  const aux = useUnifiedAiAuxSettings();
  const configured = Boolean(aux.settings.creatorRuntimeBaseUrl && aux.settings.creatorRuntimeToken);

  const [mode, setMode] = useState<PersonalInferenceMode>("image-to-video");
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState(() => bt("캐릭터의 외형과 색상을 유지하고 자연스럽게 눈을 깜빡이며 옷자락이 움직입니다.", "Keep the character's look and colors; blink naturally while the clothes sway."));
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
  const [notice, setNotice] = useState("");
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
      if (!controller.signal.aborted) setError(errorMessage(cause, bt("클라우드 추론 런타임 상태를 확인하지 못했습니다.", "Couldn't check the cloud inference runtime status.")));
    });
    const timer = globalThis.setInterval(() => {
      if (!document.hidden && configured) void refresh(controller.signal).catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      globalThis.clearInterval(timer);
      operation.current?.abort();
    };
  }, [aux.revision, bt, configured, refresh]);

  const modeReady = capabilities?.engines[mode]?.configured === true;

  const start = async () => {
    if (!file || busy || !configured) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      setNotice(bt("원본을 관리형 클라우드 런타임으로 분할 업로드하고 SHA-256으로 확인하는 중입니다.", "Uploading the source to the managed cloud runtime in chunks and verifying with SHA-256…"));
      const assetId = await uploadPersonalInferenceAsset(file, controller.signal, setProgress);
      const job = await submitPersonalInferenceJob({
        mode,
        assets: [assetId],
        prompt: prompt.slice(0, PROMPT_LIMIT),
        negativePrompt: negative.slice(0, PROMPT_LIMIT),
        captions: [file.name.replace(/\.[^.]+$/u, "").slice(0, 800)],
        seed,
        frames,
        steps,
        strength,
        yaw,
      }, crypto.randomUUID(), controller.signal);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      setNotice(bt("클라우드 런타임이 작업을 접수했습니다. 같은 요청을 자동 재전송하지 않습니다.", "The cloud runtime accepted the job. The same request won't be auto-resubmitted."));
    } catch (cause) {
      setError(errorMessage(cause, bt("클라우드 추론 작업을 시작하지 못했습니다.", "Couldn't start the cloud inference job.")));
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
      setError(errorMessage(cause, bt("취소 요청에 실패했습니다.", "The cancel request failed.")));
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
      setNotice(bt("결과 파일의 SHA-256 무결성을 확인했습니다. Studio에 가져오기 전 형태와 권리를 검토하세요.", "SHA-256 integrity of the result file verified. Review its form and rights before importing into Studio."));
    } catch (cause) {
      setError(errorMessage(cause, bt("결과 파일을 받지 못했습니다.", "Couldn't download the result file.")));
    } finally {
      operation.current = null;
      setBusy(false);
    }
  };

  const modeTitle = (id: PersonalInferenceMode) => {
    const entry = MODES.find((item) => item.id === id);
    return entry ? bt(entry.title.ko, entry.title.en) : id;
  };

  return (
    <section id={AI_RUNTIME_ANCHOR} aria-labelledby="ai-runtime-title" className="scroll-mt-24 rounded-[2rem] border border-line bg-panel/60 p-4 sm:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">Personal creator runtime</p>
          <h2 id="ai-runtime-title" className="mt-1 text-2xl font-black tracking-[-0.03em] text-fg">
            {bt("내 AI 런타임으로 영상·3D 변환", "Video and 3D conversion on my AI runtime")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-fg-2">
            {bt("통합 AI 설정에 등록한 Creator Runtime으로 브라우저가 직접 요청합니다. 운영측 AI 비용·자동 유료 폴백·숨은 재시도는 없습니다.", "Your browser sends requests straight to the Creator Runtime registered in unified AI settings. No operator AI billing, automatic paid fallback or hidden retries.")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className={cn(
            "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-bold",
            configured ? "border-good/45 bg-good/12 text-fg" : "border-warn/45 bg-warn/12 text-fg",
          )}>
            <span aria-hidden="true" className={cn("size-2 rounded-full", configured ? "bg-good" : "bg-warn")} />
            {configured ? bt("런타임 연결됨", "Runtime connected") : bt("런타임 연결 필요", "Runtime not connected")}
          </span>
          <Link href="/settings/ai" className={cn(BUTTON, "border-accent bg-accent text-on-accent hover:bg-accent hover:text-on-accent hover:opacity-90")}>
            <Server size={16} aria-hidden="true" /> {bt("클라우드 런타임 설정", "Cloud runtime settings")}
          </Link>
        </div>
      </header>

      {notice ? <p className="mt-4 rounded-xl border border-line bg-card px-4 py-3 text-sm text-fg-2" role="status">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-fg" role="alert">{error}</p> : null}
      {!configured ? (
        <div className="mt-4 rounded-2xl border border-warn/40 bg-warn/10 p-4">
          <h3 className="font-black text-fg">{bt("클라우드 런타임 연결이 필요합니다.", "Connect a cloud runtime first.")}</h3>
          <p className="mt-1 text-sm leading-6 text-fg-2">{bt("Creator Runtime 주소와 32자 이상의 토큰을 통합 AI 설정에 등록하세요. CORS는 ToonStudio origin만 명시적으로 허용하세요.", "Register your Creator Runtime address and a token of 32+ characters in unified AI settings. Allow CORS explicitly for the ToonStudio origin only.")}</p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 md:grid-cols-3" role="group" aria-label={bt("변환 방식", "Conversion modes")}>
        {MODES.map((item) => {
          const Icon = item.icon;
          const engine = capabilities?.engines[item.id];
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => { setMode(item.id); setFile(null); }}
              className={cn(
                "rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                active ? "border-accent bg-accent-soft" : "border-line bg-card hover:border-line-strong",
              )}
            >
              <Icon size={20} className="text-accent" aria-hidden="true" />
              <strong className="mt-3 block text-fg">{bt(item.title.ko, item.title.en)}</strong>
              <span className="mt-1 block text-xs leading-5 text-fg-2">{bt(item.description.ko, item.description.en)}</span>
              <small className={cn("mt-3 block text-xs font-semibold", engine?.configured ? "text-good" : "text-fg-3")}>
                {engine?.configured ? engine.model : bt("클라우드 모델 준비 필요", "Cloud model needs setup")}
              </small>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <section id="ai-generation-settings" aria-labelledby="ai-generation-settings-title" className="scroll-mt-24 rounded-2xl border border-line bg-card p-5">
          <h3 id="ai-generation-settings-title" className="text-lg font-black text-fg">{bt("생성 설정", "Generation settings")}</h3>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-bold text-fg">{bt("원본 파일", "Source file")}
              <input className={INPUT} type="file" accept={mode === "model-to-2d" ? ".glb,model/gltf-binary" : "image/png,image/jpeg,image/webp"} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
            <label className="grid gap-1 text-sm font-bold text-fg">{bt("연출·그림 설명", "Direction & image description")}
              <textarea className={cn(INPUT, "min-h-28")} maxLength={PROMPT_LIMIT} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-bold text-fg">{bt("피하고 싶은 표현", "Expressions to avoid")}
              <textarea className={INPUT} maxLength={PROMPT_LIMIT} value={negative} onChange={(event) => setNegative(event.target.value)} />
            </label>
            <details className="rounded-xl border border-line p-3 text-sm">
              <summary className="min-h-11 cursor-pointer content-center font-bold">{bt("재현·품질 설정", "Reproducibility & quality")}</summary>
              <div className="grid gap-2">
                <label>{bt("시드", "Seed")}<input className={INPUT} type="number" min={0} max={2_147_483_647} value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label>
                <label>{bt("단계", "Steps")}<input className={INPUT} type="number" min={10} max={50} value={steps} onChange={(event) => setSteps(Number(event.target.value))} /></label>
                {mode === "image-to-video" ? <label>{bt("프레임", "Frames")}<select className={INPUT} value={frames} onChange={(event) => setFrames(Number(event.target.value))}><option value={33}>33</option><option value={49}>49</option><option value={81}>81</option></select></label> : null}
                {mode === "model-to-2d" ? <><label>{bt("스타일 강도", "Style strength")}<input className={INPUT} type="number" min={0.15} max={0.85} step={0.05} value={strength} onChange={(event) => setStrength(Number(event.target.value))} /></label><label>{bt("시점", "View angle")}<input className={INPUT} type="number" min={-180} max={180} step={15} value={yaw} onChange={(event) => setYaw(Number(event.target.value))} /></label></> : null}
              </div>
            </details>
            <button type="button" className={cn(BUTTON, "border-accent bg-accent text-on-accent hover:bg-accent hover:text-on-accent hover:opacity-90")} disabled={!configured || !file || busy || !modeReady} onClick={() => void start()}>
              {busy ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Server size={16} aria-hidden="true" />} {bt("생성 시작", "Start generation")}
            </button>
            {!configured || !modeReady ? (
              <p className="text-xs leading-5 text-fg-3">
                {!configured
                  ? bt("런타임을 연결하면 생성 버튼이 활성화됩니다.", "Connect a runtime to enable generation.")
                  : bt("선택한 변환 방식의 모델이 런타임에 준비되지 않았습니다.", "The selected conversion isn't ready on your runtime.")}
              </p>
            ) : null}
            {busy ? <button type="button" className={BUTTON} onClick={() => operation.current?.abort()}><X size={15} aria-hidden="true" /> {bt("현재 전송 중지", "Stop current transfer")}</button> : null}
            {busy ? <progress className="w-full accent-[var(--color-accent)]" max={100} value={progress} aria-label={bt("전송 진행률", "Transfer progress")}>{progress}%</progress> : null}
          </div>
        </section>

        <section aria-labelledby="ai-runtime-jobs-title" className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 id="ai-runtime-jobs-title" className="text-lg font-black text-fg">{bt("클라우드 런타임 작업", "Cloud runtime jobs")}</h3>
            <button type="button" className={BUTTON} onClick={() => void refresh().catch((cause: unknown) => setError(errorMessage(cause, bt("새로고침 실패", "Refresh failed"))))}><RefreshCw size={15} aria-hidden="true" /> {bt("새로고침", "Refresh")}</button>
          </div>
          {!jobs.length ? (
            <ActionableEmptyState
              className="mt-4 p-4 sm:p-5"
              icon={configured ? Sparkles : Server}
              title={configured ? bt("첫 변환 작업을 시작하세요", "Start your first conversion job") : bt("런타임을 연결하면 작업 기록이 여기에 모입니다", "Job history will appear here once a runtime is connected")}
              description={configured
                ? bt("생성 설정에서 원본 파일과 설명을 선택하면 모델·시드·처리 단계와 결과 파일을 이 목록에서 확인할 수 있습니다.", "Pick a source file and description in generation settings — model, seed, processing stages, and result files will appear in this list.")
                : bt("통합 AI 설정에 Creator Runtime 주소와 토큰을 등록한 뒤 이 화면으로 돌아오세요. 자동 유료 폴백이나 다른 공급자로의 숨은 전환은 없습니다.", "Register your Creator Runtime address and token in unified AI settings, then return here. There is no automatic paid fallback or hidden switching to other providers.")}
              primary={configured
                ? { href: "#ai-generation-settings", label: bt("생성 설정으로 이동", "Go to generation settings") }
                : { href: "/settings/ai", label: bt("클라우드 런타임 연결", "Connect cloud runtime") }}
              secondary={{ href: "/help", label: bt("연결 문제 진단", "Diagnose connection issues") }}
            />
          ) : (
            <ul className="mt-4 grid gap-3">{jobs.map((job) => {
              const state = JOB_STATE_LABELS[job.state];
              return (
                <li key={job.id} className="rounded-xl border border-line bg-panel p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong className="text-sm text-fg">{modeTitle(job.mode)}</strong>
                      <p className="mt-1 text-xs text-fg-2">{bt(state.ko, state.en)} · {job.progress}% · {job.stage}</p>
                    </div>
                    {!TERMINAL_STATES.has(job.state) ? <button type="button" className={BUTTON} onClick={() => void cancel(job)}>{bt("취소", "Cancel")}</button> : null}
                  </div>
                  {job.error ? <p className="mt-2 text-xs text-bad">{job.error}</p> : null}
                  {job.artifacts.map((artifact) => <button key={artifact.name} type="button" className={cn(BUTTON, "mt-3")} onClick={() => void download(job, artifact)} disabled={busy}><Download size={15} aria-hidden="true" /> {artifact.name}</button>)}
                </li>
              );
            })}</ul>
          )}
        </section>
      </div>
    </section>
  );
}
