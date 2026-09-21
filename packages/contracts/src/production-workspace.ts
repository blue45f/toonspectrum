/** Free-only team organization contracts; unrelated to a per-work production board. */
export type TeamWorkspaceRole = "owner" | "admin" | "member" | "guest";
export type InvitableWorkspaceRole = Exclude<TeamWorkspaceRole, "owner">;
export const FREE_USAGE_POLICY = Object.freeze({
  version: "free-operations-v1.1",
  ownedWorkspaces: 2, projectsPerWorkspace: 5, membersPerWorkspace: 10,
  workspaceOriginalBytes: 2 * 1024 ** 3, ownerOriginalBytes: 4 * 1024 ** 3,
  imageBytes: 50 * 1024 ** 2, imagePixels: 25_000_000,
  pdfBytes: 50 * 1024 ** 2, pdfPages: 100,
  comparisonViews: 4, sideViews: 2, queuedJobs: 5,
  runningJobs: 1, dailyExports: 20, activeShares: 20, defaultShareDays: 7,
});
export type FreeUsagePolicy = { readonly [K in keyof typeof FREE_USAGE_POLICY]: K extends "version" ? string : number };
export interface TeamWorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly revision: number;
  readonly role: TeamWorkspaceRole;
  readonly createdAt: string;
  readonly projectCount: number;
  readonly memberCount: number;
  readonly pendingInvites: number;
}
export interface TeamWorkspaceMember {
  readonly userId: string;
  readonly displayName: string;
  readonly role: TeamWorkspaceRole;
  readonly joinedAt: string;
}
export interface TeamWorkspaceInvite {
  readonly id: string;
  readonly email: string;
  readonly role: InvitableWorkspaceRole;
  readonly expiresAt: string;
}
export interface TeamWorkspaceProject {
  readonly id: string;
  readonly workId: string;
  readonly title: string;
}
export interface TeamWorkspaceDetail {
  readonly workspace: TeamWorkspaceSummary;
  readonly projects: readonly TeamWorkspaceProject[];
  readonly members: readonly TeamWorkspaceMember[];
  readonly invites: readonly TeamWorkspaceInvite[];
}
export interface WorkspaceUsageResponse {
  readonly policy: FreeUsagePolicy;
  readonly workspaceId: string;
  readonly operationMode: "free" | "paid";
  readonly policyRevision: number;
  readonly counters: {
    readonly ownedWorkspaces: number;
    readonly projects: number;
    readonly members: number;
    readonly pendingInvites: number;
  };
  /** Unknown is not zero. Media accounting requires its own release gate. */
  readonly originalStorage: { readonly status: "not-instrumented"; readonly usedBytes: null };
  readonly nextDailyResetAt: string;
  readonly externalAiEnabled: false;
  readonly meteredProvidersEnabled: false;
}
export interface WorkspaceMutationResult {
  readonly workspaceId: string;
  readonly revision: number;
  readonly invitationId?: string;
  /** Returned once only; a replay never returns a stored plaintext token. */
  readonly token?: string;
  readonly delivery?: "manual-link";
  readonly expiresAt?: string;
}
export function nextSeoulDay(now: Date): string {
  const value = now.getTime();
  if (!Number.isFinite(value)) throw new RangeError("Invalid date");
  const offset = 9 * 60 * 60 * 1000;
  return new Date(Math.floor((value + offset) / 86_400_000) * 86_400_000 + 86_400_000 - offset).toISOString();
}
export function isWorkspaceManager(role: TeamWorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}
export type TeamWorkspaceCommandInput =
  | { readonly type: "rename"; readonly name: string }
  | { readonly type: "invite"; readonly email: string; readonly role: InvitableWorkspaceRole }
  | { readonly type: "revoke-invite"; readonly invitationId: string }
  | { readonly type: "change-member-role"; readonly userId: string; readonly role: InvitableWorkspaceRole }
  | { readonly type: "remove-member"; readonly userId: string }
  | { readonly type: "transfer-owner"; readonly userId: string }
  | { readonly type: "attach-project"; readonly projectId: string }
  | { readonly type: "detach-project"; readonly projectId: string };
