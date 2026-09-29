import { describe, expect, it } from "vitest";

import {
  addRegion,
  aiRegionRatio,
  buildDisclosureManifest,
  createContentCredential,
  formatDisclosureBadge,
  hasAiContent,
  listAiSources,
  parseDisclosureManifest,
  removeRegion,
  type AiContentRegion,
  type ContentCredential,
} from "./ai-content-credentials";

/** 테스트용 AI 영역 fixture. */
function aiRegion(overrides?: Partial<AiContentRegion>): AiContentRegion {
  return {
    regionId: "region-1",
    source: "generative-fill",
    toolName: "생성형 채우기",
    modelName: "toonstudio-image-1",
    createdAt: "2026-09-30T03:00:00.000Z",
    confidence: 0.95,
    ...overrides,
  };
}

/** 테스트용 사람 작업 영역 fixture. */
function humanRegion(overrides?: Partial<AiContentRegion>): AiContentRegion {
  return {
    regionId: "region-human",
    source: "human",
    toolName: "브러시",
    createdAt: "2026-09-30T03:10:00.000Z",
    ...overrides,
  };
}

function credentialWithAi(): ContentCredential {
  return addRegion(
    addRegion(createContentCredential("asset-1", "studio-web/2.4.0"), aiRegion()),
    humanRegion(),
  );
}

describe("AI 콘텐츠 자격 증명 기본 동작", () => {
  it("빈 자격 증명을 생성한다", () => {
    const credential = createContentCredential("asset-1", "studio-web/2.4.0");
    expect(credential.assetId).toBe("asset-1");
    expect(credential.regions).toEqual([]);
    expect(credential.c2paCompatible).toBe(true);
    expect(hasAiContent(credential)).toBe(false);
    expect(aiRegionRatio(credential)).toBe(0);
  });

  it("잘못된 assetId나 generator로는 생성할 수 없다", () => {
    expect(() => createContentCredential("", "studio-web/2.4.0")).toThrow("invalid-asset-id");
    expect(() => createContentCredential("asset-1", "")).toThrow("invalid-generator");
  });

  it("영역을 추가하면 AI 콘텐츠로 판별된다", () => {
    let credential = createContentCredential("asset-1", "studio-web/2.4.0");
    credential = addRegion(credential, aiRegion());
    expect(hasAiContent(credential)).toBe(true);
    expect(aiRegionRatio(credential)).toBe(1);
    expect(listAiSources(credential)).toEqual(["generative-fill"]);
  });

  it("사람 작업 영역만 있으면 AI 콘텐츠가 아니다", () => {
    const credential = addRegion(createContentCredential("asset-1", "studio-web/2.4.0"), humanRegion());
    expect(hasAiContent(credential)).toBe(false);
    expect(aiRegionRatio(credential)).toBe(0);
    expect(listAiSources(credential)).toEqual([]);
  });

  it("AI와 사람 영역이 섞이면 비율이 계산된다", () => {
    const credential = credentialWithAi();
    expect(hasAiContent(credential)).toBe(true);
    expect(aiRegionRatio(credential)).toBe(0.5);
  });

  it("같은 regionId를 다시 추가하면 병합(덮어쓰기)된다", () => {
    let credential = addRegion(createContentCredential("asset-1", "studio-web/2.4.0"), aiRegion());
    credential = addRegion(credential, aiRegion({ toolName: "AI 배경", source: "ai-background" }));
    expect(credential.regions).toHaveLength(1);
    expect(credential.regions[0].toolName).toBe("AI 배경");
    expect(credential.regions[0].source).toBe("ai-background");
  });

  it("영역을 제거할 수 있고 원본은 변경되지 않는다", () => {
    const before = addRegion(createContentCredential("asset-1", "studio-web/2.4.0"), aiRegion());
    const after = removeRegion(before, "region-1");
    expect(after.regions).toHaveLength(0);
    expect(hasAiContent(after)).toBe(false);
    // 불변성: 원본은 그대로 유지된다.
    expect(before.regions).toHaveLength(1);
  });

  it("없는 regionId를 제거해도 그대로 반환된다", () => {
    const credential = addRegion(createContentCredential("asset-1", "studio-web/2.4.0"), aiRegion());
    expect(removeRegion(credential, "no-such-region")).toBe(credential);
  });

  it("잘못된 영역은 추가할 수 없다", () => {
    const credential = createContentCredential("asset-1", "studio-web/2.4.0");
    expect(() => addRegion(credential, aiRegion({ regionId: "" }))).toThrow("invalid-region-id");
    expect(() => addRegion(credential, aiRegion({ source: "deepfake" as never }))).toThrow("invalid-source");
    expect(() => addRegion(credential, aiRegion({ toolName: "" }))).toThrow("invalid-tool-name");
    expect(() => addRegion(credential, aiRegion({ createdAt: "어제" }))).toThrow("invalid-created-at");
    expect(() => addRegion(credential, aiRegion({ confidence: 1.5 }))).toThrow("invalid-confidence");
    expect(() => addRegion(credential, aiRegion({ confidence: -0.1 }))).toThrow("invalid-confidence");
  });
});

describe("공개 명세(manifest) 생성과 파싱", () => {
  it("영역 추가→병합→manifest 전파가 유지된다", () => {
    let credential = createContentCredential("asset-1", "studio-web/2.4.0");
    credential = addRegion(credential, aiRegion());
    credential = addRegion(credential, aiRegion({ regionId: "region-1", toolName: "생성형 채우기 v2" }));
    credential = addRegion(credential, humanRegion());

    const manifestText = buildDisclosureManifest(credential);
    const manifest = JSON.parse(manifestText);
    expect(manifest.format).toBe("toonstudio/content-credentials");
    expect(manifest.version).toBe(1);
    expect(manifest.asset_id).toBe("asset-1");
    expect(manifest.disclosure.show_ai_disclosure).toBe(true);
    const labels = manifest.assertions.map((assertion: { label: string }) => assertion.label);
    expect(labels).toContain("c2pa.actions");
    expect(labels).toContain("toonstudio.ai-regions");
    expect(labels).toContain("toonstudio.ai-summary");
    // 병합된 최신 값이 manifest에 반영된다.
    const regionsAssertion = manifest.assertions.find(
      (assertion: { label: string }) => assertion.label === "toonstudio.ai-regions",
    );
    expect(regionsAssertion.data.regions).toHaveLength(2);
    expect(regionsAssertion.data.regions[0].toolName).toBe("생성형 채우기 v2");
  });

  it("manifest 파싱 라운드트립이 원본과 동일하다", () => {
    const credential = credentialWithAi();
    const { credential: restored, showAiDisclosure } = parseDisclosureManifest(
      buildDisclosureManifest(credential),
    );
    expect(restored).toEqual(credential);
    expect(showAiDisclosure).toBe(true);
  });

  it("AI 표시 옵션을 끈 manifest도 데이터는 보존된다", () => {
    const credential = credentialWithAi();
    const manifestText = buildDisclosureManifest(credential, { showAiDisclosure: false });
    expect(JSON.parse(manifestText).disclosure.show_ai_disclosure).toBe(false);
    const { credential: restored, showAiDisclosure } = parseDisclosureManifest(manifestText);
    expect(restored).toEqual(credential);
    expect(showAiDisclosure).toBe(false);
  });

  it("빈 영역 목록도 manifest로 만들고 파싱할 수 있다", () => {
    const credential = createContentCredential("asset-1", "studio-web/2.4.0");
    const { credential: restored } = parseDisclosureManifest(buildDisclosureManifest(credential));
    expect(restored.regions).toEqual([]);
    expect(hasAiContent(restored)).toBe(false);
  });

  it.each([
    ["빈 문자열", ""],
    ["JSON이 아님", "not-json"],
    ["잘못된 포맷", JSON.stringify({ format: "other/format", version: 1 })],
    [
      "지원하지 않는 버전",
      JSON.stringify({ format: "toonstudio/content-credentials", version: 2 }),
    ],
    [
      "asset_id 누락",
      JSON.stringify({
        format: "toonstudio/content-credentials",
        version: 1,
        generator: "g",
        generated_at: "2026-09-30T03:00:00.000Z",
        c2pa_compatible: true,
        disclosure: { show_ai_disclosure: true },
        assertions: [],
      }),
    ],
    [
      "ai-regions assertion 누락",
      JSON.stringify({
        format: "toonstudio/content-credentials",
        version: 1,
        asset_id: "a",
        generator: "g",
        generated_at: "2026-09-30T03:00:00.000Z",
        c2pa_compatible: true,
        disclosure: { show_ai_disclosure: true },
        assertions: [],
      }),
    ],
    [
      "알 수 없는 소스",
      JSON.stringify({
        format: "toonstudio/content-credentials",
        version: 1,
        asset_id: "a",
        generator: "g",
        generated_at: "2026-09-30T03:00:00.000Z",
        c2pa_compatible: true,
        disclosure: { show_ai_disclosure: true },
        assertions: [
          {
            label: "toonstudio.ai-regions",
            data: {
              regions: [
                {
                  regionId: "r1",
                  source: "deepfake",
                  toolName: "t",
                  createdAt: "2026-09-30T03:00:00.000Z",
                },
              ],
            },
          },
        ],
      }),
    ],
    [
      "중복된 regionId",
      JSON.stringify({
        format: "toonstudio/content-credentials",
        version: 1,
        asset_id: "a",
        generator: "g",
        generated_at: "2026-09-30T03:00:00.000Z",
        c2pa_compatible: true,
        disclosure: { show_ai_disclosure: true },
        assertions: [
          {
            label: "toonstudio.ai-regions",
            data: {
              regions: [
                { regionId: "r1", source: "human", toolName: "t", createdAt: "2026-09-30T03:00:00.000Z" },
                { regionId: "r1", source: "human", toolName: "t", createdAt: "2026-09-30T03:00:00.000Z" },
              ],
            },
          },
        ],
      }),
    ],
    [
      "범위를 벗어난 confidence",
      JSON.stringify({
        format: "toonstudio/content-credentials",
        version: 1,
        asset_id: "a",
        generator: "g",
        generated_at: "2026-09-30T03:00:00.000Z",
        c2pa_compatible: true,
        disclosure: { show_ai_disclosure: true },
        assertions: [
          {
            label: "toonstudio.ai-regions",
            data: {
              regions: [
                {
                  regionId: "r1",
                  source: "ai-upscale",
                  toolName: "t",
                  createdAt: "2026-09-30T03:00:00.000Z",
                  confidence: 2,
                },
              ],
            },
          },
        ],
      }),
    ],
  ])("잘못된 manifest(%s)는 거부된다", (_label, text) => {
    expect(() => parseDisclosureManifest(text)).toThrow();
  });

  it("위험한 키(__proto__)가 포함된 manifest는 거부된다", () => {
    const manifest = JSON.parse(buildDisclosureManifest(credentialWithAi()));
    const tampered = JSON.stringify(manifest).replace('"asset_id"', '"__proto__"');
    expect(() => parseDisclosureManifest(tampered)).toThrow("unsafe-manifest-key");
  });
});

describe("뷰어 뱃지 표시", () => {
  it("AI 콘텐츠가 있으면 ko/en 뱃지 텍스트를 반환한다", () => {
    const credential = credentialWithAi();
    expect(formatDisclosureBadge(credential, "ko")).toBe("AI 생성 포함");
    expect(formatDisclosureBadge(credential, "en")).toBe("AI-generated");
    // 기본 로케일은 한국어다.
    expect(formatDisclosureBadge(credential)).toBe("AI 생성 포함");
  });

  it("AI 콘텐츠가 없으면 뱃지를 표시하지 않는다", () => {
    const credential = addRegion(createContentCredential("asset-1", "studio-web/2.4.0"), humanRegion());
    expect(formatDisclosureBadge(credential, "ko")).toBe("");
    expect(formatDisclosureBadge(createContentCredential("asset-1", "studio-web/2.4.0"), "en")).toBe("");
  });

  it("표시 토글을 끄면 AI 콘텐츠가 있어도 뱃지를 표시하지 않는다", () => {
    const credential = credentialWithAi();
    expect(formatDisclosureBadge(credential, "ko", { showDisclosure: false })).toBe("");
    expect(formatDisclosureBadge(credential, "en", { showDisclosure: false })).toBe("");
  });
});
