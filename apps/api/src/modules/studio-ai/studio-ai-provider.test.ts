import { describe, expect, it } from "vitest";

import {
  classifyStudioAiProviderFailure,
  resolveStudioAiProviderCandidates,
  resolveStudioAiProviderOrder,
  resolveStudioAiProviders,
  resolveStudioAiTimeoutMs,
  STUDIO_AI_BILLING_FAILOVER_REASON,
  STUDIO_AI_FREE_QUOTA_FAILOVER_REASON,
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

  it("무료 풀은 확인된 외부 실시간 제공자만 품질 순서대로 노출한다", () => {
    const freeEnv = {
      NODE_ENV: "production",
      STUDIO_AI_FREE_POOL_ENABLED: "true",
      STUDIO_AI_FREE_PROVIDER_ORDER: "gemini,qwen,groq,sambanova,zai,mistral,cloudflare,openrouter,siliconflow",
      STUDIO_AI_FREE_GEMINI_API_KEY: "gemini-free-key",
      STUDIO_AI_FREE_GEMINI_CONFIRMED: "true",
      STUDIO_AI_FREE_QWEN_WORKSPACE_ID: "workspace_123456",
      STUDIO_AI_FREE_QWEN_API_KEY: "qwen-free-key",
      STUDIO_AI_FREE_QWEN_CONFIRMED: "true",
      STUDIO_AI_FREE_GROQ_API_KEY: "groq-free-key",
      STUDIO_AI_FREE_GROQ_CONFIRMED: "true",
      STUDIO_AI_FREE_SAMBANOVA_API_KEY: "sambanova-free-key",
      STUDIO_AI_FREE_SAMBANOVA_CONFIRMED: "true",
      STUDIO_AI_FREE_ZAI_API_KEY: "zai-free-key",
      STUDIO_AI_FREE_ZAI_CONFIRMED: "true",
      STUDIO_AI_FREE_MISTRAL_API_KEY: "mistral-free-key",
      STUDIO_AI_FREE_MISTRAL_CONFIRMED: "true",
      STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID: "00000000000000000000000000000000",
      STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN: "cloudflare-free-token",
      STUDIO_AI_FREE_CLOUDFLARE_CONFIRMED: "true",
      STUDIO_AI_FREE_OPENROUTER_API_KEY: "openrouter-free-key",
      STUDIO_AI_FREE_OPENROUTER_CONFIRMED: "true",
      STUDIO_AI_FREE_OPENROUTER_MODEL: "openrouter/free",
      STUDIO_AI_FREE_SILICONFLOW_API_KEY: "siliconflow-free-key",
      STUDIO_AI_FREE_SILICONFLOW_CONFIRMED: "true",
    };

    expect(resolveStudioAiProviders("auto", freeEnv).map(({ id, model }) => ({ id, model })))
      .toEqual([
        { id: "gemini", model: "gemini-3.8-flash" },
        { id: "qwen", model: "qwen3.7-plus" },
        { id: "groq", model: "openai/gpt-oss-120b" },
        { id: "sambanova", model: "DeepSeek-V3.1" },
        { id: "zai", model: "glm-4.7-flash" },
        { id: "mistral", model: "mistral-small-latest" },
        { id: "cloudflare", model: "@cf/qwen/qwen3-30b-a3b-fp8" },
        { id: "openrouter", model: "openrouter/free" },
        { id: "siliconflow", model: "THUDM/GLM-Z1-9B-0414" },
      ]);
    expect(resolveStudioAiProviders("auto", {
      ...freeEnv,
      STUDIO_AI_FREE_QWEN_MODEL: "qwen-paid-or-unreviewed",
      STUDIO_AI_FREE_ZAI_MODEL: "glm-5.1",
      STUDIO_AI_FREE_SILICONFLOW_MODEL: "deepseek-ai/DeepSeek-V4-Pro",
    }).map(({ id }) => id)).toEqual([
      "gemini", "groq", "sambanova", "mistral", "cloudflare", "openrouter",
    ]);
    expect(resolveStudioAiProviders("auto", {
      ...freeEnv,
      STUDIO_AI_FREE_QWEN_CONFIRMED: "false",
      STUDIO_AI_FREE_ZAI_CONFIRMED: "false",
      STUDIO_AI_FREE_SILICONFLOW_CONFIRMED: "false",
    }).map(({ id }) => id)).toEqual([
      "gemini", "groq", "sambanova", "mistral", "cloudflare", "openrouter",
    ]);
    expect(classifyStudioAiProviderFailure("qwen", 403, {
      error: { code: "AllocationQuota.FreeTierOnly", message: "redacted" },
    })).toMatchObject({
      kind: STUDIO_AI_FREE_QUOTA_FAILOVER_REASON,
      billingFailoverEligible: true,
      businessCode: "AllocationQuota.FreeTierOnly",
    });
    expect(classifyStudioAiProviderFailure("zai", 429, { code: 1304 }, true)).toMatchObject({
      kind: STUDIO_AI_FREE_QUOTA_FAILOVER_REASON,
      billingFailoverEligible: true,
    });
    expect(classifyStudioAiProviderFailure("siliconflow", 402)).toMatchObject({
      kind: STUDIO_AI_FREE_QUOTA_FAILOVER_REASON,
      billingFailoverEligible: true,
    });
    expect(classifyStudioAiProviderFailure("cloudflare", 403, {
      errors: [{ code: 5035, message: "redacted" }],
    })).toMatchObject({
      kind: STUDIO_AI_FREE_QUOTA_FAILOVER_REASON,
      billingFailoverEligible: true,
      businessCode: "5035",
    });
    expect(classifyStudioAiProviderFailure("groq", 503)).toMatchObject({
      kind: "provider_unavailable",
      billingFailoverEligible: false,
    });
    expect(classifyStudioAiProviderFailure("openrouter", 402, undefined, false)).toMatchObject({
      kind: STUDIO_AI_BILLING_FAILOVER_REASON,
      failoverReason: STUDIO_AI_BILLING_FAILOVER_REASON,
    });
  });

  it("공통 timeout을 우선하고 제공자 request ID를 제한해 추출한다", () => {
    expect(resolveStudioAiTimeoutMs("zai", { ZAI_TIMEOUT_MS: "6000" })).toBe(6000);
    expect(resolveStudioAiTimeoutMs("sambanova", {
      STUDIO_AI_FREE_POOL_ENABLED: "true",
      STUDIO_AI_FREE_SAMBANOVA_TIMEOUT_MS: "8000",
    })).toBe(8000);
    expect(resolveStudioAiTimeoutMs("mistral", {
      STUDIO_AI_FREE_POOL_ENABLED: "true",
      STUDIO_AI_FREE_MISTRAL_TIMEOUT_MS: "9000",
    })).toBe(9000);
    expect(resolveStudioAiTimeoutMs("cloudflare", {
      STUDIO_AI_FREE_POOL_ENABLED: "true",
      STUDIO_AI_FREE_CLOUDFLARE_TIMEOUT_MS: "10000",
    })).toBe(10000);
    expect(resolveStudioAiTimeoutMs("qwen", {
      STUDIO_AI_FREE_POOL_ENABLED: "true",
      STUDIO_AI_FREE_QWEN_TIMEOUT_MS: "11000",
    })).toBe(11000);
    expect(resolveStudioAiTimeoutMs("siliconflow", {
      STUDIO_AI_FREE_POOL_ENABLED: "true",
      STUDIO_AI_FREE_SILICONFLOW_TIMEOUT_MS: "12000",
    })).toBe(12000);
    expect(resolveStudioAiTimeoutMs("zai", { ZAI_TIMEOUT_MS: "6000", STUDIO_AI_TIMEOUT_MS: "7000" }))
      .toBe(7000);
    expect(studioAiProviderRequestId({ request_id: " req-1 " })).toBe("req-1");
    expect(studioAiProviderRequestId({ id: "fallback-id" })).toBe("fallback-id");
  });

  it("DeepSeek 402만 명백한 잔액 소진으로 분류하고 429·인증·5xx는 전환하지 않는다", () => {
    expect(classifyStudioAiProviderFailure("deepseek", 402)).toEqual({
      kind: STUDIO_AI_BILLING_FAILOVER_REASON,
      billingFailoverEligible: true,
      failoverReason: STUDIO_AI_BILLING_FAILOVER_REASON,
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
      }, false)).toEqual({
        kind: STUDIO_AI_BILLING_FAILOVER_REASON,
        billingFailoverEligible: true,
        failoverReason: STUDIO_AI_BILLING_FAILOVER_REASON,
        businessCode: code,
      });
    }
  );

  it.each(["1302", "1303", "1305", "1312"])(
    "Z.ai 429 business code %s는 속도·혼잡 응답이므로 결제 전환 대상이 아니다",
    (code) => {
      expect(classifyStudioAiProviderFailure("zai", 429, { code }, false)).toEqual({
        kind: "rate_limited",
        billingFailoverEligible: false,
        businessCode: code,
      });
    }
  );

  it("Z.ai는 코드가 없거나 잘못된 HTTP 상태면 잔액 문구만으로 전환하지 않는다", () => {
    expect(classifyStudioAiProviderFailure("zai", 429, {
      error: { message: "1113 insufficient balance" },
    }, false)).toMatchObject({ kind: "rate_limited", billingFailoverEligible: false });
    expect(classifyStudioAiProviderFailure("zai", 500, {
      error: { code: 1113 },
    }, false)).toMatchObject({
      kind: "provider_unavailable",
      billingFailoverEligible: false,
      businessCode: "1113",
    });
  });

  it("business code만 제한적으로 추출하고 원문 메시지나 비정상 코드는 사용하지 않는다", () => {
    expect(studioAiProviderBusinessCode({ error: { error_code: 1113, message: "secret" } }))
      .toBe("1113");
    expect(studioAiProviderBusinessCode({ code: " 1308 " })).toBe("1308");
    expect(studioAiProviderBusinessCode({ errors: [{ code: 5035 }] })).toBe("5035");
    expect(studioAiProviderBusinessCode({ error: { code: "AllocationQuota.FreeTierOnly" } }))
      .toBe("AllocationQuota.FreeTierOnly");
    expect(studioAiProviderBusinessCode({ code: "1113-secret" })).toBeUndefined();
    expect(studioAiProviderBusinessCode({ message: "1113" })).toBeUndefined();
  });
});
