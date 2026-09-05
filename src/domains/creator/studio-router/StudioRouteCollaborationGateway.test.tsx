// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

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
  it("turns review dead ends into a three-step, permission-preserving entry guide", () => {
    renderPlaceholder("review");

    expect(document.querySelector('[data-studio-collaboration-gateway="review"]')).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("리뷰");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "리뷰가 연결된 Studio 열기" })).toBeTruthy();
    expect(screen.getByText(/서버 앵커 댓글/u)).toBeTruthy();
  });

  it("keeps non-collaboration asset guidance outside the collaboration gateway contract", () => {
    renderPlaceholder("assets");

    expect(document.querySelector("[data-studio-collaboration-gateway]")).toBeNull();
    expect(screen.getByRole("button", { name: "에셋을 사용할 Studio 열기" })).toBeTruthy();
  });
});
