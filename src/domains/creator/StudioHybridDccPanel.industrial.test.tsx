// @vitest-environment jsdom

/**
 * Hybrid DCC UI domain wiring — drives real panel handlers with real kernels.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioUnitCubeMesh } from "./studio-editable-half-edge-mesh";
import { disposeStudioOcctWorker } from "./studio-occt-worker-client";
import { StudioHybridDccPanel } from "./StudioHybridDccPanel";

import type {
  StudioOcctWorkerRequest,
  StudioOcctWorkerResponse,
} from "./studio-occt-worker-protocol";

/**
 * Deterministic browser transport for this UI integration gate. The dedicated
 * worker-client tests own timeout/crash/malformed-payload behavior; this test
 * keeps the real panel → workspace → worker-client → protocol boundary without
 * downloading or executing the 65 MiB OCCT runtime in jsdom.
 */
class FakePanelOcctWorker extends EventTarget {
  static operations: StudioOcctWorkerRequest["operation"][] = [];

  postMessage(request: StudioOcctWorkerRequest): void {
    FakePanelOcctWorker.operations.push(request.operation);
    queueMicrotask(() => {
      const isBox = request.operation.kind === "box";
      const response: StudioOcctWorkerResponse = {
        id: request.id,
        result: {
          ok: true,
          mesh: createStudioUnitCubeMesh(),
          faceCount: 6,
          triangleCount: 12,
          vertexCount: 8,
          volumeApprox: isBox ? 1 : 7,
          topology: {
            source: "tessellated-triangle-mesh",
            boundaryEdgeCount: 0,
            nonManifoldEdgeCount: 0,
            orientationConflictEdgeCount: 0,
            degenerateTriangleCount: 0,
            consistentOrientation: true,
            watertight: true,
            closedSolid: true,
            signedVolume: 1,
          },
          massProperties: {
            source: "occt-brep",
            density: 1,
            densityUnit: "mass/model-unit^3",
            mass: 1,
            volume: 1,
            volumeSource: "occt-brep",
            surfaceArea: 6,
            surfaceAreaSource: "occt-brep",
            centroid: { x: 0, y: 0, z: 0 },
            centroidSource: "occt-brep",
            inertia: { xx: 1, yy: 1, zz: 1, xy: 0, xz: 0, yz: 0 },
            inertiaSource: "occt-brep",
            approximate: false,
          },
          backend: "opencascade-wasm",
          operation: isBox ? "BRepPrimAPI_MakeBox" : "BRepAlgoAPI_Cut",
          loadPath: "browser",
        },
      };
      this.dispatchEvent(new MessageEvent("message", { data: response }));
    });
  }

  terminate(): void {
    // The real client owns lifecycle; no OS resource exists in this test double.
  }
}

function useFakeBrowserOcctWorker(): void {
  vi.stubGlobal("Worker", FakePanelOcctWorker);
}

afterEach(() => {
  cleanup();
  disposeStudioOcctWorker();
  vi.unstubAllGlobals();
  FakePanelOcctWorker.operations = [];
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
    useFakeBrowserOcctWorker();
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
      { timeout: 5_000 },
    );
    expect(FakePanelOcctWorker.operations).toEqual([
      { kind: "box", size: [1, 1, 1] },
    ]);
  });

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

  it("build/document domains: room, BOM, collab, UV, boolean, export toon3d", async () => {
    useFakeBrowserOcctWorker();
    render(<StudioHybridDccPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Room" }));
    await waitFor(() => {
      expect(document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent).toMatch(
        /Room OK/u,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "BOM" }));
    await waitFor(() => {
      const log = document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent ?? "";
      expect(log).toMatch(/BOM OK/u);
      expect(log).toMatch(/bom=\d+/u);
    });
    fireEvent.click(screen.getByRole("button", { name: "Collab" }));
    await waitFor(() => {
      expect(document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent).toMatch(
        /Collab OK|collab=\d+/u,
      );
    });
    // Need active mesh for UV/boolean
    fireEvent.click(screen.getByRole("button", { name: "Add cube" }));
    await waitFor(() => {
      expect(document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent).toMatch(
        /Add cube OK/u,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "UV unwrap" }));
    await waitFor(() => {
      const log = document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent ?? "";
      expect(log).toMatch(/UV OK|uv=/u);
    });
    fireEvent.click(screen.getByRole("button", { name: "Subdiv" }));
    await waitFor(() => {
      expect(document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent).toMatch(
        /Subdiv OK/u,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Export .toon3d" }));
    await waitFor(() => {
      expect(document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent).toMatch(
        /\.toon3d packed|hash=/u,
      );
    });
    // Industrial OCCT boolean (not Manifold pure path) on dedicated asset
    fireEvent.click(screen.getByRole("button", { name: "OCCT boolean" }));
    await waitFor(
      () => {
        const log = document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent ?? "";
        expect(log).toMatch(/OCCT cut OK/u);
        expect(log).toMatch(/BRepAlgoAPI_Cut/u);
        const stats = document.querySelector("[data-studio-hybrid-dcc-stats]");
        expect(Number(stats?.getAttribute("data-occt-tris") ?? 0)).toBeGreaterThan(0);
      },
      { timeout: 5_000 },
    );
    expect(FakePanelOcctWorker.operations.at(-1)?.kind).toBe("cut-boxes");
  });
});
