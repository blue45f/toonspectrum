import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const uiDir = dirname(fileURLToPath(import.meta.url));
const webSrcDir = resolve(uiDir, "../../..");

function source(path: string): string {
  return readFileSync(join(uiDir, path), "utf8");
}

function collectTsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(path);
    if (!entry.isFile() || !entry.name.endsWith(".tsx")) return [];
    if (entry.name.includes(".test.") || entry.name.includes(".spec.")) return [];
    return [path];
  });
}

function switchButtonBlocks(input: string): string[] {
  const blocks: string[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const roleIndex = input.indexOf('role="switch"', cursor);
    if (roleIndex < 0) break;
    const start = input.lastIndexOf("<button", roleIndex);
    const end = input.indexOf("</button>", roleIndex);
    if (start >= 0 && end >= 0) blocks.push(input.slice(start, end + "</button>".length));
    cursor = roleIndex + 1;
  }
  return blocks;
}

describe("shared switch contract", () => {
  it("pins the thumb to an explicit origin with geometry-matched travel", () => {
    const sharedSwitch = source("switch.tsx");

    expect(sharedSwitch).toContain("export function SwitchIndicator");
    expect(sharedSwitch).toContain("h-6 w-11");
    expect(sharedSwitch).toContain("left-0.5 top-0.5 size-5");
    expect(sharedSwitch).toContain("translate-x-5");
    expect(sharedSwitch).toContain("min-h-11 min-w-11");
    expect(sharedSwitch).toContain("motion-reduce:transition-none");
    expect(sharedSwitch).toContain('role="switch"');
    expect(sharedSwitch).toContain("aria-checked={checked}");
    expect(sharedSwitch).not.toContain("bg-white");
  });

  it("keeps every production role switch free of hand-rolled translated thumbs", () => {
    const compactTrackTokens = ["h-5 w-9", "h-6 w-10", "h-7 w-12"];
    const violations = collectTsxFiles(webSrcDir).flatMap((file) =>
      switchButtonBlocks(readFileSync(file, "utf8")).flatMap((block, index) => {
        const hasTranslatedThumb = block.includes("translate-x-");
        const hasLegacyCompactTrack = compactTrackTokens.some((token) => block.includes(token));
        return hasTranslatedThumb || hasLegacyCompactTrack
          ? [`${relative(webSrcDir, file)}#switch-${index + 1}`]
          : [];
      }),
    );

    expect(violations).toEqual([]);
  });

  it("centralizes compact translated toggle visuals beyond role=switch controls", () => {
    const canonicalVisuals = new Set([
      "shared/components/ui/switch.tsx",
      "domains/creator/StudioThreeDToggle.tsx",
    ]);
    const compactTrackTokens = ["h-5 w-9", "h-6 w-10", "h-6 w-11", "h-7 w-12"];
    const violations = collectTsxFiles(webSrcDir).flatMap((file) => {
      const fileName = relative(webSrcDir, file);
      if (canonicalVisuals.has(fileName)) return [];
      const input = readFileSync(file, "utf8");
      return compactTrackTokens.flatMap((token) => {
        const found: string[] = [];
        let cursor = 0;
        while (cursor < input.length) {
          const index = input.indexOf(token, cursor);
          if (index < 0) break;
          const context = input.slice(Math.max(0, index - 1000), index + 1600);
          if (context.includes("translate-x-") || context.includes("after:translate-x-")) {
            found.push(`${fileName}:${token}`);
          }
          cursor = index + token.length;
        }
        return found;
      });
    });

    expect(violations).toEqual([]);
  });

  it("keeps the floating UI settings on the shared switch instead of hand-rolled thumb geometry", () => {
    const manager = source("../../../domains/creator/studio-shell/StudioShellFloatingLayoutManager.tsx");

    expect(manager).toContain('import { Switch } from "@/shared/components/ui/switch";');
    expect(manager).toContain("<Switch");
    expect(manager).toContain("위치 초기화");
    expect(manager).not.toContain("translate-x-6");
    expect(manager).not.toContain("bg-white");
  });
});
