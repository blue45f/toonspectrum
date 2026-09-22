// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { CampusContext } from "@/shared/components/spatial-campus/campus-context";
import { campusDistrict } from "@/shared/lib/spatial-campus/campus-model";
import { useMarketStudioHandoff } from "./use-market-studio-handoff";
import { describe, expect, it, vi } from "vitest";

function Probe() {
  const handoff = useMarketStudioHandoff({ id: "asset-A", kind: "asset", resourceVersion: "1.0.0" });
  return <output data-testid="href">{handoff.href}</output>;
}

describe("useMarketStudioHandoff", () => {
  it("targets the exact owner-scoped Studio document remembered by the campus", () => {
    render(
      <CampusContext.Provider value={{
        binding: { routeId: "market-resource", districtId: "market", surface: "room", private: false },
        district: campusDistrict("market"),
        mode: "task",
        returnHref: "/studio/p/project-A/d/document-B?pageId=page-C",
        setMode: vi.fn(),
      }}>
        <Probe />
      </CampusContext.Provider>,
    );
    const href = new URL(screen.getByTestId("href").textContent!, "https://example.test");
    expect(href.pathname).toBe("/studio/p/project-A/d/document-B");
    expect(href.searchParams.get("pageId")).toBe("page-C");
    expect(href.searchParams.get("installMarketResource")).toBe("asset-A");
    expect(href.searchParams.get("marketReturn")).toBe("/market/resource/asset-A");
  });
});
