import { afterEach, describe, expect, it } from "vitest";

import { isInvalidTossAuthorizationResponse, isTossLoginConfigured } from "../server/toss-login";

const originalEnv = {
  TOSS_MTLS_CERT: process.env.TOSS_MTLS_CERT,
  TOSS_MTLS_KEY: process.env.TOSS_MTLS_KEY,
  TOSS_MTLS_CERT_PATH: process.env.TOSS_MTLS_CERT_PATH,
  TOSS_MTLS_KEY_PATH: process.env.TOSS_MTLS_KEY_PATH,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Toss login server exchange", () => {
  it("recognizes the documented flat invalid_grant response", () => {
    expect(isInvalidTossAuthorizationResponse({ error: "invalid_grant" })).toBe(true);
  });

  it("recognizes the current HTTP 200 FAIL envelope returned by Toss", () => {
    expect(
      isInvalidTossAuthorizationResponse({
        resultType: "FAIL",
        error: {
          errorCode: "OAUTH_ISSUE_TOKEN_ERROR",
          reason: "400 BAD_REQUEST : invalid_grant. authorization_code가 만료됐습니다.",
        },
      }),
    ).toBe(true);
  });

  it("does not mistake an unrelated upstream failure for an expired authorization code", () => {
    expect(
      isInvalidTossAuthorizationResponse({
        resultType: "FAIL",
        error: { errorCode: "INTERNAL_ERROR", reason: "요청 처리 중 오류가 발생했습니다." },
      }),
    ).toBe(false);
  });

  it("rejects non-PEM values instead of reporting Toss login as configured", () => {
    process.env.TOSS_MTLS_CERT = "not-a-certificate";
    process.env.TOSS_MTLS_KEY = "not-a-private-key";
    delete process.env.TOSS_MTLS_CERT_PATH;
    delete process.env.TOSS_MTLS_KEY_PATH;

    expect(isTossLoginConfigured()).toBe(false);
  });
});
