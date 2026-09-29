import {
  BadgeCheck,
  Bookmark,
  Camera,
  CheckCircle2,
  Columns2,
  Eye,
  GitCompareArrows,
  History,
  Layers,
  LoaderCircle,
  PackageCheck,
  RotateCcw,
  Send,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type UIEvent as ReactUIEvent,
} from "react";

import { getApiErrorMessage } from "@/platform/api";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  newStudioProjectGraphId,
  restoreStudioRevision,
} from "../project-graph/studio-project-graph-client";
import { getStudioProjectGraphDeviceId } from "../project-graph/studio-project-graph-device";
import { linkedReviewScroll } from "../virtual-space/studio-review-comparison-model";
import {
  createProductionManuscriptSnapshot,
  listProductionManuscriptSnapshots,
  manuscriptSnapshotOverlayAllowed,
  updateProductionManuscriptSnapshotMemo,
  type ProductionManuscriptSnapshot,
} from "./production-manuscript-snapshots";
import {
  productionManuscriptRevisionLabel,
  type ProductionManuscriptProcess,
} from "./production-manuscript-model";

type CompareMode = "side-by-side" | "overlay";

const KIND_ICONS: Record<ProductionManuscriptSnapshot["revisionKind"], LucideIcon> = {
  autosave: History,
  checkpoint: Bookmark,
  submission: Send,
  "review-snapshot": Eye,
  approved: BadgeCheck,
  release: PackageCheck,
};

const KIND_TONES: Record<ProductionManuscriptSnapshot["revisionKind"], string> = {
  autosave: "border-line bg-panel text-fg-2",
  checkpoint: "border-accent/40 bg-accent-soft/30 text-accent",
  submission: "border-warn/35 bg-warn/10 text-warn",
  "review-snapshot": "border-accent/40 bg-accent-soft/30 text-accent",
  approved: "border-good/35 bg-good/10 text-good",
  release: "border-good/35 bg-good/10 text-good",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shortHash(value: string): string {
  return value.length > 16 ? `${value.slice(0, 12)}…` : value;
}

function SnapshotThumbnail({ snapshot }: { readonly snapshot: ProductionManuscriptSnapshot }) {
  const Icon = KIND_ICONS[snapshot.revisionKind];
  return <div
    className={cn(
      "flex aspect-video flex-col items-center justify-center gap-1 rounded-xl border",
      KIND_TONES[snapshot.revisionKind],
    )}
    aria-hidden="true"
  >
    <Icon className="size-6" />
    <span className="text-lg font-black tracking-tight">{snapshot.name}</span>
    <span className="text-[0.625rem] font-bold">{productionManuscriptRevisionLabel(snapshot.revisionKind)}</span>
  </div>;
}

function SnapshotMemoField({
  snapshot,
  onCommit,
}: {
  readonly snapshot: ProductionManuscriptSnapshot;
  readonly onCommit: (snapshotId: string, memo: string) => void;
}) {
  const [draft, setDraft] = useState(snapshot.memo);
  useEffect(() => setDraft(snapshot.memo), [snapshot.memo]);
  const dirty = draft.trim().slice(0, 200) !== snapshot.memo;
  return <label className="mt-2 block">
    <span className="sr-only">{snapshot.name} 메모</span>
    <input
      value={draft}
      maxLength={200}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => { if (dirty) onCommit(snapshot.id, draft); }}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
      placeholder="메모를 입력하세요 (예: 콘티 수정 전)"
      className="min-h-11 w-full rounded-xl border border-line bg-card px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent"
    />
  </label>;
}

function SnapshotDetailCard({
  snapshot,
  caption,
  isHead,
  isApproved,
}: {
  readonly snapshot: ProductionManuscriptSnapshot;
  readonly caption: string;
  readonly isHead: boolean;
  readonly isApproved: boolean;
}) {
  const rows: ReadonlyArray<readonly [string, string]> = [
    ["버전", snapshot.name],
    ["메모", snapshot.memo || "메모 없음"],
    ["생성일시", formatDate(snapshot.createdAt)],
    ["원본 종류", productionManuscriptRevisionLabel(snapshot.revisionKind)],
    ["원본 메시지", snapshot.revisionMessage || "—"],
    ["Revision ID", snapshot.revisionId],
    ["원본 해시", shortHash(snapshot.rootGraphHash)],
    ["상태", [isHead ? "HEAD · 현재 작업본" : null, isApproved ? "FINAL · 승인 기준" : null].filter(Boolean).join(" · ") || "보관된 스냅샷"],
  ];
  return <div className="min-w-0 rounded-2xl border border-line bg-card p-4">
    <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-accent">{caption}</p>
    <div className="mt-3"><SnapshotThumbnail snapshot={snapshot} /></div>
    <dl className="mt-3 space-y-2">
      {rows.map(([term, value]) => <div key={term} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-xs">
        <dt className="font-bold text-fg-3">{term}</dt>
        <dd className="break-all font-semibold text-fg">{value}</dd>
      </div>)}
    </dl>
  </div>;
}

interface ProductionManuscriptSnapshotPanelProps {
  readonly process: ProductionManuscriptProcess;
  readonly canEdit: boolean;
  readonly onChanged: () => void;
}

export function ProductionManuscriptSnapshotPanel({
  process,
  canEdit,
  onChanged,
}: ProductionManuscriptSnapshotPanelProps) {
  const artifactId = process.artifact.id;
  const [snapshots, setSnapshots] = useState<readonly ProductionManuscriptSnapshot[]>(() =>
    listProductionManuscriptSnapshots(artifactId));
  const [memoDraft, setMemoDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<readonly string[]>([]);
  const [compareMode, setCompareMode] = useState<CompareMode>("side-by-side");
  const [opacity, setOpacity] = useState(50);
  const [restoreTarget, setRestoreTarget] = useState<ProductionManuscriptSnapshot | null>(null);
  const [restoring, setRestoring] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const scrollSyncingRef = useRef(false);
  const headingId = useId();
  const compareHeadingId = useId();
  const restoreHeadingId = useId();
  const headRevisionId = process.headRevision?.id ?? null;
  const approvedRevisionId = process.approvedRevision?.id ?? null;

  const refresh = useCallback(() => {
    setSnapshots(listProductionManuscriptSnapshots(artifactId));
  }, [artifactId]);

  useEffect(() => {
    refresh();
    setCompareIds([]);
    setCompareMode("side-by-side");
    setNotice(null);
    setError(null);
    setMemoDraft("");
  }, [refresh]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (restoreTarget && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>("[data-restore-confirm]")?.focus();
    } else if (!restoreTarget && dialog.open) {
      dialog.close();
    }
  }, [restoreTarget]);

  const takeSnapshot = useCallback(() => {
    const head = process.headRevision;
    if (!head) {
      setError("작업본(HEAD)이 없어 스냅샷을 만들 수 없습니다.");
      return;
    }
    const created = createProductionManuscriptSnapshot(artifactId, {
      revisionId: head.id,
      rootGraphHash: head.rootGraphHash,
      revisionKind: head.kind,
      revisionMessage: head.message,
    }, memoDraft);
    if (!created) {
      setError("스냅샷을 저장하지 못했습니다.");
      return;
    }
    setMemoDraft("");
    setError(null);
    setNotice(`${created.name} 스냅샷을 저장했습니다. 메모는 목록에서 언제든 수정할 수 있습니다.`);
    refresh();
  }, [artifactId, memoDraft, process.headRevision, refresh]);

  const commitMemo = useCallback((snapshotId: string, memo: string) => {
    setSnapshots(updateProductionManuscriptSnapshotMemo(artifactId, snapshotId, memo));
  }, [artifactId]);

  const toggleCompare = useCallback((snapshotId: string) => {
    setCompareIds((current) => {
      if (current.includes(snapshotId)) return current.filter((candidate) => candidate !== snapshotId);
      const rest = current.length >= 2 ? current.slice(1) : current;
      return [...rest, snapshotId];
    });
  }, []);

  const clearCompare = useCallback(() => setCompareIds([]), []);

  const compareLeft = compareIds.length === 2
    ? snapshots.find((snapshot) => snapshot.id === compareIds[0]) ?? null
    : null;
  const compareRight = compareIds.length === 2
    ? snapshots.find((snapshot) => snapshot.id === compareIds[1]) ?? null
    : null;
  const comparable = compareLeft && compareRight ? { left: compareLeft, right: compareRight } : null;
  const overlayAllowed = comparable ? manuscriptSnapshotOverlayAllowed(comparable.left, comparable.right) : false;
  const activeCompareMode = compareMode === "overlay" && !overlayAllowed ? "side-by-side" : compareMode;

  const handlePaneScroll = useCallback((source: "left" | "right") =>
    (event: ReactUIEvent<HTMLDivElement>) => {
      if (scrollSyncingRef.current) return;
      const from = source === "left" ? leftPaneRef.current : rightPaneRef.current;
      const to = source === "left" ? rightPaneRef.current : leftPaneRef.current;
      if (!from || !to) return;
      // studio-review-comparison-model의 상대 스크롤 로직을 재사용한다.
      const next = linkedReviewScroll(
        event.currentTarget.scrollTop,
        from.scrollHeight - from.clientHeight,
        to.scrollHeight - to.clientHeight,
      );
      if (next === null) return;
      scrollSyncingRef.current = true;
      to.scrollTop = next;
      requestAnimationFrame(() => { scrollSyncingRef.current = false; });
    }, []);

  const canRestore = useCallback((snapshot: ProductionManuscriptSnapshot) =>
    canEdit
    && headRevisionId !== null
    && snapshot.revisionId !== headRevisionId
    && snapshot.revisionKind !== "release",
  [canEdit, headRevisionId]);

  const confirmRestore = useCallback(async () => {
    if (!restoreTarget || !headRevisionId) return;
    setRestoring(true);
    setError(null);
    try {
      await restoreStudioRevision(
        artifactId,
        restoreTarget.revisionId,
        headRevisionId,
        {
          revisionId: newStudioProjectGraphId("revision-restore"),
          commandId: newStudioProjectGraphId("command-restore"),
          deviceId: getStudioProjectGraphDeviceId(
            typeof window === "undefined" ? null : window.localStorage,
          ),
          createdAt: new Date().toISOString(),
          message: `${restoreTarget.name} 스냅샷에서 복원${restoreTarget.memo ? ` · ${restoreTarget.memo}` : ""}`.slice(0, 500),
        },
      );
      setRestoreTarget(null);
      setCompareIds([]);
      setNotice("새 복원 체크포인트를 만들었습니다. 과거와 현재 버전은 모두 보존됩니다.");
      refresh();
      onChanged();
    } catch (cause) {
      setError(await getApiErrorMessage(cause, "스냅샷을 복원하지 못했습니다."));
    } finally {
      setRestoring(false);
    }
  }, [artifactId, headRevisionId, onChanged, refresh, restoreTarget]);

  const isHeadSnapshot = (snapshot: ProductionManuscriptSnapshot) =>
    headRevisionId !== null && snapshot.revisionId === headRevisionId;
  const isApprovedSnapshot = (snapshot: ProductionManuscriptSnapshot) =>
    approvedRevisionId !== null && snapshot.revisionId === approvedRevisionId;

  return <section
    className="rounded-3xl border border-line bg-card p-4 sm:p-6"
    aria-labelledby={headingId}
  >
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">VERSION SNAPSHOTS</p>
        <h2 id={headingId} className="mt-2 text-xl font-black text-fg">원클릭 버전 스냅샷</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-fg-2">
          작업 중 언제든 현재 작업본(HEAD)의 참조를 버전으로 저장합니다. 스냅샷은 ProjectGraph revision을 덮어쓰지 않으며,
          복원은 기존 이력을 보존한 채 새 체크포인트를 만듭니다.
        </p>
      </div>
      {canEdit ? <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:items-center">
        <label className="min-w-0 flex-1 lg:w-56">
          <span className="sr-only">스냅샷 메모</span>
          <input
            value={memoDraft}
            maxLength={200}
            onChange={(event) => setMemoDraft(event.target.value)}
            placeholder="메모 (선택, 예: 콘티 수정 전)"
            className="min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent"
          />
        </label>
        <button
          type="button"
          onClick={takeSnapshot}
          disabled={!process.headRevision}
          title={process.headRevision ? "현재 작업본을 버전 스냅샷으로 저장" : "작업본이 없어 스냅샷을 만들 수 없습니다"}
          className={buttonClass({ size: "sm" })}
        >
          <Camera className="size-4" aria-hidden="true" /> 스냅샷 찍기
        </button>
      </div> : null}
    </div>

    {notice ? <p className="mt-4 rounded-xl border border-accent/25 bg-accent-soft/30 px-3 py-2 text-xs text-fg-2" role="status">{notice}</p> : null}
    {error ? <p className="mt-4 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad" role="alert">{error}</p> : null}

    {comparable ? <div className="mt-5 rounded-2xl border border-accent/30 bg-accent-soft/15 p-4" aria-labelledby={compareHeadingId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={compareHeadingId} className="text-sm font-black text-fg">
          버전 비교 · {comparable.left.name} ↔ {comparable.right.name}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-line bg-card p-1" role="group" aria-label="비교 표시 방식">
            <button
              type="button"
              aria-pressed={activeCompareMode === "side-by-side"}
              onClick={() => setCompareMode("side-by-side")}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold",
                activeCompareMode === "side-by-side" ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised",
              )}
            >
              <Columns2 className="size-3.5" aria-hidden="true" /> 나란히 보기
            </button>
            <button
              type="button"
              aria-pressed={activeCompareMode === "overlay"}
              onClick={() => setCompareMode("overlay")}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold",
                activeCompareMode === "overlay" ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised",
              )}
            >
              <Layers className="size-3.5" aria-hidden="true" /> 겹치기
            </button>
          </div>
          <button
            type="button"
            onClick={clearCompare}
            className={buttonClass({ variant: "quiet", size: "sm" })}
          >
            <X className="size-4" aria-hidden="true" /> 선택 해제
          </button>
        </div>
      </div>

      {activeCompareMode === "overlay" ? <div className="mt-4 space-y-3">
        <label className="block text-sm font-bold text-fg">
          위 버전({comparable.right.name}) 불투명도 · {opacity}%
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
            className="mt-2 block min-h-11 w-full accent-accent"
            aria-label={`위 버전 ${comparable.right.name} 불투명도`}
          />
        </label>
        <div className="grid overflow-hidden rounded-2xl border border-line">
          <div className="col-start-1 row-start-1">
            <SnapshotDetailCard snapshot={comparable.left} caption={`아래 · ${comparable.left.name}`} isHead={isHeadSnapshot(comparable.left)} isApproved={isApprovedSnapshot(comparable.left)} />
          </div>
          <div className="col-start-1 row-start-1" style={{ opacity: opacity / 100 }}>
            <SnapshotDetailCard snapshot={comparable.right} caption={`위 · ${comparable.right.name}`} isHead={isHeadSnapshot(comparable.right)} isApproved={isApprovedSnapshot(comparable.right)} />
          </div>
        </div>
        <p className="text-xs leading-5 text-fg-2">
          두 버전의 기록 카드를 겹쳐 표시합니다. 이미지 픽셀 단위의 겹치기 비교는 검수 스냅샷이 있는 버전의 전문 비교 작업대에서 확인하세요.
        </p>
      </div> : <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
        {([
          { side: "left", snapshot: comparable.left, caption: `A · ${comparable.left.name}` },
          { side: "right", snapshot: comparable.right, caption: `B · ${comparable.right.name}` },
        ] as const).map(({ side, snapshot, caption }) => <div
          key={side}
          ref={side === "left" ? leftPaneRef : rightPaneRef}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Read-only compare scroll regions require keyboard focus.
          tabIndex={0}
          role="region"
          aria-label={`${caption} 버전 정보`}
          onScroll={handlePaneScroll(side)}
          className="max-h-96 min-w-0 overflow-auto overscroll-contain rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <SnapshotDetailCard
            snapshot={snapshot}
            caption={caption}
            isHead={isHeadSnapshot(snapshot)}
            isApproved={isApprovedSnapshot(snapshot)}
          />
        </div>)}
      </div>}
      <p className="mt-3 text-xs leading-5 text-fg-2">
        나란히 보기에서는 한쪽을 스크롤하면 다른 쪽도 같은 비율로 함께 움직입니다.
      </p>
    </div> : null}

    {snapshots.length > 0 ? <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="list" aria-label="버전 스냅샷 목록">
      {snapshots.map((snapshot) => {
        const inCompare = compareIds.includes(snapshot.id);
        const head = isHeadSnapshot(snapshot);
        const approved = isApprovedSnapshot(snapshot);
        return <article
          key={snapshot.id}
          role="listitem"
          aria-label={`${snapshot.name} 스냅샷`}
          className={cn(
            "flex min-w-0 flex-col rounded-2xl border p-3",
            head ? "border-accent/45 bg-accent-soft/20" : "border-line bg-panel",
          )}
        >
          <SnapshotThumbnail snapshot={snapshot} />
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-black text-fg">{snapshot.name}</span>
            {head ? <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[0.625rem] font-bold text-on-accent">
              <CheckCircle2 className="size-3" aria-hidden="true" /> HEAD · 현재 작업본
            </span> : null}
            {approved ? <span className="inline-flex items-center gap-1 rounded-full bg-good/15 px-2 py-0.5 text-[0.625rem] font-bold text-good">
              <ShieldCheck className="size-3" aria-hidden="true" /> FINAL · 승인 기준
            </span> : null}
          </div>
          <SnapshotMemoField snapshot={snapshot} onCommit={commitMemo} />
          <p className="mt-2 truncate font-mono text-[0.625rem] text-fg-3">
            {formatDate(snapshot.createdAt)} · {snapshot.revisionId}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={inCompare}
              onClick={() => toggleCompare(snapshot.id)}
              className={buttonClass({ variant: inCompare ? "solid" : "outline", size: "sm" })}
            >
              <GitCompareArrows className="size-4" aria-hidden="true" /> {inCompare ? "비교 해제" : "비교에 담기"}
            </button>
            {canRestore(snapshot) ? <button
              type="button"
              onClick={() => setRestoreTarget(snapshot)}
              className={buttonClass({ variant: "quiet", size: "sm" })}
            >
              <RotateCcw className="size-4" aria-hidden="true" /> 복원
            </button> : null}
          </div>
        </article>;
      })}
    </div> : <div className="mt-5 rounded-2xl border border-dashed border-line p-8 text-center">
      <Camera className="mx-auto size-7 text-fg-3" aria-hidden="true" />
      <p className="mt-2 font-black text-fg">아직 스냅샷이 없습니다</p>
      <p className="mt-1 text-sm text-fg-2">
        작업 중 스냅샷 찍기를 누르면 현재 작업본이 v1부터 자동 이름으로 저장됩니다.
      </p>
    </div>}

    <dialog
      ref={dialogRef}
      aria-labelledby={restoreHeadingId}
      onCancel={(event) => { event.preventDefault(); setRestoreTarget(null); }}
      onClose={() => setRestoreTarget(null)}
      className="rounded-3xl border border-line bg-card p-0 text-fg backdrop:bg-black/50"
    >
      {restoreTarget ? <div className="w-[min(28rem,90vw)] p-5 sm:p-6">
        <h2 id={restoreHeadingId} className="text-lg font-black text-fg">스냅샷 복원</h2>
        <p className="mt-2 text-sm leading-6 text-fg-2">
          <span className="font-black text-fg">{restoreTarget.name}</span>
          {restoreTarget.memo ? <span> · {restoreTarget.memo}</span> : null}
          <span> ({formatDate(restoreTarget.createdAt)}) 시점의 원고를 현재 작업본으로 복원합니다.</span>
        </p>
        <p className="mt-2 text-sm leading-6 text-fg-2">
          복원은 기존 이력을 덮어쓰지 않고 새 체크포인트를 만듭니다. 현재 작업 내용은 그대로 보존됩니다.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={restoring}
            onClick={() => setRestoreTarget(null)}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            취소
          </button>
          <button
            type="button"
            data-restore-confirm=""
            disabled={restoring}
            onClick={() => void confirmRestore()}
            className={buttonClass({ size: "sm" })}
          >
            {restoring
              ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> 복원 중…</>
              : <><RotateCcw className="size-4" aria-hidden="true" /> 복원하기</>}
          </button>
        </div>
      </div> : null}
    </dialog>
  </section>;
}
