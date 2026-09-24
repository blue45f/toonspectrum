// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { StudioAiSettingsPage } from "./StudioAiSettingsPage";

function LocationEcho() {
  const location = useLocation();
  return <output>{location.pathname}{location.search}</output>;
}

afterEach(cleanup);

describe("StudioAiSettingsPage", () => {
  it("redirects the legacy Studio route to the canonical account AI settings", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/ai-settings"]}>
        <Routes>
          <Route path="/studio/ai-settings" element={<StudioAiSettingsPage />} />
          <Route path="/settings/ai" element={<LocationEcho />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("/settings/ai?source=studio")).toBeTruthy();
  });
});
