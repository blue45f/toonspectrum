/**
 * Thin Studio UI surface for Hybrid DCC workspace (product exposure).
 * Pure workspace kernels drive state; this panel is the React shell only.
 */

import { useEffect, useRef, useState } from "react";

import {
  createStudioHybridDccWorkspace,
  runStudioHybridDccFullEngineSuite,
  workspaceAddArtistInk,
  workspaceAddGeoNodesPrimitive,
  workspaceAddGeoNodesStarter,
  workspaceAddUnitCube,
  workspaceArrayActive,
  workspaceBooleanDifference,
  workspaceCadProp,
  workspaceCadRevolve,
  workspaceClothStep,
  workspaceCollabJoin,
  workspaceDecimateActive,
  workspaceDiagnostics,
  workspaceDynatopoActive,
  workspaceEnsureShots,
  workspaceExportActiveMesh,
  workspaceExportToon3d,
  workspaceExtrudeActive,
  workspaceImportBytes,
  workspaceKnifeActive,
  workspaceLoadRoomPreset,
  workspaceMirrorActive,
  workspaceOrientOutwardActive,
  workspaceImportIfcCity,
  workspaceManifoldBooleanActive,
  workspaceOcctBooleanCut,
  workspaceOcctBox,
  workspaceOcctFillet,
  workspaceOcctLoft,
  workspaceOcctRevolve,
  workspaceOcctSphere,
  workspaceOcctMirror,
  workspaceOcctPipe,
  workspaceOcctTorus,
  workspaceOpenNurbsSphere,
  workspaceRebuildBom,
  workspaceRetopoActive,
  workspaceSculptActive,
  workspaceSolidifyActive,
  workspaceSubdivideActive,
  workspaceUndo,
  workspaceUvUnwrapActive,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";

export function StudioHybridDccPanel() {
  const [ws, setWs] = useState<StudioHybridDccWorkspace>(() =>
    createStudioHybridDccWorkspace("ui-workspace"),
  );
  const [log, setLog] = useState<string>("Ready.");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    void import("./studio-occt-worker-client").then(({ disposeStudioOcctWorker }) => {
      disposeStudioOcctWorker();
    });
  }, []);

  const run = async (
    label: string,
    fn: () => StudioHybridDccWorkspace | Promise<StudioHybridDccWorkspace>,
  ) => {
    setBusy(true);
    try {
      const next = await fn();
      setWs(next);
      setLog(
        `${label} OK · assets=${Object.keys(next.session.state.geometry.records).length} shots=${next.bridge.shots.length} ink=${next.bridge.artistCorrections.deltas.length} uv=${next.lastUvMap ? next.lastUvMap.mode : "—"} collab=${next.collab.peers.length} cloth=${next.clothStep} bom=${next.bom.lines.length} occt=${next.lastOcct ? `${next.lastOcct.operation}:${next.lastOcct.triangleCount}t:${next.lastOcct.loadPath ?? "wasm"}` : "—"} dynatopo=${next.lastDynatopo ? `${next.lastDynatopo.mode}:${next.lastDynatopo.facesAfter}f b=${next.lastDynatopo.boundaryEdges}` : "—"} retopo=${next.lastRetopo ? `${next.lastRetopo.facesAfter}/${next.lastRetopo.targetFaces}` : "—"}`,
      );
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
        Document kernels: geometry authority, modifiers, live bridge, CAD/sculpt/cloth shells, import, OPFS recovery.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".stl,.ply,.dae,.dxf,.off,.3mf,.bvh,.ifc,.obj,.glb,.gltf,.vrm,.fbx,.3dm,.step,.stp"
        className="sr-only"
        data-studio-hybrid-dcc-import="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void run(`Import ${file.name}`, async () => {
            const buf = new Uint8Array(await file.arrayBuffer());
            return workspaceImportBytes(ws, file.name, buf);
          });
        }}
      />
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
          disabled={busy}
          onClick={() => run("Geo sphere", () => workspaceAddGeoNodesPrimitive(ws, "sphere"))}
        >
          Geo sphere
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          onClick={() => run("Geo starter", () => workspaceAddGeoNodesStarter(ws))}
        >
          Geo starter
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          onClick={() => run("Solidify", () => workspaceSolidifyActive(ws))}
        >
          Solidify
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          onClick={() => run("CAD revolve", () => workspaceCadRevolve(ws))}
        >
          CAD revolve
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          data-studio-hybrid-dcc-action="opennurbs-sphere"
          onClick={() => run("openNURBS sphere", () => workspaceOpenNurbsSphere(ws))}
        >
          openNURBS sphere
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          data-studio-hybrid-dcc-action="ifc-city"
          onClick={() => run("IFC city", () => workspaceImportIfcCity(ws))}
        >
          IFC city
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          data-studio-hybrid-dcc-action="occt-box"
          onClick={() => run("OCCT box", () => workspaceOcctBox(ws))}
        >
          OCCT box
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          data-studio-hybrid-dcc-action="occt-cut"
          onClick={() => run("OCCT cut", () => workspaceOcctBooleanCut(ws))}
        >
          OCCT boolean
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          data-studio-hybrid-dcc-action="occt-revolve"
          onClick={() => run("OCCT revolve", () => workspaceOcctRevolve(ws))}
        >
          OCCT revolve
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          data-studio-hybrid-dcc-action="occt-sphere"
          onClick={() => run("OCCT sphere", () => workspaceOcctSphere(ws))}
        >
          OCCT sphere
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          data-studio-hybrid-dcc-action="occt-torus"
          onClick={() => run("OCCT torus", () => workspaceOcctTorus(ws))}
        >
          OCCT torus
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          data-studio-hybrid-dcc-action="occt-pipe"
          onClick={() => run("OCCT pipe", () => workspaceOcctPipe(ws))}
        >
          OCCT pipe
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          data-studio-hybrid-dcc-action="occt-mirror"
          onClick={() => run("OCCT mirror", () => workspaceOcctMirror(ws))}
        >
          OCCT mirror
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          data-studio-hybrid-dcc-action="occt-fillet"
          onClick={() => run("OCCT fillet", () => workspaceOcctFillet(ws))}
        >
          OCCT fillet
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          data-studio-hybrid-dcc-action="occt-loft"
          onClick={() => run("OCCT loft", () => workspaceOcctLoft(ws))}
        >
          OCCT loft
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          data-studio-hybrid-dcc-action="manifold-boolean"
          onClick={() => run("Manifold boolean", () => workspaceManifoldBooleanActive(ws))}
        >
          Manifold boolean
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          data-studio-hybrid-dcc-action="dynatopo"
          onClick={() => run("Dynatopo", () => workspaceDynatopoActive(ws, "refine"))}
        >
          Dynatopo
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          data-studio-hybrid-dcc-action="retopo"
          onClick={() => run("Retopo", () => workspaceRetopoActive(ws, 8))}
        >
          Retopo
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          onClick={() => run("Export OBJ", () => workspaceExportActiveMesh(ws, "obj"))}
        >
          Export OBJ
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          onClick={() =>
            run("Full engine suite", async () => {
              const result = await runStudioHybridDccFullEngineSuite("ui-suite");
              setLog(
                `Suite engines=${result.metrics.engines.length} export=${result.metrics.exportFormat} hash=${result.metrics.packageHash.slice(0, 18)}…`,
              );
              return result.workspace;
            })
          }
        >
          Full engines
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          onClick={() => run("Decimate", () => workspaceDecimateActive(ws, 0.5))}
        >
          Decimate
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          data-studio-hybrid-dcc-action="orient-outward"
          onClick={() => run("Orient outward", () => workspaceOrientOutwardActive(ws))}
        >
          Orient outward
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
          disabled={busy || !ws.activeAssetId}
          onClick={() => run("Mirror", () => workspaceMirrorActive(ws))}
        >
          Mirror
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          onClick={() => run("Subdiv", () => workspaceSubdivideActive(ws, 1))}
        >
          Subdiv
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          onClick={() => run("Array", () => workspaceArrayActive(ws, 3))}
        >
          Array
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          onClick={() => run("BOM", () => workspaceRebuildBom(ws))}
        >
          BOM
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          onClick={() => run("UV", () => workspaceUvUnwrapActive(ws))}
        >
          UV unwrap
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy || !ws.activeAssetId}
          onClick={() => run("Sculpt", () => workspaceSculptActive(ws))}
        >
          Sculpt
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          onClick={() => run("CAD prop", () => workspaceCadProp(ws))}
        >
          CAD prop
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          onClick={() => run("Cloth", () => workspaceClothStep(ws))}
        >
          Cloth step
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          disabled={busy}
          onClick={() => run("Collab join", () => workspaceCollabJoin(ws, "peer-local", "Artist"))}
        >
          Collab
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
          onClick={() => fileRef.current?.click()}
        >
          Import mesh…
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
            setLog(
              `.toon3d packed hash=${pkg.manifest.packageHash.slice(0, 18)}… files=${Object.keys(pkg.files).length}`,
            );
          }}
        >
          Export .toon3d
        </button>
      </div>
      <p className="text-xs" data-studio-hybrid-dcc-log="true">
        {log}
      </p>
      <p
        className="text-muted-foreground text-xs"
        data-studio-hybrid-dcc-stats="true"
        data-assets={Object.keys(ws.session.state.geometry.records).length}
        data-active={ws.activeAssetId ?? "none"}
        data-occt-tris={ws.lastOcct?.triangleCount ?? 0}
        data-occt-path={ws.lastOcct?.loadPath ?? ""}
        data-occt-op={ws.lastOcct?.operation ?? ""}
        data-dynatopo-faces={ws.lastDynatopo?.facesAfter ?? 0}
        data-retopo-faces={ws.lastRetopo?.facesAfter ?? 0}
      >
        Diagnostics: errors={diag.errorCount} warnings={diag.warningCount} active=
        {ws.activeAssetId ?? "none"} assets=
        {Object.keys(ws.session.state.geometry.records).length}
      </p>
    </section>
  );
}
