import { createStudioReviewSpatialAnchor, deriveStudioReviewPageMapping } from "@toonspectrum/studio-project-model";

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
import type { StudioProjectSnapshot } from "../studio-project-snapshot";
import type { StudioSharedDocument } from "../studio-shared-document-client";

import type { StudioReviewEditorAuthority, StudioReviewEditorRequest } from "./studio-review-editor-handoff";

export function reviewEditorFixture(digestForTest: (value: Record<string, unknown>) => string) {
  const snapshot: StudioProjectSnapshot = {
    version: 2, savedAt: "2026-09-20T00:00:00.000Z", title: "Source", description: "Description",
    tagsText: "#tag", linkedTitleId: null, linkedSeriesId: null, linkedChallengeId: null,
    pagesList: [
      { id: "p1", elements: [], bg: "#ffffff", bgGrad: null, canvasH: 1200 },
      { id: "p2", elements: [{ id: "cut-2", type: "frame", x: 10, y: 20, width: 600, height: 800 }], bg: "#ffffff", bgGrad: null, canvasH: 1200 },
    ],
    master: { elements: [{ id: "logo", type: "image", src: "data:image/png;base64,a", x: 0, y: 0, width: 20, height: 20, rotation: 0 }] },
    characterBible: createEmptyStudioCharacterBible(), writerRoom: createEmptyStudioWriterRoomDocument(),
    aiProvenance: createEmptyStudioAiProvenanceDocument(), comments: createEmptyStudioCommentsDocument(),
    releaseSchedule: createEmptyStudioReleaseSchedule(), publicationAnalytics: createEmptyStudioPublicationAnalyticsDocument(),
    referenceBoard: createDefaultStudioReferenceBoardDocument(), aiImageReferences: createEmptyStudioAiImageReferenceDocument(),
    currentPageId: "p1", webtoonTheme: "classic", panelGutter: 24,
    publishPack: { profile: "generic", aiUsage: "none", disclosure: "", compliance: DEFAULT_STUDIO_PUBLISH_COMPLIANCE,
      packageSettings: DEFAULT_STUDIO_PUBLISH_PACKAGE_SETTINGS, packageCredits: "" },
  };
  const payload = buildStudioSavePayload({ ...snapshot, cover: "cover", pageImages: [], status: "draft",
    document: { ...snapshot, width: 800 } });
  if (!payload.doc) throw new Error("Missing fixture document");
  const saved: StudioSharedDocument = { workId: "work", role: "owner", status: "active", capabilities: { view: true, edit: true },
    access: "edit", revision: 7, crdtServerSequence: "0", updatedAt: snapshot.savedAt,
    document: { ...payload, doc: payload.doc, status: "draft", titleId: null, seriesId: null, challengeId: null,
      episodeNo: null, remixFromId: null } };
  const digest = digestForTest(saved.document.doc);
  const mapping = deriveStudioReviewPageMapping(saved.document.doc, { sourceServerRevision: 7,
    sourceContentDigest: digest, ordinal: 1, renderWidth: 800, renderHeight: 1200 });
  if (mapping.status !== "mapped") throw new Error(mapping.reason);
  const spatial = createStudioReviewSpatialAnchor(mapping, { kind: "panel", frameId: "cut-2" });
  if (!spatial) throw new Error("Missing spatial fixture");
  const request: StudioReviewEditorRequest = { subject: { schemaVersion: 1, projectId: "graph", workId: "work", artifactId: "artifact",
    reviewId: "review", revisionId: "revision", rootGraphHash: digest }, commentId: "comment" };
  const authority: StudioReviewEditorAuthority = { mapping, expiresAt: Date.now() + 15_000,
    anchor: { ...spatial, artifactId: "artifact", revisionId: "revision", scope: { projectId: "graph" } } };
  return { request, authority, saved, snapshot };
}
