import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Link2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  auditProductionStudioRevisionBindings,
  bridgeStatusLabel,
  pinProductionTaskToStudioRevision,
} from "./production-studio-revision-bridge";
import type { ProductionClientCommand } from "./production-api";

import {
  listStudioProjectRevisions,
  loadStudioProjectGraphByWork,
  type StudioProjectGraphSnapshot,
  type StudioProjectRevisionRecord,
} from "../project-graph/studio-project-graph-client";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import type { ProductionProjectAggregate } from "@toonspectrum/core/production";

interface BridgeData {
  readonly project: StudioProjectGraphSnapshot;
  readonly revisionsByArtifact: Readonly<
    Record<string, readonly StudioProjectRevisionRecord[]>
  >;
}

type BridgeState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: BridgeData }
  | { readonly kind: "error"; readonly message: string };

interface Props {
  readonly aggregate: ProductionProjectAggregate;
  readonly canEdit: boolean;
  readonly enabled: boolean;
  readonly execute: (
    command: ProductionClientCommand,
    message: string,
  ) => Promise<void>;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : "Studio 정본을 불러오지 못했습니다.";
}

function statusTone(status: string): string {
  if (status === "bound") return "border-good/35 bg-good/10 text-good";
  if (status === "stale") return "border-bad/35 bg-bad/10 text-bad";
  return "border-warn/35 bg-warn/10 text-warn";
}
export function ProductionStudioRevisionBridgePanel({
  aggregate,
  canEdit,
  enabled,
  execute,
}: Props) {
  const [state, setState] = useState<BridgeState>({ kind: "idle" });
  const [pinningTaskIds, setPinningTaskIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const project = await loadStudioProjectGraphByWork(aggregate.workId, signal);
      const pairs = await Promise.all(project.artifacts.map(async (artifact) => [
        artifact.id,
        await listStudioProjectRevisions(artifact.id, signal),
      ] as const));
      if (signal?.aborted) return;
      setState({
        kind: "ready",
        data: {
          project,
          revisionsByArtifact: Object.fromEntries(pairs),
        },
      });
    } catch (cause) {
      if (signal?.aborted) return;
      setState({ kind: "error", message: errorMessage(cause) });
    }
  }, [aggregate.workId, enabled]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const audit = useMemo(() => {
    if (state.kind !== "ready") return null;
    return auditProductionStudioRevisionBindings(
      aggregate,
      state.data.project,
      state.data.revisionsByArtifact,
    );
  }, [aggregate, state]);

  const pinOne = useCallback(async (
    taskId: string,
  ) => {
    const binding = audit?.tasks.find((entry) => entry.task.id === taskId);
    if (!binding?.recommended || pinningTaskIds.has(taskId)) return;
    setPinningTaskIds((current) => new Set(current).add(taskId));
    try {
      await execute({
        type: "upsert-task",
        task: pinProductionTaskToStudioRevision(
          binding.task,
          binding.recommended,
        ),
      }, `${binding.task.title} 입력 revision을 Studio 정본에 고정했습니다.`);
    } finally {
      setPinningTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  }, [audit, execute, pinningTaskIds]);

  const pinAll = useCallback(async () => {
    const targets = audit?.tasks.filter((binding) =>
      binding.status !== "bound" && binding.recommended !== null) ?? [];
    if (!canEdit || targets.length === 0) return;
    setPinningTaskIds(new Set(targets.map((binding) => binding.task.id)));
    try {
      for (const binding of targets) {
        await execute({
          type: "upsert-task",
          task: pinProductionTaskToStudioRevision(
            binding.task,
            binding.recommended!,
          ),
        }, `${binding.task.title} 입력 revision을 Studio 정본에 고정했습니다.`);
      }
    } finally {
      setPinningTaskIds(new Set());
    }
  }, [audit, canEdit, execute]);

  const actionable = audit?.tasks.filter((binding) =>
    binding.status !== "bound") ?? [];
  const submissionIssues = audit?.submissions.filter((binding) =>
    binding.status !== "bound") ?? [];

  return (
    <section
      className="rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5"
      data-production-studio-revision-bridge=""
      aria-labelledby="production-studio-bridge-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-accent" aria-hidden="true" />
            <h2 id="production-studio-bridge-title" className="font-black text-fg">
              {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "Studio 정본 연결")}</h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-6 text-fg-2">
            {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "제작 작업의 입력·제출 revision을 실제 Studio ProjectGraph 산출물과 digest로 대조합니다. 설명용 번호가 아니라 저장된 원고 정본을 다음 공정의 입력으로 고정합니다.")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.kind === "ready" ? (
            <Link
              to={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "en", "/studio/p/{v0}/overview"), { v0: String(encodeURIComponent(state.data.project.id)) })}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              <Link2 className="size-4" aria-hidden="true" />
              {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "Studio 프로젝트")}</Link>
          ) : null}
          <button
            type="button"
            className={buttonClass({ variant: "outline", size: "sm" })}
            onClick={() => void refresh()}
            disabled={!enabled || state.kind === "loading"}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "다시 확인")}</button>
        </div>
      </header>

      {!enabled ? (
        <div className="mt-4 rounded-xl border border-dashed border-line bg-panel/60 p-4 text-sm text-fg-2">
          {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "기능 미리보기에서는 실제 Studio 서버 정본을 변경하지 않습니다. 내 프로젝트에서 열면 원고 revision과 제작 작업을 연결할 수 있습니다.")}</div>
      ) : null}

      {state.kind === "loading" ? (
        <div className="mt-4 rounded-xl border border-line bg-panel p-4 text-sm text-fg-2" role="status">
          {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "Studio ProjectGraph와 원고 revision을 대조하고 있습니다…")}</div>
      ) : null}

      {state.kind === "error" ? (
        <div className="mt-4 rounded-xl border border-bad/35 bg-bad/10 p-4" role="alert">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "Studio 정본을 연결할 수 없습니다.")}</p>
              <p className="mt-1 text-xs leading-5 text-fg-2">{state.message}</p>
              <p className="mt-1 text-xs leading-5 text-fg-3">
                {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "먼저 Studio에서 프로젝트와 원고를 저장한 뒤 다시 확인하세요. 제작 데이터는 변경되지 않습니다.")}</p>
            </div>
          </div>
        </div>
      ) : null}

      {audit ? (
        <>
          {!audit.workMatches ? (
            <div className="mt-4 rounded-xl border border-bad/35 bg-bad/10 p-3 text-xs text-fg" role="alert">
              {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "Production의 work ID와 Studio ProjectGraph의 work ID가 다릅니다. 자동 고정을 중단했습니다.")}</div>
          ) : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-line bg-panel p-3">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "Studio 산출물")}</p>
              <p className="mt-2 text-2xl font-black text-fg">{state.kind === "ready" ? state.data.project.artifacts.length : 0}</p>
              <p className="mt-1 text-xs text-fg-2">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "ProjectGraph v3 정본")}</p>
            </div>
            <div className="rounded-xl border border-good/30 bg-good/10 p-3">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "고정 완료")}</p>
              <p className="mt-2 text-2xl font-black text-fg">{audit.boundTaskCount}</p>
              <p className="mt-1 text-xs text-fg-2">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "실제 digest 일치")}</p>
            </div>
            <div className="rounded-xl border border-warn/30 bg-warn/10 p-3">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "연결 가능")}</p>
              <p className="mt-2 text-2xl font-black text-fg">{audit.recommendableTaskCount}</p>
              <p className="mt-1 text-xs text-fg-2">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "승인본 우선 추천")}</p>
            </div>
            <div className="rounded-xl border border-bad/30 bg-bad/10 p-3">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "불일치")}</p>
              <p className="mt-2 text-2xl font-black text-fg">{audit.staleTaskCount + submissionIssues.length}</p>
              <p className="mt-1 text-xs text-fg-2">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "검수 전 해결 필요")}</p>
            </div>
          </div>
          {actionable.length > 0 ? (
            <div className="mt-4 rounded-xl border border-line bg-panel/65 p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "입력 revision 연결")}</h3>
                  <p className="mt-1 text-xs leading-5 text-fg-2">
                    {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "범위와 담당 공정이 일치하는 승인 revision을 우선합니다. 승인본이 없으면 현재 head를 제안합니다.")}</p>
                </div>
                <button
                  type="button"
                  className={buttonClass({ size: "sm" })}
                  onClick={() => void pinAll()}
                  disabled={!canEdit || !audit.workMatches || audit.recommendableTaskCount === 0 || pinningTaskIds.size > 0}
                >
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "추천 revision 모두 고정")}</button>
              </div>

              <div className="mt-3 space-y-2">
                {actionable.slice(0, 12).map((binding) => (
                  <article
                    key={binding.task.id}
                    className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3 lg:flex-row lg:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn(
                          "rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold",
                          statusTone(binding.status),
                        )}>
                          {bridgeStatusLabel(binding.status)}
                        </span>
                        <span className="text-[0.6875rem] font-semibold text-fg-3">
                          {binding.department ?? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "공정 미분류")}
                        </span>
                      </div>
                      <h4 className="mt-2 truncate text-sm font-bold text-fg">{binding.task.title}</h4>
                      <p className="mt-1 text-xs leading-5 text-fg-2">{binding.reason}</p>
                      {binding.recommended ? (
                        <p className="mt-1 break-all font-mono text-[0.6875rem] text-fg-3">
                          {binding.recommended.artifactTitle} · {binding.recommended.revisionRef.id}
                          {binding.recommended.approved ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", " · 승인본") : binding.recommended.head ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", " · 현재 head") : ""}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={buttonClass({ variant: "outline", size: "sm" })}
                      onClick={() => void pinOne(binding.task.id)}
                      disabled={!canEdit || !audit.workMatches || !binding.recommended || pinningTaskIds.has(binding.task.id)}
                    >
                      <Link2 className="size-4" aria-hidden="true" />
                      {pinningTaskIds.has(binding.task.id) ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "고정 중…") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "추천 revision 고정")}
                    </button>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-good/30 bg-good/10 p-4 text-sm text-fg">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-hidden="true" />
              {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "모든 제작 작업의 입력이 현재 Studio 정본과 일치합니다.")}</div>
          )}

          {submissionIssues.length > 0 ? (
            <div className="mt-4 rounded-xl border border-bad/30 bg-bad/10 p-3 sm:p-4">
              <h3 className="text-sm font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "제출본 정본 불일치")}</h3>
              <p className="mt-1 text-xs leading-5 text-fg-2">
                {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "이미 제출된 revision은 자동 교체하지 않습니다. 새 Studio revision으로 다시 제출하고 기존 제출본을 보존하세요.")}</p>
              <ul className="mt-3 space-y-2">
                {submissionIssues.map((binding) => (
                  <li key={binding.submission.id} className="rounded-lg border border-bad/25 bg-card/70 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn(
                        "rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold",
                        statusTone(binding.status),
                      )}>
                        {binding.status === "stale" ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "digest 불일치") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionStudioRevisionBridgePanel", "ko", "정본 없음")}
                      </span>
                      <strong className="text-xs text-fg">{binding.submission.id}</strong>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-fg-2">{binding.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
