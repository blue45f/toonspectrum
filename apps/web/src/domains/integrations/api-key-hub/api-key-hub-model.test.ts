import { describe, expect, it } from "vitest";

import {
  EMPTY_AI_CONFIGURATION,
  type UserAiConfiguration,
} from "@/shared/ai/user-ai-types";

import {
  API_KEY_MASK_VISIBLE_TAIL,
  apiKeyExpiryLabel,
  apiKeyExpiryStatus,
  maskApiKey,
  summarizeAiKeyStatus,
  validateApiKeyFormat,
} from "./api-key-hub-model";

describe("apiKeyExpiryStatus", () => {
  const now = new Date("2026-09-30T00:00:00Z");

  it("만료일이 없으면 null을 반환한다", () => {
    expect(apiKeyExpiryStatus(null, now)).toBeNull();
    expect(apiKeyExpiryStatus(undefined, now)).toBeNull();
    expect(apiKeyExpiryStatus("", now)).toBeNull();
  });

  it("잘못된 날짜는 null을 반환한다", () => {
    expect(apiKeyExpiryStatus("not-a-date", now)).toBeNull();
  });

  it("지난 만료일은 expired다", () => {
    expect(apiKeyExpiryStatus("2026-09-01T00:00:00Z", now)).toBe("expired");
  });

  it("7일 이내 만료는 expiring_soon이다", () => {
    expect(apiKeyExpiryStatus("2026-10-06T00:00:00Z", now)).toBe("expiring_soon");
    expect(apiKeyExpiryStatus("2026-10-07T00:00:00Z", now)).toBe("expiring_soon");
  });

  it("7일보다 많이 남은 만료는 ok다", () => {
    expect(apiKeyExpiryStatus("2026-10-08T00:00:00Z", now)).toBe("ok");
    expect(apiKeyExpiryStatus("2027-01-01T00:00:00Z", now)).toBe("ok");
  });
});

describe("apiKeyExpiryLabel", () => {
  it("null 상태는 null 라벨이다", () => {
    expect(apiKeyExpiryLabel(null, "2026-10-01T00:00:00Z", true)).toBeNull();
  });

  it("한글·영문 라벨을 만든다", () => {
    expect(apiKeyExpiryLabel("expired", "2026-09-01T00:00:00Z", true)).toBe("만료됨 (2026-09-01)");
    expect(apiKeyExpiryLabel("expiring_soon", "2026-10-05T00:00:00Z", false)).toBe("Expiring soon (2026-10-05)");
    expect(apiKeyExpiryLabel("ok", "2027-01-01T00:00:00Z", true)).toBe("만료일 2027-01-01");
  });
});

describe("maskApiKey", () => {
  it("마지막 4자만 노출하고 나머지를 마스킹한다", () => {
    expect(maskApiKey("sk-test-abcdefwxyz")).toBe("••••wxyz");
  });

  it("빈 키는 빈 문자열을 반환한다", () => {
    expect(maskApiKey("")).toBe("");
    expect(maskApiKey("   ")).toBe("");
  });

  it("4자 이하 키는 전부 마스킹한다", () => {
    expect(maskApiKey("abcd")).toBe("••••");
    expect(maskApiKey("ab")).toBe("••");
  });

  it("앞뒤 공백을 제거하고 마스킹한다", () => {
    expect(maskApiKey("  secret-key-1234  ")).toBe("••••1234");
  });

  it("마스킹 노출 길이는 상수 4와 일치한다", () => {
    expect(API_KEY_MASK_VISIBLE_TAIL).toBe(4);
  });
});

describe("validateApiKeyFormat", () => {
  it("빈 입력은 empty를 반환한다", () => {
    expect(validateApiKeyFormat("")).toBe("empty");
    expect(validateApiKeyFormat("   ")).toBe("empty");
  });

  it("너무 짧은 입력은 too_short를 반환한다", () => {
    expect(validateApiKeyFormat("abc")).toBe("too_short");
  });

  it("형식이 맞으면 null을 반환한다", () => {
    expect(validateApiKeyFormat("sk-valid-key-12345")).toBeNull();
  });
});

describe("summarizeAiKeyStatus", () => {
  it("빈 설정은 0개 연결로 요약한다", () => {
    const summary = summarizeAiKeyStatus(EMPTY_AI_CONFIGURATION);
    expect(summary.configuredConnections).toBe(0);
    expect(summary.totalConnections).toBe(0);
    expect(summary.connectionLabels).toEqual([]);
  });

  it("키가 등록된 연결만 집계하고 키 값을 포함하지 않는다", () => {
    const configuration: UserAiConfiguration = {
      ...EMPTY_AI_CONFIGURATION,
      connections: [
        {
          id: "conn-1",
          label: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: "sk-secret-value-9999",
          textModel: "openrouter/free",
          imageModel: "",
          imageGenerationPath: "/images/generations",
          imageEditPath: "/images/edits",
          chatCompletionsPath: "/chat/completions",
          costPolicy: "openrouter-free",
          enabled: true,
        },
        {
          id: "conn-2",
          label: "미설정 연결",
          baseUrl: "https://example.com",
          apiKey: "",
          textModel: "",
          imageModel: "",
          imageGenerationPath: "/images/generations",
          imageEditPath: "/images/edits",
          chatCompletionsPath: "/chat/completions",
          costPolicy: "openrouter-free",
        },
      ],
      assignments: {
        text: "conn-1",
        image: null,
        inference: null,
        "three-d": null,
      },
    };
    const summary = summarizeAiKeyStatus(configuration);
    expect(summary.configuredConnections).toBe(1);
    expect(summary.totalConnections).toBe(2);
    expect(summary.connectionLabels).toEqual(["OpenRouter"]);
    expect(summary.coveredCapabilities).toEqual(["text"]);
    // 키 값이 요약에 포함되지 않는지 확인
    expect(JSON.stringify(summary)).not.toContain("sk-secret-value-9999");
  });
});
