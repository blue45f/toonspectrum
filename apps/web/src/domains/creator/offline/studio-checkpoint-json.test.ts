import { describe, expect, it, vi } from "vitest";

import { projectStudioCheckpointJson } from "../checkpoint/studio-checkpoint-json";

describe("checkpoint optional snapshot fields", () => {
  it("omits absent object fields without mutating the snapshot", () => {
    const input = { version: 12, master: undefined, linkedTitleId: undefined,
      pagesList: [{ id: "page-1", review: undefined, elements: [] }] };
    const result = projectStudioCheckpointJson(input);
    expect(result).toEqual({ version: 12, pagesList: [{ id: "page-1", elements: [] }] });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Object.hasOwn(input, "master")).toBe(true);
  });
  it.each([new Blob(["pixels"]), new Map(), new Set(), new Date(), BigInt(1), Infinity, NaN, -0,
    () => 1, Symbol("data"), [undefined], Array(1)])("rejects unrepresentable content %#", (value) => {
    expect(() => projectStudioCheckpointJson({ value })).toThrow(/안전한 복구 지점/);
  });
  it("never evaluates accessors", () => {
    const getter = vi.fn(() => "value");
    const input = Object.defineProperty({}, "payload", { enumerable: true, get: getter });
    expect(() => projectStudioCheckpointJson(input)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it("rejects cycles but permits shared non-cyclic objects", () => {
    const nested: Record<string, unknown> = { value: 1 }; nested.self = nested;
    expect(() => projectStudioCheckpointJson(nested)).toThrow();
    const shared = { value: 1 };
    expect(projectStudioCheckpointJson({ a: shared, b: shared })).toEqual({ a: shared, b: shared });
  });
  it("rejects hidden metadata and undefined array slots", () => {
    expect(() => projectStudioCheckpointJson(Object.defineProperty({}, "hidden", { value: 1 }))).toThrow();
    expect(() => projectStudioCheckpointJson({ [Symbol("data")]: 1 })).toThrow();
    expect(() => projectStudioCheckpointJson([1, undefined, 2])).toThrow();
    expect(() => projectStudioCheckpointJson(undefined)).toThrow();
  });
});
