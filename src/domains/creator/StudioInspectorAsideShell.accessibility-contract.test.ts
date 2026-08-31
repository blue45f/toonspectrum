import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const asideSource = readFileSync(
  new URL("./StudioInspectorAsideShell.tsx", import.meta.url),
  "utf8",
);

describe("StudioInspectorAsideShell mobile accessibility contract", () => {
  it("uses one accurate work-panel name across the dialog and drag handle", () => {
    expect(asideSource).toContain('aria-label={isMobile ? "작업 패널" : undefined}');
    expect(asideSource).toContain('label="작업 패널"');
    expect(asideSource).not.toContain('aria-label={isMobile ? "속성" : undefined}');
  });

  it("reopens a collapsed desktop Inspector before command-search navigation or palette focus", () => {
    expect(asideSource.match(/setRightPanelOpen\(true\)/g)).toHaveLength(3);
    expect(asideSource).toContain(
      "onRequestOpen={() => setRightPanelOpen(true)}",
    );
    expect(asideSource).toContain("globalThis.requestAnimationFrame?.(() => {");
    expect(asideSource).toContain("requestStudioInspectorFocus(");
  });
});
