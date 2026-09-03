#!/usr/bin/env node

import fs from "node:fs";

const WORKSHOP_PATH = "lib/creator-marketplace-authoring-workshop.ts";
const PACKAGE_PATH = "lib/creator-marketplace-package-builder.ts";
const QUALITY_TEST_PATH = "lib/creator-marketplace-quality-validation.test.ts";

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one replacement target, found ${count}`);
  }
  return source.replace(before, after);
}

function insertOnce(source, marker, insertion, label) {
  if (source.includes(insertion.trim())) return source;
  const count = source.split(marker).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one insertion marker, found ${count}`);
  }
  return source.replace(marker, `${insertion}${marker}`);
}

function patchWorkshop() {
  let source = fs.readFileSync(WORKSHOP_PATH, "utf8");
  source = insertOnce(
    source,
    "function nowIso(): string {",
    `export const CREATOR_MARKETPLACE_REQUIRED_QUALITY_SCENARIOS: Readonly<\n  Record<CreatorMarketplaceAuthoringKind, readonly string[]>\n> = Object.freeze({\n  brush: Object.freeze([\"brush-fast-slow\", \"brush-pressure\", \"brush-crossing\"]),\n  tone: Object.freeze([\"tone-seam\", \"tone-dpi\"]),\n  palette: Object.freeze([\"palette-space\", \"palette-contrast\"]),\n  pose: Object.freeze([\"pose-rig\", \"pose-mirror\"]),\n  \"3d\": Object.freeze([\"3d-scale\", \"3d-material\", \"3d-lod\"]),\n  background: Object.freeze([\"background-scroll\", \"background-perspective\"]),\n  bubble: Object.freeze([\"bubble-fit\", \"bubble-vertical\"]),\n  template: Object.freeze([\"template-pages\", \"template-fonts\"]),\n  material: Object.freeze([\"material-install\", \"material-dependencies\"]),\n});\n\n`,
    "quality scenario contract",
  );
  source = replaceOnce(
    source,
    `  const diagnostics: CreatorMarketplaceAuthoringDiagnostic[] = [];\n  const add = (\n    id: string,\n    severity: CreatorMarketplaceAuthoringDiagnostic[\"severity\"],\n    step: CreatorMarketplaceAuthoringDiagnostic[\"step\"],\n    message: string,\n    action: string,\n  ): void => diagnostics.push({ id, severity, step, message, action });`,
    `  const diagnostics: CreatorMarketplaceAuthoringDiagnostic[] = [];\n  const add = (\n    id: string,\n    severity: CreatorMarketplaceAuthoringDiagnostic[\"severity\"],\n    step: CreatorMarketplaceAuthoringDiagnostic[\"step\"],\n    message: string,\n    action: string,\n  ): void => {\n    diagnostics.push({ id, severity, step, message, action });\n  };`,
    "diagnostic callback",
  );

  const returnMarker = "  return diagnostics;\n}";
  const returnIndex = source.lastIndexOf(returnMarker);
  if (returnIndex < 0) throw new Error("authoring diagnostics return marker was not found");
  const qualityValidation = `  const rawQualityScenarios = draft.technical.qualityScenarios;\n  const selectedQualityScenarios = Array.isArray(rawQualityScenarios)\n    ? rawQualityScenarios.filter(\n      (scenario): scenario is string => typeof scenario === \"string\",\n    )\n    : [];\n  const missingQualityScenarios = CREATOR_MARKETPLACE_REQUIRED_QUALITY_SCENARIOS[draft.kind]\n    .filter((scenario) => !selectedQualityScenarios.includes(scenario));\n  if (missingQualityScenarios.length > 0) {\n    add(\n      \"quality-plan\",\n      \"error\",\n      \"preview\",\n      \`필수 품질 시나리오 \${missingQualityScenarios.length}개가 검수 계획에서 누락됐습니다.\`,\n      \"품질 시나리오 화면에서 모든 필수 항목을 선택하고 실제 미리보기 결과를 연결하세요.\",\n    );\n  }\n  if (draft.media.some((media) => !media.alt.trim())) {\n    add(\n      \"preview-alt\",\n      \"error\",\n      \"preview\",\n      \"설명이 없는 미리보기 미디어가 있습니다.\",\n      \"모든 미리보기에 결과와 사용 목적을 설명하는 대체 텍스트를 입력하세요.\",\n    );\n  }\n  if (draft.bundle.some((item) => !item.name.trim() || !item.role.trim())) {\n    add(\n      \"bundle-metadata\",\n      \"error\",\n      \"bundle\",\n      \"이름 또는 설치 역할이 비어 있는 번들 구성요소가 있습니다.\",\n      \"각 구성요소의 이름과 설치 후 역할을 입력하세요.\",\n    );\n  }\n\n`;
  if (!source.includes("missingQualityScenarios")) {
    source = `${source.slice(0, returnIndex)}${qualityValidation}${source.slice(returnIndex)}`;
  }
  fs.writeFileSync(WORKSHOP_PATH, source, "utf8");
}

function patchPackageBuilder() {
  let source = fs.readFileSync(PACKAGE_PATH, "utf8");
  source = replaceOnce(
    source,
    `async function sha256(bytes: Uint8Array): Promise<string> {\n  const digest = await crypto.subtle.digest(\n    \"SHA-256\",\n    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),\n  );`,
    `async function sha256(bytes: Uint8Array): Promise<string> {\n  const ownedBytes = new Uint8Array(bytes.byteLength);\n  ownedBytes.set(bytes);\n  const digest = await crypto.subtle.digest(\"SHA-256\", ownedBytes);`,
    "owned digest input",
  );
  source = replaceOnce(
    source,
    `  const fileName = \`\${safePackageBaseName(draft.title)}-\${safePackageBaseName(draft.release.version)}.toonmarket.zip\`;\n  return {\n    file: new File([archive], fileName, { type: \"application/vnd.toonspectrum.marketplace+zip\" }),`,
    `  const fileName = \`\${safePackageBaseName(draft.title)}-\${safePackageBaseName(draft.release.version)}.toonmarket.zip\`;\n  const ownedArchive = new Uint8Array(archive.byteLength);\n  ownedArchive.set(archive);\n  return {\n    file: new File([ownedArchive.buffer], fileName, {\n      type: \"application/vnd.toonspectrum.marketplace+zip\",\n    }),`,
    "owned archive BlobPart",
  );
  fs.writeFileSync(PACKAGE_PATH, source, "utf8");
}

function patchQualityTest() {
  let source = fs.readFileSync(QUALITY_TEST_PATH, "utf8");
  source = replaceOnce(
    source,
    `  validateCreatorMarketplaceAuthoringDraft,\n  type CreatorMarketplaceAuthoringKind,`,
    `  validateCreatorMarketplaceAuthoringDraft,\n  type CreatorMarketplaceAuthoringDraft,\n  type CreatorMarketplaceAuthoringKind,`,
    "quality test draft type import",
  );
  source = replaceOnce(
    source,
    "function validDraft(kind: CreatorMarketplaceAuthoringKind) {",
    "function validDraft(kind: CreatorMarketplaceAuthoringKind): CreatorMarketplaceAuthoringDraft {",
    "quality test return type",
  );
  fs.writeFileSync(QUALITY_TEST_PATH, source, "utf8");
}

patchWorkshop();
patchPackageBuilder();
patchQualityTest();
console.log("Marketplace authoring type and quality contracts patched.");
