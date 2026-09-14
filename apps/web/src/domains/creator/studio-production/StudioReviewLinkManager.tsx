import {
  CheckCircle2,
  Clipboard,
  Link2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createStudioServerReviewLink,
  listStudioServerReviewLinks,
  revokeStudioServerReviewLink,
  type StudioCreatedServerReviewLink,
  type StudioServerReviewLink,
} from "./studio-production-server-client";
import type { ProductionWorkspace } from "./studio-production-workspace-runtime";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import { studioExternalReviewHref } from "@/domains/creator/studio-route-registry";

interface StudioReviewLinkManagerProps {
  readonly workId: string;
  readonly workspace: ProductionWorkspace;
  readonly canManage: boolean;
  readonly onNotice: (message: string) => void;
}

type LoadState = "loading" | "ready" | "error";

export function studioReviewLinkHref(token: string): string {
  const relative = studioExternalReviewHref(token);
  return typeof window === "undefined" ? relative : new URL(relative, window.location.origin).toString();
}
function linkState(link: StudioServerReviewLink): "active" | "expired" | "revoked" {
  if (link.revokedAt) return "revoked";
  return Date.parse(link.expiresAt) <= Date.now() ? "expired" : "active";
}

export function StudioReviewLinkManager({
  workId,
  workspace,
  canManage,
  onNotice,
}: StudioReviewLinkManagerProps) {
  const [links, setLinks] = useState<readonly StudioServerReviewLink[]>([]);
  const [created, setCreated] = useState<StudioCreatedServerReviewLink | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"viewer" | "commenter">("commenter");
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [watermark, setWatermark] = useState(true);
  const [allowDownload, setAllowDownload] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<readonly string[]>([]);
  const [mutating, setMutating] = useState(false);

  const pageOptions = useMemo(() => workspace.hierarchy
    .filter((node) => node.kind === "page" && node.pageId)
    .map((node) => ({ id: node.pageId as string, title: node.title })), [workspace.hierarchy]);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setError(null);
    try {
      setLinks(await listStudioServerReviewLinks(workId, signal));
      setState("ready");
    } catch (cause) {
      if (signal?.aborted) return;
      setState("error");
      setError(cause instanceof Error ? cause.message : "검토 링크를 불러오지 못했습니다.");
    }
  }, [workId]);
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  const togglePage = (pageId: string) => {
    setSelectedPageIds((current) => current.includes(pageId)
      ? current.filter((candidate) => candidate !== pageId)
      : [...current, pageId]);
  };

  const createLink = async () => {
    if (!canManage || mutating) return;
    setMutating(true);
    setError(null);
    try {
      const next = await createStudioServerReviewLink(workId, {
        role,
        pageIds: selectedPageIds,
        watermark,
        allowDownload,
        expiresInHours,
      });
      setCreated(next);
      setLinks((current) => [next, ...current.filter((link) => link.id !== next.id)]);
      onNotice("외부 검토 링크를 만들었습니다. 원문 토큰은 이 화면에서 한 번만 표시됩니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "검토 링크를 만들지 못했습니다.");
    } finally {
      setMutating(false);
    }
  };

  const revoke = async (link: StudioServerReviewLink) => {
    if (!canManage || mutating || linkState(link) !== "active") return;
    setMutating(true);
    setError(null);
    try {
      const next = await revokeStudioServerReviewLink(workId, link.id);
      setLinks((current) => current.map((candidate) => candidate.id === next.id ? next : candidate));
      if (created?.id === next.id) setCreated(null);
      onNotice("검토 링크를 폐기했습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "검토 링크를 폐기하지 못했습니다.");
    } finally {
      setMutating(false);
    }
  };
  const copyCreatedLink = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(studioReviewLinkHref(created.token));
      onNotice("검토 링크를 클립보드에 복사했습니다.");
    } catch {
      setError("클립보드 권한이 없어 링크를 복사하지 못했습니다.");
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-accent" aria-hidden="true" />
              <h3 className="text-sm font-black">서버 검토 링크</h3>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-fg-2">
              페이지 범위와 만료·댓글·다운로드 정책을 서버에서 검증합니다. 링크 토큰 원문은 생성 직후 한 번만 표시됩니다.
            </p>
          </div>
          <button
            type="button"
            className={buttonClass({ variant: "outline", size: "sm" })}
            onClick={() => void reload()}
            disabled={state === "loading" || mutating}
          >
            <RefreshCw className={cn("size-4", state === "loading" && "animate-spin")} aria-hidden="true" />
            새로고침
          </button>
        </div>

        {error ? (
          <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-fg-2">
            권한
            <select
              className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm text-fg"
              value={role}
              onChange={(event) => setRole(event.currentTarget.value as "viewer" | "commenter")}
              disabled={!canManage || mutating}
            >
              <option value="commenter">열람 + 댓글·승인·반려</option>
              <option value="viewer">열람 전용</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-fg-2">
            만료 시간
            <select
              className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm text-fg"
              value={expiresInHours}
              onChange={(event) => setExpiresInHours(Number(event.currentTarget.value))}
              disabled={!canManage || mutating}
            >
              <option value={24}>24시간</option>
              <option value={72}>3일</option>
              <option value={168}>7일</option>
              <option value={720}>30일</option>
            </select>
          </label>
        </div>

        <fieldset className="mt-4 rounded-xl border border-line p-3" disabled={!canManage || mutating}>
          <legend className="px-1 text-xs font-bold">공개 페이지</legend>
          <p className="mb-2 text-xs text-fg-3">
            아무 페이지도 고르지 않으면 현재 작품의 모든 렌더 페이지를 표시합니다.
          </p>
          {pageOptions.length === 0 ? (
            <p className="text-xs text-fg-2">제작 계층에 연결된 페이지가 없어 전체 페이지로 발급합니다.</p>
          ) : (
            <div className="grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
              {pageOptions.map((page) => (
                <label key={page.id} className="flex min-h-10 items-center gap-2 rounded-lg border border-line px-3 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedPageIds.includes(page.id)}
                    onChange={() => togglePage(page.id)}
                  />
                  <span className="min-w-0 truncate">{page.title}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="mt-4 flex flex-wrap gap-3">
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-xs">
            <input
              type="checkbox"
              checked={watermark}
              onChange={(event) => setWatermark(event.currentTarget.checked)}
              disabled={!canManage || mutating}
            />
            워터마크 표시
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-xs">
            <input
              type="checkbox"
              checked={allowDownload}
              onChange={(event) => setAllowDownload(event.currentTarget.checked)}
              disabled={!canManage || mutating}
            />
            원고 다운로드 허용
          </label>
          <button
            type="button"
            className={buttonClass({ size: "sm" })}
            onClick={() => void createLink()}
            disabled={!canManage || mutating}
          >
            <Link2 className="size-4" aria-hidden="true" />
            링크 만들기
          </button>
        </div>
      </section>
      {created ? (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4" role="status">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
            <h3 className="text-sm font-black">새 링크를 지금 보관하세요</h3>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-fg-2">
            보안을 위해 서버와 목록 화면에는 원문 토큰을 저장하지 않습니다. 이 안내를 닫거나 페이지를 벗어나면 다시 볼 수 없습니다.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-xl border border-line bg-card p-3 text-xs">
              {studioReviewLinkHref(created.token)}
            </code>
            <button
              type="button"
              className={buttonClass({ variant: "outline", size: "sm" })}
              onClick={() => void copyCreatedLink()}
            >
              <Clipboard className="size-4" aria-hidden="true" />
              복사
            </button>
            <button
              type="button"
              className={buttonClass({ variant: "quiet", size: "sm" })}
              onClick={() => setCreated(null)}
            >
              확인
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-line bg-panel p-4">
        <h3 className="text-sm font-black">발급 기록</h3>
        <p className="mt-1 text-xs text-fg-2">토큰 원문은 표시하지 않고 정책과 폐기 상태만 관리합니다.</p>
        {state === "loading" ? (
          <p className="mt-4 text-xs text-fg-2" role="status">검토 링크를 불러오는 중입니다.</p>
        ) : null}
        {state === "ready" && links.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-center text-xs text-fg-2">
            아직 발급한 검토 링크가 없습니다.
          </p>
        ) : null}
        <div className="mt-3 space-y-2">
          {links.map((link) => {
            const status = linkState(link);
            return (
              <article key={link.id} className="rounded-xl border border-line bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-xs text-fg-2">{link.id}</p>
                      <span className={cn(
                        "rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold",
                        status === "active"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-line bg-raised text-fg-3",
                      )}>
                        {status === "active" ? "활성" : status === "expired" ? "만료" : "폐기"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-fg-2">
                      {link.role === "commenter" ? "댓글 가능" : "열람 전용"} · 만료 {new Date(link.expiresAt).toLocaleString("ko-KR")}
                    </p>
                    <p className="mt-1 text-xs text-fg-3">
                      {link.pageIds.length > 0 ? `${link.pageIds.length}개 지정 페이지` : "전체 페이지"}
                      {link.watermark ? " · 워터마크" : ""}
                      {link.allowDownload ? " · 다운로드 허용" : " · 다운로드 차단"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={buttonClass({ variant: "outline", size: "sm" })}
                    onClick={() => void revoke(link)}
                    disabled={!canManage || mutating || status !== "active"}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    폐기
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
