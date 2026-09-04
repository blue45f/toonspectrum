import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface DeclarationSpan {
  readonly line: number;
  readonly name: string;
  readonly signature: string;
  spanLines: number;
}

const HOST_FILE = fileURLToPath(new URL("./StudioCuttoonEditorHost.tsx", import.meta.url));
const DECLARATION_PATTERN = /^(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:(?:function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=)/u;

describe("temporary studio host structure report", () => {
  it("prints top-level declaration spans for the architecture refactor", () => {
    const lines = readFileSync(HOST_FILE, "utf8").split("\n");
    const declarations: DeclarationSpan[] = [];

    for (const [offset, line] of lines.entries()) {
      if (/^\s/u.test(line)) continue;
      const match = DECLARATION_PATTERN.exec(line);
      if (!match) continue;
      declarations.push({
        line: offset + 1,
        name: match[1] ?? match[2],
        signature: line.slice(0, 220),
        spanLines: 0,
      });
    }

    declarations.forEach((declaration, index) => {
      declaration.spanLines = (declarations[index + 1]?.line ?? lines.length + 1) - declaration.line;
    });

    const report = {
      path: "src/domains/creator/StudioCuttoonEditorHost.tsx",
      lineCount: lines.length,
      declarationCount: declarations.length,
      largestSpans: [...declarations]
        .sort((left, right) => right.spanLines - left.spanLines)
        .slice(0, 120),
      declarations,
    };

    process.stdout.write(`\nSTUDIO_HOST_STRUCTURE_REPORT=${JSON.stringify(report)}\n`);
    expect(lines.length).toBeGreaterThan(1);
  });
});
