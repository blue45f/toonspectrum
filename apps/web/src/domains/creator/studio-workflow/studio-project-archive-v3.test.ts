import { describe, expect, it } from "vitest";

import { createEmptyStudioVersionCoordinates } from "../studio-foundation/studio-version-coordinates";

import type { StudioProjectSnapshot } from "../studio-project-snapshot";

import {
  STUDIO_PROJECT_ARCHIVE_SECTION_KEYS,
  migrateStudioProjectSnapshotV2ToArchiveV3,
  projectStudioArchiveV3ToV2Snapshot,
  serializeStudioProjectArchiveV3,
  validateStudioProjectArchiveV3,
  type StudioProjectArchiveSectionKey,
} from "./studio-project-archive-v3";

const NOW = "2026-09-07T00:00:00.000Z";

function sectionDigests(): Readonly<Record<StudioProjectArchiveSectionKey, string>> {
  return Object.fromEntries(
    STUDIO_PROJECT_ARCHIVE_SECTION_KEYS.map((key) => [key, `digest-${key}`]),
  ) as Readonly<Record<StudioProjectArchiveSectionKey, string>>;
}

function snapshot(): StudioProjectSnapshot {
  return {
    version: 2,
    savedAt: NOW,
    title: "작품",
    description: "설명",
    tagsText: "로맨스, 학교",
    linkedTitleId: "title-1",
    linkedSeriesId: "series-1",
    linkedChallengeId: null,
    pagesList: [],
    master: undefined,
    characterBible: {
      version: 1,
      characters: [{
        id: "character-sua",
        name: "수아",
        role: "주인공",
        appearance: "짧은 검은 머리",
        costume: "교복",
        colors: ["검정"],
        voice: "단정한 말투",
        goal: "친구를 지킨다",
        relationships: [],
        props: ["은색 반지"],
        lockedFields: ["appearance"],
      }],
    },
    writerRoom: { marker: "writer" } as unknown as StudioProjectSnapshot["writerRoom"],
    aiProvenance: { marker: "provenance" } as unknown as StudioProjectSnapshot["aiProvenance"],
    comments: { marker: "local-comments" } as unknown as StudioProjectSnapshot["comments"],
    releaseSchedule: { marker: "schedule" } as unknown as StudioProjectSnapshot["releaseSchedule"],
    publicationAnalytics: { marker: "analytics" } as unknown as StudioProjectSnapshot["publicationAnalytics"],
    referenceBoard: { marker: "reference-board" } as unknown as StudioProjectSnapshot["referenceBoard"],
    aiImageReferences: { marker: "image-references" } as unknown as StudioProjectSnapshot["aiImageReferences"],
    currentPageId: "page-1",
    webtoonTheme: "classic" as StudioProjectSnapshot["webtoonTheme"],
    panelGutter: 24,
    publishPack: { marker: "publish" } as unknown as StudioProjectSnapshot["publishPack"],
  };
}

function migrate(source = snapshot()) {
  return migrateStudioProjectSnapshotV2ToArchiveV3({
    snapshot: source,
    archiveId: "archive-1",
    workScope: "work:episode-1",
    createdAt: NOW,
    sourceCoordinates: createEmptyStudioVersionCoordinates(),
    contentDigest: "digest-content-root",
    sectionDigests: sectionDigests(),
    selectedElementIds: ["element-1"],
    primarySelectionId: "element-1",
    zoom: 1.25,
    panX: 10,
    panY: 20,
    activeTool: "draw",
  });
}

describe("Studio project archive v3", () => {
  it("separates authoring content, local workspace, local comments, and operations", () => {
    const { archive, workspace } = migrate();

    expect(archive.version).toBe(3);
    expect(archive.content.pagesList).toEqual([]);
    expect(archive.bible.characterBible.version).toBe(2);
    expect(archive.localDrafts.comments).toEqual({ marker: "local-comments" });
    expect(archive.operations.releaseSchedule).toEqual({ marker: "schedule" });
    expect("currentPageId" in archive.content).toBe(false);
    expect("selectedElementIds" in archive.content).toBe(false);
    expect(workspace).toMatchObject({
      currentPageId: "page-1",
      selectedElementIds: ["element-1"],
      primarySelectionId: "element-1",
      activeTool: "draw",
      zoom: 1.25,
    });
    expect(validateStudioProjectArchiveV3(archive)).toEqual([]);
    expect(() => serializeStudioProjectArchiveV3(archive)).not.toThrow();
  });

  it("round-trips the complete v2 compatibility payload without making v2 canonical", () => {
    const source = snapshot();
    const { archive, workspace } = migrate(source);
    const projected = projectStudioArchiveV3ToV2Snapshot({ archive, workspace });

    expect(projected).toEqual(source);
    expect(archive.compatibility.characterBibleV1).toEqual(source.characterBible);
    expect(archive.bible.characterBible.version).toBe(2);
  });

  it("keeps asset bytes outside JSON and records the legacy-reference migration warning", () => {
    const { archive } = migrate();

    expect(archive.assets.revisions).toEqual([]);
    expect(archive.assets.legacyEmbeddedReferencesPresent).toBe(true);
    expect(archive.manifest.migrationReceipts[0].warnings).toHaveLength(1);
    expect(JSON.parse(serializeStudioProjectArchiveV3(archive)).assets.revisions).toEqual([]);
  });

  it("rejects a primary selection outside the workspace selection set", () => {
    expect(() => migrateStudioProjectSnapshotV2ToArchiveV3({
      snapshot: snapshot(),
      archiveId: "archive-1",
      workScope: "work:episode-1",
      createdAt: NOW,
      sourceCoordinates: createEmptyStudioVersionCoordinates(),
      contentDigest: "digest-content-root",
      sectionDigests: sectionDigests(),
      selectedElementIds: [],
      primarySelectionId: "element-1",
    })).toThrow(/Primary selection/u);
  });

  it("rejects a missing section digest", () => {
    const digests = { ...sectionDigests(), story: "" };
    expect(() => migrateStudioProjectSnapshotV2ToArchiveV3({
      snapshot: snapshot(),
      archiveId: "archive-1",
      workScope: "work:episode-1",
      createdAt: NOW,
      sourceCoordinates: createEmptyStudioVersionCoordinates(),
      contentDigest: "digest-content-root",
      sectionDigests: digests,
    })).toThrow(/section digest is missing: story/u);
  });

  it("detects workspace or review state smuggled into authoring content", () => {
    const { archive } = migrate();
    const invalid = {
      ...archive,
      content: {
        ...archive.content,
        currentPageId: "page-1",
        approvals: [{ id: "approval-1" }],
      },
    };

    expect(validateStudioProjectArchiveV3(invalid).map((issue) => issue.code)).toContain(
      "workspace-inside-content",
    );
  });
});
