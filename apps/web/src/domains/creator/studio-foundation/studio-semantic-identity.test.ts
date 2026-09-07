import { describe, expect, it } from "vitest";

import {
  addStudioIdentityReference,
  buildStudioSemanticIdentityShadowIndex,
  canonicalStudioDomainReferenceKey,
  createEmptyStudioIdentityIndex,
  createStudioIdentityLink,
  deriveStudioIdentityLinkState,
  removeStudioIdentityReference,
  resolveStudioSemanticId,
  upsertStudioIdentityLink,
  validateStudioIdentityIndex,
  type StudioDomainReference,
  type StudioIdentityIndexV1,
} from "./studio-semantic-identity";

const NOW = "2026-09-07T00:00:00.000Z";
const writerPanel: StudioDomainReference = {
  domain: "writer-room",
  entityType: "panel",
  entityId: "writer-panel-1",
};
const comicPanel: StudioDomainReference = {
  domain: "comic-graph",
  entityType: "panel",
  pageId: "comic-page-1",
  entityId: "comic-panel-1",
};

describe("studio semantic identity", () => {
  it("uses a collision-safe canonical reference key", () => {
    expect(canonicalStudioDomainReferenceKey(writerPanel)).toBe(
      '["writer-room","panel",null,"writer-panel-1"]',
    );
    expect(canonicalStudioDomainReferenceKey(comicPanel)).toBe(
      '["comic-graph","panel","comic-page-1","comic-panel-1"]',
    );
  });

  it("derives active, detached, orphaned and deleted states", () => {
    expect(deriveStudioIdentityLinkState("panel", [writerPanel])).toBe("active");
    expect(deriveStudioIdentityLinkState("panel", [
      { domain: "comments", entityType: "thread", entityId: "thread-1" },
    ])).toBe("detached");
    expect(deriveStudioIdentityLinkState("panel", [])).toBe("orphaned");
    expect(deriveStudioIdentityLinkState("panel", [writerPanel], "deleted")).toBe("deleted");
  });

  it("links one semantic panel across writer, comic and page domains", () => {
    let index = createEmptyStudioIdentityIndex("work:chapter-1");
    index = upsertStudioIdentityLink(index, {
      semanticId: "panel:scene-1:1",
      kind: "panel",
      references: [writerPanel, comicPanel],
      source: "native",
      createdAt: NOW,
    });
    index = addStudioIdentityReference(index, "panel:scene-1:1", {
      domain: "page-state",
      entityType: "frame",
      pageId: "page-1",
      entityId: "frame-1",
    });

    expect(resolveStudioSemanticId(index, comicPanel)).toBe("panel:scene-1:1");
    expect(index.links[0]).toMatchObject({
      state: "active",
      references: expect.arrayContaining([writerPanel, comicPanel]),
    });
    expect(validateStudioIdentityIndex(index)).toEqual([]);
  });

  it("moves a visual-only identity between detached and orphaned states", () => {
    const pageReference: StudioDomainReference = {
      domain: "page-state",
      entityType: "frame",
      pageId: "page-1",
      entityId: "frame-1",
    };
    let index = createEmptyStudioIdentityIndex("work:chapter-1");
    index = upsertStudioIdentityLink(index, {
      semanticId: "panel:detached",
      kind: "panel",
      references: [pageReference],
      source: "legacy-derived",
      confidence: 0.75,
      createdAt: NOW,
    });
    expect(index.links[0].state).toBe("detached");

    index = removeStudioIdentityReference(index, "panel:detached", pageReference);
    expect(index.links[0].state).toBe("orphaned");
  });

  it("prevents one domain entity from belonging to two semantic identities", () => {
    let index = createEmptyStudioIdentityIndex("work:chapter-1");
    index = upsertStudioIdentityLink(index, {
      semanticId: "panel:one",
      kind: "panel",
      references: [writerPanel],
      source: "native",
      createdAt: NOW,
    });

    expect(() => upsertStudioIdentityLink(index, {
      semanticId: "panel:two",
      kind: "panel",
      references: [writerPanel],
      source: "native",
      createdAt: NOW,
    })).toThrow(/already belongs/u);
  });

  it("never invents missing IDs during a legacy shadow scan", () => {
    const result = buildStudioSemanticIdentityShadowIndex({
      workScope: "work:chapter-1",
      now: () => NOW,
      candidates: [
        { kind: "panel", reference: writerPanel },
        {
          semanticId: "panel:known",
          kind: "panel",
          reference: comicPanel,
          confidence: 0.9,
        },
      ],
    });

    expect(result.index.links.map((link) => link.semanticId)).toEqual(["panel:known"]);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "missing-semantic-id", candidateIndex: 0 }),
    ]));
  });

  it("reports duplicate IDs, competing reference owners and stale stored states", () => {
    const duplicateLink = createStudioIdentityLink({
      semanticId: "panel:duplicate",
      kind: "panel",
      references: [writerPanel],
      source: "native",
      createdAt: NOW,
    });
    const duplicateIdWithDifferentReference = createStudioIdentityLink({
      semanticId: "panel:duplicate",
      kind: "panel",
      references: [comicPanel],
      source: "native",
      createdAt: NOW,
    });
    const competingReferenceOwner = createStudioIdentityLink({
      semanticId: "panel:other",
      kind: "panel",
      references: [writerPanel],
      source: "native",
      createdAt: NOW,
    });
    const invalid: StudioIdentityIndexV1 = {
      version: 1,
      workScope: "work:chapter-1",
      links: [
        { ...duplicateLink, state: "orphaned" },
        duplicateIdWithDifferentReference,
        competingReferenceOwner,
      ],
    };

    expect(validateStudioIdentityIndex(invalid).map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "duplicate-semantic-id",
        "reference-owned-by-another-link",
        "state-mismatch",
      ]),
    );
  });
});
