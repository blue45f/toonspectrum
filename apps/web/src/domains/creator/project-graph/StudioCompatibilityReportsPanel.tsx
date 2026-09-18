import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { getApiErrorMessage } from "@/infrastructure/api";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  approveStudioCompatibilityReport,
  listStudioCompatibilityReports,
} from "./studio-project-graph-client";
import type { CompatibilityReport } from "./studio-project-graph-contract";
import { useStudioProjectGraph } from "./useStudioProjectGraph";

function toBilingualLocale(locale: string): "ko" | "en" {
  return locale.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

const GRADE_STYLES = Object.freeze({
  A: "border-success/30 bg-success-soft/30 text-success",
  B: "border-accent/30 bg-accent-soft/30 text-accent-strong",
  C: "border-warning/30 bg-warning-soft/30 text-warning-strong",
  D: "border-danger/30 bg-danger-soft/30 text-danger",
});

function reportSummary(report: CompatibilityReport, copyLocale: "ko" | "en"): string {
  const summary = report.summary;
  if (copyLocale === "ko") {
    return `보존 ${summary.preserved} · 변환 ${summary.converted} · 래스터화 ${summary.rasterized} · 제외/미지원 ${summary.excluded + summary.unsupported}`;
  }
  return `Preserved ${summary.preserved} · converted ${summary.converted} · rasterized ${summary.rasterized} · excluded/unsupported ${summary.excluded + summary.unsupported}`;
}

export function StudioCompatibilityReportsPanel({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: string;
}) {
  const copyLocale = toBilingualLocale(locale);
  const graph = useStudioProjectGraph(projectId, copyLocale);
  const cloudProjectId = graph.project?.id ?? null;
  const [reports, setReports] = useState<readonly CompatibilityReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cloudProjectId) {
      setReports([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setReports(await listStudioCompatibilityReports(cloudProjectId));
    } catch (nextError) {
      setError(await getApiErrorMessage(
        nextError,
        copyLocale === "ko"
          ? "파일 호환성 이력을 불러오지 못했습니다."
          : "File compatibility history could not be loaded.",
      ));
    } finally {
      setLoading(false);
    }
  }, [cloudProjectId, copyLocale]);

  useEffect(() => { void load(); }, [load]);

  const approve = async (report: CompatibilityReport) => {
    setApprovingId(report.id);
    setError(null);
    try {
      const result = await approveStudioCompatibilityReport(report.id);
      setReports((current) => current.map((candidate) => candidate.id === report.id
        ? {
            ...candidate,
            ...(result.approvedBy && result.approvedAt
              ? { approvedBy: result.approvedBy, approvedAt: result.approvedAt }
              : {}),
          }
        : candidate));
    } catch (nextError) {
      setError(await getApiErrorMessage(
        nextError,
        copyLocale === "ko"
          ? "호환성 손실 승인을 저장하지 못했습니다."
          : "Compatibility loss approval could not be saved.",
      ));
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <section
      className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6"
      aria-labelledby="studio-compatibility-title"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            IMPORT COMPATIBILITY
          </p>
          <h2 id="studio-compatibility-title" className="mt-2 text-2xl font-black tracking-tight text-fg">
            {copyLocale === "ko" ? "PSD·PNG·CLIP 원본과 변환 손실" : "PSD, PNG and CLIP source fidelity"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            {copyLocale === "ko"
              ? "원본은 변경하지 않고 보관하며, 변환·래스터화·제외 항목은 저장 전에 명시적으로 보여줍니다. A 이외 등급은 사용자 승인 없이는 편집 Revision에 연결되지 않습니다."
              : "Originals remain immutable. Conversion, rasterization and exclusion are disclosed before save. Grades below A require explicit approval before entering an editable revision."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void load(); }}
          disabled={loading || !cloudProjectId}
          className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
        >
          {loading
            ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
            : <RefreshCcw size={15} aria-hidden="true" />}
          {copyLocale === "ko" ? "검사 이력 새로고침" : "Refresh reports"}
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-danger/30 bg-danger-soft/20 px-3 py-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 space-y-3">
        {reports.map((report) => {
          const approved = Boolean(report.approvedBy && report.approvedAt);
          const blocked = report.requiresApproval && !approved;
          return (
            <article key={report.id} className="rounded-2xl border border-line bg-panel/45 p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn(
                      "inline-flex size-8 items-center justify-center rounded-lg border text-sm font-black",
                      GRADE_STYLES[report.grade],
                    )}>
                      {report.grade}
                    </span>
                    <span className="truncate text-sm font-bold text-fg">
                      {report.source.sourceFileName}
                    </span>
                    <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.62rem] font-bold uppercase text-fg-3">
                      {report.source.sourceFormat}
                    </span>
                    {approved ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-1 text-[0.62rem] font-bold text-success">
                        <ShieldCheck size={12} aria-hidden="true" />
                        {copyLocale === "ko" ? "손실 승인됨" : "Losses approved"}
                      </span>
                    ) : blocked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-1 text-[0.62rem] font-bold text-warning-strong">
                        <AlertTriangle size={12} aria-hidden="true" />
                        {copyLocale === "ko" ? "승인 전 변환 금지" : "Blocked until approval"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-1 text-[0.62rem] font-bold text-success">
                        <CheckCircle2 size={12} aria-hidden="true" />
                        {copyLocale === "ko" ? "편집 보존" : "Edit-preserving"}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-fg-2">{reportSummary(report, copyLocale)}</p>
                  <p className="mt-1 break-all text-[0.68rem] text-fg-3">
                    SHA-256 {report.source.sourceHash}
                  </p>
                  {report.items.length > 0 ? (
                    <details className="mt-3 rounded-xl border border-line bg-card px-3 py-2">
                      <summary className="cursor-pointer text-xs font-bold text-fg-2">
                        {copyLocale === "ko"
                          ? `항목별 결과 ${report.items.length}개`
                          : `${report.items.length} item-level results`}
                      </summary>
                      <ul className="mt-3 space-y-2">
                        {report.items.slice(0, 100).map((item) => (
                          <li key={item.id} className="text-xs leading-5 text-fg-2">
                            <strong className="text-fg">{item.feature}</strong>
                            {` · ${item.outcome} · ${item.path}`}
                            <span className="block text-fg-3">{item.message}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>

                {blocked && graph.project?.access.edit ? (
                  <button
                    type="button"
                    onClick={() => { void approve(report); }}
                    disabled={approvingId !== null}
                    className={buttonClass({ variant: "solid", size: "sm", className: "gap-1.5" })}
                  >
                    {approvingId === report.id
                      ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                      : <FileWarning size={14} aria-hidden="true" />}
                    {copyLocale === "ko" ? "손실 확인 후 승인" : "Review and approve losses"}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}

        {!loading && reports.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-fg-3">
            {cloudProjectId
              ? copyLocale === "ko" ? "아직 저장된 호환성 보고서가 없습니다." : "No compatibility reports have been stored yet."
              : copyLocale === "ko" ? "클라우드 ProjectGraph 전환 후 파일 검사 이력이 여기에 표시됩니다." : "File inspection history appears after ProjectGraph migration."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
