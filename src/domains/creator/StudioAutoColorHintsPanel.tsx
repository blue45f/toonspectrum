/**
 * Thin auto-color hints product panel.
 *
 * Runs the pure `planStudioAutoColorHints` planner (sync) and presents a Korean summary.
 * Never writes pixels — apply remains deferred to Advanced Fill / explicit user action.
 * When the parent has not supplied image pixels, a built-in demo fixture is used.
 */

import { Copy, Info, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";

import {
  planStudioAutoColorHints,
  type StudioAutoColorHintPlan,
  type StudioAutoColorHintRequest,
  type StudioAutoColorHintSeed,
  type StudioAutoColorHintImageDataLike,
} from "./studio-auto-color-hints";
import { loadStudioAutoColorHintImageFromSrc } from "./studio-auto-color-hints-image-source";
import {
  createStudioAutoColorHintsDemoRequest,
  summarizeStudioAutoColorHintPlan,
  type StudioAutoColorHintPlanSummary,
} from "./studio-auto-color-hints-summary";

import { cx } from "@/lib/cx";

const controlFocusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export interface StudioAutoColorHintsPanelProps {
  /** Optional line-art pixels. When omitted, the panel plans against a demo fixture. */
  readonly image?: StudioAutoColorHintImageDataLike | null;
  /**
   * Selected image layer `src` (data URL / same-origin URL). When `image`/`request` are absent,
   * pixels are decoded on Run (with auto-color max-pixel downscale). Browser only.
   */
  readonly imageSrc?: string | null;
  /** Optional color seeds; ignored when `image` is absent (demo seeds are used). */
  readonly seeds?: readonly StudioAutoColorHintSeed[];
  /** Optional full request override (image/seeds/options). Wins over image/seeds props. */
  readonly request?: StudioAutoColorHintRequest | null;
  /** Notified after a successful plan (never mutates document). */
  readonly onPlan?: (plan: StudioAutoColorHintPlan) => void;
  /** Optional external runner; defaults to sync pure planner. */
  readonly onRun?: (request: StudioAutoColorHintRequest) => StudioAutoColorHintPlan | Promise<StudioAutoColorHintPlan>;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

async function resolveRequest(props: StudioAutoColorHintsPanelProps): Promise<{
  request: StudioAutoColorHintRequest;
  usingDemo: boolean;
}> {
  if (props.request) {
    return { request: props.request, usingDemo: false };
  }
  if (props.image) {
    return {
      request: {
        image: props.image,
        seeds: props.seeds ?? [],
      },
      usingDemo: false,
    };
  }
  if (typeof props.imageSrc === "string" && props.imageSrc.length > 0) {
    const image = await loadStudioAutoColorHintImageFromSrc(props.imageSrc);
    return {
      request: {
        image,
        seeds: props.seeds ?? [],
      },
      usingDemo: false,
    };
  }
  return { request: createStudioAutoColorHintsDemoRequest(), usingDemo: true };
}

export function StudioAutoColorHintsPanel({
  image = null,
  imageSrc = null,
  seeds,
  request = null,
  onPlan,
  onRun,
}: StudioAutoColorHintsPanelProps) {
  const titleId = useId();
  const helpId = useId();
  const summaryId = useId();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<StudioAutoColorHintPlanSummary | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function runPlanner() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCopyStatus(null);
    try {
      const resolved = await resolveRequest({ image, imageSrc, seeds, request, onPlan, onRun });
      setUsingDemo(resolved.usingDemo);
      const plan = await Promise.resolve(
        onRun ? onRun(resolved.request) : planStudioAutoColorHints(resolved.request),
      );
      const next = summarizeStudioAutoColorHintPlan(plan);
      setSummary(next);
      onPlan?.(plan);
    } catch (caught) {
      setSummary(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "자동 채색 힌트 계획을 계산하지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyPlan() {
    if (!summary) return;
    const ok = await copyTextToClipboard(summary.copyText);
    setCopyStatus(ok ? "요약을 클립보드에 복사했어요." : "클립보드에 복사하지 못했어요. 요약을 직접 선택해 복사하세요.");
  }

  return (
    <section
      data-studio-auto-color-hints-panel="true"
      data-testid="studio-auto-color-hints-panel"
      aria-labelledby={titleId}
      aria-busy={busy}
      className="w-full min-w-0 overflow-hidden rounded-xl border border-line bg-panel/60"
    >
      <header className="border-b border-line px-3 py-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              <Sparkles size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 id={titleId} className="text-sm font-bold text-fg">
                자동 채색 힌트
              </h3>
              <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
                영역·충돌·제안 연산 계획만 만듭니다. 픽셀을 조용히 덮어쓰지 않습니다.
              </p>
            </div>
          </div>
          <span
            role="status"
            className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full border border-accent/30 bg-accent-soft/60 px-2 text-[0.64rem] font-semibold text-accent"
            title="계획 전용 · 적용은 고급 채우기 등 명시 경로"
            aria-label="계획 전용 — 픽셀 자동 적용 없음"
          >
            계획 전용
          </span>
        </div>
      </header>

      <div className="space-y-3 p-3">
        <p
          id={helpId}
          className="flex min-h-11 min-w-0 items-start gap-2 rounded-lg border border-line bg-card/40 px-3 py-2 text-[0.68rem] leading-relaxed text-fg-3"
        >
          <Info size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 break-words">
            선화 연결 영역과 힌트 시드를 검증한 뒤 배치 연산 설명을 돌려줍니다. 실제 채색 적용은
            위 고급 채우기에서 미리보기를 확인한 뒤 진행하세요. 스크리블 브러시 도구는 아직
            연결되지 않았습니다.
          </span>
        </p>

        <button
          type="button"
          aria-describedby={helpId}
          onClick={() => {
            void runPlanner();
          }}
          disabled={busy}
          className={cx(
            "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-3 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2",
            "disabled:cursor-not-allowed disabled:border-line disabled:bg-raised disabled:text-fg-3 disabled:opacity-60",
            controlFocusClass,
          )}
        >
          {busy ? (
            <Loader2
              size={16}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <Sparkles size={16} aria-hidden="true" />
          )}
          {busy ? "계획 계산 중…" : "힌트 계획 실행"}
        </button>

        {usingDemo && summary ? (
          <p className="text-center text-[0.64rem] leading-relaxed text-fg-3">
            데모 선화로 계산했습니다. 이미지 레이어를 선택한 뒤 다시 실행하면 선택 선화를 사용합니다.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="flex min-h-11 min-w-0 items-start gap-2 rounded-lg border border-warn/35 bg-warn/10 px-3 py-2 text-[0.68rem] leading-relaxed text-warn"
          >
            <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{error}</span>
          </p>
        ) : null}

        {summary ? (
          <div
            id={summaryId}
            className="space-y-2 rounded-lg border border-line bg-card/50 p-3"
            aria-live="polite"
          >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 text-xs font-semibold text-fg-1">{summary.headline}</p>
              <span
                className={cx(
                  "inline-flex min-h-7 shrink-0 items-center rounded-full border px-2 text-[0.64rem] font-semibold",
                  summary.status === "ready"
                    ? "border-good/30 bg-good/10 text-good"
                    : "border-warn/35 bg-warn/10 text-warn",
                )}
              >
                {summary.statusLabel}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-[0.68rem] tabular-nums">
              <div className="rounded-md border border-line bg-panel/40 px-2 py-1.5">
                <dt className="text-fg-3">영역</dt>
                <dd className="font-semibold text-fg-1">{summary.regionCount.toLocaleString("ko-KR")}</dd>
              </div>
              <div className="rounded-md border border-line bg-panel/40 px-2 py-1.5">
                <dt className="text-fg-3">제안 연산</dt>
                <dd className="font-semibold text-fg-1">
                  {summary.operationCount.toLocaleString("ko-KR")}
                </dd>
              </div>
              <div className="rounded-md border border-line bg-panel/40 px-2 py-1.5">
                <dt className="text-fg-3">충돌</dt>
                <dd className="font-semibold text-fg-1">
                  {summary.conflictCount.toLocaleString("ko-KR")}
                </dd>
              </div>
              <div className="rounded-md border border-line bg-panel/40 px-2 py-1.5">
                <dt className="text-fg-3">권장 시드</dt>
                <dd className="font-semibold text-fg-1">
                  {summary.recommendationCount.toLocaleString("ko-KR")}
                </dd>
              </div>
            </dl>

            <ul className="max-h-40 space-y-1 overflow-y-auto text-[0.66rem] leading-relaxed text-fg-3">
              {summary.detailLines.map((line, index) => (
                <li key={`${index}:${line.slice(0, 24)}`} className="break-words">
                  {line}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => {
                void copyPlan();
              }}
              className={cx(
                "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-raised px-3 text-xs font-semibold text-fg-2 transition-colors hover:border-line-strong hover:bg-card",
                controlFocusClass,
              )}
            >
              <Copy size={14} aria-hidden="true" />
              계획 복사
            </button>
            {copyStatus ? (
              <p className="text-center text-[0.64rem] text-fg-3" role="status">
                {copyStatus}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
