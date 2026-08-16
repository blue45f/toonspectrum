import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const routerSource = readFileSync(
  resolve(process.cwd(), "src/domains/creator/studio-router/StudioRouter.tsx"),
  "utf8",
);
const appRouterSource = readFileSync(
  resolve(process.cwd(), "src/app/routes/AppRouter.tsx"),
  "utf8",
);
const legacyEditorSource = readFileSync(
  resolve(process.cwd(), "src/domains/creator/StudioPage.tsx"),
  "utf8",
);
const legacyEditorAdapterSource = readFileSync(
  resolve(process.cwd(), "src/domains/creator/studio-legacy-editor-adapter.tsx"),
  "utf8",
);

describe("Studio router bundle boundaries", () => {
  it("loads the publish screen without a static dependency on the legacy editor", () => {
    expect(routerSource).toContain('import("../StudioUploadPublish")');
    expect(routerSource).toContain('import("../studio-legacy-editor-adapter")');
    expect(routerSource).not.toMatch(/from\s+["']\.\.\/StudioPage["']/u);
    expect(legacyEditorSource).not.toContain("StudioUploadPublish,");
  });

  it("gives AppRouter one lazy Studio entry instead of competing flat routes", () => {
    expect(appRouterSource).toContain(
      'import("@/src/domains/creator/studio-router/StudioRouter")',
    );
    expect(appRouterSource).toContain(
      '<Route path="/studio/*" element={<StudioRouter />} />',
    );
    expect(appRouterSource).not.toContain('path="/studio/tools-companion"');
    expect(appRouterSource).not.toContain('import("@/src/domains/creator/StudioPage")');
  });

  it("keeps URL and editor-key ownership outside the legacy adapter", () => {
    const adapterSource = legacyEditorAdapterSource;
    expect(adapterSource).toContain("export function LegacyStudioEditorAdapter");
    expect(adapterSource).toContain("remixId={remixId}");
    expect(adapterSource).not.toContain("useLocation");
    expect(adapterSource).not.toContain("useSearchParams");
    expect(adapterSource).not.toContain("studioEditorInstanceKey");
  });
});
