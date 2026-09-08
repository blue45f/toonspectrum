import { describe, expect, it } from "vitest";

import {
  computeStudioInsertBatchPlacements,
  selectStudioInsertBatchFiles,
  STUDIO_INSERT_BATCH_MAX_IMAGE_BYTES,
  STUDIO_INSERT_BATCH_MAX_ITEMS,
  STUDIO_INSERT_BATCH_MAX_OPEN_RASTER_BYTES,
  type StudioInsertBatchFileLike,
  type StudioInsertBatchLayout,
  type StudioInsertBatchPlacement,
} from "./studio-insert-batch-model";

function file(
  name: string,
  size = 1024,
  type = "image/png",
  lastModified = 1,
): StudioInsertBatchFileLike {
  return { name, size, type, lastModified };
}

function expectInside(
  placement: StudioInsertBatchPlacement,
  target: { x: number; y: number; width: number; height: number },
): void {
  expect(placement.x).toBeGreaterThanOrEqual(target.x);
  expect(placement.y).toBeGreaterThanOrEqual(target.y);
  expect(placement.x + placement.width).toBeLessThanOrEqual(
    target.x + target.width + 0.001,
  );
  expect(placement.y + placement.height).toBeLessThanOrEqual(
    target.y + target.height + 0.001,
  );
}

describe("selectStudioInsertBatchFiles", () => {
  it("keeps supported files in input order and rejects duplicate identities", () => {
    const existing = [file("existing.png", 20, "image/png", 10)];
    const hero = file("hero.webp", 30, "image/webp", 20);
    const background = file("background.tiff", 40, "image/tiff", 30);
    const result = selectStudioInsertBatchFiles(existing, [
      hero,
      existing[0]!,
      background,
      hero,
    ]);

    expect(result.accepted).toEqual([hero, background]);
    expect(result.rejected.map((entry) => entry.code)).toEqual([
      "duplicate",
      "duplicate",
    ]);
  });

  it("rejects empty, unsupported, and per-format oversized files", () => {
    const result = selectStudioInsertBatchFiles([], [
      file("empty.png", 0),
      file("notes.txt", 10, "text/plain"),
      file("huge.png", STUDIO_INSERT_BATCH_MAX_IMAGE_BYTES + 1),
      file(
        "huge.tiff",
        STUDIO_INSERT_BATCH_MAX_OPEN_RASTER_BYTES + 1,
        "image/tiff",
      ),
    ]);

    expect(result.accepted).toEqual([]);
    expect(result.rejected.map((entry) => entry.code)).toEqual([
      "empty",
      "unsupported",
      "file-too-large",
      "file-too-large",
    ]);
  });

  it("bounds item count and aggregate original bytes", () => {
    const existing = Array.from({ length: STUDIO_INSERT_BATCH_MAX_ITEMS - 1 }, (_, index) =>
      file(`existing-${index}.png`, 10, "image/png", index),
    );
    const countResult = selectStudioInsertBatchFiles(existing, [
      file("last.png", 10, "image/png", 100),
      file("overflow.png", 10, "image/png", 101),
    ]);
    expect(countResult.accepted.map((entry) => entry.name)).toEqual([
      "last.png",
    ]);
    expect(countResult.rejected[0]?.code).toBe("too-many");

    const byteResult = selectStudioInsertBatchFiles(
      [file("existing.png", 60)],
      [file("accepted.png", 40), file("overflow.png", 1)],
      { maxTotalBytes: 100 },
    );
    expect(byteResult.accepted.map((entry) => entry.name)).toEqual([
      "accepted.png",
    ]);
    expect(byteResult.rejected[0]?.code).toBe("batch-too-large");
  });
});

describe("computeStudioInsertBatchPlacements", () => {
  const target = { x: 100, y: 200, width: 900, height: 1200 };
  const sources = [
    { id: "wide", width: 800, height: 400 },
    { id: "portrait", width: 300, height: 700 },
    { id: "square", width: 500, height: 500 },
    { id: "small", width: 80, height: 60 },
  ];

  it.each<StudioInsertBatchLayout>([
    "grid",
    "row",
    "column",
    "cascade",
  ])("keeps %s placements ordered, contained, proportional, and non-upscaled", (layout) => {
    const placements = computeStudioInsertBatchPlacements(sources, {
      layout,
      spacing: "comfortable",
      target,
    });

    expect(placements.map((placement) => placement.id)).toEqual(
      sources.map((source) => source.id),
    );
    placements.forEach((placement, index) => {
      const source = sources[index]!;
      expectInside(placement, target);
      expect(placement.width).toBeLessThanOrEqual(source.width);
      expect(placement.height).toBeLessThanOrEqual(source.height);
      expect(placement.width / placement.height).toBeCloseTo(
        source.width / source.height,
        3,
      );
    });
  });

  it("uses deterministic grid coordinates for the same request", () => {
    const first = computeStudioInsertBatchPlacements(sources, {
      layout: "grid",
      spacing: "wide",
      target,
    });
    const second = computeStudioInsertBatchPlacements(sources, {
      layout: "grid",
      spacing: "wide",
      target,
    });
    expect(second).toEqual(first);
    expect(new Set(first.map((placement) => `${placement.x}:${placement.y}`)).size).toBe(
      first.length,
    );
  });

  it("returns no placements for an empty queue and rejects unsafe geometry", () => {
    expect(
      computeStudioInsertBatchPlacements([], {
        layout: "grid",
        spacing: "comfortable",
        target,
      }),
    ).toEqual([]);

    expect(() =>
      computeStudioInsertBatchPlacements(
        [{ id: "bad", width: 0, height: 100 }],
        {
          layout: "grid",
          spacing: "comfortable",
          target,
        },
      ),
    ).toThrow(/이미지 너비/u);
    expect(() =>
      computeStudioInsertBatchPlacements(
        [{ id: "ok", width: 100, height: 100 }],
        {
          layout: "grid",
          spacing: "comfortable",
          target: { x: 0, y: 0, width: Number.NaN, height: 100 },
        },
      ),
    ).toThrow(/배치 영역 너비/u);
  });
});
