#!/usr/bin/env node
/* eslint-disable no-useless-escape -- These migration utilities intentionally store escaped source-code templates. */

import fs from "node:fs";

const WORKSHOP_PATH = "lib/creator-marketplace-authoring-workshop.ts";
const PACKAGE_PATH = "lib/creator-marketplace-package-builder.ts";
const QUALITY_TEST_PATH = "lib/creator-marketplace-quality-validation.test.ts";

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one replacement target, found ${count}`);
  }
  return source.replace(before, after);
}

function patchWorkshop() {
  let source = fs.readFileSync(WORKSHOP_PATH, "utf8");
  source = replaceOnce(
    source,
    `export type CreatorMarketplaceAuthoringKind =\n  (typeof CREATOR_MARKETPLACE_AUTHORING_KINDS)[number];`,
    `export type CreatorMarketplaceAuthoringKind =\n  (typeof CREATOR_MARKETPLACE_AUTHORING_KINDS)[number];\n\nexport const CREATOR_MARKETPLACE_REQUIRED_QUALITY_SCENARIOS: Readonly<\n  Record<CreatorMarketplaceAuthoringKind, readonly string[]>\n> = {\n  brush: ["brush-fast-slow", "brush-pressure", "brush-crossing"],\n  tone: ["tone-seam", "tone-dpi"],\n  palette: ["palette-space", "palette-contrast"],\n  pose: ["pose-rig", "pose-mirror"],\n  "3d": ["3d-scale", "3d-material", "3d-lod"],\n  background: ["background-scroll", "background-perspective"],\n  bubble: ["bubble-fit", "bubble-vertical"],\n  template: ["template-pages", "template-fonts"],\n  material: ["material-install", "material-dependencies"],\n};`,
    "required quality scenario contract",
  );
  source = replaceOnce(
    source,
    `  const diagnostics: CreatorMarketplaceAuthoringDiagnostic[] = [];\n  const add = (\n    id: string,\n    severity: CreatorMarketplaceAuthoringDiagnostic["severity"],\n    step: CreatorMarketplaceAuthoringDiagnostic["step"],\n    message: string,\n    action: string,\n  ): void => diagnostics.push({ id, severity, step, message, action });`,
    `  const diagnostics: CreatorMarketplaceAuthoringDiagnostic[] = [];\n  const add = (\n    id: string,\n    severity: CreatorMarketplaceAuthoringDiagnostic["severity"],\n    step: CreatorMarketplaceAuthoringDiagnostic["step"],\n    message: string,\n    action: string,\n  ): void => {\n    diagnostics.push({ id, severity, step, message, action });\n  };`,
    "diagnostic callback",
  );
  source = replaceOnce(
    source,
    `  if (draft.media.length === 0) add("preview", "warning", "preview", "실사용 미리보기가 없습니다.", "커버 또는 스트로크 테스트 시트를 추가하세요.");`,
    `  const qualityScenarios = Array.isArray(draft.technical.qualityScenarios)\n    ? draft.technical.qualityScenarios.filter((value): value is string => typeof value === "string")\n    : [];\n  const missingQualityScenarios = CREATOR_MARKETPLACE_REQUIRED_QUALITY_SCENARIOS[draft.kind]\n    .filter((scenario) => !qualityScenarios.includes(scenario));\n  if (missingQualityScenarios.length > 0) {\n    add(\n      "quality-plan",\n      "error",\n      "preview",\n      \`필수 품질 시나리오 \${missingQualityScenarios.length}개가 계획되지 않았습니다.\`,\n      "미리보기 단계에서 필수 시나리오를 선택하고 실제 결과를 첨부하세요.",\n    );\n  }\n  if (draft.media.length === 0) add("preview", "warning", "preview", "실사용 미리보기가 없습니다.", "커버 또는 스트로크 테스트 시트를 추가하세요.");\n  if (draft.media.some((media) => media.alt.trim().length < 3)) {\n    add("preview-alt", "error", "preview", "대체 텍스트가 없는 미리보기가 있습니다.", "각 미디어가 무엇을 검증하는지 설명하세요.");\n  }\n  if (draft.bundle.some((item) => !item.name.trim() || !item.role.trim())) {\n    add("bundle-metadata", "error", "bundle", "이름 또는 역할이 비어 있는 번들 항목이 있습니다.", "설치 항목의 이름과 역할을 입력하세요.");\n  }`,
    "quality and media validation",
  );
  fs.writeFileSync(WORKSHOP_PATH, source, "utf8");
}

function patchPackageBuilder() {
  let source = fs.readFileSync(PACKAGE_PATH, "utf8");
  source = replaceOnce(
    source,
    `function safePackageBaseName(value: string): string {\n  const normalized = value\n    .normalize("NFKC")\n    .replace(/[\\\\/:*?"<>|\\u0000-\\u001f]+/gu, "-")\n    .replace(/\\s+/gu, "-")\n    .replace(/^-+|-+$/gu, "")\n    .slice(0, 96);\n  return normalized || "marketplace-asset";\n}\n\nexport function sanitizeCreatorMarketplaceArchivePath(value: string): string {\n  const normalized = value.normalize("NFKC").replaceAll("\\\\", "/");\n  const parts = normalized\n    .split("/")\n    .filter((part) => part.length > 0 && part !== ".")\n    .map((part) => part.replace(/[\\u0000-\\u001f:*?"<>|]+/gu, "-").slice(0, 120));\n  if (parts.some((part) => part === "..") || parts.length === 0) {\n    throw new CreatorMarketplacePackageError("unsafe-name", "안전하지 않은 패키지 파일 이름입니다.");\n  }\n  return parts.join("/");\n}`,
    `function replaceUnsafeNameCharacters(value: string, forbidden: string): string {\n  return Array.from(value, (character) => {\n    const codePoint = character.codePointAt(0) ?? 0;\n    return codePoint < 32 || forbidden.includes(character) ? "-" : character;\n  }).join("");\n}\n\nfunction safePackageBaseName(value: string): string {\n  const normalized = replaceUnsafeNameCharacters(\n    value.normalize("NFKC"),\n    "\\\\/:*?\\"<>|",\n  )\n    .replace(/\\s+/gu, "-")\n    .replace(/^-+|-+$/gu, "")\n    .slice(0, 96);\n  return normalized || "marketplace-asset";\n}\n\nexport function sanitizeCreatorMarketplaceArchivePath(value: string): string {\n  const normalized = value.normalize("NFKC").replaceAll("\\\\", "/");\n  const parts = normalized\n    .split("/")\n    .filter((part) => part.length > 0 && part !== ".")\n    .map((part) => replaceUnsafeNameCharacters(part, ":*?\\"<>|").slice(0, 120));\n  if (parts.some((part) => part === "..") || parts.length === 0) {\n    throw new CreatorMarketplacePackageError("unsafe-name", "안전하지 않은 패키지 파일 이름입니다.");\n  }\n  return parts.join("/");\n}`,
    "archive path sanitization",
  );
  source = replaceOnce(
    source,
    `  const digest = await crypto.subtle.digest(\n    "SHA-256",\n    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),\n  );`,
    `  const digestInput = Uint8Array.from(bytes);\n  const digest = await crypto.subtle.digest("SHA-256", digestInput);`,
    "SubtleCrypto digest input",
  );
  source = replaceOnce(
    source,
    `  const fileName = \`\${safePackageBaseName(draft.title)}-\${safePackageBaseName(draft.release.version)}.toonmarket.zip\`;\n  return {\n    file: new File([archive], fileName, { type: "application/vnd.toonspectrum.marketplace+zip" }),`,
    `  const fileName = \`\${safePackageBaseName(draft.title)}-\${safePackageBaseName(draft.release.version)}.toonmarket.zip\`;\n  const ownedArchive = Uint8Array.from(archive);\n  return {\n    file: new File([ownedArchive.buffer], fileName, {\n      type: "application/vnd.toonspectrum.marketplace+zip",\n    }),`,
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
