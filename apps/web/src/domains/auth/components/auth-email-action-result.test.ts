import { describe, expect, it } from "vitest";

import { AUTH_EMAIL_ACTION_UNAVAILABLE, AUTH_EMAIL_ACTION_UNCONFIRMED, resolveAuthEmailActionResult } from "./auth-email-action-result";

describe("가입·인증 메일 응답 검증", () => {
  it.each([500, 502, 503, 504])("%s 오류는 성공이나 입력 오류로 표시하지 않는다", (status) => {
    expect(resolveAuthEmailActionResult(status, { error: "internal provider details" }, "signup"))
      .toEqual({ ok: false, message: AUTH_EMAIL_ACTION_UNAVAILABLE });
  });
  it.each([null, "<html>error</html>", [], {}, { ok: false }, { ok: true }, { verificationRequired: true }])(
    "확인되지 않은 200 가입 응답은 발송 성공으로 표시하지 않는다: %j", (payload) => {
      expect(resolveAuthEmailActionResult(200, payload, "signup"))
        .toEqual({ ok: false, message: AUTH_EMAIL_ACTION_UNCONFIRMED });
    },
  );
  it("확인된 가입·메일 응답만 성공으로 표시한다", () => {
    expect(resolveAuthEmailActionResult(201, { ok: true, verificationRequired: true, message: "가입 확인 메일을 확인해 주세요." }, "signup"))
      .toEqual({ ok: true, message: "가입 확인 메일을 확인해 주세요." });
    expect(resolveAuthEmailActionResult(200, { ok: true }, "email").ok).toBe(true);
  });
  it("요청 제한을 설명하고 안전한 입력 오류만 보여준다", () => {
    expect(resolveAuthEmailActionResult(429, null, "email").message).toContain("잠시 제한");
    expect(resolveAuthEmailActionResult(400, { error: "이메일 형식 확인" }, "signup").message).toBe("이메일 형식 확인");
    expect(resolveAuthEmailActionResult(400, { error: "<script>private</script>" }, "signup").message).not.toContain("private");
    expect(resolveAuthEmailActionResult(400, { error: { details: "private" } }, "signup").ok).toBe(false);
  });
});
