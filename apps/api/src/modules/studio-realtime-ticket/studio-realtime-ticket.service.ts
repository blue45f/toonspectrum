import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";

import {
  STUDIO_REALTIME_TICKET_AUTHORIZATION,
  StudioRealtimeTicketAuthorizationDecisionSchema,
  normalizeStudioRealtimeTicketOrigin,
} from "./studio-realtime-ticket.authorization";
import { StudioRealtimeTicketSignerDescriptorSchema } from "./studio-realtime-ticket.configuration";
import {
  IssueStudioRealtimeTicketSchema,
  StudioRealtimeTicketResponseSchema,
} from "./studio-realtime-ticket.dto";
import {
  STUDIO_REALTIME_TICKET_SIGNERS,
  StudioRealtimeTicketSignerResultSchema,
} from "./studio-realtime-ticket.provider";

import type {
  StudioRealtimeTicketAuthorizationPort,
} from "./studio-realtime-ticket.authorization";
import type {
  IssueStudioRealtimeTicketDto,
  StudioRealtimeTicketResponse,
  StudioRealtimeTicketWorkload,
} from "./studio-realtime-ticket.dto";
import type {
  StudioRealtimeTicketSignerPort,
} from "./studio-realtime-ticket.provider";

const TICKET_FORBIDDEN_MESSAGE =
  "이 작업실의 실시간 기능을 사용할 권한이 없습니다.";
const TICKET_UNAVAILABLE_MESSAGE =
  "실시간 작업실 입장권을 발급할 수 없습니다.";

function exactList(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function containsAll<Value>(
  granted: readonly Value[],
  requested: readonly Value[],
): boolean {
  const grantSet = new Set(granted);
  return requested.every((value) => grantSet.has(value));
}

function creatorRoleCanUseWorkloads(
  workloads: readonly StudioRealtimeTicketWorkload[],
  capabilities: Readonly<{ view: boolean; comment: boolean }>,
): boolean {
  return workloads.every((workload) => {
    switch (workload) {
      case "comments":
        return capabilities.view && capabilities.comment;
      case "presence":
      case "screen-signaling":
        return capabilities.view;
    }
  });
}

@Injectable()
export class StudioRealtimeTicketService {
  constructor(
    @Inject(STUDIO_REALTIME_TICKET_AUTHORIZATION)
    private readonly authorization: StudioRealtimeTicketAuthorizationPort,
    @Inject(STUDIO_REALTIME_TICKET_SIGNERS)
    private readonly signers: readonly StudioRealtimeTicketSignerPort[],
  ) {}

  async issue(
    actorUserId: string,
    originHeader: string | undefined,
    body: IssueStudioRealtimeTicketDto,
  ): Promise<StudioRealtimeTicketResponse> {
    const request = IssueStudioRealtimeTicketSchema.parse(body);
    const origin = normalizeStudioRealtimeTicketOrigin(originHeader);
    if (originHeader !== undefined && origin === null) {
      throw new ForbiddenException(TICKET_FORBIDDEN_MESSAGE);
    }

    let rawDecision: unknown;
    try {
      rawDecision = await this.authorization.authorize({
        ...request,
        actorUserId,
        origin,
      });
    } catch {
      throw new ServiceUnavailableException(TICKET_UNAVAILABLE_MESSAGE);
    }
    const parsedDecision =
      StudioRealtimeTicketAuthorizationDecisionSchema.safeParse(rawDecision);
    if (!parsedDecision.success) {
      throw new ServiceUnavailableException(TICKET_UNAVAILABLE_MESSAGE);
    }
    const decision = parsedDecision.data;
    if (!decision.allowed) {
      throw new ForbiddenException(TICKET_FORBIDDEN_MESSAGE);
    }
    if (
      decision.actorUserId !== actorUserId ||
      decision.providerId !== request.providerId ||
      decision.sessionId !== request.sessionId ||
      decision.scope.workId !== request.scope.workId ||
      decision.scope.roomId !== request.scope.roomId ||
      decision.origin !== origin ||
      !exactList(decision.workloads, request.workloads) ||
      !exactList(decision.capabilities, request.capabilities)
    ) {
      throw new ServiceUnavailableException(TICKET_UNAVAILABLE_MESSAGE);
    }
    if (
      !creatorRoleCanUseWorkloads(
        request.workloads,
        decision.creatorCapabilities,
      )
    ) {
      throw new ForbiddenException(TICKET_FORBIDDEN_MESSAGE);
    }

    let authorizationExpiresAtEpochMs: number | undefined;
    if (decision.authorizationExpiresAt !== undefined) {
      authorizationExpiresAtEpochMs = Date.parse(
        decision.authorizationExpiresAt,
      );
      if (
        !Number.isFinite(authorizationExpiresAtEpochMs) ||
        authorizationExpiresAtEpochMs <= Date.now()
      ) {
        throw new ForbiddenException(TICKET_FORBIDDEN_MESSAGE);
      }
    }

    let signer: StudioRealtimeTicketSignerPort | undefined;
    let descriptor: ReturnType<
      typeof StudioRealtimeTicketSignerDescriptorSchema.safeParse
    > | undefined;
    try {
      if (!Array.isArray(this.signers)) {
        throw new Error("invalid signer registry");
      }
      const candidates = this.signers.map((candidate) => ({
        candidate,
        descriptor: StudioRealtimeTicketSignerDescriptorSchema.safeParse(
          candidate.descriptor,
        ),
      }));
      if (candidates.some((candidate) => !candidate.descriptor.success)) {
        throw new Error("invalid signer descriptor");
      }
      const matchingSigners = candidates.filter(
        (candidate) =>
          candidate.descriptor.success &&
          candidate.descriptor.data.providerId === request.providerId,
      );
      if (matchingSigners.length !== 1) {
        throw new Error("ambiguous signer");
      }
      signer = matchingSigners[0]!.candidate;
      descriptor = matchingSigners[0]!.descriptor;
    } catch {
      throw new ServiceUnavailableException(TICKET_UNAVAILABLE_MESSAGE);
    }
    if (
      !signer ||
      !descriptor?.success ||
      !containsAll(descriptor.data.workloads, request.workloads) ||
      !containsAll(descriptor.data.capabilities, request.capabilities)
    ) {
      throw new ServiceUnavailableException(TICKET_UNAVAILABLE_MESSAGE);
    }

    let rawSignedTicket: unknown;
    try {
      rawSignedTicket = await signer.issue({
        actorUserId,
        sessionId: request.sessionId,
        scope: request.scope,
        workloads: request.workloads,
        capabilities: request.capabilities,
        origin,
        ...(authorizationExpiresAtEpochMs === undefined
          ? {}
          : { authorizationExpiresAtEpochMs }),
      });
    } catch {
      throw new ServiceUnavailableException(TICKET_UNAVAILABLE_MESSAGE);
    }
    const signedTicket =
      StudioRealtimeTicketSignerResultSchema.safeParse(rawSignedTicket);
    if (!signedTicket.success) {
      throw new ServiceUnavailableException(TICKET_UNAVAILABLE_MESSAGE);
    }

    const response = StudioRealtimeTicketResponseSchema.safeParse({
      version: 1,
      providerId: request.providerId,
      scope: request.scope,
      workloads: request.workloads,
      capabilities: request.capabilities,
      issuedAt: signedTicket.data.issuedAt,
      expiresAt: signedTicket.data.expiresAt,
      ticket: signedTicket.data.ticket,
    });
    if (!response.success) {
      throw new ServiceUnavailableException(TICKET_UNAVAILABLE_MESSAGE);
    }
    return response.data;
  }
}
