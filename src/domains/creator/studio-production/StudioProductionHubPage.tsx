import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Download,
  FileClock,
  FolderKanban,
  Link2,
  MessageSquareCheck,
  Presentation,
  Radio,
  Share2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  STUDIO_PRODUCTION_SURFACES,
  buildStudioProductionOverview,
  parseStudioProductionWorkspaceExport,
  resolveStudioProductionScope,
  serializeStudioProductionWorkspace,
  studioProductionSurfaceHref,
  type StudioProductionSurface,
} from "./studio-production-model";
import { StudioProductionPresentationSurface } from "./StudioProductionPresentationSurface";
import { StudioProductionProjectsSurface } from "./StudioProductionProjectsSurface";
import { StudioProductionReviewSurface } from "./StudioProductionReviewSurface";
import {
  StudioProductionJoinSurface,
  StudioProductionShareSurface,
} from "./StudioProductionSharingSurfaces";
import { StudioProductionVersionsSurface } from "./StudioProductionVersionsSurface";
import { StudioProductionPill } from "./StudioProductionUi";
import { useStudioProductionWorkspace } from "./use-studio-production-workspace";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";
import Link from "@/src/compat/router-link";

const SURFACE_META: Readonly<Record<
  StudioProductionSurface,
  {
    readonly label: string;
    readonly shortLabel: string;
    readonly description: string;
    readonly icon: typeof FolderKanban;
  }
>> = {
  projects: {
    label: "프로젝트 운영",
    shortLabel: "프로젝트",
    description: "회차·일정·작업량·납품 준비를 관리합니다.",
    icon: FolderKanban,
  },
  review: {
    label: "리뷰·출시 승인",
    shortLabel: "리뷰",
    description: "이슈 인박스와 승인 게이트를 운영합니다.",
    icon: MessageSquareCheck,
  },
  versions: {
    label: "버전·복원",
    shortLabel: "버전",
    description: "기준선을 생성하고 비교·복원합니다.",
    icon: FileClock,
  },
  present: {
    label: "피치·프레젠테이션",
    shortLabel: "피치",
    description: "슬라이드와 발표 타이밍을 리허설합니다.",
    icon: Presentation,
  },
  share: {
    label: "공유·권한",
    shortLabel: "공유",
    description: "역할별 링크와 참여자를 관리합니다.",
    icon: Share2,
  },
  join: {
    label: "공동 제작 참여",
    shortLabel: "참여",
    description: "초대 코드를 검증하고 프로젝트에 참여합니다.",
    icon: UserPlus,
  },
};

function downloadWorkspace(filename: string, serialized: string): void {
  const blob = new Blob([serialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFilename(value: string): string {
  const normalized = value.trim().replaceAll(/[^\p{L}\p{N}._-]+/gu, "-").replaceAll(/-+/gu, "-");
  return normalized.slice(0, 80) || "studio-production";
}

export function StudioProductionHubPage({
  surface,
  onOpenStudio,
}: {
  readonly surface: StudioProductionSurface;
  readonly onOpenStudio: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scope = useMemo(
    () => resolveStudioProductionScope(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const {
    workspace,
    persistence,
    commit,
    replace,
    retryPersistence,
  } = useStudioProductionWorkspace(scope);
  const [fileStatus, setFileStatus] = useState<string | null>(null);
  const meta = SURFACE_META[surface];
  const overview = useMemo(() => buildStudioProductionOverview(workspace), [workspace]);
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const inviteToken = searchParams.get("invite") ?? "";

  useEffect(() => {
    const previous = document.title;
    document.title = `${meta.label} · ${workspace.title} · Toon Studio`;
    return () => {
      document.title = previous;
    };
  }, [meta.label, workspace.title]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const index = Number(event.key) - 1;
      const next = STUDIO_PRODUCTION_SURFACES[index];
      if (!next) return;
      event.preventDefault();
      void navigate(studioProductionSurfaceHref(next, scope));
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [navigate, scope]);

  const exportProject = () => {
    try {
      downloadWorkspace(
        `${safeFilename(workspace.title)}.toon-production.json`,
        serializeStudioProductionWorkspace(workspace),
      );
      setFileStatus("제작 운영 패키지를 내보냈습니다.");
    } catch {
      setFileStatus("운영 패키지를 만들지 못했습니다.");
    }
  };

  const importProject = async (file: File | null) => {
    if (!file) return;
    try {
      const result = parseStudioProductionWorkspaceExport(await file.text(), scope);
      if (!result.ok || !result.workspace) {
        setFileStatus(result.error ?? "운영 패키지를 가져오지 못했습니다.");
        return;
      }
      replace(result.workspace);
      setFileStatus(`${file.name}을(를) 가져왔습니다.`);
    } catch {
      setFileStatus("파일을 읽는 중 오류가 발생했습니다.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-dvh bg-bg text-fg" data-studio-production-hub data-scope-key={scope.key}>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-3 px-3 py-2 sm:px-5">
          <button
            type="button"
            className={buttonClass({ variant: "quiet", size: "icon" })}
            onClick={onOpenStudio}
            aria-label="Studio 편집기로 돌아가기"
            data-studio-route-exit="editor"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Radio className="size-4 text-accent" aria-hidden="true" />
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-fg-3">Production command center</span>
              <StudioProductionPill tone={overview.risk === "healthy" ? "success" : overview.risk === "at_risk" ? "warning" : "danger"}>
                {overview.risk === "healthy" ? "일정 안정" : overview.risk === "at_risk" ? "일정 주의" : "일정 위험"}
              </StudioProductionPill>
            </div>
            <input
              key={workspace.scopeKey + workspace.title}
              defaultValue={workspace.title}
              aria-label="프로젝트 제목"
              className="mt-0.5 w-full max-w-3xl bg-transparent text-base font-black tracking-tight text-fg outline-none placeholder:text-fg-3 sm:text-lg"
              onBlur={(event) => {
                const title = event.currentTarget.value.trim();
                if (!title || title === workspace.title) return;
                commit(
                  { action: "프로젝트 제목 변경", detail: title },
                  (current) => ({ ...current, title }),
                );
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => void importProject(event.currentTarget.files?.[0] ?? null)}
            />
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">가져오기</span>
            </button>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={exportProject}>
              <Download className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">패키지 저장</span>
            </button>
            <Link href="/create" className={buttonClass({ variant: "quiet", size: "sm" })} data-studio-route-exit="site">
              제작 홈
            </Link>
          </div>
        </div>

        <nav className="mx-auto max-w-[1920px] overflow-x-auto px-3 sm:px-5" aria-label="제작 운영 기능">
          <div className="flex min-w-max gap-1 pb-2">
            {STUDIO_PRODUCTION_SURFACES.map((item, index) => {
              const itemMeta = SURFACE_META[item];
              const Icon = itemMeta.icon;
              const active = surface === item;
              return (
                <Link
                  key={item}
                  href={studioProductionSurfaceHref(item, scope)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors pointer-coarse:min-h-11",
                    active ? "bg-accent text-on-accent shadow-sm" : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                  title={`${itemMeta.label} · Alt+${index + 1}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {itemMeta.shortLabel}
                  <kbd className={cn("hidden rounded px-1 py-0.5 font-mono text-[0.5625rem] xl:inline", active ? "bg-black/10" : "bg-raised")}>⌥{index + 1}</kbd>
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1920px] px-3 py-4 sm:px-5 sm:py-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-fg">{meta.label}</h1>
              <StudioProductionPill>{scope.label}</StudioProductionPill>
            </div>
            <p className="mt-1 text-sm text-fg-2">{meta.description}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-[0.6875rem] text-fg-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-1",
                persistence.phase === "saved"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : persistence.phase === "loading"
                    ? "border-accent/30 bg-accent-soft text-accent"
                    : persistence.phase === "memory" || persistence.phase === "unavailable"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "border-line bg-panel text-fg-2",
              )}
              title={persistence.warning ?? undefined}
              role="status"
            >
              {persistence.phase === "saved" ? (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              ) : persistence.phase === "memory" || persistence.phase === "unavailable" ? (
                <CircleAlert className="size-3.5" aria-hidden="true" />
              ) : (
                <Radio className={cn("size-3.5", persistence.phase === "loading" ? "animate-pulse" : "")} aria-hidden="true" />
              )}
              {persistence.phase === "saved"
                ? "SQLite/OPFS 저장됨"
                : persistence.phase === "loading"
                  ? "로컬 원본 저장 중"
                  : persistence.phase === "memory"
                    ? "세션 복구본만 유지"
                    : persistence.phase === "unavailable"
                      ? "로컬 저장소 사용 불가"
                      : "로컬 원본 준비"}
            </span>
            {persistence.phase === "memory" || persistence.phase === "unavailable" ? (
              <button type="button" className="font-semibold text-accent hover:underline" onClick={retryPersistence}>
                저장 다시 시도
              </button>
            ) : null}
            <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" aria-hidden="true" />열린 탭 동기화</span>
            <span className="inline-flex items-center gap-1.5"><Link2 className="size-3.5" aria-hidden="true" />JSON 재해 복구</span>
          </div>
        </div>

        {fileStatus ? (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg-2" role="status">
            <span>{fileStatus}</span>
            <button type="button" className="font-semibold text-accent" onClick={() => setFileStatus(null)}>닫기</button>
          </div>
        ) : null}

        {persistence.warning ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" role="alert">
            <span className="flex min-w-0 items-center gap-2"><CircleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{persistence.warning}</span></span>
            <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={retryPersistence}>다시 저장</button>
          </div>
        ) : null}

        {surface === "projects" ? <StudioProductionProjectsSurface workspace={workspace} scope={scope} commit={commit} /> : null}
        {surface === "review" ? <StudioProductionReviewSurface workspace={workspace} scope={scope} commit={commit} /> : null}
        {surface === "versions" ? <StudioProductionVersionsSurface workspace={workspace} scope={scope} commit={commit} /> : null}
        {surface === "present" ? <StudioProductionPresentationSurface workspace={workspace} scope={scope} commit={commit} /> : null}
        {surface === "share" ? <StudioProductionShareSurface workspace={workspace} scope={scope} commit={commit} /> : null}
        {surface === "join" ? <StudioProductionJoinSurface workspace={workspace} scope={scope} commit={commit} initialToken={inviteToken} /> : null}
      </main>
    </div>
  );
}
