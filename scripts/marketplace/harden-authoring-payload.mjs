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

if (!source.includes("creator-marketplace-authoring-safety")) {
  source = `import {\n  measureCreatorMarketplacePortableValueBytes,\n  sanitizeCreatorMarketplacePortableValue,\n} from "./creator-marketplace-authoring-safety";\n\n${source}`;
}

replaceOnce(
  "export const CREATOR_MARKETPLACE_AUTHORING_SCHEMA_VERSION = 2 as const;",
  `export const CREATOR_MARKETPLACE_AUTHORING_SCHEMA_VERSION = 2 as const;\nexport const CREATOR_MARKETPLACE_MAX_ENGINE_NODES = 32 as const;\nexport const CREATOR_MARKETPLACE_MAX_MAPPINGS_PER_ENGINE = 64 as const;\nexport const CREATOR_MARKETPLACE_MAX_TIPS_PER_ENGINE = 64 as const;`,
  "authoring limits",
);

replaceOnce(
  `mappings: Array.isArray(node.mappings)\n      ? node.mappings.filter(isRecord).map(normalizeMapping) : fallback.mappings,\n    tipLayers: Array.isArray(node.tipLayers)\n      ? node.tipLayers.filter(isRecord).map(normalizeTip) : fallback.tipLayers,`,
  `mappings: Array.isArray(node.mappings)\n      ? node.mappings\n          .filter(isRecord)\n          .slice(0, CREATOR_MARKETPLACE_MAX_MAPPINGS_PER_ENGINE)\n          .map(normalizeMapping)\n      : fallback.mappings,\n    tipLayers: Array.isArray(node.tipLayers)\n      ? node.tipLayers\n          .filter(isRecord)\n          .slice(0, CREATOR_MARKETPLACE_MAX_TIPS_PER_ENGINE)\n          .map(normalizeTip)\n      : fallback.tipLayers,`,
  "mapping and tip normalization",
);

replaceOnce(
  `engineNodes: Array.isArray(brush.engineNodes)\n        ? brush.engineNodes.filter(isRecord).map(normalizeEngineNode) : fallback.brush.engineNodes,`,
  `engineNodes: Array.isArray(brush.engineNodes)\n        ? brush.engineNodes\n            .filter(isRecord)\n            .slice(0, CREATOR_MARKETPLACE_MAX_ENGINE_NODES)\n            .map(normalizeEngineNode)\n        : fallback.brush.engineNodes,`,
  "engine normalization",
);

replaceOnce(
  `function canonicalize(value: unknown): unknown {\n  if (Array.isArray(value)) return value.map(canonicalize);\n  if (!isRecord(value)) return value;\n  return Object.fromEntries(\n    Object.entries(value)\n      .filter(([, entry]) => entry !== undefined)\n      .sort(([left], [right]) => left.localeCompare(right))\n      .map(([key, entry]) => [key, canonicalize(entry)]),\n  );\n}`,
  `function canonicalize(value: unknown): unknown {\n  return sanitizeCreatorMarketplacePortableValue(value);\n}`,
  "bounded canonicalization",
);

replaceOnce(
  `  const diagnostics: CreatorMarketplaceAuthoringDiagnostic[] = [];\n  const add = (`,
  `  const diagnostics: CreatorMarketplaceAuthoringDiagnostic[] = [];\n  const rawEngineNodes = draftInput.brush.engineNodes;\n  const rawPrograms = draftInput.brush.originalEnginePrograms;\n  const add = (`,
  "validation raw limits",
);

replaceOnce(
  `  if (draft.kind === "brush") {\n    const enabled = draft.brush.engineNodes.filter((node) => node.enabled);`,
  `  if (draft.kind === "brush") {\n    if (rawEngineNodes.length > CREATOR_MARKETPLACE_MAX_ENGINE_NODES) {\n      add(\n        "engine-node-limit",\n        "error",\n        "recipe",\n        \`브러시 엔진 패스가 \${CREATOR_MARKETPLACE_MAX_ENGINE_NODES}개 제한을 초과했습니다.\`,\n        "연관 패스를 번들 브러시로 분리하세요.",\n      );\n    }\n    if (rawPrograms.length > CREATOR_MARKETPLACE_MAX_ENGINE_NODES) {\n      add(\n        "native-program-limit",\n        "error",\n        "recipe",\n        \`Brush Studio native program이 \${CREATOR_MARKETPLACE_MAX_ENGINE_NODES}개 제한을 초과했습니다.\`,\n        "브러시 세트 또는 하위 프리셋으로 분리하세요.",\n      );\n    }\n    if (rawEngineNodes.some((node) => node.mappings.length > CREATOR_MARKETPLACE_MAX_MAPPINGS_PER_ENGINE)) {\n      add("mapping-limit", "error", "recipe", "한 엔진의 입력 매핑이 허용 수를 초과했습니다.", "매핑을 정리하거나 엔진 패스를 분리하세요.");\n    }\n    if (rawEngineNodes.some((node) => node.tipLayers.length > CREATOR_MARKETPLACE_MAX_TIPS_PER_ENGINE)) {\n      add("tip-limit", "error", "recipe", "한 엔진의 팁·그레인 레이어가 허용 수를 초과했습니다.", "팁 레이어를 번들로 분리하세요.");\n    }\n    const enabled = draft.brush.engineNodes.filter((node) => node.enabled);`,
  "brush validation limits",
);

replaceOnce(
  `  if (!draft.compatibility.mouse && !draft.compatibility.touch && !draft.compatibility.stylus) add("input-device", "error", "compatibility", "지원 입력 장치가 없습니다.", "마우스·터치·펜 중 하나를 선택하세요.");\n  return diagnostics;`,
  `  if (!draft.compatibility.mouse && !draft.compatibility.touch && !draft.compatibility.stylus) add("input-device", "error", "compatibility", "지원 입력 장치가 없습니다.", "마우스·터치·펜 중 하나를 선택하세요.");\n  try {\n    const payloadBytes = measureCreatorMarketplacePortableValueBytes({\n      source: draft.source,\n      brush: draft.kind === "brush" ? draft.brush : undefined,\n      technical: draft.technical,\n      media: draft.media,\n      bundle: draft.bundle,\n    });\n    if (payloadBytes > 12 * 1024 * 1024) {\n      add("payload-headroom", "warning", "bundle", "제작 원본이 패키지 상한에 가깝습니다.", "대형 텍스처·영상은 별도 번들 파일로 분리하세요.");\n    }\n  } catch (error) {\n    add(\n      "authoring-payload",\n      "error",\n      "bundle",\n      error instanceof Error ? error.message : "제작 원본을 안전하게 직렬화할 수 없습니다.",\n      "순환 참조·렌더러 객체·과도한 인라인 바이너리를 제거하세요.",\n    );\n  }\n  return diagnostics;`,
  "payload diagnostic",
);

replaceOnce(
  `  window.localStorage.setItem(CREATOR_MARKETPLACE_AUTHORING_STORAGE_KEY, JSON.stringify(normalized));`,
  `  window.localStorage.setItem(\n    CREATOR_MARKETPLACE_AUTHORING_STORAGE_KEY,\n    serializeCreatorMarketplaceAuthoringDraft(normalized),\n  );`,
  "safe autosave",
);

writeFileSync(target, source);
writeFileSync(
  resolve(root, "marketplace-authoring-payload-safety-report.json"),
  `${JSON.stringify({ target: "lib/creator-marketplace-authoring-workshop.ts", status: "integrated" }, null, 2)}\n`,
);
