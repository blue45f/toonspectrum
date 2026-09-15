import type {
  ChangeRequest,
  ClarificationThread,
  AssetRequirement,
  CompensationPlan,
  ContractChangeOrder,
  ContractMilestone,
  ContributionRecord,
  CreditManifest,
  CutPlan,
  DecisionRecord,
  DeliveryRevision,
  CreativeBranch,
  CreativeCharter,
  CreativeMergeRequest,
  DecisionAuthorityRule,
  Deliverable,
  EpisodeCollaboration,
  EpisodePlan,
  PaymentRecord,
  ProcurementProposal,
  ProductionAgreement,
  ProductionDispute,
  ProductionInvoice,
  ProductionProjectAggregate,
  ProductionRisk,
  ProjectBrief,
  ProductionTask,
  ReviewDecision,
  ReviewPolicy,
  ScenePlan,
  SeasonPlan,
  SeriesMaster,
  RightsInterest,
  RoleAssignment,
  ScopePackage,
  Submission,
  StoryToArtHandoffPackage,
  CollaborationParty,
} from "@toonspectrum/core/production";

import { api } from "@/infrastructure/api";

export type ProductionPlanningRecord =
  | { readonly kind: "project-brief"; readonly value: ProjectBrief }
  | { readonly kind: "series-master"; readonly value: SeriesMaster }
  | { readonly kind: "season-plan"; readonly value: SeasonPlan }
  | { readonly kind: "episode-plan"; readonly value: EpisodePlan }
  | { readonly kind: "scene-plan"; readonly value: ScenePlan }
  | { readonly kind: "cut-plan"; readonly value: CutPlan }
  | { readonly kind: "asset-requirement"; readonly value: AssetRequirement }
  | { readonly kind: "risk"; readonly value: ProductionRisk }
  | { readonly kind: "decision"; readonly value: DecisionRecord };

export type ProductionCommercialRecord =
  | { readonly kind: "proposal"; readonly value: ProcurementProposal }
  | { readonly kind: "agreement"; readonly value: ProductionAgreement }
  | { readonly kind: "change-order"; readonly value: ContractChangeOrder }
  | { readonly kind: "milestone"; readonly value: ContractMilestone }
  | { readonly kind: "delivery-revision"; readonly value: DeliveryRevision }
  | { readonly kind: "invoice"; readonly value: ProductionInvoice }
  | { readonly kind: "payment"; readonly value: PaymentRecord }
  | { readonly kind: "dispute"; readonly value: ProductionDispute };

export interface ProductionProjectAccess {
  readonly view: boolean;
  readonly comment: boolean;
  readonly edit: boolean;
  readonly manage: boolean;
  readonly owner: boolean;
  readonly role: "owner" | "admin" | "editor" | "commenter" | "viewer" | null;
}

export interface ProductionProjectRecord {
  readonly aggregate: ProductionProjectAggregate;
  readonly access: ProductionProjectAccess;
}

export interface ProductionMutationResponse {
  readonly aggregate: ProductionProjectAggregate;
  readonly derived?: unknown;
}

export type ProductionClientCommand =
  | { readonly type: "upsert-planning-record"; readonly record: ProductionPlanningRecord }
  | { readonly type: "create-planning-snapshot"; readonly snapshot: Omit<import("@toonspectrum/core/production").PlanningSnapshot, "digest"> }
  | { readonly type: "upsert-commercial-record"; readonly record: ProductionCommercialRecord }
  | {
      readonly type: "configure-collaboration";
      readonly parties: readonly CollaborationParty[];
      readonly assignments: readonly RoleAssignment[];
      readonly authorityRules: readonly DecisionAuthorityRule[];
      readonly charter?: CreativeCharter;
    }
  | { readonly type: "upsert-episode"; readonly episode: EpisodeCollaboration }
  | { readonly type: "upsert-handoff"; readonly handoff: StoryToArtHandoffPackage }
  | { readonly type: "upsert-clarification"; readonly clarification: ClarificationThread }
  | { readonly type: "upsert-branch"; readonly branch: CreativeBranch }
  | { readonly type: "upsert-merge-request"; readonly mergeRequest: CreativeMergeRequest }
  | { readonly type: "upsert-deliverable"; readonly deliverable: Deliverable }
  | { readonly type: "upsert-submission"; readonly submission: Submission }
  | { readonly type: "upsert-review-policy"; readonly policy: ReviewPolicy }
  | { readonly type: "record-review-decision"; readonly policyId: string; readonly decision: ReviewDecision }
  | { readonly type: "upsert-task"; readonly task: ProductionTask }
  | {
      readonly type: "upsert-change-request";
      readonly request: ChangeRequest;
      readonly impactHints?: {
        readonly affectedApprovalIds?: readonly string[];
        readonly touchesDialogue?: boolean;
        readonly touchesCanon?: boolean;
        readonly touchesVisualAsset?: boolean;
        readonly touchesRightsMetadata?: boolean;
        readonly agreementScoped?: boolean;
      };
    }
  | { readonly type: "publish-scope-package"; readonly scopePackage: Omit<ScopePackage, "digest"> }
  | {
      readonly type: "amend-scope-package";
      readonly previousPackageId: string;
      readonly replacement: Omit<ScopePackage, "digest">;
      readonly addendumId: string;
      readonly reason: string;
      readonly createdAt: string;
    }
  | { readonly type: "upsert-contribution"; readonly contribution: ContributionRecord }
  | {
      readonly type: "upsert-credit-manifest";
      readonly manifest: CreditManifest;
      readonly requiredApproverAssignmentIds?: readonly string[];
    }
  | { readonly type: "upsert-rights-interest"; readonly interest: RightsInterest }
  | { readonly type: "upsert-compensation-plan"; readonly plan: CompensationPlan };

function mutationId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`;
}

export function getProductionProject(projectId: string): Promise<ProductionProjectRecord> {
  return api.get(`/production/projects/${encodeURIComponent(projectId)}`);
}

export function getProductionProjectByWork(workId: string): Promise<ProductionProjectRecord> {
  return api.get(`/production/works/${encodeURIComponent(workId)}/project`);
}

export function createProductionProject(input: {
  readonly projectId: string;
  readonly workId: string;
  readonly organizationId?: string | null;
  readonly title: string;
  readonly collaborationModel:
    | "solo"
    | "co-creator"
    | "story-led-commission"
    | "art-led-commission"
    | "adaptation"
    | "studio-production"
    | "anthology"
    | "replacement";
  readonly ownerPartyId: string;
  readonly ownerDisplayName: string;
}): Promise<ProductionMutationResponse> {
  return api.post("/production/projects", {
    ...input,
    clientMutationId: mutationId(),
  });
}

export function executeProductionCommand(
  projectId: string,
  expectedRevision: number,
  command: ProductionClientCommand,
): Promise<ProductionMutationResponse> {
  return api.post(`/production/projects/${encodeURIComponent(projectId)}/commands`, {
    expectedRevision,
    mutationId: mutationId(),
    command,
  });
}
