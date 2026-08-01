/**
 * Product surface + expanded adapters gating (UI wire, OFF/3MF/BVH/IFC, collab, UV/CAD/sculpt/cloth).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  STUDIO_DCC_CATALOG_REGISTRY,
  STUDIO_DCC_CATALOG_REGISTRY_REVISION,
  assertWebtoonObjectCreatorV1Coverage,
} from "./studio-dcc-catalog-registry";
import {
  collabActivePeerIds,
  collabAppendOp,
  collabJoin,
  createStudioDccCollabRoom,
  STUDIO_DCC_COLLAB_SHELL_REVISION,
} from "./studio-dcc-collab-shell";
import {
  importStudioFbxDocument,
  isStudioFbxBinary,
} from "./studio-fbx-ascii-import";
import { buildStudioGeoNodesPrimitive } from "./studio-geometry-nodes-workspace-bridge";
import {
  createStudioHybridDccWorkspace,
  workspaceAddGeoNodesPrimitive,
  workspaceAddUnitCube,
  workspaceArrayActive,
  workspaceCadProp,
  workspaceClothStep,
  workspaceCollabJoin,
  workspaceDecimateActive,
  workspaceExportToon3d,
  workspaceMirrorActive,
  workspaceRebuildBom,
  workspaceRetargetFromBvhExtras,
  workspaceSculptActive,
  workspaceSubdivideActive,
  workspaceUvUnwrapActive,
} from "./studio-hybrid-dcc-workspace";
import {
  bomRollupByMaterial,
  bomEstimateMassKg,
} from "./studio-manufacturing-bom-lite";
import {
  importStudio3mfMinimal,
  importStudioBvhMotion,
  importStudioIfcShell,
  importStudioMeshByExtension,
  importStudioOff,
  importStudioStepShell,
} from "./studio-mesh-format-adapters";

const root = resolve(import.meta.dirname, "../..");

describe("product UI wiring", () => {
  it("StudioPage lazy-mounts Hybrid DCC dialog and menubar exposes open control", () => {
    const page = readFileSync(
      resolve(import.meta.dirname, "./StudioPage.tsx"),
      "utf8",
    );
    const menubar = readFileSync(
      resolve(import.meta.dirname, "./StudioMenubarContent.tsx"),
      "utf8",
    );
    expect(page).toContain("LazyStudioHybridDccDialog");
    expect(page).toContain("setHybridDccOpen");
    expect(page).toContain("hybridDccOpen");
    expect(menubar).toContain("setHybridDccOpen");
    expect(menubar).toContain('data-studio-hybrid-dcc-open="true"');
    expect(existsSync(resolve(import.meta.dirname, "./StudioHybridDccDialog.tsx"))).toBe(true);
    expect(existsSync(resolve(import.meta.dirname, "./StudioHybridDccPanel.tsx"))).toBe(true);
    void root;
  });
});

describe("expanded format adapters OFF/3MF/BVH/IFC", () => {
  it("parses OFF / 3MF / BVH / IFC fixtures", () => {
    const off = importStudioOff(
      ["OFF", "3 1 0", "0 0 0", "1 0 0", "0 1 0", "3 0 1 2"].join("\n"),
    );
    expect(off.meshes.length).toBe(1);
    expect(off.format).toBe("off");

    const mf = importStudio3mfMinimal(
      `<model><mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2"/>
        </triangles>
      </mesh></model>`,
    );
    expect(mf.meshes.length).toBe(1);
    expect(mf.format).toBe("3mf");

    const bvh = importStudioBvhMotion(
      [
        "HIERARCHY",
        "ROOT Hips",
        "{",
        "  OFFSET 0 0 0",
        "  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation",
        "  JOINT Spine",
        "  {",
        "    OFFSET 0 1 0",
        "    CHANNELS 3 Zrotation Xrotation Yrotation",
        "    End Site",
        "    {",
        "      OFFSET 0 1 0",
        "    }",
        "  }",
        "}",
        "MOTION",
        "Frames: 2",
        "Frame Time: 0.033333",
        "0 0 0 0 0 0 0 0 0",
        "0 0 0 0 0 0 0 0 0",
      ].join("\n"),
    );
    expect(bvh.format).toBe("bvh");
    expect(bvh.extras?.frameCount).toBe(2);
    expect(bvh.meshes.length).toBeGreaterThan(0);

    const ifc = importStudioIfcShell(
      [
        "ISO-10303-21;",
        "DATA;",
        "#1=IFCCARTESIANPOINT((0.,0.,0.));",
        "#2=IFCCARTESIANPOINT((1.,0.,0.));",
        "#3=IFCSPACE('1','SpaceA','Room',$,$,$,$,$,.ELEMENT.,$,$);",
        "#4=IFCWALL('2','Wall',$,$,$,$,$,$,$);",
        "ENDSEC;",
      ].join("\n"),
    );
    expect(ifc.format).toBe("ifc");
    expect(ifc.extras?.wallCount).toBe(1);
    expect((ifc.extras?.spaces as string[])?.length).toBeGreaterThan(0);

    expect(importStudioMeshByExtension("prop.off", new TextEncoder().encode("OFF\n0 0 0\n"))).not.toBeNull();
    expect(importStudioMeshByExtension("a.bvh", new TextEncoder().encode("HIERARCHY\n"))).not.toBeNull();

    const step = importStudioStepShell(
      `#10=CARTESIAN_POINT('',(0.,0.,0.));\n#20=CARTESIAN_POINT('',(1.,0.,0.));\n#30=PRODUCT('Bracket','Bracket','',(#40));\n#50=ADVANCED_FACE('',(#60),#70,.T.);`,
    );
    expect(step.format).toBe("step");
    expect(step.extras?.pointCount).toBeGreaterThan(0);
  });
});

describe("workspace expansion CAD/sculpt/cloth/collab/UV/mirror", () => {
  it("runs expanded workspace ops and packs toon3d", async () => {
    let ws = createStudioHybridDccWorkspace("ws-product");
    expect(ws.revision).toBe(2);
    ws = workspaceAddUnitCube(ws, "hero");
    ws = await workspaceMirrorActive(ws);
    ws = workspaceUvUnwrapActive(ws, "box");
    expect(ws.lastUvMap?.mode).toBe("box");
    expect(ws.lastUvMap!.uvs.length).toBeGreaterThan(0);
    ws = workspaceSculptActive(ws, 0.1);
    ws = workspaceCadProp(ws, "cad-1");
    expect(ws.activeAssetId).toBe("cad-1");
    ws = workspaceClothStep(ws);
    expect(ws.clothStep).toBe(1);
    ws = workspaceCollabJoin(ws, "p1", "Kim");
    expect(ws.collab.peers).toHaveLength(1);
    ws = workspaceRetargetFromBvhExtras(ws, ["Hips", "Spine", "Head", "LeftArm"]);
    expect(ws.lastRetarget).not.toBeNull();
    expect(ws.lastRetarget!.source).toBe("bvh");
    ws = workspaceAddUnitCube(ws, "subdiv-target");
    ws = workspaceSubdivideActive(ws, 1);
    ws = await workspaceArrayActive(ws, 2);
    ws = workspaceRebuildBom(ws);
    expect(ws.bom.lines.length).toBeGreaterThan(0);
    expect(bomRollupByMaterial(ws.bom).length).toBeGreaterThan(0);
    expect(bomEstimateMassKg(ws.bom)).toBeGreaterThan(0);
    const pkg = workspaceExportToon3d(ws);
    expect(pkg.manifest.format).toBe("toonspectrum.toon3d");
  });

  it("sniffs binary FBX without fabricating geometry", () => {
    const magic = new TextEncoder().encode("Kaydara FBX Binary  \0");
    const bytes = new Uint8Array(64);
    bytes.set(magic);
    expect(isStudioFbxBinary(bytes)).toBe(true);
    const result = importStudioFbxDocument(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail.startsWith("binary-fbx:")).toBe(true);
  });

  it("geometry-nodes primitives and decimate land in workspace", () => {
    const sphere = buildStudioGeoNodesPrimitive("sphere", 6);
    expect(sphere.ok).toBe(true);
    if (sphere.ok) {
      expect(sphere.triangleCount).toBeGreaterThan(0);
    }
    let ws = createStudioHybridDccWorkspace("ws-geonodes");
    ws = workspaceAddGeoNodesPrimitive(ws, "cylinder", "cyl-1", 6);
    expect(ws.activeAssetId).toBe("cyl-1");
    ws = workspaceDecimateActive(ws, 0.6);
    expect(ws.session.state.geometry.records["cyl-1"]).toBeDefined();
  });
});

describe("collab shell + catalog revision", () => {
  it("tracks presence and keeps §12.1 coverage", () => {
    let room = createStudioDccCollabRoom("r1");
    room = collabJoin(room, { peerId: "a", displayName: "A", color: "#f00" });
    room = collabAppendOp(room, {
      kind: "geometry-hint",
      peerId: "a",
      assetId: "mesh-1",
      geometryHash: "h1",
      at: Date.now(),
    });
    expect(collabActivePeerIds(room).includes("a")).toBe(true);
    expect(STUDIO_DCC_COLLAB_SHELL_REVISION).toBeGreaterThanOrEqual(2);
    expect(STUDIO_DCC_CATALOG_REGISTRY_REVISION).toBeGreaterThanOrEqual(4);
    expect(STUDIO_DCC_CATALOG_REGISTRY.some((e) => e.id === "FMT-OFF")).toBe(true);
    expect(STUDIO_DCC_CATALOG_REGISTRY.some((e) => e.id === "UI-HYBRID-PANEL")).toBe(true);
    const { ok, missing } = assertWebtoonObjectCreatorV1Coverage();
    expect(missing).toEqual([]);
    expect(ok).toBe(true);
  });
});
