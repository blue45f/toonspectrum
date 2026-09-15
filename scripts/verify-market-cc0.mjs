import { spawnSync } from "node:child_process";

const tests = [
  "apps/web/src/domains/creator/studio-marketplace-cc0.test.ts",
  "apps/web/src/domains/creator/studio-marketplace-cc0-model.test.ts",
  "apps/web/src/domains/market/components/MarketCc0AssetPreview.test.tsx",
  "apps/web/src/domains/creator/studio-community-marketplace.test.ts",
  "apps/web/src/domains/creator/studio-creator-pack-runtime.test.ts",
  "apps/web/src/domains/creator/studio-marketplace-deep-link.test.ts",
  "apps/web/src/domains/creator/StudioCommunityMarketplacePanel.test.tsx",
  "apps/web/src/domains/creator/StudioCommunityMarketplacePanel.race.test.tsx",
  "apps/web/src/domains/creator/studio-host-architecture-ratchet.test.ts",
  "apps/web/src/domains/market/components/MarketResourceDetailArticle.test.tsx",
  "apps/web/src/domains/market/models/market-studio-handoff.test.ts",
];
const commands = [
  ["exec", "vitest", "run", ...tests],
  ["run", "typecheck"],
  ["exec", "tsx", "scripts/verify-market-cc0-bytes.mts"],
  ["exec", "tsx", "scripts/verify-market-cc0-browser.mts"],
];
for (const args of commands) {
  console.log(`\n> pnpm ${args.join(" ")}`);
  const result = spawnSync("pnpm", args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
