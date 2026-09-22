import { describe, expect, it } from "vitest";

import {
  marketStudioHandoff,
  marketStudioResourceHref,
} from "./market-studio-handoff";

import type { CreatorMarketplaceResourceKind } from "@/shared/lib/creator-marketplace-resource-contract";


const RESOURCE_ID = "10000000-0000-4000-8000-000000000001";

describe("market Studio handoff", () => {
  it("uses the exact installer query and a public-only return receipt", () => {
    const href = new URL(marketStudioResourceHref(RESOURCE_ID), "https://example.test");
    expect(href.pathname).toBe("/studio");
    expect(href.searchParams.get("installMarketResource")).toBe(RESOURCE_ID);
    expect(href.searchParams.get("assetMarket")).toBe("community");
    expect(href.searchParams.get("marketReturn")).toBe(`/market/resource/${RESOURCE_ID}`);

    const spaced = new URL(marketStudioResourceHref("release with spaces"), "https://example.test");
    expect(spaced.searchParams.get("installMarketResource")).toBe("release with spaces");
    expect(spaced.searchParams.get("marketReturn")).toBe("/market/resource/release%20with%20spaces");
  });

  it("targets the exact remembered Studio document but rejects widened or external targets", () => {
    const exact = new URL(
      marketStudioResourceHref(RESOURCE_ID, "/studio/p/project-A/d/document-B?pageId=page-C"),
      "https://example.test",
    );
    expect(exact.pathname).toBe("/studio/p/project-A/d/document-B");
    expect(exact.searchParams.get("pageId")).toBe("page-C");
    expect(exact.searchParams.get("installMarketResource")).toBe(RESOURCE_ID);

    for (const unsafe of [
      "https://evil.test/studio/p/project-A/d/document-B",
      "/studio/p/project-A/d/document-B?token=secret",
      "/fortune",
    ]) {
      expect(new URL(marketStudioResourceHref(RESOURCE_ID, unsafe), "https://example.test").pathname)
        .toBe("/studio");
    }
  });

  it.each<[
    CreatorMarketplaceResourceKind,
    string,
    string,
  ]>([
    ["asset", "insert-current-canvas", "현재 캔버스"],
    ["brush", "install-tool-pack", "브러시 도구"],
    ["filter", "install-tool-pack", "필터 도구"],
    ["palette", "install-tool-pack", "색상 팔레트"],
    ["template", "open-template-catalog", "장면 템플릿"],
    ["3d-preset", "open-3d-background-catalog", "3D 배경"],
    ["3d-asset", "open-3d-asset-library", "3D 모델"],
  ])("maps %s to its real Studio destination", (kind, mode, destination) => {
    const handoff = marketStudioHandoff({ id: RESOURCE_ID, kind, resourceVersion: "2.0.0" });
    expect(handoff.mode).toBe(mode);
    expect(handoff.destinationLabel).toContain(destination);
    expect(handoff.href).toContain(`installMarketResource=${RESOURCE_ID}`);
  });
  it("adapts installable tool CTAs to the verified local lifecycle", () => {
    const record = { id: RESOURCE_ID, kind: "brush" as const, resourceVersion: "2.0.0" };
    expect(marketStudioHandoff(record).actionLabel).toBe("스튜디오에 브러시 팩 설치");
    expect(marketStudioHandoff(record, "installed-current").actionLabel)
      .toBe("Studio에서 설치 관리");
    expect(marketStudioHandoff(record, "update-available").actionLabel)
      .toBe("Studio에서 v2.0.0 업데이트");
  });

});
