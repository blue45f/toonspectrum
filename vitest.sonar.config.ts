import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "./vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        enabled: true,
        provider: "v8",
        reporter: ["text-summary", "lcov"],
        reportsDirectory: "coverage/sonar",
        include: [
          "apps/web/src/domains/creator/StudioAssetLegacyPanel.tsx",
          "apps/web/src/domains/creator/StudioAssetToolPopoverWorkspace.tsx",
          "apps/web/src/domains/creator/StudioInsertHubWorkspace.tsx",
          "apps/web/src/domains/creator/StudioUnifiedAssetSmartFilters.tsx",
          "apps/web/src/domains/creator/StudioUnifiedAssetSmartLibrary.tsx",
          "apps/web/src/domains/creator/StudioUnifiedAssetSmartManager.tsx",
          "apps/web/src/domains/creator/StudioUnifiedAssetToolPopoverContent.tsx",
          "apps/web/src/domains/creator/StudioUnifiedAssetWorkspace.tsx",
          "apps/web/src/domains/creator/studio-insert-hub-model.ts",
          "apps/web/src/domains/creator/studio-tool-belt-lazy-ui.ts",
          "apps/web/src/domains/creator/studio-unified-asset-catalog.ts",
          "apps/web/src/domains/creator/studio-unified-asset-intelligence.ts",
          "apps/web/src/domains/creator/studio-unified-asset-lazy-ui.ts",
          "apps/web/src/domains/creator/studio-unified-asset-smart-library-chrome.tsx",
        ],
      },
    },
  }),
);
