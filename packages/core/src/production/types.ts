export const PRODUCTION_MODEL_VERSION = 2 as const;
export const PRODUCTION_RISK_MODEL_VERSION = 2 as const;

export const PRODUCTION_SCOPE_KINDS = [
  "project",
  "season",
  "episode",
  "scene",
  "scroll-segment",
  "cut",
  "layer-group",
  "asset",
  "deliverable",
] as const;
export type ProductionScopeKind = (typeof PRODUCTION_SCOPE_KINDS)[number];

export interface ScopeRef {
  readonly kind: ProductionScopeKind;
  readonly id: string;
  readonly ancestors: readonly ScopeAncestorRef[];
}

export interface ScopeAncestorRef {
  readonly kind: Exclude<ProductionScopeKind, "deliverable">;
  readonly id: string;
}

export type ProductionLineage = "narrative" | "visual" | "integrated";

export interface RevisionRef {
  readonly id: string;
  readonly lineage: ProductionLineage;
  readonly revision: number;
  readonly digest: string;
  readonly createdAt: string;
}

export const PRODUCTION_STUDIO_DOCUMENT_ROLES = [
  "story",
  "thumbnail",
  "lineart",
  "background",
  "color",
  "lettering",
  "final",
] as const;
export type ProductionStudioDocumentRole = (typeof PRODUCTION_STUDIO_DOCUMENT_ROLES)[number];

export interface ProductionStudioRevisionLink {
  readonly id: string;
  readonly projectId: string;
  readonly workId: string;
  readonly episodeId: string | null;
  readonly studioDocumentRef: string;
  readonly documentRole: ProductionStudioDocumentRole;
  readonly studioRevisionRef: RevisionRef;
  readonly deliverableId: string;
  readonly submissionId: string;
  readonly linkedByAssignmentId: string;
  readonly status: "submitted" | "approved" | "superseded";
  readonly linkedAt: string;
  readonly approvedAt: string | null;
}

export const COLLABORATION_MODELS = [
  "solo",
  "co-creator",
  "story-led-commission",
  "art-led-commission",
  "adaptation",
  "studio-production",
  "anthology",
  "replacement",
] as const;
export type CollaborationModel = (typeof COLLABORATION_MODELS)[number];

export const PRODUCTION_ROLE_TYPES = [
  "story-lead",
  "writer",
  "adaptation-writer",
  "storyboard-artist",
  "art-lead",
  "line-artist",
  "colorist",
  "background-artist",
  "letterer",
  "localizer",
  "editor",
  "producer",
  "rights-reviewer",
  "assistant",
  "vendor",
] as const;
export type ProductionRoleType = (typeof PRODUCTION_ROLE_TYPES)[number];

export type AssignmentStatus =
  | "invited"
  | "onboarding"
  | "active"
  | "paused"
  | "ending"
  | "ended";

export interface CollaborationParty {
  readonly id: string;
  readonly accountUserId: string | null;
  readonly legalIdentityRef: string | null;
  readonly publicDisplayName: string;
  readonly internalDisplayName: string;
  readonly contactPartyId: string | null;
  readonly agencyPartyId: string | null;
  readonly status: "invited" | "active" | "paused" | "ended";
}

export interface RoleAssignment {
  readonly id: string;
  readonly projectId: string;
  readonly partyId: string;
  readonly roleType: ProductionRoleType;
  readonly scope: ScopeRef;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly capabilities: readonly string[];
  readonly agreementRevisionRef: string | null;
  readonly publicCreditRole: string | null;
  readonly status: AssignmentStatus;
  readonly lead: boolean;
}

export const DECISION_DOMAINS = [
  "canon",
  "dialogue",
  "visual-direction",
  "character-design",
  "layout",
  "color",
  "lettering",
  "marketing",
  "publication",
  "schedule",
  "rights",
  "ai-use",
] as const;
export type DecisionDomain = (typeof DECISION_DOMAINS)[number];

export const AUTHORITY_LEVELS = [
  "propose",
  "comment",
  "consult",
  "approve",
  "veto",
  "decide",
  "mediate",
  "observe",
] as const;
export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];

export interface DecisionAuthorityRule {
  readonly id: string;
  readonly projectId: string;
  readonly domain: DecisionDomain;
  readonly scope: ScopeRef;
  readonly proposerAssignmentIds: readonly string[];
  readonly requiredConsultAssignmentIds: readonly string[];
  readonly requiredApproverAssignmentIds: readonly string[];
  readonly decisionAssignmentId: string | null;
  readonly vetoAssignmentIds: readonly string[];
  readonly mediatorAssignmentId: string | null;
  readonly quorum: { readonly approvals: number; readonly eligible: number } | null;
  readonly effectiveFrom: string;
  readonly expiresAt: string | null;
  readonly agreementRevisionRef: string | null;
}

export interface CreativeCharter {
  readonly id: string;
  readonly projectId: string;
  readonly revision: number;
  readonly status:
    | "draft"
    | "party-review"
    | "agreed"
    | "active"
    | "amendment-proposed"
    | "superseded"
    | "archived";
  readonly coreExperience: string;
  readonly immutablePrinciples: readonly string[];
  readonly experimentalAreas: readonly string[];
  readonly storyAutonomy: readonly string[];
  readonly artAutonomy: readonly string[];
  readonly jointDecisionAreas: readonly string[];
  readonly feedbackPrinciples: readonly string[];
  readonly communicationRules: readonly string[];
  readonly confirmedByAssignmentIds: readonly string[];
  readonly agreementRevisionRef: string | null;
  readonly createdAt: string;
}

export type CreativeInstructionPriority =
  | "MUST_PRESERVE"
  | "INTENT"
  | "SUGGESTION"
  | "ARTIST_CHOICE"
  | "REFERENCE_ONLY"
  | "DO_NOT_USE";

export type CreativeLatitude = "exact" | "bounded" | "open" | "exploratory";

export interface CreativeInstruction {
  readonly id: string;
  readonly scope: ScopeRef;
  readonly priority: CreativeInstructionPriority;
  readonly latitude: CreativeLatitude;
  readonly text: string;
  readonly rationale: string;
  readonly sourceRevisionRef: string;
}

export interface EpisodeIntentSheet {
  readonly id: string;
  readonly episodeId: string;
  readonly audienceExperience: string;
  readonly openingInformation: readonly string[];
  readonly emotionalArc: readonly string[];
  readonly mustRememberScopeRefs: readonly ScopeRef[];
  readonly intentionallyHiddenInformation: readonly string[];
  readonly cliffhanger: string;
  readonly silentInformation: readonly string[];
  readonly compressionAllowance: readonly string[];
  readonly visualWhitespace: readonly string[];
  readonly platformConstraints: readonly string[];
  readonly accessibilityConstraints: readonly string[];
  readonly revisionRef: RevisionRef;
}

export type HandoffStatus =
  | "draft"
  | "internal-story-review"
  | "ready-to-offer"
  | "offered-to-art"
  | "clarification-open"
  | "accepted-by-art"
  | "production-started"
  | "superseded"
  | "cancelled";

export interface StoryToArtHandoffPackage {
  readonly id: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly handoffRevision: number;
  readonly status: HandoffStatus;
  readonly storySnapshotRef: RevisionRef | null;
  readonly storyLockRef: RevisionRef | null;
  readonly storyBibleRevisionRef: string | null;
  readonly characterBibleRevisionRefs: readonly string[];
  readonly episodeIntentRef: string | null;
  readonly beatRefs: readonly string[];
  readonly sceneRefs: readonly string[];
  readonly lockedDialogueRefs: readonly string[];
  readonly continuityReferenceRefs: readonly string[];
  readonly visualRequirementRefs: readonly string[];
  readonly forbiddenInterpretationRefs: readonly string[];
  readonly assetRequirementRefs: readonly string[];
  readonly locationReferenceRefs: readonly string[];
  readonly costumeReferenceRefs: readonly string[];
  readonly instructions: readonly CreativeInstruction[];
  readonly platformProfileRef: string | null;
  readonly technicalDeliveryRuleRef: string | null;
  readonly rightsAndAiPolicyRef: string | null;
  readonly creditPolicyRef: string | null;
  readonly expectedDeliverables: readonly string[];
  readonly reviewPolicyRef: string | null;
  readonly decisionOwnerAssignmentIds: readonly string[];
  readonly dueAt: string | null;
  readonly openRiskAcceptances: readonly HandoffRiskAcceptance[];
  readonly createdByAssignmentId: string;
  readonly acceptedByAssignmentId: string | null;
  readonly acceptedAt: string | null;
  readonly digest: string;
  readonly createdAt: string;
}

export interface HandoffRiskAcceptance {
  readonly id: string;
  readonly code: string;
  readonly reason: string;
  readonly acceptedByAssignmentId: string;
  readonly acceptedAt: string;
  readonly expiresAt: string | null;
}

export type ClarificationCategory =
  | "narrative-ambiguity"
  | "visual-reference"
  | "continuity"
  | "technical"
  | "schedule"
  | "rights"
  | "credit";

export type ClarificationStatus =
  | "open"
  | "answered"
  | "decision-recorded"
  | "accepted-risk"
  | "closed";

export interface ClarificationThread {
  readonly id: string;
  readonly handoffId: string;
  readonly scope: ScopeRef;
  readonly category: ClarificationCategory;
  readonly blocking: boolean;
  readonly question: string;
  readonly askedByAssignmentId: string;
  readonly answerOwnerAssignmentId: string;
  readonly dueAt: string | null;
  readonly status: ClarificationStatus;
  readonly answer: string | null;
  readonly decisionRecordId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface HandoffReadinessInput {
  readonly package: StoryToArtHandoffPackage;
  readonly clarifications: readonly ClarificationThread[];
}

export interface HandoffReadiness {
  readonly ready: boolean;
  readonly score: number;
  readonly hardBlocks: readonly HandoffReadinessIssue[];
  readonly advisories: readonly HandoffReadinessIssue[];
  readonly metrics: Readonly<Record<string, number>>;
}

export interface HandoffReadinessIssue {
  readonly code: string;
  readonly message: string;
  readonly scope: ScopeRef | null;
  readonly severity: "blocker" | "warning";
}

export type EpisodeCollaborationState =
  | "episode-planning"
  | "story-drafting"
  | "story-review"
  | "story-ready-for-art"
  | "art-clarification"
  | "thumbnailing"
  | "thumbnail-joint-review"
  | "thumbnail-locked"
  | "final-art-production"
  | "lettering-and-integration"
  | "joint-proof"
  | "publish-ready"
  | "published"
  | "blocked"
  | "paused-health"
  | "paused-contract"
  | "change-request-open"
  | "creator-replacement"
  | "cancelled";

export interface EpisodeCollaboration {
  readonly id: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly revision: number;
  readonly state: EpisodeCollaborationState;
  readonly narrativeRevisionRef: RevisionRef | null;
  readonly visualRevisionRef: RevisionRef | null;
  readonly integratedRevisionRef: RevisionRef | null;
  readonly activeHandoffId: string | null;
  readonly openBlockerCount: number;
  readonly storyLockApproved: boolean;
  readonly thumbnailLockApproved: boolean;
  readonly jointProofApproved: boolean;
  readonly creditPreflightPassed: boolean;
  readonly publicationPreflightPassed: boolean;
  readonly updatedAt: string;
}

export type CreativeBranchType =
  | "story-draft"
  | "story-amendment"
  | "visual-exploration"
  | "thumbnail"
  | "art-process"
  | "integration"
  | "hotfix";

export interface CreativeBranch {
  readonly id: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly type: CreativeBranchType;
  readonly lineage: ProductionLineage;
  readonly baseRevisionRef: RevisionRef;
  readonly headRevisionRef: RevisionRef;
  readonly ownerAssignmentId: string;
  readonly purpose: string;
  readonly mergeTarget: ProductionLineage;
  readonly visibility: "private" | "team" | "reviewers";
  readonly allowedScopes: readonly ScopeRef[];
  readonly expiresAt: string | null;
  readonly status: "active" | "review" | "merged" | "closed" | "expired";
}

export const REVIEW_LANES = [
  "narrative",
  "canon-continuity",
  "visual-direction",
  "production",
  "lettering-localization",
  "accessibility",
  "rights-compliance",
  "client-publisher",
] as const;
export type ReviewLane = (typeof REVIEW_LANES)[number];

export interface CreativeMergeRequest {
  readonly id: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly sourceBranchId: string;
  readonly targetLineage: ProductionLineage;
  readonly baseRevisionRef: RevisionRef;
  readonly proposedRevisionRef: RevisionRef;
  readonly mergedRevisionRef: RevisionRef | null;
  readonly summary: string;
  readonly changedScopes: readonly ScopeRef[];
  readonly affectedDecisionIds: readonly string[];
  readonly affectedApprovalIds: readonly string[];
  readonly requiredReviewLanes: readonly ReviewLane[];
  readonly mergePolicyId: string;
  readonly status:
    | "draft"
    | "ready-for-review"
    | "changes-requested"
    | "approved"
    | "conflicted"
    | "merged"
    | "closed";
  readonly createdByAssignmentId: string;
  readonly createdAt: string;
}

export interface ReviewPolicyLane {
  readonly lane: ReviewLane;
  readonly eligibleAssignmentIds: readonly string[];
  readonly requiredAssignmentIds: readonly string[];
  readonly quorum: number;
  readonly vetoAssignmentIds: readonly string[];
  readonly blocksPublication: boolean;
}

export interface ReviewPolicy {
  readonly id: string;
  readonly projectId: string;
  readonly scope: ScopeRef;
  readonly lanes: readonly ReviewPolicyLane[];
  readonly responseDueHours: number;
  readonly expiredReviewAction: "escalate" | "replace-reviewer" | "reschedule";
}

export type ReviewDecisionValue =
  | "approve"
  | "approve-with-conditions"
  | "request-changes"
  | "veto"
  | "abstain";

export interface ReviewDecision {
  readonly id: string;
  readonly reviewRoundId: string;
  readonly lane: ReviewLane;
  readonly assignmentId: string;
  readonly value: ReviewDecisionValue;
  readonly reasonCode: string | null;
  readonly evidenceScopeRefs: readonly ScopeRef[];
  readonly conditions: readonly string[];
  readonly createdAt: string;
}

export interface ApprovalEvaluation {
  readonly approved: boolean;
  readonly blockingLanes: readonly ReviewLane[];
  readonly laneResults: readonly ApprovalLaneEvaluation[];
}

export interface ApprovalLaneEvaluation {
  readonly lane: ReviewLane;
  readonly approved: boolean;
  readonly approvals: number;
  readonly requiredApprovals: number;
  readonly missingRequiredAssignmentIds: readonly string[];
  readonly vetoedByAssignmentIds: readonly string[];
  readonly changeRequestedByAssignmentIds: readonly string[];
}

export type ProductionTaskStatus =
  | "draft"
  | "needs-input"
  | "ready"
  | "in-progress"
  | "internal-review"
  | "external-review"
  | "changes-requested"
  | "conditionally-approved"
  | "approved"
  | "done"
  | "blocked"
  | "paused"
  | "cancelled"
  | "out-of-scope";

export interface ProductionTask {
  readonly id: string;
  readonly projectId: string;
  readonly scope: ScopeRef;
  readonly processKey: string;
  readonly title: string;
  readonly status: ProductionTaskStatus;
  readonly assignmentIds: readonly string[];
  readonly reviewerAssignmentIds: readonly string[];
  readonly inputRevisionRefs: readonly RevisionRef[];
  readonly outputDeliverableIds: readonly string[];
  readonly dependencyTaskIds: readonly string[];
  readonly plannedStartAt?: string | null;
  readonly baselineDueAt?: string | null;
  readonly dueAt: string | null;
  readonly statusChangedAt?: string;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly progressPercent?: number | null;
  readonly remainingEstimateHours?: number | null;
  readonly linkedRiskIds?: readonly string[];
  readonly estimateHours: {
    readonly optimistic: number;
    readonly likely: number;
    readonly pessimistic: number;
  } | null;
  readonly completionCriteria: readonly string[];
  readonly sourceAgreementMilestoneId: string | null;
}

export interface Deliverable {
  readonly id: string;
  readonly projectId: string;
  readonly scope: ScopeRef;
  readonly type: string;
  readonly expectedFormat: string;
  readonly completionCriteria: readonly string[];
  readonly currentSubmissionId: string | null;
  readonly approvedSubmissionId: string | null;
}

export interface Submission {
  readonly id: string;
  readonly projectId: string;
  readonly deliverableId: string;
  readonly revisionRef: RevisionRef;
  readonly submittedByAssignmentId: string;
  readonly submittedAt: string;
  readonly status: "submitted" | "in-review" | "changes-requested" | "approved" | "superseded";
  readonly inputRevisionRefs: readonly RevisionRef[];
  readonly evidenceRefs: readonly string[];
}

export type ChangeStage =
  | "pre-lock"
  | "post-story-lock"
  | "post-thumbnail-lock"
  | "in-final-art"
  | "post-joint-proof"
  | "post-publish";

export type ChangeAction =
  | "no-action"
  | "acknowledge"
  | "rebase"
  | "revise"
  | "re-review"
  | "change-order"
  | "rights-review"
  | "publication-hotfix";

export interface ChangeRequest {
  readonly id: string;
  readonly projectId: string;
  readonly episodeId: string | null;
  readonly stage: ChangeStage;
  readonly sourceRevisionRef: RevisionRef;
  readonly proposedRevisionRef: RevisionRef;
  readonly changedScopes: readonly ScopeRef[];
  readonly reason: string;
  readonly requestedByAssignmentId: string;
  readonly status:
    | "draft"
    | "impact-analysis"
    | "awaiting-approval"
    | "approved"
    | "rejected"
    | "implementing"
    | "verification"
    | "completed"
    | "cancelled";
  readonly createdAt: string;
}

export interface ChangeImpact {
  readonly severity: "none" | "low" | "medium" | "high" | "critical";
  readonly actions: readonly ChangeAction[];
  readonly affectedProcessKeys: readonly string[];
  readonly invalidatedApprovalIds: readonly string[];
  readonly requiresScheduleRebaseline: boolean;
  readonly requiresCompensationReview: boolean;
  readonly requiresAgreementChange: boolean;
  readonly requiresRightsReview: boolean;
  readonly explanation: readonly string[];
}

export interface ScopePackage {
  readonly id: string;
  readonly projectId: string;
  readonly revision: number;
  readonly status: "draft" | "published" | "superseded" | "cancelled";
  readonly scopes: readonly ScopeRef[];
  readonly inputRevisionRefs: readonly RevisionRef[];
  readonly deliverableSpecifications: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly includedRevisionRounds: number;
  readonly schedule: {
    readonly proposalDueAt: string | null;
    readonly startsAt: string | null;
    readonly deliveryDueAt: string | null;
    readonly reviewResponseHours: number;
  };
  readonly rightsPolicyRef: string;
  readonly aiPolicyRef: string;
  readonly creditPolicyRef: string;
  readonly compensationTermsRef: string;
  readonly informationDisclosureLevel: "internal" | "nda" | "vendor" | "public";
  readonly digest: string;
  readonly createdAt: string;
}

export interface ScopePackageAddendum {
  readonly id: string;
  readonly scopePackageId: string;
  readonly sequence: number;
  readonly reason: string;
  readonly changedFields: readonly string[];
  readonly replacementScopePackageRevision: number;
  readonly createdAt: string;
}

export interface ProcurementRequirementsGate {
  readonly scopePackageId: string;
  readonly approvedScope: boolean;
  readonly sourceMaterialsAvailable: boolean;
  readonly styleReferencesAvailable: boolean;
  readonly accessProvisioned: boolean;
  readonly fileSpecificationConfirmed: boolean;
  readonly ndaConfirmed: boolean;
  readonly paymentConditionConfirmed: boolean;
  readonly blockingReasons: readonly string[];
}

export interface ContributionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly partyId: string;
  readonly assignmentId: string;
  readonly scope: ScopeRef;
  readonly revisionRef: RevisionRef;
  readonly contributionType: string;
  readonly approvedAt: string | null;
  readonly approvalId: string | null;
}

export interface CreditEntry {
  readonly id: string;
  readonly partyId: string;
  readonly publicName: string;
  readonly roleLabel: string;
  readonly scopes: readonly ScopeRef[];
  readonly order: number;
  readonly media: readonly ("episode" | "series" | "export" | "marketing" | "metadata")[];
  readonly anonymous: boolean;
}

export interface CreditManifest {
  readonly id: string;
  readonly projectId: string;
  readonly episodeId: string | null;
  readonly revision: number;
  readonly status: "draft" | "review" | "approved" | "superseded";
  readonly contentRevisionRefs: readonly RevisionRef[];
  readonly entries: readonly CreditEntry[];
  readonly approvedByAssignmentIds: readonly string[];
  readonly agreementRevisionRefs: readonly string[];
  readonly createdAt: string;
}

export type RightsInterestType =
  | "authorship-claim"
  | "copyright-share"
  | "publication-license"
  | "adaptation-license"
  | "secondary-use-consent"
  | "portfolio-license"
  | "ai-processing-consent"
  | "ai-training-consent";

export interface RightsInterest {
  readonly id: string;
  readonly projectId: string;
  readonly partyId: string;
  readonly type: RightsInterestType;
  readonly scope: ScopeRef;
  readonly status: "asserted" | "under-review" | "verified" | "disputed" | "expired";
  readonly agreementRevisionRef: string | null;
  readonly evidenceRefs: readonly string[];
  readonly startsAt: string | null;
  readonly endsAt: string | null;
}

export interface RevenueShareRule {
  readonly id: string;
  readonly revenueSource:
    | "domestic-serialization"
    | "foreign-serialization"
    | "print"
    | "video"
    | "game"
    | "merchandise"
    | "advertising"
    | "other";
  readonly basis: "gross" | "net";
  readonly deductions: readonly string[];
  readonly partySharesBasisPoints: Readonly<Record<string, number>>;
  readonly recoupmentRef: string | null;
}

export interface CompensationPlan {
  readonly id: string;
  readonly projectId: string;
  readonly revision: number;
  readonly status: "draft" | "agreed" | "active" | "superseded" | "ended";
  readonly fixedFeeTerms: readonly string[];
  readonly revenueShareRules: readonly RevenueShareRule[];
  readonly statementFrequency: "monthly" | "quarterly" | "semiannual" | "annual";
  readonly auditRight: boolean;
  readonly agreementRevisionRef: string | null;
  readonly createdAt: string;
}

export interface CreditPreflightResult {
  readonly passed: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export type PlanningDocumentStatus =
  | "draft"
  | "review"
  | "approved"
  | "locked"
  | "superseded"
  | "archived";

export interface ProjectBrief {
  readonly id: string;
  readonly projectId: string;
  readonly revision: number;
  readonly status: PlanningDocumentStatus;
  readonly title: string;
  readonly logline: string;
  readonly synopsis: string;
  readonly themes: readonly string[];
  readonly genreKeys: readonly string[];
  readonly audience: readonly string[];
  readonly platformProfileRefs: readonly string[];
  readonly businessGoals: readonly string[];
  readonly constraints: readonly string[];
  readonly rightsBaselineRef: string | null;
  readonly approvedByAssignmentIds: readonly string[];
  readonly createdAt: string;
}

export interface SeriesMaster {
  readonly id: string;
  readonly projectId: string;
  readonly revision: number;
  readonly status: PlanningDocumentStatus;
  readonly premise: string;
  readonly genreRules: readonly string[];
  readonly characterBibleRevisionRefs: readonly string[];
  readonly locationBibleRevisionRefs: readonly string[];
  readonly worldRules: readonly string[];
  readonly terminology: Readonly<Record<string, string>>;
  readonly styleRules: readonly string[];
  readonly forbiddenElements: readonly string[];
  readonly sourceEvidenceRefs: readonly string[];
  readonly approvedByAssignmentIds: readonly string[];
  readonly createdAt: string;
}

export interface SeasonPlan {
  readonly id: string;
  readonly projectId: string;
  readonly seasonId: string;
  readonly revision: number;
  readonly status: PlanningDocumentStatus;
  readonly title: string;
  readonly goal: string;
  readonly plotArc: readonly string[];
  readonly characterArcRefs: readonly string[];
  readonly episodeOrder: readonly string[];
  readonly targetEpisodeCount: number;
  readonly releaseStartsAt: string | null;
  readonly releaseCadenceDays: number | null;
  readonly budgetCapMinor: number | null;
  readonly currency: string | null;
  readonly approvedByAssignmentIds: readonly string[];
  readonly createdAt: string;
}

export interface EpisodePlan {
  readonly id: string;
  readonly projectId: string;
  readonly seasonId: string | null;
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly revision: number;
  readonly status: PlanningDocumentStatus;
  readonly title: string;
  readonly logline: string;
  readonly openingHook: string;
  readonly coreConflict: string;
  readonly turningPoints: readonly string[];
  readonly cliffhanger: string;
  readonly characterRefs: readonly string[];
  readonly locationRefs: readonly string[];
  readonly targetCutCount: number;
  readonly targetScrollHeightPx: number;
  readonly dialogueDensity: "low" | "medium" | "high";
  readonly difficulty: 1 | 2 | 3 | 4 | 5;
  readonly riskIds: readonly string[];
  readonly narrativeRevisionRef: RevisionRef | null;
  readonly approvedByAssignmentIds: readonly string[];
  readonly createdAt: string;
}

export interface ScenePlan {
  readonly id: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly sceneId: string;
  readonly order: number;
  readonly revision: number;
  readonly status: PlanningDocumentStatus;
  readonly purpose: string;
  readonly locationRef: string | null;
  readonly timeLabel: string;
  readonly characterRefs: readonly string[];
  readonly emotionalBeat: string;
  readonly continuityRefs: readonly string[];
  readonly instructionRefs: readonly string[];
  readonly estimatedMinutes: number;
  readonly approvedByAssignmentIds: readonly string[];
  readonly createdAt: string;
}

export interface CutPlan {
  readonly id: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly sceneId: string;
  readonly cutId: string;
  readonly order: number;
  readonly revision: number;
  readonly status: PlanningDocumentStatus;
  readonly framing: string;
  readonly camera: string;
  readonly characterRefs: readonly string[];
  readonly dialogueRefs: readonly string[];
  readonly assetRequirementIds: readonly string[];
  readonly layerRequirements: readonly string[];
  readonly estimatedHours: number;
  readonly complexity: 1 | 2 | 3 | 4 | 5;
  readonly approvedByAssignmentIds: readonly string[];
  readonly createdAt: string;
}

export type PlanningSnapshotType =
  | "brief-approval"
  | "series-master-lock"
  | "season-baseline"
  | "story-lock"
  | "thumbnail-lock"
  | "joint-proof"
  | "publication";

export interface PlanningSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly scope: ScopeRef;
  readonly type: PlanningSnapshotType;
  readonly sourceRevisionRefs: readonly RevisionRef[];
  readonly documentRefs: readonly string[];
  readonly approvedByAssignmentIds: readonly string[];
  readonly digest: string;
  readonly createdAt: string;
}

export interface AssetRequirement {
  readonly id: string;
  readonly projectId: string;
  readonly scope: ScopeRef;
  readonly category:
    | "character"
    | "costume"
    | "location"
    | "prop"
    | "3d"
    | "brush"
    | "font"
    | "audio"
    | "reference"
    | "other";
  readonly title: string;
  readonly specification: string;
  readonly sourcePlanRefs: readonly string[];
  readonly sourcing: "internal" | "external" | "marketplace" | "existing";
  readonly rightsRequirements: readonly string[];
  readonly requiredByAt: string | null;
  readonly status: "identified" | "sourcing" | "ready" | "blocked" | "cancelled";
}

export type ProductionRiskCategory =
  | "story"
  | "visual"
  | "schedule"
  | "capacity"
  | "review"
  | "asset"
  | "budget"
  | "rights"
  | "contract"
  | "platform"
  | "health"
  | "security"
  | "communication"
  | "technical";

export type ProductionRiskSeverity = "watch" | "warning" | "high" | "critical";
export type ProductionRiskResponseStatus = "proposed" | "approved" | "in-progress" | "completed" | "cancelled";
export type ProductionRiskStatus =
  | "open"
  | "monitoring"
  | "mitigating"
  | "occurred"
  | "accepted"
  | "resolved"
  | "dismissed"
  | "closed";
export type ProductionRiskSource = "manual" | "automatic";
export type ProductionRiskSignalState = "active" | "cleared" | "suppressed";
export type ProductionRiskConfidence = "high" | "medium" | "low";

export interface ProductionRiskPolicy {
  readonly id: string;
  readonly projectId: string;
  readonly timezone: string;
  readonly workdayEndLocal: string;
  readonly dueSoonHours: number;
  readonly blockedWarningHours: number;
  readonly blockedCriticalHours: number;
  readonly capacityWarningPercent: number;
  readonly capacityCriticalPercent: number;
  readonly defaultReviewSlaHours: number;
  readonly minimumReadyBufferEpisodes: number;
  readonly autoOpenSeverity: "warning" | "high" | "critical";
  readonly notificationCooldownHours: number;
  /** Backward-compatible stability window for automatically opening inferred risks. */
  readonly autoOpenStableHours?: number;
  /** Hysteresis applied while an existing automatic risk recovers below its trigger. */
  readonly thresholdHysteresisPercent?: number;
  /** Minimum evidence confidence for opening non-critical automatic risks. */
  readonly autoOpenMinimumConfidence?: ProductionRiskConfidence;
  readonly autoResolveStableHours: number;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface ProductionRiskEvidence {
  readonly key: string;
  readonly label: string;
  readonly value: string | number | boolean | null;
  readonly threshold: string | number | null;
  readonly unit: string | null;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly observedAt: string;
}

export interface ProductionRiskSignal {
  readonly id: string;
  readonly projectId: string;
  readonly fingerprint: string;
  readonly ruleKey: string;
  readonly scope: ScopeRef;
  readonly sourceEntityType:
    | "task"
    | "episode"
    | "assignment"
    | "review"
    | "asset"
    | "milestone"
    | "change-request"
    | "project";
  readonly sourceEntityId: string;
  readonly category: ProductionRiskCategory;
  readonly severity: ProductionRiskSeverity;
  readonly priorityScore: number;
  readonly confidence: ProductionRiskConfidence;
  readonly title: string;
  readonly summary: string;
  readonly evidence: readonly ProductionRiskEvidence[];
  readonly affectedTaskIds: readonly string[];
  readonly affectedEpisodeIds: readonly string[];
  readonly affectedMilestoneIds: readonly string[];
  readonly linkedRiskId: string | null;
  readonly state: ProductionRiskSignalState;
  readonly firstDetectedAt: string;
  readonly lastDetectedAt: string;
  readonly clearedAt: string | null;
  readonly suppression: {
    readonly reason: string;
    readonly suppressedByAssignmentId: string;
    readonly suppressedAt: string;
    readonly expiresAt: string | null;
  } | null;
}

export interface ProductionRiskResponse {
  readonly id: string;
  readonly projectId: string;
  readonly riskId: string;
  readonly strategy: "avoid" | "mitigate" | "transfer" | "accept" | "escalate";
  readonly actionType:
    | "assign"
    | "split-task"
    | "reschedule"
    | "resolve-dependency"
    | "parallel-review"
    | "outsource"
    | "reduce-scope"
    | "reuse-asset"
    | "create-change-request"
    | "manual";
  readonly title: string;
  readonly description: string;
  readonly ownerAssignmentId: string | null;
  readonly dueAt: string | null;
  readonly linkedTaskId: string | null;
  readonly linkedChangeRequestId: string | null;
  readonly linkedChangeOrderId: string | null;
  readonly expectedEffect: string;
  readonly actualEffect: string | null;
  readonly status: ProductionRiskResponseStatus;
  /** Optional on legacy records; transitions materialize the current revision. */
  readonly revision?: number;
  readonly cancellationReason?: string | null;
  readonly approvedAt?: string | null;
  readonly startedAt?: string | null;
  readonly cancelledAt?: string | null;
  readonly updatedAt?: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface ProductionRiskAssessment {
  readonly id: string;
  readonly projectId: string;
  readonly riskId: string;
  readonly signalIds: readonly string[];
  readonly probability: 1 | 2 | 3 | 4 | 5;
  readonly impact: 1 | 2 | 3 | 4 | 5;
  readonly exposureScore: number;
  readonly priorityScore: number;
  readonly confidence: ProductionRiskConfidence;
  readonly rationale: readonly string[];
  readonly assessedAt: string;
}

export interface ProductionRisk {
  readonly id: string;
  readonly projectId: string;
  readonly revision: number;
  readonly scope: ScopeRef;
  readonly category: ProductionRiskCategory;
  readonly source: ProductionRiskSource;
  readonly signalIds: readonly string[];
  readonly title: string;
  readonly description: string;
  readonly probability: 1 | 2 | 3 | 4 | 5;
  readonly impact: 1 | 2 | 3 | 4 | 5;
  readonly exposureScore: number;
  readonly severity: ProductionRiskSeverity;
  readonly priorityScore: number;
  readonly ownerAssignmentId: string | null;
  readonly causeCodes: readonly string[];
  readonly earlySignals: readonly string[];
  readonly mitigation: string;
  readonly contingency: string;
  readonly trigger: string;
  readonly affectedTaskIds: readonly string[];
  readonly affectedEpisodeIds: readonly string[];
  readonly affectedMilestoneIds: readonly string[];
  readonly baselineDueAt: string | null;
  readonly forecastDueAt: string | null;
  readonly varianceHours: number | null;
  readonly status: ProductionRiskStatus;
  /** @deprecated use responseDueAt */
  readonly dueAt: string | null;
  readonly responseDueAt: string | null;
  readonly nextReviewAt: string | null;
  readonly acceptedReason: string | null;
  readonly dismissedReason: string | null;
  readonly resolutionSummary: string | null;
  readonly detectedAt: string;
  readonly lastEvaluatedAt: string;
  readonly occurredAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DecisionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly scope: ScopeRef;
  readonly domain: DecisionDomain;
  readonly question: string;
  readonly decision: string;
  readonly rationale: string;
  readonly alternatives: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly decidedByAssignmentId: string;
  readonly consultedAssignmentIds: readonly string[];
  readonly supersedesDecisionId: string | null;
  readonly createdAt: string;
}

export type ProposalStatus =
  | "draft"
  | "submitted"
  | "clarification"
  | "shortlisted"
  | "selected"
  | "rejected"
  | "withdrawn"
  | "expired";

export interface ProcurementProposal {
  readonly id: string;
  readonly projectId: string;
  readonly scopePackageId: string;
  readonly scopePackageRevision: number;
  readonly proposerPartyId: string;
  readonly status: ProposalStatus;
  readonly understanding: string;
  readonly approach: string;
  readonly experienceRefs: readonly string[];
  readonly scheduleSummary: string;
  readonly milestoneDrafts: readonly {
    readonly title: string;
    readonly dueAt: string | null;
    readonly amountMinor: number;
  }[];
  readonly totalAmountMinor: number;
  readonly currency: string;
  readonly includedRevisionRounds: number;
  readonly assumptions: readonly string[];
  readonly exclusions: readonly string[];
  readonly risks: readonly string[];
  readonly submittedAt: string | null;
}

export interface ProductionAgreement {
  readonly id: string;
  readonly projectId: string;
  readonly revision: number;
  readonly status:
    | "draft"
    | "party-review"
    | "signed"
    | "active"
    | "paused"
    | "completed"
    | "terminated"
    | "superseded";
  readonly scopePackageId: string;
  readonly scopePackageRevision: number;
  readonly selectedProposalId: string | null;
  readonly partyIds: readonly string[];
  readonly totalAmountMinor: number;
  readonly currency: string;
  readonly rightsPolicyRef: string;
  readonly creditPolicyRef: string;
  readonly compensationPlanRef: string;
  readonly confidentialityPolicyRef: string | null;
  readonly signedEvidenceRefs: readonly string[];
  readonly effectiveAt: string | null;
  readonly endsAt: string | null;
  readonly createdAt: string;
}

export interface ContractChangeOrder {
  readonly id: string;
  readonly projectId: string;
  readonly agreementId: string;
  readonly revision: number;
  readonly status: "draft" | "party-review" | "approved" | "rejected" | "implemented" | "cancelled";
  readonly sourceChangeRequestId: string;
  readonly scopePackageAddendumId: string;
  readonly scheduleDeltaDays: number;
  readonly amountDeltaMinor: number;
  readonly currency: string;
  readonly revisedMilestoneIds: readonly string[];
  readonly approvedByAssignmentIds: readonly string[];
  readonly createdAt: string;
}

export interface ContractMilestone {
  readonly id: string;
  readonly projectId: string;
  readonly agreementId: string;
  readonly title: string;
  readonly sequence: number;
  readonly scopeRefs: readonly ScopeRef[];
  readonly deliverableIds: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly amountMinor: number;
  readonly currency: string;
  readonly dueAt: string | null;
  readonly status:
    | "pending-input"
    | "ready"
    | "in-progress"
    | "submitted"
    | "changes-requested"
    | "accepted"
    | "invoiced"
    | "paid"
    | "cancelled";
  readonly acceptedSubmissionIds: readonly string[];
}

export interface DeliveryRevision {
  readonly id: string;
  readonly projectId: string;
  readonly agreementId: string;
  readonly milestoneId: string;
  readonly revision: number;
  readonly submissionIds: readonly string[];
  readonly sourceObjectRefs: readonly string[];
  readonly licenseEvidenceRefs: readonly string[];
  readonly aiUseReceiptRefs: readonly string[];
  readonly checksum: string;
  readonly knownLimitations: readonly string[];
  readonly status: "draft" | "submitted" | "changes-requested" | "accepted" | "superseded";
  readonly submittedByAssignmentId: string;
  readonly submittedAt: string | null;
  readonly acceptedAt: string | null;
}

export interface ProductionInvoice {
  readonly id: string;
  readonly projectId: string;
  readonly agreementId: string;
  readonly milestoneId: string | null;
  readonly issuerPartyId: string;
  readonly recipientPartyId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: "draft" | "issued" | "verified" | "disputed" | "void" | "settled";
  readonly externalInvoiceRef: string | null;
  readonly issuedAt: string | null;
  readonly dueAt: string | null;
}

export interface PaymentRecord {
  readonly id: string;
  readonly projectId: string;
  readonly agreementId: string;
  readonly invoiceId: string;
  readonly payerPartyId: string;
  readonly payeePartyId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status:
    | "recorded-pending-verification"
    | "verified-paid"
    | "failed"
    | "refunded"
    | "cancelled";
  readonly provider: string | null;
  readonly externalPaymentRef: string | null;
  readonly evidenceRefs: readonly string[];
  readonly verifiedByAssignmentId: string | null;
  readonly paidAt: string | null;
  readonly createdAt: string;
}

export interface ProductionDispute {
  readonly id: string;
  readonly projectId: string;
  readonly agreementId: string;
  readonly scope: ScopeRef;
  readonly category:
    | "scope"
    | "quality"
    | "schedule"
    | "payment"
    | "rights"
    | "credit"
    | "conduct"
    | "other";
  readonly openedByPartyId: string;
  readonly respondentPartyIds: readonly string[];
  readonly statement: string;
  readonly evidenceRefs: readonly string[];
  readonly status: "open" | "response" | "mediation" | "resolved" | "closed";
  readonly resolution: string | null;
  readonly openedAt: string;
  readonly resolvedAt: string | null;
}

export type ResourceCalendarExceptionType =
  | "time-off"
  | "holiday"
  | "overtime"
  | "capacity-override";

export interface ResourceCalendarException {
  readonly id: string;
  readonly type: ResourceCalendarExceptionType;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly availableHours: number;
  readonly reason: string;
}

export interface ResourceCalendar {
  readonly id: string;
  readonly projectId: string;
  readonly assignmentId: string;
  readonly timezone: string;
  readonly weeklyHours: number;
  readonly dailyHours: number;
  readonly workingWeekdays: readonly number[];
  readonly exceptions: readonly ResourceCalendarException[];
  readonly revision: number;
  readonly updatedAt: string;
}

export interface ScheduleBaselineItem {
  readonly taskId: string;
  readonly dueAt: string | null;
  readonly assignmentIds: readonly string[];
  readonly estimateLikelyHours: number | null;
}

export interface ScheduleBaseline {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly createdByAssignmentId: string;
  readonly releaseAt: string | null;
  readonly items: readonly ScheduleBaselineItem[];
  readonly active: boolean;
  readonly createdAt: string;
}

export type ReleasePlanStatus =
  | "draft"
  | "preflight"
  | "ready"
  | "scheduled"
  | "published"
  | "failed"
  | "withdrawn";

export interface EpisodeReleasePlan {
  readonly id: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly platformKey: string;
  readonly locale: string;
  readonly timezone: string;
  readonly scheduledAt: string | null;
  readonly status: ReleasePlanStatus;
  readonly title: string;
  readonly description: string;
  readonly thumbnailRevisionRef: string | null;
  readonly sourceSubmissionIds: readonly string[];
  readonly requiredCheckKeys: readonly string[];
  readonly passedCheckKeys: readonly string[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly externalReleaseId: string | null;
  readonly externalUrl: string | null;
  readonly revision: number;
  readonly updatedAt: string;
}

export type ExternalReviewPermission = "view" | "comment" | "approve" | "download";
export type ExternalReviewDecision = "comment" | "approve" | "request-changes";

export interface ExternalReviewResponse {
  readonly id: string;
  readonly reviewerName: string;
  readonly decision: ExternalReviewDecision;
  readonly note: string;
  readonly createdAt: string;
}

export interface ExternalReviewAccess {
  readonly id: string;
  readonly projectId: string;
  readonly scope: ScopeRef;
  readonly label: string;
  readonly tokenDigest: string;
  readonly submissionIds: readonly string[];
  readonly permissions: readonly ExternalReviewPermission[];
  readonly watermark: boolean;
  readonly expiresAt: string;
  readonly status: "active" | "revoked" | "expired";
  readonly createdByAssignmentId: string;
  readonly createdAt: string;
  readonly lastAccessedAt: string | null;
  readonly responses: readonly ExternalReviewResponse[];
}

export type ProductionAutomationTrigger =
  | "task-status-changed"
  | "due-soon"
  | "due-passed"
  | "capacity-exceeded"
  | "release-preflight-failed"
  | "review-opened"
  | "manual";

export interface ProductionAutomationCondition {
  readonly field:
    | "task-status"
    | "process-key"
    | "days-to-due"
    | "episode-state"
    | "load-percent"
    | "release-status";
  readonly operator: "equals" | "not-equals" | "contains" | "gte" | "lte";
  readonly value: string | number;
}

export type ProductionAutomationAction =
  | {
      readonly type: "notify";
      readonly assignmentIds: readonly string[];
      readonly urgency: "info" | "warning" | "critical";
      readonly message: string;
    }
  | {
      readonly type: "create-task";
      readonly title: string;
      readonly processKey: string;
      readonly assignmentIds: readonly string[];
      readonly dueInHours: number;
    }
  | {
      readonly type: "request-status-transition";
      readonly taskStatus: ProductionTaskStatus;
    };

export interface ProductionAutomationRule {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly trigger: ProductionAutomationTrigger;
  readonly conditions: readonly ProductionAutomationCondition[];
  readonly actions: readonly ProductionAutomationAction[];
  readonly failurePolicy: "continue" | "stop" | "require-review";
  readonly enabled: boolean;
  readonly revision: number;
  readonly lastEvaluatedAt: string | null;
  readonly createdByAssignmentId: string;
  readonly updatedAt: string;
}

export interface ProductionNotificationPolicy {
  readonly id: string;
  readonly projectId: string;
  readonly assignmentId: string;
  readonly channels: readonly ("in-app" | "email" | "push" | "webhook")[];
  readonly digest: "immediate" | "daily" | "weekly";
  readonly quietHoursStart: string | null;
  readonly quietHoursEnd: string | null;
  readonly dueSoonHours: number;
  readonly escalationHours: number;
  readonly enabled: boolean;
  readonly updatedAt: string;
}

export interface ProductionNotification {
  readonly id: string;
  readonly projectId: string;
  readonly assignmentId: string | null;
  readonly type:
    | "assignment"
    | "mention"
    | "review"
    | "due-soon"
    | "overdue"
    | "blocker"
    | "release"
    | "automation";
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly urgency: "info" | "warning" | "critical";
  readonly sourceType: string;
  readonly sourceId: string;
  readonly status: "unread" | "read" | "dismissed";
  readonly createdAt: string;
  readonly readAt: string | null;
}

export interface ProductionSavedViewSort {
  readonly field: string;
  readonly direction: "asc" | "desc";
}

export interface ProductionSavedView {
  readonly id: string;
  readonly projectId: string;
  readonly ownerAssignmentId: string | null;
  readonly name: string;
  readonly resource: "tasks" | "episodes" | "reviews" | "schedule" | "portfolio";
  readonly filters: Readonly<Record<string, string>>;
  readonly sort: readonly ProductionSavedViewSort[];
  readonly columns: readonly string[];
  readonly density: "comfortable" | "compact";
  readonly shared: boolean;
  readonly dashboardWidgets: readonly string[];
  readonly updatedAt: string;
}

export interface ProductionAuditEvent {
  readonly id: string;
  readonly projectId: string;
  readonly aggregateRevision: number;
  readonly actorPartyId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly beforeDigest: string | null;
  readonly afterDigest: string | null;
  readonly reason: string | null;
  readonly occurredAt: string;
}

export interface ProductionProjectAggregate {
  readonly modelVersion: typeof PRODUCTION_MODEL_VERSION;
  readonly projectId: string;
  readonly workId: string;
  readonly organizationId: string | null;
  readonly title: string;
  readonly collaborationModel: CollaborationModel;
  readonly revision: number;
  readonly parties: readonly CollaborationParty[];
  readonly assignments: readonly RoleAssignment[];
  readonly authorityRules: readonly DecisionAuthorityRule[];
  readonly charters: readonly CreativeCharter[];
  readonly episodes: readonly EpisodeCollaboration[];
  readonly handoffs: readonly StoryToArtHandoffPackage[];
  readonly clarifications: readonly ClarificationThread[];
  readonly branches: readonly CreativeBranch[];
  readonly mergeRequests: readonly CreativeMergeRequest[];
  readonly reviewPolicies: readonly ReviewPolicy[];
  readonly reviewDecisions: readonly ReviewDecision[];
  readonly tasks: readonly ProductionTask[];
  readonly deliverables: readonly Deliverable[];
  readonly submissions: readonly Submission[];
  readonly studioRevisionLinks?: readonly ProductionStudioRevisionLink[];
  readonly changeRequests: readonly ChangeRequest[];
  readonly scopePackages: readonly ScopePackage[];
  readonly scopePackageRevisionArchive: readonly ScopePackage[];
  readonly scopePackageAddenda: readonly ScopePackageAddendum[];
  readonly contributions: readonly ContributionRecord[];
  readonly creditManifests: readonly CreditManifest[];
  readonly rightsInterests: readonly RightsInterest[];
  readonly compensationPlans: readonly CompensationPlan[];
  readonly projectBriefs: readonly ProjectBrief[];
  readonly seriesMasters: readonly SeriesMaster[];
  readonly seasonPlans: readonly SeasonPlan[];
  readonly episodePlans: readonly EpisodePlan[];
  readonly scenePlans: readonly ScenePlan[];
  readonly cutPlans: readonly CutPlan[];
  readonly planningSnapshots: readonly PlanningSnapshot[];
  readonly assetRequirements: readonly AssetRequirement[];
  readonly riskPolicy: ProductionRiskPolicy;
  readonly riskSignals: readonly ProductionRiskSignal[];
  readonly risks: readonly ProductionRisk[];
  readonly riskResponses: readonly ProductionRiskResponse[];
  readonly riskAssessments: readonly ProductionRiskAssessment[];
  readonly decisions: readonly DecisionRecord[];
  readonly proposals: readonly ProcurementProposal[];
  readonly agreements: readonly ProductionAgreement[];
  readonly changeOrders: readonly ContractChangeOrder[];
  readonly contractMilestones: readonly ContractMilestone[];
  readonly deliveryRevisions: readonly DeliveryRevision[];
  readonly invoices: readonly ProductionInvoice[];
  readonly paymentRecords: readonly PaymentRecord[];
  readonly disputes: readonly ProductionDispute[];
  readonly resourceCalendars?: readonly ResourceCalendar[];
  readonly scheduleBaselines?: readonly ScheduleBaseline[];
  readonly releasePlans?: readonly EpisodeReleasePlan[];
  readonly externalReviewAccesses?: readonly ExternalReviewAccess[];
  readonly automationRules?: readonly ProductionAutomationRule[];
  readonly notificationPolicies?: readonly ProductionNotificationPolicy[];
  readonly notifications?: readonly ProductionNotification[];
  readonly savedViews?: readonly ProductionSavedView[];
  readonly auditEvents: readonly ProductionAuditEvent[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
