import { createHash } from "node:crypto";

import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";

import { ProductionCollaborationService } from "../production-collaboration/production-collaboration.service";
import type {
  IntegrationRuntimeExecuteDto,
  IntegrationRuntimeReceiptQueryDto,
} from "./integration-runtime.dto";
import {
  IntegrationRuntimeConfigurationError,
  IntegrationRuntimeProviderEngine,
} from "./integration-runtime.providers";
import {
  IntegrationRuntimeDailyQuotaError,
  IntegrationRuntimeMutationConflictError,
  IntegrationRuntimeMutationInFlightError,
  IntegrationRuntimeRepository,
} from "./integration-runtime.repository";
import { IntegrationRuntimeExternalError } from "./integration-runtime.transport";

export const INTEGRATION_RUNTIME_ENGINE = Symbol("INTEGRATION_RUNTIME_ENGINE");

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function integrationRuntimeDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

@Injectable()
export class IntegrationRuntimeService {
  constructor(
    @Inject(ProductionCollaborationService)
    private readonly productionService: ProductionCollaborationService,
    @Inject(IntegrationRuntimeRepository)
    private readonly repository: IntegrationRuntimeRepository,
    @Inject(INTEGRATION_RUNTIME_ENGINE)
    private readonly engine: IntegrationRuntimeProviderEngine,
  ) {}

  connectors() {
    return {
      generatedAt: new Date().toISOString(),
      durability: "database-receipt",
      connectors: this.engine.connectors(),
      safety: {
        explicitConfirmation: true,
        idempotencyReceipt: true,
        unofficialBrowserAutomation: false,
        providerPasswordsAccepted: false,
      },
    };
  }

  private async requireProjectAccess(
    actorUserId: string,
    projectId: string,
    write: boolean,
  ) {
    const record = await this.productionService.getProject(actorUserId, projectId);
    if (write && !record.access.edit) {
      throw new ForbiddenException("프로젝트 편집 권한이 필요합니다.");
    }
    return record;
  }

  private mapFence(error: unknown): never {
    if (error instanceof IntegrationRuntimeDailyQuotaError) {
      throw new HttpException({
        code: "integration_runtime_daily_quota_exceeded",
        message: "오늘 실행 가능한 외부 연동 횟수를 모두 사용했습니다.",
        limit: error.limit,
        resetAt: error.resetAt.toISOString(),
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (error instanceof IntegrationRuntimeMutationConflictError) {
      throw new ConflictException({
        code: "idempotency_key_reuse",
        message: "같은 외부 연동 요청 ID가 다른 내용에 사용되었습니다.",
      });
    }
    if (error instanceof IntegrationRuntimeMutationInFlightError) {
      throw new ConflictException({
        code: `integration_${error.state}`,
        message: error.state === "uncertain"
          ? "외부 서비스 처리 결과가 불확실합니다. 공급자 상태를 확인한 뒤 새 요청 ID로 재조정해 주세요."
          : "같은 외부 연동 요청이 아직 처리 중입니다.",
        state: error.state,
        externalId: error.externalId,
      });
    }
    throw error;
  }

  async listReceipts(
    actorUserId: string,
    query: IntegrationRuntimeReceiptQueryDto,
  ) {
    await this.requireProjectAccess(actorUserId, query.projectId, false);
    return {
      generatedAt: new Date().toISOString(),
      receipts: await this.repository.listReceipts(
        query.projectId,
        actorUserId,
        query.limit,
      ),
    };
  }

  async execute(actorUserId: string, input: IntegrationRuntimeExecuteDto) {
    const connector = this.engine.status(input.request.providerId);
    await this.requireProjectAccess(
      actorUserId,
      input.projectId,
      connector.writesExternalState,
    );

    const requestDigest = integrationRuntimeDigest({
      projectId: input.projectId,
      request: input.request,
    });
    if (input.dryRun) {
      return {
        schema: "toonspectrum.integration-runtime-plan/1",
        state: "planned",
        generatedAt: new Date().toISOString(),
        projectId: input.projectId,
        mutationId: input.mutationId,
        requestDigest,
        providerId: input.request.providerId,
        action: input.request.action,
        configured: connector.configured,
        executable: connector.configured,
        writesExternalState: connector.writesExternalState,
        executionMode: connector.executionMode,
        missingConfigurationCount: connector.missingConfigurationCount,
        notice: connector.configured
          ? "Dry run only. No external request was sent and no receipt was written."
          : "Dry run only. Operator configuration is incomplete, so live execution remains closed.",
      };
    }

    if (!connector.configured) {
      throw new ServiceUnavailableException({
        code: `${connector.providerId}_not_configured`,
        message: "외부 공급자 실행 설정이 완료되지 않았습니다.",
      });
    }

    let replay: Record<string, unknown> | null;
    try {
      ({ replay } = await this.repository.beginMutation({
        projectId: input.projectId,
        actorUserId,
        mutationId: input.mutationId,
        provider: input.request.providerId,
        operation: input.request.action,
        requestDigest,
      }));
    } catch (error) {
      this.mapFence(error);
    }
    if (replay) return { ...replay, replayed: true };

    let providerResult: Awaited<ReturnType<IntegrationRuntimeProviderEngine["execute"]>> | null = null;
    try {
      providerResult = await this.engine.execute(input.request);
      const completedAt = new Date().toISOString();
      const response = {
        schema: "toonspectrum.integration-runtime-receipt/1",
        state: "succeeded",
        replayed: false,
        completedAt,
        projectId: input.projectId,
        mutationId: input.mutationId,
        requestDigest,
        providerId: input.request.providerId,
        action: input.request.action,
        externalId: providerResult.externalId,
        transientResult: providerResult.receiptResponse !== undefined,
        result: providerResult.response,
      };
      const durableResponse = providerResult.receiptResponse
        ? { ...response, result: providerResult.receiptResponse }
        : response;
      await this.repository.completeMutation({
        projectId: input.projectId,
        actorUserId,
        mutationId: input.mutationId,
        externalId: providerResult.externalId,
        response: durableResponse,
      });
      return response;
    } catch (error) {
      const classified = error instanceof IntegrationRuntimeExternalError
        ? {
            code: error.code,
            uncertain: error.uncertain,
            status: error.status,
          }
        : error instanceof IntegrationRuntimeConfigurationError
          ? {
              code: error.message,
              uncertain: false,
              status: null,
            }
          : {
              code: providerResult
                ? "external_receipt_persistence_failed"
                : "integration_runtime_unknown_error",
              uncertain: true,
              status: null,
            };
      await this.repository.failMutation({
        projectId: input.projectId,
        actorUserId,
        mutationId: input.mutationId,
        state: classified.uncertain ? "uncertain" : "failed",
        errorCode: classified.code,
        externalId: providerResult?.externalId ?? null,
      }).catch(() => undefined);

      if (error instanceof IntegrationRuntimeConfigurationError) {
        throw new ServiceUnavailableException({
          code: classified.code,
          message: "외부 공급자 실행 설정이 완료되지 않았습니다.",
        });
      }
      throw new BadGatewayException({
        code: classified.code,
        state: classified.uncertain ? "uncertain" : "failed",
        providerStatus: classified.status,
        message: classified.uncertain
          ? "외부 서비스 결과가 불확실합니다. 자동 재실행하지 말고 공급자 상태를 확인해 주세요."
          : "외부 서비스가 요청을 거부했습니다. 입력과 공급자 권한을 확인해 주세요.",
      });
    }
  }
}
