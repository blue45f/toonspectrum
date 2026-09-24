import { describe, expect, it } from "vitest";

import {
  buildCreatorPublicReaderPreviewHref,
  buildCreatorReaderManagementHref,
  resolveCreatorReaderPreviewMode,
} from "./creator-public-reader-preview";

describe("creator public reader preview", () => {
  it("only ignores authentication when both reader and public-preview modes are explicit", () => {
    expect(resolveCreatorReaderPreviewMode("?view=reader&publicPreview=1")).toEqual({
      readerView: true,
      publicPreview: true,
    });
    expect(resolveCreatorReaderPreviewMode("?publicPreview=1")).toEqual({
      readerView: false,
      publicPreview: false,
    });
    expect(resolveCreatorReaderPreviewMode("?view=reader&publicPreview=false")).toEqual({
      readerView: true,
      publicPreview: false,
    });
  });

  it("builds canonical management and anonymous preview paths", () => {
    expect(buildCreatorPublicReaderPreviewHref("work / 1")).toBe(
      "/create/work%20%2F%201?view=reader&publicPreview=1",
    );
    expect(buildCreatorReaderManagementHref("work / 1")).toBe("/create/work%20%2F%201");
  });
});
