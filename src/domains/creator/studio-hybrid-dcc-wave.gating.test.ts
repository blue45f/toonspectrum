/**
 * Wave gating: deepened partial paths (collab/FBX/IFC/STEP/CAD) + multi-step product loop.
 */
import { describe, expect, it } from "vitest";

import {
  createStudioCadSketch,
  diagnoseStudioCadConstraints,
  snapStudioCadSketchAxes,
} from "./studio-cad-kernel-lite";
import {
  STUDIO_DCC_CATALOG_REGISTRY,
  STUDIO_DCC_CATALOG_REGISTRY_REVISION,
  assertWebtoonObjectCreatorV1Coverage,
} from "./studio-dcc-catalog-registry";
import {
  collabAppendOp,
  collabConflictReport,
  collabJoin,
  collabLatestGeometryHints,
  collabMergeOpLogs,
  createStudioDccCollabRoom,
  STUDIO_DCC_COLLAB_SHELL_REVISION,
} from "./studio-dcc-collab-shell";
import {
  importStudioFbxDocument,
  sniffStudioFbxBinaryHeader,
} from "./studio-fbx-ascii-import";
import {
  runStudioHybridDccWaveProductLoop,
} from "./studio-hybrid-dcc-workspace";
import {
  importStudioIfcShell,
  importStudioStepShell,
} from "./studio-mesh-format-adapters";
import { unpackStudioToon3dPackage } from "./studio-toon3d-package";

describe("collab shell deepenings", () => {
  it("locks, merges op logs, and reports concurrent geometry-hint conflicts", () => {
    expect(STUDIO_DCC_COLLAB_SHELL_REVISION).toBe(2);
    let a = createStudioDccCollabRoom("room-wave");
    a = collabJoin(a, { peerId: "p1", displayName: "One", color: "#111" }, 1000);
    a = collabJoin(a, { peerId: "p2", displayName: "Two", color: "#222" }, 1000);
    a = collabAppendOp(a, {
      kind: "lock",
      peerId: "p1",
      assetId: "mesh-a",
      at: 1100,
    });
    expect(a.locks["mesh-a"]).toBe("p1");
    a = collabAppendOp(a, {
      kind: "geometry-hint",
      peerId: "p1",
      assetId: "mesh-a",
      geometryHash: "h-p1",
      at: 1200,
    });
    a = collabAppendOp(a, {
      kind: "geometry-hint",
      peerId: "p2",
      assetId: "mesh-a",
      geometryHash: "h-p2",
      at: 1300,
    });
    const conflicts = collabConflictReport(a, 5000);
    expect(conflicts.some((c) => c.reason === "concurrent-geometry-hints")).toBe(true);
    const hints = collabLatestGeometryHints(a);
    expect(hints["mesh-a"]?.hash).toBe("h-p2");
    expect(hints["mesh-a"]?.peerId).toBe("p2");

    let b = createStudioDccCollabRoom("room-wave");
    b = collabJoin(b, { peerId: "p3", displayName: "Three", color: "#333" }, 2000);
    b = collabAppendOp(b, {
      kind: "chat",
      peerId: "p3",
      text: "hi",
      at: 2100,
    });
    const merged = collabMergeOpLogs(a, b);
    expect(merged.peers.length).toBeGreaterThanOrEqual(3);
    expect(merged.ops.some((op) => op.kind === "chat")).toBe(true);
    expect(merged.epoch).toBeGreaterThan(a.epoch);
  });
});

describe("FBX binary honesty", () => {
  it("returns structured sniff + report without fabricating meshes", () => {
    const bytes = new Uint8Array(40);
    const magic = new TextEncoder().encode("Kaydara FBX Binary  ");
    bytes.set(magic);
    // version 7500 little-endian at offset 23
    bytes[23] = 7500 & 0xff;
    bytes[24] = (7500 >> 8) & 0xff;
    bytes[25] = (7500 >> 16) & 0xff;
    bytes[26] = (7500 >> 24) & 0xff;
    const sniff = sniffStudioFbxBinaryHeader(bytes);
    expect(sniff.magicOk).toBe(true);
    expect(sniff.version).toBe(7500);
    expect(sniff.byteLength).toBe(40);
    const result = importStudioFbxDocument(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.binary?.version).toBe(7500);
      expect(result.report?.fidelity.geometry).toBe("X");
      expect(result.report?.committed).toBe(false);
      expect(result.report?.sourceHash.startsWith("sha256:")).toBe(true);
    }
  });
});

describe("IFC/STEP AABB shell fidelity", () => {
  it("builds AABB shell with semantic extras for IFC", () => {
    const ifc = importStudioIfcShell(
      [
        "ISO-10303-21;",
        "DATA;",
        "#1=IFCCARTESIANPOINT((0.,0.,0.));",
        "#2=IFCCARTESIANPOINT((2.,1.,3.));",
        "#3=IFCSPACE('1','Hall','',$,$,$,$,$,.ELEMENT.,$,$);",
        "#4=IFCBUILDINGSTOREY('2','L1','',$,$,$,$,$,.ELEMENT.,$);",
        "#5=IFCWALL('3','W',$,$,$,$,$,$,$);",
        "#6=IFCDOOR('4','D',$,$,$,$,$,$,$);",
        "#7=IFCWINDOW('5','Win',$,$,$,$,$,$,$);",
        "ENDSEC;",
      ].join("\n"),
    );
    expect(ifc.meshes.length).toBe(1);
    expect(ifc.report.fidelity.geometry).toBe("B");
    expect(ifc.extras?.doorCount).toBe(1);
    expect(ifc.extras?.windowCount).toBe(1);
    expect((ifc.extras?.storeys as string[])?.includes("L1")).toBe(true);
    expect(ifc.extras?.aabbVertexCount).toBe(8);
  });

  it("builds AABB shell with shell/product counts for STEP", () => {
    const step = importStudioStepShell(
      [
        "#10=CARTESIAN_POINT('',(0.,0.,0.));",
        "#20=CARTESIAN_POINT('',(1.,2.,3.));",
        "#30=PRODUCT('Bracket','Bracket','',(#40));",
        "#50=ADVANCED_FACE('',(#60),#70,.T.);",
        "#80=CLOSED_SHELL('',(#50));",
        "#90=DIRECTION('',(0.,1.,0.));",
      ].join("\n"),
    );
    expect(step.meshes.length).toBe(1);
    expect(step.report.fidelity.geometry).toBe("B");
    expect(step.extras?.closedShells).toBe(1);
    expect(step.extras?.directions).toBe(1);
    expect((step.extras?.products as string[])?.includes("Bracket")).toBe(true);
    expect(step.extras?.aabbVertexCount).toBe(8);
  });
});

describe("CAD constraint diagnostics deepenings", () => {
  it("verifies coincident/equal/distance and axis snap", () => {
    const open = createStudioCadSketch(
      [
        { kind: "line", a: [0, 0], b: [1, 0.0004] },
        { kind: "line", a: [1, 0], b: [1, 1] },
        { kind: "line", a: [1, 1], b: [0, 1] },
        { kind: "line", a: [0, 1], b: [0, 0] },
      ],
      [
        { kind: "horizontal", curveIndex: 0 },
        { kind: "vertical", curveIndex: 1 },
        { kind: "coincident", a: 0, b: 1, endA: "b", endB: "a" },
        { kind: "equal", a: 0, b: 2 },
        { kind: "distance", a: 0, b: 2, value: 1 },
      ],
    );
    const snapped = snapStudioCadSketchAxes(open);
    const report = diagnoseStudioCadConstraints(snapped);
    expect(report.satisfied.length).toBeGreaterThanOrEqual(3);
    // near-horizontal snapped then horizontal constraint should pass
    expect(report.conflicts.some((c) => c.includes("horizontal"))).toBe(false);

    const bad = createStudioCadSketch(
      [
        { kind: "line", a: [0, 0], b: [1, 0] },
        { kind: "line", a: [2, 0], b: [3, 0] },
      ],
      [{ kind: "coincident", a: 0, b: 1, endA: "b", endB: "a" }],
    );
    const badReport = diagnoseStudioCadConstraints(bad);
    expect(badReport.conflicts.some((c) => c.includes("coincident"))).toBe(true);
  });
});

describe("wave multi-step product loop", () => {
  it("geo-nodes → edit → IFC import → retarget/BOM/collab → .toon3d with concrete metrics", async () => {
    const result = await runStudioHybridDccWaveProductLoop("wave-gate-1");
    expect(result.metrics.assetCount).toBeGreaterThanOrEqual(2);
    expect(result.metrics.shotCount).toBe(4);
    expect(result.metrics.bomLines).toBeGreaterThan(0);
    expect(result.metrics.collabEpoch).toBeGreaterThan(0);
    expect(result.metrics.collabOps).toBeGreaterThanOrEqual(2);
    expect(result.metrics.uvMode).toBe("box");
    expect(result.metrics.packageHash.startsWith("sha256:")).toBe(true);
    expect(result.metrics.documentHasGeo).toBe(true);
    expect(result.metrics.importFormat).toBe("ifc");
    expect(result.metrics.importGeometryFidelity).toBe("B");
    expect(result.metrics.diagnosticErrors).toBe(0);
    expect(result.workspace.collab.locks[result.workspace.activeAssetId ?? ""]).toBeDefined();
    const unpacked = unpackStudioToon3dPackage(result.package);
    expect(unpacked.shotCount).toBe(4);
    expect(unpacked.document.documentId).toBe("wave-gate-1");
    expect(result.package.files["shots/shots.json"]).toContain("shot-1");
  });
});

describe("catalog SSOT wave revision", () => {
  it("keeps §12.1 coverage and registers wave loop + collab deepenings", () => {
    expect(STUDIO_DCC_CATALOG_REGISTRY_REVISION).toBeGreaterThanOrEqual(4);
    expect(STUDIO_DCC_CATALOG_REGISTRY.some((e) => e.id === "WS-WAVE-LOOP")).toBe(true);
    const doc008 = STUDIO_DCC_CATALOG_REGISTRY.find((e) => e.id === "DOC-008");
    expect(doc008?.apis).toContain("collabConflictReport");
    const { ok, missing } = assertWebtoonObjectCreatorV1Coverage();
    expect(missing).toEqual([]);
    expect(ok).toBe(true);
  });
});
