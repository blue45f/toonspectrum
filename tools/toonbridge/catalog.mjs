import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(HERE, "../../config/studio-production-toolchain.json");

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function assertIdentifier(value, label) {
  requireString(value, label);
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(value)) {
    throw new TypeError(`${label} contains an invalid identifier`);
  }
}

export function loadToolchainCatalog(path = CATALOG_PATH) {
  const catalog = JSON.parse(readFileSync(path, "utf8"));
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.tools)) {
    throw new TypeError("invalid Studio production toolchain catalog");
  }
  const ids = new Set();
  for (const tool of catalog.tools) {
    assertIdentifier(tool.id, "tool id");
    if (ids.has(tool.id)) throw new TypeError(`duplicate tool id: ${tool.id}`);
    ids.add(tool.id);
    if (!Array.isArray(tool.operations) || tool.operations.length === 0) {
      throw new TypeError(`tool ${tool.id} has no operations`);
    }
    const operationIds = new Set();
    for (const operation of tool.operations) {
      assertIdentifier(operation.id, `${tool.id} operation id`);
      if (operationIds.has(operation.id)) {
        throw new TypeError(`duplicate operation: ${tool.id}/${operation.id}`);
      }
      operationIds.add(operation.id);
    }
    if (tool.deployment === "local-toonbridge") requireString(tool.binary, `${tool.id} binary`);
    if (tool.deployment === "connector" && tool.binary !== null) {
      throw new TypeError(`connector ${tool.id} must not declare a binary`);
    }
  }
  return Object.freeze(catalog);
}

export const TOOLCHAIN_CATALOG = loadToolchainCatalog();
const TOOL_BY_ID = new Map(TOOLCHAIN_CATALOG.tools.map((tool) => [tool.id, tool]));

export function toolById(id) {
  return TOOL_BY_ID.get(id) ?? null;
}

export function operationById(toolId, operationId) {
  return toolById(toolId)?.operations.find((operation) => operation.id === operationId) ?? null;
}

function toolEnvKey(toolId) {
  return `TOONBRIDGE_TOOL_${toolId.replaceAll("-", "_").toUpperCase()}_BIN`;
}

export function resolvedToolBinary(tool, environment = process.env) {
  const override = environment[toolEnvKey(tool.id)];
  return override?.trim() || tool.binary;
}

export function probeTool(tool, environment = process.env) {
  if (tool.deployment === "connector") {
    return Object.freeze({
      toolId: tool.id,
      state: "connector",
      version: null,
      executable: false,
      reason: "외부 서비스 연결 정보가 필요합니다.",
    });
  }
  if (tool.deployment === "optional-module" || tool.maturity === "research-only") {
    return Object.freeze({
      toolId: tool.id,
      state: "blocked",
      version: null,
      executable: false,
      reason: "별도 라이선스와 연구 프로필에서만 활성화할 수 있습니다.",
    });
  }
  const binary = resolvedToolBinary(tool, environment);
  const result = spawnSync(binary, tool.probeArgs, {
    encoding: "utf8",
    timeout: 4_000,
    shell: false,
    windowsHide: true,
    env: { PATH: environment.PATH ?? "" },
  });
  if (result.error || result.status === null) {
    return Object.freeze({
      toolId: tool.id,
      state: "missing",
      version: null,
      executable: false,
      reason: result.error?.code === "ENOENT" ? "실행 파일을 찾지 못했습니다." : "버전 확인에 실패했습니다.",
    });
  }
  const version = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().slice(0, 500) || null;
  const manual = tool.maturity === "manual-adapter";
  return Object.freeze({
    toolId: tool.id,
    state: manual ? "manual" : "available",
    version,
    executable: !manual && tool.operations.some((operation) => operation.executable),
    reason: manual ? "설치는 확인됐지만 자동 실행 어댑터가 비활성입니다." : "실행 준비가 되었습니다.",
  });
}

export function probeAllTools(environment = process.env) {
  return Object.freeze(TOOLCHAIN_CATALOG.tools.map((tool) => probeTool(tool, environment)));
}
