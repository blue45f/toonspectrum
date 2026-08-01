/**
 * Thin Studio UI surface for Hybrid DCC workspace (product exposure).
 * Pure workspace kernels drive state; this panel is the React shell only.
 */

import { useState } from "react";

import {
  createStudioHybridDccWorkspace,
  workspaceAddArtistInk,
  workspaceAddUnitCube,
  workspaceBooleanDifference,
  workspaceDiagnostics,
  workspaceEnsureShots,
  workspaceExportToon3d,
  workspaceExtrudeActive,
  workspaceKnifeActive,
  workspaceLoadRoomPreset,
  workspaceUndo,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";

export function StudioHybridDccPanel() {
  const [ws, setWs] = useState<StudioHybridDccWorkspace>(() =>
    createStudioHybridDccWorkspace("ui-workspace"),
  );
  const [log, setLog] = useState<string>("Ready.");
  const [busy, setBusy] = useState(false);

  const run = async (label: string, fn: () => StudioHybridDccWorkspace | Promise<StudioHybridDccWorkspace>) => {
    setBusy(true);
    try {
      const next = await fn();
      setWs(next);
      setLog(`${label} OK · assets=${Object.keys(next.session.state.geometry.records).length} shots=${next.bridge.shots.length} ink=${next.bridge.artistCorrections.deltas.length}`);
    } catch (error) {
      setLog(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const diag = workspaceDiagnostics(ws);

  return (
    <section
      className="flex flex-col gap-3 p-3 text-sm"
      data-studio-hybrid-dcc-panel="true"
      aria-label="Hybrid DCC workspace"
    >
      <header className="font-medium">Hybrid 2D·3D DCC</header>
      <p className="text-muted-foreground text-xs">
        Document kernels: geometry authority, modifiers, live bridge, import, OPFS recovery.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          onClick={() => run("Add cube", () => workspaceAddUnitCube(ws))}
        >
          Add cube
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          onClick={() => run("Extrude", () => workspaceExtrudeActive(ws, 0.25))}
        >
          Extrude
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          onClick={() => run("Knife", () => workspaceKnifeActive(ws))}
        >
          Knife
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          onClick={() => run("Boolean", () => workspaceBooleanDifference(ws))}
        >
          Boolean −
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          onClick={() => run("8 shots", () => workspaceEnsureShots(ws, 8))}
        >
          8 shots
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          onClick={() => run("Artist ink", () => workspaceAddArtistInk(ws, "shot-1"))}
        >
          Artist ink
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          onClick={() => run("Room", () => workspaceLoadRoomPreset(ws, "classroom"))}
        >
          Room
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          onClick={() => run("Undo", () => workspaceUndo(ws))}
        >
          Undo
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          onClick={() => {
            const pkg = workspaceExportToon3d(ws);
            setLog(`.toon3d packed hash=${pkg.manifest.packageHash.slice(0, 18)}… files=${Object.keys(pkg.files).length}`);
          }}
        >
          Export .toon3d
        </button>
      </div>
      <p className="text-xs" data-studio-hybrid-dcc-log="true">
        {log}
      </p>
      <p className="text-muted-foreground text-xs">
        Diagnostics: errors={diag.errorCount} warnings={diag.warningCount} active=
        {ws.activeAssetId ?? "none"}
      </p>
    </section>
  );
}
