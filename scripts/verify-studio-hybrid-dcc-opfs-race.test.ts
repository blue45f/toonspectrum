import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./verify-studio-hybrid-dcc-integration.mts", import.meta.url),
  "utf8",
);

describe("Studio Hybrid DCC OPFS snapshot verification", () => {
  it("retries transient atomic-replacement races without accepting partial evidence", () => {
    const readerStart = source.indexOf("async function readHybridDccOpfsFiles");
    const readerEnd = source.indexOf(
      "function studioHybridDccOpfsFileIdentity",
      readerStart,
    );
    const reader = source.slice(readerStart, readerEnd);

    expect(readerStart).toBeGreaterThan(-1);
    expect(readerEnd).toBeGreaterThan(readerStart);
    expect(reader).toContain(
      'error instanceof DOMException && error.name === "NotFoundError"',
    );
    expect(reader).toContain("transientNotFound = true");
    expect(reader).toContain("if (!snapshot.transientNotFound) return snapshot.files");
    expect(reader).toContain("maxAttempts: 5");
    expect(reader).toContain("retryDelayMs: 25");
    expect(reader).toContain("setTimeout(resolve, retryDelayMs * attempt)");
    expect(reader).toContain("Hybrid DCC OPFS snapshot did not stabilize");
  });
});
