// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { resolveStudioRoute } from "./studio-route-manifest";
import { StudioRoutePlaceholder } from "./StudioRouteFallbacks";

afterEach(cleanup);

function renderPlaceholder(placeholderId: Parameters<typeof StudioRoutePlaceholder>[0]["placeholderId"]) {
  render(
    <MemoryRouter>
      <StudioRoutePlaceholder placeholderId={placeholderId} onOpenStudio={() => undefined} />
    </MemoryRouter>
  );
}

describe("Studio collaboration route gateways", () => {
  // The review / join / present / versions / projects / share routes used to render a
  // placeholder "entry guide" here. They are now real production surfaces owned by
  // studio-production, and resolveProduction runs before resolvePlaceholder, so the
  // guide is no longer the destination for them. The capability moved rather than
  // disappeared - these assertions pin that, so a regression back to a dead-end
  // placeholder fails the suite.
  it.each(["review", "join", "present", "versions", "projects", "share"] as const)(
    "routes /studio/%s to a real production surface rather than a placeholder guide",
    (surface) => {
      const resolution = resolveStudioRoute({ pathname: `/studio/${surface}`, search: "" });
      expect(resolution.kind).toBe("production");
      expect(resolution).toMatchObject({ surface, ownsDocumentTitle: true });
    }
  );

  it("keeps non-collaboration asset guidance outside the collaboration gateway contract", () => {
    renderPlaceholder("assets");

    expect(document.querySelector("[data-studio-collaboration-gateway]")).toBeNull();
    expect(screen.getByRole("button", { name: "에셋을 사용할 Studio 열기" })).toBeTruthy();
  });

  it("still resolves /studio/assets to the placeholder guide", () => {
    expect(resolveStudioRoute({ pathname: "/studio/assets", search: "" })).toMatchObject({
      kind: "placeholder",
      placeholderId: "assets",
    });
  });
});
