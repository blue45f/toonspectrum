import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const previewRoot = new URL("apps/web/public/brand/studio-canvas-previews/", root);
const source = JSON.parse(readFileSync(new URL("SOURCE.json", previewRoot), "utf8")) as {
  images: Array<{ id: string; source: string; output: string; sourceSha256: string }>;
};

describe("드로잉 시작 안내 미리보기 예산", () => {
  it("전체 여섯 장면 미리보기를 200 KB 안에서 제공한다", () => {
    expect(source.images).toHaveLength(6);
    const total = source.images.reduce((sum, image) => (
      sum + statSync(new URL(image.output, previewRoot)).size
    ), 0);
    expect(total).toBeLessThan(200_000);
  });

  it.each(source.images)("$id 원본 출처를 유지하고 축소 WebP만 배포한다", (image) => {
    const original = readFileSync(new URL(image.source, root));
    const thumbnail = readFileSync(new URL(image.output, previewRoot));
    expect(createHash("sha256").update(original).digest("hex")).toBe(image.sourceSha256);
    expect(thumbnail.toString("ascii", 0, 4)).toBe("RIFF");
    expect(thumbnail.toString("ascii", 8, 12)).toBe("WEBP");
    expect(thumbnail.length).toBeLessThan(original.length / 50);
    expect(fileURLToPath(new URL(image.output, previewRoot))).toContain("studio-canvas-previews");
  });
});
