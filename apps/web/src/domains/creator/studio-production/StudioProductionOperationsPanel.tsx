import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  STUDIO_PRODUCTION_AUTHORITY_FIELDS,
  STUDIO_PRODUCTION_HANDOFF_STATUSES,
  STUDIO_PRODUCTION_HIERARCHY_KINDS,
  STUDIO_PRODUCTION_ROLES,
  type ProductionAuthorityField,
  type ProductionHandoffBrief,
  type ProductionHandoffStatus,
  type ProductionHierarchyKind,
  type ProductionHierarchyNode,
  type ProductionRole,
  type ProductionWorkspace,
} from "./studio-production-workspace-runtime";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface StudioProductionOperationsPanelProps {
  readonly workspace: ProductionWorkspace;
  readonly canEdit: boolean;
  readonly canManageRoles: boolean;
  readonly onCommit: (
    update: (current: ProductionWorkspace) => ProductionWorkspace,
    message: string,
  ) => void;
}

let fallbackId = 0;
function createId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 12);
  if (random) return `${prefix}-${random}`;
  fallbackId += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
}
const ROLE_LABELS: Readonly<Record<ProductionRole, string>> = {
  story: "스토리",
  storyboard: "콘티",
  lineart: "선화",
  color: "채색",
  background: "배경",
  lettering: "레터링",
  reviewer: "검수",
  director: "디렉터",
  publisher: "게시",
};
const HIERARCHY_LABELS: Readonly<Record<ProductionHierarchyKind, string>> = {
  episode: "에피소드",
  sequence: "시퀀스",
  scene: "장면",
  page: "페이지",
};
const AUTHORITY_LABELS: Readonly<Record<ProductionAuthorityField, string>> = {
  dialogue: "대사",
  "balloon-layout": "말풍선 배치",
  "panel-layout": "컷 구성",
  "character-continuity": "캐릭터 연속성",
  background: "배경",
  publishing: "게시 정보",
};
const HANDOFF_LABELS: Readonly<Record<ProductionHandoffStatus, string>> = {
  draft: "작성 중",
  ready: "인계 준비",
  accepted: "인수 완료",
  "changes-requested": "수정 요청",
};

function parentKinds(kind: ProductionHierarchyKind): readonly ProductionHierarchyKind[] {
  switch (kind) {
    case "episode": return [];
    case "sequence": return ["episode"];
    case "scene": return ["sequence"];
    case "page": return ["scene"];
  }
}
function splitHandoffLines(value: string): readonly string[] {
  return [...new Set(value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean))]
    .slice(0, 128);
}

export function StudioProductionOperationsPanel({
  workspace,
  canEdit,
  canManageRoles,
  onCommit,
}: StudioProductionOperationsPanelProps) {
  const [hierarchyKind, setHierarchyKind] = useState<ProductionHierarchyKind>("episode");
  const [hierarchyTitle, setHierarchyTitle] = useState("");
  const [parentId, setParentId] = useState("");
  const [pageId, setPageId] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState<ProductionRole>("story");
  const [memberScope, setMemberScope] = useState("");
  const [handoffNodeId, setHandoffNodeId] = useState("");
  const [handoffFrom, setHandoffFrom] = useState<ProductionRole>("story");
  const [handoffTo, setHandoffTo] = useState<ProductionRole>("storyboard");
  const [handoffPurpose, setHandoffPurpose] = useState("");
  const [handoffEmotion, setHandoffEmotion] = useState("");
  const [handoffMustShow, setHandoffMustShow] = useState("");
  const [handoffContinuity, setHandoffContinuity] = useState("");
  const [handoffAcceptance, setHandoffAcceptance] = useState("");
  const [handoffCreator, setHandoffCreator] = useState("");
  const [handoffAssignee, setHandoffAssignee] = useState("");
  const [lockedFields, setLockedFields] = useState<readonly ProductionAuthorityField[]>([
    "dialogue",
    "character-continuity",
  ]);

  const allowedParents = useMemo(() => {
    const kinds = new Set(parentKinds(hierarchyKind));
    return workspace.hierarchy.filter((node) => kinds.has(node.kind));
  }, [hierarchyKind, workspace.hierarchy]);

  const hierarchyByParent = useMemo(() => {
    const map = new Map<string | null, ProductionHierarchyNode[]>();
    for (const node of workspace.hierarchy) {
      const entries = map.get(node.parentId) ?? [];
      map.set(node.parentId, [...entries, node].sort((a, b) => a.order - b.order));
    }
    return map;
  }, [workspace.hierarchy]);
  const addHierarchy = () => {
    const title = hierarchyTitle.trim();
    const stablePageId = pageId.trim();
    const requiredParents = parentKinds(hierarchyKind);
    if (!title || (requiredParents.length > 0 && !parentId)) return;
    if (hierarchyKind === "page" && !stablePageId) return;
    onCommit((current) => {
      const siblings = current.hierarchy.filter((node) => node.parentId === (parentId || null));
      return {
        ...current,
        hierarchy: [
          ...current.hierarchy,
          {
            id: createId(hierarchyKind),
            kind: hierarchyKind,
            parentId: parentId || null,
            title,
            order: siblings.length,
            pageId: hierarchyKind === "page" ? stablePageId : null,
          },
        ],
      };
    }, `${HIERARCHY_LABELS[hierarchyKind]}를 추가했습니다.`);
    setHierarchyTitle("");
    setPageId("");
  };

  const removeHierarchy = (id: string) => {
    const referenced = workspace.hierarchy.some((node) => node.parentId === id)
      || workspace.tasks.some((task) => task.hierarchyNodeId === id)
      || workspace.reviews.some((review) => review.hierarchyNodeId === id)
      || workspace.roleAssignments.some((assignment) => assignment.hierarchyNodeId === id)
      || workspace.handoffs.some((handoff) => handoff.hierarchyNodeId === id);
    if (referenced) return;
    onCommit((current) => ({
      ...current,
      hierarchy: current.hierarchy.filter((node) => node.id !== id),
    }), "빈 제작 계층 항목을 삭제했습니다.");
  };

  const addRoleAssignment = () => {
    const displayName = memberName.trim();
    if (!displayName) return;
    onCommit((current) => ({
      ...current,
      members: current.members.includes(displayName)
        ? current.members
        : [...current.members, displayName],
      roleAssignments: [
        ...current.roleAssignments,
        {
          id: createId("role"),
          memberId: null,
          displayName,
          roles: [memberRole],
          hierarchyNodeId: memberScope || null,
        },
      ],
    }), "제작 역할을 배정했습니다.");
    setMemberName("");
  };

  const removeRoleAssignment = (id: string) => {
    onCommit((current) => ({
      ...current,
      roleAssignments: current.roleAssignments.filter((assignment) => assignment.id !== id),
      tasks: current.tasks.map((task) => ({
        ...task,
        assigneeIds: (task.assigneeIds ?? []).filter((candidate) => candidate !== id),
        reviewerIds: (task.reviewerIds ?? []).filter((candidate) => candidate !== id),
      })),
    }), "제작 역할 배정을 해제했습니다.");
  };

  const toggleLockedField = (field: ProductionAuthorityField) => {
    setLockedFields((current) => current.includes(field)
      ? current.filter((candidate) => candidate !== field)
      : [...current, field]);
  };

  const addHandoff = () => {
    if (!handoffNodeId || handoffFrom === handoffTo) return;
    const next: ProductionHandoffBrief = {
      id: createId("handoff"),
      hierarchyNodeId: handoffNodeId,
      fromRole: handoffFrom,
      toRole: handoffTo,
      status: "draft",
      scenePurpose: handoffPurpose.trim(),
      emotionalBeat: handoffEmotion.trim(),
      mustShow: splitHandoffLines(handoffMustShow),
      continuityNotes: splitHandoffLines(handoffContinuity),
      lockedFields,
      acceptanceCriteria: splitHandoffLines(handoffAcceptance),
      createdBy: handoffCreator.trim(),
      assignedTo: handoffAssignee.trim(),
      updatedAt: new Date().toISOString(),
    };
    onCommit((current) => ({
      ...current,
      handoffs: [...current.handoffs, next],
    }), "스토리·작화 인계 브리프를 추가했습니다.");
    setHandoffPurpose("");
    setHandoffEmotion("");
    setHandoffMustShow("");
    setHandoffContinuity("");
    setHandoffAcceptance("");
  };

  const setHandoffStatus = (id: string, status: ProductionHandoffStatus) => {
    onCommit((current) => ({
      ...current,
      handoffs: current.handoffs.map((handoff) => handoff.id === id
        ? { ...handoff, status, updatedAt: new Date().toISOString() }
        : handoff),
    }), `인계 상태를 ${HANDOFF_LABELS[status]}로 변경했습니다.`);
  };

  const removeHandoff = (id: string) => {
    onCommit((current) => ({
      ...current,
      handoffs: current.handoffs.filter((handoff) => handoff.id !== id),
    }), "인계 브리프를 삭제했습니다.");
  };

  const orderedHierarchy = useMemo(() => {
    const ordered: Array<{
      readonly node: ProductionHierarchyNode;
      readonly depth: number;
    }> = [];
    const visit = (currentParent: string | null, depth: number) => {
      for (const node of hierarchyByParent.get(currentParent) ?? []) {
        ordered.push({ node, depth });
        visit(node.id, depth + 1);
      }
    };
    visit(null, 0);
    return ordered;
  }, [hierarchyByParent]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="flex items-center gap-2">
          <BookOpen className="size-5 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-black">에피소드·시퀀스·장면·페이지 구조</h2>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-fg-2">
          원고 페이지 순서와 별도로 제작 책임과 인계를 묶는 상위 구조입니다. 페이지 노드는 편집기의 안정적인 페이지 ID를 참조합니다.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            종류
            <select
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={hierarchyKind}
              onChange={(event) => {
                setHierarchyKind(event.currentTarget.value as ProductionHierarchyKind);
                setParentId("");
              }}
              disabled={!canEdit}
            >
              {STUDIO_PRODUCTION_HIERARCHY_KINDS.map((kind) => (
                <option key={kind} value={kind}>{HIERARCHY_LABELS[kind]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2 sm:col-span-1 xl:col-span-2">
            이름
            <input
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={hierarchyTitle}
              onChange={(event) => setHierarchyTitle(event.currentTarget.value)}
              maxLength={240}
              placeholder={`${HIERARCHY_LABELS[hierarchyKind]} 이름`}
              disabled={!canEdit}
            />
          </label>
          {parentKinds(hierarchyKind).length > 0 ? (
            <label className="grid gap-1 text-xs font-semibold text-fg-2">
              부모
              <select
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
                value={parentId}
                onChange={(event) => setParentId(event.currentTarget.value)}
                disabled={!canEdit}
              >
                <option value="">선택</option>
                {allowedParents.map((node) => (
                  <option key={node.id} value={node.id}>{node.title}</option>
                ))}
              </select>
            </label>
          ) : <span aria-hidden="true" />}
          {hierarchyKind === "page" ? (
            <label className="grid gap-1 text-xs font-semibold text-fg-2">
              페이지 ID
              <input
                className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
                value={pageId}
                onChange={(event) => setPageId(event.currentTarget.value)}
                maxLength={160}
                placeholder="page-id"
                disabled={!canEdit}
              />
            </label>
          ) : (
            <button
              type="button"
              className={cn(buttonClass({ size: "sm" }), "self-end")}
              onClick={addHierarchy}
              disabled={!canEdit || !hierarchyTitle.trim() || (parentKinds(hierarchyKind).length > 0 && !parentId)}
            >
              <Plus className="size-4" aria-hidden="true" />
              추가
            </button>
          )}
        </div>
        {hierarchyKind === "page" ? (
          <button
            type="button"
            className={cn(buttonClass({ size: "sm" }), "mt-2")}
            onClick={addHierarchy}
            disabled={!canEdit || !hierarchyTitle.trim() || !parentId || !pageId.trim()}
          >
            <Plus className="size-4" aria-hidden="true" />
            페이지 연결
          </button>
        ) : null}

        {orderedHierarchy.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-2">
            아직 제작 구조가 없습니다. 에피소드부터 추가하세요.
          </p>
        ) : (
          <div className="mt-4 space-y-1">
            {orderedHierarchy.map(({ node, depth }) => {
              const referenced = workspace.hierarchy.some((candidate) => candidate.parentId === node.id)
                || workspace.tasks.some((task) => task.hierarchyNodeId === node.id)
                || workspace.reviews.some((review) => review.hierarchyNodeId === node.id)
                || workspace.roleAssignments.some((assignment) => assignment.hierarchyNodeId === node.id)
                || workspace.handoffs.some((handoff) => handoff.hierarchyNodeId === node.id);
              return (
                <div
                  key={node.id}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3"
                  style={{ marginInlineStart: `${Math.min(depth, 4) * 1.25}rem` }}
                >
                  <div className="min-w-0">
                    <span className="mr-2 text-[0.6875rem] font-bold uppercase tracking-wide text-accent">
                      {HIERARCHY_LABELS[node.kind]}
                    </span>
                    <span className="text-sm font-semibold">{node.title}</span>
                    {node.pageId ? <span className="ml-2 font-mono text-xs text-fg-3">{node.pageId}</span> : null}
                  </div>
                  <button
                    type="button"
                    className={buttonClass({ variant: "quiet", size: "icon" })}
                    onClick={() => removeHierarchy(node.id)}
                    disabled={!canEdit || referenced}
                    aria-label={`${node.title} 삭제`}
                    title={referenced ? "하위 항목 또는 제작 데이터가 연결되어 삭제할 수 없습니다." : "삭제"}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-black">제작 역할 배정</h2>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-fg-2">
          한 사람에게 여러 역할을 배정할 수 있고, 에피소드·시퀀스·장면 범위별 책임자를 따로 둘 수 있습니다.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            이름
            <input
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={memberName}
              onChange={(event) => setMemberName(event.currentTarget.value)}
              maxLength={240}
              disabled={!canManageRoles}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            역할
            <select
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={memberRole}
              onChange={(event) => setMemberRole(event.currentTarget.value as ProductionRole)}
              disabled={!canManageRoles}
            >
              {STUDIO_PRODUCTION_ROLES.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            적용 범위
            <select
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={memberScope}
              onChange={(event) => setMemberScope(event.currentTarget.value)}
              disabled={!canManageRoles}
            >
              <option value="">프로젝트 전체</option>
              {orderedHierarchy.map(({ node, depth }) => (
                <option key={node.id} value={node.id}>
                  {`${"· ".repeat(Math.min(depth, 4))}${node.title}`}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={cn(buttonClass({ size: "sm" }), "self-end")}
            onClick={addRoleAssignment}
            disabled={!canManageRoles || !memberName.trim()}
          >
            <Plus className="size-4" aria-hidden="true" />
            역할 배정
          </button>
        </div>

        {workspace.roleAssignments.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-2">
            아직 제작 역할이 배정되지 않았습니다.
          </p>
        ) : (
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {workspace.roleAssignments.map((assignment) => {
              const scope = assignment.hierarchyNodeId
                ? workspace.hierarchy.find((node) => node.id === assignment.hierarchyNodeId)?.title
                : "프로젝트 전체";
              return (
                <article key={assignment.id} className="rounded-xl border border-line bg-panel p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold">{assignment.displayName}</h3>
                      <p className="mt-1 text-xs text-fg-2">
                        {assignment.roles.map((role) => ROLE_LABELS[role]).join(" · ")}
                      </p>
                      <p className="mt-1 truncate text-xs text-fg-3">{scope}</p>
                    </div>
                    <button
                      type="button"
                      className={buttonClass({ variant: "quiet", size: "icon" })}
                      onClick={() => removeRoleAssignment(assignment.id)}
                      disabled={!canManageRoles}
                      aria-label={`${assignment.displayName} 역할 해제`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-5 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-black">스토리→작화 인계 브리프</h2>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-fg-2">
          장면 목적·감정선·변경 금지 필드를 명시해 대사와 캐릭터 연속성을 보존합니다.
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            대상 장면/범위
            <select
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={handoffNodeId}
              onChange={(event) => setHandoffNodeId(event.currentTarget.value)}
              disabled={!canEdit}
            >
              <option value="">선택</option>
              {orderedHierarchy.map(({ node, depth }) => (
                <option key={node.id} value={node.id}>
                  {`${"· ".repeat(Math.min(depth, 4))}${node.title}`}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            보내는 역할
            <select
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={handoffFrom}
              onChange={(event) => setHandoffFrom(event.currentTarget.value as ProductionRole)}
              disabled={!canEdit}
            >
              {STUDIO_PRODUCTION_ROLES.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
          </label>
          <div className="hidden items-end justify-center pb-3 xl:flex" aria-hidden="true">
            <ArrowRight className="size-5 text-fg-3" />
          </div>
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            받는 역할
            <select
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={handoffTo}
              onChange={(event) => setHandoffTo(event.currentTarget.value as ProductionRole)}
              disabled={!canEdit}
            >
              {STUDIO_PRODUCTION_ROLES.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2 md:col-span-2">
            장면 목적
            <textarea
              className="min-h-24 rounded-xl border border-line bg-panel p-3 text-sm text-fg"
              value={handoffPurpose}
              onChange={(event) => setHandoffPurpose(event.currentTarget.value)}
              maxLength={4_000}
              disabled={!canEdit}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2 md:col-span-2">
            감정선
            <textarea
              className="min-h-24 rounded-xl border border-line bg-panel p-3 text-sm text-fg"
              value={handoffEmotion}
              onChange={(event) => setHandoffEmotion(event.currentTarget.value)}
              maxLength={4_000}
              disabled={!canEdit}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2 md:col-span-2 xl:col-span-4">
            반드시 보여야 할 요소 · 한 줄에 하나
            <textarea
              className="min-h-24 rounded-xl border border-line bg-panel p-3 text-sm text-fg"
              value={handoffMustShow}
              onChange={(event) => setHandoffMustShow(event.currentTarget.value)}
              maxLength={12_000}
              placeholder={"핵심 소품\n표정 또는 행동\n장소 표식"}
              disabled={!canEdit}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2 md:col-span-2">
            연속성 메모 · 한 줄에 하나
            <textarea
              className="min-h-24 rounded-xl border border-line bg-panel p-3 text-sm text-fg"
              value={handoffContinuity}
              onChange={(event) => setHandoffContinuity(event.currentTarget.value)}
              maxLength={12_000}
              placeholder={"이전 장면 의상 유지\n오른손에 소품 유지"}
              disabled={!canEdit}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2 md:col-span-2">
            인수 완료 기준 · 한 줄에 하나
            <textarea
              className="min-h-24 rounded-xl border border-line bg-panel p-3 text-sm text-fg"
              value={handoffAcceptance}
              onChange={(event) => setHandoffAcceptance(event.currentTarget.value)}
              maxLength={12_000}
              placeholder={"대사와 컷 번호 일치\n캐릭터 바이블 검수 완료"}
              disabled={!canEdit}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            작성자
            <input
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={handoffCreator}
              onChange={(event) => setHandoffCreator(event.currentTarget.value)}
              maxLength={240}
              placeholder="스토리 작가"
              disabled={!canEdit}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-fg-2">
            인수자
            <input
              className="min-h-11 rounded-xl border border-line bg-panel px-3 text-sm text-fg"
              value={handoffAssignee}
              onChange={(event) => setHandoffAssignee(event.currentTarget.value)}
              maxLength={240}
              placeholder="작화 작가"
              disabled={!canEdit}
            />
          </label>
        </div>

        <fieldset className="mt-3 rounded-xl border border-line p-3" disabled={!canEdit}>
          <legend className="px-1 text-xs font-bold">변경 전 승인 필요 항목</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {STUDIO_PRODUCTION_AUTHORITY_FIELDS.map((field) => (
              <label key={field} className="flex min-h-10 items-center gap-2 rounded-lg border border-line px-3 text-xs">
                <input
                  type="checkbox"
                  checked={lockedFields.includes(field)}
                  onChange={() => toggleLockedField(field)}
                />
                {AUTHORITY_LABELS[field]}
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          className={cn(buttonClass({ size: "sm" }), "mt-3")}
          onClick={addHandoff}
          disabled={!canEdit || !handoffNodeId || handoffFrom === handoffTo}
        >
          <Plus className="size-4" aria-hidden="true" />
          인계 브리프 추가
        </button>
        {workspace.handoffs.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-2">
            아직 인계 브리프가 없습니다.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {workspace.handoffs.map((handoff) => {
              const scope = workspace.hierarchy.find((node) => node.id === handoff.hierarchyNodeId);
              return (
                <article key={handoff.id} className="rounded-xl border border-line bg-panel p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold">{scope?.title ?? "알 수 없는 범위"}</h3>
                        <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.6875rem] font-bold text-accent">
                          {ROLE_LABELS[handoff.fromRole]} → {ROLE_LABELS[handoff.toRole]}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-fg-2">
                        {handoff.scenePurpose || "장면 목적 미입력"}
                      </p>
                      {handoff.emotionalBeat ? (
                        <p className="mt-1 text-xs text-fg-3">감정선: {handoff.emotionalBeat}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-fg-3">
                        {handoff.createdBy || "작성자 미정"} → {handoff.assignedTo || "인수자 미정"}
                      </p>
                      {handoff.mustShow.length > 0 ? (
                        <p className="mt-2 text-xs text-fg-2">
                          필수 연출: {handoff.mustShow.join(" · ")}
                        </p>
                      ) : null}
                      {handoff.continuityNotes.length > 0 ? (
                        <p className="mt-1 text-xs text-fg-2">
                          연속성: {handoff.continuityNotes.join(" · ")}
                        </p>
                      ) : null}
                      {handoff.acceptanceCriteria.length > 0 ? (
                        <p className="mt-1 text-xs text-fg-2">
                          완료 기준: {handoff.acceptanceCriteria.join(" · ")}
                        </p>
                      ) : null}
                      {handoff.lockedFields.length > 0 ? (
                        <p className="mt-2 text-xs text-fg-2">
                          승인 필요: {handoff.lockedFields.map((field) => AUTHORITY_LABELS[field]).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="min-h-10 rounded-xl border border-line bg-card px-3 text-xs text-fg"
                        value={handoff.status}
                        onChange={(event) => setHandoffStatus(
                          handoff.id,
                          event.currentTarget.value as ProductionHandoffStatus,
                        )}
                        disabled={!canEdit}
                        aria-label={`${scope?.title ?? "인계"} 상태`}
                      >
                        {STUDIO_PRODUCTION_HANDOFF_STATUSES.map((status) => (
                          <option key={status} value={status}>{HANDOFF_LABELS[status]}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={buttonClass({ variant: "quiet", size: "icon" })}
                        onClick={() => removeHandoff(handoff.id)}
                        disabled={!canEdit}
                        aria-label={`${scope?.title ?? "인계"} 삭제`}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
