// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { StudioWorkspaceHero } from "./StudioWorkspaceHero";
import { manuscriptCompletion } from "./studio-workspace-hero-model";

describe("studio workspace hero completion model", () => {
  it("returns null when there is nothing to measure", () => {
    expect(manuscriptCompletion([])).toBeNull();
    expect(manuscriptCompletion([{ status: "trashed" }])).toBeNull();
  });

  it("counts archived manuscripts as finished", () => {
    expect(manuscriptCompletion([
      { status: "active" },
      { status: "archived" },
      { status: "archived" },
      { status: "trashed" },
    ])).toEqual({ done: 2, total: 3, ratio: 2 / 3 });
  });

  it("handles an untouched manuscript list", () => {
    expect(manuscriptCompletion([{ status: "active" }])).toEqual({ done: 0, total: 1, ratio: 0 });
  });
});

afterEach(cleanup);

describe("studio workspace hero rendering", () => {
  it("renders the one-click continue CTA as the tour target", () => {
    render(
      <MemoryRouter>
        <StudioWorkspaceHero
          project={null}
          resume={null}
          resumeActionLabel={null}
          canResume={false}
          resumeHref="/studio/new"
          allWorksHref="/studio"
          t={(ko: string) => ko}
        />
      </MemoryRouter>,
    );
    const cta = screen.getByRole("link", { name: /새 작품 만들기/ });
    expect(cta.getAttribute("data-tour-target")).toBe("continue");
    expect(cta.getAttribute("href")).toBe("/studio/new");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
