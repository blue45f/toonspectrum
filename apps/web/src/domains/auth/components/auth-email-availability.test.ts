import { describe, expect, it } from "vitest";
import { parseAuthEmailAvailability } from "./auth-provider-discovery";

describe("이메일 제공자 준비 응답", () => {
  it.each([null, [], {}, { email: true }, { email: { available: "false", reason: "disabled" } }, { email: { available: true, reason: "disabled" } }])("확인되지 않은 응답은 미확인으로 유지한다", (value) => {
    expect(parseAuthEmailAvailability(value)).toBeNull();
  });
  it("서버의 명시적인 준비 결과만 사용한다", () => {
    expect(parseAuthEmailAvailability({ email: { available: true, reason: "configured" } })).toBe(true);
    expect(parseAuthEmailAvailability({ email: { available: false, reason: "missing-sender" } })).toBe(false);
  });
});
