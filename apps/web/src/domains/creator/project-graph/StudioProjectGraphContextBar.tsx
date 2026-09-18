import {
  formatI18nTemplate,
  getCurrentUiLocale,
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  Cloud,
  CloudOff,
  GitBranch,
  HardDrive,
  History,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { useMemo } from "react";

import Link from "@/compat/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StudioArtifactRecord } from "./studio-project-graph-contract";
import {
  useStudioProjectGraph,
  type StudioProjectGraphStatus,
} from "./useStudioProjectGraph";
import {
  formatI18nTemplate,
  getActiveI18nLocale,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

type Locale = string;

const STATUS_LABELS: Readonly<Record<StudioProjectGraphStatus, Readonly<Record<AuthoredLocale, string>>>> = {
  loading: { ko: "작품 연결 확인 중", en: "Checking project connection" },
  synced: { ko: "클라우드와 동기화됨", en: "Synced with cloud" },
  cached: { ko: "최근 동기화 상태", en: "Last synced state" },
  offline: { ko: "오프라인 · 로컬 작업 가능", en: "Offline · local editing available" },
  "local-only": { ko: "로컬 프로젝트", en: "Local project" },
  error: { ko: "연결 확인 필요", en: "Connection check needed" },
};

function StatusGlyph({ status }: { readonly status: StudioProjectGraphStatus }) {
  useBilingualI18nRevision();
  const className = status === "loading" ? "animate-spin" : undefined;
  if (status === "synced" || status === "cached") {
    return <Cloud size={15} aria-hidden="true" className={className} />;
  }
  if (status === "offline") {
    return <CloudOff size={15} aria-hidden="true" className={className} />;
  }
  if (status === "local-only") {
    return <HardDrive size={15} aria-hidden="true" className={className} />;
  }
  return <RefreshCcw size={15} aria-hidden="true" className={className} />;
}

function primaryArtifact(artifacts: readonly StudioArtifactRecord[]): StudioArtifactRecord | null {
  const priority: StudioArtifactRecord["kind"][] = [
    "canvas-2d",
    "storyboard",
    "scene-3d",
    "story",
  ];
  for (const kind of priority) {
    const artifact = artifacts.find((candidate) => candidate.kind === kind);
    if (artifact) return artifact;
  }
  return artifacts[0] ?? null;
}

function updatedLabel(value: string | undefined, language: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale || "en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function StudioProjectGraphContextBar({
  projectId,
  locale: _locale,
}: {
  readonly projectId: string;
  readonly locale?: string;
}) {
  const bt = useBilingual("StudioProjectGraphContextBar");
  const controller = useStudioProjectGraph(projectId, locale);
  const artifact = useMemo(
    () => primaryArtifact(controller.project?.artifacts ?? []),
    [controller.project?.artifacts],
  );
  const syncedAt = updatedLabel(controller.project?.updatedAt, language);
  const authority = controller.project?.authorityVersion ?? "legacy-v2";

  return (
    <section
      data-studio-project-authority={authority}
      className="rounded-2xl border border-line bg-card p-3 shadow-sm sm:p-4"
      aria-label={bt("작품 저장과 버전 상태", "Project save and version status")}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold",
              controller.status === "synced"
                ? "border-success/30 bg-success-soft/20 text-success"
                : controller.status === "error"
                  ? "border-danger/30 bg-danger-soft/20 text-danger"
                  : "border-line bg-panel text-fg-2",
            )}
          >
            <StatusGlyph status={controller.status} />
            {bt(STATUS_LABELS[controller.status].ko, STATUS_LABELS[controller.status].en)}
          </span>
          {controller.project ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs text-fg-2">
                <GitBranch size={14} aria-hidden="true" />
                {bt(
                  `${controller.project.artifacts.length}개 제작 문서`,
                  `${controller.project.artifacts.length} production artifacts`,
                )}
              </span>
              {artifact ? (
                <span className="max-w-full truncate text-xs text-fg-3">
                  {artifact.title} · {artifact.headRevisionId}
                </span>
              ) : null}
              {artifact?.approvedRevisionId ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-1 text-[0.65rem] font-bold text-success">
                  <ShieldCheck size={12} aria-hidden="true" />
                  {bt("승인본 고정", "Approved revision")}
                </span>
              ) : null}
              {syncedAt ? (
                <span className="text-[0.68rem] text-fg-3">
                  {bt(`업데이트 ${syncedAt}`, `Updated ${syncedAt}`)}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-xs text-fg-3">
              {bt(
                "기존 로컬 저장·복구 권위로 계속 작업합니다. 클라우드 전환 전 원고는 변경하지 않습니다.",
                "Continue with existing local save and recovery. Pre-migration documents remain unchanged.",
              )}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {controller.error ? (
            <span className="max-w-xl text-xs text-danger" role="status">
              {controller.error}
            </span>
          ) : null}
          {artifact ? (
            <Link
              href={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.project.graph.StudioProjectGraphContextBar", "en", "/studio/p/{v0}/review?view=versions&artifact={v1}"), { v0: String(encodeURIComponent(projectId)), v1: String(encodeURIComponent(artifact.id)) })}
              className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
            >
              <History size={14} aria-hidden="true" />
              {bt("버전", "Versions")}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => { void controller.refresh(); }}
            disabled={controller.status === "loading"}
            className={buttonClass({ variant: "quiet", size: "sm", className: "gap-1.5" })}
          >
            <RefreshCcw
              size={14}
              aria-hidden="true"
              className={controller.status === "loading" ? translateCurrentStaticSourceText("domains.creator.project.graph.StudioProjectGraphContextBar", "en", "animate-spin") : undefined}
            />
            {bt("상태 새로고침", "Refresh status")}
          </button>
        </div>
      </div>
    </section>
  );
}
