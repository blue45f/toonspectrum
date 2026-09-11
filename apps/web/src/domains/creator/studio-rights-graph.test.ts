import { describe, expect, it } from "vitest";

import {
  auditStudioRightsGraph,
  validateStudioRightsGraph,
  type StudioRightsGraph,
} from "./studio-rights-graph";

const GRAPH: StudioRightsGraph = Object.freeze({
  nodes: [
    { id: "document", kind: "document", title: "1화", status: "allowed", licenseId: null, attributionText: null, sourceUrl: null },
    { id: "background", kind: "asset", title: "학교 배경", status: "warning", licenseId: "commercial", attributionText: "Background by Artist", sourceUrl: "https://example.com/background" },
    { id: "font", kind: "font", title: "대사체", status: "allowed", licenseId: "font-commercial", attributionText: null, sourceUrl: "https://example.com/font" },
    { id: "voice", kind: "voice", title: "주인공 음성", status: "blocked", licenseId: "personal-only", attributionText: "Voice by Provider", sourceUrl: "https://example.com/voice" },
  ],
  edges: [
    { fromId: "document", toId: "background", kind: "uses" },
    { fromId: "document", toId: "font", kind: "uses" },
    { fromId: "background", toId: "voice", kind: "contains" },
  ],
});

describe("Studio rights graph", () => {
  it("builds a transitive BOM with source paths and unique attribution", () => {
    const report = auditStudioRightsGraph(GRAPH, ["document"]);
    expect(report.status).toBe("blocked");
    expect(report.entries.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "document",
      "background",
      "font",
      "voice",
    ]));
    expect(report.entries.find((entry) => entry.id === "voice")?.paths).toEqual([
      ["document", "background", "voice"],
    ]);
    expect(report.attributionTexts).toEqual([
      "Background by Artist",
      "Voice by Provider",
    ]);
  });

  it("reports missing nodes and dependency cycles", () => {
    const invalid: StudioRightsGraph = {
      nodes: GRAPH.nodes,
      edges: [
        { fromId: "document", toId: "missing", kind: "uses" },
        { fromId: "document", toId: "background", kind: "uses" },
        { fromId: "background", toId: "document", kind: "derived-from" },
      ],
    };
    expect(validateStudioRightsGraph(invalid)).toContainEqual(
      expect.objectContaining({ code: "edge-node-missing", severity: "error" }),
    );
    expect(auditStudioRightsGraph(invalid, ["document"]).findings).toContainEqual(
      expect.objectContaining({ code: "dependency-cycle", severity: "error" }),
    );
  });

  it("does not include unused assets in a project export BOM", () => {
    const report = auditStudioRightsGraph({
      ...GRAPH,
      nodes: [...GRAPH.nodes, {
        id: "unused",
        kind: "asset",
        title: "미사용 에셋",
        status: "blocked",
        licenseId: "none",
        attributionText: null,
        sourceUrl: null,
      }],
    }, ["document"]);
    expect(report.entries.some((entry) => entry.id === "unused")).toBe(false);
  });
});
