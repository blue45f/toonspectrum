import { describe, it, expect } from "vitest";

import { Studio3DRightsBOM } from "./studio-3d-rights-bom";

describe("Studio3DRightsBOM", () => {
  function makeBOM(): Studio3DRightsBOM {
    const bom = new Studio3DRightsBOM();
    bom.addRecord({
      assetId: "asset-1",
      assetName: "학교 배경 3D 모델",
      creator: "ToonSpectrum",
      license: "CC-BY-4.0",
      usageScope: ["commercial"],
      attributionRequired: true,
      attributionText: "© ToonSpectrum Studios",
      modificationAllowed: true,
      redistributionAllowed: true,
      importDate: "2026-08-01",
      importSourceFormat: "glTF",
    });
    bom.addRecord({
      assetId: "asset-2",
      assetName: "VRM 캐릭터 하린",
      creator: "Blue45F",
      license: "proprietary",
      usageScope: ["personal"],
      attributionRequired: false,
      modificationAllowed: false,
      redistributionAllowed: false,
      importDate: "2026-08-01",
      importSourceFormat: "VRM",
    });
    return bom;
  }

  it("adds and retrieves rights records", () => {
    const bom = makeBOM();
    expect(bom.getAllRecords().length).toBe(2);
    expect(bom.getRecord("asset-1")?.assetName).toBe("학교 배경 3D 모델");
  });

  it("detects GPL commercial conflict", () => {
    const bom = new Studio3DRightsBOM();
    bom.addRecord({
      assetId: "gpl-mesh",
      assetName: "GPL 메시 에셋",
      creator: "OpenSource",
      license: "GPL-3.0",
      usageScope: ["commercial"],
      attributionRequired: true,
      modificationAllowed: true,
      redistributionAllowed: true,
      importDate: "2026-08-01",
      importSourceFormat: "OBJ",
    });

    const results = bom.validateForCommercialPublish();
    expect(results.some((r) => r.code === "GPL_COMMERCIAL_CONFLICT")).toBe(true);
  });

  it("detects unknown license warning", () => {
    const bom = new Studio3DRightsBOM();
    bom.addRecord({
      assetId: "unknown-asset",
      assetName: "출처 불명 에셋",
      creator: "Unknown",
      license: "unknown",
      usageScope: ["commercial"],
      attributionRequired: false,
      modificationAllowed: true,
      redistributionAllowed: true,
      importDate: "2026-08-01",
      importSourceFormat: "FBX",
    });

    const results = bom.validateForCommercialPublish();
    expect(results.some((r) => r.code === "LICENSE_UNKNOWN")).toBe(true);
  });

  it("traces derivation chain", () => {
    const bom = new Studio3DRightsBOM();
    bom.addRecord({
      assetId: "original",
      assetName: "원본 모델",
      creator: "Artist",
      license: "CC0",
      usageScope: ["commercial"],
      attributionRequired: false,
      modificationAllowed: true,
      redistributionAllowed: true,
      importDate: "2026-07-01",
      importSourceFormat: "glTF",
    });
    bom.addRecord({
      assetId: "derived",
      assetName: "파생 모델",
      creator: "Modifier",
      license: "CC0",
      usageScope: ["commercial"],
      attributionRequired: false,
      modificationAllowed: true,
      redistributionAllowed: true,
      importDate: "2026-08-01",
      importSourceFormat: "glTF",
      derivedFrom: "original",
    });

    const chain = bom.getDerivationChain("derived");
    expect(chain.length).toBe(2);
    expect(chain[0].assetId).toBe("derived");
    expect(chain[1].assetId).toBe("original");
  });

  it("generates summary report", () => {
    const bom = makeBOM();
    const report = bom.generateSummaryReport();
    expect(report.totalAssets).toBe(2);
    expect(report.byLicense["CC-BY-4.0"]).toBe(1);
    expect(report.byLicense["proprietary"]).toBe(1);
    expect(report.attributionRequired).toBe(1);
    expect(report.commercialBlocked).toBe(0);
  });

  it("serializes and deserializes BOM records", () => {
    const bom = makeBOM();
    const json = bom.serializeToJSON();

    const bom2 = new Studio3DRightsBOM();
    bom2.loadFromJSON(json);
    expect(bom2.getAllRecords().length).toBe(2);
  });
});
