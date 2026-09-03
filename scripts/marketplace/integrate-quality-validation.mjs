import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const target = resolve(root, "lib/creator-marketplace-authoring-workshop.ts");
let source = readFileSync(target, "utf8");

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor.`);
  source = source.replace(before, after);
}

replaceOnce(
  `export type CreatorMarketplaceAuthoringKind =\n  (typeof CREATOR_MARKETPLACE_AUTHORING_KINDS)[number];`,
  `export type CreatorMarketplaceAuthoringKind =\n  (typeof CREATOR_MARKETPLACE_AUTHORING_KINDS)[number];\n\nexport const CREATOR_MARKETPLACE_REQUIRED_QUALITY_SCENARIOS: Readonly<\n  Record<CreatorMarketplaceAuthoringKind, readonly string[]>\n> = {\n  brush: ["brush-fast-slow", "brush-pressure", "brush-crossing"],\n  tone: ["tone-seam", "tone-dpi"],\n  palette: ["palette-space", "palette-contrast"],\n  pose: ["pose-rig", "pose-mirror"],\n  "3d": ["3d-scale", "3d-material", "3d-lod"],\n  background: ["background-scroll", "background-perspective"],\n  bubble: ["bubble-fit", "bubble-vertical"],\n  template: ["template-pages", "template-fonts"],\n  material: ["material-install", "material-dependencies"],\n};`,
  "required quality scenario contract",
);

replaceOnce(
  `  if (draft.media.length === 0) add("preview", "warning", "preview", "실사용 미리보기가 없습니다.", "커버 또는 스트로크 테스트 시트를 추가하세요.");`,
  `  const qualityScenarios = Array.isArray(draft.technical.qualityScenarios)\n    ? draft.technical.qualityScenarios.filter((value): value is string => typeof value === "string")\n    : [];\n  const missingQualityScenarios = CREATOR_MARKETPLACE_REQUIRED_QUALITY_SCENARIOS[draft.kind]\n    .filter((scenario) => !qualityScenarios.includes(scenario));\n  if (missingQualityScenarios.length > 0) {\n    add(\n      "quality-plan",\n      "error",\n      "preview",\n      \`필수 품질 시나리오 \${missingQualityScenarios.length}개가 계획되지 않았습니다.\`,\n      "미리보기 단계에서 필수 시나리오를 선택하고 실제 결과를 첨부하세요.",\n    );\n  }\n  if (draft.media.length === 0) add("preview", "warning", "preview", "실사용 미리보기가 없습니다.", "커버 또는 스트로크 테스트 시트를 추가하세요.");\n  if (draft.media.some((media) => media.alt.trim().length < 3)) {\n    add("preview-alt", "error", "preview", "대체 텍스트가 없는 미리보기가 있습니다.", "각 미디어가 무엇을 검증하는지 설명하세요.");\n  }\n  if (draft.bundle.some((item) => !item.name.trim() || !item.role.trim())) {\n    add("bundle-metadata", "error", "bundle", "이름 또는 역할이 비어 있는 번들 항목이 있습니다.", "설치 항목의 이름과 역할을 입력하세요.");\n  }`,
  "quality and media validation",
);

writeFileSync(target, source);
writeFileSync(
  resolve(root, "marketplace-quality-validation-integration-report.json"),
  `${JSON.stringify({ target: "lib/creator-marketplace-authoring-workshop.ts", status: "integrated" }, null, 2)}\n`,
);
