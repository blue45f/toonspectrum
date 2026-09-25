import type {
  IntegrationRuntimeConnectorStatus,
  IntegrationRuntimeExecuteRequest,
} from "./integration-platform-types";

interface UuidSource {
  randomUUID(): string;
}

export function newIntegrationMutationId(
  source: UuidSource = globalThis.crypto,
): string {
  return source.randomUUID();
}

export function runtimeExampleJson(
  connector: IntegrationRuntimeConnectorStatus,
): string {
  return JSON.stringify(connector.exampleInput, null, 2);
}

export function parseRuntimeInput(text: string): Readonly<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("입력 JSON 형식을 확인해 주세요.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("공급자 입력은 JSON 객체여야 합니다.");
  }
  return value as Readonly<Record<string, unknown>>;
}

export function buildRuntimeExecutionRequest(input: {
  readonly connector: IntegrationRuntimeConnectorStatus;
  readonly projectId: string;
  readonly mutationId: string;
  readonly inputJson: string;
  readonly dryRun: boolean;
  readonly confirm: boolean;
}): IntegrationRuntimeExecuteRequest {
  const projectId = input.projectId.trim();
  if (!projectId) throw new Error("제작 프로젝트 ID를 입력해 주세요.");
  if (!input.mutationId) throw new Error("요청 식별자를 만들지 못했습니다.");
  if (!input.dryRun && !input.confirm) {
    throw new Error("실제 외부 실행 전 확인란을 선택해 주세요.");
  }
  return {
    projectId,
    mutationId: input.mutationId,
    dryRun: input.dryRun,
    confirm: input.dryRun ? false : input.confirm,
    request: {
      providerId: input.connector.providerId,
      action: input.connector.action,
      input: parseRuntimeInput(input.inputJson),
    },
  };
}

export function executionResultLabel(state: string, replayed = false): string {
  if (state === "planned") return "실행 계획 확인 완료";
  if (state === "succeeded" && replayed) return "기존 성공 영수증 재사용";
  if (state === "succeeded") return "외부 실행 완료";
  return state;
}
