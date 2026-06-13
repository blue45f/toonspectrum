/**
 * Studio Layer Group & Clipping-Mask Engine
 * 레이어 그룹(폴더) + 요소별 "아래로 클리핑" 마스크를 위한 순수 z-order 엔진.
 * StudioPage는 z-order로 정렬된 평탄 elements 배열(인덱스 0=BACK, 마지막=FRONT)을 들고 있고
 * 레이어 패널은 이를 역순(FRONT 먼저)으로 보여준다. 그룹은 패널에서 하나의 접이식 블록으로
 * 보이도록 z-order에서 CONTIGUOUS(연속)하게 유지된다.
 * 전부 순수·결정적 함수 — Konva/DOM 의존 없음, StudioPage 캔버스 로직과 단위 테스트가 공유한다.
 * 배열 연산은 전부 불변 — 입력을 변형하지 않고 새 배열을 반환하며, groupId가 바뀐 요소만
 * 새 객체({ ...item, groupId })로 만든다(바뀌지 않은 요소는 동일 참조 유지).
 */

// 레이어 그룹(폴더) — 패널에서 하나의 접이식 블록.
export type LayerGroup = { id: string; name: string; collapsed?: boolean; hidden?: boolean; locked?: boolean };

// StudioPage El의 최소 부분집합(엔진은 이 형태만 본다).
export type LayerItemLike = { id: string; groupId?: string; hidden?: boolean; locked?: boolean };

/** 새 레이어 그룹 생성 — 펼침/표시/잠금 해제 상태로 시작. */
export function createLayerGroup(id: string, name: string): LayerGroup {
  return { id, name, collapsed: false, hidden: false, locked: false };
}

// ---------------------------------------------------------------------------
// 조회 — 그룹 찾기, 요소의 소속 그룹, 유효 표시/잠금
// ---------------------------------------------------------------------------

/** id로 그룹 찾기. groupId가 null/undefined거나 없으면 null. */
export function findGroup(groups: LayerGroup[], groupId: string | undefined | null): LayerGroup | null {
  if (groupId === undefined || groupId === null) return null;
  for (const group of groups) {
    if (group.id === groupId) return group;
  }
  return null;
}

/** 요소가 속한 그룹(없으면 null). */
export function groupOfItem(item: LayerItemLike, groups: LayerGroup[]): LayerGroup | null {
  return findGroup(groups, item.groupId);
}

/** 유효 표시 숨김 — 요소 자체가 hidden 이거나 소속 그룹이 hidden. */
export function isEffectivelyHidden(item: LayerItemLike, groups: LayerGroup[]): boolean {
  if (item.hidden) return true;
  const group = groupOfItem(item, groups);
  return group?.hidden === true;
}

/** 유효 잠금 — 요소 자체가 locked 이거나 소속 그룹이 locked. */
export function isEffectivelyLocked(item: LayerItemLike, groups: LayerGroup[]): boolean {
  if (item.locked) return true;
  const group = groupOfItem(item, groups);
  return group?.locked === true;
}

// ---------------------------------------------------------------------------
// 그룹 멤버십 재배치 — z-order 연속성(CONTIGUOUS) 유지가 핵심
// ---------------------------------------------------------------------------

// groupId만 갈아끼운 새 객체. (불변 규칙)
function withGroupId<T extends LayerItemLike>(item: T, groupId: string | undefined): T {
  return { ...item, groupId };
}

/**
 * 주어진 ids를 한 그룹(groupId)으로 묶고, z-order 배열에서 CONTIGUOUS가 되도록 재배치한 새 배열을 반환.
 * 규칙: 멤버들은 멤버 중 "가장 앞(가장 큰 인덱스) 멤버" 자리로 모은다. 멤버 간 상대순서 보존,
 * 비멤버 간 상대순서 보존. ids에 해당하는 요소의 groupId를 groupId로 설정. 존재하지 않는 id는 무시.
 * 예: ids [a,b,c,d,e] + ["b","d"] → [a,c,b,d,e] (멤버 b,d를 d 자리로 모음, b→d 순서 보존).
 */
export function groupItems<T extends LayerItemLike>(items: T[], ids: string[], groupId: string): T[] {
  const idSet = new Set(ids);
  // 멤버를 입력(z-order) 순서대로 수집 — 멤버 간 상대순서 보존.
  const memberIndices: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (idSet.has(items[i]!.id)) memberIndices.push(i);
  }
  if (memberIndices.length === 0) return items.slice();

  // 삽입 앵커 = 가장 큰 멤버 인덱스. 그 자리에서 멤버 블록을 한 번에 토해낸다.
  const anchor = memberIndices[memberIndices.length - 1]!;
  const memberBlock = memberIndices.map((i) => withGroupId(items[i]!, groupId));
  const isMember = (i: number) => idSet.has(items[i]!.id);

  const result: T[] = [];
  for (let i = 0; i < items.length; i++) {
    if (i === anchor) {
      // 앵커 슬롯에서 멤버 블록 전체 삽입(블록이 원래 최대 멤버 자리에서 끝나도록).
      for (const m of memberBlock) result.push(m);
    } else if (!isMember(i)) {
      result.push(items[i]!);
    }
    // 다른 멤버 위치는 건너뛴다(블록으로 이미 옮겨짐).
  }
  return result;
}

/**
 * groupId를 가진 모든 요소의 groupId 제거(요소·위치 유지). 새 배열 반환.
 * 바뀐 요소만 새 객체, 나머지는 동일 참조.
 */
export function ungroupItems<T extends LayerItemLike>(items: T[], groupId: string): T[] {
  return items.map((item) => (item.groupId === groupId ? withGroupId(item, undefined) : item));
}

/**
 * 단일 요소를 그룹으로 이동(groupId=undefined면 그룹에서 빼기). 대상 그룹 멤버 옆으로 옮겨 CONTIGUOUS 유지.
 * 규칙: groupId가 비어있지 않고 다른 요소가 이미 그 그룹이면, 그 그룹의 "가장 앞(최대 인덱스) 멤버"
 * 바로 뒤로 옮긴다. 기존 멤버가 없거나 groupId=undefined면 위치는 유지하고 groupId만 갱신. 새 배열 반환.
 */
export function setItemGroup<T extends LayerItemLike>(items: T[], id: string, groupId: string | undefined): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex === -1) return items.slice();

  // 그룹 해제 또는 빈 그룹으로 이동 — 위치 유지, groupId만 갱신.
  if (groupId === undefined) {
    return items.map((item) => (item.id === id ? withGroupId(item, undefined) : item));
  }

  // 대상 그룹의 기존 멤버(이동 대상 자신 제외) 중 가장 앞(최대 인덱스)을 찾는다.
  let frontmostMemberIndex = -1;
  for (let i = 0; i < items.length; i++) {
    if (i === fromIndex) continue;
    if (items[i]!.groupId === groupId) frontmostMemberIndex = i;
  }

  // 기존 멤버가 없으면 위치 유지하고 groupId만 갱신.
  if (frontmostMemberIndex === -1) {
    return items.map((item) => (item.id === id ? withGroupId(item, groupId) : item));
  }

  // 이동 대상을 빼고, 가장 앞 멤버 바로 뒤에 삽입(CONTIGUOUS 보장).
  const moved = withGroupId(items[fromIndex]!, groupId);
  const rest = items.filter((_, i) => i !== fromIndex);
  // 제거로 인덱스가 한 칸 당겨질 수 있으니 보정.
  const insertAfter = frontmostMemberIndex > fromIndex ? frontmostMemberIndex - 1 : frontmostMemberIndex;

  const result: T[] = [];
  for (let i = 0; i < rest.length; i++) {
    result.push(rest[i]!);
    if (i === insertAfter) result.push(moved);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 표시용 트리 — 패널 표시순서에서 그룹 블록을 묶는다
// ---------------------------------------------------------------------------

export type LayerTreeNode<T> = { kind: "group"; group: LayerGroup; items: T[] } | { kind: "item"; item: T };

/**
 * 표시용 트리 — itemsInDisplayOrder(이미 패널 표시순서; 보통 z-order의 역순)를 받아
 * 같은 groupId 연속 요소를 group 노드로, groupId 없는 요소를 item 노드로 묶는다.
 * groupItems가 z-order 연속성을 보장하므로 역순 표시에서도 멤버는 연속이다.
 * 알 수 없는 groupId(groups에 없음)는 item 노드로 취급. 그룹 노드의 items는 받은 표시순서 그대로.
 */
export function buildLayerTree<T extends LayerItemLike>(
  itemsInDisplayOrder: T[],
  groups: LayerGroup[]
): LayerTreeNode<T>[] {
  const nodes: LayerTreeNode<T>[] = [];
  // 진행 중인 그룹 노드(연속 멤버를 모으는 중). 끊기면 flush 후 새로 시작.
  let current: { kind: "group"; group: LayerGroup; items: T[] } | null = null;

  for (const item of itemsInDisplayOrder) {
    const group = groupOfItem(item, groups);
    if (group) {
      if (current && current.group.id === group.id) {
        // 같은 그룹이 이어짐 — 현재 그룹 노드에 추가.
        current.items.push(item);
      } else {
        // 다른 그룹 시작 — 진행 중 그룹을 닫고 새 그룹 노드 시작.
        if (current) nodes.push(current);
        current = { kind: "group", group, items: [item] };
      }
    } else {
      // 그룹 없음/알 수 없는 그룹 — 진행 중 그룹을 닫고 item 노드로.
      if (current) {
        nodes.push(current);
        current = null;
      }
      nodes.push({ kind: "item", item });
    }
  }
  if (current) nodes.push(current);
  return nodes;
}

// ---------------------------------------------------------------------------
// 정리/클리핑 유틸
// ---------------------------------------------------------------------------

/** 멤버가 0개인 그룹 id 목록(정리용). */
export function emptyGroupIds(items: LayerItemLike[], groups: LayerGroup[]): string[] {
  const used = new Set<string>();
  for (const item of items) {
    if (item.groupId !== undefined) used.add(item.groupId);
  }
  return groups.filter((group) => !used.has(group.id)).map((group) => group.id);
}

/**
 * 클리핑 마스크 — z-order id 배열에서 id 바로 아래(이전 인덱스) 요소의 id. 없으면 null.
 * (인덱스 0=BACK이므로 "아래"는 인덱스가 하나 작은 쪽. 맨 아래/없는 id면 null.)
 */
export function itemBelowId(orderedIds: string[], id: string): string | null {
  const index = orderedIds.indexOf(id);
  if (index <= 0) return null;
  return orderedIds[index - 1] ?? null;
}
