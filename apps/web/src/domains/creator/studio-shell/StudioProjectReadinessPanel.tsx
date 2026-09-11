import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import Link from "@/compat/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_PROJECT_READINESS_REQUEST_EVENT,
  STUDIO_PROJECT_READINESS_UPDATED_EVENT,
  parseStudioProjectReadinessSnapshot,
  readStudioProjectReadinessSnapshot,
  studioProjectReadinessStorageKey,
  type StudioProjectReadinessSnapshot,
} from "../studio-project-readiness-store";

import type {
  StudioProjectReadinessSectionId,
  StudioProjectReadinessStatus,
} from "../studio-project-readiness";

export type StudioProjectReadinessLocale = "ko" | "en";

const SECTION_LABELS: Readonly<
  Record<StudioProjectReadinessSectionId, Readonly<Record<StudioProjectReadinessLocale, string>>>
> = Object.freeze({
  story: { ko: "스토리", en: "Story" },
  production: { ko: "제작", en: "Production" },
  assets: { ko: "에셋", en: "Assets" },
  review: { ko: "검토", en: "Review" },
  localization: { ko: "현지화", en: "Localization" },
  export: { ko: "내보내기", en: "Export" },
});

function statusLabel(
  status: StudioProjectReadinessStatus,
  locale: StudioProjectReadinessLocale,
): string {
  if (status === "ready") return locale === "ko" ? "준비됨" : "Ready";
  if (status === "warning") return locale === "ko" ? "확인 필요" : "Review";
  return locale === "ko" ? "해결 필요" : "Blocked";
}

function statusClasses(status: StudioProjectReadinessStatus): string {
  if (status === "ready") return "border-success/35 bg-success/10 text-success";
  if (status === "warning") return "border-warning/35 bg-warning/10 text-warning";
  return "border-danger/35 bg-danger/10 text-danger";
}

function statusIcon(status: StudioProjectReadinessStatus) {
  if (status === "ready") return CheckCircle2;
  if (status === "warning") return AlertTriangle;
  return ShieldAlert;
}

function readBrowserSnapshot(projectId: string): StudioProjectReadinessSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    return readStudioProjectReadinessSnapshot(window.localStorage, projectId);
  } catch {
    return null;
  }
}

function projectSectionHref(projectId: string, section: StudioProjectReadinessSectionId): string {
  return `/studio/p/${encodeURIComponent(projectId)}/${section}`;
}

export function StudioProjectReadinessPanel({
  projectId,
  locale,
  compact = false,
}: {
  readonly projectId: string;
  readonly locale: StudioProjectReadinessLocale;
  readonly compact?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<StudioProjectReadinessSnapshot | null>(
    () => readBrowserSnapshot(projectId),
  );

  useEffect(() => {
    setSnapshot(readBrowserSnapshot(projectId));
    const onUpdated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const next = parseStudioProjectReadinessSnapshot(event.detail, projectId);
      if (next) setSnapshot(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== studioProjectReadinessStorageKey(projectId)) return;
      setSnapshot(readBrowserSnapshot(projectId));
    };
    window.addEventListener(STUDIO_PROJECT_READINESS_UPDATED_EVENT, onUpdated);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(STUDIO_PROJECT_READINESS_UPDATED_EVENT, onUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, [projectId]);

  const primaryActions = useMemo(
    () => snapshot?.report.actions.slice(0, compact ? 1 : 3) ?? [],
    [compact, snapshot],
  );

  const requestRefresh = () => {
    window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_READINESS_REQUEST_EVENT, {
      detail: Object.freeze({ projectId }),
    }));
  };

  if (!snapshot) {
    return (
      <section className="mt-5 rounded-2xl border border-line bg-card p-4 sm:p-5" aria-live="polite">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <RefreshCw size={17} className="text-fg-3" aria-hidden="true" />
              <h2 className="text-sm font-bold text-fg">
                {locale === "ko" ? "프로젝트 준비도 · 검사 전" : "Project readiness · Not checked"}
              </h2>
            </div>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-fg-3">
              {locale === "ko"
                ? "스토리·제작·권리·검토·현지화·출력 상태가 연결되면 실제 결과를 계산합니다. 데이터가 없을 때 준비 완료로 표시하지 않습니다."
                : "Readiness is calculated from connected story, production, rights, review, localization and export data. Missing data is never shown as ready."}
            </p>
          </div>
          <button
            type="button"
            onClick={requestRefresh}
            className={buttonClass({ variant: "outline", className: "shrink-0 gap-2" })}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {locale === "ko" ? "상태 검사" : "Check status"}
          </button>
        </div>
      </section>
    );
  }

  const { report } = snapshot;
  const StatusIcon = statusIcon(report.status);
  const percentage = Math.round(report.completion * 100);
  return (
    <section className="mt-5 rounded-2xl border border-line bg-card p-4 sm:p-5" aria-live="polite">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold",
              statusClasses(report.status),
            )}>
              <StatusIcon size={14} aria-hidden="true" />
              {statusLabel(report.status, locale)}
            </span>
            <h2 className="text-sm font-bold text-fg">
              {locale === "ko" ? `프로젝트 준비도 ${percentage}%` : `Project readiness ${percentage}%`}
            </h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-fg-3">
            {locale === "ko"
              ? `해결 필요 ${report.blockingCount}건 · 확인 필요 ${report.warningCount}건 · ${new Date(snapshot.updatedAt).toLocaleString("ko-KR")} 검사`
              : `${report.blockingCount} blocker(s) · ${report.warningCount} warning(s) · checked ${new Date(snapshot.updatedAt).toLocaleString("en-US")}`}
          </p>
        </div>
        <button
          type="button"
          onClick={requestRefresh}
          className={buttonClass({ variant: "outline", size: "sm", className: "shrink-0 gap-2" })}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {locale === "ko" ? "다시 검사" : "Check again"}
        </button>
      </div>

      {!compact ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          {report.sections.map((section) => {
            const Icon = statusIcon(section.status);
            return (
              <Link
                key={section.id}
                href={projectSectionHref(projectId, section.id)}
                className="rounded-xl border border-line bg-panel/55 p-3 transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <span className="flex items-center justify-between gap-2">
                  <strong className="text-xs text-fg">{SECTION_LABELS[section.id][locale]}</strong>
                  <Icon size={14} className={statusClasses(section.status).split(" ").at(-1)} aria-hidden="true" />
                </span>
                <span className="mt-2 block text-lg font-black text-fg">
                  {Math.round(section.completion * 100)}%
                </span>
                <span className="mt-1 block text-[0.65rem] text-fg-3">
                  {statusLabel(section.status, locale)}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {primaryActions.length > 0 ? (
        <div className="mt-4 grid gap-2 lg:grid-cols-3">
          {primaryActions.map((action) => (
            <Link
              key={action.id}
              href={projectSectionHref(projectId, action.section)}
              className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-panel/50 px-3 py-2.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/40 hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <span className={cn(
                "size-2 shrink-0 rounded-full",
                action.priority === "high" ? "bg-danger" : action.priority === "medium" ? "bg-warning" : "bg-accent",
              )} />
              <span>{locale === "ko" ? action.messageKo : action.messageEn}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
