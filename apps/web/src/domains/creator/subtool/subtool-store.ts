/**
 * 서브툴 스토어: "브러시 + 파라미터 세트" 모델의 CRUD와 localStorage 영속화.
 *
 * 모든 함수는 순수 함수이며 입력 객체를 변경하지 않는다.
 * 브라우저 바깥(테스트/SSR)에서도 동작하도록 스토리지는 인터페이스로 주입받는다.
 */
import {
  normalizeSubToolParams,
  type SubToolParams,
} from "./subtool-params";

/** 서브툴 = 하나의 브러시(baseBrushId)에 묶인 파라미터 세트. */
export interface SubTool {
  readonly id: string;
  readonly name: string;
  /** 기존 브러시 카탈로그의 브러시 id (예: core 카탈로그 id). */
  readonly baseBrushId: string;
  readonly params: SubToolParams;
  /** ISO 8601 생성 시각. */
  readonly createdAt: string;
  /** true면 카탈로그에서 변환된 내장 프리셋이며 삭제 시 확인이 필요하다. */
  readonly isPreset: boolean;
}

export const SUBTOOL_STORAGE_KEY = "toonstudio.studio.subtools.v1";
export const SUBTOOL_MAX_NAME_LENGTH = 60;
const SUBTOOL_MAX_ID_LENGTH = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function generateSubToolId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `subtool-${crypto.randomUUID()}`;
  }
  return `subtool-${Date.now().toString(36)}-${Math.floor(
    Math.random() * 0xffffffff,
  ).toString(36)}`;
}

function validateSubToolName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error("서브툴 이름이 비어 있습니다.");
  if (trimmed.length > SUBTOOL_MAX_NAME_LENGTH) {
    throw new Error(
      `서브툴 이름은 ${SUBTOOL_MAX_NAME_LENGTH}자를 넘을 수 없습니다.`,
    );
  }
  return trimmed;
}

function validateSubToolId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length === 0) throw new Error("서브툴 식별자가 비어 있습니다.");
  if (trimmed.length > SUBTOOL_MAX_ID_LENGTH) {
    throw new Error("서브툴 식별자가 너무 깁니다.");
  }
  return trimmed;
}

function validateBaseBrushId(baseBrushId: string): string {
  const trimmed = baseBrushId.trim();
  if (trimmed.length === 0) throw new Error("기준 브러시 식별자가 비어 있습니다.");
  if (trimmed.length > SUBTOOL_MAX_ID_LENGTH) {
    throw new Error("기준 브러시 식별자가 너무 깁니다.");
  }
  return trimmed;
}

/**
 * 알 수 없는 값을 서브툴로 파싱한다. 유효하지 않으면 null을 반환한다.
 * 저장소 복원 시 손상된 항목을 걸러내는 데 사용한다.
 */
export function parseSubTool(value: unknown): SubTool | null {
  if (!isRecord(value)) return null;
  try {
    const id = validateSubToolId(String(value.id ?? ""));
    const name = validateSubToolName(String(value.name ?? ""));
    const baseBrushId = validateBaseBrushId(String(value.baseBrushId ?? ""));
    const createdAt = String(value.createdAt ?? "");
    if (Number.isNaN(Date.parse(createdAt))) return null;
    return {
      id,
      name,
      baseBrushId,
      params: normalizeSubToolParams(value.params),
      createdAt,
      isPreset: value.isPreset === true,
    };
  } catch {
    return null;
  }
}

/** 새 서브툴을 만든다. params를 생략하면 기본 파라미터가 사용된다. */
export function createSubTool(
  name: string,
  baseBrushId: string,
  params?: unknown,
): SubTool {
  return {
    id: generateSubToolId(),
    name: validateSubToolName(name),
    baseBrushId: validateBaseBrushId(baseBrushId),
    params: normalizeSubToolParams(params),
    createdAt: new Date().toISOString(),
    isPreset: false,
  };
}

/** 서브툴을 복제한다. 새 id와 생성 시각을 받고, 이름을 지정하지 않으면 "이름 (복사본)"이 된다. */
export function cloneSubTool(tool: SubTool, name?: string): SubTool {
  const parsed = parseSubTool(tool);
  if (parsed === null) throw new Error("복제할 서브툴이 올바르지 않습니다.");
  const cloneName = name === undefined ? `${parsed.name} (복사본)` : name;
  return {
    ...parsed,
    id: generateSubToolId(),
    name: validateSubToolName(cloneName),
    createdAt: new Date().toISOString(),
    isPreset: false,
  };
}

/** 서브툴 이름을 변경한다. */
export function renameSubTool(tool: SubTool, name: string): SubTool {
  const parsed = parseSubTool(tool);
  if (parsed === null) throw new Error("이름을 변경할 서브툴이 올바르지 않습니다.");
  return { ...parsed, name: validateSubToolName(name) };
}

/** 파라미터 패치(부분 객체)를 기존 파라미터에 병합하고 정규화한다. */
export function updateSubToolParams(tool: SubTool, patch: unknown): SubTool {
  const parsed = parseSubTool(tool);
  if (parsed === null) throw new Error("파라미터를 변경할 서브툴이 올바르지 않습니다.");
  const patchRecord = isRecord(patch) ? patch : {};
  return {
    ...parsed,
    params: normalizeSubToolParams({ ...parsed.params, ...patchRecord }),
  };
}

/** id로 서브툴을 찾는다. 없으면 null. */
export function findSubTool(
  tools: readonly SubTool[],
  id: string,
): SubTool | null {
  return tools.find((tool) => tool.id === id) ?? null;
}

/** id가 같은 서브툴이 있으면 교체하고, 없으면 목록 끝에 추가한다. */
export function upsertSubTool(
  tools: readonly SubTool[],
  tool: SubTool,
): SubTool[] {
  const parsed = parseSubTool(tool);
  if (parsed === null) throw new Error("저장할 서브툴이 올바르지 않습니다.");
  const index = tools.findIndex((item) => item.id === parsed.id);
  if (index === -1) return [...tools, parsed];
  return tools.map((item, itemIndex) =>
    itemIndex === index ? parsed : item,
  );
}

/** id에 해당하는 서브툴을 삭제한다. 없으면 목록을 그대로 반환한다. */
export function deleteSubTool(
  tools: readonly SubTool[],
  id: string,
): SubTool[] {
  const filtered = tools.filter((tool) => tool.id !== id);
  return filtered.length === tools.length ? [...tools] : filtered;
}

/** localStorage 영속화를 위한 최소 스토리지 인터페이스. */
export interface SubToolStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * 브라우저의 localStorage를 SubToolStorageLike으로 감싸서 반환한다.
 * SSR/비브라우저 환경에서는 null을 반환한다.
 */
export function getBrowserSubToolStorage(): SubToolStorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

const SUBTOOL_STORAGE_MAX_BYTES = 1024 * 1024;

/** 저장소에서 서브툴 목록을 불러온다. 손상된 항목은 건너뛴다. */
export function loadSubTools(
  storage: SubToolStorageLike | null | undefined,
): SubTool[] {
  if (!storage) return [];
  let raw: string | null;
  try {
    raw = storage.getItem(SUBTOOL_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const tools: SubTool[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    const tool = parseSubTool(item);
    if (tool === null || seen.has(tool.id)) continue;
    seen.add(tool.id);
    tools.push(tool);
  }
  return tools;
}

/** 서브툴 목록을 저장소에 저장한다. 실패하면 false를 반환한다. */
export function saveSubTools(
  storage: SubToolStorageLike | null | undefined,
  tools: readonly SubTool[],
): boolean {
  if (!storage) return false;
  let payload: string;
  try {
    payload = JSON.stringify(tools);
  } catch {
    return false;
  }
  if (payload.length > SUBTOOL_STORAGE_MAX_BYTES) return false;
  try {
    storage.setItem(SUBTOOL_STORAGE_KEY, payload);
    return true;
  } catch {
    return false;
  }
}

/** 저장된 서브툴 데이터를 모두 지운다. */
export function clearStoredSubTools(
  storage: SubToolStorageLike | null | undefined,
): void {
  if (!storage) return;
  try {
    storage.removeItem(SUBTOOL_STORAGE_KEY);
  } catch {
    /* 영속화 실패는 무시하고 인메모리 상태를 유지한다 */
  }
}
