/**
 * Studio 그룹 선택 엔진 — 캔버스 클릭을 "그룹 = 하나의 단위"로 확장하는 순수·결정적 로직.
 *
 * 배경: 요소의 그룹 소속은 평탄 모델(`El.groupId: string`)이고, 그룹 메타는 `LayerGroup`이다.
 * StudioPage 캔버스는 단일 선택을 `selectedId`, 다중 선택을 `marqueeIds: string[]`로 표현하며
 * 두 상태는 상호 배타다(selectedId가 생기면 marqueeIds는 비워진다). 트랜스포머·그룹 드래그·정렬은
 * 모두 marqueeIds(≥2)를 하나의 변형 단위로 다룬다.
 *
 * PPT/Figma/Illustrator/Canva 공통 동작을 이 모듈이 순수 함수로 계산한다:
 *  - 그룹에 속한 요소를 (그룹 밖에서) 클릭 → 그 그룹의 모든 멤버를 한 단위로 선택.
 *  - 더블클릭 → 그룹 "진입"(activeGroupId). 진입 중엔 개별 자식만 선택.
 *  - Escape → 한 단계 위로(진입 해제 + 그룹 전체 재선택).
 *  - Shift 클릭 → 그룹 단위로 토글(가산/제거).
 *
 * 전부 Konva/DOM/React 의존이 없어 헤드리스 단위 테스트가 캔버스와 같은 로직을 검증한다.
 * 반환값은 항상 새 객체이며 입력을 변형하지 않는다. 선택 id 정규화는 레이어 내비게이터의
 * `selectLayersFromNavigator`(0/1/2+ → 없음/단일/마퀴) 규약과 바이트 동일하게 맞춘다.
 */

// 엔진이 보는 요소의 최소 형태(z-order 배열의 한 항목).
export interface GroupSelectionItemLike {
  readonly id: string;
  readonly groupId?: string;
}

// 엔진이 보는 그룹 메타의 최소 형태(존재 여부 판정용).
export interface GroupSelectionGroupLike {
  readonly id: string;
}

// 캔버스 선택의 권위 상태 3종. selectedId/marqueeIds는 상호 배타(둘 중 하나만 비어 있지 않음).
export interface GroupSelectionState {
  readonly selectedId: string | null;
  readonly marqueeIds: string[];
  readonly activeGroupId: string | null;
}

// 아무것도 선택되지 않은/그룹 진입 해제 상태.
export const EMPTY_GROUP_SELECTION: GroupSelectionState = {
  selectedId: null,
  marqueeIds: [],
  activeGroupId: null,
};

/**
 * id 집합을 캔버스 선택 표현으로 정규화한다(레이어 내비게이터 규약과 동일).
 *  0개 → 선택 없음 · 1개 → 단일(selectedId) · 2개 이상 → 다중(marqueeIds).
 */
export function selectionShapeForIds(
  ids: readonly string[]
): { selectedId: string | null; marqueeIds: string[] } {
  if (ids.length === 0) return { selectedId: null, marqueeIds: [] };
  if (ids.length === 1) return { selectedId: ids[0]!, marqueeIds: [] };
  return { selectedId: null, marqueeIds: [...ids] };
}

/** 현재 선택된 id들(다중이면 marqueeIds, 단일이면 selectedId 하나, 없으면 빈 배열). */
export function currentSelectionIds(state: {
  readonly selectedId: string | null;
  readonly marqueeIds: readonly string[];
}): string[] {
  if (state.marqueeIds.length > 0) return [...state.marqueeIds];
  return state.selectedId ? [state.selectedId] : [];
}

/** 주어진 groupId의 모든 멤버 id를 z-order 순서대로 반환. */
export function groupMemberIds(
  items: readonly GroupSelectionItemLike[],
  groupId: string
): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item.groupId === groupId) out.push(item.id);
  }
  return out;
}

// id 집합을 items의 z-order로 정렬(결정적 marqueeIds 유지용).
function orderIdsByItems(
  items: readonly GroupSelectionItemLike[],
  idSet: ReadonlySet<string>
): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (idSet.has(item.id)) out.push(item.id);
  }
  return out;
}

// 요소의 유효 groupId — 메타에 실제로 존재하는 그룹만 인정(삭제된 그룹의 유령 참조는 무그룹 취급).
function effectiveGroupId(
  item: GroupSelectionItemLike | undefined,
  knownGroupIds: ReadonlySet<string>
): string | undefined {
  const groupId = item?.groupId;
  return groupId !== undefined && knownGroupIds.has(groupId) ? groupId : undefined;
}

/**
 * 클릭 한 번이 선택할 "단위"를 해석한다.
 *  - 그룹 진입 중(activeGroupId)이고 그 그룹의 자식을 클릭 → 개별 자식(진입 유지).
 *  - (진입 밖에서) 그룹 소속 요소 클릭 → 그룹 전체(진입 해제).
 *  - 무그룹 요소 클릭 → 그 요소 하나(진입 해제).
 * 존재하지 않는 요소를 클릭하면 그 id 하나를 단위로, 진입은 해제한다.
 */
export function resolveClickUnit(
  items: readonly GroupSelectionItemLike[],
  knownGroupIds: ReadonlySet<string>,
  clickedId: string,
  activeGroupId: string | null
): { unit: string[]; nextActiveGroupId: string | null } {
  const clicked = items.find((item) => item.id === clickedId);
  const groupId = effectiveGroupId(clicked, knownGroupIds);
  // 그룹 내부 편집 중 + 그 그룹의 자식 → 개별 선택(진입 유지).
  if (activeGroupId !== null && groupId === activeGroupId) {
    return { unit: [clickedId], nextActiveGroupId: activeGroupId };
  }
  // 그룹 소속 요소를 바깥에서 클릭 → 그룹 전체(진입 해제).
  if (groupId !== undefined) {
    return { unit: groupMemberIds(items, groupId), nextActiveGroupId: null };
  }
  // 무그룹(또는 유령 그룹) → 단일(진입 해제).
  return { unit: [clickedId], nextActiveGroupId: null };
}

export interface GroupClickSelectionInput {
  readonly items: readonly GroupSelectionItemLike[];
  readonly groups: readonly GroupSelectionGroupLike[];
  readonly clickedId: string;
  readonly current: GroupSelectionState;
  /** Shift 클릭 — 단위 전체를 현재 선택에 토글(가산/제거). */
  readonly additive?: boolean;
}

/**
 * 캔버스 단일/Shift 클릭의 다음 선택 상태를 계산한다.
 *  - 일반 클릭: 단위(그룹 전체 또는 개별)로 통째로 대체.
 *  - Shift 클릭: 단위가 전부 이미 선택돼 있으면 단위 전체 제거, 아니면 단위 전체 추가(z-order 유지).
 * 가산 선택은 최상위 레벨 작업이므로 진입 상태를 해제한다(단, 활성 그룹 내부 자식 토글이면 유지).
 */
export function planGroupClickSelection(input: GroupClickSelectionInput): GroupSelectionState {
  const knownGroupIds = new Set(input.groups.map((group) => group.id));
  const { unit, nextActiveGroupId } = resolveClickUnit(
    input.items,
    knownGroupIds,
    input.clickedId,
    input.current.activeGroupId
  );

  if (!input.additive) {
    const shape = selectionShapeForIds(unit);
    return { ...shape, activeGroupId: nextActiveGroupId };
  }

  // 가산(Shift) — 단위를 하나의 덩어리로 토글.
  const currentIds = currentSelectionIds(input.current);
  const currentSet = new Set(currentIds);
  const unitSet = new Set(unit);
  const allSelected = unit.length > 0 && unit.every((id) => currentSet.has(id));

  const nextSet = new Set(currentIds);
  if (allSelected) {
    for (const id of unitSet) nextSet.delete(id);
  } else {
    for (const id of unit) nextSet.add(id);
  }
  const nextIds = orderIdsByItems(input.items, nextSet);
  const shape = selectionShapeForIds(nextIds);

  // 활성 그룹 내부 자식을 가산 토글하는 경우만 진입 유지, 그 외 가산은 최상위이므로 해제.
  const stayInside =
    input.current.activeGroupId !== null && nextActiveGroupId === input.current.activeGroupId;
  return { ...shape, activeGroupId: stayInside ? input.current.activeGroupId : null };
}

export interface GroupEnterInput {
  readonly items: readonly GroupSelectionItemLike[];
  readonly groups: readonly GroupSelectionGroupLike[];
  readonly clickedId: string;
}

/**
 * 더블클릭 = 그룹 진입. 그룹 소속 요소면 그 그룹으로 진입하고 클릭한 개별 자식을 선택한다.
 * 무그룹 요소면 진입 없이 그 요소만 단일 선택(일반 클릭과 동일).
 */
export function planGroupEnter(input: GroupEnterInput): GroupSelectionState {
  const knownGroupIds = new Set(input.groups.map((group) => group.id));
  const clicked = input.items.find((item) => item.id === input.clickedId);
  const groupId = effectiveGroupId(clicked, knownGroupIds);
  if (groupId === undefined) {
    return { selectedId: input.clickedId, marqueeIds: [], activeGroupId: null };
  }
  return { selectedId: input.clickedId, marqueeIds: [], activeGroupId: groupId };
}

export interface GroupEscapeInput {
  readonly items: readonly GroupSelectionItemLike[];
  readonly current: GroupSelectionState;
}

/**
 * Escape = 한 단계 위로. 그룹 진입 중이면 진입을 해제하고 그 그룹 전체를 다시 선택한다.
 * 진입 상태가 아니면 null을 반환해 호출부가 기존 Escape(선택 해제) 흐름을 타게 한다.
 */
export function planGroupEscape(input: GroupEscapeInput): GroupSelectionState | null {
  const activeGroupId = input.current.activeGroupId;
  if (activeGroupId === null) return null;
  const members = groupMemberIds(input.items, activeGroupId);
  const shape = selectionShapeForIds(members);
  return { ...shape, activeGroupId: null };
}
