import {
  CheckCircle2,
  GitCompareArrows,
  History,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import Link from "@/compat/router-link";
import { getApiErrorMessage } from "@/infrastructure/api";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingualLocalizer, type BilingualText } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  listStudioArtifactRevisions,
  newStudioProjectGraphId,
  restoreStudioRevision,
} from "./studio-project-graph-client";
import type {
  StudioArtifactRecord,
  StudioRevisionRecord,
} from "./studio-project-graph-contract";
import { getStudioProjectGraphDeviceId } from "./studio-project-graph-device";
import { useStudioProjectGraph } from "./useStudioProjectGraph";

const KIND_LABELS: Readonly<Record<StudioRevisionRecord["kind"], BilingualText>> = {
  autosave: { ko: "자동 저장", en: "Autosave" },
  checkpoint: { ko: "체크포인트", en: "Checkpoint" },
  submission: { ko: "검수 제출본", en: "Submission" },
  "review-snapshot": { ko: "검수 스냅샷", en: "Review snapshot" },
  approved: { ko: "승인본", en: "Approved" },
  release: { ko: "게시본", en: "Release" },
};

function formatDate(value: string, language: string): string {
  return new Intl.DateTimeFormat(language || "en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function chooseArtifact(
  artifacts: readonly StudioArtifactRecord[],
  requestedId: string | null,
): StudioArtifactRecord | null {
  if (requestedId) {
    const requested = artifacts.find((artifact) => artifact.id === requestedId);
    if (requested) return requested;
  }
  return artifacts.find((artifact) => artifact.kind === "canvas-2d")
    ?? artifacts.find((artifact) => artifact.kind === "storyboard")
    ?? artifacts[0]
    ?? null;
}

export function StudioProjectVersionStackPanel({
  projectId,
  locale: _locale,
}: {
  readonly projectId: string;
  readonly locale?: string;
}) {
  const l = useBilingualLocalizer("studioProjectVersions");
  const language = useI18n((state) => state.lang);
  const legacyLocale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const location = useLocation();
  const graph = useStudioProjectGraph(projectId, legacyLocale);
  const requestedArtifactId = useMemo(
    () => new URLSearchParams(location.search).get("artifact"),
    [location.search],
  );
  const artifact = useMemo(
    () => chooseArtifact(graph.project?.artifacts ?? [], requestedArtifactId),
    [graph.project?.artifacts, requestedArtifactId],
  );
  const [revisions, setRevisions] = useState<readonly StudioRevisionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevisionId, setConfirmRevisionId] = useState<string | null>(null);
  const [restoringRevisionId, setRestoringRevisionId] = useState<string | null>(null);
  const [headOverride, setHeadOverride] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const currentHeadRevisionId = headOverride ?? artifact?.headRevisionId ?? null;

  const load = useCallback(async () => {
    if (!artifact) {
      setRevisions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRevisions(await listStudioArtifactRevisions(artifact.id));
    } catch (nextError) {
      setError(await getApiErrorMessage(
        nextError,
        l("버전 이력을 불러오지 못했습니다.", "Version history could not be loaded."),
      ));
    } finally {
      setLoading(false);
    }
  }, [artifact, l]);

  useEffect(() => {
    setHeadOverride(null);
    setConfirmRevisionId(null);
    setNotice(null);
    void load();
  }, [artifact?.id, load]);

  const restore = async (revision: StudioRevisionRecord) => {
    if (!artifact || !currentHeadRevisionId || !graph.project?.access.edit) return;
    if (confirmRevisionId !== revision.id) {
      setConfirmRevisionId(revision.id);
      setNotice(l("한 번 더 누르면 이 상태를 새 체크포인트로 복원합니다. 현재 이력은 삭제되지 않습니다.", "Press once more to restore this state as a new checkpoint. Current history is preserved."));
      return;
    }

    setRestoringRevisionId(revision.id);
    setError(null);
    try {
      const now = new Date().toISOString();
      const result = await restoreStudioRevision(
        artifact.id,
        revision.id,
        currentHeadRevisionId,
        {
          revisionId: newStudioProjectGraphId("revision-restore"),
          commandId: newStudioProjectGraphId("command-restore"),
          deviceId: getStudioProjectGraphDeviceId(
            typeof window === "undefined" ? null : window.localStorage,
          ),
          createdAt: now,
          message: l(`${formatDate(revision.createdAt, language)} 버전에서 복원`, `Restored from ${formatDate(revision.createdAt, language)}`),
        },
      );
      setHeadOverride(result.headRevisionId);
      setConfirmRevisionId(null);
      setNotice(l("새 복원 체크포인트를 만들었습니다. 과거와 현재 버전은 모두 보존됩니다.", "Created a restored checkpoint. Both previous and current versions are preserved."));
      await Promise.all([load(), graph.refresh()]);
    } catch (nextError) {
      setError(await getApiErrorMessage(
        nextError,
        l("버전을 복원하지 못했습니다.", "The revision could not be restored."),
      ));
    } finally {
      setRestoringRevisionId(null);
    }
  };

  if (!artifact) {
    return (
      <section className="rounded-3xl border border-line bg-card p-5 shadow-sm">
        <h2 className="text-xl font-black text-fg">
          {l("버전 이력", "Version history")}
        </h2>
        <p className="mt-2 text-sm text-fg-2">
          {l("ProjectGraph로 전환된 제작 문서가 아직 없습니다. 기존 로컬 원고는 계속 자동 저장됩니다.", "No production document has moved to ProjectGraph yet. Existing local documents continue to autosave.")}
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6"
      aria-labelledby="studio-version-stack-title"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            VERSION STACK
          </p>
          <h2 id="studio-version-stack-title" className="mt-2 text-2xl font-black tracking-tight text-fg">
            {l("작업본·검수본·승인본·게시본", "Working, review, approved and release versions")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            {l(`“${artifact.title}”의 고정된 버전 이력입니다. 복원은 기존 기록을 덮어쓰지 않고 새 체크포인트를 만듭니다.`, `Immutable history for “${artifact.title}”. Restore creates a new checkpoint without overwriting existing records.`)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void load(); }}
          disabled={loading}
          className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
        >
          {loading
            ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
            : <History size={15} aria-hidden="true" />}
          {l("이력 새로고침", "Refresh history")}
        </button>
      </div>

      {notice ? (
        <p className="mt-4 rounded-xl border border-accent/25 bg-accent-soft/30 px-3 py-2 text-xs text-fg-2" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-xl border border-danger/30 bg-danger-soft/20 px-3 py-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 space-y-3">
        {revisions.map((revision) => {
          const isHead = revision.id === currentHeadRevisionId;
          const isApproved = revision.id === artifact.approvedRevisionId || revision.kind === "approved";
          const canRestore = graph.project?.access.edit === true
            && !isHead
            && revision.kind !== "release";
          return (
            <article
              key={revision.id}
              className={cn(
                "rounded-2xl border p-4",
                isHead ? "border-accent/45 bg-accent-soft/20" : "border-line bg-panel/45",
              )}
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.64rem] font-bold text-fg-2">
                      {l(KIND_LABELS[revision.kind].ko, KIND_LABELS[revision.kind].en)}
                    </span>
                    {isHead ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-[0.64rem] font-bold text-on-accent">
                        <CheckCircle2 size={12} aria-hidden="true" />
                        {l("현재 작업본", "Current head")}
                      </span>
                    ) : null}
                    {isApproved ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-1 text-[0.64rem] font-bold text-success">
                        <ShieldCheck size={12} aria-hidden="true" />
                        {l("승인 이력", "Approval history")}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 truncate text-sm font-bold text-fg">
                    {revision.message || revision.id}
                  </p>
                  <p className="mt-1 text-xs text-fg-3">
                    {formatDate(revision.createdAt, language)} · {revision.id}
                    {revision.parentIds.length > 0
                      ? ` · ${l("부모", "parent")} ${revision.parentIds.join(", ")}`
                      : ""}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/studio/work/${encodeURIComponent(projectId)}/versions?artifact=${encodeURIComponent(artifact.id)}&revision=${encodeURIComponent(revision.id)}`}
                    className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
                  >
                    <GitCompareArrows size={14} aria-hidden="true" />
                    {l("비교", "Compare")}
                  </Link>
                  {canRestore ? (
                    <button
                      type="button"
                      onClick={() => { void restore(revision); }}
                      disabled={restoringRevisionId !== null}
                      className={buttonClass({
                        variant: confirmRevisionId === revision.id ? "solid" : "quiet",
                        size: "sm",
                        className: "gap-1.5",
                      })}
                    >
                      {restoringRevisionId === revision.id
                        ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                        : <RotateCcw size={14} aria-hidden="true" />}
                      {confirmRevisionId === revision.id
                        ? l("복원 확정", "Confirm restore")
                        : l("새 체크포인트로 복원", "Restore as checkpoint")}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
        {!loading && revisions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-fg-3">
            {l("표시할 클라우드 버전이 없습니다.", "No cloud revisions to display.")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
