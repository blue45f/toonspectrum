import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const preflightSource = readFileSync(
  new URL("./StudioInsertBatchPreflight.tsx", import.meta.url),
  "utf8",
);

describe("studio batch insertion preflight contracts", () => {
  it("makes queue mutations immediately observable to asynchronous workers", () => {
    expect(preflightSource).toContain(
      "const next = update(itemsRef.current);",
    );
    expect(preflightSource).toContain("itemsRef.current = next;");
    expect(preflightSource).toContain("setItems(next);");
    expect(preflightSource).not.toContain("setItems((current) => {");
  });

  it("derives the preview from final canvas geometry before scaling it", () => {
    expect(preflightSource).toContain("const previewScale = Math.min(");
    expect(preflightSource).toContain("width: item.prepared.width,");
    expect(preflightSource).toContain("height: item.prepared.height,");
    expect(preflightSource).toContain("{ layout, spacing, target },");
    expect(preflightSource).toContain(
      "x: previewTarget.x + (placement.x - target.x) * previewScale,",
    );
    expect(preflightSource).toContain(
      "y: previewTarget.y + (placement.y - target.y) * previewScale,",
    );
    expect(preflightSource).not.toContain(
      "width: item.prepared.width * scale,",
    );
    expect(preflightSource).not.toContain(
      "{ layout, spacing, target: previewTarget },",
    );
  });
});
