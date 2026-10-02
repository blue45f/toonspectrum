import { ArrowDown, ArrowUp, Box, Check, ChevronRight, CircleAlert, Clapperboard, Film, ImagePlus, LoaderCircle, RotateCcw, Trash2, Wand2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import { AiStudioConditionList } from "../ai/AiStudioSurfaceNav";
import { AI_HUB_PATH, AI_RUNTIME_ANCHOR, LUNA_ART_BASE } from "../ai/ai-studio-hub";
import {
  GENERATIVE_MODES,
  INFERENCE_STEPS,
  inferenceStepIndex,
  type GenerativeMode,
  type GenerativeModeReadiness,
} from "./generative-modes";

import type { GeneratedClip } from "./generated-video-export";
import type { InferenceJob, InferenceKind } from "./media-inference-client";
import type { MediaServerProbe } from "./useMediaInference";

/** 순서를 바꿔도 입력 초점이 유지되도록 안정적인 id를 붙인 홍보 영상 조각. */
export interface PromoClip extends GeneratedClip {
  readonly id: string;
}

const MODE_ICONS: Readonly<Record<InferenceKind, LucideIcon>> = {
  "image-to-video": Film,
  "image-to-3d": Box,
  "render-to-2d": Wand2,
};

function ReadinessBadge({ readiness }: { readonly readiness: GenerativeModeReadiness }) {
  const bt = useBilingual("GenerativeParts.readiness");
  const label = readiness.state === "ready"
    ? bt("준비됨", "Ready")
    : readiness.state === "checking"
      ? bt("확인 중", "Checking")
      : readiness.state === "offline"
        ? bt("서버 연결 안 됨", "Server offline")
        : bt("모델 준비 필요", "Model setup needed");
  return (
    <span className={cn(
      "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-[0.7rem] font-bold",
      readiness.state === "ready"
        ? "border-good/45 bg-good/12 text-fg"
        : readiness.state === "checking"
          ? "border-line bg-raised text-fg-2"
          : "border-warn/45 bg-warn/12 text-fg",
    )}>
      <span aria-hidden="true" className={cn(
        "size-1.5 rounded-full",
        readiness.state === "ready" ? "bg-good" : readiness.state === "checking" ? "bg-fg-3" : "bg-warn",
      )} />
      {label}
    </span>
  );
}

/** Luna 말풍선과 함께 변환 방식을 고르는 시작 카드. */
export function GenerativeModePicker({
  selected,
  readinessOf,
  disabled,
  onSelect,
}: {
  readonly selected: InferenceKind;
  readonly readinessOf: (kind: InferenceKind) => GenerativeModeReadiness;
  readonly disabled: boolean;
  readonly onSelect: (mode: GenerativeMode) => void;
}) {
  const bt = useBilingual("GenerativeModePicker");
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="relative overflow-hidden rounded-[2rem] border border-line bg-[radial-gradient(circle_at_0%_0%,color-mix(in_oklch,var(--color-accent)_20%,transparent),transparent_44%),var(--color-panel)] p-4 shadow-lg sm:p-6"
    >
      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-stretch">
        <div className="flex items-end gap-3 lg:flex-col lg:items-stretch">
          <img
            src={`${LUNA_ART_BASE}-320.webp`}
            width={320}
            height={319}
            decoding="async"
            alt=""
            aria-hidden="true"
            className="size-20 shrink-0 rounded-2xl border border-line bg-canvas object-cover object-[center_18%] lg:h-44 lg:w-full"
          />
          <div className="min-w-0 rounded-2xl border border-accent/35 bg-card/90 p-3 text-sm leading-6 text-fg-2 shadow-sm">
            <strong className="block text-sm font-black text-fg">Luna</strong>
            {bt("무엇으로 바꿔 볼까요? 방식을 고르면 필요한 입력과 결과를 먼저 알려 드릴게요.", "What shall we transform? Pick a mode and I'll show the input it needs and what you'll get.")}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Step 1</p>
          <h2 id={titleId} className="mt-1 text-2xl font-black tracking-[-0.03em] text-fg">
            {bt("무엇으로 바꿔 볼까요?", "What would you like to create?")}
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3" role="group" aria-label={bt("변환 방식", "Conversion mode")}>
            {GENERATIVE_MODES.map((mode) => {
              const Icon = MODE_ICONS[mode.kind];
              const active = mode.kind === selected;
              return (
                <button
                  key={mode.kind}
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => onSelect(mode)}
                  className={cn(
                    "flex h-full min-w-0 flex-col rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60",
                    active ? "border-accent bg-accent-soft" : "border-line bg-card/85 hover:border-line-strong hover:bg-raised/60",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className={cn("grid size-10 place-items-center rounded-xl", active ? "bg-accent text-on-accent" : "bg-panel text-accent")}>
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <ReadinessBadge readiness={readinessOf(mode.kind)} />
                  </span>
                  <strong className="mt-3 block text-base font-black text-fg">{bt(mode.title.ko, mode.title.en)}</strong>
                  <span className="mt-1 block text-xs leading-5 text-fg-2">{bt(mode.summary.ko, mode.summary.en)}</span>
                  <span className="mt-3 grid gap-1 border-t border-line pt-3 text-[0.72rem] leading-5 text-fg-3">
                    <span><b className="font-bold text-fg-2">{bt("입력", "Input")}</b> · {bt(mode.input.ko, mode.input.en)}</span>
                    <span><b className="font-bold text-fg-2">{bt("결과", "Output")}</b> · {bt(mode.output.ko, mode.output.en)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/** 추론 서버 준비 상태와 사용 조건, 준비되지 않았을 때의 대안을 한 카드로 보여준다. */
export function MediaServerStatusCard({
  probe,
  mode,
  readiness,
  onRetry,
}: {
  readonly probe: MediaServerProbe;
  readonly mode: GenerativeMode;
  readonly readiness: GenerativeModeReadiness;
  readonly onRetry: () => void;
}) {
  const bt = useBilingual("MediaServerStatusCard");
  const ready = readiness.state === "ready";
  const headline = probe.phase === "checking"
    ? bt("ToonStudio 추론 서버 상태를 확인하고 있어요.", "Checking the ToonStudio inference server…")
    : probe.phase === "failed"
      ? bt("추론 서버에 연결하지 못했어요.", "Couldn't reach the inference server.")
      : ready
        ? bt(`추론 서버 준비됨 · ${mode.title.ko} 실행 가능`, `Inference server ready · ${mode.title.en} available`)
        : bt(`${mode.title.ko}에 필요한 모델이 아직 준비되지 않았어요.`, `The model for ${mode.title.en} isn't set up yet.`);
  return (
    <section
      aria-labelledby="generate-server-title"
      className={cn(
        "rounded-3xl border p-4 sm:p-5",
        ready ? "border-good/40 bg-good/8" : probe.phase === "checking" ? "border-line bg-panel/70" : "border-warn/40 bg-warn/8",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", ready ? "bg-good/20 text-good" : probe.phase === "checking" ? "bg-raised text-fg-2" : "bg-warn/20 text-warn")}>
            {probe.phase === "checking"
              ? <LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : ready ? <Check size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <h2 id="generate-server-title" className="text-base font-black text-fg" aria-live="polite">{headline}</h2>
            <p className="mt-1 text-xs leading-5 text-fg-2">
              {probe.phase === "failed" && probe.detail
                ? probe.detail
                : bt("실제 모델이 설치되고 작업 저장소가 준비된 기능만 실행해요. 외부 유료 생성 서비스로 자동 전환하지 않고, 결과의 캐릭터 동일성·형태·권리는 사용 전에 확인해 주세요.", "Only modes with an installed model and job storage can run. We never switch to paid services automatically — check likeness, shape and rights before using a result.")}
            </p>
            {readiness.state === "missing" && readiness.missing.length > 0 ? (
              <p className="mt-1 text-xs leading-5 text-fg-3">
                {bt("준비가 필요한 항목", "Missing")}: {readiness.missing.join(", ")}
              </p>
            ) : null}
          </div>
        </div>
        {probe.phase !== "checking" ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <RotateCcw size={14} aria-hidden="true" />
            {bt("다시 확인", "Check again")}
          </button>
        ) : null}
      </div>

      {!ready && probe.phase !== "checking" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <span className="text-xs font-bold text-fg-2">{bt("지금 할 수 있는 대안", "What you can do now")}</span>
          <Link
            href={`${AI_HUB_PATH}#${AI_RUNTIME_ANCHOR}`}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-accent/40 bg-card px-3 text-xs font-bold text-accent hover:bg-accent-soft"
          >
            {bt("내 AI 런타임에서 같은 변환 실행", "Run it on my AI runtime")}
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
          <Link
            href={mode.alternative.href}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2 hover:text-fg"
          >
            {bt(mode.alternative.label.ko, mode.alternative.label.en)}
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      ) : null}

      <details className="group mt-4 rounded-2xl border border-line bg-card/60 px-3 py-1">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm font-bold text-fg">
          {bt("비용·로그인·데이터·결과 조건", "Cost, sign-in, data and output")}
          <ChevronRight size={16} className="transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <AiStudioConditionList surfaceId="generate" className="pb-3 pt-1" />
      </details>
    </section>
  );
}

/** 끌어 놓기와 클릭 선택을 모두 지원하는 파일 입력. 실제 input을 덮어 키보드 초점이 그대로 보인다. */
export function FileDropZone({
  label,
  hint,
  accept,
  fileName,
  disabled,
  onFile,
}: {
  readonly label: string;
  readonly hint: string;
  readonly accept: string;
  readonly fileName?: string;
  readonly disabled?: boolean;
  readonly onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file && !disabled) onFile(file);
      }}
      className={cn(
        "relative rounded-2xl border border-dashed transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/35",
        dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-canvas/60 hover:border-accent/60",
        disabled && "opacity-60",
      )}
    >
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 px-4 py-4 text-center">
        <ImagePlus size={22} className="text-accent" aria-hidden="true" />
        <span className="text-sm font-bold text-fg">{fileName ?? label}</span>
        <span className="text-xs leading-5 text-fg-3">{hint}</span>
        <input
          type="file"
          accept={accept}
          disabled={disabled}
          aria-label={label}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onFile(file);
          }}
        />
      </label>
    </div>
  );
}

/** 접수 → 대기 → 생성 → 완료 단계를 색과 글자로 함께 보여준다. */
export function InferenceStepper({ state }: { readonly state: InferenceJob["state"] }) {
  const bt = useBilingual("InferenceStepper");
  const current = inferenceStepIndex(state);
  const halted = current === null;
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label={bt("생성 진행 단계", "Generation steps")}>
      {INFERENCE_STEPS.map((step, index) => {
        const done = current !== null && index < current;
        const active = current === index;
        const complete = current === 3 && index === 3;
        return (
          <li
            key={step.en}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center text-[0.72rem] font-bold",
              complete || done ? "border-good/40 bg-good/10 text-fg" : active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-3",
              halted && "opacity-60",
            )}
          >
            <span aria-hidden="true" className={cn(
              "grid size-6 place-items-center rounded-full text-[0.7rem]",
              complete || done ? "bg-good text-canvas" : active ? "bg-accent text-on-accent" : "bg-raised text-fg-3",
            )}>
              {complete || done ? <Check size={13} /> : index + 1}
            </span>
            <span className="truncate">{bt(step.ko, step.en)}</span>
            <span className="sr-only">
              {complete || done ? bt("완료", "done") : active ? bt("진행 중", "in progress") : bt("대기", "pending")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** 생성 영상 여러 개를 순서·자막과 함께 한 파일로 잇는 영역. */
export function PromoClipAssembler({
  clips,
  exportProgress,
  onCaption,
  onMoveUp,
  onMoveDown,
  onRemove,
  onExport,
  onCancelExport,
}: {
  readonly clips: readonly PromoClip[];
  readonly exportProgress: number | null;
  readonly onCaption: (index: number, caption: string) => void;
  readonly onMoveUp: (index: number) => void;
  readonly onMoveDown: (index: number) => void;
  readonly onRemove: (index: number) => void;
  readonly onExport: () => void;
  readonly onCancelExport: () => void;
}) {
  const bt = useBilingual("PromoClipAssembler");
  const exporting = exportProgress !== null;
  return (
    <section aria-labelledby="generate-promo-title" className="rounded-3xl border border-line bg-panel/70 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Step 3</p>
          <h2 id="generate-promo-title" className="mt-1 flex items-center gap-2 text-xl font-black text-fg">
            <Clapperboard size={20} className="text-accent" aria-hidden="true" />
            {bt("생성 영상을 홍보 영상으로 잇기", "Stitch clips into a promo video")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">
            {bt("생성한 영상을 원하는 순서로 놓고 자막을 넣어 한 파일로 저장해요. 모델이 만든 실제 프레임만 쓰며, 녹화 중에는 이 화면을 열어 두세요. 출력은 가로 832×480이고 원본 비율은 여백으로 보존해요.", "Order your generated clips, add captions and save one file. Only real generated frames are used; keep this tab open while recording. Output is 832×480 landscape with the original ratio letterboxed.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!clips.length || exporting}
            onClick={onExport}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-black text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Film size={16} aria-hidden="true" />
            {bt("연결 영상 내보내기", "Export stitched video")}
          </button>
          {exporting ? (
            <button type="button" onClick={onCancelExport} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-bold text-fg-2 hover:text-fg">
              {bt("내보내기 취소", "Cancel export")}
            </button>
          ) : null}
        </div>
      </div>
      {exporting ? (
        <div className="mt-4 flex items-center gap-3" role="status">
          <progress className="h-2 w-48 accent-[var(--color-accent)]" max={1} value={exportProgress} aria-label={bt("연결 영상 진행률", "Export progress")} />
          <span className="text-xs font-bold tabular-nums text-fg-2">{Math.round(exportProgress * 100)}%</span>
        </div>
      ) : null}
      {clips.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line bg-card/50 px-4 py-6 text-center text-sm leading-6 text-fg-3">
          {bt("영상 결과에서 ‘홍보 영상 목록에 추가’를 누르면 여기에 모여요. (최대 8개)", "Clips you add with “Add to promo list” appear here (up to 8).")}
        </p>
      ) : (
        <ol className="mt-4 grid gap-2">
          {clips.map((clip, index) => (
            <li key={clip.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-xs font-black text-accent">{index + 1}</span>
              <input
                aria-label={bt(`${index + 1}번 영상 자막`, `Caption for clip ${index + 1}`)}
                value={clip.caption}
                maxLength={100}
                placeholder={bt("자막 (선택)", "Caption (optional)")}
                onChange={(event) => onCaption(index, event.target.value)}
                className="min-h-11 min-w-40 flex-1 rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none focus:border-accent"
              />
              <IconButton label={bt("위로", "Move up")} disabled={index === 0 || exporting} onClick={() => onMoveUp(index)}><ArrowUp size={15} /></IconButton>
              <IconButton label={bt("아래로", "Move down")} disabled={index === clips.length - 1 || exporting} onClick={() => onMoveDown(index)}><ArrowDown size={15} /></IconButton>
              <IconButton label={bt("제거", "Remove")} disabled={exporting} onClick={() => onRemove(index)}><Trash2 size={15} /></IconButton>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function IconButton({ label, disabled, onClick, children }: { readonly label: string; readonly disabled?: boolean; readonly onClick: () => void; readonly children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-xl border border-line text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span aria-hidden="true" className="contents">{children}</span>
    </button>
  );
}
