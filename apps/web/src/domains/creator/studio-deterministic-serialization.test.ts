import { describe, expect, it } from "vitest";

import {
  parseStudioDeterministicJson,
  studioDeterministicContentId,
  studioDeterministicJson,
} from "./studio-deterministic-serialization";

describe("studio deterministic serialization", () => {
  it("sorts object keys recursively and normalizes negative zero", () => {
    expect(studioDeterministicJson({ z: -0, a: { y: 2, x: 1 } })).toBe(
      '{"a":{"x":1,"y":2},"z":0}',
    );
  });

  it("gives equivalent values the same local content address", () => {
    expect(studioDeterministicContentId({ b: 2, a: 1 })).toBe(
      studioDeterministicContentId({ a: 1, b: 2 }),
    );
  });

  it("rejects cycles, non-finite values and oversized payloads", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => studioDeterministicJson(cyclic)).toThrow(/cyclic/u);
    expect(() => studioDeterministicJson({ value: Number.NaN })).toThrow(/non-finite/u);
    expect(() => parseStudioDeterministicJson('"12345"', 2)).toThrow(/byte budget/u);
  });
});
