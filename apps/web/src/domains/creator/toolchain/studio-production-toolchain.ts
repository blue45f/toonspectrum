import { z } from "zod";

import rawCatalog from "../../../../../../config/studio-production-toolchain.json";

export const studioToolchainProfileIdSchema = z.enum([
  "open",
  "community-gpl",
  "research-nc",
]);
export type StudioToolchainProfileId = z.infer<typeof studioToolchainProfileIdSchema>;

export const studioToolDeploymentSchema = z.enum([
  "local-toonbridge",
  "connector",
  "optional-module",
]);
export type StudioToolDeployment = z.infer<typeof studioToolDeploymentSchema>;

export const studioToolMaturitySchema = z.enum([
  "production-candidate",
  "adapter-ready",
  "connector-ready",
  "manual-adapter",
  "research-only",
]);
export type StudioToolMaturity = z.infer<typeof studioToolMaturitySchema>;

export const studioToolLicenseClassSchema = z.enum([
  "permissive",
  "weak-copyleft",
  "copyleft",
  "network-copyleft",
  "noncommercial",
  "mixed",
]);
export type StudioToolLicenseClass = z.infer<typeof studioToolLicenseClassSchema>;

const operationSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  name: z.string().min(1).max(80),
  input: z.string().min(1).max(40),
  output: z.string().min(1).max(40),
  executable: z.boolean(),
}).strict();
export type StudioProductionOperation = z.infer<typeof operationSchema>;

const toolSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  name: z.string().min(1).max(80),
  category: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  license: z.string().min(1).max(120),
  licenseClass: studioToolLicenseClassSchema,
  deployment: studioToolDeploymentSchema,
  binary: z.string().min(1).max(160).nullable(),
  probeArgs: z.array(z.string().max(160)).max(8),
  maturity: studioToolMaturitySchema,
  commercialUse: z.string().min(1).max(80),
  source: z.string().url().max(300),
  description: z.string().min(1).max(300),
  operations: z.array(operationSchema).min(1).max(32),
}).strict();
export type StudioProductionTool = z.infer<typeof toolSchema>;

const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  profiles: z.array(z.object({
    id: studioToolchainProfileIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
  }).strict()).length(3),
  categories: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
    name: z.string().min(1),
  }).strict()).min(1),
  tools: z.array(toolSchema).min(1),
}).strict();

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Studio production toolchain contains duplicate ${label}.`);
  }
}

const parsedCatalog = catalogSchema.parse(rawCatalog);
assertUnique(parsedCatalog.profiles.map(({ id }) => id), "profile ids");
assertUnique(parsedCatalog.categories.map(({ id }) => id), "category ids");
assertUnique(parsedCatalog.tools.map(({ id }) => id), "tool ids");
const categoryIds = new Set(parsedCatalog.categories.map(({ id }) => id));
for (const tool of parsedCatalog.tools) {
  if (!categoryIds.has(tool.category)) {
    throw new Error(`Studio production tool ${tool.id} uses an unknown category.`);
  }
  assertUnique(tool.operations.map(({ id }) => id), `${tool.id} operation ids`);
  if (tool.deployment === "connector" && tool.binary !== null) {
    throw new Error(`Connector ${tool.id} must not declare a local binary.`);
  }
  if (tool.deployment === "local-toonbridge" && !tool.binary) {
    throw new Error(`Local tool ${tool.id} must declare a binary.`);
  }
}

export const STUDIO_PRODUCTION_TOOLCHAIN = Object.freeze(parsedCatalog);
export const STUDIO_PRODUCTION_TOOLS = Object.freeze([...parsedCatalog.tools]);
export const STUDIO_PRODUCTION_CATEGORIES = Object.freeze([...parsedCatalog.categories]);
export const STUDIO_TOOLCHAIN_PROFILES = Object.freeze([...parsedCatalog.profiles]);

const toolById = new Map(STUDIO_PRODUCTION_TOOLS.map((tool) => [tool.id, tool]));
const categoryById = new Map(STUDIO_PRODUCTION_CATEGORIES.map((category) => [category.id, category]));

export function studioProductionTool(toolId: string): StudioProductionTool | null {
  return toolById.get(toolId) ?? null;
}

export function studioProductionCategoryName(categoryId: string): string {
  return categoryById.get(categoryId)?.name ?? categoryId;
}

export function studioProductionOperation(
  toolId: string,
  operationId: string,
): StudioProductionOperation | null {
  return studioProductionTool(toolId)?.operations.find(({ id }) => id === operationId) ?? null;
}

export interface StudioToolAdmission {
  readonly allowed: boolean;
  readonly execution: "local" | "connector" | "optional";
  readonly reason: string;
}

export function admitStudioProductionTool(
  tool: StudioProductionTool,
  profile: StudioToolchainProfileId,
): StudioToolAdmission {
  const execution = tool.deployment === "connector"
    ? "connector"
    : tool.deployment === "optional-module"
      ? "optional"
      : "local";
  if (tool.licenseClass === "noncommercial" && profile !== "research-nc") {
    return Object.freeze({
      allowed: false,
      execution,
      reason: "비상업 전용 도구는 Research NC 프로필에서만 사용할 수 있습니다.",
    });
  }
  if (profile === "open" && tool.licenseClass === "mixed") {
    return Object.freeze({
      allowed: tool.deployment === "connector",
      execution,
      reason: tool.deployment === "connector"
        ? "연결한 구현체의 라이선스와 배포 조건을 별도로 확인해야 합니다."
        : "혼합 라이선스 도구는 Open 기본 프로필에 직접 포함하지 않습니다.",
    });
  }
  if (tool.maturity === "manual-adapter") {
    return Object.freeze({
      allowed: true,
      execution,
      reason: "설치 상태는 확인하지만 자동 실행 어댑터는 명시적으로 활성화해야 합니다.",
    });
  }
  if (tool.maturity === "research-only") {
    return Object.freeze({
      allowed: profile === "research-nc",
      execution,
      reason: profile === "research-nc"
        ? "비상업 연구 범위와 원본 라이선스를 유지합니다."
        : "연구 전용 도구입니다.",
    });
  }
  const isolated = tool.licenseClass !== "permissive";
  return Object.freeze({
    allowed: true,
    execution,
    reason: isolated
      ? "앱 번들에 포함하지 않고 별도 실행기 또는 외부 서비스 경계에서 사용합니다."
      : "검증된 별도 실행기 또는 연결 경로로 사용할 수 있습니다.",
  });
}

export function studioProductionToolsForProfile(
  profile: StudioToolchainProfileId,
): readonly StudioProductionTool[] {
  return Object.freeze(
    STUDIO_PRODUCTION_TOOLS.filter((tool) => admitStudioProductionTool(tool, profile).allowed),
  );
}

export function groupStudioProductionTools(
  profile: StudioToolchainProfileId,
): readonly {
  readonly id: string;
  readonly name: string;
  readonly tools: readonly StudioProductionTool[];
}[] {
  return Object.freeze(STUDIO_PRODUCTION_CATEGORIES.map((category) => Object.freeze({
    ...category,
    tools: Object.freeze(
      STUDIO_PRODUCTION_TOOLS.filter((tool) =>
        tool.category === category.id && admitStudioProductionTool(tool, profile).allowed
      ),
    ),
  })).filter(({ tools }) => tools.length > 0));
}

export function isStudioProductionOperationExecutable(
  toolId: string,
  operationId: string,
): boolean {
  const tool = studioProductionTool(toolId);
  const operation = studioProductionOperation(toolId, operationId);
  return Boolean(
    tool
    && operation?.executable
    && tool.deployment === "local-toonbridge"
    && tool.maturity !== "manual-adapter"
    && tool.maturity !== "research-only",
  );
}
