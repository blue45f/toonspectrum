import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const target = resolve(root, ".github/workflows/marketplace-authoring.yml");
let source = readFileSync(target, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor.`);
  source = source.replace(before, after);
}

source = source.replaceAll(
  '      - "lib/creator-marketplace-authoring-workshop*"',
  '      - "lib/creator-marketplace-authoring-*"\n      - "lib/creator-marketplace-package-builder*"',
);

replaceOnce(
  `          lib/creator-marketplace-authoring-workshop.test.ts\n          src/domains/market/components/MarketplaceAuthoringWorkshop.test.tsx\n          src/domains/market/components/MarketplaceBrushRecipeAccelerator.test.tsx`,
  `          lib/creator-marketplace-authoring-safety.test.ts\n          lib/creator-marketplace-authoring-workshop.test.ts\n          lib/creator-marketplace-package-builder.test.ts\n          lib/creator-marketplace-quality-validation.test.ts\n          src/domains/market/components/MarketplaceAuthoringWorkshop.test.tsx\n          src/domains/market/components/MarketplaceBrushRecipeAccelerator.test.tsx\n          src/domains/market/components/MarketplaceAssetQualityMatrix.test.tsx`,
  "permanent focused tests",
);

replaceOnce(
  `          e2e/marketplace-authoring-workshop.spec.ts\n          e2e/marketplace-authoring-inapp.spec.ts`,
  `          e2e/market.spec.ts\n          e2e/marketplace-authoring-workshop.spec.ts\n          e2e/marketplace-authoring-inapp.spec.ts`,
  "permanent browser regression list",
);

writeFileSync(target, source);
writeFileSync(
  resolve(root, "marketplace-permanent-workflow-report.json"),
  `${JSON.stringify({ target: ".github/workflows/marketplace-authoring.yml", status: "finalized" }, null, 2)}\n`,
);
