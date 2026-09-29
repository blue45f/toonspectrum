import { readFileSync } from "node:fs";

import { ImageEmbedder } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";

import {
  STUDIO_VRM_AVATAR_REFERENCE_HARNESS_VERSION,
  admitStudioVrmAvatarReferenceHarnessFixture,
  measureStudioVrmAvatarReferenceTopN,
  type StudioVrmAvatarReferenceHarnessFixture,
} from "./studio-vrm-avatar-reference-recommendation-harness";
import { StudioVrmAvatarReferenceError } from "./studio-vrm-avatar-reference-recommendation";

function fixtureJson(): unknown {
  const raw = readFileSync(
    new URL(
      "./__fixtures__/studio-vrm-avatar-reference-recommendation-harness.json",
      import.meta.url,
    ),
    "utf-8",
  );
  return JSON.parse(raw) as unknown;
}

function admitFixture(source: unknown = fixtureJson()): StudioVrmAvatarReferenceHarnessFixture {
  return admitStudioVrmAvatarReferenceHarnessFixture(source);
}

describe("Avatar reference recommendation harness", () => {
  it("measures Top-1 and Top-3 hit rates on synthetic embeddings", () => {
    const fixture = admitFixture();
    expect(fixture.catalogue.entries).toHaveLength(5);
    expect(fixture.queries).toHaveLength(5);

    const top1 = measureStudioVrmAvatarReferenceTopN({
      catalogue: fixture.catalogue,
      queries: fixture.queries,
      topN: 1,
      cosineSimilarity: ImageEmbedder.cosineSimilarity,
    });
    expect(top1).toMatchObject({
      version: STUDIO_VRM_AVATAR_REFERENCE_HARNESS_VERSION,
      catalogueRevision: "synthetic-harness-v1",
      topN: 1,
      totalQueries: 5,
      hits: 4,
      accuracy: 0.8,
      top1Hits: 4,
      top1Accuracy: 0.8,
    });
    expect(top1.results.find((result) => result.queryId === "q-action-ambiguous")).toMatchObject({
      expectedPresetId: "action-pony",
      rankOfExpected: null,
      hit: false,
      top1Hit: false,
    });

    const top3 = measureStudioVrmAvatarReferenceTopN({
      catalogue: fixture.catalogue,
      queries: fixture.queries,
      topN: 3,
      cosineSimilarity: ImageEmbedder.cosineSimilarity,
    });
    expect(top3).toMatchObject({
      topN: 3,
      totalQueries: 5,
      hits: 5,
      accuracy: 1,
      top1Hits: 4,
      top1Accuracy: 0.8,
    });
    expect(top3.results.find((result) => result.queryId === "q-action-ambiguous")).toMatchObject({
      rankOfExpected: 2,
      hit: true,
      top1Hit: false,
    });
    expect(top3.results.find((result) => result.queryId === "q-pop-midpoint")).toMatchObject({
      rankOfExpected: 1,
      hit: true,
      top1Hit: true,
    });
    expect(Object.isFrozen(top3)).toBe(true);
    expect(Object.isFrozen(top3.results)).toBe(true);
    expect(Object.isFrozen(top3.results[0]?.topPresetIds)).toBe(true);
  });

  it("is deterministic across repeated measurements", () => {
    const fixture = admitFixture();
    const input = {
      catalogue: fixture.catalogue,
      queries: fixture.queries,
      topN: 3,
      cosineSimilarity: ImageEmbedder.cosineSimilarity,
    };
    expect(measureStudioVrmAvatarReferenceTopN(input)).toEqual(
      measureStudioVrmAvatarReferenceTopN(input),
    );
  });

  it("rejects invalid Top-N windows, empty or duplicated queries, and off-catalogue labels", () => {
    const fixture = admitFixture();
    const base = {
      catalogue: fixture.catalogue,
      queries: fixture.queries,
      cosineSimilarity: ImageEmbedder.cosineSimilarity,
    };
    for (const topN of [0, 6, Number.NaN]) {
      expect(() => measureStudioVrmAvatarReferenceTopN({ ...base, topN })).toThrowError(
        expect.objectContaining<Partial<StudioVrmAvatarReferenceError>>({ code: "protocol" }),
      );
    }
    expect(() => measureStudioVrmAvatarReferenceTopN({ ...base, topN: 3, queries: [] }))
      .toThrowError(StudioVrmAvatarReferenceError);
    expect(() => measureStudioVrmAvatarReferenceTopN({
      ...base,
      topN: 3,
      queries: [fixture.queries[0]!, fixture.queries[0]!],
    })).toThrowError(StudioVrmAvatarReferenceError);
    expect(() => measureStudioVrmAvatarReferenceTopN({
      ...base,
      topN: 3,
      queries: [{ ...fixture.queries[0]!, expectedPresetId: "not-a-preset" }],
    })).toThrowError(StudioVrmAvatarReferenceError);
    expect(() => measureStudioVrmAvatarReferenceTopN({
      ...base,
      topN: 3,
      queries: [{ ...fixture.queries[0]!, expectedPresetId: "wave-diva" }],
    })).toThrowError(StudioVrmAvatarReferenceError);
  });

  it("admits only the pinned-model fixture shape and rejects tampered fixtures fail-closed", () => {
    const source = fixtureJson() as Record<string, unknown>;
    const queries = source.queries as Array<Record<string, unknown>>;
    expect(admitFixture(source).catalogue).toMatchObject({
      providerId: "google-mediapipe-tasks-vision/image-embedder",
      modelId: "mobilenet-v3-small-float32",
      modelRevision: "1",
    });
    for (const tampered of [
      { ...source, version: 999 },
      { ...source, catalogueRevision: "not a revision!" },
      { ...source, entries: [] },
      { ...source, queries: [] },
      {
        ...source,
        queries: [queries[0], queries[0]],
      },
      {
        ...source,
        queries: [{ ...queries[0], expectedPresetId: "wave-diva" }],
      },
      {
        ...source,
        queries: [{ ...queries[0], queryEmbeddingSha256: "not-a-hash" }],
      },
    ]) {
      expect(() => admitFixture(tampered)).toThrowError(
        expect.objectContaining<Partial<StudioVrmAvatarReferenceError>>({ code: "protocol" }),
      );
    }
  });
});
