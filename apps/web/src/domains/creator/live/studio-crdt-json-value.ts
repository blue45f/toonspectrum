export type StudioCrdtJsonValue =
  | null
  | boolean
  | number
  | string
  | StudioCrdtJsonValue[]
  | { [key: string]: StudioCrdtJsonValue };

export type StudioCrdtJsonObject = { [key: string]: StudioCrdtJsonValue };

const MAX_JSON_DEPTH = 10;

const MAX_JSON_ENTRIES = 4_096;

export const MAX_JSON_STRING_LENGTH = 64 * 1024;

function cloneJson(
  value: StudioCrdtJsonValue,
  state: { entries: number },
  depth = 0
): StudioCrdtJsonValue {
  if (depth > MAX_JSON_DEPTH || ++state.entries > MAX_JSON_ENTRIES) {
    throw new Error("장면 확장 데이터가 허용 범위를 벗어났습니다.");
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("장면 확장 데이터에 유한하지 않은 수가 있습니다.");
    return value;
  }
  if (typeof value === "string") {
    if (value.length > MAX_JSON_STRING_LENGTH) throw new Error("장면 확장 문자열이 너무 깁니다.");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => cloneJson(item, state, depth + 1));
  if (typeof value !== "object") throw new Error("장면 확장 데이터는 JSON 형식이어야 합니다.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("장면 확장 데이터는 일반 JSON 객체여야 합니다.");
  }
  const result: StudioCrdtJsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key || key.length > 512 || key.includes("\0")) {
      throw new Error("장면 확장 데이터 키가 올바르지 않습니다.");
    }
    result[key] = cloneJson(item, state, depth + 1);
  }
  return result;
}

export function cloneJsonObject(value: StudioCrdtJsonObject): StudioCrdtJsonObject {
  const cloned = cloneJson(value, { entries: 0 });
  if (!cloned || typeof cloned !== "object" || Array.isArray(cloned)) {
    throw new Error("장면 확장 데이터는 JSON 객체여야 합니다.");
  }
  return cloned;
}

export function boundedString(value: unknown, maximum = MAX_JSON_STRING_LENGTH): value is string {
  return typeof value === "string" && value.length <= maximum && !value.includes("\0");
}

export function finiteRange(value: unknown, minimum: number, maximum: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} 값이 허용 범위를 벗어났습니다.`);
  }
}

export function jsonValue(value: unknown): StudioCrdtJsonValue | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const result: StudioCrdtJsonValue[] = [];
    for (const item of value) {
      const normalized = jsonValue(item);
      if (normalized === undefined) return undefined;
      result.push(normalized);
    }
    return result;
  }
  if (!value || typeof value !== "object") return undefined;
  const result: StudioCrdtJsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = jsonValue(item);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
}

export function jsonObject(value: unknown): StudioCrdtJsonObject | undefined {
  const normalized = jsonValue(value);
  return normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? normalized
    : undefined;
}
