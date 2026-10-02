/**
 * 열 안 카드 순서(직접 정렬).
 *
 * 서버 작업 계약에는 카드 순서가 없다. 그래서 열마다 "카드 id 목록"을 이 기기에만 저장하고,
 * 목록에 없는 카드(새 카드·다른 열에서 온 카드)는 열의 맨 아래에 둔다.
 * 순서 바꾸기는 작업 상태·승인 규칙을 바꾸지 않는다.
 */

/** 열 id → 위에서 아래 순서의 카드 id 목록. */
export type ProductionBoardOrder = Readonly<Record<string, readonly string[]>>;

export const EMPTY_BOARD_ORDER: ProductionBoardOrder = Object.freeze({});

const MAX_IDS_PER_COLUMN = 500;
const MAX_ID_LENGTH = 200;
const STORAGE_PREFIX = "toonstudio.production.board-order.v1:";

/** 저장된 순서대로 앞에 놓고, 목록에 없는 카드는 원래 순서 그대로 뒤에 붙인다. */
export function applyColumnOrder<T extends { readonly id: string }>(
  items: readonly T[],
  order: readonly string[] | undefined,
): readonly T[] {
  if (!order || order.length === 0) return items;
  const rank = new Map<string, number>();
  order.forEach((id, index) => {
    if (!rank.has(id)) rank.set(id, index);
  });
  const listed: T[] = [];
  const rest: T[] = [];
  for (const item of items) (rank.has(item.id) ? listed : rest).push(item);
  listed.sort((left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0));
  return [...listed, ...rest];
}

/**
 * `moving` 카드를 `beforeId` 카드 바로 앞에 놓은 열 전체 순서를 돌려준다.
 * `beforeId`가 null이거나 열에 없으면 맨 아래다. `columnIds`는 필터와 상관없는 열 전체 순서여야
 * 필터로 숨은 카드가 순서를 잃지 않는다.
 */
export function placeInColumnOrder(
  columnIds: readonly string[],
  moving: readonly string[],
  beforeId: string | null,
): readonly string[] {
  const movingSet = new Set(moving);
  const rest = columnIds.filter((id) => !movingSet.has(id));
  const found = beforeId === null ? -1 : rest.indexOf(beforeId);
  const at = found < 0 ? rest.length : found;
  return [...rest.slice(0, at), ...new Set(moving), ...rest.slice(at)].slice(0, MAX_IDS_PER_COLUMN);
}

/**
 * 키보드(Alt+↑/↓)로 한 칸 옮길 때 놓을 위치. 보이는 이웃 카드를 기준으로 하므로 필터에 가려진 카드는 건너뛴다.
 * 더 옮길 곳이 없으면 undefined.
 */
export function neighborBeforeId(
  visibleIds: readonly string[],
  id: string,
  delta: -1 | 1,
): string | null | undefined {
  const index = visibleIds.indexOf(id);
  if (index < 0) return undefined;
  if (delta === -1) return index === 0 ? undefined : visibleIds[index - 1];
  if (index >= visibleIds.length - 1) return undefined;
  return visibleIds[index + 2] ?? null;
}

/** 없어진 카드를 순서에서 지운다. 변경이 없으면 같은 객체를 돌려준다. */
export function pruneBoardOrder(order: ProductionBoardOrder, validIds: ReadonlySet<string>): ProductionBoardOrder {
  let changed = false;
  const next: Record<string, readonly string[]> = {};
  for (const [columnId, ids] of Object.entries(order)) {
    const kept = ids.filter((id) => validIds.has(id));
    if (kept.length !== ids.length) changed = true;
    if (kept.length > 0) next[columnId] = kept;
    else changed = true;
  }
  return changed ? next : order;
}

/** 어떤 열의 순서를 바꾸고, 같은 카드가 다른 열 목록에 남지 않게 정리한다. */
export function withColumnOrder(
  order: ProductionBoardOrder,
  columnId: string,
  ids: readonly string[],
): ProductionBoardOrder {
  const moved = new Set(ids);
  const next: Record<string, readonly string[]> = {};
  for (const [key, list] of Object.entries(order)) {
    if (key === columnId) continue;
    const kept = list.filter((id) => !moved.has(id));
    if (kept.length > 0) next[key] = kept;
  }
  next[columnId] = ids;
  return next;
}

function isStringList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_IDS_PER_COLUMN &&
    value.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= MAX_ID_LENGTH)
  );
}

/** 저장소에서 읽은 문자열을 검증해 순서로 바꾼다. 손상된 값은 무시한다. */
export function parseBoardOrder(raw: string | null): ProductionBoardOrder {
  if (!raw) return EMPTY_BOARD_ORDER;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_BOARD_ORDER;
    const next: Record<string, readonly string[]> = {};
    for (const [key, list] of Object.entries(value)) {
      if (key.length <= 40 && isStringList(list)) next[key] = list;
    }
    return next;
  } catch {
    return EMPTY_BOARD_ORDER;
  }
}

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem" | "removeItem">;

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // 저장소가 막힌 브라우저(사생활 보호 모드 등)에서는 이 탭 안에서만 순서를 유지한다.
    return null;
  }
}

export function readStoredBoardOrder(projectId: string, storage: ReadStorage | null = browserStorage()): ProductionBoardOrder {
  if (!storage) return EMPTY_BOARD_ORDER;
  try {
    return parseBoardOrder(storage.getItem(`${STORAGE_PREFIX}${projectId}`));
  } catch {
    return EMPTY_BOARD_ORDER;
  }
}

export function writeStoredBoardOrder(
  projectId: string,
  order: ProductionBoardOrder,
  storage: WriteStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    const key = `${STORAGE_PREFIX}${projectId}`;
    if (Object.keys(order).length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(order));
  } catch {
    // 저장 공간이 가득 찼거나 막혀 있어도 화면의 순서는 그대로 유지한다.
  }
}
