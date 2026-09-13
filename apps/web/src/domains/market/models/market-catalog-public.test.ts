import { describe, expect, it } from "vitest";

import {
  isMarketPublicKeywordTag,
  isMarketQaPackageId,
  isMarketQaResource,
} from "./market-catalog-public";

describe("market catalog public helpers", () => {
  it("detects qa package ids and resource markers", () => {
    expect(isMarketQaPackageId("qa/cc0-20260913/polyhaven-sofa-02")).toBe(true);
    expect(isMarketQaPackageId("seed/brush/ink")).toBe(false);
    expect(
      isMarketQaResource({
        packageId: "qa/cc0-20260913/polyhaven-sofa-02",
        name: "[테스트] Sofa 02 · 소파",
        tags: ["QA-CC0-20260913", "CC0"],
        publisher: { id: "qa", name: "ToonStudio 에셋 QA (테스트)", avatar: null },
      }),
    ).toBe(true);
    expect(
      isMarketQaResource({
        packageId: "original/palette/noir",
        name: "느와르 팔레트",
        tags: ["야경"],
        publisher: { id: "a", name: "작가", avatar: null },
      }),
    ).toBe(false);
  });

  it("keeps discovery keywords free of QA bookkeeping labels", () => {
    expect(isMarketPublicKeywordTag("소품")).toBe(true);
    expect(isMarketPublicKeywordTag("CC0")).toBe(true);
    expect(isMarketPublicKeywordTag("QA-CC0-20260913")).toBe(false);
    expect(isMarketPublicKeywordTag("테스트 등록")).toBe(false);
    expect(isMarketPublicKeywordTag("무료")).toBe(false);
  });
});
