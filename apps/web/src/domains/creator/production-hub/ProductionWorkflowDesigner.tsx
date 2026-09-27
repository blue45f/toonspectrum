import { PRODUCTION_WORKFLOW_SCALES, createProductionWorkflowProfile, validateProductionWorkflowProfile } from "@toonstudio/contracts/production-workflow";
import { productionText, useProductionCopy } from "./production-workboard-copy";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  GripVertical,
  Plus,
  Save,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useRef, useState } from "react";
import { PRODUCTION_ROLE_LABELS, PRODUCTION_ROLE_TYPES, type ProductionProjectAggregate, type ProductionProcessStep, type ProductionWorkflowProfile } from "@toonstudio/core/production";
import { ProductionWorkspaceDialog } from "./ProductionWorkspaceDialog";
import { moveProductionItem } from "./production-workboard-model";
import type { ProductionClientCommand } from "./production-api";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface Props {
  readonly aggregate: ProductionProjectAggregate;
  readonly canManage: boolean;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly onClose: () => void;
}
function draftSession(aggregate: ProductionProjectAggregate) {
  const expectedRevision = aggregate.workflowProfile?.revision ?? 0;
  const profile = {
    ...(aggregate.workflowProfile ??
      createProductionWorkflowProfile(aggregate.projectId, "team", new Date().toISOString())),
    revision: expectedRevision + 1,
  };
  return { profile, expectedRevision, baseline: JSON.stringify(profile) };
}
const FIELD =
  "min-h-11 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
export function ProductionWorkflowDesigner({ aggregate, canManage, execute, onClose }: Props) {
  useProductionCopy();
  const [session, setSession] = useState(() => draftSession(aggregate));
  const [selected, setSelected] = useState(session.profile.steps[0]?.key ?? "");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const saving = useRef(false);
  const composing = useRef(false);
  const profile = session.profile;
  const active = profile.steps.find((step) => step.key === selected) ?? profile.steps[0];
  const normalized = {
    ...profile,
    steps: profile.steps.map((step) => ({
      ...step,
      completionCriteria: step.completionCriteria.map((value) => value.trim()).filter(Boolean),
    })),
  };
  const issues = validateProductionWorkflowProfile(aggregate, normalized);
  const dirty = JSON.stringify(profile) !== session.baseline;
  const stale = session.expectedRevision !== (aggregate.workflowProfile?.revision ?? 0);
  const update = (next: ProductionWorkflowProfile) => {
    setSession((current) => ({ ...current, profile: next }));
    setError(null);
  };
  const patch = (changes: Partial<ProductionProcessStep>) => {
    if (active)
      update({
        ...profile,
        steps: profile.steps.map((step) => (step.key === active.key ? { ...step, ...changes } : step)),
      });
  };
  const move = (from: number, to: number) => {
    if (!canManage || busy) return;
    update({ ...profile, steps: moveProductionItem(profile.steps, from, to) });
    setAnnouncement(
      `${profile.steps[from]?.name ?? "공정"}을 ${to + 1}번째로 이동했습니다. 선행 연결은 유지됩니다.`,
    );
  };
  const save = async () => {
    if (saving.current || !canManage || issues.length) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    let saved = false;
    try {
      await execute(
        {
          type: "configure-workflow",
          profile: { ...normalized, updatedAt: new Date().toISOString() },
          expectedWorkflowRevision: session.expectedRevision,
        },
        "팀 공정 설정을 저장했습니다. 기존 작업은 유지됩니다.",
      );
      saved = true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "공정 설정을 저장하지 못했습니다.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
    if (saved) onClose();
  };
  return (
    <ProductionWorkspaceDialog
      title={productionText("우리 팀의 제작 프로세스")}
      description={productionText(
        "공정을 직접 배치하고 선행 관계·역할·동시 작업 수를 설정하세요. 공정 설정은 공식 검수나 승인 권한을 바꾸지 않습니다.",
      )}
      onClose={onClose}
      dirty={dirty}
      busy={busy}
      wide
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!composing.current) void save();
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {(["solo", "team", "studio"] as const).map((scale) => {
            const Icon = scale === "solo" ? UserRound : scale === "team" ? Users : Building2;
            return (
              <button
                type="button"
                key={scale}
                aria-pressed={profile.scale === scale}
                disabled={!canManage || busy}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-colors motion-reduce:transition-none",
                  profile.scale === scale
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-canvas hover:border-accent/50",
                )}
                onClick={() => {
                  const preset = createProductionWorkflowProfile(
                    aggregate.projectId,
                    scale,
                    new Date().toISOString(),
                  );
                  update({ ...preset, id: profile.id, revision: session.expectedRevision + 1 });
                  setSelected(preset.steps[0]?.key ?? "");
                }}
              >
                <Icon className="mb-3 text-accent" size={24} />
                <strong className="block text-sm">{PRODUCTION_WORKFLOW_SCALES[scale]}</strong>
                <span className="mt-1 block text-xs text-fg-2">
                  {scale === "solo"
                    ? "4단계 · 한 번에 한 작업"
                    : scale === "team"
                    ? "6단계 · 역할 분담과 검수"
                    : "8단계 · 병렬 공정과 납품"}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-fg-3">
          {productionText(
            "프리셋은 저장 전까지 미리 보기입니다. 배치 순서와 선행 관계는 별개이며, 기존 작업의 상태·담당자·승인은 그대로 유지됩니다.",
          )}
        </p>
        <label className="mt-5 block text-sm font-semibold">
          {productionText("프로세스 이름")}
          <input
            className={cn(FIELD, "mt-2")}
            value={profile.name}
            maxLength={120}
            readOnly={!canManage}
            disabled={busy}
            onChange={(event) => update({ ...profile, name: event.target.value })}
            required
          />
        </label>
        {stale ? (
          <div role="alert" className="mt-4 rounded-xl bg-warn/10 p-3 text-sm">
            <p>
              {productionText("다른 관리자가 공정을 변경했습니다. 지금 편집한 내용은 보존되어 있습니다.")}
            </p>
            <button
              type="button"
              className={cn(buttonClass({ variant: "outline" }), "mt-2 min-h-11")}
              onClick={() => {
                const next = draftSession(aggregate);
                setSession(next);
                setSelected(next.profile.steps[0]?.key ?? "");
                setError(null);
              }}
            >
              {productionText("편집을 버리고 최신 설정 불러오기")}
            </button>
          </div>
        ) : null}
        <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section
            aria-label={productionText("공정 배치")}
            className="min-w-0 rounded-2xl border border-line bg-canvas p-3"
          >
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <h3 className="text-sm font-bold">
                {productionText("공정 흐름")}
                <span className="text-fg-3">{profile.steps.length}/32</span>
              </h3>
              <span className="text-xs text-fg-3">{productionText("끌어서 배치 · 화살표로 이동")}</span>
            </div>
            <ol className="space-y-2">
              {profile.steps.map((step, index) => (
                <li
                  key={step.key}
                  onDragOver={(event) => {
                    if (dragKey && canManage && !busy) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragKey)
                      move(
                        profile.steps.findIndex((s) => s.key === dragKey),
                        index,
                      );
                    setDragKey(null);
                  }}
                  className={cn(
                    "rounded-xl border p-2",
                    active?.key === step.key ? "border-accent bg-accent-soft" : "border-line bg-card",
                  )}
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      draggable={canManage && !busy}
                      disabled={!canManage || busy}
                      aria-label={`${step.name} 드래그 핸들`}
                      onDragStart={(event) => {
                        setDragKey(step.key);
                        event.dataTransfer.setData("application/x-toonstudio-production-step", step.key);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDragKey(null)}
                      className="flex min-h-11 min-w-11 cursor-grab items-center justify-center rounded-lg text-fg-3 focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <GripVertical size={18} />
                    </button>
                    <button
                      type="button"
                      aria-pressed={active?.key === step.key}
                      onClick={() => setSelected(step.key)}
                      className="min-h-11 min-w-0 flex-1 rounded-lg px-1 text-left focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <span className="mr-2 text-xs tabular-nums text-accent">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="break-words text-sm font-semibold">
                        {step.name || "이름 없는 공정"}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={!canManage || busy || index === 0}
                      aria-label={`${step.name} 위로 이동`}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-raised disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent"
                      onClick={() => move(index, index - 1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={!canManage || busy || index === profile.steps.length - 1}
                      aria-label={`${step.name} 아래로 이동`}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-raised disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent"
                      onClick={() => move(index, index + 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>
                  <p className="px-3 pb-1 text-xs leading-5 text-fg-2">
                    {step.dependsOn.length
                      ? `선행: ${step.dependsOn
                          .map((key) => profile.steps.find((s) => s.key === key)?.name ?? key)
                          .join(" · ")}`
                      : "독립 시작"}{" "}
                    {productionText("· 동시")}
                    {step.wipLimit ?? "제한 없음"}
                    {step.reviewRequired ? " · 검수자 필수" : ""}
                  </p>
                </li>
              ))}
            </ol>
            <button
              type="button"
              disabled={!canManage || busy || profile.steps.length >= 32}
              className={cn(buttonClass({ variant: "outline" }), "mt-3 min-h-11 w-full gap-2 border-dashed")}
              onClick={() => {
                const key = `custom-${crypto.randomUUID()}`;
                update({
                  ...profile,
                  steps: [
                    ...profile.steps,
                    {
                      key,
                      name: "새 공정",
                      description: "",
                      defaultRole: "assistant",
                      dependsOn: [],
                      wipLimit: null,
                      reviewRequired: true,
                      estimateHours: 4,
                      completionCriteria: [],
                    },
                  ],
                });
                setSelected(key);
              }}
            >
              <Plus size={16} />
              {productionText("공정 추가")}
            </button>
          </section>
          {active ? (
            <fieldset
              disabled={!canManage || busy}
              className="min-w-0 space-y-4 rounded-2xl border border-line bg-card p-4"
            >
              <legend className="px-2 text-sm font-bold">{productionText("선택한 공정 상세")}</legend>
              <label className="block text-xs font-semibold text-fg-2">
                {productionText("공정 이름")}
                <input
                  className={cn(FIELD, "mt-2")}
                  value={active.name}
                  maxLength={120}
                  required
                  onChange={(event) => patch({ name: event.target.value })}
                />
              </label>
              <label className="block text-xs font-semibold text-fg-2">
                {productionText("작업 안내")}
                <textarea
                  className={cn(FIELD, "mt-2 min-h-24 resize-y")}
                  value={active.description}
                  maxLength={4000}
                  onChange={(event) => patch({ description: event.target.value })}
                  placeholder={productionText("이 공정에서 무엇을 만들고 어떤 점을 확인하나요?")}
                />
              </label>
              <label className="block text-xs font-semibold text-fg-2">
                {productionText("기본 담당 역할")}
                <select
                  className={cn(FIELD, "mt-2")}
                  value={active.defaultRole}
                  onChange={(event) => {
                    const role = PRODUCTION_ROLE_TYPES.find((value) => value === event.target.value);
                    if (role) patch({ defaultRole: role });
                  }}
                >
                  {PRODUCTION_ROLE_TYPES.map((role) => (
                    <option key={role} value={role}>
                      {PRODUCTION_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-fg-2">
                  {productionText("동시 진행 작업 수")}
                  <input
                    className={cn(FIELD, "mt-2")}
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    placeholder={productionText("제한 없음")}
                    value={active.wipLimit ?? ""}
                    onChange={(event) =>
                      patch({ wipLimit: event.target.value === "" ? null : Number(event.target.value) })
                    }
                  />
                </label>
                <label className="block text-xs font-semibold text-fg-2">
                  {productionText("예상 공수 (시간)")}
                  <input
                    className={cn(FIELD, "mt-2")}
                    type="number"
                    min={0}
                    max={10000}
                    step={0.5}
                    value={active.estimateHours}
                    onChange={(event) => patch({ estimateHours: Number(event.target.value) })}
                  />
                </label>
              </div>
              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 text-sm">
                <input
                  type="checkbox"
                  checked={active.reviewRequired}
                  onChange={(event) => patch({ reviewRequired: event.target.checked })}
                  className="size-4 accent-[var(--color-accent)]"
                />
                {productionText("검수 단계로 이동할 때 검수자 필수")}
              </label>
              <div>
                <h4 className="text-xs font-semibold text-fg-2">{productionText("선행 공정")}</h4>
                <p className="mt-1 text-xs leading-5 text-fg-3">
                  {productionText(
                    "여러 공정을 선택하면 모두 완료된 뒤 시작합니다. 선택하지 않으면 독립적으로 시작합니다.",
                  )}
                </p>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {profile.steps
                    .filter((step) => step.key !== active.key)
                    .map((step) => (
                      <label
                        key={step.key}
                        className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-raised"
                      >
                        <input
                          type="checkbox"
                          checked={active.dependsOn.includes(step.key)}
                          onChange={(event) =>
                            patch({
                              dependsOn: event.target.checked
                                ? [...active.dependsOn, step.key]
                                : active.dependsOn.filter((key) => key !== step.key),
                            })
                          }
                          className="size-4"
                        />
                        <span className="break-words">{step.name || "이름 없는 공정"}</span>
                      </label>
                    ))}
                </div>
              </div>
              <label className="block text-xs font-semibold text-fg-2">
                {productionText("완료 기준 · 한 줄에 하나")}
                <textarea
                  className={cn(FIELD, "mt-2 min-h-28 resize-y")}
                  value={active.completionCriteria.join("\n")}
                  onChange={(event) => patch({ completionCriteria: event.target.value.split("\n") })}
                  placeholder={productionText(
                    "파일 규격 확인\\n검수 의견 반영\\n다음 담당자에게 전달할 내용 정리",
                  )}
                />
              </label>
              <button
                type="button"
                disabled={profile.steps.length <= 1}
                className={cn(buttonClass({ variant: "outline" }), "min-h-11 gap-2 text-bad")}
                onClick={() => {
                  const steps = profile.steps
                    .filter((step) => step.key !== active.key)
                    .map((step) => ({
                      ...step,
                      dependsOn: step.dependsOn.filter((key) => key !== active.key),
                    }));
                  update({ ...profile, steps });
                  setSelected(steps[0]?.key ?? "");
                }}
              >
                <Trash2 size={16} />
                {productionText("선택한 공정 삭제")}
              </button>
            </fieldset>
          ) : null}
        </div>
        {!canManage ? (
          <p className="mt-5 rounded-xl bg-raised p-3 text-sm text-fg-2">
            {productionText("공정은 열람할 수 있습니다. 변경·저장은 프로젝트 관리 권한이 필요합니다.")}
          </p>
        ) : null}
        {issues.length > 0 ? (
          <div role="alert" className="mt-5 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
            <p className="font-semibold">{productionText("저장 전에 확인해주세요")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-bad/10 p-3 text-sm text-fg">
            {error}
          </p>
        ) : null}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <p className="text-xs leading-5 text-fg-3">
            {dirty
              ? "저장하지 않은 변경 있음"
              : aggregate.workflowProfile
              ? `저장된 설정 v${session.expectedRevision}`
              : "아직 프로젝트에 저장되지 않은 기본 템플릿"}
          </p>
          {canManage ? (
            <button
              type="submit"
              disabled={busy || stale || issues.length > 0 || (!dirty && Boolean(aggregate.workflowProfile))}
              className={cn(buttonClass({ variant: "solid" }), "min-h-11 gap-2")}
            >
              <Save size={16} />
              {busy ? "공정 저장 중…" : "프로세스 저장"}
            </button>
          ) : null}
        </div>
      </form>
    </ProductionWorkspaceDialog>
  );
}
