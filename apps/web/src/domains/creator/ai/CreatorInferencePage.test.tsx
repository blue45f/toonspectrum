// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CreatorInferencePage } from "./CreatorInferencePage";

function LocationEcho() {
  const location = useLocation();
  return <output>{location.pathname}{location.search}{location.hash}</output>;
}

afterEach(cleanup);

describe("CreatorInferencePage", () => {
  it("sends legacy runtime bookmarks to the runtime section of the AI hub", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/ai-runtime?projectId=p1"]}>
        <Routes>
          <Route path="/studio/ai-runtime" element={<CreatorInferencePage />} />
          <Route path="/studio/ai-lab" element={<LocationEcho />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("/studio/ai-lab?projectId=p1&source=legacy-ai-runtime#ai-runtime")).toBeTruthy();
  });
});
