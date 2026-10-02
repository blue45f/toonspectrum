import { Box, Download, FileVideo, History, ImageIcon, LoaderCircle, Play, Plus, Square, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import { AiStudioPageHeader } from "../ai/AiStudioSurfaceNav";
import { localSpatialImage } from "../spatial-reader/spatial-book";
import { GlbCapture } from "./GlbCapture";
import {
  FileDropZone,
  GenerativeModePicker,
  InferenceStepper,
  MediaServerStatusCard,
  PromoClipAssembler,
  type PromoClip,
} from "./GenerativeParts";
import { exportGeneratedClips } from "./generated-video-export";
import {
  ASPECT_OPTIONS,
  GENERATIVE_MODES,
  generativeMode,
  generativeModeReadiness,
  inferenceStateLabel,
  isAspectOption,
  isVideoFrameOption,
  MAX_PROMO_CLIPS,
  VIDEO_FRAME_OPTIONS,
  VIDEO_FRAMES_PER_SECOND,
  type GenerativeMode,
} from "./generative-modes";
import { isInferenceTerminal, type InferenceKind, type InferenceRequest } from "./media-inference-client";
import { useMediaInference, type MediaInferenceError } from "./useMediaInference";

const INPUT = "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/35";
const SECONDARY_BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 text-sm font-bold text-fg-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
const INPUT_IMAGE_EDGE = 1024;
const PROMPT_LIMIT = 2_000;
const NEGATIVE_LIMIT = 1_000;
const MAX_SEED = 2_147_483_647;
const DEFAULT_PROMPTS = new Set(GENERATIVE_MODES.flatMap((mode) => [mode.defaultPrompt.ko, mode.defaultPrompt.en]));

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * `/studio/generate` — 생성 실험실.
 * 변환 방식 선택 → 서버 준비 상태·조건 확인 → 입력 준비 → 결과 확인 → 홍보 영상 잇기 순서로 구성한다.
 * 추론 서버가 준비되지 않으면 생성 버튼을 막고 실제로 쓸 수 있는 대안을 보여준다.
 */
export function StudioGenerativePage() {
  const bt = useBilingual("StudioGenerativePage");
  useDocumentTitle(bt("생성 실험실 · ToonStudio", "Generative lab · ToonStudio"));
  const formId = useId();
  const inference = useMediaInference();
  const [kind, setKind] = useState<InferenceKind>("image-to-video");
  const mode = generativeMode(kind);
  const [image, setImage] = useState("");
  const [imageName, setImageName] = useState("");
  const [glb, setGlb] = useState<File | null>(null);
  const [prompt, setPrompt] = useState(() => bt(mode.defaultPrompt.ko, mode.defaultPrompt.en));
  const [negative, setNegative] = useState("");
  const [seed, setSeed] = useState(42);
  const [frames, setFrames] = useState<InferenceRequest["frames"]>(81);
  const [aspect, setAspect] = useState<InferenceRequest["aspect"]>("landscape");
  const [strength, setStrength] = useState(0.45);
  const [localError, setLocalError] = useState("");
  const [clips, setClips] = useState<readonly PromoClip[]>([]);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const imageSequence = useRef(0);

  useEffect(() => () => exportAbort.current?.abort(), []);

  const status = inference.probe.phase === "ready" ? inference.probe.status : null;
  const statusFailed = inference.probe.phase === "failed";
  const readinessOf = (target: InferenceKind) => generativeModeReadiness(status, statusFailed, target);
  const readiness = readinessOf(kind);
  const job = inference.job;
  const active = Boolean(job && !isInferenceTerminal(job.state));
  const canGenerate = readiness.state === "ready" && Boolean(image) && !inference.busy && !active;

  const chooseMode = (next: GenerativeMode) => {
    if (next.kind === kind) return;
    setKind(next.kind);
    inference.clearResult();
    setLocalError("");
    // 사용자가 고친 설명은 유지하고, 기본 문구일 때만 새 방식의 기본 문구로 바꾼다.
    if (DEFAULT_PROMPTS.has(prompt.trim())) setPrompt(bt(next.defaultPrompt.ko, next.defaultPrompt.en));
  };

  const chooseImage = async (file: File) => {
    const sequence = ++imageSequence.current;
    setLocalError("");
    try {
      const source = await localSpatialImage(file, INPUT_IMAGE_EDGE);
      if (sequence !== imageSequence.current) return;
      setImage(source);
      setImageName(file.name);
    } catch (cause) {
      if (sequence === imageSequence.current) setLocalError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const clearImage = () => {
    imageSequence.current += 1;
    setImage("");
    setImageName("");
  };

  const run = () => {
    if (!canGenerate) return;
    if (!image) {
      setLocalError(bt("변환할 캐릭터 이미지 또는 3D 구도를 먼저 준비해 주세요.", "Prepare a character image or 3D view first."));
      return;
    }
    setLocalError("");
    void inference.submit({ kind, image, prompt, negative, seed, frames, aspect, strength });
  };

  const assemble = async () => {
    if (exportProgress !== null || !clips.length) return;
    const controller = new AbortController();
    exportAbort.current = controller;
    setExportProgress(0);
    setLocalError("");
    try {
      const blob = await exportGeneratedClips(clips.map(({ blob: clipBlob, caption }) => ({ blob: clipBlob, caption })), controller.signal, setExportProgress);
      download(blob, `toonstudio-generated-promo.${blob.type === "video/mp4" ? "mp4" : "webm"}`);
    } catch (cause) {
      if (!controller.signal.aborted) setLocalError(cause instanceof Error ? cause.message : bt("영상 연결에 실패했어요.", "Couldn't stitch the videos."));
    } finally {
      setExportProgress(null);
      exportAbort.current = null;
    }
  };

  const result = inference.result;
  const resultKind = result?.blob.type.startsWith("video/")
    ? "video"
    : result?.blob.type.startsWith("image/")
      ? "image"
      : result ? "model" : null;
  const errorText = inference.error ? mediaErrorText(inference.error, bt) : "";
  const disabledReason = readiness.state !== "ready"
    ? bt("추론 서버가 이 방식을 실행할 준비가 되면 생성할 수 있어요.", "You can generate once the server is ready for this mode.")
    : !image
      ? bt("입력 이미지를 넣으면 생성 버튼이 켜져요.", "Add an input image to enable generation.")
      : active
        ? bt("진행 중인 작업이 끝나면 새로 생성할 수 있어요.", "Wait for the current job to finish.")
        : "";

  return (
    <div data-ai-hub="generate" className="min-w-0 break-keep">
      <Container size="wide" className="space-y-6 py-7 sm:space-y-8 sm:py-10">
        <AiStudioPageHeader
          current="generate"
          eyebrow="Generative lab"
          introMotif="spark"
          title={bt("캐릭터에서, 움직이는 이야기로", "From characters to moving stories")}
          lede={bt("원본은 그대로 두고 영상·3D·2D 결과를 별도 파일로 만들어요. 준비되지 않은 기능은 가짜 결과 대신 이유와 대안을 먼저 보여 드려요.", "Your original stays untouched while video, 3D and 2D results are saved as separate files. Anything not ready shows the reason and an alternative instead of a fake result.")}
        />

        <GenerativeModePicker selected={kind} readinessOf={readinessOf} disabled={inference.busy || active} onSelect={chooseMode} />

        <MediaServerStatusCard probe={inference.probe} mode={mode} readiness={readiness} onRetry={inference.retryStatus} />

        {localError || errorText ? (
          <p role="alert" className="rounded-2xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm leading-6 text-fg">
            {localError || errorText}
          </p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <form
            aria-labelledby={`${formId}-input`}
            onSubmit={(event) => {
              event.preventDefault();
              run();
            }}
            className="min-w-0 rounded-3xl border border-line bg-card/85 p-4 sm:p-6"
          >
            <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Step 2</p>
            <h2 id={`${formId}-input`} className="mt-1 text-xl font-black text-fg">{bt("입력 준비", "Prepare the input")}</h2>
            <p className="mt-1 text-sm leading-6 text-fg-2">{bt(mode.input.ko, mode.input.en)}</p>

            <div className="mt-4 grid gap-4">
              {kind === "render-to-2d" ? (
                <FileDropZone
                  label={bt("3D 캐릭터 GLB 선택", "Choose a 3D character GLB")}
                  hint={bt("텍스처를 포함한 GLB · 30MB 이하 · 끌어 놓아도 돼요", "Self-contained GLB · up to 30 MB · drag and drop works")}
                  accept=".glb,model/gltf-binary"
                  fileName={glb?.name}
                  disabled={inference.busy || active}
                  onFile={(file) => {
                    setGlb(file);
                    clearImage();
                  }}
                />
              ) : null}
              {kind === "render-to-2d" && glb ? (
                <GlbCapture
                  file={glb}
                  onCapture={(source) => {
                    imageSequence.current += 1;
                    setImage(source);
                    setImageName(bt("3D 구도 캡처", "3D view capture"));
                  }}
                  onError={setLocalError}
                />
              ) : null}
              <FileDropZone
                label={kind === "render-to-2d"
                  ? bt("또는 3D 캡처 PNG 선택", "Or choose a 3D capture PNG")
                  : kind === "image-to-3d"
                    ? bt("캐릭터 정면 이미지 선택", "Choose a front-facing character image")
                    : bt("만화 컷 · 구도 이미지 선택", "Choose a panel or composition image")}
                hint={bt("PNG·JPEG·WebP · 긴 변 1024px로 맞춰 보내요 · 끌어 놓아도 돼요", "PNG, JPEG or WebP · resized to 1024 px on the long edge · drag and drop works")}
                accept={IMAGE_ACCEPT}
                fileName={imageName || undefined}
                disabled={inference.busy || active}
                onFile={(file) => void chooseImage(file)}
              />
              {image ? (
                <figure className="relative overflow-hidden rounded-2xl border border-line bg-panel">
                  <img src={image} alt={bt("변환 입력 미리보기", "Input preview")} className="mx-auto max-h-72 w-full bg-raised object-contain" />
                  <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-fg-2">
                    <span className="truncate">{imageName}</span>
                    <button type="button" onClick={clearImage} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-bold text-fg-2 hover:text-fg">
                      <X size={14} aria-hidden="true" />
                      {bt("입력 지우기", "Clear input")}
                    </button>
                  </figcaption>
                </figure>
              ) : null}

              <label className="grid gap-1.5 text-sm font-bold text-fg">
                {bt("연출·표현 설명", "Direction & description")}
                <textarea className={cn(INPUT, "min-h-24 resize-y leading-6")} value={prompt} maxLength={PROMPT_LIMIT} rows={3} onChange={(event) => setPrompt(event.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-fg">
                {bt("피하고 싶은 표현 (선택)", "Things to avoid (optional)")}
                <textarea className={cn(INPUT, "min-h-16 resize-y leading-6")} value={negative} maxLength={NEGATIVE_LIMIT} rows={2} onChange={(event) => setNegative(event.target.value)} />
              </label>

              <details className="rounded-2xl border border-line bg-panel/50 px-3">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-fg">{bt("고급 설정 · 재현·길이·비율", "Advanced · seed, length, ratio")}</summary>
                <div className="grid gap-3 pb-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-bold text-fg-2">
                    {bt("재현 시드", "Seed")}
                    <input className={INPUT} type="number" min={0} max={MAX_SEED} value={seed} onChange={(event) => setSeed(Math.max(0, Math.min(MAX_SEED, Math.trunc(Number(event.target.value) || 0))))} />
                  </label>
                  {kind === "image-to-video" ? (
                    <>
                      <label className="grid gap-1 text-xs font-bold text-fg-2">
                        {bt("길이", "Length")}
                        <select className={INPUT} value={frames} onChange={(event) => { const value = Number(event.target.value); if (isVideoFrameOption(value)) setFrames(value); }}>
                          {VIDEO_FRAME_OPTIONS.map((value) => (
                            <option key={value} value={value}>{(value / VIDEO_FRAMES_PER_SECOND).toFixed(2)}{bt("초", "s")} · {value}{bt("프레임", " frames")}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs font-bold text-fg-2">
                        {bt("화면 비율", "Aspect ratio")}
                        <select className={INPUT} value={aspect} onChange={(event) => { if (isAspectOption(event.target.value)) setAspect(event.target.value); }}>
                          {ASPECT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{bt(option.label.ko, option.label.en)}</option>)}
                        </select>
                      </label>
                    </>
                  ) : null}
                  {kind === "render-to-2d" ? (
                    <label className="grid gap-1 text-xs font-bold text-fg-2 sm:col-span-2">
                      {bt(`변환 강도 ${strength.toFixed(2)}`, `Strength ${strength.toFixed(2)}`)}
                      <input type="range" min={0.15} max={0.8} step={0.05} value={strength} onChange={(event) => setStrength(Number(event.target.value))} className="min-h-11 accent-[var(--color-accent)]" />
                      <span className="font-normal text-fg-3">{bt("낮을수록 원본 구도, 높을수록 2D 스타일 변화가 커요.", "Lower keeps the original framing; higher changes the 2D style more.")}</span>
                    </label>
                  ) : null}
                </div>
              </details>

              {kind === "image-to-3d" ? (
                <p className="text-xs leading-5 text-fg-3">{bt("Hunyuan3D 형상 추론으로 GLB 메시를 만들어요. 자동 리깅·PBR 텍스처 완성은 포함하지 않아요.", "Creates a GLB mesh with Hunyuan3D shape inference. Automatic rigging and PBR texturing are not included.")}</p>
              ) : null}

              <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-fg-3" aria-live="polite">{disabledReason}</p>
                <button
                  type="submit"
                  disabled={!canGenerate}
                  className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-black text-on-accent shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {inference.busy ? <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
                  {inference.busy ? bt("처리 중…", "Working…") : bt("실제 모델로 생성", "Generate with the real model")}
                </button>
              </div>
            </div>
          </form>

          <section aria-labelledby={`${formId}-result`} className="min-w-0 rounded-3xl border border-line bg-card/85 p-4 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Result</p>
            <h2 id={`${formId}-result`} className="mt-1 text-xl font-black text-fg">{bt("결과 확인", "Review the result")}</h2>
            {job ? (
              <div className="mt-4 grid gap-3">
                <InferenceStepper state={job.state} />
                <p role="status" className="flex flex-wrap items-center gap-x-2 text-sm font-bold text-fg">
                  {bt(inferenceStateLabel(job.state).ko, inferenceStateLabel(job.state).en)}
                  <code className="text-xs font-normal text-fg-3">#{job.id.slice(0, 8)}</code>
                </p>
                {job.error ? <p className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-xs leading-5 text-fg">{job.error}</p> : null}
                <div className="flex flex-wrap gap-2">
                  {!isInferenceTerminal(job.state) ? (
                    <button type="button" className={SECONDARY_BUTTON} onClick={() => void inference.cancel()}>
                      <Square size={14} aria-hidden="true" />
                      {bt("서버 작업 취소", "Cancel on server")}
                    </button>
                  ) : null}
                  {job.state === "succeeded" && !result ? (
                    <button type="button" className={cn(SECONDARY_BUTTON, "border-accent/50 text-accent")} disabled={inference.busy} onClick={() => void inference.loadResult()}>
                      <Download size={15} aria-hidden="true" />
                      {bt("검증된 결과 불러오기", "Load the verified result")}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-line bg-panel/50 px-4 py-8 text-center">
                <ImageIcon size={26} className="mx-auto text-fg-3" aria-hidden="true" />
                <p className="mt-2 text-sm font-bold text-fg">{bt("아직 생성한 결과가 없어요", "No results yet")}</p>
                <p className="mt-1 text-xs leading-5 text-fg-3">{bt("접수 → 대기 → 생성 → 완료 순서로 여기에 표시돼요. 결과 파일이 없으면 완료로 표시하지 않아요.", "Progress appears here: received → queued → generating → done. Nothing is marked done without a result file.")}</p>
              </div>
            )}

            {result ? (
              <div className="mt-4 grid gap-3">
                <div className="overflow-hidden rounded-2xl border border-line bg-panel">
                  {resultKind === "video" ? (
                    <video controls muted playsInline src={result.url} className="max-h-[28rem] w-full object-contain" />
                  ) : resultKind === "image" ? (
                    <img src={result.url} alt={bt("AI 생성 결과", "AI-generated result")} className="max-h-[28rem] w-full object-contain" />
                  ) : (
                    <p className="flex items-center gap-2 p-5 text-sm font-bold text-fg">
                      <Box size={18} className="text-accent" aria-hidden="true" />
                      {bt(`3D 모델 생성 완료 · ${Math.round(result.blob.size / 1024)}KB`, `3D model ready · ${Math.round(result.blob.size / 1024)} KB`)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={SECONDARY_BUTTON} onClick={() => download(result.blob, result.job.artifacts[0]?.name ?? `toonstudio-result-${result.job.id}`)}>
                    <Download size={15} aria-hidden="true" />
                    {bt("원본 결과 다운로드", "Download result")}
                  </button>
                  {resultKind === "video" ? (
                    <button
                      type="button"
                      className={SECONDARY_BUTTON}
                      disabled={clips.length >= MAX_PROMO_CLIPS}
                      onClick={() => setClips((current) => [...current, { id: crypto.randomUUID(), blob: result.blob, caption: "" }])}
                    >
                      <Plus size={15} aria-hidden="true" />
                      {bt("홍보 영상 목록에 추가", "Add to promo list")}
                    </button>
                  ) : null}
                  {resultKind === "model" ? (
                    <button
                      type="button"
                      className={SECONDARY_BUTTON}
                      onClick={() => {
                        setGlb(new File([result.blob], `${result.job.id}.glb`, { type: result.blob.type }));
                        setKind("render-to-2d");
                        clearImage();
                      }}
                    >
                      <FileVideo size={15} aria-hidden="true" />
                      {bt("3D 미리보기 · 2D로 다시 변환", "Preview in 3D · convert back to 2D")}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-5 border-t border-line pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black text-fg">{bt("작업 이어서 확인", "Continue a previous job")}</h3>
                <button type="button" className={SECONDARY_BUTTON} onClick={() => void inference.loadHistory()}>
                  <History size={15} aria-hidden="true" />
                  {bt("내 작업 목록 불러오기", "Load my jobs")}
                </button>
              </div>
              {inference.history ? (
                inference.history.length ? (
                  <ul className="mt-3 grid gap-1.5">
                    {inference.history.map((item) => {
                      const itemMode = generativeMode(item.kind);
                      const itemState = inferenceStateLabel(item.state);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            disabled={inference.busy}
                            onClick={() => inference.selectJob(item)}
                            aria-current={job?.id === item.id ? "true" : undefined}
                            className={cn(
                              "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 text-left text-xs",
                              job?.id === item.id ? "border-accent bg-accent-soft" : "border-line bg-panel hover:border-line-strong",
                            )}
                          >
                            <span className="font-bold text-fg">{bt(itemMode.title.ko, itemMode.title.en)}</span>
                            <span className="text-fg-3">{bt(itemState.ko, itemState.en)} · #{item.id.slice(0, 8)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-fg-3">{bt("저장된 작업이 없어요.", "No saved jobs.")}</p>
                )
              ) : null}
            </div>
          </section>
        </div>

        <PromoClipAssembler
          clips={clips}
          exportProgress={exportProgress}
          onCaption={(index, caption) => setClips((current) => current.map((clip, position) => position === index ? { ...clip, caption } : clip))}
          onMoveUp={(index) => setClips((current) => swap(current, index - 1, index))}
          onMoveDown={(index) => setClips((current) => swap(current, index, index + 1))}
          onRemove={(index) => setClips((current) => current.filter((_, position) => position !== index))}
          onExport={() => void assemble()}
          onCancelExport={() => exportAbort.current?.abort()}
        />
      </Container>
    </div>
  );
}

function swap<T>(items: readonly T[], left: number, right: number): readonly T[] {
  if (left < 0 || right >= items.length) return items;
  const next = [...items];
  const first = next[left];
  const second = next[right];
  if (first === undefined || second === undefined) return items;
  next[left] = second;
  next[right] = first;
  return next;
}

function mediaErrorText(error: MediaInferenceError, bt: (ko: string, en: string) => string): string {
  if (error.detail) return error.detail;
  switch (error.kind) {
    case "poll-stopped":
      return bt("상태 자동 확인을 멈췄어요. 작업은 자동으로 다시 생성하지 않아요. ‘내 작업 목록’에서 이어서 확인하세요.", "Stopped checking automatically. Nothing is regenerated. Continue from “Load my jobs”.");
    case "poll-delayed":
      return bt("상태 확인이 지연되고 있어요. 기존 작업 ID는 그대로 유지돼요.", "Status checks are delayed. The existing job ID is kept.");
    case "submit":
      return bt("생성을 접수하지 못했어요. 같은 입력을 다시 제출하면 기존 작업 ID를 재사용해요.", "Couldn't submit. Resubmitting the same input reuses the same job ID.");
    case "result":
      return bt("결과를 불러오지 못했어요.", "Couldn't load the result.");
    case "history":
      return bt("로그인 후 작업 목록을 불러와 주세요.", "Sign in to load your jobs.");
    case "cancel":
      return bt("취소를 확인하지 못했어요.", "Couldn't confirm the cancellation.");
  }
}
