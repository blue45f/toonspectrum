import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const verifierSource = readFileSync(
  new URL("./verify-studio-brush-latency.mts", import.meta.url),
  "utf8",
);

describe("studio brush latency verifier compositor boundary", () => {
  it("samples the Stage and every sibling live/GPU canvas for input and settle probes", () => {
    expect(
      verifierSource.match(
        /const compositorRoot = root\.parentElement\?\.closest<HTMLElement>\("\.relative"\) \?\? root;/gu,
      ),
    ).toHaveLength(2);
    expect(
      verifierSource.match(
        /compositorRoot\.querySelectorAll<HTMLCanvasElement>\("canvas"\)/gu,
      ),
    ).toHaveLength(2);
  });

  it("does not regress to Konva-only pixel sampling", () => {
    expect(verifierSource).not.toContain(
      'for (const canvas of root.querySelectorAll<HTMLCanvasElement>("canvas"))',
    );
    expect(verifierSource).not.toContain(
      'for (const layer of root.querySelectorAll<HTMLCanvasElement>("canvas"))',
    );
  });
});
