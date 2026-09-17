import { projectScope } from "./scope";

import type {
  CollaborationModel,
  ProductionAuditEvent,
  ProductionProjectAggregate,
} from "./types";

export function createProductionProjectAggregate(input: {
  readonly projectId: string;
  readonly workId: string;
  readonly organizationId?: string | null;
  readonly title: string;
  readonly collaborationModel: CollaborationModel;
  readonly ownerPartyId: string;
  readonly ownerUserId: string;
  readonly ownerDisplayName: string;
  readonly at: string;
}): ProductionProjectAggregate {
  if (!input.title.trim()) throw new Error("Production project title is required.");
  const scope = projectScope(input.projectId);
  return Object.freeze({
    modelVersion: 1,
    projectId: input.projectId,
    workId: input.workId,
    organizationId: input.organizationId ?? null,
    title: input.title.trim(),
    collaborationModel: input.collaborationModel,
    revision: 0,
    parties: Object.freeze([Object.freeze({
      id: input.ownerPartyId,
      accountUserId: input.ownerUserId,
      legalIdentityRef: null,
      publicDisplayName: input.ownerDisplayName,
      internalDisplayName: input.ownerDisplayName,
      contactPartyId: null,
      agencyPartyId: null,
      status: "active" as const,
    })]),
    assignments: Object.freeze([Object.freeze({
      id: `assignment:${input.ownerPartyId}:producer`,
      projectId: input.projectId,
      partyId: input.ownerPartyId,
      roleType: "producer" as const,
      scope,
      startsAt: input.at,
      endsAt: null,
      capabilities: Object.freeze(["manage-project", "manage-members", "manage-policies"]),
      agreementRevisionRef: null,
      publicCreditRole: null,
      status: "active" as const,
      lead: true,
    })]),
    authorityRules: Object.freeze([]),
    charters: Object.freeze([]),
    episodes: Object.freeze([]),
    handoffs: Object.freeze([]),
    clarifications: Object.freeze([]),
    branches: Object.freeze([]),
    mergeRequests: Object.freeze([]),
    reviewPolicies: Object.freeze([]),
    reviewDecisions: Object.freeze([]),
    tasks: Object.freeze([]),
    deliverables: Object.freeze([]),
    submissions: Object.freeze([]),
    studioRevisionLinks: Object.freeze([]),
    changeRequests: Object.freeze([]),
    scopePackages: Object.freeze([]),
    scopePackageRevisionArchive: Object.freeze([]),
    scopePackageAddenda: Object.freeze([]),
    contributions: Object.freeze([]),
    creditManifests: Object.freeze([]),
    rightsInterests: Object.freeze([]),
    compensationPlans: Object.freeze([]),
    projectBriefs: Object.freeze([]),
    seriesMasters: Object.freeze([]),
    seasonPlans: Object.freeze([]),
    episodePlans: Object.freeze([]),
    scenePlans: Object.freeze([]),
    cutPlans: Object.freeze([]),
    planningSnapshots: Object.freeze([]),
    assetRequirements: Object.freeze([]),
    risks: Object.freeze([]),
    decisions: Object.freeze([]),
    proposals: Object.freeze([]),
    agreements: Object.freeze([]),
    changeOrders: Object.freeze([]),
    contractMilestones: Object.freeze([]),
    deliveryRevisions: Object.freeze([]),
    invoices: Object.freeze([]),
    paymentRecords: Object.freeze([]),
    disputes: Object.freeze([]),
    resourceCalendars: Object.freeze([]),
    scheduleBaselines: Object.freeze([]),
    releasePlans: Object.freeze([]),
    externalReviewAccesses: Object.freeze([]),
    automationRules: Object.freeze([]),
    notificationPolicies: Object.freeze([]),
    notifications: Object.freeze([]),
    savedViews: Object.freeze([]),
    auditEvents: Object.freeze([]),
    createdAt: input.at,
    updatedAt: input.at,
  });
}

export function commitProductionAggregate(
  aggregate: ProductionProjectAggregate,
  input: {
    readonly expectedRevision: number;
    readonly actorPartyId: string | null;
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly reason?: string | null;
    readonly beforeDigest?: string | null;
    readonly afterDigest?: string | null;
    readonly at: string;
    readonly eventId: string;
    readonly mutate: (current: ProductionProjectAggregate) => ProductionProjectAggregate;
  },
): ProductionProjectAggregate {
  if (aggregate.revision !== input.expectedRevision) {
    throw new Error(`Production aggregate revision conflict: expected ${input.expectedRevision}, current ${aggregate.revision}.`);
  }
  const mutated = input.mutate(aggregate);
  if (mutated.projectId !== aggregate.projectId || mutated.workId !== aggregate.workId) {
    throw new Error("Production aggregate identity cannot change.");
  }
  const revision = aggregate.revision + 1;
  const event: ProductionAuditEvent = Object.freeze({
    id: input.eventId,
    projectId: aggregate.projectId,
    aggregateRevision: revision,
    actorPartyId: input.actorPartyId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    beforeDigest: input.beforeDigest ?? null,
    afterDigest: input.afterDigest ?? null,
    reason: input.reason ?? null,
    occurredAt: input.at,
  });
  return Object.freeze({
    ...mutated,
    modelVersion: 1,
    projectId: aggregate.projectId,
    workId: aggregate.workId,
    revision,
    auditEvents: Object.freeze([...mutated.auditEvents, event]),
    updatedAt: input.at,
  });
}
