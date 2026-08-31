import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const bodySource = readFileSync(
  new URL("./StudioInspectorAsideBody.tsx", import.meta.url),
  "utf8",
);
const shellSource = readFileSync(
  new URL("./StudioInspectorAsideShell.tsx", import.meta.url),
  "utf8",
);

describe("Studio inspector multi-selection scope", () => {
  it("does not render representative-only detail controls below the shared geometry panel", () => {
    expect(bodySource).toContain(
      'inspectorContentMode === "selection" && marqueeIds.length > 1',
    );
    expect(bodySource).toContain(
      "!hasMultiSelection ? (\n            <StudioInspectorSelectionSection",
    );
  });

  it("hides single-image tool tabs while multiple elements are selected", () => {
    expect(shellSource).toContain(
      "marqueeIds.length <= 1 &&\n              (selectedSupportsImageInspectorTabs || unselectedImageToolsVisible)",
    );
  });
});
