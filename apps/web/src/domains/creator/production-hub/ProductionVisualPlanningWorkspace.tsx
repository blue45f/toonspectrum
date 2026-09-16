import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns3,
  FilePenLine,
  Film,
  GripVertical,
  Layers3,
  ListTree,
  MessageSquareText,
  Plus,
  ScanLine,
  ScrollText,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type {
  CutPlan,
  EpisodePlan,
  PlanningDocumentStatus,
  ProductionProjectAggregate,
  ScenePlan,
} from "@toonspectrum/core/production";

import type { ProductionClientCommand } from "./production-api";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

type PlanningView = "board" | "scroll" | "outline";

type ExecuteCommand = (
  command: ProductionClientCommand,
  message: string,
) => Promise<void>;

export interface ProductionVisualPlanningWorkspaceProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: ExecuteCommand;
  readonly canEdit: boolean;
  readonly initialEpisodeId?: string;
  readonly showEpisodeRail?: boolean;
  readonly compact?: boolean;
  readonly defaultView?: PlanningView;
}

const VIEW_OPTIONS: readonly {
  readonly id: PlanningView;
  readonly label: string;
  readonly icon: typeof Columns3;
}[] = [
  { id: "board", label: "장면 보드", icon: Columns3 },
  { id: "scroll", label: "세로 독자뷰", icon: ScrollText },
  { id: "outline", label: "구조 보기", icon: ListTree },
];

const STATUS_LABELS: Readonly<Record<PlanningDocumentStatus, string>> = {
  draft: "초안",
  review: "검토",
  approved: "승인",
  locked: "잠금",
  superseded: "이전본",
  archived: "보관",
};

const EDITABLE_CLASS =
  "w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-fg outline-none transition-colors hover:border-line hover:bg-raised focus:border-accent/50 focus:bg-panel disabled:cursor-not-allowed disabled:opacity-60";

function latestProjection<T extends { readonly revision: number }>(
  values: readonly T[],
  keyOf: (value: T) => string,
): readonly T[] {
  const current = new Map<string, T>();
  for (const value of values) {
    const key = keyOf(value);
    const previous = current.get(key);
    if (!previous || value.revision > previous.revision) current.set(key, value);
  }
  return [...current.values()];
}

function nextRevisionId(id: string, revision: number): string {
  if (/-r\d+$/u.test(id)) return id.replace(/-r\d+$/u, `-r${revision}`);
  return `${id}-r${revision}`;
}

function isCanonicalStatus(status: PlanningDocumentStatus): boolean {
  return status === "approved" || status === "locked";
}

function nextEpisodeRevision(
  current: EpisodePlan,
  patch: Partial<EpisodePlan>,
): EpisodePlan {
  const fork = isCanonicalStatus(current.status);
  const revision = current.revision + 1;
  return {
    ...current,
    ...patch,
    id: fork ? nextRevisionId(current.id, revision) : current.id,
    revision,
    status: fork ? "draft" : current.status,
    approvedByAssignmentIds: fork ? [] : current.approvedByAssignmentIds,
    createdAt: new Date().toISOString(),
  };
}

function nextSceneRevision(
  current: ScenePlan,
  patch: Partial<ScenePlan>,
): ScenePlan {
  const fork = isCanonicalStatus(current.status);
  const revision = current.revision + 1;
  return {
    ...current,
    ...patch,
    id: fork ? nextRevisionId(current.id, revision) : current.id,
    revision,
    status: fork ? "draft" : current.status,
    approvedByAssignmentIds: fork ? [] : current.approvedByAssignmentIds,
    createdAt: new Date().toISOString(),
  };
}

function nextCutRevision(
  current: CutPlan,
  patch: Partial<CutPlan>,
): CutPlan {
  const fork = isCanonicalStatus(current.status);
  const revision = current.revision + 1;
  return {
    ...current,
    ...patch,
    id: fork ? nextRevisionId(current.id, revision) : current.id,
    revision,
    status: fork ? "draft" : current.status,
    approvedByAssignmentIds: fork ? [] : current.approvedByAssignmentIds,
    createdAt: new Date().toISOString(),
  };
}

function statusTone(status: PlanningDocumentStatus): string {
  if (status === "locked" || status === "approved") return "border-good/30 bg-good/10 text-good";
  if (status === "review") return "border-warn/30 bg-warn/10 text-warn";
  if (status === "superseded" || status === "archived") return "border-line bg-raised text-fg-3";
  return "border-accent/30 bg-accent-soft text-accent";
}

function MiniPill({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <span className={cn(
      "inline-flex min-h-6 items-center rounded-full border border-line bg-raised px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2",
      className,
    )}>
      {children}
    </span>
  );
}

function InlineText({
  label,
  value,
  onCommit,
  disabled,
  multiline = false,
  allowEmpty = false,
  className,
}: {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
  readonly disabled: boolean;
  readonly multiline?: boolean;
  readonly allowEmpty?: boolean;
  readonly className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = draft.trim();
    if ((!next && !allowEmpty) || next === value) {
      setDraft(value);
      return;
    }
    onCommit(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      setDraft(value);
      event.currentTarget.blur();
      return;
    }
    if (!multiline && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  if (multiline) {
    return (
      <textarea
        aria-label={label}
        value={draft}
        rows={2}
        disabled={disabled}
        className={cn(EDITABLE_CLASS, "resize-y text-xs leading-5", className)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <input
      aria-label={label}
      value={draft}
      disabled={disabled}
      className={cn(EDITABLE_CLASS, "text-sm", className)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

function CutArtwork({
  cut,
  selected,
  onSelect,
  compact = false,
}: {
  readonly cut: CutPlan;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly compact?: boolean;
}) {
  const heightClass = compact
    ? "min-h-28"
    : cut.complexity >= 4
      ? "min-h-52"
      : cut.complexity >= 3
        ? "min-h-44"
        : "min-h-36";
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${cut.cutId} 선택`}
      onClick={onSelect}
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-accent",
        "bg-gradient-to-br from-raised via-panel to-accent-soft",
        heightClass,
        selected
          ? "border-accent shadow-[0_0_0_2px_rgb(var(--accent)/0.14)]"
          : "border-line hover:border-accent/45",
      )}
    >
      <div className="absolute inset-x-4 top-4 h-px bg-line-strong/50" />
      <div className="absolute left-[12%] top-[22%] h-1/3 w-1/3 rounded-[50%_45%_40%_55%] border border-line-strong/50 bg-card/50" />
      <div className="absolute bottom-[18%] right-[9%] h-[38%] w-[42%] rounded-t-full border border-line-strong/40 bg-raised/80" />
      <div className="absolute inset-x-3 bottom-3 rounded-lg border border-line/70 bg-card/88 p-2 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.6875rem] font-black text-accent">{cut.cutId}</span>
          <span className="text-[0.625rem] text-fg-3">난도 {cut.complexity}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs font-semibold leading-4 text-fg">{cut.framing}</p>
        <p className="mt-1 line-clamp-1 text-[0.625rem] text-fg-3">{cut.camera}</p>
      </div>
      {cut.dialogueRefs.length > 0 ? (
        <div className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full border border-line bg-card text-fg-2 shadow-sm">
          <MessageSquareText className="size-3.5" aria-hidden="true" />
        </div>
      ) : null}
    </button>
  );
}

function EmptyCanvas({
  icon: Icon,
  title,
  description,
  action,
}: {
  readonly icon: typeof Film;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-panel/40 p-8 text-center">
      <Icon className="size-8 text-fg-3" aria-hidden="true" />
      <p className="mt-3 text-sm font-bold text-fg">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-fg-2">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ProductionVisualPlanningWorkspace({
  aggregate,
  execute,
  canEdit,
  initialEpisodeId,
  showEpisodeRail = true,
  compact = false,
  defaultView = "board",
}: ProductionVisualPlanningWorkspaceProps) {
  const currentEpisodePlans = useMemo(
    () => latestProjection(aggregate.episodePlans, (plan) => plan.episodeId)
      .filter((plan) => plan.status !== "archived" && plan.status !== "superseded")
      .sort((left, right) => left.episodeNumber - right.episodeNumber),
    [aggregate.episodePlans],
  );
  const currentScenes = useMemo(
    () => latestProjection(aggregate.scenePlans, (plan) => plan.sceneId)
      .filter((plan) => plan.status !== "archived" && plan.status !== "superseded"),
    [aggregate.scenePlans],
  );
  const currentCuts = useMemo(
    () => latestProjection(aggregate.cutPlans, (plan) => plan.cutId)
      .filter((plan) => plan.status !== "archived" && plan.status !== "superseded"),
    [aggregate.cutPlans],
  );

  const preferenceKey = `production-planning-view:${aggregate.projectId}:${showEpisodeRail ? "project" : "episode"}`;
  const [view, setView] = useState<PlanningView>(() => {
    if (typeof window === "undefined") return defaultView;
    const stored = window.localStorage.getItem(preferenceKey);
    return stored === "board" || stored === "scroll" || stored === "outline" ? stored : defaultView;
  });
  const [episodeQuery, setEpisodeQuery] = useState("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(
    initialEpisodeId ?? currentEpisodePlans[0]?.episodeId ?? null,
  );
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(preferenceKey, view);
  }, [preferenceKey, view]);

  useEffect(() => {
    if (initialEpisodeId && currentEpisodePlans.some((plan) => plan.episodeId === initialEpisodeId)) {
      setSelectedEpisodeId(initialEpisodeId);
      return;
    }
    if (!selectedEpisodeId || !currentEpisodePlans.some((plan) => plan.episodeId === selectedEpisodeId)) {
      setSelectedEpisodeId(currentEpisodePlans[0]?.episodeId ?? null);
    }
  }, [currentEpisodePlans, initialEpisodeId, selectedEpisodeId]);

  const selectedEpisode = currentEpisodePlans.find((plan) => plan.episodeId === selectedEpisodeId) ?? null;
  const episodeScenes = useMemo(
    () => currentScenes
      .filter((scene) => scene.episodeId === selectedEpisodeId)
      .sort((left, right) => left.order - right.order),
    [currentScenes, selectedEpisodeId],
  );
  const episodeCuts = useMemo(
    () => currentCuts
      .filter((cut) => cut.episodeId === selectedEpisodeId)
      .sort((left, right) => left.order - right.order),
    [currentCuts, selectedEpisodeId],
  );

  useEffect(() => {
    if (!selectedSceneId || !episodeScenes.some((scene) => scene.sceneId === selectedSceneId)) {
      setSelectedSceneId(episodeScenes[0]?.sceneId ?? null);
    }
  }, [episodeScenes, selectedSceneId]);

  useEffect(() => {
    if (!selectedCutId || !episodeCuts.some((cut) => cut.cutId === selectedCutId)) {
      const firstInScene = episodeCuts.find((cut) => cut.sceneId === selectedSceneId);
      setSelectedCutId(firstInScene?.cutId ?? episodeCuts[0]?.cutId ?? null);
    }
  }, [episodeCuts, selectedCutId, selectedSceneId]);

  const selectedScene = episodeScenes.find((scene) => scene.sceneId === selectedSceneId) ?? null;
  const selectedCut = episodeCuts.find((cut) => cut.cutId === selectedCutId) ?? null;
  const selectedSceneIndex = selectedScene
    ? episodeScenes.findIndex((scene) => scene.sceneId === selectedScene.sceneId)
    : -1;
  const selectedSceneCuts = selectedCut
    ? episodeCuts.filter((cut) => cut.sceneId === selectedCut.sceneId)
    : [];
  const selectedCutIndex = selectedCut
    ? selectedSceneCuts.findIndex((cut) => cut.cutId === selectedCut.cutId)
    : -1;

  const filteredEpisodes = currentEpisodePlans.filter((plan) => {
    const query = episodeQuery.trim().toLocaleLowerCase("ko-KR");
    return !query
      || plan.title.toLocaleLowerCase("ko-KR").includes(query)
      || plan.episodeId.toLocaleLowerCase("ko-KR").includes(query);
  });

  const selectCut = useCallback((cut: CutPlan) => {
    setSelectedEpisodeId(cut.episodeId);
    setSelectedSceneId(cut.sceneId);
    setSelectedCutId(cut.cutId);
  }, []);

  const saveEpisode = useCallback((patch: Partial<EpisodePlan>, message: string) => {
    if (!selectedEpisode || !canEdit) return;
    const value = nextEpisodeRevision(selectedEpisode, patch);
    void execute({ type: "upsert-planning-record", record: { kind: "episode-plan", value } }, message);
  }, [canEdit, execute, selectedEpisode]);

  const saveScene = useCallback((patch: Partial<ScenePlan>, message: string) => {
    if (!selectedScene || !canEdit) return;
    const value = nextSceneRevision(selectedScene, patch);
    void execute({ type: "upsert-planning-record", record: { kind: "scene-plan", value } }, message);
  }, [canEdit, execute, selectedScene]);

  const saveCut = useCallback((patch: Partial<CutPlan>, message: string) => {
    if (!selectedCut || !canEdit) return;
    const value = nextCutRevision(selectedCut, patch);
    void execute({ type: "upsert-planning-record", record: { kind: "cut-plan", value } }, message);
  }, [canEdit, execute, selectedCut]);

  const moveScene = async (direction: -1 | 1) => {
    if (!selectedScene || !canEdit) return;
    const index = episodeScenes.findIndex((scene) => scene.sceneId === selectedScene.sceneId);
    const adjacent = episodeScenes[index + direction];
    if (!adjacent) return;
    await execute(
      { type: "upsert-planning-record", record: { kind: "scene-plan", value: nextSceneRevision(selectedScene, { order: adjacent.order }) } },
      `${selectedScene.sceneId} 순서를 변경했습니다.`,
    );
    await execute(
      { type: "upsert-planning-record", record: { kind: "scene-plan", value: nextSceneRevision(adjacent, { order: selectedScene.order }) } },
      "인접 장면 순서를 동기화했습니다.",
    );
  };

  const moveCut = async (direction: -1 | 1) => {
    if (!selectedCut || !canEdit) return;
    const sceneCuts = episodeCuts.filter((cut) => cut.sceneId === selectedCut.sceneId);
    const index = sceneCuts.findIndex((cut) => cut.cutId === selectedCut.cutId);
    const adjacent = sceneCuts[index + direction];
    if (!adjacent) return;
    await execute(
      { type: "upsert-planning-record", record: { kind: "cut-plan", value: nextCutRevision(selectedCut, { order: adjacent.order }) } },
      `${selectedCut.cutId} 순서를 변경했습니다.`,
    );
    await execute(
      { type: "upsert-planning-record", record: { kind: "cut-plan", value: nextCutRevision(adjacent, { order: selectedCut.order }) } },
      "인접 컷 순서를 동기화했습니다.",
    );
  };

  const createEpisode = async () => {
    if (!canEdit) return;
    const episodeNumber = Math.max(0, ...aggregate.episodePlans.map((plan) => plan.episodeNumber)) + 1;
    const episodeId = `episode-${episodeNumber}`;
    const value: EpisodePlan = {
      id: `episode-plan-${episodeNumber}-r1`,
      projectId: aggregate.projectId,
      seasonId: aggregate.seasonPlans[0]?.seasonId ?? null,
      episodeId,
      episodeNumber,
      revision: 1,
      status: "draft",
      title: `${episodeNumber}화 제목`,
      logline: "이 회차에서 독자가 경험할 핵심 변화를 입력하세요.",
      openingHook: "",
      coreConflict: "",
      turningPoints: [],
      cliffhanger: "",
      characterRefs: [],
      locationRefs: [],
      targetCutCount: 60,
      targetScrollHeightPx: 16000,
      dialogueDensity: "medium",
      difficulty: 3,
      riskIds: [],
      narrativeRevisionRef: null,
      approvedByAssignmentIds: [],
      createdAt: new Date().toISOString(),
    };
    await execute({ type: "upsert-planning-record", record: { kind: "episode-plan", value } }, `${episodeNumber}화 기획 초안을 만들었습니다.`);
    setSelectedEpisodeId(episodeId);
  };

  const createScene = async () => {
    if (!selectedEpisode || !canEdit) return;
    const order = Math.max(0, ...aggregate.scenePlans.filter((scene) => scene.episodeId === selectedEpisode.episodeId).map((scene) => scene.order)) + 1;
    const sceneId = `${selectedEpisode.episodeId}-scene-${String(order).padStart(2, "0")}`;
    const value: ScenePlan = {
      id: `${sceneId}-plan-r1`,
      projectId: aggregate.projectId,
      episodeId: selectedEpisode.episodeId,
      sceneId,
      order,
      revision: 1,
      status: "draft",
      purpose: "이 장면이 회차에서 수행할 목적을 입력하세요.",
      locationRef: null,
      timeLabel: "시간 미정",
      characterRefs: [],
      emotionalBeat: "시작 감정 → 변화 감정",
      continuityRefs: [],
      instructionRefs: [],
      estimatedMinutes: 4,
      approvedByAssignmentIds: [],
      createdAt: new Date().toISOString(),
    };
    await execute({ type: "upsert-planning-record", record: { kind: "scene-plan", value } }, "새 장면 기획을 만들었습니다.");
    setSelectedSceneId(sceneId);
  };

  const createCut = async (sceneOverride?: ScenePlan) => {
    const scene = sceneOverride ?? selectedScene;
    if (!selectedEpisode || !scene || !canEdit) return;
    const order = Math.max(0, ...aggregate.cutPlans.filter((cut) => cut.episodeId === selectedEpisode.episodeId).map((cut) => cut.order)) + 1;
    const cutId = `${selectedEpisode.episodeId}-cut-${String(order).padStart(3, "0")}`;
    const value: CutPlan = {
      id: `${cutId}-plan-r1`,
      projectId: aggregate.projectId,
      episodeId: selectedEpisode.episodeId,
      sceneId: scene.sceneId,
      cutId,
      order,
      revision: 1,
      status: "draft",
      framing: "새 컷 프레이밍",
      camera: "카메라와 구도를 입력하세요.",
      characterRefs: scene.characterRefs,
      dialogueRefs: [],
      assetRequirementIds: [],
      layerRequirements: ["인물", "배경"],
      estimatedHours: 1,
      complexity: 2,
      approvedByAssignmentIds: [],
      createdAt: new Date().toISOString(),
    };
    await execute({ type: "upsert-planning-record", record: { kind: "cut-plan", value } }, "새 컷 기획을 만들었습니다.");
    setSelectedCutId(cutId);
  };

  const linkedAssets = selectedCut
    ? aggregate.assetRequirements.filter((asset) => selectedCut.assetRequirementIds.includes(asset.id))
    : [];
  const relatedTasks = selectedCut
    ? aggregate.tasks.filter((task) => (
      task.scope.id === selectedCut.cutId
      || task.scope.id === selectedCut.sceneId
      || task.scope.id === selectedCut.episodeId
    ))
    : [];
  const relatedRisks = selectedEpisode
    ? aggregate.risks.filter((risk) => selectedEpisode.riskIds.includes(risk.id) || risk.scope.id === selectedEpisode.episodeId)
    : [];

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-3 py-3 sm:px-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent" aria-hidden="true" />
          <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">Visual Planning Workspace</p>
        </div>
        <h2 className="mt-1 truncate text-base font-black text-fg">
          {selectedEpisode ? `${selectedEpisode.episodeNumber}화 · ${selectedEpisode.title}` : "회차를 선택하세요"}
        </h2>
      </div>
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-card p-1" role="group" aria-label="기획 보기 방식">
        {VIEW_OPTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent",
              view === id ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
            )}
            onClick={() => setView(id)}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            <span className={compact ? "sr-only sm:not-sr-only" : undefined}>{label}</span>
          </button>
        ))}
      </div>
    </header>
  );

  return (
    <section
      className="overflow-hidden rounded-3xl border border-line bg-card shadow-sm"
      data-production-visual-planning-workspace
      data-view={view}
    >
      {header}
      <div className={cn(
        "grid min-h-[42rem]",
        showEpisodeRail
          ? "xl:grid-cols-[14rem_minmax(0,1fr)_19rem]"
          : "2xl:grid-cols-[minmax(0,1fr)_19rem]",
      )}>
        {showEpisodeRail ? (
          <aside className="border-b border-line bg-panel/70 p-3 xl:border-b-0 xl:border-r" aria-label="회차 관리자">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <input
                type="search"
                aria-label="회차 검색"
                placeholder="회차 검색"
                value={episodeQuery}
                onChange={(event) => setEpisodeQuery(event.target.value)}
                className="min-h-10 w-full rounded-xl border border-line bg-card pl-9 pr-3 text-xs text-fg outline-none focus:border-accent/50"
              />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 xl:block xl:max-h-[35rem] xl:space-y-2 xl:overflow-y-auto xl:pb-0">
              {filteredEpisodes.map((plan) => {
                const scenes = currentScenes.filter((scene) => scene.episodeId === plan.episodeId);
                const cuts = currentCuts.filter((cut) => cut.episodeId === plan.episodeId);
                const active = selectedEpisodeId === plan.episodeId;
                return (
                  <button
                    key={plan.episodeId}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedEpisodeId(plan.episodeId)}
                    className={cn(
                      "min-w-48 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent xl:min-w-0 xl:w-full",
                      active ? "border-accent bg-accent-soft" : "border-line bg-card hover:bg-raised",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-accent">EP {plan.episodeNumber}</span>
                      <span className={cn("rounded-full border px-1.5 py-0.5 text-[0.625rem] font-bold", statusTone(plan.status))}>{STATUS_LABELS[plan.status]}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-bold leading-5 text-fg">{plan.title}</p>
                    <p className="mt-2 text-[0.6875rem] text-fg-3">장면 {scenes.length} · 설계 컷 {cuts.length}/{plan.targetCutCount}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.min(100, Math.round((cuts.length / Math.max(1, plan.targetCutCount)) * 100))}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className={cn(buttonClass({ variant: "outline", size: "sm" }), "mt-3 w-full")}
              disabled={!canEdit}
              onClick={() => void createEpisode()}
            >
              <Plus className="size-4" aria-hidden="true" />
              회차 초안 추가
            </button>
          </aside>
        ) : null}

        <div className="min-w-0 border-b border-line bg-canvas/65 xl:border-b-0 xl:border-r">
          {selectedEpisode ? (
            <>
              <div className="border-b border-line bg-card/80 p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <InlineText
                      label="회차 제목"
                      value={selectedEpisode.title}
                      disabled={!canEdit}
                      className="text-lg font-black"
                      onCommit={(title) => saveEpisode({ title }, "회차 제목의 새 기획 revision을 저장했습니다.")}
                    />
                    <InlineText
                      label="회차 로그라인"
                      value={selectedEpisode.logline}
                      disabled={!canEdit}
                      multiline
                      onCommit={(logline) => saveEpisode({ logline }, "회차 로그라인을 저장했습니다.")}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <MiniPill className={statusTone(selectedEpisode.status)}>{STATUS_LABELS[selectedEpisode.status]} r{selectedEpisode.revision}</MiniPill>
                    <MiniPill>{selectedEpisode.targetCutCount}컷 목표</MiniPill>
                    <MiniPill>{selectedEpisode.targetScrollHeightPx.toLocaleString("ko-KR")}px</MiniPill>
                  </div>
                </div>
                <details className="mt-2 rounded-xl border border-line bg-panel px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold text-fg">
                    <ChevronDown className="size-3.5 text-fg-3" aria-hidden="true" />
                    회차 의도와 엔딩 직접 편집
                  </summary>
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <div className="text-[0.6875rem] font-bold text-fg-3"><p>오프닝 훅</p>
                      <InlineText label="오프닝 훅" value={selectedEpisode.openingHook} allowEmpty disabled={!canEdit} multiline onCommit={(openingHook) => saveEpisode({ openingHook }, "오프닝 훅을 저장했습니다.")} />
                    </div>
                    <div className="text-[0.6875rem] font-bold text-fg-3"><p>핵심 갈등</p>
                      <InlineText label="핵심 갈등" value={selectedEpisode.coreConflict} allowEmpty disabled={!canEdit} multiline onCommit={(coreConflict) => saveEpisode({ coreConflict }, "핵심 갈등을 저장했습니다.")} />
                    </div>
                    <div className="text-[0.6875rem] font-bold text-fg-3"><p>클리프행어</p>
                      <InlineText label="클리프행어" value={selectedEpisode.cliffhanger} allowEmpty disabled={!canEdit} multiline onCommit={(cliffhanger) => saveEpisode({ cliffhanger }, "클리프행어를 저장했습니다.")} />
                    </div>
                  </div>
                </details>
              </div>

              <div className={cn("p-3 sm:p-4", compact ? "min-h-[28rem]" : "min-h-[34rem]")}>
                {view === "board" ? (
                  episodeScenes.length > 0 ? (
                    <div className="flex items-start gap-3 overflow-x-auto pb-3" aria-label="장면과 컷 보드">
                      {episodeScenes.map((scene) => {
                        const sceneCuts = episodeCuts.filter((cut) => cut.sceneId === scene.sceneId);
                        const active = scene.sceneId === selectedSceneId;
                        return (
                          <article
                            key={scene.sceneId}
                            className={cn(
                              "w-[20rem] shrink-0 rounded-2xl border bg-card p-3 transition-colors",
                              active ? "border-accent/55" : "border-line",
                            )}
                          >
                            <header className="flex items-start gap-2">
                              <GripVertical className="mt-2 size-4 shrink-0 text-fg-3" aria-hidden="true" />
                              <button
                                type="button"
                                className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                onClick={() => setSelectedSceneId(scene.sceneId)}
                              >
                                <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-accent">Scene {scene.order}</p>
                                <p className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-fg">{scene.purpose}</p>
                              </button>
                              <MiniPill>r{scene.revision}</MiniPill>
                            </header>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              {sceneCuts.map((cut) => (
                                <CutArtwork
                                  key={cut.cutId}
                                  cut={cut}
                                  compact
                                  selected={selectedCutId === cut.cutId}
                                  onSelect={() => selectCut(cut)}
                                />
                              ))}
                            </div>
                            {sceneCuts.length === 0 ? (
                              <div className="mt-3 rounded-xl border border-dashed border-line p-4 text-center text-xs text-fg-3">이 장면에 설계된 컷이 없습니다.</div>
                            ) : null}
                            <button
                              type="button"
                              className={cn(buttonClass({ variant: "quiet", size: "sm" }), "mt-3 w-full")}
                              disabled={!canEdit}
                              onClick={() => {
                                setSelectedSceneId(scene.sceneId);
                                void createCut(scene);
                              }}
                            >
                              <Plus className="size-3.5" aria-hidden="true" />
                              컷 추가
                            </button>
                          </article>
                        );
                      })}
                      <button
                        type="button"
                        className="flex min-h-52 w-56 shrink-0 flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-card/60 p-4 text-xs font-semibold text-fg-2 outline-none hover:border-accent/40 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                        disabled={!canEdit}
                        onClick={() => void createScene()}
                      >
                        <Plus className="mb-2 size-5" aria-hidden="true" />
                        새 장면 추가
                      </button>
                    </div>
                  ) : (
                    <EmptyCanvas
                      icon={Film}
                      title="아직 장면이 없습니다"
                      description="첫 장면을 만들면 목적·감정 비트·컷 구성을 같은 화면에서 직접 편집할 수 있습니다."
                      action={(
                        <button type="button" className={buttonClass({ size: "sm" })} disabled={!canEdit} onClick={() => void createScene()}>
                          <Plus className="size-4" aria-hidden="true" />첫 장면 만들기
                        </button>
                      )}
                    />
                  )
                ) : null}

                {view === "scroll" ? (
                  episodeCuts.length > 0 ? (
                    <div className="mx-auto max-w-md rounded-[2rem] border border-line bg-card p-3 shadow-lg" aria-label="세로 스크롤 독자 미리보기">
                      <div className="mb-3 flex items-center justify-between rounded-xl bg-raised px-3 py-2 text-[0.6875rem] text-fg-2">
                        <span>모바일 독자뷰</span><span>{episodeCuts.length} 설계 컷 · {selectedEpisode.targetScrollHeightPx.toLocaleString("ko-KR")}px 목표</span>
                      </div>
                      <div className="space-y-5 bg-canvas p-2">
                        {episodeScenes.map((scene) => (
                          <section key={scene.sceneId} aria-label={`장면 ${scene.order}`}>
                            <div className="mb-2 flex items-center gap-2 text-[0.6875rem] font-bold text-fg-3"><ScanLine className="size-3.5" aria-hidden="true" />Scene {scene.order} · {scene.emotionalBeat}</div>
                            <div className="space-y-3">
                              {episodeCuts.filter((cut) => cut.sceneId === scene.sceneId).map((cut) => (
                                <CutArtwork key={cut.cutId} cut={cut} selected={selectedCutId === cut.cutId} onSelect={() => selectCut(cut)} />
                              ))}
                            </div>
                            <div className="mx-auto my-5 h-8 w-px bg-line" aria-hidden="true" />
                          </section>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <EmptyCanvas icon={ScrollText} title="독자뷰에 표시할 컷이 없습니다" description="장면을 선택하고 첫 컷을 추가해 세로 리듬을 확인하세요." />
                  )
                ) : null}

                {view === "outline" ? (
                  episodeScenes.length > 0 ? (
                    <div className="space-y-3" aria-label="회차 구조 아웃라인">
                      {episodeScenes.map((scene) => {
                        const sceneCuts = episodeCuts.filter((cut) => cut.sceneId === scene.sceneId);
                        return (
                          <section key={scene.sceneId} className="overflow-hidden rounded-2xl border border-line bg-card">
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 border-b border-line p-3 text-left outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                              onClick={() => setSelectedSceneId(scene.sceneId)}
                            >
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft font-black text-accent">{scene.order}</div>
                              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-fg">{scene.purpose}</p><p className="mt-1 text-xs text-fg-3">{scene.timeLabel} · {scene.emotionalBeat}</p></div>
                              <MiniPill>{sceneCuts.length}컷</MiniPill>
                            </button>
                            <div className="divide-y divide-line">
                              {sceneCuts.map((cut) => (
                                <button
                                  key={cut.cutId}
                                  type="button"
                                  aria-pressed={selectedCutId === cut.cutId}
                                  onClick={() => selectCut(cut)}
                                  className={cn(
                                    "grid w-full gap-2 px-4 py-3 text-left text-xs outline-none sm:grid-cols-[7rem_1fr_1fr_auto] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                                    selectedCutId === cut.cutId ? "bg-accent-soft" : "bg-panel hover:bg-raised",
                                  )}
                                >
                                  <span className="font-black text-accent">{cut.cutId}</span>
                                  <span className="font-semibold text-fg">{cut.framing}</span>
                                  <span className="text-fg-2">{cut.camera}</span>
                                  <span className="text-fg-3">{cut.estimatedHours}h · C{cut.complexity}</span>
                                </button>
                              ))}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyCanvas icon={ListTree} title="구조화할 장면이 없습니다" description="장면과 컷이 생성되면 기획 계층을 한눈에 탐색할 수 있습니다." />
                  )
                ) : null}
              </div>
            </>
          ) : (
            <div className="p-4"><EmptyCanvas icon={Film} title="회차 기획이 없습니다" description="회차 초안을 만든 뒤 장면과 컷을 시각적으로 구성하세요." /></div>
          )}
        </div>

        <aside className="bg-panel/70 p-3 sm:p-4" aria-label="선택 항목 인스펙터">
          {selectedCut ? (
            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <MiniPill className={statusTone(selectedCut.status)}>{STATUS_LABELS[selectedCut.status]} r{selectedCut.revision}</MiniPill>
                  <MiniPill>{selectedCut.cutId}</MiniPill>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-fg">컷 인스펙터</h3>
                  <div className="flex items-center gap-1" role="group" aria-label="컷 순서 이동">
                    <button
                      type="button"
                      className={buttonClass({ variant: "quiet", size: "icon" })}
                      aria-label="이전 컷으로 이동"
                      disabled={!canEdit || selectedCutIndex <= 0}
                      onClick={() => void moveCut(-1)}
                    ><ChevronLeft className="size-4" aria-hidden="true" /></button>
                    <span className="min-w-10 text-center text-[0.6875rem] text-fg-3">{selectedCutIndex + 1}/{selectedSceneCuts.length}</span>
                    <button
                      type="button"
                      className={buttonClass({ variant: "quiet", size: "icon" })}
                      aria-label="다음 컷으로 이동"
                      disabled={!canEdit || selectedCutIndex < 0 || selectedCutIndex >= selectedSceneCuts.length - 1}
                      onClick={() => void moveCut(1)}
                    ><ChevronRight className="size-4" aria-hidden="true" /></button>
                  </div>
                </div>
                {isCanonicalStatus(selectedCut.status) ? (
                  <p className="mt-1 text-[0.6875rem] leading-5 text-fg-3">잠긴 정본은 직접 덮어쓰지 않고 새 초안 revision으로 분기됩니다.</p>
                ) : null}
              </div>

              <div className="space-y-3 rounded-2xl border border-line bg-card p-3">
                <div className="block text-[0.6875rem] font-bold text-fg-3"><p>프레이밍</p>
                  <InlineText label="컷 프레이밍" value={selectedCut.framing} disabled={!canEdit} onCommit={(framing) => saveCut({ framing }, "컷 프레이밍을 저장했습니다.")} />
                </div>
                <div className="block text-[0.6875rem] font-bold text-fg-3"><p>카메라·연출</p>
                  <InlineText label="컷 카메라와 연출" value={selectedCut.camera} disabled={!canEdit} multiline onCommit={(camera) => saveCut({ camera }, "컷 카메라 연출을 저장했습니다.")} />
                </div>
                <div className="block text-[0.6875rem] font-bold text-fg-3"><p>레이어 요구사항</p>
                  <InlineText
                    label="레이어 요구사항"
                    value={selectedCut.layerRequirements.join(", ")}
                    disabled={!canEdit}
                    multiline
                    onCommit={(value) => saveCut({ layerRequirements: value.split(/[,\n]/u).map((entry) => entry.trim()).filter(Boolean) }, "컷 레이어 요구사항을 저장했습니다.")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[0.6875rem] font-bold text-fg-3">예상 공수
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      aria-label="컷 예상 공수"
                      key={`${selectedCut.id}:${selectedCut.revision}:estimate`}
                      defaultValue={selectedCut.estimatedHours}
                      disabled={!canEdit}
                      className={cn(EDITABLE_CLASS, "mt-1 text-xs")}
                      onBlur={(event) => {
                        const estimatedHours = Number(event.target.value);
                        if (Number.isFinite(estimatedHours) && estimatedHours >= 0 && estimatedHours !== selectedCut.estimatedHours) {
                          saveCut({ estimatedHours }, "컷 예상 공수를 저장했습니다.");
                        }
                      }}
                    />
                  </label>
                  <label className="text-[0.6875rem] font-bold text-fg-3">복잡도
                    <select
                      aria-label="컷 복잡도"
                      value={selectedCut.complexity}
                      disabled={!canEdit}
                      className={cn(EDITABLE_CLASS, "mt-1 min-h-9 text-xs")}
                      onChange={(event) => saveCut({ complexity: Number(event.target.value) as CutPlan["complexity"] }, "컷 복잡도를 저장했습니다.")}
                    >
                      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                </div>
              </div>

              {selectedScene ? (
                <div className="rounded-2xl border border-line bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><FilePenLine className="size-4 text-accent" aria-hidden="true" /><h4 className="text-xs font-black text-fg">장면 맥락</h4></div>
                    <div className="flex items-center gap-1" role="group" aria-label="장면 순서 이동">
                      <button type="button" className={buttonClass({ variant: "quiet", size: "icon" })} aria-label="이전 장면으로 이동" disabled={!canEdit || selectedSceneIndex <= 0} onClick={() => void moveScene(-1)}><ChevronLeft className="size-4" aria-hidden="true" /></button>
                      <span className="min-w-10 text-center text-[0.6875rem] text-fg-3">{selectedSceneIndex + 1}/{episodeScenes.length}</span>
                      <button type="button" className={buttonClass({ variant: "quiet", size: "icon" })} aria-label="다음 장면으로 이동" disabled={!canEdit || selectedSceneIndex < 0 || selectedSceneIndex >= episodeScenes.length - 1} onClick={() => void moveScene(1)}><ChevronRight className="size-4" aria-hidden="true" /></button>
                    </div>
                  </div>
                  <div className="mt-3 block text-[0.6875rem] font-bold text-fg-3"><p>장면 목적</p>
                    <InlineText label="장면 목적" value={selectedScene.purpose} disabled={!canEdit} multiline onCommit={(purpose) => saveScene({ purpose }, "장면 목적을 저장했습니다.")} />
                  </div>
                  <div className="mt-2 block text-[0.6875rem] font-bold text-fg-3"><p>감정 비트</p>
                    <InlineText label="장면 감정 비트" value={selectedScene.emotionalBeat} disabled={!canEdit} onCommit={(emotionalBeat) => saveScene({ emotionalBeat }, "장면 감정 비트를 저장했습니다.")} />
                  </div>
                  <div className="mt-2 block text-[0.6875rem] font-bold text-fg-3"><p>시간</p>
                    <InlineText label="장면 시간" value={selectedScene.timeLabel} disabled={!canEdit} allowEmpty onCommit={(timeLabel) => saveScene({ timeLabel }, "장면 시간을 저장했습니다.")} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedScene.continuityRefs.map((ref) => <MiniPill key={ref}>{ref}</MiniPill>)}
                    {selectedScene.continuityRefs.length === 0 ? <span className="text-[0.6875rem] text-fg-3">연속성 참조 없음</span> : null}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-line bg-card p-3">
                <div className="flex items-center gap-2"><Boxes className="size-4 text-accent" aria-hidden="true" /><h4 className="text-xs font-black text-fg">에셋·제작 연결</h4></div>
                <div className="mt-3 space-y-2">
                  {linkedAssets.map((asset) => (
                    <div key={asset.id} className="rounded-xl bg-panel p-2.5">
                      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-fg">{asset.title}</span><MiniPill>{asset.status}</MiniPill></div>
                      <p className="mt-1 text-[0.6875rem] leading-5 text-fg-3">{asset.specification}</p>
                    </div>
                  ))}
                  {linkedAssets.length === 0 ? <p className="text-xs text-fg-3">이 컷에 직접 연결된 에셋 요구사항이 없습니다.</p> : null}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[0.6875rem]">
                  <div className="rounded-xl bg-panel p-2"><Layers3 className="mx-auto size-4 text-fg-3" aria-hidden="true" /><p className="mt-1 font-bold text-fg">{selectedCut.layerRequirements.length}</p><p className="text-fg-3">레이어</p></div>
                  <div className="rounded-xl bg-panel p-2"><Users className="mx-auto size-4 text-fg-3" aria-hidden="true" /><p className="mt-1 font-bold text-fg">{relatedTasks.length}</p><p className="text-fg-3">연결 작업</p></div>
                </div>
              </div>

              {relatedRisks.length > 0 ? (
                <div className="rounded-2xl border border-warn/30 bg-warn/10 p-3">
                  <div className="flex items-center gap-2"><AlertTriangle className="size-4 text-warn" aria-hidden="true" /><h4 className="text-xs font-black text-fg">회차 위험</h4></div>
                  <div className="mt-2 space-y-2">{relatedRisks.map((risk) => <div key={risk.id} className="text-xs"><p className="font-semibold text-fg">{risk.title}</p><p className="mt-1 text-fg-2">P{risk.probability} × I{risk.impact} · {risk.status}</p></div>)}</div>
                </div>
              ) : null}
            </div>
          ) : selectedScene ? (
            <div className="space-y-3">
              <MiniPill className={statusTone(selectedScene.status)}>{STATUS_LABELS[selectedScene.status]} r{selectedScene.revision}</MiniPill>
              <h3 className="text-sm font-black text-fg">장면 인스펙터</h3>
              <InlineText label="장면 목적" value={selectedScene.purpose} disabled={!canEdit} multiline onCommit={(purpose) => saveScene({ purpose }, "장면 목적을 저장했습니다.")} />
              <InlineText label="장면 감정 비트" value={selectedScene.emotionalBeat} disabled={!canEdit} onCommit={(emotionalBeat) => saveScene({ emotionalBeat }, "장면 감정 비트를 저장했습니다.")} />
              <button type="button" className={buttonClass({ size: "sm" })} disabled={!canEdit} onClick={() => void createCut()}><Plus className="size-4" aria-hidden="true" />첫 컷 추가</button>
            </div>
          ) : (
            <EmptyCanvas icon={Clock3} title="선택한 항목이 없습니다" description="장면이나 컷을 선택하면 revision, 연출, 에셋과 위험 정보를 여기서 바로 편집할 수 있습니다." />
          )}
        </aside>
      </div>
    </section>
  );
}
