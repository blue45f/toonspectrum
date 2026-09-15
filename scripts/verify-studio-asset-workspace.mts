import assert from "node:assert/strict";

import { BG_SCENES } from "../apps/web/src/domains/creator/studio-bg-scenes";
import { BG_SCENES_EXTRA } from "../apps/web/src/domains/creator/studio-bg-scenes-extra";
import { listStudioElementLibrary } from "../apps/web/src/domains/creator/studio-elements-catalog";
import {
  decorateStudioGenerated2dAsset,
  STUDIO_GENERATED_BG_SCENES,
  STUDIO_GENERATED_ELEMENT_ITEMS,
} from "../apps/web/src/domains/creator/studio-generated-2d-catalog";
import { listStudioObjectInsertItems } from "../apps/web/src/domains/creator/studio-object-insert-catalog";
import { SCENE_TEMPLATES } from "../apps/web/src/domains/creator/studio-scene-templates";
import { STUDIO_TEMPLATE_CATALOG } from "../apps/web/src/domains/creator/studio-template-catalog";
import { buildStudioUnifiedAssetCatalog } from "../apps/web/src/domains/creator/studio-unified-asset-catalog";
import {
  auditStudioUnifiedAssetPreviews,
  resolveStudioUnifiedAssetRichPreview,
} from "../apps/web/src/domains/creator/studio-unified-asset-preview";

const backgrounds = [
  ...STUDIO_GENERATED_BG_SCENES,
  ...BG_SCENES,
  ...BG_SCENES_EXTRA,
];
const elements = [
  ...STUDIO_GENERATED_ELEMENT_ITEMS,
  ...listStudioElementLibrary(),
];
const objects = listStudioObjectInsertItems();
const catalog = buildStudioUnifiedAssetCatalog({
  backgrounds,
  elements,
  objects,
  sceneTemplates: SCENE_TEMPLATES,
}).map(decorateStudioGenerated2dAsset);
const previewAudit = auditStudioUnifiedAssetPreviews(catalog);
const fallbackItems = catalog.filter(
  (item) => resolveStudioUnifiedAssetRichPreview(item).kind === "generated-poster",
);
const missingCompositions = STUDIO_TEMPLATE_CATALOG.filter(
  (template) => !template.definition.composition,
);
const nonToolPreviewCoveragePercent = Math.round(
  (previewAudit.visual / Math.max(1, previewAudit.total - fallbackItems.length)) * 100,
);

assert.ok(backgrounds.length >= 80, `expected at least 80 backgrounds, received ${backgrounds.length}`);
assert.ok(SCENE_TEMPLATES.length >= 50, `expected at least 50 scene recipes, received ${SCENE_TEMPLATES.length}`);
assert.ok(objects.length >= 100, `expected at least 100 3D entries, received ${objects.length}`);
assert.equal(previewAudit.interactive3d, objects.length, "every 3D entry must resolve to a real interactive source");
assert.equal(previewAudit.templates, SCENE_TEMPLATES.length, "every scene recipe must expose a visual summary");
assert.ok(
  fallbackItems.every((item) => item.source.kind === "native-tool"),
  `non-tool assets cannot use generated fallback posters: ${fallbackItems.map((item) => item.id).join(", ")}`,
);
assert.equal(nonToolPreviewCoveragePercent, 100, "every non-tool asset must have a real visual preview");
assert.equal(STUDIO_TEMPLATE_CATALOG.length, 18, "document template catalog must keep the planned 18-template baseline");
assert.deepEqual(
  missingCompositions.map((template) => template.id),
  [],
  "every document template must share a canonical visual composition with handoff",
);
for (const template of STUDIO_TEMPLATE_CATALOG) {
  const composition = template.definition.composition;
  assert.ok(composition, `${template.id} is missing composition metadata`);
  assert.ok(composition.pages.length > 0, `${template.id} requires at least one preview page`);
  assert.ok(composition.layerLabels.length > 0, `${template.id} requires layer metadata`);
  assert.ok(composition.aspectRatio > 0, `${template.id} requires a positive aspect ratio`);
}

const report = {
  catalogEntries: catalog.length,
  backgrounds: backgrounds.length,
  generatedBackgrounds: STUDIO_GENERATED_BG_SCENES.length,
  elements: elements.length,
  sceneRecipes: SCENE_TEMPLATES.length,
  interactive3d: previewAudit.interactive3d,
  documentTemplates: STUDIO_TEMPLATE_CATALOG.length,
  realVisualAssets: previewAudit.visual,
  nativeToolPosters: fallbackItems.length,
  nonToolPreviewCoveragePercent,
};

console.log(JSON.stringify(report, null, 2));
