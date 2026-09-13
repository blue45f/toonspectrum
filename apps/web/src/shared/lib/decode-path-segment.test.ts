import { describe, expect, it } from "vitest";

import { decodePathSegment } from "./decode-path-segment";

describe("raw pathname labels", () => {
  it.each([
    ["%ED%99%8D%EA%B8%B8%EB%8F%99", "홍길동"],
    ["100%25", "100%"],
    ["a%252Fb", "a%2Fb"],
    ["hello%20world", "hello world"],
    ["a+b", "a+b"],
    ["%", "%"],
    ["%E0%A4%A", "%E0%A4%A"],
    ["%FF", "%FF"],
    ["", ""],
  ])("safely decodes %s once", (value, expected) => {
    expect(decodePathSegment(value)).toBe(expected);
  });
});
