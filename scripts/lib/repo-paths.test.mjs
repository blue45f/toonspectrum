import { describe, expect, it } from "vitest";

import { viteManifestKey, WEB_SRC, WEB_VITE_ALIASES } from "./repo-paths.mjs";

describe("frontend source paths", () => {
  it("resolves browser harness aliases from the same source root as the application", () => {
    expect(WEB_VITE_ALIASES).toEqual([{ find: "@", replacement: WEB_SRC }]);
  });

  it("uses web-root-relative Vite manifest keys for nested source entries", () => {
    expect(viteManifestKey("apps/web/src/domains/creator/studio-autosave-sqlite-store.ts"))
      .toBe("src/domains/creator/studio-autosave-sqlite-store.ts");
    expect(viteManifestKey("apps/web/index.html")).toBe("index.html");
  });
});
