import { describe, expect, it } from "vitest";

import {
  STUDIO_RUNTIME_OWNERSHIP,
  studioRuntimeOwner,
  validateStudioRuntimeOwnership,
  type StudioRuntimeOwnerSpec,
} from "./studio-runtime-ownership";

describe("Studio runtime ownership", () => {
  it("matches every authority-map owner with one acyclic runtime or repository", () => {
    expect(validateStudioRuntimeOwnership()).toEqual([]);
    expect(studioRuntimeOwner("StudioDocumentRuntime").owns).toEqual([
      "authoring.pages",
      "authoring.comic",
      "authoring.writer-room",
      "authoring.character-bible",
    ]);
    expect(studioRuntimeOwner("StudioRenderRuntime").owns).toEqual(["renderer.derived"]);
  });

  it("rejects a renderer that becomes canonical authoring authority", () => {
    const specs = STUDIO_RUNTIME_OWNERSHIP.map((spec) =>
      spec.id === "StudioRenderRuntime"
        ? { ...spec, owns: ["renderer.derived", "authoring.pages"] as const }
        : spec
    );

    expect(validateStudioRuntimeOwnership(specs).map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "renderer-owns-canonical-data",
        "duplicate-domain-owner",
      ]),
    );
  });

  it("rejects dependency cycles and unknown dependencies", () => {
    const specs = STUDIO_RUNTIME_OWNERSHIP.map((spec): StudioRuntimeOwnerSpec => {
      if (spec.id === "StudioAssetRepository") {
        return { ...spec, dependsOn: ["StudioDocumentRuntime"] };
      }
      return spec;
    });
    const withUnknown = [
      ...specs,
      {
        ...studioRuntimeOwner("StudioToolRuntime"),
        id: "UnknownOwner" as never,
        owns: [],
        dependsOn: ["MissingOwner" as never],
      },
    ];

    expect(validateStudioRuntimeOwnership(specs).map((issue) => issue.code)).toContain(
      "dependency-cycle",
    );
    expect(validateStudioRuntimeOwnership(withUnknown).map((issue) => issue.code)).toContain(
      "unknown-dependency",
    );
  });

  it("rejects duplicate owners and missing authority domains", () => {
    const document = studioRuntimeOwner("StudioDocumentRuntime");
    const withoutPublish = STUDIO_RUNTIME_OWNERSHIP.map((spec) =>
      spec.id === "StudioExportRuntime" ? { ...spec, owns: [] } : spec
    );
    const duplicated = [...withoutPublish, document];

    const codes = validateStudioRuntimeOwnership(duplicated).map((issue) => issue.code);
    expect(codes).toContain("duplicate-owner");
    expect(codes).toContain("duplicate-domain-owner");
    expect(codes).toContain("missing-domain-owner");
  });

  it("prevents tool and viewport owners from acquiring review or publish mutation ports", () => {
    const specs = STUDIO_RUNTIME_OWNERSHIP.map((spec) =>
      spec.id === "StudioViewportRuntime"
        ? { ...spec, persistencePorts: [...spec.persistencePorts, "review-api"] as const }
        : spec
    );

    expect(validateStudioRuntimeOwnership(specs).map((issue) => issue.code)).toContain(
      "ui-owner-has-server-workflow-port",
    );
  });
});
