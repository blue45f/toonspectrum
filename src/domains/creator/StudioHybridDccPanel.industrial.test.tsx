// @vitest-environment jsdom

/**
 * Hybrid DCC UI domain wiring — drives real panel handlers with real kernels.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioHybridDccPanel } from "./StudioHybridDccPanel";

afterEach(() => {
  cleanup();
});

describe("StudioHybridDccPanel industrial wiring", () => {
  it("Add cube mutates assets and log via real workspace kernel", async () => {
    render(<StudioHybridDccPanel />);
    expect(screen.getByLabelText("Hybrid DCC workspace")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add cube" }));
    await waitFor(() => {
      const log = document.querySelector("[data-studio-hybrid-dcc-log]");
      expect(log?.textContent).toMatch(/Add cube OK/u);
      expect(log?.textContent).toMatch(/assets=1/u);
    });
    const stats = document.querySelector("[data-studio-hybrid-dcc-stats]");
    expect(stats?.getAttribute("data-assets")).toBe("1");
  });

  it("OCCT box button invokes WASM CAD and updates stats", async () => {
    render(<StudioHybridDccPanel />);
    fireEvent.click(screen.getByRole("button", { name: "OCCT box" }));
    await waitFor(
      () => {
        const log = document.querySelector("[data-studio-hybrid-dcc-log]");
        expect(log?.textContent).toMatch(/OCCT box OK/u);
        expect(log?.textContent).toMatch(/occt=BRepPrimAPI_MakeBox:/u);
        const stats = document.querySelector("[data-studio-hybrid-dcc-stats]");
        expect(Number(stats?.getAttribute("data-occt-tris") ?? 0)).toBeGreaterThan(0);
      },
      { timeout: 120_000 },
    );
  }, 120_000);

  it("cube → dynatopo → retopo multi-domain path updates DOM state", async () => {
    render(<StudioHybridDccPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add cube" }));
    await waitFor(() => {
      expect(document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent).toMatch(
        /Add cube OK/u,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Dynatopo" }));
    await waitFor(() => {
      const log = document.querySelector("[data-studio-hybrid-dcc-log]");
      expect(log?.textContent).toMatch(/Dynatopo OK/u);
      expect(log?.textContent).toMatch(/dynatopo=refine:/u);
    });
    fireEvent.click(screen.getByRole("button", { name: "Retopo" }));
    await waitFor(() => {
      const log = document.querySelector("[data-studio-hybrid-dcc-log]");
      expect(log?.textContent).toMatch(/Retopo OK/u);
      const stats = document.querySelector("[data-studio-hybrid-dcc-stats]");
      expect(Number(stats?.getAttribute("data-retopo-faces") ?? 0)).toBeGreaterThan(0);
    });
  });

  it("CAD revolve, sculpt, cloth, shots, artist ink cover remaining domains", async () => {
    render(<StudioHybridDccPanel />);
    fireEvent.click(screen.getByRole("button", { name: "CAD revolve" }));
    await waitFor(() => {
      expect(document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent).toMatch(
        /CAD revolve OK/u,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Sculpt" }));
    await waitFor(() => {
      expect(document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent).toMatch(
        /Sculpt OK/u,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Cloth step" }));
    await waitFor(() => {
      expect(document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent).toMatch(
        /Cloth OK/u,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "8 shots" }));
    await waitFor(() => {
      expect(document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent).toMatch(
        /shots=8/u,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Artist ink" }));
    await waitFor(() => {
      expect(document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent).toMatch(
        /ink=/u,
      );
    });
  });
});
