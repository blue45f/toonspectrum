import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { hashFileStream } from "../file-integrity.mjs";

test("hashFileStream verifies files without loading them as one buffer", async () => {
  const directory = mkdtempSync(join(tmpdir(), "toonbridge-integrity-"));
  const path = join(directory, "large.bin");
  const chunk = Buffer.from("toonbridge-streaming-integrity\n", "utf8");
  const bytes = Buffer.alloc(chunk.length * 64_000);
  for (let offset = 0; offset < bytes.length; offset += chunk.length) {
    chunk.copy(bytes, offset);
  }
  writeFileSync(path, bytes);

  try {
    const result = await hashFileStream(path, { maxBytes: bytes.length });
    assert.equal(result.bytes, bytes.length);
    assert.equal(
      result.digest,
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    );
    await assert.rejects(
      hashFileStream(path, {
        maxBytes: bytes.length - 1,
        tooLargeCode: "OUTPUT_TOO_LARGE",
      }),
      (error) => error?.code === "OUTPUT_TOO_LARGE",
    );

    const symbolicLink = join(directory, "linked-output.bin");
    symlinkSync(path, symbolicLink);
    await assert.rejects(
      hashFileStream(symbolicLink),
      (error) => error?.code === "FILE_NOT_REGULAR",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
