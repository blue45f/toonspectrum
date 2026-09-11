// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { resolveStudioAssetHubView, StudioAssetHubPage } from "./StudioAssetHubPage";

vi.mock("./StudioFrontDoorPages", () => ({
  StudioAssetsPage: () => <div>asset overview content</div>,
}));
vi.mock("@/domains/market/pages/MarketBrowsePage", () => ({
  MarketBrowsePage: () => <div>market browse content</div>,
}));
vi.mock("@/domains/market/pages/MarketCloudLibraryPage", () => ({
  MarketLibraryPage: () => <div>cloud library content</div>,
}));
vi.mock("@/domains/market/pages/MarketOwnedResourcesPage", () => ({
  MarketManagePage: () => <div>seller center content</div>,
}));

beforeEach(() => useI18n.getState().setLang("ko"));
afterEach(cleanup);

describe("StudioAssetHubPage", () => {
  it("normalizes unknown view names to the asset overview", () => {
    expect(resolveStudioAssetHubView(null)).toBe("overview");
    expect(resolveStudioAssetHubView("unknown")).toBe("overview");
    expect(resolveStudioAssetHubView("library")).toBe("library");
  });

  it("keeps project context while switching between one canonical set of asset views", () => {
    render(
      <MemoryRouter initialEntries={["/studio/assets?view=library&project=project-12"]}>
        <StudioAssetHubPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("cloud library content")).toBeTruthy();
    expect(screen.getByText("프로젝트 project-12에 연결")).toBeTruthy();
    expect(screen.getByRole("link", { name: /마켓에서 찾기/u })).toHaveAttribute(
      "href",
      "/studio/assets?project=project-12&view=market",
    );
    expect(screen.getByRole("link", { name: /내 에셋/u })).toHaveAttribute("aria-current", "page");
  });

  it("renders seller capabilities without creating a second Studio asset route", () => {
    render(
      <MemoryRouter initialEntries={["/studio/assets?view=seller"]}>
        <StudioAssetHubPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("seller center content")).toBeTruthy();
    expect(screen.getByRole("link", { name: /에셋 홈/u })).toHaveAttribute("href", "/studio/assets");
  });
});
