import { describe, expect, it } from "vitest";

import { createUploadedVrmRecord, getDeletableModelIds, SAMPLE_VRM_ENTRIES, SAMPLE_VRM_LIBRARY_ENTRY, withDefaultVrmEntry } from "./vrm-library";

describe("VRM library helpers", () => {
  it("keeps every bundled sample before uploaded library entries", () => {
    const entries = withDefaultVrmEntry([
      {
        id: "upload-1",
        name: "Romance Lead",
        blob: new Blob(["vrm"], { type: "model/gltf-binary" }),
        createdAt: 2,
        updatedAt: 2,
        thumbnail: null,
      },
    ]);

    expect(entries.slice(0, SAMPLE_VRM_ENTRIES.length)).toEqual(SAMPLE_VRM_ENTRIES);
    expect(entries.map((entry) => entry.id)).toEqual([...SAMPLE_VRM_ENTRIES.map((entry) => entry.id), "upload-1"]);
  });

  it("normalizes uploaded model names and creates blob-backed records", () => {
    const file = new File(["vrm"], "Fantasy Knight.vrm", { type: "application/octet-stream" });
    const record = createUploadedVrmRecord(file, "fixed-id", 42);

    expect(record).toMatchObject({
      id: "fixed-id",
      name: "Fantasy Knight",
      createdAt: 42,
      updatedAt: 42,
      thumbnail: null,
    });
    expect(record.blob).toBe(file);
  });

  it("only allows uploaded models to be deleted", () => {
    const deletableIds = getDeletableModelIds([
      SAMPLE_VRM_LIBRARY_ENTRY,
      {
        id: "upload-1",
        name: "Action Hero",
        source: "indexed-db",
        thumbnail: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    expect(deletableIds).toEqual(["upload-1"]);
  });
});
