import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";

import Link from "@/compat/router-link";
import {
  runStudioExportPreflight,
  STUDIO_EXPORT_TARGET_PROFILES,
  STUDIO_EXPORT_TARGETS,
  type StudioExportPreflightResult,
  type StudioExportTargetId,
} from "../studio-export-preflight";
import {
  createStudioProjectExportSnapshot,
  recommendedStudioExportDraft,
  type StudioExportDraftInput,
} from "../studio-project-export-snapshot";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { useStudioProjectWorkspace } from "./useStudioProjectWorkspace";

type Locale = "ko" | "en";

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function updatePreflight(
  results: readonly StudioExportPreflightResult[],
  next: StudioExportPreflightResult,
): readonly StudioExportPreflightResult[] {
  return Object.freeze([
    ...results.filter((item) => item.target !== next.target || item.policyVersion !== next.policyVersion),
    next,
  ].sort((a, b) => `${a.target}:${a.policyVersion}`.localeCompare(`${b.target}:${b.policyVersion}`)));
}

function resultTone(result: StudioExportPreflightResult | null): string {
  if (!result) return "border-line bg-panel";
  if (result.status === "pass") return "border-success/30 bg-success-soft/15";
  if (result.status === "warning") return "border-warning/35 bg-warning-soft/15";
  return "border-danger/35 bg-danger-soft/15";
}

/**
 * Project-level export planner. It combines user-visible destination settings with canonical
 * rights, localization and review state, then hands exact rasterization to the existing editor.
 */
export function StudioExportPanel({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: Locale;
}) {
  const workspace = useStudioProjectWorkspace(projectId, locale);
  const [target, setTarget] = useState<StudioExportTargetId>("webtoon-platform");
  const [draft, setDraft] = useState<StudioExportDraftInput>(() => recommendedStudioExportDraft(projectId, "webtoon-platform"));
  const [result, setResult] = useState<StudioExportPreflightResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profile = STUDIO_EXPORT_TARGET_PROFILES[target];
  const savedResult = workspace.state?.exportPreflights.find(
    (item) => item.target === target && item.policyVersion === profile.policyVersion,
  ) ?? null;
  const displayedResult = result ?? savedResult;

  const projectFacts = useMemo(() => {
    const state = workspace.state;
    return {
      blockedAssets: state?.assets.filter((asset) => asset.status === "blocked").length ?? 0,
      warningAssets: state?.assets.filter((asset) => asset.status === "warning").length ?? 0,
      localization: state?.localization.reduce((sum, item) => sum + item.blockingIssueCount, 0) ?? 0,
      comments: state?.reviewSession.threads.filter((thread) => thread.status === "open").length ?? 0,
    };
  }, [workspace.state]);

  const selectTarget = (nextTarget: StudioExportTargetId) => {
    setTarget(nextTarget);
    setDraft(recommendedStudioExportDraft(projectId, nextTarget));
    setResult(null);
    setMessage(null);
    setError(null);
  };

  const patch = <K extends keyof StudioExportDraftInput>(key: K, value: StudioExportDraftInput[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setResult(null);
    setMessage(null);
  };

  const runPreflight = () => {
    if (!workspace.state) {
      setError(locale === "ko" ? "프로젝트 상태를 불러온 뒤 다시 검사해 주세요." : "Reload project state before running preflight.");
      return;
    }
    try {
      const next = runStudioExportPreflight(
        target,
        createStudioProjectExportSnapshot(workspace.state, { ...draft, target }),
      );
      const updated = workspace.update((current) => ({
        ...current,
        exportPreflights: updatePreflight(current.exportPreflights, next),
      }));
      if (!updated) throw new Error("Project preflight could not be stored.");
      setResult(next);
      setMessage(locale === "ko" ? "현재 프로젝트 상태로 사전검사를 저장했습니다." : "Saved preflight from the current project state.");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : (locale === "ko" ? "사전검사를 실행하지 못했습니다." : "Preflight could not be completed."));
    }
  };

  const editorHref = `/studio/work/${encodeURIComponent(projectId)}/publish`;

  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6" aria-labelledby="project-export-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <FileCheck2 size={14} aria-hidden="true" /> EXPORT PREFLIGHT
          </p>
          <h2 id="project-export-title" className="mt-2 text-2xl font-black tracking-tight text-fg">
            {locale === "ko" ? "사용할 곳을 고르면 필요한 검사를 자동으로" : "Choose a destination and check everything required"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            {locale === "ko"
              ? "권리·현지화·미해결 검토와 대상 규격을 함께 확인합니다. 여기서는 프로젝트 수준을 검사하고, 실제 파일 생성 직전 편집기에서 캔버스 수치를 다시 확인합니다."
              : "Check rights, localization, unresolved review items and destination rules together. This is the project-level check; the editor verifies exact canvas data before rendering."}
          </p>
        </div>
        <span className="inline-flex min-h-9 items-center rounded-full border border-line bg-panel px-3 text-xs font-bold text-fg-2">
          {locale === "ko" ? `정책 ${profile.policyVersion}` : `Policy ${profile.policyVersion}`}
        </span>
      </div>

      {workspace.error || error ? (
        <p role="alert" className="mt-4 rounded-xl border border-danger/35 bg-danger-soft/20 px-3 py-2 text-xs font-semibold text-danger">
          {error ?? workspace.error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-4 rounded-xl border border-success/30 bg-success-soft/20 px-3 py-2 text-xs font-semibold text-success">
          {message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2" aria-label={locale === "ko" ? "내보내기 목적" : "Export destinations"}>
        {STUDIO_EXPORT_TARGETS.map((candidate) => {
          const candidateProfile = STUDIO_EXPORT_TARGET_PROFILES[candidate];
          const active = candidate === target;
          return (
            <button
              key={candidate}
              type="button"
              aria-pressed={active}
              onClick={() => selectTarget(candidate)}
              className={cn(
                "min-h-11 rounded-xl border px-3 text-xs font-bold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                active
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-panel text-fg-2 hover:border-accent/40 hover:text-fg",
              )}
            >
              {locale === "ko" ? candidateProfile.labelKo : candidateProfile.labelEn}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-bold text-fg-2">
          {locale === "ko" ? "형식" : "Format"}
          <select value={draft.format} onChange={(event) => patch("format", event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
            {profile.allowedFormats.map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-fg-2">
          {locale === "ko" ? "가로 폭" : "Width"}
          <input type="number" min={1} value={draft.width} onChange={(event) => patch("width", numberValue(event.target.value, draft.width))} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg" />
        </label>
        <label className="text-xs font-bold text-fg-2">
          {locale === "ko" ? "전체 높이" : "Height"}
          <input type="number" min={1} value={draft.height} onChange={(event) => patch("height", numberValue(event.target.value, draft.height))} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg" />
        </label>
        <label className="text-xs font-bold text-fg-2">
          {locale === "ko" ? "예상 용량 (MB)" : "Estimated size (MB)"}
          <input type="number" min={0.1} step={0.1} value={Math.round(draft.estimatedFileSizeBytes / 1024 / 1024 * 10) / 10} onChange={(event) => patch("estimatedFileSizeBytes", numberValue(event.target.value, 1) * 1024 * 1024)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg" />
        </label>
        <label className="text-xs font-bold text-fg-2">
          DPI
          <input type="number" min={1} value={draft.dpi ?? ""} onChange={(event) => patch("dpi", event.target.value ? numberValue(event.target.value, 72) : null)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg" placeholder={locale === "ko" ? "웹은 자동" : "Automatic for web"} />
        </label>
        <label className="text-xs font-bold text-fg-2">
          {locale === "ko" ? "색 공간" : "Color space"}
          <select value={draft.colorSpace} onChange={(event) => patch("colorSpace", event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
            {(profile.allowedColorSpaces ?? ["srgb"]).map((space) => <option key={space} value={space}>{space.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-fg-2">
          {locale === "ko" ? "가장 작은 글자" : "Smallest text"}
          <input type="number" min={1} value={draft.minimumTextPx ?? ""} onChange={(event) => patch("minimumTextPx", event.target.value ? numberValue(event.target.value, 12) : null)} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg" />
        </label>
        <label className="text-xs font-bold text-fg-2">
          {locale === "ko" ? "대체 텍스트 범위" : "Alt text coverage"}
          <select value={String(draft.altTextCoverage)} onChange={(event) => patch("altTextCoverage", Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg">
            <option value="0">0%</option><option value="0.5">50%</option><option value="1">100%</option>
          </select>
        </label>
      </div>

      <details className="mt-5 rounded-2xl border border-line bg-panel/45 p-4">
        <summary className="min-h-11 cursor-pointer text-sm font-black text-fg">{locale === "ko" ? "전문 확인 항목" : "Advanced checks"}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            ["readingOrderComplete", locale === "ko" ? "읽기 순서 완료" : "Reading order complete"],
            ["aiDisclosurePrepared", locale === "ko" ? "AI 사용 표시 준비" : "AI disclosure prepared"],
            ["captionsComplete", locale === "ko" ? "자막 완료" : "Captions complete"],
            ["editableStructurePreserved", locale === "ko" ? "편집 구조 유지" : "Editable structure preserved"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-bold text-fg-2">
              <input type="checkbox" checked={draft[key]} onChange={(event) => patch(key, event.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      </details>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.65rem] text-fg-3">{locale === "ko" ? "사용 불가 에셋" : "Blocked assets"}</p><b className="mt-1 block text-lg text-fg">{projectFacts.blockedAssets}</b></div>
        <div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.65rem] text-fg-3">{locale === "ko" ? "조건 확인 에셋" : "Asset warnings"}</p><b className="mt-1 block text-lg text-fg">{projectFacts.warningAssets}</b></div>
        <div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.65rem] text-fg-3">{locale === "ko" ? "현지화 오류" : "Localization blocks"}</p><b className="mt-1 block text-lg text-fg">{projectFacts.localization}</b></div>
        <div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.65rem] text-fg-3">{locale === "ko" ? "열린 검토" : "Open review"}</p><b className="mt-1 block text-lg text-fg">{projectFacts.comments}</b></div>
      </div>

      <div className={cn("mt-5 rounded-2xl border p-4", resultTone(displayedResult))}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black text-fg">
              {displayedResult?.status === "pass" ? <CheckCircle2 size={17} className="text-success" aria-hidden="true" /> : <ShieldAlert size={17} className={displayedResult?.status === "blocked" ? "text-danger" : "text-warning"} aria-hidden="true" />}
              {displayedResult
                ? (locale === "ko" ? displayedResult.summaryKo : displayedResult.summaryEn)
                : (locale === "ko" ? "현재 설정으로 검사해 보세요" : "Run preflight for these settings")}
            </h3>
            {displayedResult ? <p className="mt-1 text-xs text-fg-3">{locale === "ko" ? `차단 ${displayedResult.blockingCount} · 확인 ${displayedResult.warningCount}` : `${displayedResult.blockingCount} blocking · ${displayedResult.warningCount} warnings`}</p> : null}
          </div>
          <button type="button" onClick={runPreflight} className={buttonClass({ className: "gap-2" })}>
            <FileCheck2 size={16} aria-hidden="true" />
            {locale === "ko" ? "현재 상태 검사" : "Run preflight"}
          </button>
        </div>

        {displayedResult?.findings.length ? (
          <ul className="mt-4 space-y-2">
            {displayedResult.findings.map((finding) => (
              <li key={finding.code} className="rounded-xl border border-line bg-card/70 p-3 text-xs leading-5 text-fg-2">
                <b className={finding.severity === "error" ? "text-danger" : finding.severity === "warning" ? "text-warning" : "text-fg"}>{locale === "ko" ? finding.messageKo : finding.messageEn}</b>
                <span className="mt-1 block text-fg-3">{locale === "ko" ? finding.suggestedActionKo : finding.suggestedActionEn}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-fg-3">{locale === "ko" ? "실제 분할·레이어·파일 용량은 편집기에서 최종 렌더 직전에 다시 확인합니다." : "The editor rechecks exact segmentation, layers and file size immediately before rendering."}</p>
        <Link href={editorHref} className={buttonClass({ variant: displayedResult?.status === "blocked" ? "outline" : "solid", className: "gap-2" })}>
          {locale === "ko" ? "편집기에서 최종 출력" : "Finalize in editor"}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
