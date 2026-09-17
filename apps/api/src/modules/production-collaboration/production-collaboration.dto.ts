import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  COLLABORATION_MODELS,
  DECISION_DOMAINS,
  PRODUCTION_ROLE_TYPES,
  PRODUCTION_SCOPE_KINDS,
  REVIEW_LANES,
} from "../../../../../packages/core/src/production";

const IdentitySchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u);
const HumanTextSchema = z.string().trim().min(1).max(4_000);
const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const NullableIsoDateTimeSchema = IsoDateTimeSchema.nullable();
const DigestSchema = z.string().regex(/^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$/u);
const MutationIdSchema = z.string().uuid();
const RevisionNumberSchema = z.number().int().min(0).max(2_147_483_647);

const ScopeAncestorSchema = z.object({
  kind: z.enum(PRODUCTION_SCOPE_KINDS).exclude(["deliverable"]),
  id: IdentitySchema,
}).strict();

export const ProductionScopeRefSchema = z.object({
  kind: z.enum(PRODUCTION_SCOPE_KINDS),
  id: IdentitySchema,
  ancestors: z.array(ScopeAncestorSchema).max(8),
}).strict();

export const ProductionRevisionRefSchema = z.object({
  id: IdentitySchema,
  lineage: z.enum(["narrative", "visual", "integrated"]),
  revision: z.number().int().min(1).max(2_147_483_647),
  digest: DigestSchema,
  createdAt: IsoDateTimeSchema,
}).strict();

const CollaborationPartySchema = z.object({
  id: IdentitySchema,
  accountUserId: IdentitySchema.nullable(),
  legalIdentityRef: IdentitySchema.nullable(),
  publicDisplayName: z.string().trim().min(1).max(120),
  internalDisplayName: z.string().trim().min(1).max(120),
  contactPartyId: IdentitySchema.nullable(),
  agencyPartyId: IdentitySchema.nullable(),
  status: z.enum(["invited", "active", "paused", "ended"]),
}).strict();

const RoleAssignmentSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  partyId: IdentitySchema,
  roleType: z.enum(PRODUCTION_ROLE_TYPES),
  scope: ProductionScopeRefSchema,
  startsAt: IsoDateTimeSchema,
  endsAt: NullableIsoDateTimeSchema,
  capabilities: z.array(z.string().trim().min(1).max(120)).max(100),
  agreementRevisionRef: IdentitySchema.nullable(),
  publicCreditRole: z.string().trim().max(120).nullable(),
  status: z.enum(["invited", "onboarding", "active", "paused", "ending", "ended"]),
  lead: z.boolean(),
}).strict();

const AuthorityRuleSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  domain: z.enum(DECISION_DOMAINS),
  scope: ProductionScopeRefSchema,
  proposerAssignmentIds: z.array(IdentitySchema).max(100),
  requiredConsultAssignmentIds: z.array(IdentitySchema).max(100),
  requiredApproverAssignmentIds: z.array(IdentitySchema).max(100),
  decisionAssignmentId: IdentitySchema.nullable(),
  vetoAssignmentIds: z.array(IdentitySchema).max(100),
  mediatorAssignmentId: IdentitySchema.nullable(),
  quorum: z.object({ approvals: z.number().int().min(1).max(100), eligible: z.number().int().min(1).max(100) }).strict().nullable(),
  effectiveFrom: IsoDateTimeSchema,
  expiresAt: NullableIsoDateTimeSchema,
  agreementRevisionRef: IdentitySchema.nullable(),
}).strict();

const CreativeCharterSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  status: z.enum(["draft", "party-review", "agreed", "active", "amendment-proposed", "superseded", "archived"]),
  coreExperience: z.string().trim().max(4_000),
  immutablePrinciples: z.array(HumanTextSchema).max(100),
  experimentalAreas: z.array(HumanTextSchema).max(100),
  storyAutonomy: z.array(HumanTextSchema).max(100),
  artAutonomy: z.array(HumanTextSchema).max(100),
  jointDecisionAreas: z.array(HumanTextSchema).max(100),
  feedbackPrinciples: z.array(HumanTextSchema).max(100),
  communicationRules: z.array(HumanTextSchema).max(100),
  confirmedByAssignmentIds: z.array(IdentitySchema).max(100),
  agreementRevisionRef: IdentitySchema.nullable(),
  createdAt: IsoDateTimeSchema,
}).strict();

const EpisodeCollaborationSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  episodeId: IdentitySchema,
  revision: RevisionNumberSchema,
  state: z.enum([
    "episode-planning", "story-drafting", "story-review", "story-ready-for-art",
    "art-clarification", "thumbnailing", "thumbnail-joint-review", "thumbnail-locked",
    "final-art-production", "lettering-and-integration", "joint-proof", "publish-ready",
    "published", "blocked", "paused-health", "paused-contract", "change-request-open",
    "creator-replacement", "cancelled",
  ]),
  narrativeRevisionRef: ProductionRevisionRefSchema.nullable(),
  visualRevisionRef: ProductionRevisionRefSchema.nullable(),
  integratedRevisionRef: ProductionRevisionRefSchema.nullable(),
  activeHandoffId: IdentitySchema.nullable(),
  openBlockerCount: z.number().int().min(0).max(100_000),
  storyLockApproved: z.boolean(),
  thumbnailLockApproved: z.boolean(),
  jointProofApproved: z.boolean(),
  creditPreflightPassed: z.boolean(),
  publicationPreflightPassed: z.boolean(),
  updatedAt: IsoDateTimeSchema,
}).strict();

const CreativeInstructionSchema = z.object({
  id: IdentitySchema,
  scope: ProductionScopeRefSchema,
  priority: z.enum(["MUST_PRESERVE", "INTENT", "SUGGESTION", "ARTIST_CHOICE", "REFERENCE_ONLY", "DO_NOT_USE"]),
  latitude: z.enum(["exact", "bounded", "open", "exploratory"]),
  text: HumanTextSchema,
  rationale: z.string().trim().max(4_000),
  sourceRevisionRef: IdentitySchema,
}).strict();

const HandoffRiskAcceptanceSchema = z.object({
  id: IdentitySchema,
  code: z.string().trim().min(1).max(120),
  reason: HumanTextSchema,
  acceptedByAssignmentId: IdentitySchema,
  acceptedAt: IsoDateTimeSchema,
  expiresAt: NullableIsoDateTimeSchema,
}).strict();

const StoryToArtHandoffPackageSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  episodeId: IdentitySchema,
  handoffRevision: z.number().int().min(1).max(2_147_483_647),
  status: z.enum(["draft", "internal-story-review", "ready-to-offer", "offered-to-art", "clarification-open", "accepted-by-art", "production-started", "superseded", "cancelled"]),
  storySnapshotRef: ProductionRevisionRefSchema.nullable(),
  storyLockRef: ProductionRevisionRefSchema.nullable(),
  storyBibleRevisionRef: IdentitySchema.nullable(),
  characterBibleRevisionRefs: z.array(IdentitySchema).max(1_000),
  episodeIntentRef: IdentitySchema.nullable(),
  beatRefs: z.array(IdentitySchema).max(10_000),
  sceneRefs: z.array(IdentitySchema).max(10_000),
  lockedDialogueRefs: z.array(IdentitySchema).max(100_000),
  continuityReferenceRefs: z.array(IdentitySchema).max(10_000),
  visualRequirementRefs: z.array(IdentitySchema).max(10_000),
  forbiddenInterpretationRefs: z.array(IdentitySchema).max(10_000),
  assetRequirementRefs: z.array(IdentitySchema).max(100_000),
  locationReferenceRefs: z.array(IdentitySchema).max(10_000),
  costumeReferenceRefs: z.array(IdentitySchema).max(10_000),
  instructions: z.array(CreativeInstructionSchema).max(100_000),
  platformProfileRef: IdentitySchema.nullable(),
  technicalDeliveryRuleRef: IdentitySchema.nullable(),
  rightsAndAiPolicyRef: IdentitySchema.nullable(),
  creditPolicyRef: IdentitySchema.nullable(),
  expectedDeliverables: z.array(z.string().trim().min(1).max(240)).max(10_000),
  reviewPolicyRef: IdentitySchema.nullable(),
  decisionOwnerAssignmentIds: z.array(IdentitySchema).max(100),
  dueAt: NullableIsoDateTimeSchema,
  openRiskAcceptances: z.array(HandoffRiskAcceptanceSchema).max(1_000),
  createdByAssignmentId: IdentitySchema,
  acceptedByAssignmentId: IdentitySchema.nullable(),
  acceptedAt: NullableIsoDateTimeSchema,
  digest: DigestSchema,
  createdAt: IsoDateTimeSchema,
}).strict();

const ClarificationThreadSchema = z.object({
  id: IdentitySchema,
  handoffId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  category: z.enum(["narrative-ambiguity", "visual-reference", "continuity", "technical", "schedule", "rights", "credit"]),
  blocking: z.boolean(),
  question: HumanTextSchema,
  askedByAssignmentId: IdentitySchema,
  answerOwnerAssignmentId: IdentitySchema,
  dueAt: NullableIsoDateTimeSchema,
  status: z.enum(["open", "answered", "decision-recorded", "accepted-risk", "closed"]),
  answer: z.string().trim().max(4_000).nullable(),
  decisionRecordId: IdentitySchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
}).strict();

const ReviewPolicyLaneSchema = z.object({
  lane: z.enum(REVIEW_LANES),
  eligibleAssignmentIds: z.array(IdentitySchema).max(100),
  requiredAssignmentIds: z.array(IdentitySchema).max(100),
  quorum: z.number().int().min(1).max(100),
  vetoAssignmentIds: z.array(IdentitySchema).max(100),
  blocksPublication: z.boolean(),
}).strict();

const ReviewPolicySchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  lanes: z.array(ReviewPolicyLaneSchema).min(1).max(20),
  responseDueHours: z.number().int().min(1).max(8_760),
  expiredReviewAction: z.enum(["escalate", "replace-reviewer", "reschedule"]),
}).strict();

const ReviewDecisionSchema = z.object({
  id: IdentitySchema,
  reviewRoundId: IdentitySchema,
  lane: z.enum(REVIEW_LANES),
  assignmentId: IdentitySchema,
  value: z.enum(["approve", "approve-with-conditions", "request-changes", "veto", "abstain"]),
  reasonCode: z.string().trim().min(1).max(120).nullable(),
  evidenceScopeRefs: z.array(ProductionScopeRefSchema).max(1_000),
  conditions: z.array(HumanTextSchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

const CreativeBranchSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  episodeId: IdentitySchema,
  type: z.enum(["story-draft", "story-amendment", "visual-exploration", "thumbnail", "art-process", "integration", "hotfix"]),
  lineage: z.enum(["narrative", "visual", "integrated"]),
  baseRevisionRef: ProductionRevisionRefSchema,
  headRevisionRef: ProductionRevisionRefSchema,
  ownerAssignmentId: IdentitySchema,
  purpose: HumanTextSchema,
  mergeTarget: z.enum(["narrative", "visual", "integrated"]),
  visibility: z.enum(["private", "team", "reviewers"]),
  allowedScopes: z.array(ProductionScopeRefSchema).min(1).max(100_000),
  expiresAt: NullableIsoDateTimeSchema,
  status: z.enum(["active", "review", "merged", "closed", "expired"]),
}).strict();

const CreativeMergeRequestSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  episodeId: IdentitySchema,
  sourceBranchId: IdentitySchema,
  targetLineage: z.enum(["narrative", "visual", "integrated"]),
  baseRevisionRef: ProductionRevisionRefSchema,
  proposedRevisionRef: ProductionRevisionRefSchema,
  mergedRevisionRef: ProductionRevisionRefSchema.nullable(),
  summary: HumanTextSchema,
  changedScopes: z.array(ProductionScopeRefSchema).min(1).max(100_000),
  affectedDecisionIds: z.array(IdentitySchema).max(10_000),
  affectedApprovalIds: z.array(IdentitySchema).max(10_000),
  requiredReviewLanes: z.array(z.enum(REVIEW_LANES)).min(1).max(20),
  mergePolicyId: IdentitySchema,
  status: z.enum(["draft", "ready-for-review", "changes-requested", "approved", "conflicted", "merged", "closed"]),
  createdByAssignmentId: IdentitySchema,
  createdAt: IsoDateTimeSchema,
}).strict();

const DeliverableSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  type: z.string().trim().min(1).max(120),
  expectedFormat: z.string().trim().min(1).max(240),
  completionCriteria: z.array(HumanTextSchema).min(1).max(1_000),
  currentSubmissionId: IdentitySchema.nullable(),
  approvedSubmissionId: IdentitySchema.nullable(),
}).strict();

const SubmissionSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  deliverableId: IdentitySchema,
  revisionRef: ProductionRevisionRefSchema,
  submittedByAssignmentId: IdentitySchema,
  submittedAt: IsoDateTimeSchema,
  status: z.enum(["submitted", "in-review", "changes-requested", "approved", "superseded"]),
  inputRevisionRefs: z.array(ProductionRevisionRefSchema).min(1).max(100_000),
  evidenceRefs: z.array(IdentitySchema).max(100_000),
}).strict();

const EstimateHoursSchema = z.object({
  optimistic: z.number().min(0).max(100_000),
  likely: z.number().min(0).max(100_000),
  pessimistic: z.number().min(0).max(100_000),
}).strict().refine((value) => value.optimistic <= value.likely && value.likely <= value.pessimistic, {
  message: "estimate hours must be ordered optimistic <= likely <= pessimistic",
});

const ProductionTaskSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  processKey: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(240),
  status: z.enum(["draft", "needs-input", "ready", "in-progress", "internal-review", "external-review", "changes-requested", "conditionally-approved", "approved", "done", "blocked", "paused", "cancelled", "out-of-scope"]),
  assignmentIds: z.array(IdentitySchema).max(100),
  reviewerAssignmentIds: z.array(IdentitySchema).max(100),
  inputRevisionRefs: z.array(ProductionRevisionRefSchema).max(10_000),
  outputDeliverableIds: z.array(IdentitySchema).max(10_000),
  dependencyTaskIds: z.array(IdentitySchema).max(10_000),
  plannedStartAt: NullableIsoDateTimeSchema.optional(),
  baselineDueAt: NullableIsoDateTimeSchema.optional(),
  dueAt: NullableIsoDateTimeSchema,
  statusChangedAt: IsoDateTimeSchema.optional(),
  startedAt: NullableIsoDateTimeSchema.optional(),
  completedAt: NullableIsoDateTimeSchema.optional(),
  progressPercent: z.number().min(0).max(100).nullable().optional(),
  remainingEstimateHours: z.number().min(0).max(100_000).nullable().optional(),
  linkedRiskIds: z.array(IdentitySchema).max(10_000).optional(),
  estimateHours: EstimateHoursSchema.nullable(),
  completionCriteria: z.array(HumanTextSchema).max(1_000),
  sourceAgreementMilestoneId: IdentitySchema.nullable(),
}).strict();

const ResourceCalendarExceptionSchema = z.object({
  id: IdentitySchema,
  type: z.enum(["time-off", "holiday", "overtime", "capacity-override"]),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  availableHours: z.number().min(0).max(10_000),
  reason: z.string().trim().max(1_000),
}).strict();

const ResourceCalendarSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  assignmentId: IdentitySchema,
  timezone: z.string().trim().min(1).max(120),
  weeklyHours: z.number().positive().max(168),
  dailyHours: z.number().positive().max(24),
  workingWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  exceptions: z.array(ResourceCalendarExceptionSchema).max(10_000),
  revision: z.number().int().min(1).max(2_147_483_647),
  updatedAt: IsoDateTimeSchema,
}).strict();

const ScheduleBaselineItemSchema = z.object({
  taskId: IdentitySchema,
  dueAt: NullableIsoDateTimeSchema,
  assignmentIds: z.array(IdentitySchema).max(100),
  estimateLikelyHours: z.number().min(0).max(100_000).nullable(),
}).strict();
const ScheduleBaselineSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  name: z.string().trim().min(1).max(240),
  createdByAssignmentId: IdentitySchema,
  releaseAt: NullableIsoDateTimeSchema,
  items: z.array(ScheduleBaselineItemSchema).max(100_000),
  active: z.boolean(),
  createdAt: IsoDateTimeSchema,
}).strict();

const EpisodeReleasePlanSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  episodeId: IdentitySchema,
  platformKey: z.string().trim().min(1).max(120),
  locale: z.string().trim().min(2).max(35),
  timezone: z.string().trim().min(1).max(120),
  scheduledAt: NullableIsoDateTimeSchema,
  status: z.enum(["draft", "preflight", "ready", "scheduled", "published", "failed", "withdrawn"]),
  title: z.string().trim().max(240),
  description: z.string().trim().max(4_000),
  thumbnailRevisionRef: IdentitySchema.nullable(),
  sourceSubmissionIds: z.array(IdentitySchema).max(10_000),
  requiredCheckKeys: z.array(z.string().trim().min(1).max(120)).max(1_000),
  passedCheckKeys: z.array(z.string().trim().min(1).max(120)).max(1_000),
  blockers: z.array(HumanTextSchema).max(1_000),
  warnings: z.array(HumanTextSchema).max(1_000),
  externalReleaseId: z.string().trim().max(240).nullable(),
  externalUrl: z.url().max(2_000).nullable(),
  revision: z.number().int().min(1).max(2_147_483_647),
  updatedAt: IsoDateTimeSchema,
}).strict();

const ExternalReviewResponseSchema = z.object({
  id: IdentitySchema,
  reviewerName: z.string().trim().min(1).max(120),
  decision: z.enum(["comment", "approve", "request-changes"]),
  note: z.string().trim().max(4_000),
  createdAt: IsoDateTimeSchema,
}).strict();

const ExternalReviewAccessSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  label: z.string().trim().min(1).max(240),
  tokenDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  submissionIds: z.array(IdentitySchema).min(1).max(10_000),
  permissions: z.array(z.enum(["view", "comment", "approve", "download"])).min(1).max(4),
  watermark: z.boolean(),
  expiresAt: IsoDateTimeSchema,
  status: z.enum(["active", "revoked", "expired"]),
  createdByAssignmentId: IdentitySchema,
  createdAt: IsoDateTimeSchema,
  lastAccessedAt: NullableIsoDateTimeSchema,
  responses: z.array(ExternalReviewResponseSchema).max(100_000),
}).strict();
const ProductionAutomationConditionSchema = z.object({
  field: z.enum([
    "task-status",
    "process-key",
    "days-to-due",
    "episode-state",
    "load-percent",
    "release-status",
  ]),
  operator: z.enum(["equals", "not-equals", "contains", "gte", "lte"]),
  value: z.union([z.string().trim().max(240), z.number()]),
}).strict();

const ProductionAutomationActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("notify"),
    assignmentIds: z.array(IdentitySchema).max(100),
    urgency: z.enum(["info", "warning", "critical"]),
    message: HumanTextSchema,
  }).strict(),
  z.object({
    type: z.literal("create-task"),
    title: z.string().trim().min(1).max(240),
    processKey: z.string().trim().min(1).max(120),
    assignmentIds: z.array(IdentitySchema).max(100),
    dueInHours: z.number().int().min(1).max(8_760),
  }).strict(),
  z.object({
    type: z.literal("request-status-transition"),
    taskStatus: z.enum(["draft", "needs-input", "ready", "in-progress", "internal-review", "external-review", "changes-requested", "conditionally-approved", "approved", "done", "blocked", "paused", "cancelled", "out-of-scope"]),
  }).strict(),
]);
const ProductionAutomationRuleSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  name: z.string().trim().min(1).max(240),
  trigger: z.enum([
    "task-status-changed",
    "due-soon",
    "due-passed",
    "capacity-exceeded",
    "release-preflight-failed",
    "review-opened",
    "manual",
  ]),
  conditions: z.array(ProductionAutomationConditionSchema).max(100),
  actions: z.array(ProductionAutomationActionSchema).min(1).max(100),
  failurePolicy: z.enum(["continue", "stop", "require-review"]),
  enabled: z.boolean(),
  revision: z.number().int().min(1).max(2_147_483_647),
  lastEvaluatedAt: NullableIsoDateTimeSchema,
  createdByAssignmentId: IdentitySchema,
  updatedAt: IsoDateTimeSchema,
}).strict();

const ProductionNotificationPolicySchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  assignmentId: IdentitySchema,
  channels: z.array(z.enum(["in-app", "email", "push", "webhook"])).min(1).max(4),
  digest: z.enum(["immediate", "daily", "weekly"]),
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u).nullable(),
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u).nullable(),
  dueSoonHours: z.number().int().min(1).max(8_760),
  escalationHours: z.number().int().min(1).max(8_760),
  enabled: z.boolean(),
  updatedAt: IsoDateTimeSchema,
}).strict();

const ProductionNotificationSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  assignmentId: IdentitySchema.nullable(),
  type: z.enum(["assignment", "mention", "review", "due-soon", "overdue", "blocker", "release", "automation"]),
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().max(4_000),
  href: z.string().trim().min(1).max(2_000),
  urgency: z.enum(["info", "warning", "critical"]),
  sourceType: z.string().trim().min(1).max(120),
  sourceId: IdentitySchema,
  status: z.enum(["unread", "read", "dismissed"]),
  createdAt: IsoDateTimeSchema,
  readAt: NullableIsoDateTimeSchema,
}).strict();

const ProductionSavedViewSortSchema = z.object({
  field: z.string().trim().min(1).max(120),
  direction: z.enum(["asc", "desc"]),
}).strict();
const ProductionSavedViewSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  ownerAssignmentId: IdentitySchema.nullable(),
  name: z.string().trim().min(1).max(240),
  resource: z.enum(["tasks", "episodes", "reviews", "schedule", "portfolio"]),
  filters: z.record(z.string().trim().min(1).max(120), z.string().trim().max(1_000)),
  sort: z.array(ProductionSavedViewSortSchema).max(100),
  columns: z.array(z.string().trim().min(1).max(120)).max(100),
  density: z.enum(["comfortable", "compact"]),
  shared: z.boolean(),
  dashboardWidgets: z.array(z.string().trim().min(1).max(120)).max(100),
  updatedAt: IsoDateTimeSchema,
}).strict();

const ProductionOperationsRecordSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("resource-calendar"), value: ResourceCalendarSchema }).strict(),
  z.object({ kind: z.literal("schedule-baseline"), value: ScheduleBaselineSchema }).strict(),
  z.object({ kind: z.literal("release-plan"), value: EpisodeReleasePlanSchema }).strict(),
  z.object({ kind: z.literal("external-review-access"), value: ExternalReviewAccessSchema }).strict(),
  z.object({ kind: z.literal("automation-rule"), value: ProductionAutomationRuleSchema }).strict(),
  z.object({ kind: z.literal("notification-policy"), value: ProductionNotificationPolicySchema }).strict(),
  z.object({ kind: z.literal("notification"), value: ProductionNotificationSchema }).strict(),
  z.object({ kind: z.literal("saved-view"), value: ProductionSavedViewSchema }).strict(),
]);

const ChangeRequestSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  episodeId: IdentitySchema.nullable(),
  stage: z.enum(["pre-lock", "post-story-lock", "post-thumbnail-lock", "in-final-art", "post-joint-proof", "post-publish"]),
  sourceRevisionRef: ProductionRevisionRefSchema,
  proposedRevisionRef: ProductionRevisionRefSchema,
  changedScopes: z.array(ProductionScopeRefSchema).min(1).max(100_000),
  reason: HumanTextSchema,
  requestedByAssignmentId: IdentitySchema,
  status: z.enum(["draft", "impact-analysis", "awaiting-approval", "approved", "rejected", "implementing", "verification", "completed", "cancelled"]),
  createdAt: IsoDateTimeSchema,
}).strict();

const ScopePackageBaseSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  status: z.enum(["draft", "published", "superseded", "cancelled"]),
  scopes: z.array(ProductionScopeRefSchema).min(1).max(100_000),
  inputRevisionRefs: z.array(ProductionRevisionRefSchema).max(100_000),
  deliverableSpecifications: z.array(HumanTextSchema).min(1).max(10_000),
  acceptanceCriteria: z.array(HumanTextSchema).min(1).max(10_000),
  includedRevisionRounds: z.number().int().min(0).max(100),
  schedule: z.object({
    proposalDueAt: NullableIsoDateTimeSchema,
    startsAt: NullableIsoDateTimeSchema,
    deliveryDueAt: NullableIsoDateTimeSchema,
    reviewResponseHours: z.number().int().min(1).max(8_760),
  }).strict(),
  rightsPolicyRef: IdentitySchema,
  aiPolicyRef: IdentitySchema,
  creditPolicyRef: IdentitySchema,
  compensationTermsRef: IdentitySchema,
  informationDisclosureLevel: z.enum(["internal", "nda", "vendor", "public"]),
  createdAt: IsoDateTimeSchema,
}).strict();

const ContributionRecordSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  partyId: IdentitySchema,
  assignmentId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  revisionRef: ProductionRevisionRefSchema,
  contributionType: z.string().trim().min(1).max(120),
  approvedAt: NullableIsoDateTimeSchema,
  approvalId: IdentitySchema.nullable(),
}).strict();

const CreditEntrySchema = z.object({
  id: IdentitySchema,
  partyId: IdentitySchema,
  publicName: z.string().trim().min(1).max(120),
  roleLabel: z.string().trim().min(1).max(120),
  scopes: z.array(ProductionScopeRefSchema).min(1).max(100_000),
  order: z.number().int().min(0).max(100_000),
  media: z.array(z.enum(["episode", "series", "export", "marketing", "metadata"])).min(1).max(5),
  anonymous: z.boolean(),
}).strict();

const CreditManifestSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  episodeId: IdentitySchema.nullable(),
  revision: z.number().int().min(1).max(2_147_483_647),
  status: z.enum(["draft", "review", "approved", "superseded"]),
  contentRevisionRefs: z.array(ProductionRevisionRefSchema).min(1).max(100_000),
  entries: z.array(CreditEntrySchema).max(10_000),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  agreementRevisionRefs: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

const RightsInterestSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  partyId: IdentitySchema,
  type: z.enum(["authorship-claim", "copyright-share", "publication-license", "adaptation-license", "secondary-use-consent", "portfolio-license", "ai-processing-consent", "ai-training-consent"]),
  scope: ProductionScopeRefSchema,
  status: z.enum(["asserted", "under-review", "verified", "disputed", "expired"]),
  agreementRevisionRef: IdentitySchema.nullable(),
  evidenceRefs: z.array(IdentitySchema).max(10_000),
  startsAt: NullableIsoDateTimeSchema,
  endsAt: NullableIsoDateTimeSchema,
}).strict();

const RevenueShareRuleSchema = z.object({
  id: IdentitySchema,
  revenueSource: z.enum(["domestic-serialization", "foreign-serialization", "print", "video", "game", "merchandise", "advertising", "other"]),
  basis: z.enum(["gross", "net"]),
  deductions: z.array(HumanTextSchema).max(100),
  partySharesBasisPoints: z.record(IdentitySchema, z.number().int().min(0).max(10_000)),
  recoupmentRef: IdentitySchema.nullable(),
}).strict();

const CompensationPlanSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  status: z.enum(["draft", "agreed", "active", "superseded", "ended"]),
  fixedFeeTerms: z.array(HumanTextSchema).max(1_000),
  revenueShareRules: z.array(RevenueShareRuleSchema).max(100),
  statementFrequency: z.enum(["monthly", "quarterly", "semiannual", "annual"]),
  auditRight: z.boolean(),
  agreementRevisionRef: IdentitySchema.nullable(),
  createdAt: IsoDateTimeSchema,
}).strict();

const PlanningDocumentStatusSchema = z.enum(["draft", "review", "approved", "locked", "superseded", "archived"]);

const ProjectBriefSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  status: PlanningDocumentStatusSchema,
  title: z.string().trim().min(1).max(240),
  logline: z.string().trim().max(4_000),
  synopsis: z.string().trim().max(20_000),
  themes: z.array(HumanTextSchema).max(100),
  genreKeys: z.array(z.string().trim().min(1).max(120)).max(100),
  audience: z.array(z.string().trim().min(1).max(240)).max(100),
  platformProfileRefs: z.array(IdentitySchema).max(100),
  businessGoals: z.array(HumanTextSchema).max(100),
  constraints: z.array(HumanTextSchema).max(1_000),
  rightsBaselineRef: IdentitySchema.nullable(),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

const SeriesMasterSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  status: PlanningDocumentStatusSchema,
  premise: z.string().trim().max(20_000),
  genreRules: z.array(HumanTextSchema).max(1_000),
  characterBibleRevisionRefs: z.array(IdentitySchema).max(10_000),
  locationBibleRevisionRefs: z.array(IdentitySchema).max(10_000),
  worldRules: z.array(HumanTextSchema).max(10_000),
  terminology: z.record(z.string().trim().min(1).max(240), z.string().trim().max(4_000)),
  styleRules: z.array(HumanTextSchema).max(10_000),
  forbiddenElements: z.array(HumanTextSchema).max(10_000),
  sourceEvidenceRefs: z.array(IdentitySchema).max(10_000),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

const SeasonPlanSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  seasonId: IdentitySchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  status: PlanningDocumentStatusSchema,
  title: z.string().trim().min(1).max(240),
  goal: z.string().trim().max(20_000),
  plotArc: z.array(HumanTextSchema).max(10_000),
  characterArcRefs: z.array(IdentitySchema).max(10_000),
  episodeOrder: z.array(IdentitySchema).max(10_000),
  targetEpisodeCount: z.number().int().min(1).max(100_000),
  releaseStartsAt: NullableIsoDateTimeSchema,
  releaseCadenceDays: z.number().int().min(1).max(3650).nullable(),
  budgetCapMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/u).nullable(),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

const EpisodePlanSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  seasonId: IdentitySchema.nullable(),
  episodeId: IdentitySchema,
  episodeNumber: z.number().int().min(0).max(1_000_000),
  revision: z.number().int().min(1).max(2_147_483_647),
  status: PlanningDocumentStatusSchema,
  title: z.string().trim().min(1).max(240),
  logline: z.string().trim().max(4_000),
  openingHook: z.string().trim().max(4_000),
  coreConflict: z.string().trim().max(4_000),
  turningPoints: z.array(HumanTextSchema).max(1_000),
  cliffhanger: z.string().trim().max(4_000),
  characterRefs: z.array(IdentitySchema).max(10_000),
  locationRefs: z.array(IdentitySchema).max(10_000),
  targetCutCount: z.number().int().min(1).max(100_000),
  targetScrollHeightPx: z.number().int().min(1).max(100_000_000),
  dialogueDensity: z.enum(["low", "medium", "high"]),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  riskIds: z.array(IdentitySchema).max(10_000),
  narrativeRevisionRef: ProductionRevisionRefSchema.nullable(),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

const ScenePlanSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  episodeId: IdentitySchema,
  sceneId: IdentitySchema,
  order: z.number().int().min(0).max(1_000_000),
  revision: z.number().int().min(1).max(2_147_483_647),
  status: PlanningDocumentStatusSchema,
  purpose: HumanTextSchema,
  locationRef: IdentitySchema.nullable(),
  timeLabel: z.string().trim().max(240),
  characterRefs: z.array(IdentitySchema).max(10_000),
  emotionalBeat: z.string().trim().max(4_000),
  continuityRefs: z.array(IdentitySchema).max(10_000),
  instructionRefs: z.array(IdentitySchema).max(10_000),
  estimatedMinutes: z.number().min(0).max(1_000_000),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

const CutPlanSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  episodeId: IdentitySchema,
  sceneId: IdentitySchema,
  cutId: IdentitySchema,
  order: z.number().int().min(0).max(1_000_000),
  revision: z.number().int().min(1).max(2_147_483_647),
  status: PlanningDocumentStatusSchema,
  framing: z.string().trim().max(240),
  camera: z.string().trim().max(240),
  characterRefs: z.array(IdentitySchema).max(10_000),
  dialogueRefs: z.array(IdentitySchema).max(100_000),
  assetRequirementIds: z.array(IdentitySchema).max(100_000),
  layerRequirements: z.array(HumanTextSchema).max(10_000),
  estimatedHours: z.number().min(0).max(1_000_000),
  complexity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

const PlanningSnapshotInputSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  type: z.enum(["brief-approval", "series-master-lock", "season-baseline", "story-lock", "thumbnail-lock", "joint-proof", "publication"]),
  sourceRevisionRefs: z.array(ProductionRevisionRefSchema).min(1).max(100_000),
  documentRefs: z.array(IdentitySchema).max(100_000),
  approvedByAssignmentIds: z.array(IdentitySchema).min(1).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

const AssetRequirementSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  category: z.enum(["character", "costume", "location", "prop", "3d", "brush", "font", "audio", "reference", "other"]),
  title: z.string().trim().min(1).max(240),
  specification: z.string().trim().max(20_000),
  sourcePlanRefs: z.array(IdentitySchema).max(100_000),
  sourcing: z.enum(["internal", "external", "marketplace", "existing"]),
  rightsRequirements: z.array(HumanTextSchema).max(1_000),
  requiredByAt: NullableIsoDateTimeSchema,
  status: z.enum(["identified", "sourcing", "ready", "blocked", "cancelled"]),
}).strict();

const ProductionRiskCategorySchema = z.enum([
  "story", "visual", "schedule", "capacity", "review", "asset", "budget",
  "rights", "contract", "platform", "health", "security", "communication", "technical",
]);
const ProductionRiskSeveritySchema = z.enum(["watch", "warning", "high", "critical"]);
const ProductionRiskResponseStatusSchema = z.enum(["proposed", "approved", "in-progress", "completed", "cancelled"]);
const ProductionRiskStatusSchema = z.enum([
  "open", "monitoring", "mitigating", "occurred", "accepted", "resolved", "dismissed", "closed",
]);

const ProductionRiskSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  scope: ProductionScopeRefSchema,
  category: ProductionRiskCategorySchema,
  source: z.enum(["manual", "automatic"]),
  signalIds: z.array(IdentitySchema).max(10_000),
  title: z.string().trim().min(1).max(240),
  description: HumanTextSchema,
  probability: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  impact: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  exposureScore: z.number().int().min(1).max(25),
  severity: ProductionRiskSeveritySchema,
  priorityScore: z.number().min(0).max(100),
  ownerAssignmentId: IdentitySchema.nullable(),
  causeCodes: z.array(z.string().trim().min(1).max(160)).max(1_000),
  earlySignals: z.array(HumanTextSchema).max(1_000),
  mitigation: z.string().trim().max(20_000),
  contingency: z.string().trim().max(20_000),
  trigger: z.string().trim().max(4_000),
  affectedTaskIds: z.array(IdentitySchema).max(100_000),
  affectedEpisodeIds: z.array(IdentitySchema).max(10_000),
  affectedMilestoneIds: z.array(IdentitySchema).max(10_000),
  baselineDueAt: NullableIsoDateTimeSchema,
  forecastDueAt: NullableIsoDateTimeSchema,
  varianceHours: z.number().min(0).max(1_000_000).nullable(),
  status: ProductionRiskStatusSchema,
  dueAt: NullableIsoDateTimeSchema,
  responseDueAt: NullableIsoDateTimeSchema,
  nextReviewAt: NullableIsoDateTimeSchema,
  acceptedReason: z.string().trim().max(4_000).nullable(),
  dismissedReason: z.string().trim().max(4_000).nullable(),
  resolutionSummary: z.string().trim().max(20_000).nullable(),
  detectedAt: IsoDateTimeSchema,
  lastEvaluatedAt: IsoDateTimeSchema,
  occurredAt: NullableIsoDateTimeSchema,
  resolvedAt: NullableIsoDateTimeSchema,
  closedAt: NullableIsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
}).strict();

const ProductionRiskPolicySchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  timezone: z.string().trim().min(1).max(120),
  workdayEndLocal: z.string().regex(/^\d{2}:\d{2}$/u),
  dueSoonHours: z.number().int().min(1).max(8_760),
  blockedWarningHours: z.number().int().min(1).max(8_760),
  blockedCriticalHours: z.number().int().min(1).max(8_760),
  capacityWarningPercent: z.number().min(1).max(500),
  capacityCriticalPercent: z.number().min(1).max(500),
  defaultReviewSlaHours: z.number().int().min(1).max(8_760),
  minimumReadyBufferEpisodes: z.number().int().min(0).max(100),
  autoOpenSeverity: z.enum(["warning", "high", "critical"]),
  notificationCooldownHours: z.number().int().min(1).max(8_760),
  autoResolveStableHours: z.number().int().min(1).max(8_760),
  revision: z.number().int().min(1).max(2_147_483_647),
  updatedAt: IsoDateTimeSchema,
}).strict().refine((value) => value.blockedWarningHours <= value.blockedCriticalHours, {
  message: "blocked warning threshold must not exceed critical threshold",
});

const ProductionRiskResponseSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  riskId: IdentitySchema,
  strategy: z.enum(["avoid", "mitigate", "transfer", "accept", "escalate"]),
  actionType: z.enum([
    "assign", "split-task", "reschedule", "resolve-dependency", "parallel-review",
    "outsource", "reduce-scope", "reuse-asset", "create-change-request", "manual",
  ]),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(20_000),
  ownerAssignmentId: IdentitySchema.nullable(),
  dueAt: NullableIsoDateTimeSchema,
  linkedTaskId: IdentitySchema.nullable(),
  linkedChangeRequestId: IdentitySchema.nullable(),
  linkedChangeOrderId: IdentitySchema.nullable(),
  expectedEffect: z.string().trim().max(4_000),
  actualEffect: z.string().trim().min(1).max(4_000).nullable(),
  status: ProductionRiskResponseStatusSchema,
  createdAt: IsoDateTimeSchema,
  completedAt: NullableIsoDateTimeSchema,
}).strict();

const DecisionRecordSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  domain: z.enum(DECISION_DOMAINS),
  question: HumanTextSchema,
  decision: HumanTextSchema,
  rationale: HumanTextSchema,
  alternatives: z.array(HumanTextSchema).max(1_000),
  evidenceRefs: z.array(IdentitySchema).max(100_000),
  decidedByAssignmentId: IdentitySchema,
  consultedAssignmentIds: z.array(IdentitySchema).max(100),
  supersedesDecisionId: IdentitySchema.nullable(),
  createdAt: IsoDateTimeSchema,
}).strict();

const PlanningRecordSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project-brief"), value: ProjectBriefSchema }).strict(),
  z.object({ kind: z.literal("series-master"), value: SeriesMasterSchema }).strict(),
  z.object({ kind: z.literal("season-plan"), value: SeasonPlanSchema }).strict(),
  z.object({ kind: z.literal("episode-plan"), value: EpisodePlanSchema }).strict(),
  z.object({ kind: z.literal("scene-plan"), value: ScenePlanSchema }).strict(),
  z.object({ kind: z.literal("cut-plan"), value: CutPlanSchema }).strict(),
  z.object({ kind: z.literal("asset-requirement"), value: AssetRequirementSchema }).strict(),
  z.object({ kind: z.literal("risk"), value: ProductionRiskSchema }).strict(),
  z.object({ kind: z.literal("decision"), value: DecisionRecordSchema }).strict(),
]);

const ProcurementProposalSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  scopePackageId: IdentitySchema,
  scopePackageRevision: z.number().int().min(1).max(2_147_483_647),
  proposerPartyId: IdentitySchema,
  status: z.enum(["draft", "submitted", "clarification", "shortlisted", "selected", "rejected", "withdrawn", "expired"]),
  understanding: z.string().trim().max(20_000),
  approach: z.string().trim().max(20_000),
  experienceRefs: z.array(IdentitySchema).max(10_000),
  scheduleSummary: z.string().trim().max(4_000),
  milestoneDrafts: z.array(z.object({
    title: z.string().trim().min(1).max(240),
    dueAt: NullableIsoDateTimeSchema,
    amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  }).strict()).max(1_000),
  totalAmountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  includedRevisionRounds: z.number().int().min(0).max(100),
  assumptions: z.array(HumanTextSchema).max(1_000),
  exclusions: z.array(HumanTextSchema).max(1_000),
  risks: z.array(HumanTextSchema).max(1_000),
  submittedAt: NullableIsoDateTimeSchema,
}).strict();

const ProductionAgreementSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  status: z.enum(["draft", "party-review", "signed", "active", "paused", "completed", "terminated", "superseded"]),
  scopePackageId: IdentitySchema,
  scopePackageRevision: z.number().int().min(1).max(2_147_483_647),
  selectedProposalId: IdentitySchema.nullable(),
  partyIds: z.array(IdentitySchema).min(2).max(100),
  totalAmountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  rightsPolicyRef: IdentitySchema,
  creditPolicyRef: IdentitySchema,
  compensationPlanRef: IdentitySchema,
  confidentialityPolicyRef: IdentitySchema.nullable(),
  signedEvidenceRefs: z.array(IdentitySchema).max(10_000),
  effectiveAt: NullableIsoDateTimeSchema,
  endsAt: NullableIsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
}).strict();

const ContractChangeOrderSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  agreementId: IdentitySchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  status: z.enum(["draft", "party-review", "approved", "rejected", "implemented", "cancelled"]),
  sourceChangeRequestId: IdentitySchema,
  scopePackageAddendumId: IdentitySchema,
  scheduleDeltaDays: z.number().int().min(-3650).max(3650),
  amountDeltaMinor: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  revisedMilestoneIds: z.array(IdentitySchema).max(10_000),
  approvedByAssignmentIds: z.array(IdentitySchema).max(100),
  createdAt: IsoDateTimeSchema,
}).strict();

const ContractMilestoneSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  agreementId: IdentitySchema,
  title: z.string().trim().min(1).max(240),
  sequence: z.number().int().min(1).max(1_000_000),
  scopeRefs: z.array(ProductionScopeRefSchema).min(1).max(100_000),
  deliverableIds: z.array(IdentitySchema).max(100_000),
  acceptanceCriteria: z.array(HumanTextSchema).min(1).max(10_000),
  amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  dueAt: NullableIsoDateTimeSchema,
  status: z.enum(["pending-input", "ready", "in-progress", "submitted", "changes-requested", "accepted", "invoiced", "paid", "cancelled"]),
  acceptedSubmissionIds: z.array(IdentitySchema).max(100_000),
}).strict();

const DeliveryRevisionSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  agreementId: IdentitySchema,
  milestoneId: IdentitySchema,
  revision: z.number().int().min(1).max(2_147_483_647),
  submissionIds: z.array(IdentitySchema).min(1).max(100_000),
  sourceObjectRefs: z.array(IdentitySchema).max(100_000),
  licenseEvidenceRefs: z.array(IdentitySchema).max(100_000),
  aiUseReceiptRefs: z.array(IdentitySchema).max(100_000),
  checksum: DigestSchema,
  knownLimitations: z.array(HumanTextSchema).max(1_000),
  status: z.enum(["draft", "submitted", "changes-requested", "accepted", "superseded"]),
  submittedByAssignmentId: IdentitySchema,
  submittedAt: NullableIsoDateTimeSchema,
  acceptedAt: NullableIsoDateTimeSchema,
}).strict();

const ProductionInvoiceSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  agreementId: IdentitySchema,
  milestoneId: IdentitySchema.nullable(),
  issuerPartyId: IdentitySchema,
  recipientPartyId: IdentitySchema,
  amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  status: z.enum(["draft", "issued", "verified", "disputed", "void", "settled"]),
  externalInvoiceRef: z.string().trim().min(1).max(500).nullable(),
  issuedAt: NullableIsoDateTimeSchema,
  dueAt: NullableIsoDateTimeSchema,
}).strict();

const PaymentRecordSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  agreementId: IdentitySchema,
  invoiceId: IdentitySchema,
  payerPartyId: IdentitySchema,
  payeePartyId: IdentitySchema,
  amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  status: z.enum(["recorded-pending-verification", "verified-paid", "failed", "refunded", "cancelled"]),
  provider: z.string().trim().min(1).max(120).nullable(),
  externalPaymentRef: z.string().trim().min(1).max(500).nullable(),
  evidenceRefs: z.array(IdentitySchema).max(100_000),
  verifiedByAssignmentId: IdentitySchema.nullable(),
  paidAt: NullableIsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
}).strict();

const ProductionDisputeSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  agreementId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  category: z.enum(["scope", "quality", "schedule", "payment", "rights", "credit", "conduct", "other"]),
  openedByPartyId: IdentitySchema,
  respondentPartyIds: z.array(IdentitySchema).min(1).max(100),
  statement: HumanTextSchema,
  evidenceRefs: z.array(IdentitySchema).max(100_000),
  status: z.enum(["open", "response", "mediation", "resolved", "closed"]),
  resolution: z.string().trim().max(20_000).nullable(),
  openedAt: IsoDateTimeSchema,
  resolvedAt: NullableIsoDateTimeSchema,
}).strict();

const CommercialRecordSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("proposal"), value: ProcurementProposalSchema }).strict(),
  z.object({ kind: z.literal("agreement"), value: ProductionAgreementSchema }).strict(),
  z.object({ kind: z.literal("change-order"), value: ContractChangeOrderSchema }).strict(),
  z.object({ kind: z.literal("milestone"), value: ContractMilestoneSchema }).strict(),
  z.object({ kind: z.literal("delivery-revision"), value: DeliveryRevisionSchema }).strict(),
  z.object({ kind: z.literal("invoice"), value: ProductionInvoiceSchema }).strict(),
  z.object({ kind: z.literal("payment"), value: PaymentRecordSchema }).strict(),
  z.object({ kind: z.literal("dispute"), value: ProductionDisputeSchema }).strict(),
]);

export const CreateProductionProjectSchema = z.object({
  projectId: IdentitySchema,
  workId: IdentitySchema,
  organizationId: IdentitySchema.nullable().optional(),
  title: z.string().trim().min(1).max(240),
  collaborationModel: z.enum(COLLABORATION_MODELS),
  ownerPartyId: IdentitySchema,
  ownerDisplayName: z.string().trim().min(1).max(120),
  clientMutationId: MutationIdSchema,
}).strict();

export const ProductionProjectParamsSchema = z.object({
  projectId: IdentitySchema,
}).strict();

export const ProductionProjectByWorkParamsSchema = z.object({
  workId: IdentitySchema,
}).strict();

export const ProductionRiskParamsSchema = z.object({
  projectId: IdentitySchema,
  riskId: IdentitySchema,
}).strict();

export const ProductionRiskQuerySchema = z.object({
  status: z.string().trim().max(500).optional(),
  severity: z.string().trim().max(200).optional(),
  category: z.string().trim().max(500).optional(),
  source: z.enum(["manual", "automatic"]).optional(),
  episodeId: IdentitySchema.optional(),
  ownerAssignmentId: IdentitySchema.optional(),
  ruleKey: z.string().trim().max(160).optional(),
  q: z.string().trim().max(240).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();

const ConfigureCollaborationCommandSchema = z.object({
  type: z.literal("configure-collaboration"),
  parties: z.array(CollaborationPartySchema).min(1).max(500),
  assignments: z.array(RoleAssignmentSchema).min(1).max(2_000),
  authorityRules: z.array(AuthorityRuleSchema).max(2_000),
  charter: CreativeCharterSchema.optional(),
}).strict();

const UpsertEpisodeCommandSchema = z.object({ type: z.literal("upsert-episode"), episode: EpisodeCollaborationSchema }).strict();
const UpsertHandoffCommandSchema = z.object({ type: z.literal("upsert-handoff"), handoff: StoryToArtHandoffPackageSchema }).strict();
const UpsertClarificationCommandSchema = z.object({ type: z.literal("upsert-clarification"), clarification: ClarificationThreadSchema }).strict();
const UpsertBranchCommandSchema = z.object({ type: z.literal("upsert-branch"), branch: CreativeBranchSchema }).strict();
const UpsertMergeRequestCommandSchema = z.object({ type: z.literal("upsert-merge-request"), mergeRequest: CreativeMergeRequestSchema }).strict();
const UpsertDeliverableCommandSchema = z.object({ type: z.literal("upsert-deliverable"), deliverable: DeliverableSchema }).strict();
const UpsertSubmissionCommandSchema = z.object({ type: z.literal("upsert-submission"), submission: SubmissionSchema }).strict();
const UpsertReviewPolicyCommandSchema = z.object({ type: z.literal("upsert-review-policy"), policy: ReviewPolicySchema }).strict();
const RecordReviewDecisionCommandSchema = z.object({ type: z.literal("record-review-decision"), policyId: IdentitySchema, decision: ReviewDecisionSchema }).strict();
const UpsertTaskCommandSchema = z.object({ type: z.literal("upsert-task"), task: ProductionTaskSchema }).strict();
const UpsertTaskBatchCommandSchema = z.object({
  type: z.literal("upsert-task-batch"),
  tasks: z.array(ProductionTaskSchema).min(1).max(10_000),
}).strict();
const UpsertEpisodeOperationsCommandSchema = z.object({
  type: z.literal("upsert-episode-operations"),
  episodeId: IdentitySchema,
  episode: EpisodeCollaborationSchema.optional(),
  episodePlan: EpisodePlanSchema.optional(),
  tasks: z.array(ProductionTaskSchema).max(64).default([]),
}).strict();
const UpsertOperationsRecordCommandSchema = z.object({
  type: z.literal("upsert-operations-record"),
  record: ProductionOperationsRecordSchema,
}).strict();
const ApplyScheduleScenarioCommandSchema = z.object({
  type: z.literal("apply-schedule-scenario"),
  baseline: ScheduleBaselineSchema,
  tasks: z.array(ProductionTaskSchema).min(1).max(10_000),
}).strict();
const UpsertChangeRequestCommandSchema = z.object({
  type: z.literal("upsert-change-request"),
  request: ChangeRequestSchema,
  impactHints: z.object({
    affectedApprovalIds: z.array(IdentitySchema).max(10_000).default([]),
    touchesDialogue: z.boolean().default(false),
    touchesCanon: z.boolean().default(false),
    touchesVisualAsset: z.boolean().default(false),
    touchesRightsMetadata: z.boolean().default(false),
    agreementScoped: z.boolean().default(false),
  }).strict().default({
    affectedApprovalIds: [],
    touchesDialogue: false,
    touchesCanon: false,
    touchesVisualAsset: false,
    touchesRightsMetadata: false,
    agreementScoped: false,
  }),
}).strict();
const PublishScopePackageCommandSchema = z.object({ type: z.literal("publish-scope-package"), scopePackage: ScopePackageBaseSchema }).strict();
const AmendScopePackageCommandSchema = z.object({
  type: z.literal("amend-scope-package"),
  previousPackageId: IdentitySchema,
  replacement: ScopePackageBaseSchema,
  addendumId: IdentitySchema,
  reason: HumanTextSchema,
  createdAt: IsoDateTimeSchema,
}).strict();
const UpsertContributionCommandSchema = z.object({ type: z.literal("upsert-contribution"), contribution: ContributionRecordSchema }).strict();
const UpsertCreditManifestCommandSchema = z.object({
  type: z.literal("upsert-credit-manifest"),
  manifest: CreditManifestSchema,
  requiredApproverAssignmentIds: z.array(IdentitySchema).max(100).default([]),
}).strict();
const UpsertRightsInterestCommandSchema = z.object({ type: z.literal("upsert-rights-interest"), interest: RightsInterestSchema }).strict();
const UpsertCompensationPlanCommandSchema = z.object({ type: z.literal("upsert-compensation-plan"), plan: CompensationPlanSchema }).strict();

const UpsertRiskCommandSchema = z.object({
  type: z.literal("upsert-risk"),
  risk: ProductionRiskSchema,
}).strict();
const TransitionRiskCommandSchema = z.object({
  type: z.literal("transition-risk"),
  riskId: IdentitySchema,
  toStatus: ProductionRiskStatusSchema,
  reason: z.string().trim().max(20_000),
  expectedRiskRevision: z.number().int().min(1).max(2_147_483_647),
}).strict();
const UpsertRiskResponseCommandSchema = z.object({
  type: z.literal("upsert-risk-response"),
  response: ProductionRiskResponseSchema,
}).strict();
const TransitionRiskResponseCommandSchema = z.object({
  type: z.literal("transition-risk-response"),
  responseId: IdentitySchema,
  toStatus: ProductionRiskResponseStatusSchema,
  actualEffect: z.string().trim().min(1).max(4_000).nullable(),
}).strict();
const SuppressRiskSignalCommandSchema = z.object({
  type: z.literal("suppress-risk-signal"),
  signalId: IdentitySchema,
  reason: HumanTextSchema,
  suppressedByAssignmentId: IdentitySchema,
  expiresAt: NullableIsoDateTimeSchema,
}).strict();
const UpdateRiskPolicyCommandSchema = z.object({
  type: z.literal("update-risk-policy"),
  policy: ProductionRiskPolicySchema,
}).strict();
const EvaluateRisksCommandSchema = z.object({
  type: z.literal("evaluate-risks"),
}).strict();
const RebaselineTaskCommandSchema = z.object({
  type: z.literal("rebaseline-task"),
  taskId: IdentitySchema,
  newDueAt: IsoDateTimeSchema,
  reason: HumanTextSchema,
  sourceChangeRequestId: IdentitySchema.nullable(),
}).strict();

const UpsertPlanningRecordCommandSchema = z.object({
  type: z.literal("upsert-planning-record"),
  record: PlanningRecordSchema,
}).strict();
const CreatePlanningSnapshotCommandSchema = z.object({
  type: z.literal("create-planning-snapshot"),
  snapshot: PlanningSnapshotInputSchema,
}).strict();
const UpsertCommercialRecordCommandSchema = z.object({
  type: z.literal("upsert-commercial-record"),
  record: CommercialRecordSchema,
}).strict();

export const ProductionCommandSchema = z.discriminatedUnion("type", [
  UpsertPlanningRecordCommandSchema,
  CreatePlanningSnapshotCommandSchema,
  UpsertCommercialRecordCommandSchema,
  ConfigureCollaborationCommandSchema,
  UpsertEpisodeCommandSchema,
  UpsertHandoffCommandSchema,
  UpsertClarificationCommandSchema,
  UpsertBranchCommandSchema,
  UpsertMergeRequestCommandSchema,
  UpsertDeliverableCommandSchema,
  UpsertSubmissionCommandSchema,
  UpsertReviewPolicyCommandSchema,
  RecordReviewDecisionCommandSchema,
  UpsertTaskCommandSchema,
  UpsertTaskBatchCommandSchema,
  UpsertEpisodeOperationsCommandSchema,
  UpsertOperationsRecordCommandSchema,
  ApplyScheduleScenarioCommandSchema,
  UpsertChangeRequestCommandSchema,
  PublishScopePackageCommandSchema,
  AmendScopePackageCommandSchema,
  UpsertContributionCommandSchema,
  UpsertCreditManifestCommandSchema,
  UpsertRightsInterestCommandSchema,
  UpsertCompensationPlanCommandSchema,
  UpsertRiskCommandSchema,
  TransitionRiskCommandSchema,
  UpsertRiskResponseCommandSchema,
  TransitionRiskResponseCommandSchema,
  SuppressRiskSignalCommandSchema,
  UpdateRiskPolicyCommandSchema,
  EvaluateRisksCommandSchema,
  RebaselineTaskCommandSchema,
]);

export const ExecuteProductionCommandSchema = z.object({
  expectedRevision: RevisionNumberSchema,
  mutationId: MutationIdSchema,
  command: ProductionCommandSchema,
}).strict();

export const ProductionExternalReviewParamsSchema = z.object({
  projectId: IdentitySchema,
  reviewId: IdentitySchema,
}).strict();

export const ProductionExternalReviewQuerySchema = z.object({
  token: z.string().trim().min(32).max(512).regex(/^[A-Za-z0-9_-]+$/u),
}).strict();

export const SubmitProductionExternalReviewSchema = z.object({
  responseId: z.string().uuid(),
  token: z.string().trim().min(32).max(512).regex(/^[A-Za-z0-9_-]+$/u),
  reviewerName: z.string().trim().min(1).max(120),
  decision: z.enum(["comment", "approve", "request-changes"]),
  note: z.string().trim().max(4_000),
}).strict();

export class CreateProductionProjectDto extends createZodDto(CreateProductionProjectSchema) {}
export class ProductionProjectParamsDto extends createZodDto(ProductionProjectParamsSchema) {}
export class ProductionProjectByWorkParamsDto extends createZodDto(ProductionProjectByWorkParamsSchema) {}
export class ProductionRiskParamsDto extends createZodDto(ProductionRiskParamsSchema) {}
export class ProductionRiskQueryDto extends createZodDto(ProductionRiskQuerySchema) {}
export class ExecuteProductionCommandDto extends createZodDto(ExecuteProductionCommandSchema) {}
export class ProductionExternalReviewParamsDto extends createZodDto(ProductionExternalReviewParamsSchema) {}
export class ProductionExternalReviewQueryDto extends createZodDto(ProductionExternalReviewQuerySchema) {}
export class SubmitProductionExternalReviewDto extends createZodDto(SubmitProductionExternalReviewSchema) {}

export type ProductionCommand = z.infer<typeof ProductionCommandSchema>;
export type ExecuteProductionCommand = z.infer<typeof ExecuteProductionCommandSchema>;
export type ProductionRiskQuery = z.infer<typeof ProductionRiskQuerySchema>;
