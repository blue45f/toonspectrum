import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const PAGE_ENTRY = new URL("./StudioPage.tsx", import.meta.url);
const HOST = new URL("./StudioCuttoonEditorHost.tsx", import.meta.url);

describe("studio page entry size boundary", () => {
  it("keeps the /studio page entry under 10000 lines after the host split", () => {
    const page = readFileSync(PAGE_ENTRY, "utf8");
    const host = readFileSync(HOST, "utf8");
    const pageLines = page.split("\n").length;
    expect(PAGE_ENTRY.pathname.endsWith("/src/domains/creator/StudioPage.tsx")).toBe(true);
    expect(page).toContain('from "./StudioCuttoonEditorHost"');
    expect(page).toContain("export { StudioCuttoonEditor }");
    expect(host).toContain("export function StudioCuttoonEditor");
    expect(pageLines).toBeLessThan(10_000);
  });
});
