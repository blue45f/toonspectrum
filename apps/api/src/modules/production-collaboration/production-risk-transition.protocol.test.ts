import { BadRequestException, ConflictException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionProjectAggregate, type ProductionProjectAggregate } from "@toonspectrum/core/production";
import type { ProductionCollaborationRepository } from "./production-collaboration.repository";
import { ProductionCollaborationService } from "./production-collaboration.service";
import { ExecuteProductionCommandSchema } from "./production-collaboration.dto";

const at = "2026-09-20T00:00:00.000Z";
const mutateProject = vi.fn();
const service = new ProductionCollaborationService({ mutateProject } as unknown as ProductionCollaborationRepository);
function project(): ProductionProjectAggregate {
  const base = createProductionProjectAggregate({ projectId: "risk-project", workId: "risk-work",
    title: "Risk transition", collaborationModel: "co-creator", ownerPartyId: "owner-party",
    ownerUserId: "owner", ownerDisplayName: "Owner", at });
  return { ...base, riskResponses: [{
    id: "response-1", projectId: base.projectId, riskId: "risk-1", revision: 3,
    strategy: "mitigate", actionType: "reassign", title: "Reassign", description: "Proposal",
    ownerAssignmentId: null, dueAt: null, linkedTaskId: null, linkedChangeRequestId: null,
    linkedChangeOrderId: null, expectedEffect: "Reduce delay", actualEffect: null,
    cancellationReason: null, status: "proposed", approvedAt: null, startedAt: null,
    completedAt: null, cancelledAt: null, createdAt: at, updatedAt: at,
  }] };
}
function request(toStatus: "approved" | "cancelled", reason: string | null = null, revision = 3) {
  return { expectedRevision: 0, mutationId: "11111111-1111-4111-8111-111111111111",
    command: { type: "transition-risk-response" as const, responseId: "response-1", toStatus,
      actualEffect: null, reason, expectedResponseRevision: revision } };
}
beforeEach(() => { mutateProject.mockReset(); mutateProject.mockImplementation(async (input) => input.mutate(project())); });
describe("risk response transition client/server protocol", () => {
  it("requires management permission for approval and records its new revision", async () => {
    const result = await service.executeCommand("owner", "risk-project", request("approved"));
    expect(mutateProject).toHaveBeenCalledWith(expect.objectContaining({ requiredCapability: "manage", expectedRevision: 0 }));
    expect(result.aggregate.riskResponses[0]).toMatchObject({ status: "approved", revision: 4 });
    expect(result.aggregate.auditEvents.at(-1)?.action).toBe("transition-risk-response");
  });
  it("passes the cancellation reason through strict parsing and the core transition", async () => {
    const result = await service.executeCommand("owner", "risk-project", request("cancelled", "  Schedule changed  "));
    expect(mutateProject).toHaveBeenCalledWith(expect.objectContaining({ requiredCapability: "edit" }));
    expect(result.aggregate.riskResponses[0]).toMatchObject({ status: "cancelled", revision: 4, cancellationReason: "Schedule changed" });
    expect(result.aggregate.riskResponses[0]?.cancelledAt).toBeTruthy();
  });
  it("rejects cancellation without a reason rather than reporting a saved action", async () => {
    await expect(service.executeCommand("owner", "risk-project", request("cancelled"))).rejects.toBeInstanceOf(BadRequestException);
  });
  it("rejects stale response revisions before changing state", async () => {
    await expect(service.executeCommand("owner", "risk-project", request("approved", null, 2))).rejects.toBeInstanceOf(ConflictException);
  });
  it("keeps the added request fields strict and bounded", () => {
    const valid = request("cancelled", "Reason");
    expect(ExecuteProductionCommandSchema.safeParse(valid).success).toBe(true);
    for (const value of [-1, 0.5, 2_147_483_648, "3"]) {
      expect(ExecuteProductionCommandSchema.safeParse({ ...valid, command: { ...valid.command, expectedResponseRevision: value } }).success).toBe(false);
    }
    expect(ExecuteProductionCommandSchema.safeParse({ ...valid, command: { ...valid.command, reason: "x".repeat(4001) } }).success).toBe(false);
    expect(ExecuteProductionCommandSchema.safeParse({ ...valid, command: { ...valid.command, ignorePermissions: true } }).success).toBe(false);
  });
});
