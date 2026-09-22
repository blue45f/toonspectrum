// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { StudioMarketplaceReturnNotice } from "./StudioMarketplaceReturnNotice";

afterEach(cleanup);

describe("Studio marketplace return notice", () => {
  it("offers the exact public resource after a Market to Studio reload", () => {
    render(
      <MemoryRouter initialEntries={[
        "/studio/canvas?assetMarket=community&marketReturn=%2Fmarket%2Fresource%2Fresource-1",
      ]}>
        <StudioMarketplaceReturnNotice />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: /원래 리소스로 돌아가기|original marketplace resource/ });
    expect(link.getAttribute("href")).toBe("/market/resource/resource-1");
  });

  it.each([
    "https%3A%2F%2Fevil.test%2Fmarket%2Fresource%2Fx",
    "%2Fmarket%2Fresource%2Fx%3Ftoken%3Dsecret",
    "%2Ffortune",
  ])("does not render an unsafe return target: %s", (marketReturn) => {
    render(
      <MemoryRouter initialEntries={["/studio/canvas?marketReturn=" + marketReturn]}>
        <StudioMarketplaceReturnNotice />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: /원래 리소스로 돌아가기|original marketplace resource/ }))
      .toBeNull();
  });
});
