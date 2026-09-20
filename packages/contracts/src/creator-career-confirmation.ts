import type { CreatorCareerVersion } from "./creator-hiring";

/** A teammate's explicit statement about one immutable self-declared version. */
export type CareerConfirmationState = "requested" | "confirmed" | "declined" | "revoked" | "expired";
export interface CareerConfirmationSelection {
  careerId: string;
  versionId: string;
  teamId: string;
  targetAccountId: string;
}
export interface CareerConfirmationPreview extends CareerConfirmationSelection {
  snapshot: CreatorCareerVersion["content"];
  sourceDigest: string;
  versionRevision: number;
  requesterMembershipRevision: number;
  targetMembershipRevision: number;
  targetName: string;
}
export interface CareerConfirmationRequestInput extends CareerConfirmationSelection {
  sourceDigest: string;
  requesterMembershipRevision: number;
  targetMembershipRevision: number;
  consent: "exact-version-2026-09-20";
  mutationId: string;
}
export interface CareerConfirmationActionInput {
  action: "confirmed" | "declined" | "revoked";
  expectedRevision: number;
  mutationId: string;
}
export interface CareerConfirmationReceipt {
  id: string;
  state: CareerConfirmationState;
  revision: number;
}
export interface CareerConfirmationRequest extends CareerConfirmationReceipt {
  careerId: string;
  versionId: string;
  versionRevision: number;
  direction: "sent" | "received";
  counterpartName: string;
  snapshot: CreatorCareerVersion["content"] | null;
  sourceDigest: string;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  unavailableReason: string | null;
  canRespond: boolean;
  canRevoke: boolean;
}
export interface CareerConfirmationCollaborator {
  teamId: string;
  teamName: string;
  targetAccountId: string;
  displayName: string;
}
export interface CareerConfirmationPage<T> { items: T[]; nextCursor: string | null; }
/** Never contains the private request, teammate, team, evidence URL or contact. */
export interface CareerConfirmationPublicSummary {
  careerId: string;
  publicDigest: string;
  tier: "counterparty-confirmed";
  confirmedAt: string;
  expiresAt: string;
  scope: string;
  contribution: string;
  startMonth: string;
  endMonth: string | null;
}

/** Includes every displayed career field; excludes names and all private audience data. */
export function careerConfirmationPublicContent(content: Pick<CreatorCareerVersion["content"], "title" | "role" | "startMonth" | "endMonth" | "episodeFrom" | "episodeTo" | "scope" | "contribution" | "portfolioUrl">): string {
  return JSON.stringify([content.title, content.role, content.startMonth, content.endMonth, content.episodeFrom, content.episodeTo, content.scope, content.contribution, content.portfolioUrl]);
}
