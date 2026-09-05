// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveStudioRoute } from "./studio-route-manifest";
import { StudioRoutePlaceholder } from "./StudioRouteFallbacks";

afterEach(cleanup);

describe("Studio collaboration route gateways", () => {
  it.each([
    "/studio/review",
    "/studio/work/work-1/review",
    "/studio/remix/source-1/review",
  ])("routes %s to the working review hub instead of retired placeholder guidance", (pathname) => {
    const resolution = resolveStudioRoute({ pathname, search: "", hash: "" });

    expect(resolution).toMatchObject({
      kind: "production",
      surface: "review",
      canonicalHref: pathname,
      ownsDocumentTitle: true,
    });
    expect(resolution).not.toHaveProperty("placeholderId");
  });

  it("keeps asset guidance outside the collaboration gateway and delegates its exit", () => {
    const onOpenStudio = vi.fn();
    render(
      <MemoryRouter>
        <StudioRoutePlaceholder placeholderId="assets" onOpenStudio={onOpenStudio} />
      </MemoryRouter>
    );

    expect(document.querySelector("[data-studio-collaboration-gateway]")).toBeNull();
    const openStudio = screen.getByRole("button", { name: "에셋을 사용할 Studio 열기" });
    expect(openStudio).toBeTruthy();
    fireEvent.click(openStudio);
    expect(onOpenStudio).toHaveBeenCalledTimes(1);
  });
});
