import { describe, expect, it } from "vitest";

import { resolveStudioFilterVerificationMode } from "./studio-filter-verification-mode";

const auth = { TOONSPECTRUM_FILTER_DIALOG_AUTHENTICATED: "1" };
const local = { TOONSPECTRUM_FILTER_DIALOG_LOCAL_ONLY: "1" };
const denial = { TOONSPECTRUM_FILTER_DIALOG_EXPECT_DENIAL: "1" };

describe("필터 검증 권위 분리", () => {
  it("일반 미리보기를 정본 검증으로 보고하지 않는다", () => {
    expect(resolveStudioFilterVerificationMode({})).toEqual({
      authenticated: false, localOnly: false, expectDenial: false, authority: "external-or-static",
    });
  });
  it("로컬 성공과 정본 성공을 서로 다른 권위로 기록한다", () => {
    expect(resolveStudioFilterVerificationMode(local).authority).toBe("owned-static-local");
    expect(resolveStudioFilterVerificationMode(auth).authority).toBe("authenticated-canonical");
  });
  it("인증된 거절은 연결 단절 검증을 유지한다", () => {
    expect(resolveStudioFilterVerificationMode({ ...auth, ...denial })).toEqual({
      authenticated: true, localOnly: false, expectDenial: true, authority: "authenticated-disconnected-denial",
    });
  });
  it.each([denial, { ...local, ...denial }])("미인증 거절을 로컬 성공으로 치환하지 않는다: %j", (env) => {
    expect(() => resolveStudioFilterVerificationMode(env)).toThrow(/실제 인증/u);
  });
  it.each([{ ...auth, ...local }, { ...auth, ...local, ...denial }])("상충하는 소유권 모드를 거절한다: %j", (env) => {
    expect(() => resolveStudioFilterVerificationMode(env)).toThrow(/별도 실행/u);
  });
  it.each([local, { ...auth, ...denial }])("외부 origin에 단절 테스트를 수행하지 않는다: %j", (env) => {
    expect(() => resolveStudioFilterVerificationMode({
      ...env, TOONSPECTRUM_VERIFY_ORIGIN: "https://www.toonstudio.cloud",
    })).toThrow(/loopback/u);
  });
  it("빈 외부 origin은 소유한 QA runtime 선택을 방해하지 않는다", () => {
    expect(resolveStudioFilterVerificationMode({
      ...auth, ...denial, TOONSPECTRUM_VERIFY_ORIGIN: "  ",
    }).authority).toBe("authenticated-disconnected-denial");
  });
});
