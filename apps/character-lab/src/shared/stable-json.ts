/**
 * 키 정렬 JSON 직렬화. 같은 값은 키 삽입 순서와 무관하게 같은 문자열을 낸다(digest·캐시 키용).
 *
 * 규칙은 JSON.stringify와 같되 객체 키만 정렬한다:
 * - undefined/함수/symbol 값은 객체에서 생략, 배열에서는 null
 * - NaN/±Infinity → null
 * - toJSON이 있으면(Date 등) 그 결과를 쓴다
 * - TypedArray는 숫자 배열로 직렬화한다
 * - bigint는 JSON과 같이 TypeError
 */
function isTypedArray(value: unknown): value is ArrayLike<number> {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function serialize(value: unknown, inArray: boolean): string | undefined {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      return Number.isFinite(value) ? String(value) : "null";
    case "boolean":
      return value ? "true" : "false";
    case "bigint":
      throw new TypeError("stableStringify는 bigint를 직렬화하지 않습니다.");
    case "undefined":
    case "function":
    case "symbol":
      return inArray ? "null" : undefined;
    default:
      break;
  }
  const withToJson = value as { toJSON?: (key: string) => unknown };
  if (typeof withToJson.toJSON === "function") {
    return serialize(withToJson.toJSON(""), inArray);
  }
  if (isTypedArray(value)) {
    return `[${Array.from(value, (n) => (Number.isFinite(n) ? String(n) : "null")).join(",")}]`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => serialize(item, true) ?? "null").join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const serialized = serialize(record[key], false);
    if (serialized !== undefined) parts.push(`${JSON.stringify(key)}:${serialized}`);
  }
  return `{${parts.join(",")}}`;
}

/** 최상위가 undefined/함수이면 "null"을 돌려준다(항상 문자열 반환). */
export function stableStringify(value: unknown): string {
  return serialize(value, true) ?? "null";
}
