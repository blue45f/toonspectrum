import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createEmptyStudioVersionCoordinates } from "../studio-foundation/studio-version-coordinates";

import type { StudioProjectSnapshot } from "../studio-project-snapshot";
import * as archiveHash from "../studio-sha256";

import {
  migrateStudioProjectSnapshotV2ToArchiveV3,
  projectStudioArchiveV3ToV2Snapshot,
  serializeStudioProjectArchiveV3,
  validateStudioProjectArchiveV3,
  type StudioProjectArchiveV3,
} from "./studio-project-archive-v3";

const NOW = "2026-09-07T00:00:00.000Z";

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
      selectedElementIds: [],
      primarySelectionId: "element-1",
    })).toThrow(/Primary selection/u);
  });

  it("rejects a missing section digest", () => {
    const digests = { ...migrate().archive.manifest.sectionDigests, story: "" };
    expect(() => migrateStudioProjectSnapshotV2ToArchiveV3({
      snapshot: snapshot(),
      archiveId: "archive-1",
      workScope: "work:episode-1",
      createdAt: NOW,
      sourceCoordinates: createEmptyStudioVersionCoordinates(),
      sectionDigests: digests,
    })).toThrow(/section digest is missing: story/u);
  });

  it.each([
    ["metadata", "metadata"],
    ["content", "content"],
    ["story", "story"],
    ["bible", "bible"],
    ["identity", "identity"],
    ["provenance", "provenance"],
    ["assets", "assets"],
    ["publish-draft", "publishDraft"],
    ["operations", "operations"],
    ["local-drafts", "localDrafts"],
  ] as const)("rejects altered %s content before serialization or v2 projection", (key, property) => {
    const { archive, workspace } = migrate();
    const tampered = { ...archive, [property]: { ...archive[property], tampered: true } };
    expect(validateStudioProjectArchiveV3(tampered)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "section-digest-mismatch", path: `manifest.sectionDigests.${key}` }),
      expect.objectContaining({ code: "content-digest-mismatch" }),
    ]));
    expect(() => serializeStudioProjectArchiveV3(tampered)).toThrow(/digest/u);
    expect(() => projectStudioArchiveV3ToV2Snapshot({ archive: tampered, workspace })).toThrow(/digest/u);
  });

  it("rejects forged section and root digest claims", () => {
    const { archive } = migrate();
    const forged = `sha256:${"0".repeat(64)}`;
    expect(validateStudioProjectArchiveV3({
      ...archive,
      manifest: {
        ...archive.manifest,
        sectionDigests: { ...archive.manifest.sectionDigests, metadata: forged },
      },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "section-digest-mismatch", path: "manifest.sectionDigests.metadata" }),
    ]));
    expect(validateStudioProjectArchiveV3({
      ...archive,
      manifest: { ...archive.manifest, contentDigest: forged },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "content-digest-mismatch" }),
    ]));
  });

  it("binds the v2 compatibility payload in the root digest", () => {
    const { archive, workspace } = migrate();
    const tampered = {
      ...archive,
      compatibility: { characterBibleV1: { version: 1 as const, characters: [] } },
    };
    expect(validateStudioProjectArchiveV3(tampered)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "content-digest-mismatch" }),
    ]));
    expect(() => projectStudioArchiveV3ToV2Snapshot({ archive: tampered, workspace })).toThrow(/digest/u);
  });

  it("accepts matching migration claims but rejects mismatches instead of overwriting them", () => {
    const { archive } = migrate();
    const input = {
      snapshot: snapshot(),
      archiveId: "archive-1",
      workScope: "work:episode-1",
      createdAt: NOW,
      sourceCoordinates: createEmptyStudioVersionCoordinates(),
      contentDigest: archive.manifest.contentDigest,
      sectionDigests: archive.manifest.sectionDigests,
    };
    expect(migrateStudioProjectSnapshotV2ToArchiveV3(input).archive.manifest).toEqual(archive.manifest);
    expect(() => migrateStudioProjectSnapshotV2ToArchiveV3({
      ...input,
      contentDigest: `sha256:${"0".repeat(64)}`,
    })).toThrow(/content digest does not match/u);
    expect(() => migrateStudioProjectSnapshotV2ToArchiveV3({
      ...input,
      sectionDigests: { ...input.sectionDigests, story: `sha256:${"0".repeat(64)}` },
    })).toThrow(/section digest does not match/u);
  });

  it("matches JSON storage semantics and remains stable across key ordering and round trips", () => {
    const writerRoom = {
      date: new Date(NOW),
      missing: undefined,
      values: [undefined, Number.NaN, Number.POSITIVE_INFINITY, -0],
      shaped: { toJSON: () => ({ b: 2, a: 1 }) },
    } as unknown as StudioProjectSnapshot["writerRoom"];
    const { archive } = migrate({ ...snapshot(), writerRoom });
    const restored = JSON.parse(serializeStudioProjectArchiveV3(archive)) as StudioProjectArchiveV3;
    expect(restored.story.writerRoom).toEqual({
      date: NOW,
      values: [null, null, null, 0],
      shaped: { b: 2, a: 1 },
    });
    expect(restored.manifest).toEqual(archive.manifest);
    expect(validateStudioProjectArchiveV3(restored)).toEqual([]);
    expect(validateStudioProjectArchiveV3({
      ...restored,
      metadata: Object.fromEntries(Object.entries(restored.metadata).reverse()) as StudioProjectArchiveV3["metadata"],
    })).toEqual([]);
  });

  it("preserves legacy UTF-16 canonical bytes for Unicode, surrogate and monetary keys", () => {
    // This explicit legacy preimage also pins JSON's integer-key enumeration:
    // 2 precedes 10, while non-index monetary keys keep the string order $10, $2.
    const canonicalStory = String.raw`{"writerRoom":{"canonicalProbe":{"2":"two","10":"ten","$10":"ten dollars","$2":"two dollars","A":"upper","a":"lower","é":"decomposed","é":"composed","가":"hangul","\ud800":"lone high","𐀀":"supplementary","😀":"emoji","\udfff":"lone low","":"private"},"marker":"writer"}}`;
    const entries = [
      ["2", "two"], ["10", "ten"], ["$10", "ten dollars"], ["$2", "two dollars"],
      ["A", "upper"], ["a", "lower"], ["e\u0301", "decomposed"], ["é", "composed"],
      ["가", "hangul"], ["\ud800", "lone high"], ["\u{10000}", "supplementary"],
      ["😀", "emoji"], ["\udfff", "lone low"], ["\ue000", "private"],
    ] as const;
    const expectedStoryDigest = `sha256:${createHash("sha256").update(canonicalStory).digest("hex")}`;
    const preimages: string[] = [];
    const createActualHasher = archiveHash.createSha256Portable;
    const hashFactory = vi.spyOn(archiveHash, "createSha256Portable").mockImplementation(() => {
      const hasher = createActualHasher();
      const update = hasher.update.bind(hasher);
      hasher.update = (bytes) => {
        preimages.push(new TextDecoder().decode(bytes));
        return update(bytes);
      };
      return hasher;
    });
    const locale = vi.spyOn(String.prototype, "localeCompare").mockImplementation(() => {
      throw new Error("Archive digest ordering must not depend on locale");
    });
    try {
      const manifests = [entries, [...entries].reverse(), [...entries.slice(5), ...entries.slice(0, 5)]]
        .map((order) => {
          const writerRoom = { ...snapshot().writerRoom, canonicalProbe: Object.fromEntries(order) };
          const { archive, workspace } = migrate({ ...snapshot(), writerRoom });
          expect(archive.manifest.sectionDigests.story).toBe(expectedStoryDigest);
          const serialized = serializeStudioProjectArchiveV3(archive);
          const restored: StudioProjectArchiveV3 = JSON.parse(serialized);
          expect(validateStudioProjectArchiveV3(restored)).toEqual([]);
          expect(serializeStudioProjectArchiveV3(restored)).toBe(serialized);
          expect(projectStudioArchiveV3ToV2Snapshot({ archive: restored, workspace }).writerRoom).toEqual(writerRoom);
          return archive.manifest;
        });
      expect(manifests[1]).toEqual(manifests[0]);
      expect(manifests[2]).toEqual(manifests[0]);
      const storyPreimages = preimages.filter((value) => value.startsWith('{"writerRoom":'));
      expect(storyPreimages.length).toBeGreaterThanOrEqual(3);
      expect(storyPreimages.every((value) => value === canonicalStory)).toBe(true);
    } finally {
      locale.mockRestore();
      hashFactory.mockRestore();
    }
  });

  it("serializes the same normalized payload that was validated without a second toJSON call", () => {
    const { archive } = migrate();
    let calls = 0;
    const input = {
      ...archive,
      toJSON: () => {
        calls += 1;
        return calls === 1 ? archive : { ...archive, metadata: { ...archive.metadata, title: "tampered" } };
      },
    };
    expect(JSON.parse(serializeStudioProjectArchiveV3(input)).metadata.title).toBe(archive.metadata.title);
    expect(calls).toBe(1);
  });

  it.each(["null", "missing-section", "bigint", "cycle"])("fails closed on malformed or unserializable input: %s", (kind) => {
    const { archive } = migrate();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const invalid = (kind === "null" ? null
      : kind === "missing-section" ? { ...archive, content: null }
        : { ...archive, story: { writerRoom: kind === "bigint" ? BigInt(1) : cycle } }) as unknown as StudioProjectArchiveV3;
    expect(validateStudioProjectArchiveV3(invalid)).toEqual([
      expect.objectContaining({ code: "invalid-archive" }),
    ]);
    expect(() => serializeStudioProjectArchiveV3(invalid)).toThrow();
  });

  it("keeps external workspace state outside all archive digests", () => {
    const first = migrate();
    const second = migrate({ ...snapshot(), currentPageId: "page-2" });
    expect(second.workspace.currentPageId).not.toBe(first.workspace.currentPageId);
    expect(second.archive.manifest.contentDigest).toBe(first.archive.manifest.contentDigest);
    expect(second.archive.manifest.sectionDigests).toEqual(first.archive.manifest.sectionDigests);
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
