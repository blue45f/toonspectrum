// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { STUDIO_TEMPLATE_HANDOFF_KEY } from "../studio-template-catalog";
import { StudioTemplateStartRoute } from "./StudioTemplateStartRoute";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { randomUUID: vi.fn(() => "12345678-1234-1234-1234-123456789abc") },
  });
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("StudioTemplateStartRoute", () => {
  it("creates a fresh draft identity and preserves the selected workspace", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/templates/webtoon-four-panel/start"]}>
        <Routes>
          <Route path="/studio/templates/:templateId/start" element={<StudioTemplateStartRoute />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toContain(
        "/studio/draft/template-webtoon-four-panel-123456781234",
      );
    });
    expect(screen.getByLabelText("location").textContent).toContain("workspace=comic");
    expect(screen.getByLabelText("location").textContent).toContain("template=webtoon-four-panel");
    expect(window.localStorage.getItem(STUDIO_TEMPLATE_HANDOFF_KEY))
      .toContain("webtoon-four-panel");
  });

  it("returns unknown templates to the canonical template hub", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/templates/unknown/start"]}>
        <Routes>
          <Route path="/studio/templates/:templateId/start" element={<StudioTemplateStartRoute />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toBe("/studio/templates");
    });
    expect(window.localStorage.getItem(STUDIO_TEMPLATE_HANDOFF_KEY)).toBeNull();
  });
});
