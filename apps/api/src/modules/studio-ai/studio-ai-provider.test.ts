import { describe, expect, it } from "vitest";

import {
  classifyStudioAiProviderFailure,
  resolveStudioAiProviderCandidates,
  resolveStudioAiProviderOrder,
  resolveStudioAiProviders,
  resolveStudioAiTimeoutMs,
  STUDIO_AI_BILLING_FAILOVER_REASON,
  studioAiProviderBusinessCode,
  studioAiProviderRequestId,
  studioAiProviderStatuses,
} from "./studio-ai-provider";

describe("Studio AI provider resolution", () => {
  const env = {
    ZAI_API_KEY: "zai-test-key",
    ZAI_MODEL: "glm-5.1",
    DEEPSEEK_API_KEY: "deepseek-test-key",
    DEEPSEEK_MODEL: "deepseek-test-model",
    OPENROUTER_API_KEY: "openrouter-test-key",
    OPENROUTER_MODEL: "stealth/ox-alpha",
  };

  it("auto는 중복을 제거한 설정 순서로 구성된 제공자만 반환한다", () => {
    expect(resolveStudioAiProviderOrder({ ...env, STUDIO_AI_PROVIDER_ORDER: "deepseek,zai,openrouter,deepseek" }))
      .toEqual(["deepseek", "zai", "openrouter"]);
    expect(resolveStudioAiProviders("auto", { ...env, STUDIO_AI_PROVIDER_ORDER: "openrouter,deepseek,zai" }))
      .toMatchObject([
        { id: "openrouter", model: "stealth/ox-alpha" },
        { id: "deepseek", model: "deepseek-test-model" },
        { id: "zai", model: "glm-5.1" },
      ]);
    expect(resolveStudioAiProviderOrder({ ...env, STUDIO_AI_PROVIDER_ORDER: "deepseek" }))
      .toEqual(["deepseek", "zai", "openrouter"]);
  });

  it("명시적 선택은 다른 제공자로 자동 전환하지 않는다", () => {
    expect(resolveStudioAiProviders("zai", env).map(({ id }) => id)).toEqual(["zai"]);
    expect(resolveStudioAiProviders("openrouter", env).map(({ id }) => id)).toEqual(["openrouter"]);
    expect(resolveStudioAiProviders("zai", { DEEPSEEK_API_KEY: "only-deepseek" })).toEqual([]);
  });

  it("명시적 선택 후보는 선택 제공자를 우선하고 결제 거절용 보조 제공자를 뒤에 둔다", () => {
    expect(resolveStudioAiProviderCandidates("zai", {
      ...env,
      STUDIO_AI_PROVIDER_ORDER: "deepseek,zai,openrouter",
    }).map(({ id }) => id)).toEqual(["zai", "deepseek", "openrouter"]);
    expect(resolveStudioAiProviderCandidates("openrouter", {
      ...env,
      STUDIO_AI_PROVIDER_ORDER: "zai,deepseek,openrouter",
    }).map(({ id }) => id)).toEqual(["openrouter", "zai", "deepseek"]);
    expect(resolveStudioAiProviderCandidates("zai", {
      DEEPSEEK_API_KEY: "only-deepseek",
    })).toEqual([]);
  });

  it("상태에는 키 없이 제공자별 설정 여부와 모델만 노출한다", () => {
    const status = studioAiProviderStatuses(env);
    expect(status).toMatchObject([
      { id: "zai", configured: true, model: "glm-5.1" },
      { id: "deepseek", configured: true, model: "deepseek-test-model" },
      { id: "openrouter", configured: true, model: "stealth/ox-alpha" },
    ]);
    expect(JSON.stringify(status)).not.toContain("test-key");
  });

  it("공통 timeout을 우선하고 제공자 request ID를 제한해 추출한다", () => {
    expect(resolveStudioAiTimeoutMs("zai", { ZAI_TIMEOUT_MS: "6000" })).toBe(6000);
    expect(resolveStudioAiTimeoutMs("zai", { ZAI_TIMEOUT_MS: "6000", STUDIO_AI_TIMEOUT_MS: "7000" }))
      .toBe(7000);
    expect(studioAiProviderRequestId({ request_id: " req-1 " })).toBe("req-1");
    expect(studioAiProviderRequestId({ id: "fallback-id" })).toBe("fallback-id");
  });

  it("DeepSeek 402만 명백한 잔액 소진으로 분류하고 429·인증·5xx는 전환하지 않는다", () => {
    expect(classifyStudioAiProviderFailure("deepseek", 402)).toEqual({
      kind: STUDIO_AI_BILLING_FAILOVER_REASON,
      billingFailoverEligible: true,
    });
    expect(classifyStudioAiProviderFailure("deepseek", 429)).toMatchObject({
      kind: "rate_limited",
      billingFailoverEligible: false,
    });
    expect(classifyStudioAiProviderFailure("deepseek", 401)).toMatchObject({
      kind: "authentication",
      billingFailoverEligible: false,
    });
    expect(classifyStudioAiProviderFailure("deepseek", 503)).toMatchObject({
      kind: "provider_unavailable",
      billingFailoverEligible: false,
    });
  });

  it.each(["1113", "1304", "1308", "1309", "1310"])(
    "Z.ai 429 business code %s는 계정 결제·패키지 한도 소진으로 분류한다",
    (code) => {
      expect(classifyStudioAiProviderFailure("zai", 429, {
        error: { code, message: "must never be surfaced" },
      })).toEqual({
        kind: STUDIO_AI_BILLING_FAILOVER_REASON,
        billingFailoverEligible: true,
        businessCode: code,
      });
    }
  );

  it.each(["1302", "1303", "1305", "1312"])(
    "Z.ai 429 business code %s는 속도·혼잡 응답이므로 결제 전환 대상이 아니다",
    (code) => {
      expect(classifyStudioAiProviderFailure("zai", 429, { code })).toEqual({
        kind: "rate_limited",
        billingFailoverEligible: false,
        businessCode: code,
      });
    }
  );

  it("Z.ai는 코드가 없거나 잘못된 HTTP 상태면 잔액 문구만으로 전환하지 않는다", () => {
    expect(classifyStudioAiProviderFailure("zai", 429, {
      error: { message: "1113 insufficient balance" },
    })).toMatchObject({ kind: "rate_limited", billingFailoverEligible: false });
    expect(classifyStudioAiProviderFailure("zai", 500, {
      error: { code: 1113 },
    })).toMatchObject({
      kind: "provider_unavailable",
      billingFailoverEligible: false,
      businessCode: "1113",
    });
  });

  it("business code만 제한적으로 추출하고 원문 메시지나 비정상 코드는 사용하지 않는다", () => {
    expect(studioAiProviderBusinessCode({ error: { error_code: 1113, message: "secret" } }))
      .toBe("1113");
    expect(studioAiProviderBusinessCode({ code: " 1308 " })).toBe("1308");
    expect(studioAiProviderBusinessCode({ code: "1113-secret" })).toBeUndefined();
    expect(studioAiProviderBusinessCode({ message: "1113" })).toBeUndefined();
  });
});
