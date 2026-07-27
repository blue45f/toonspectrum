import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  new URL("./StudioPage.tsx", import.meta.url),
  "utf8",
);

function sourceBetween(
  source: string,
  startToken: string,
  endToken: string,
): string {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  if (start < 0 || end <= start) {
    throw new Error(`Missing source boundary: ${startToken} -> ${endToken}`);
  }
  return source.slice(start, end);
}

describe("Studio content-aware fill bundle boundary", () => {
  it("loads the optional fill engine in parallel with image decoding after the user invokes it", () => {
    const applySource = sourceBetween(
      pageSource,
      "async function applyContentAwareFill()",
      "// 문지르기 브러시",
    );

    expect(pageSource).not.toMatch(
      /import\s+\{\s*bakeContentAwareFillToCanvas\s*\}\s+from\s+"\.\/studio-content-aware-fill"/u,
    );
    expect(
      pageSource.match(/import\("\.\/studio-content-aware-fill"\)/gu),
    ).toHaveLength(1);
    expect(applySource).toMatch(
      /const \[\{ bakeContentAwareFillToCanvas \}, img\] = await Promise\.all\(\[\s*import\("\.\/studio-content-aware-fill"\),\s*loadStudioPixelEditImage\(target\.src\),\s*\]\)/u,
    );
    expect(applySource.indexOf("Promise.all")).toBeLessThan(
      applySource.indexOf("const w ="),
    );
  });
});
