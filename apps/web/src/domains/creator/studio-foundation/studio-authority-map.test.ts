import { describe, expect, it } from "vitest";

import {
  STUDIO_AUTHORITY_DOMAINS,
  studioAuthoritySpec,
  studioAuthoritySpecs,
  validateStudioAuthorityMap,
  validateStudioAuthoritySpecs,
  type StudioAuthoritySpec,
} from "./studio-authority-map";

describe("studio authority map", () => {
  it("assigns exactly one valid owner to every authority domain", () => {
    expect(studioAuthoritySpecs()).toHaveLength(STUDIO_AUTHORITY_DOMAINS.length);
    expect(validateStudioAuthorityMap()).toEqual([]);
  });

  it("keeps authored pages durable and server-revision backed", () => {
    expect(studioAuthoritySpec("authoring.pages")).toMatchObject({
      logicalOwner: "StudioDocumentRuntime",
      localAuthority: "sqlite-opfs",
      remoteAuthority: "creator-work-revision",
      archiveSection: "content.pagesList",
    });
  });

  it("keeps renderer output rebuildable instead of making it document authority", () => {
    expect(studioAuthoritySpec("renderer.derived")).toEqual({
      domain: "renderer.derived",
      kind: "derived",
      logicalOwner: "StudioRenderRuntime",
      mutationBoundary: "StudioRenderProjection",
      localAuthority: "memory",
      remoteAuthority: "none",
      archiveSection: null,
      versionCoordinate: "source-document-digest",
      derivedConsumers: [],
    });
  });

  it("surfaces duplicate and missing owners", () => {
    const specs = studioAuthoritySpecs();
    const withoutPublish = specs.filter((spec) => spec.domain !== "workflow.publish");
    const duplicate = studioAuthoritySpec("workflow.review");
    const issues = validateStudioAuthoritySpecs([...withoutPublish, duplicate]);

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate-domain", domain: "workflow.review" }),
      expect.objectContaining({ code: "missing-domain", domain: "workflow.publish" }),
    ]));
  });

  it("rejects durable, workflow, derived and presence authority drift", () => {
    const base = studioAuthoritySpec("authoring.pages");
    const invalid: StudioAuthoritySpec[] = [
      { ...base, localAuthority: "none" },
      {
        ...studioAuthoritySpec("workflow.review"),
        remoteAuthority: "none",
      },
      {
        ...studioAuthoritySpec("renderer.derived"),
        localAuthority: "sqlite-opfs",
      },
      {
        ...studioAuthoritySpec("presence.ephemeral"),
        archiveSection: "content.presence",
      },
    ];

    const issues = validateStudioAuthoritySpecs(invalid);
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "durable-data-without-local-authority",
      "workflow-without-remote-authority",
      "derived-data-persisted",
      "presence-not-ephemeral",
    ]));
  });
});
