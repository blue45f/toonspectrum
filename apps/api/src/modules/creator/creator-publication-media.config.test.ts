import { describe, expect, it } from "vitest";

import {
  CREATOR_PUBLICATION_MEDIA_STORAGE_MODE_ENV,
  resolveCreatorPublicationMediaStorageConfig,
} from "./creator-publication-media.config";

describe("creator publication media storage config", () => {
  it("defaults to optional rollout mode", () => {
    expect(resolveCreatorPublicationMediaStorageConfig({})).toEqual({
      mode: "optional",
      externalizationEnabled: true,
      storageRequired: false,
    });
  });

  it.each(["legacy", "optional", "required"] as const)(
    "parses %s without hostname heuristics",
    (mode) => {
      expect(resolveCreatorPublicationMediaStorageConfig({
        [CREATOR_PUBLICATION_MEDIA_STORAGE_MODE_ENV]: ` ${mode.toUpperCase()} `,
      }).mode).toBe(mode);
    },
  );

  it("rejects misspelled rollout values", () => {
    expect(() => resolveCreatorPublicationMediaStorageConfig({
      [CREATOR_PUBLICATION_MEDIA_STORAGE_MODE_ENV]: "enabled",
    })).toThrow(/legacy, optional, or required/);
  });
});
