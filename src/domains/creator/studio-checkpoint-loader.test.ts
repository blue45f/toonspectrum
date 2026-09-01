import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { studioCheckpointKey } from "./studio-checkpoint-loader";
import {
  studioCheckpointKey as durableStudioCheckpointKey,
} from "./studio-checkpoints";

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

describe("Studio checkpoint lazy product boundary", () => {
  it("keeps the durable SQLite implementation behind a dynamic import", () => {
    const loader = source("./studio-checkpoint-loader.ts");
    const page = source("./StudioCuttoonEditorHost.tsx");

    expect(loader).toContain('import("./studio-checkpoints")');
    expect(loader).not.toMatch(/from\s+["']\.\/studio-checkpoints["']/u);
    expect(page).toContain('from "./studio-checkpoint-loader"');
    expect(page).not.toMatch(/from\s+["']\.\/studio-checkpoints["']/u);
  });

  it.each([
    [{}, "toonspectrum-studio-checkpoints:v12:guest:new"],
    [{ userId: "  artist  ", workId: "work/1" }, null],
    [{ userId: "artist", remixId: "remix 1" }, null],
    [{ userId: "artist", workId: "", remixId: "remix" }, null],
  ] as const)("keeps checkpoint key parity for %j", (input, expected) => {
    const key = studioCheckpointKey(input);
    expect(key).toBe(durableStudioCheckpointKey(input));
    if (expected !== null) expect(key).toBe(expected);
  });
});
