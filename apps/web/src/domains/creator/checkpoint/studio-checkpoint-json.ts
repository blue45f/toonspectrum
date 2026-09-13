/** Canonical snapshots use undefined optional object properties; omit only those absent fields.
 * Never stringify away binary data, accessors, sparse arrays, cycles or non-finite numbers.
 */
export function projectStudioCheckpointJson(value: unknown): unknown {
  const ancestors = new Set<object>();
  function visit(current: unknown, depth: number): unknown {
    if (depth > 256) throw new Error("안전한 복구 지점의 최대 문서 깊이를 초과했습니다.");
    if (current === null || typeof current === "string" || typeof current === "boolean") return current;
    if (typeof current === "number" && Number.isFinite(current) && !Object.is(current, -0)) return current;
    if (!current || typeof current !== "object" || ancestors.has(current)) {
      throw new Error("안전한 복구 지점에 저장할 수 없는 데이터 형식입니다.");
    }
    const array = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    const keys = Object.keys(current);
    if ((array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(current).length > 0
      || Object.getOwnPropertyNames(current).length !== keys.length + (array ? 1 : 0)
      || (array && (keys.length !== current.length || keys.some((key, index) => key !== String(index))))) {
      throw new Error("안전한 복구 지점에서 지원하지 않는 구조화 데이터입니다.");
    }
    ancestors.add(current);
    try {
      const result: Record<string, unknown> | unknown[] = array ? [] : Object.create(null);
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !("value" in descriptor)) throw new Error("안전한 복구 지점은 접근자 속성을 저장하지 않습니다.");
        if (!array && descriptor.value === undefined) continue;
        Object.defineProperty(result, key, {
          value: visit(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true,
        });
      }
      return result;
    } finally { ancestors.delete(current); }
  }
  return visit(value, 0);
}
