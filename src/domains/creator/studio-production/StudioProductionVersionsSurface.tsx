import {
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  Download,
  FileClock,
  GitBranch,
  History,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  createStudioVersionSnapshot,
  diffStudioVersionSnapshots,
  hashStudioProductionValue,
  restoreStudioVersionSnapshot,
  snapshotPayloadFromWorkspace,
  type StudioVersionSnapshot,
} from "./studio-production-model";
import type { StudioProductionSurfaceProps } from "./studio-production-component-types";
import {
  STUDIO_PRODUCTION_INPUT_CLASS,
  STUDIO_PRODUCTION_TEXTAREA_CLASS,
  StudioProductionCard,
  StudioProductionEmpty,
  StudioProductionField,
  StudioProductionMetric,
  StudioProductionPill,
  formatStudioProductionDate,
} from "./StudioProductionUi";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

const KIND_LABELS: Readonly<Record<StudioVersionSnapshot["kind"], string>> = {
  baseline: "기준선",
  manual: "수동",
  approval: "승인",
  delivery: "납품",
  restore: "복원",
};

function kindTone(kind: StudioVersionSnapshot["kind"]) {
  if (kind === "approval" || kind === "delivery") return "success" as const;
  if (kind === "restore") return "warning" as const;
  if (kind === "baseline") return "accent" as const;
  return "neutral" as const;
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function StudioProductionVersionsSurface({
  workspace,
  commit,
}: StudioProductionSurfaceProps) {
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [branch, setBranch] = useState("main");
  const [beforeId, setBeforeId] = useState(workspace.versions.at(-1)?.id ?? workspace.versions[0]?.id ?? "");
  const [afterId, setAfterId] = useState(workspace.versions[0]?.id ?? "");
  const branches = useMemo(
    () => Array.from(new Set(workspace.versions.map((snapshot) => snapshot.branch))),
    [workspace.versions],
  );
  const filteredVersions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return workspace.versions.filter((snapshot) => {
      if (branchFilter !== "all" && snapshot.branch !== branchFilter) return false;
      if (!normalized) return true;
      return [snapshot.name, snapshot.summary, snapshot.author, snapshot.branch]
        .some((value) => value.toLocaleLowerCase("ko-KR").includes(normalized));
    });
  }, [branchFilter, query, workspace.versions]);
  const before = workspace.versions.find((snapshot) => snapshot.id === beforeId) ?? null;
  const after = workspace.versions.find((snapshot) => snapshot.id === afterId) ?? null;
  const diff = before && after ? diffStudioVersionSnapshots(before, after) : null;
  const currentChecksum = hashStudioProductionValue(snapshotPayloadFromWorkspace(workspace));
  const latest = workspace.versions[0] ?? null;
  const hasUncommittedChanges = latest?.checksum !== currentChecksum;

  const createVersion = () => {
    const snapshot = createStudioVersionSnapshot(workspace, {
      name,
      summary,
      branch,
      kind: "manual",
    });
    commit(
      { action: "버전 생성", detail: `${snapshot.branch} · ${snapshot.name}` },
      (current) => ({ ...current, versions: [snapshot, ...current.versions] }),
    );
    setName("");
    setSummary("");
    setShowCreate(false);
    setAfterId(snapshot.id);
  };

  const togglePin = (snapshot: StudioVersionSnapshot) => {
    commit(
      { action: snapshot.pinned ? "버전 고정 해제" : "버전 고정", detail: snapshot.name },
      (current) => ({
        ...current,
        versions: current.versions.map((item) => (
          item.id === snapshot.id ? { ...item, pinned: !item.pinned } : item
        )),
      }),
    );
  };

  const deleteVersion = (snapshot: StudioVersionSnapshot) => {
    if (snapshot.kind === "baseline") return;
    commit(
      { action: "버전 삭제", detail: snapshot.name },
      (current) => ({ ...current, versions: current.versions.filter((item) => item.id !== snapshot.id) }),
    );
    if (beforeId === snapshot.id) setBeforeId(workspace.versions.at(-1)?.id ?? "");
    if (afterId === snapshot.id) setAfterId(workspace.versions[0]?.id ?? "");
  };

  const restoreVersion = (snapshot: StudioVersionSnapshot) => {
    commit(
      { action: "버전 복원", detail: snapshot.name },
      (current) => restoreStudioVersionSnapshot(current, snapshot),
    );
  };

  return (
    <div className="space-y-4" data-studio-production-surface="versions">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StudioProductionMetric
          label="저장된 버전"
          value={`${workspace.versions.length}개`}
          detail={`${branches.length}개 브랜치`}
          icon={<History className="size-4" aria-hidden="true" />}
          tone="accent"
        />
        <StudioProductionMetric
          label="현재 상태"
          value={hasUncommittedChanges ? "변경 있음" : "기록됨"}
          detail={latest ? `최근 ${latest.name}` : "버전 없음"}
          icon={<FileClock className="size-4" aria-hidden="true" />}
          tone={hasUncommittedChanges ? "warning" : "success"}
        />
        <StudioProductionMetric
          label="승인 기준선"
          value={`${workspace.versions.filter((item) => item.kind === "approval").length}개`}
          detail="리뷰 승인 시 자동 생성"
          icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
          tone="success"
        />
        <StudioProductionMetric
          label="고정 버전"
          value={`${workspace.versions.filter((item) => item.pinned).length}개`}
          detail="삭제·정리 전 보호할 기준점"
          icon={<Pin className="size-4" aria-hidden="true" />}
        />
      </div>

      <StudioProductionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-fg">현재 작업 기준선</h2>
            <p className="mt-1 text-xs text-fg-2">
              {hasUncommittedChanges
                ? "최근 버전 이후 제작 보드·검수·피치 자료가 변경되었습니다."
                : "현재 운영 상태가 최근 버전과 일치합니다."}
            </p>
          </div>
          <button type="button" className={buttonClass()} onClick={() => setShowCreate(true)}>
            <Plus className="size-4" aria-hidden="true" /> 현재 상태 버전 만들기
          </button>
        </div>
      </StudioProductionCard>

      {showCreate ? (
        <StudioProductionCard title="새 버전" description="브랜치 이름을 나누면 실험안과 승인안을 독립적으로 비교할 수 있습니다.">
          <form
            className="grid gap-3 lg:grid-cols-[minmax(12rem,0.9fr)_minmax(10rem,0.6fr)_minmax(16rem,1.3fr)_auto] lg:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              createVersion();
            }}
          >
            <StudioProductionField label="버전 이름">
              <input autoFocus required value={name} onChange={(event) => setName(event.currentTarget.value)} className={STUDIO_PRODUCTION_INPUT_CLASS} placeholder="예: 3화 채색 검수 전" />
            </StudioProductionField>
            <StudioProductionField label="브랜치">
              <input value={branch} onChange={(event) => setBranch(event.currentTarget.value)} className={STUDIO_PRODUCTION_INPUT_CLASS} list="studio-production-branches" />
              <datalist id="studio-production-branches">
                {branches.map((item) => <option key={item} value={item} />)}
                <option value="experiment" />
                <option value="client-review" />
              </datalist>
            </StudioProductionField>
            <StudioProductionField label="변경 요약">
              <input value={summary} onChange={(event) => setSummary(event.currentTarget.value)} className={STUDIO_PRODUCTION_INPUT_CLASS} placeholder="무엇을 결정하거나 실험했는지 기록" />
            </StudioProductionField>
            <div className="flex gap-2">
              <button type="submit" className={buttonClass({ size: "sm" })}>생성</button>
              <button type="button" className={buttonClass({ variant: "quiet", size: "sm" })} onClick={() => setShowCreate(false)}>취소</button>
            </div>
          </form>
        </StudioProductionCard>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(25rem,1.05fr)_minmax(24rem,0.95fr)]">
        <StudioProductionCard
          title="버전 타임라인"
          description="고정·내보내기·복원·삭제를 한 목록에서 처리합니다."
          action={(
            <div className="flex flex-wrap gap-2">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
                <span className="sr-only">버전 검색</span>
                <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} className={cn(STUDIO_PRODUCTION_INPUT_CLASS, "min-w-44 pl-9")} placeholder="버전 검색" />
              </label>
              <select value={branchFilter} onChange={(event) => setBranchFilter(event.currentTarget.value)} className={cn(STUDIO_PRODUCTION_INPUT_CLASS, "w-auto min-w-32")} aria-label="브랜치 필터">
                <option value="all">모든 브랜치</option>
                {branches.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          )}
        >
          <div className="space-y-2">
            {filteredVersions.length === 0 ? (
              <StudioProductionEmpty icon={<History className="size-5" aria-hidden="true" />} title="버전이 없습니다" description="현재 상태를 버전으로 남기거나 필터를 변경하세요." />
            ) : filteredVersions.map((snapshot, index) => (
              <article key={snapshot.id} className="rounded-2xl border border-line bg-panel p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StudioProductionPill tone={kindTone(snapshot.kind)}>{KIND_LABELS[snapshot.kind]}</StudioProductionPill>
                      <StudioProductionPill><GitBranch className="mr-1 size-3" aria-hidden="true" />{snapshot.branch}</StudioProductionPill>
                      {snapshot.pinned ? <StudioProductionPill tone="warning">고정</StudioProductionPill> : null}
                      {index === 0 && branchFilter === "all" ? <StudioProductionPill tone="accent">최근</StudioProductionPill> : null}
                    </div>
                    <h3 className="mt-2 text-sm font-bold text-fg">{snapshot.name}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-fg-2">{snapshot.summary || "변경 요약 없음"}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-fg-3">
                      <span>{snapshot.author}</span>
                      <time>{formatStudioProductionDate(snapshot.createdAt)}</time>
                      <span>{snapshot.checksum}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className={buttonClass({ variant: "quiet", size: "icon" })} onClick={() => togglePin(snapshot)} aria-label={snapshot.pinned ? `${snapshot.name} 고정 해제` : `${snapshot.name} 고정`}>
                      {snapshot.pinned ? <PinOff className="size-4" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}
                    </button>
                    <button type="button" className={buttonClass({ variant: "quiet", size: "icon" })} onClick={() => downloadJson(`${snapshot.name.replaceAll(/\s+/gu, "-")}.toon-version.json`, snapshot)} aria-label={`${snapshot.name} 내보내기`}>
                      <Download className="size-4" aria-hidden="true" />
                    </button>
                    <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => restoreVersion(snapshot)}>
                      <RotateCcw className="size-4" aria-hidden="true" /> 복원
                    </button>
                    <button type="button" disabled={snapshot.kind === "baseline" || snapshot.pinned} className={buttonClass({ variant: "quiet", size: "icon" })} onClick={() => deleteVersion(snapshot)} aria-label={`${snapshot.name} 삭제`}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </StudioProductionCard>

        <StudioProductionCard title="버전 비교" description="두 기준선 사이의 회차·리뷰·체크·피치 자료 변화를 구조적으로 비교합니다.">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <StudioProductionField label="이전 버전">
              <select value={beforeId} onChange={(event) => setBeforeId(event.currentTarget.value)} className={STUDIO_PRODUCTION_INPUT_CLASS}>
                {workspace.versions.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.name} · {snapshot.branch}</option>)}
              </select>
            </StudioProductionField>
            <ArrowRightLeft className="mb-3 hidden size-5 text-fg-3 sm:block" aria-hidden="true" />
            <StudioProductionField label="이후 버전">
              <select value={afterId} onChange={(event) => setAfterId(event.currentTarget.value)} className={STUDIO_PRODUCTION_INPUT_CLASS}>
                {workspace.versions.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.name} · {snapshot.branch}</option>)}
              </select>
            </StudioProductionField>
          </div>

          {diff ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ["전체", diff.totalChanges],
                  ["회차 추가", diff.episodesAdded],
                  ["회차 삭제", diff.episodesRemoved],
                  ["회차 수정", diff.episodesChanged],
                  ["리뷰", diff.reviewsChanged],
                  ["납품 체크", diff.checklistChanged],
                  ["피치", diff.slidesChanged],
                  ["프로젝트", diff.projectFieldsChanged],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-line bg-panel p-3">
                    <p className="text-[0.6875rem] text-fg-3">{label}</p>
                    <p className="mt-1 text-lg font-black text-fg">{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="text-xs font-bold text-fg">변경 요약</h3>
                {diff.details.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 text-xs text-fg-2">
                    {diff.details.map((detail) => <li key={detail} className="flex gap-2"><span className="text-accent">•</span>{detail}</li>)}
                  </ul>
                ) : <p className="mt-2 text-xs text-fg-3">두 버전의 구조적 차이가 없습니다.</p>}
              </div>
              <StudioProductionField label="비교 메모" hint="화면 전용 메모">
                <textarea className={STUDIO_PRODUCTION_TEXTAREA_CLASS} placeholder="채택할 변경, 되돌릴 항목, 추가 검수 내용을 기록하세요" />
              </StudioProductionField>
            </div>
          ) : (
            <StudioProductionEmpty icon={<Clock3 className="size-5" aria-hidden="true" />} title="비교할 버전을 선택하세요" description="버전이 두 개 이상이면 구조적 변경 요약을 볼 수 있습니다." />
          )}
        </StudioProductionCard>
      </div>
    </div>
  );
}
