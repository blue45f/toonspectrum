import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const uiDir = dirname(fileURLToPath(import.meta.url));

function source(path: string): string {
  return readFileSync(join(uiDir, path), "utf8");
}

describe("shared switch contract", () => {
  it("pins the thumb to an explicit origin with geometry-matched travel", () => {
    const sharedSwitch = source("switch.tsx");

    expect(sharedSwitch).toContain("h-6 w-11");
    expect(sharedSwitch).toContain("left-0.5 top-0.5 size-5");
    expect(sharedSwitch).toContain("translate-x-5");
    expect(sharedSwitch).toContain("min-h-11 min-w-11");
    expect(sharedSwitch).toContain("motion-reduce:transition-none");
    expect(sharedSwitch).toContain('role="switch"');
    expect(sharedSwitch).toContain("aria-checked={checked}");
    expect(sharedSwitch).not.toContain("bg-white");
  });

  it("keeps the floating UI settings on the shared switch instead of hand-rolled thumb geometry", () => {
    const manager = source("../../../domains/creator/studio-shell/StudioShellFloatingLayoutManager.tsx");

    expect(manager).toContain('import { Switch } from "@/shared/components/ui/switch";');
    expect(manager).toContain("<Switch");
    expect(manager).toContain("위치 초기화");
    expect(manager).not.toContain("translate-x-6");
    expect(manager).not.toContain("bg-white");
    expect(manager).not.toContain('className={cn(\n                              "relative mt-0.5 h-7 w-12');
  });
});
