import { describe, expect, it } from "vitest";

import { stableStringify } from "./stable-json";

describe("shared/stable-json", () => {
  it("키를 정렬하고 중첩·배열을 보존한다", () => {
    expect(stableStringify({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: "x" } })).toBe('{"a":{"c":"x","d":[1,{"y":2,"z":1}]},"b":1}');
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("JSON.stringify와 같은 생략·null 규칙", () => {
    expect(stableStringify({ a: undefined, b: () => 1, c: Number.NaN, d: Number.POSITIVE_INFINITY })).toBe('{"c":null,"d":null}');
    expect(stableStringify([undefined, Number.NaN])).toBe("[null,null]");
    expect(stableStringify(undefined)).toBe("null");
    expect(stableStringify(new Date(0))).toBe('"1970-01-01T00:00:00.000Z"');
    expect(stableStringify(new Float32Array([1, 2]))).toBe("[1,2]");
    expect(() => stableStringify({ a: 1n })).toThrow(TypeError);
  });

  it("문자열 이스케이프는 JSON과 같다", () => {
    expect(stableStringify({ s: 'a"b\n' })).toBe('{"s":"a\\"b\\n"}');
  });
});
