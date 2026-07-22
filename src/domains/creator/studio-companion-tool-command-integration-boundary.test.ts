import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

function companionCommandHandlerSource(): string {
  const start = pageSource.indexOf("companionCommandHandlerRef.current = (command) => {");
  const end = pageSource.indexOf("return () => {", start);
  if (start < 0 || end < 0) throw new Error("Studio companion command handler is missing");
  return pageSource.slice(start, end);
}

describe("Studio companion tool-command integration boundary", () => {
  it("delegates base tool transitions to the canonical disarm-first executor", () => {
    const handler = companionCommandHandlerSource();

    expect(pageSource).toContain(
      'import { executeStudioCompanionToolCommand } from "./studio-companion-tool-command-executor";',
    );
    expect(handler).toContain("executeStudioCompanionToolCommand(command, {");
    expect(handler).toContain("disarmAllPixelTools: disarmAllPixelToolsRef.current,");
    expect(handler).toContain("setTool,");
    expect(handler).toContain("setDrawMode,");
    expect(handler).toContain("if (toolExecution.handled) return;");
    expect(pageSource).toContain("disarmAllPixelToolsRef.current = disarmAllPixelTools;");
  });

  it("does not retain an inline select, pen, or eraser transition that can bypass disarming", () => {
    const handler = companionCommandHandlerSource();

    expect(handler).not.toContain('case "select":');
    expect(handler).not.toContain('case "pen":');
    expect(handler).not.toContain('case "eraser":');
  });
});
