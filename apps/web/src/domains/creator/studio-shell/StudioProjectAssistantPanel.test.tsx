// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { consumeStudioAiProjectHandoff } from "../ai/studio-ai-project-handoff";
import { StudioProjectAssistantPanel } from "./StudioProjectAssistantPanel";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanup);

describe("StudioProjectAssistantPanel", () => {
  it("creates a one-time handoff and routes to the existing editor assistant", () => {
    render(
      <MemoryRouter initialEntries={["/studio/p/project-12/story"]}>
        <StudioProjectAssistantPanel projectId="project-12" section="story" locale="ko" />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "대본을 컷으로" }));
    fireEvent.click(screen.getByRole("button", { name: /편집기에서 검토/u }));

    expect(screen.getByLabelText("location").textContent).toContain("/studio/work/project-12/comic");
    expect(consumeStudioAiProjectHandoff(window.sessionStorage, "project-12")).toMatchObject({
      tool: "composition",
      source: "story",
    });
  });

  it("does not navigate when the request is empty", () => {
    render(
      <MemoryRouter initialEntries={["/studio/p/project-12/production"]}>
        <StudioProjectAssistantPanel projectId="project-12" section="production" locale="ko" />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("요청 내용"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: /편집기에서 검토/u }));

    expect(screen.getByRole("alert").textContent).toContain("요청할 내용을 입력");
    expect(screen.getByLabelText("location").textContent).toContain("/studio/p/project-12/production");
    expect(window.sessionStorage.length).toBe(0);
  });
});
