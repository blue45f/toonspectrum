import { api } from "@/infrastructure/api";

export type ProductionCollaborationModel =
  | "solo"
  | "co-creator"
  | "story-led-commission"
  | "art-led-commission"
  | "adaptation"
  | "studio-production"
  | "anthology"
  | "replacement";

export interface ProductionProjectAccess {
  readonly view: boolean;
  readonly comment: boolean;
  readonly edit: boolean;
  readonly manage: boolean;
  readonly owner: boolean;
  readonly role: "owner" | "admin" | "editor" | "commenter" | "viewer" | null;
}

export interface ProductionProjectSummary {
  readonly projectId: string;
  readonly workId: string;
  readonly title: string;
  readonly collaborationModel: ProductionCollaborationModel;
  readonly revision: number;
  readonly updatedAt: string;
  readonly access: ProductionProjectAccess;
  readonly healthScore: number;
  readonly activeEpisodeCount: number;
  readonly readyBufferCount: number;
  readonly criticalRiskCount: number;
  readonly overdueTaskCount: number;
  readonly blockedTaskCount: number;
  readonly unassignedTaskCount: number;
  readonly reviewTaskCount: number;
  readonly nextReleaseAt: string | null;
  readonly forecastFinishAt: string | null;
  readonly scheduleConfidencePercent: number | null;
}

export interface ProductionProjectListResponse {
  readonly projects: readonly ProductionProjectSummary[];
}

export interface ProductionPersonalInboxItem {
  readonly bucket: "dueToday" | "inProgress" | "review" | "ready" | "waitingInput" | "blockingOthers";
  readonly projectId: string;
  readonly projectTitle: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly processKey: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly estimateHours: number;
  readonly episodeId: string | null;
}
export interface ProductionPersonalInboxResponse {
  readonly items: readonly ProductionPersonalInboxItem[];
  readonly counts: Readonly<Record<ProductionPersonalInboxItem["bucket"], number>>;
}

export function listProductionProjects(): Promise<ProductionProjectListResponse> {
  return api.get("/production/projects");
}

export function getProductionPersonalInbox(): Promise<ProductionPersonalInboxResponse> {
  return api.get("/production/inbox");
}
