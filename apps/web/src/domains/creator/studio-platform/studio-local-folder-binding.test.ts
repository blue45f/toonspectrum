import { describe, expect, it } from "vitest";

import {
  normalizeStudioRelativePath,
  planStudioLocalFolderSync,
} from "./studio-local-folder-binding";

const A = `sha256:${"a".repeat(64)}`;
const B = `sha256:${"b".repeat(64)}`;
const C = `sha256:${"c".repeat(64)}`;

describe("Studio local folder binding", () => {
  it("normalizes safe project paths and rejects traversal", () => {
    expect(normalizeStudioRelativePath("episodes\\001\\canvas.toon2d"))
      .toBe("episodes/001/canvas.toon2d");
    expect(() => normalizeStudioRelativePath("../secret.txt")).toThrow("unsafe");
    expect(() => normalizeStudioRelativePath("/absolute/file.psd")).toThrow("relative");
  });

  it("plans uploads, downloads and explicit conflicts from a common base", () => {
    const plan = planStudioLocalFolderSync({
      local: [
        { path: "same.toon2d", digest: A, baseDigest: A },
        { path: "local-only.psd", digest: B, baseDigest: null },
        { path: "conflict.clip", digest: B, baseDigest: A },
      ],
      remote: [
        { path: "same.toon2d", digest: A, baseDigest: A },
        { path: "remote-only.png", digest: C, baseDigest: null },
        { path: "conflict.clip", digest: C, baseDigest: A },
      ],
    });
    expect(plan).toEqual([
      expect.objectContaining({ path: "conflict.clip", action: "conflict" }),
      expect.objectContaining({ path: "local-only.psd", action: "upload" }),
      expect.objectContaining({ path: "remote-only.png", action: "download" }),
      expect.objectContaining({ path: "same.toon2d", action: "noop" }),
    ]);
  });
});
