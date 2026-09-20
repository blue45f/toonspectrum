import { describe, expect, it } from "vitest";

import { createEmptyStudioAiImageReferenceDocument } from "../ai/studio-ai-image-reference-roles";
import { createEmptyStudioAiProvenanceDocument } from "../ai/studio-ai-provenance";
import { createEmptyStudioCharacterBible } from "../studio-character-bible";
import { createEmptyStudioCommentsDocument } from "../studio-comments";
import { createEmptyStudioPublicationAnalyticsDocument } from "../studio-publication-analytics";
import { DEFAULT_STUDIO_PUBLISH_COMPLIANCE } from "../studio-publish-compliance";
import { DEFAULT_STUDIO_PUBLISH_PACKAGE_SETTINGS } from "../studio-publish-package";
import { createDefaultStudioReferenceBoardDocument } from "../studio-reference-board";
import { createEmptyStudioReleaseSchedule } from "../studio-release-schedule";
import { buildStudioSavePayload } from "../studio-save-payload";
import { createEmptyStudioWriterRoomDocument } from "../studio-writer-room";

import { projectStudioReviewCaptureSource } from "./studio-review-capture-projection";

import type { ImageEl } from "../studio-element-model";
import type { StudioProjectSnapshot } from "../studio-project-snapshot";
import type { StudioSharedDocument } from "../studio-shared-document-client";

function fixture() {
  const snapshot: StudioProjectSnapshot = {
    version: 2, savedAt: "2026-09-20T00:00:00.000Z", title: " Source ", description: " Description ",
    tagsText: "#tag", linkedTitleId: null, linkedSeriesId: null, linkedChallengeId: null,
    pagesList: [{ id: "p1", elements: [], bg: "#ffffff", bgGrad: null, canvasH: 1200 }], master: undefined,
    characterBible: createEmptyStudioCharacterBible(), writerRoom: createEmptyStudioWriterRoomDocument(),
    aiProvenance: createEmptyStudioAiProvenanceDocument(), comments: createEmptyStudioCommentsDocument(),
    releaseSchedule: createEmptyStudioReleaseSchedule(), publicationAnalytics: createEmptyStudioPublicationAnalyticsDocument(),
    referenceBoard: createDefaultStudioReferenceBoardDocument(), aiImageReferences: createEmptyStudioAiImageReferenceDocument(),
    currentPageId: "p1", webtoonTheme: "classic", panelGutter: 24,
    publishPack: { profile: "generic", aiUsage: "none", disclosure: "", compliance: DEFAULT_STUDIO_PUBLISH_COMPLIANCE,
      packageSettings: DEFAULT_STUDIO_PUBLISH_PACKAGE_SETTINGS, packageCredits: "" },
  };
  const payload = buildStudioSavePayload({ ...snapshot, cover: "cover", pageImages: [], status: "draft",
    document: { ...snapshot, extensionBase: { extension: { retain: true } }, width: 800 } });
  if (!payload.doc) throw new Error("Missing fixture document");
  const saved: StudioSharedDocument = { workId: "work", role: "owner", status: "active", capabilities: { view: true, edit: true },
    access: "edit", revision: 7, crdtServerSequence: "0", updatedAt: snapshot.savedAt,
    document: { ...payload, doc: payload.doc, status: "draft", titleId: null, seriesId: null, challengeId: null,
      episodeNo: null, remixFromId: null } };
  return { snapshot, saved };
}

describe("review source save projection", () => {
  it("matches the real save payload while retaining extensions and ignoring only active-page navigation", () => {
    const { snapshot, saved } = fixture();
    const projected = projectStudioReviewCaptureSource({ ...snapshot, currentPageId: "other-page" }, saved, 800, () => false);
    expect(projected.doc).toEqual(saved.document.doc);
    expect(projected).toMatchObject({ title: "Source", description: "Description", tags: ["tag"], pageCount: 1 });
    expect(projected.doc.extension).toEqual({ retain: true });
  });
  it("keeps real ink changes in the digest projection instead of substituting the saved pages", () => {
    const { snapshot, saved } = fixture();
    const next = { ...snapshot, pagesList: [{ ...snapshot.pagesList[0]!, bg: "#000000" }] };
    expect(projectStudioReviewCaptureSource(next, saved, 800, () => false).doc).not.toEqual(saved.document.doc);
  });
  it("strips only acknowledged durable mask fallbacks and rejects render-only blob locators", () => {
    const { snapshot, saved } = fixture();
    const image: ImageEl = { id: "image", type: "image", src: "data:image/png;base64,a", x: 0, y: 0, width: 10, height: 10, rotation: 0,
      filterMaskSurfaceId: "filter-mask:v1:12345678-1234-4234-8234-123456789abc", filterMaskSrc: "data:image/png;base64,mask" };
    snapshot.pagesList[0]!.elements = [image];
    const local = projectStudioReviewCaptureSource(snapshot, saved, 800, () => false);
    expect((local.doc.pagesList as StudioProjectSnapshot["pagesList"])[0]!.elements[0]).toHaveProperty("filterMaskSrc");
    const durable = projectStudioReviewCaptureSource(snapshot, saved, 800, () => true);
    expect((durable.doc.pagesList as StudioProjectSnapshot["pagesList"])[0]!.elements[0]).not.toHaveProperty("filterMaskSrc");
    snapshot.pagesList[0]!.elements = [{ ...image, filterMaskSrc: "blob:render-only" }];
    expect(() => projectStudioReviewCaptureSource(snapshot, saved, 800, () => true)).toThrow("Blob URL");
  });
});
