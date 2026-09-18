import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Save, ShieldAlert, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  productionRiskPriorityScore,
  productionRiskSeverity,
  type ProductionProjectAggregate,
  type ProductionRisk,
  type ProductionRiskCategory,
  type ScopeRef,
} from "@toonspectrum/core/production";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface ProductionRiskEditorDialogProps {
  readonly open: boolean;
  readonly aggregate: ProductionProjectAggregate;
  readonly risk: ProductionRisk | null;
  readonly defaultOwnerAssignmentId: string | null;
  readonly onClose: () => void;
  readonly onSave: (risk: ProductionRisk) => Promise<void>;
}
interface RiskDraft {
  readonly title: string;
  readonly description: string;
  readonly category: ProductionRiskCategory;
  readonly probability: 1 | 2 | 3 | 4 | 5;
  readonly impact: 1 | 2 | 3 | 4 | 5;
  readonly ownerAssignmentId: string;
  readonly episodeId: string;
  readonly causeCodes: string;
  readonly earlySignals: string;
  readonly mitigation: string;
  readonly contingency: string;
  readonly trigger: string;
  readonly affectedTaskIds: readonly string[];
  readonly responseDueAt: string;
  readonly nextReviewAt: string;
}

const CATEGORY_LABELS: Readonly<Record<ProductionRiskCategory, string>> = Object.freeze({
  story: "스토리", visual: "시각·작화", schedule: "일정", capacity: "인력·작업량",
  review: "검수", asset: "에셋", budget: "예산", rights: "권리·라이선스",
  contract: "계약·외주", platform: "게시·플랫폼", health: "휴식·연속성",
  security: "보안", communication: "소통·차단", technical: "기술",
});

function toLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function splitValues(value: string): readonly string[] {
  return Object.freeze([...new Set(value
    .split(/[\n,]/u)
    .map((entry) => entry.trim())
    .filter(Boolean))]);
}

function episodeIdFromScope(scope: ScopeRef): string | null {
  if (scope.kind === "episode") return scope.id;
  return scope.ancestors.find((entry) => entry.kind === "episode")?.id ?? null;
}

function initialDraft(
  risk: ProductionRisk | null,
  defaultOwnerAssignmentId: string | null,
): RiskDraft {
  return {
    title: risk?.title ?? "",
    description: risk?.description ?? "",
    category: risk?.category ?? "schedule",
    probability: risk?.probability ?? 3,
    impact: risk?.impact ?? 3,
    ownerAssignmentId: risk?.ownerAssignmentId ?? defaultOwnerAssignmentId ?? "",
    episodeId: risk ? episodeIdFromScope(risk.scope) ?? "" : "",
    causeCodes: risk?.causeCodes.join(", ") ?? "manual",
    earlySignals: risk?.earlySignals.join("\n") ?? "",
    mitigation: risk?.mitigation ?? "담당자와 대응 방법을 확인합니다.",
    contingency: risk?.contingency ?? "필요하면 일정·범위·인력 조정을 검토합니다.",
    trigger: risk?.trigger ?? "",
    affectedTaskIds: risk?.affectedTaskIds ?? [],
    responseDueAt: toLocalDateTime(risk?.responseDueAt ?? null),
    nextReviewAt: toLocalDateTime(risk?.nextReviewAt ?? null),
  };
}

function FieldLabel({ children }: { readonly children: string }) {
  return <span className="text-xs font-bold text-fg">{children}</span>;
}

function assignmentLabel(
  aggregate: ProductionProjectAggregate,
  assignmentId: string,
): string {
  const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
  const party = assignment
    ? aggregate.parties.find((entry) => entry.id === assignment.partyId)
    : null;
  return `${party?.publicDisplayName ?? "알 수 없는 담당자"} · ${assignment?.roleType ?? "역할 미정"}`;
}
export function ProductionRiskEditorDialog({
  open,
  aggregate,
  risk,
  defaultOwnerAssignmentId,
  onClose,
  onSave,
}: ProductionRiskEditorDialogProps) {
  const [draft, setDraft] = useState<RiskDraft>(() => initialDraft(risk, defaultOwnerAssignmentId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const manualFieldsEditable = !risk || risk.source === "manual";

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    if (!open) return;
    setDraft(initialDraft(risk, defaultOwnerAssignmentId));
    setError(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => titleRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [defaultOwnerAssignmentId, onClose, open, risk]);
  const activeAssignments = useMemo(
    () => aggregate.assignments.filter((assignment) => assignment.status === "active"),
    [aggregate.assignments],
  );
  const exposureScore = draft.probability * draft.impact;
  const priorityScore = productionRiskPriorityScore(draft.probability, draft.impact);
  const severity = productionRiskSeverity(priorityScore);

  if (!open) return null;

  const setDraftValue = <K extends keyof RiskDraft>(key: K, value: RiskDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const title = draft.title.trim();
    const description = draft.description.trim();
    const mitigation = draft.mitigation.trim();
    if (!title || !description || !mitigation) {
      setError("제목, 설명, 대응 계획을 모두 입력해 주세요.");
      return;
    }
    const now = new Date().toISOString();
    const responseDueAt = toIsoDateTime(draft.responseDueAt);
    const nextReviewAt = toIsoDateTime(draft.nextReviewAt);
    const selectedTasks = aggregate.tasks.filter((task) => draft.affectedTaskIds.includes(task.id));
    const affectedEpisodeIds = [...new Set([
      draft.episodeId || null,
      ...selectedTasks.map((task) => episodeIdFromScope(task.scope)),
    ].filter((value): value is string => Boolean(value)))];
    const manualScope: ScopeRef = draft.episodeId
      ? { kind: "episode", id: draft.episodeId, ancestors: [{ kind: "project", id: aggregate.projectId }] }
      : { kind: "project", id: aggregate.projectId, ancestors: [] };
    const causeCodes = splitValues(draft.causeCodes);
    const earlySignals = splitValues(draft.earlySignals);
    const nextRisk: ProductionRisk = risk
      ? {
          ...risk,
          revision: risk.revision + 1,
          scope: manualFieldsEditable ? manualScope : risk.scope,
          category: manualFieldsEditable ? draft.category : risk.category,
          title: manualFieldsEditable ? title : risk.title,
          description: manualFieldsEditable ? description : risk.description,
          probability: manualFieldsEditable ? draft.probability : risk.probability,
          impact: manualFieldsEditable ? draft.impact : risk.impact,
          exposureScore: manualFieldsEditable ? exposureScore : risk.exposureScore,
          severity: manualFieldsEditable ? severity : risk.severity,
          priorityScore: manualFieldsEditable ? priorityScore : risk.priorityScore,
          ownerAssignmentId: draft.ownerAssignmentId || null,
          causeCodes: manualFieldsEditable ? causeCodes.length > 0 ? causeCodes : ["manual"] : risk.causeCodes,
          earlySignals: manualFieldsEditable ? earlySignals : risk.earlySignals,
          mitigation,
          contingency: draft.contingency.trim(),
          trigger: manualFieldsEditable ? draft.trigger.trim() || "직접 등록" : risk.trigger,
          affectedTaskIds: manualFieldsEditable ? Object.freeze([...draft.affectedTaskIds]) : risk.affectedTaskIds,
          affectedEpisodeIds: manualFieldsEditable ? Object.freeze(affectedEpisodeIds) : risk.affectedEpisodeIds,
          dueAt: responseDueAt,
          responseDueAt,
          nextReviewAt,
          updatedAt: now,
        }
      : {
          id: `risk:manual:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
          projectId: aggregate.projectId,
          revision: 1,
          scope: manualScope,
          category: draft.category,
          source: "manual",
          signalIds: Object.freeze([]),
          title,
          description,
          probability: draft.probability,
          impact: draft.impact,
          exposureScore,
          severity,
          priorityScore,
          ownerAssignmentId: draft.ownerAssignmentId || null,
          causeCodes: causeCodes.length > 0 ? causeCodes : Object.freeze(["manual"]),
          earlySignals,
          mitigation,
          contingency: draft.contingency.trim(),
          trigger: draft.trigger.trim() || "직접 등록",
          affectedTaskIds: Object.freeze([...draft.affectedTaskIds]),
          affectedEpisodeIds: Object.freeze(affectedEpisodeIds),
          affectedMilestoneIds: Object.freeze([]),
          baselineDueAt: null,
          forecastDueAt: null,
          varianceHours: null,
          status: "open",
          dueAt: responseDueAt,
          responseDueAt,
          nextReviewAt,
          acceptedReason: null,
          dismissedReason: null,
          resolutionSummary: null,
          detectedAt: now,
          lastEvaluatedAt: now,
          occurredAt: null,
          resolvedAt: null,
          closedAt: null,
          createdAt: now,
          updatedAt: now,
        };

    setSaving(true);
    setError(null);
    try {
      await onSave(nextRisk);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "위험 항목을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "위험 편집 창 닫기")}
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        disabled={saving}
        onClick={onClose}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="production-risk-editor-title"
        onSubmit={(event) => void submit(event)}
        className="relative z-10 max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-card shadow-2xl sm:max-w-4xl sm:rounded-3xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-card/95 px-5 py-4 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-accent" aria-hidden="true" />
              <h2 id="production-risk-editor-title" className="text-lg font-black text-fg">
                {risk ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "위험 항목 편집") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "위험 직접 등록")}
              </h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-fg-2">
              {manualFieldsEditable
                ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "가능성과 영향도를 평가하고 담당자·대응 기한·완화 계획을 기록합니다.")
                : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "자동 계산 필드는 감지 엔진이 관리합니다. 담당자와 대응 계획만 수정할 수 있습니다.")}
            </p>
          </div>
          <button
            type="button"
            aria-label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "닫기")}
            className={buttonClass({ variant: "ghost", size: "sm" })}
            disabled={saving}
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block lg:col-span-2">
              <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "위험 제목")}</FieldLabel>
              <input
                ref={titleRef}
                value={draft.title}
                onChange={(event) => setDraftValue("title", event.target.value)}
                disabled={!manualFieldsEditable || saving}
                maxLength={240}
                required
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm font-bold text-fg outline-none focus:border-accent disabled:opacity-65"
                placeholder={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "예: 14화 채색 일정 초과 가능성")}
              />
            </label>
            <label className="block lg:col-span-2">
              <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "원인과 예상 영향")}</FieldLabel>
              <textarea
                value={draft.description}
                onChange={(event) => setDraftValue("description", event.target.value)}
                disabled={!manualFieldsEditable || saving}
                rows={3}
                required
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm leading-6 text-fg outline-none focus:border-accent disabled:opacity-65"
                placeholder={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "어떤 조건에서 발생하며 회차·게시·후행 작업에 어떤 영향을 주는지 기록하세요.")}
              />
            </label>
            <label className="block">
              <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "유형")}</FieldLabel>
              <select
                value={draft.category}
                onChange={(event) => setDraftValue("category", event.target.value as ProductionRiskCategory)}
                disabled={!manualFieldsEditable || saving}
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg disabled:opacity-65"
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "담당자")}</FieldLabel>
              <select
                value={draft.ownerAssignmentId}
                onChange={(event) => setDraftValue("ownerAssignmentId", event.target.value)}
                disabled={saving}
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg disabled:opacity-65"
              >
                <option value="">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "담당자 미정")}</option>
                {activeAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignmentLabel(aggregate, assignment.id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "대상 회차")}</FieldLabel>
              <select
                value={draft.episodeId}
                onChange={(event) => setDraftValue("episodeId", event.target.value)}
                disabled={!manualFieldsEditable || saving}
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg disabled:opacity-65"
              >
                <option value="">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "프로젝트 전체")}</option>
                {aggregate.episodes.map((episode) => (
                  <option key={episode.episodeId} value={episode.episodeId}>{episode.episodeId}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "발생 가능성")}</FieldLabel>
                <select
                  value={draft.probability}
                  onChange={(event) => setDraftValue("probability", Number(event.target.value) as RiskDraft["probability"])}
                  disabled={!manualFieldsEditable || saving}
                  className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg disabled:opacity-65"
                >
                  {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="block">
                <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "영향도")}</FieldLabel>
                <select
                  value={draft.impact}
                  onChange={(event) => setDraftValue("impact", Number(event.target.value) as RiskDraft["impact"])}
                  disabled={!manualFieldsEditable || saving}
                  className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg disabled:opacity-65"
                >
                  {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-4 sm:grid-cols-3">
            <div><p className="text-[0.6875rem] font-bold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "노출도")}</p><p className="mt-1 text-lg font-black text-fg">{exposureScore}</p></div>
            <div><p className="text-[0.6875rem] font-bold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "운영 우선순위")}</p><p className="mt-1 text-lg font-black text-fg">{priorityScore}</p></div>
            <div><p className="text-[0.6875rem] font-bold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "위험도")}</p><p className="mt-1 text-lg font-black text-fg">{severity}</p></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block lg:col-span-2">
              <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "영향받는 작업")}</FieldLabel>
              <select
                multiple
                size={Math.min(7, Math.max(3, aggregate.tasks.length))}
                value={[...draft.affectedTaskIds]}
                onChange={(event) => setDraftValue(
                  "affectedTaskIds",
                  Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                )}
                disabled={!manualFieldsEditable || saving}
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg disabled:opacity-65"
              >
                {aggregate.tasks.map((task) => (
                  <option key={task.id} value={task.id}>{task.title} · {task.status}</option>
                ))}
              </select>
              <span className="mt-1 block text-[0.6875rem] text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "여러 작업은 Command 또는 Ctrl 키를 누른 채 선택합니다.")}</span>
            </label>
            <label className="block">
              <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "대응 기한")}</FieldLabel>
              <input
                type="datetime-local"
                value={draft.responseDueAt}
                onChange={(event) => setDraftValue("responseDueAt", event.target.value)}
                disabled={saving}
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg disabled:opacity-65"
              />
            </label>
            <label className="block">
              <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "다음 검토")}</FieldLabel>
              <input
                type="datetime-local"
                value={draft.nextReviewAt}
                onChange={(event) => setDraftValue("nextReviewAt", event.target.value)}
                disabled={saving}
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg disabled:opacity-65"
              />
            </label>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block">
              <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "발생 조건·트리거")}</FieldLabel>
              <input
                value={draft.trigger}
                onChange={(event) => setDraftValue("trigger", event.target.value)}
                disabled={!manualFieldsEditable || saving}
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg disabled:opacity-65"
                placeholder={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "예: 채색 진척률이 금요일 18시까지 70% 미만")}
              />
            </label>
            <label className="block">
              <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "원인 코드")}</FieldLabel>
              <input
                value={draft.causeCodes}
                onChange={(event) => setDraftValue("causeCodes", event.target.value)}
                disabled={!manualFieldsEditable || saving}
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg disabled:opacity-65"
                placeholder={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "en", "manual, vendor-delay")}
              />
            </label>
            <label className="block lg:col-span-2">
              <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "조기 징후")}</FieldLabel>
              <textarea
                value={draft.earlySignals}
                onChange={(event) => setDraftValue("earlySignals", event.target.value)}
                disabled={!manualFieldsEditable || saving}
                rows={3}
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm leading-6 text-fg disabled:opacity-65"
                placeholder={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "한 줄에 하나씩 입력하세요.")}
              />
            </label>
            <label className="block lg:col-span-2">
              <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "대응 계획")}</FieldLabel>
              <textarea
                value={draft.mitigation}
                onChange={(event) => setDraftValue("mitigation", event.target.value)}
                disabled={saving}
                rows={3}
                required
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm leading-6 text-fg disabled:opacity-65"
                placeholder={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "발생 가능성 또는 영향을 줄이기 위해 지금 할 일을 기록하세요.")}
              />
            </label>
            <label className="block lg:col-span-2">
              <FieldLabel>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "비상 계획")}</FieldLabel>
              <textarea
                value={draft.contingency}
                onChange={(event) => setDraftValue("contingency", event.target.value)}
                disabled={saving}
                rows={3}
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm leading-6 text-fg disabled:opacity-65"
                placeholder={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "위험이 실제 발생했을 때 적용할 대안을 기록하세요.")}
              />
            </label>
          </div>

          {error ? (
            <div role="alert" className="rounded-xl border border-bad/35 bg-bad/10 px-3 py-2 text-xs font-semibold text-bad">
              {error}
            </div>
          ) : null}
        </div>

        <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-card/95 px-5 py-4 backdrop-blur">
          <button
            type="button"
            className={buttonClass({ variant: "outline", size: "sm" })}
            disabled={saving}
            onClick={onClose}
          >
            {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "취소")}</button>
          <button
            type="submit"
            className={cn(buttonClass({ size: "sm" }), "min-w-28")}
            disabled={saving}
          >
            <Save className="size-4" aria-hidden="true" />
            {saving ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "저장 중…") : risk ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "변경 저장") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskEditorDialog", "ko", "위험 등록")}
          </button>
        </footer>
      </form>
    </div>
  );
}
