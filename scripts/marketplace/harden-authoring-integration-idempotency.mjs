import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing ${label} integration script anchor.`);
  return source.replace(before, after);
}

function updateScript(relativePath, transform) {
  const path = resolve(root, relativePath);
  const before = readFileSync(path, "utf8");
  const after = transform(before);
  if (after !== before) writeFileSync(path, after);
}

function keepFirst(source, pattern, label) {
  let seen = false;
  let count = 0;
  const result = source.replace(pattern, (match) => {
    count += 1;
    if (!seen) {
      seen = true;
      return match;
    }
    return "";
  });
  if (count === 0) throw new Error(`Expected ${label} integration was not present.`);
  return { source: result, removed: Math.max(0, count - 1) };
}

updateScript("scripts/marketplace/integrate-creator-authoring.mjs", (source) => {
  let next = replaceRequired(
    source,
    '"marketplace-authoring-workshop",',
    '"<MarketplaceAuthoringWorkshop />",',
    "publish marker",
  );
  next = replaceRequired(
    next,
    '"brush-studio-marketplace-shortcut",',
    '"<MarketplaceBrushStudioBridge />",',
    "Brush Studio marker",
  );
  return next;
});

updateScript("scripts/marketplace/integrate-authoring-detail-action.mjs", (source) =>
  replaceRequired(
    source,
    'if (!source.includes("marketplace-authoring-install-action")) {',
    'if (!source.includes("<MarketplaceAuthoringInstallAction record={record} />")) {',
    "detail marker",
  ),
);

updateScript("scripts/marketplace/integrate-brush-recipe-lab.mjs", (source) =>
  replaceRequired(
    source,
    'if (!source.includes("market-brush-recipe-lab")) {',
    'if (!source.includes("<MarketplaceBrushRecipeAccelerator")) {',
    "recipe marker",
  ),
);

const productFiles = [
  {
    path: "src/domains/market/pages/MarketPublishPage.tsx",
    pattern: /\s*<MarketplaceAuthoringWorkshop\s*\/>/gu,
    label: "MarketplaceAuthoringWorkshop",
  },
  {
    path: "src/domains/creator/StudioBrushStudio.tsx",
    pattern: /\s*<MarketplaceBrushStudioBridge\s*\/>/gu,
    label: "MarketplaceBrushStudioBridge",
  },
  {
    path: "src/domains/market/components/MarketResourceDetailArticle.tsx",
    pattern: /\s*<MarketplaceAuthoringInstallAction\s+record=\{record\}\s*\/>/gu,
    label: "MarketplaceAuthoringInstallAction",
  },
  {
    path: "src/domains/market/components/MarketplaceAuthoringWorkshop.tsx",
    pattern: /\s*<MarketplaceBrushRecipeAccelerator\s+draft=\{normalized\}\s+onChange=\{setDraft\}\s*\/>/gu,
    label: "MarketplaceBrushRecipeAccelerator",
  },
];

const report = [];
for (const entry of productFiles) {
  const path = resolve(root, entry.path);
  const before = readFileSync(path, "utf8");
  const result = keepFirst(before, entry.pattern, entry.label);
  let after = result.source;
  // Normalize the surviving insertion onto its own line after regex whitespace folding.
  if (entry.label === "MarketplaceAuthoringWorkshop") {
    after = after.replace("<MarketplaceAuthoringWorkshop />", "\n      <MarketplaceAuthoringWorkshop />\n");
  } else if (entry.label === "MarketplaceBrushStudioBridge") {
    after = after.replace("<MarketplaceBrushStudioBridge />", "\n      <MarketplaceBrushStudioBridge />\n");
  } else if (entry.label === "MarketplaceAuthoringInstallAction") {
    after = after.replace(
      "<MarketplaceAuthoringInstallAction record={record} />",
      "\n      <MarketplaceAuthoringInstallAction record={record} />\n",
    );
  } else {
    after = after.replace(
      "<MarketplaceBrushRecipeAccelerator\n                  draft={normalized}\n                  onChange={setDraft}\n                />",
      "\n                <MarketplaceBrushRecipeAccelerator\n                  draft={normalized}\n                  onChange={setDraft}\n                />\n",
    );
  }
  writeFileSync(path, after);
  report.push({ path: entry.path, duplicateInsertionsRemoved: result.removed });
}

writeFileSync(
  resolve(root, "marketplace-authoring-idempotency-report.json"),
  `${JSON.stringify({ status: "hardened", files: report }, null, 2)}\n`,
);
