import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const WORKSPACE_CSS =
  "apps/web/src/shared/components/workspace/workspace.css";

function declarationBlock(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\{([^}]*)\\}`, "u"));
  if (!match?.[1]) throw new Error(`Missing CSS rule: ${selector}`);
  return match[1];
}

describe("workspace control color cascade", () => {
  it("keeps unlayered workspace resets from overriding utility foregrounds", () => {
    const source = readFileSync(WORKSPACE_CSS, "utf8");
    const linkReset = declarationBlock(
      source,
      ":where(.workspace-shell,.workspace-inspector) :where(a)",
    );
    const controlReset = declarationBlock(
      source,
      ":where(.workspace-shell,.workspace-inspector) :where(button,select)",
    );

    expect(linkReset).toContain("text-decoration:none");
    expect(linkReset).not.toContain("color:inherit");
    expect(controlReset).toContain("font:inherit");
    expect(controlReset).not.toContain("color:inherit");
  });
});
