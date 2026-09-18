import type { StudioBg3dSharedCharacterGroundingReceipt } from "../bg3d/studio-bg3d-shared-character-grounding";
import type {
  StudioScene3dAuthorityBinding,
  StudioScene3dAuthoritySnapshot,
} from "./studio-scene3d-authority";

export type StudioScene3dCharacterPerformanceHandler =
  | "studio-vrm-pose-editing"
  | "studio-vrm-full-body-ik"
  | "studio-bg3d-shared-character-grounding"
  | "studio-vrm-contact-refinement"
  | "studio-bg3d-rig-pose-bake";

export type StudioScene3dCharacterPerformanceTaskKind =
  | "pose-layer"
  | "full-body-ik"
  | "grounding"
  | "foot-contact"
  | "prop-contact"
  | "pose-bake";

export interface StudioScene3dCharacterPerformanceTask {
  readonly kind: StudioScene3dCharacterPerformanceTaskKind;
  readonly handler: StudioScene3dCharacterPerformanceHandler;
  readonly enabled: boolean;
  readonly required: boolean;
  readonly reason: string;
}

export interface StudioScene3dCharacterPerformanceEntry {
  readonly entityId: string;
  readonly elementId: string | null;
  readonly label: string;
  readonly locked: boolean;
  readonly runtimeKey: string | null;
  readonly placementHash: `sha256:${string}` | null;
  readonly groundingReceipt: StudioBg3dSharedCharacterGroundingReceipt | null;
  readonly tasks: readonly StudioScene3dCharacterPerformanceTask[];
  readonly ready: boolean;
  readonly warnings: readonly string[];
}

export interface StudioScene3dCharacterPerformancePlan {
  readonly version: 1;
  readonly entries: readonly StudioScene3dCharacterPerformanceEntry[];
  readonly readyCount: number;
  readonly blockedCount: number;
  readonly taskCount: number;
  readonly warnings: readonly string[];
}

function linkedBinding(
  bindings: readonly StudioScene3dAuthorityBinding[],
  entityId: string,
): Extract<StudioScene3dAuthorityBinding, { kind: "linked-vrm" }> | null {
  return bindings.find((binding): binding is Extract<
    StudioScene3dAuthorityBinding,
    { kind: "linked-vrm" }
  > => binding.kind === "linked-vrm" && binding.entityId === entityId) ?? null;
}

function task(
  kind: StudioScene3dCharacterPerformanceTaskKind,
  handler: StudioScene3dCharacterPerformanceHandler,
  enabled: boolean,
  required: boolean,
  reason: string,
): StudioScene3dCharacterPerformanceTask {
  return Object.freeze({ kind, handler, enabled, required, reason });
}

export function planStudioScene3dCharacterPerformance(input: {
  readonly authority: StudioScene3dAuthoritySnapshot;
  readonly groundingReceipts?: ReadonlyMap<string, StudioBg3dSharedCharacterGroundingReceipt>;
  readonly requireGrounding?: boolean;
  readonly requireContact?: boolean;
  readonly propContactElementIds?: ReadonlySet<string>;
}): StudioScene3dCharacterPerformancePlan {
  const entries: StudioScene3dCharacterPerformanceEntry[] = [];
  const planWarnings: string[] = [];
  const requireGrounding = input.requireGrounding ?? true;
  const requireContact = input.requireContact ?? true;

  for (const entity of input.authority.document.entities) {
    if (entity.kind !== "character") continue;
    const binding = linkedBinding(input.authority.bindings, entity.id);
    const elementId = binding?.elementId ?? null;
    const groundingReceipt = elementId
      ? input.groundingReceipts?.get(elementId) ?? null
      : null;
    const warnings: string[] = [];
    const sourceReady = binding !== null;
    const editable = sourceReady && !entity.locked;
    const groundingReady = !requireGrounding || groundingReceipt !== null;
    const hasPropContact = Boolean(
      elementId && input.propContactElementIds?.has(elementId),
    );

    if (!sourceReady) {
      warnings.push("연결 VRM 원본 바인딩이 없어 포즈를 원본 레이어에 기록할 수 없습니다.");
    }
    if (entity.locked) warnings.push("캐릭터가 잠겨 있어 IK와 접촉 보정을 실행하지 않습니다.");
    if (requireGrounding && !groundingReceipt) {
      warnings.push("접지 영수증이 없어 발 위치를 확정하지 않았습니다.");
    }
    if (requireContact && !hasPropContact) {
      warnings.push("소품 접촉 대상이 없으므로 손 접촉은 선택 작업으로 남깁니다.");
    }

    const tasks = Object.freeze([
      task(
        "pose-layer",
        "studio-vrm-pose-editing",
        editable,
        true,
        editable ? "additive pose layer로 비파괴 수정" : "원본 바인딩 또는 잠금 해제 필요",
      ),
      task(
        "full-body-ik",
        "studio-vrm-full-body-ik",
        editable,
        true,
        editable ? "손·발 pin과 pole vector를 포함한 전신 IK" : "편집 가능한 캐릭터 필요",
      ),
      task(
        "grounding",
        "studio-bg3d-shared-character-grounding",
        editable,
        requireGrounding,
        groundingReceipt ? "검증된 Stage surface grounding receipt 사용" : "surface hit 재계산 필요",
      ),
      task(
        "foot-contact",
        "studio-vrm-contact-refinement",
        editable && groundingReady,
        requireContact,
        groundingReady ? "접지 결과에 발 접촉 refinement 적용" : "접지 완료 후 실행",
      ),
      task(
        "prop-contact",
        "studio-vrm-contact-refinement",
        editable && hasPropContact,
        false,
        hasPropContact ? "양손·소품 접촉 목표 적용" : "소품 접촉 대상 없음",
      ),
      task(
        "pose-bake",
        "studio-bg3d-rig-pose-bake",
        editable && groundingReady,
        true,
        groundingReady ? "원자적 pose bake history transition 생성" : "접지 확정 후 bake",
      ),
    ]);
    const ready = tasks.every((candidate) => !candidate.required || candidate.enabled)
      && groundingReady;
    entries.push(Object.freeze({
      entityId: entity.id,
      elementId,
      label: entity.name,
      locked: entity.locked,
      runtimeKey: binding?.expectedRuntimeKey ?? null,
      placementHash: binding?.expectedPlacementHash ?? null,
      groundingReceipt,
      tasks,
      ready,
      warnings: Object.freeze(warnings),
    }));
  }

  if (entries.length === 0) {
    planWarnings.push("장면에 연결된 캐릭터가 없어 캐릭터 연출 작업을 만들지 않았습니다.");
  }
  const readyCount = entries.filter(({ ready }) => ready).length;
  const blockedCount = entries.length - readyCount;
  if (blockedCount > 0) {
    planWarnings.push(`${blockedCount}명의 캐릭터가 원본·잠금·접지 조건을 충족하지 못했습니다.`);
  }
  return Object.freeze({
    version: 1 as const,
    entries: Object.freeze(entries),
    readyCount,
    blockedCount,
    taskCount: entries.reduce((total, entry) => total + entry.tasks.length, 0),
    warnings: Object.freeze(planWarnings),
  });
}
