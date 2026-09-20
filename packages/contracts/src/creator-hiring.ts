/** Browser/server hiring DTOs. Team membership never grants document access. */
export const CREATOR_HIRING_ROLES = {
  story: "글·각색", storyboard: "콘티", lineart: "선화", flats: "밑색",
  color: "채색·명암", background: "배경", scene3d: "3D 배치", effects: "효과·보정",
  lettering: "식자", review: "검수", localization: "번역·현지화", producer: "제작 관리", assistant: "어시스트",
} as const;
export type CreatorHiringRole = keyof typeof CREATOR_HIRING_ROLES;
export const CREATOR_HIRING_MODELS = {
  employment: "고용", "freelance-task": "유급 작업 의뢰",
  "co-creation": "공동 창작", "partial-collaboration": "단기·부분 협업",
} as const;
export type CreatorHiringModel = keyof typeof CREATOR_HIRING_MODELS;
export type HiringRateUnit = "hour" | "cut" | "episode" | "task";
export interface HiringPortfolioLink { title: string; url: string; contribution: string; permission: "owned" | "authorized"; }
export const HIRING_TOOLS = ["Clip Studio Paint", "Photoshop", "Procreate", "Blender", "SketchUp", "ToonStudio", "Illustrator", "Krita", "After Effects", "Excel", "Google Docs", "기타"] as const;
export const HIRING_FORMATS = ["PSD", "PSB", "CLIP", "PNG", "JPEG", "TIFF", "WEBP", "SVG", "PDF", "BLEND", "GLB", "FBX", "TXT", "DOCX", "기타"] as const;
export interface HiringExperience { title: string; role: CreatorHiringRole; startMonth: string; endMonth: string | null; episodeFrom: number | null; episodeTo: number | null; contribution: string; }
export interface HiringResumeContent {
  penName: string; summary: string; roles: CreatorHiringRole[];
  tools: string[]; formats: string[]; languages: string[];
  experiences: HiringExperience[]; portfolio: HiringPortfolioLink[];
}
export interface HiringResumeInput { title: string; content: HiringResumeContent; expectedRevision: number; }
export interface HiringResumeVersion { id: string; resumeId: string; revision: number; content: HiringResumeContent; createdAt: string; }
export interface HiringResume { id: string; title: string; revision: number; currentVersion: HiringResumeVersion; updatedAt: string; submissionBlocked: boolean; }
export interface HiringSubmissionInput {
  resumeVersionId: string; portfolioIndexes: number[]; message: string; contact: string;
  consentRevision: "2026-09-20"; expectedPostVersion: number; mutationId: string;
}
export interface HiringApplicationSnapshot {
  id: string; applicationId: string; resumeVersionId: string | null; resumeRevision: number;
  content: HiringResumeContent | null; submittedAt: string; redactedAt: string | null; redactionReason: string | null;
}
export interface HiringAvailabilityInput {
  startsAt: string; endsAt: string; roles: CreatorHiringRole[]; tools: string[]; formats: string[];
  capacity: number; minRate: number; rateUnit: HiringRateUnit;
  discoverable: boolean; notificationOptIn: boolean; expectedRevision: number;
}
export interface HiringAvailability extends HiringAvailabilityInput {
  userId: string; revision: number; confirmedAt: string; expiresAt: string; valid: boolean;
}
export interface HiringCandidate {
  userId: string; displayName: string; roles: CreatorHiringRole[]; tools: string[]; formats: string[];
  startsAt: string; endsAt: string; confirmedAt: string; expiresAt: string;
  capacity: number; minRate: number; rateUnit: HiringRateUnit; reasons: string[];
}
/** A live, owner-only page. Counts describe this page, not the entire talent pool. */
export interface HiringCandidatePage {
  items: HiringCandidate[]; limit: 30; ordering: "account-id";
  next: string | null; termsRevision: number; observedAt: string;
}
export interface HiringCandidateQuery { after?: string; expectedRevision?: number; }
export interface HiringSlotTerms {
  model: CreatorHiringModel; role: CreatorHiringRole; publicScope: string;
  quantity: number; quantityUnit: "cut" | "episode" | "page" | "task";
  startsAt: string; dueAt: string; timeZone: string;
  compensation: "paid" | "unpaid" | "revenue-share"; currency: "KRW";
  minRate: number; maxRate: number; rateUnit: HiringRateUnit; tools: string[]; formats: string[];
  revisionRounds: number; acceptanceCriteria: string; ndaRequired: boolean; creditPolicy: string;
  portfolioPolicy: "allowed" | "approval-required" | "prohibited";
  aiPolicy: "allowed" | "approval-required" | "prohibited";
}
export type HiringSlotState = "open" | "matching" | "reserved" | "filled" | "paused" | "cancelled";
export interface HiringSlot { id: string; postId: string; revision: number; state: HiringSlotState; terms: HiringSlotTerms; createdAt: string; }
export type HiringOfferState = "pending" | "accepted" | "declined" | "cancelled" | "expired";
export interface HiringOffer {
  id: string; slotId: string; postId: string; candidateId: string; recruiterId: string;
  termsRevision: number; terms: HiringSlotTerms; state: HiringOfferState; expiresAt: string; createdAt: string;
  commitmentId: string | null; onboardingStatus: "not-started" | "pending" | "cancelled";
}
export interface HiringAcceptance {
  offerId: string; commitmentId: string; holdExpiresAt: string;
  onboardingStatus: "pending"; documentAccessGranted: false;
}
export interface HiringInvitation {
  id: string; slotId: string; postId: string; title: string; role: CreatorHiringRole;
  state: "unread" | "read" | "interested" | "declined" | "expired" | "cancelled";
  expiresAt: string; createdAt: string;
}
export interface HiringCampaign {
  slotId: string; round: number; state: "active" | "completed" | "stopped" | "exhausted";
  nextDispatchAt: string | null; invitedCount: number; automaticDispatchEnabled: boolean;
}
export interface CreatorTeam {
  id: string; name: string; ownerId: string; revision: number;
  myRole: "owner" | "member"; memberCount: number;
}
export interface CreatorTeamMember {
  userId: string; displayName: string; role: "owner" | "member";
  status: "invited" | "active" | "left"; inviteExpiresAt: string | null;
}
export interface CreatorTeamGroup { id: string; teamId: string; name: string; memberIds: string[]; }
export interface CreatorTeamInvite { teamId: string; teamName: string; expiresAt: string; revision: number; }
export interface CreatorRoom {
  id: string; title: string; kind: "interview" | "meeting"; hostId: string;
  teamId: string | null; applicationId: string | null; startsAt: string; endsAt: string;
  status: "scheduled" | "live" | "ended"; epoch: number;
  myStatus: "invited" | "waiting" | "admitted" | "removed" | "left";
  participants: CreatorRoomParticipant[];
  media: { status: "not-configured"; recordingEnabled: false; transcriptionEnabled: false };
}
export interface CreatorRoomParticipant {
  userId: string; displayName: string; role: "host" | "guest";
  status: "invited" | "waiting" | "admitted" | "removed" | "left";
}
export interface CreatorRoomMessage { id: string; userId: string; displayName: string; text: string; createdAt: string; }
export interface CreatorRoomInput {
  title: string; kind: "interview" | "meeting"; applicationId: string | null;
  teamId: string | null; participantIds: string[]; startsAt: string; endsAt: string;
}
export interface CreatorCareerInput {
  title: string; role: CreatorHiringRole; startMonth: string; endMonth: string | null; episodeFrom: number | null; episodeTo: number | null; scope: string; contribution: string;
  portfolioUrl: string; rights: "pending" | "owned" | "authorized";
  visibility: "private" | "public"; expectedRevision: number;
}
export interface CreatorCareerItem extends CreatorCareerInput {
  id: string; userId: string; displayName: string; revision: number;
  proof: "self-declared"; updatedAt: string; currentVersionId: string;
}

export interface CreatorCareerVersion { id: string; careerId: string; revision: number; content: Omit<CreatorCareerInput, "expectedRevision">; createdAt: string; }
export interface CreatorActivitySummary { points: number; level: number; label: string; events: { id: string; kind: "award" | "reversal"; points: number; occurredAt: string }[]; hiringEffect: false; verificationEffect: false; }
export type CreatorCareerPublic = Pick<CreatorCareerItem, "id" | "displayName" | "title" | "role" | "startMonth" | "endMonth" | "episodeFrom" | "episodeTo" | "scope" | "contribution" | "portfolioUrl" | "proof">;
/** Public projection of an existing post's published one-person slot. */
export interface HiringPublicPosition {
  id: string;
  postId: string;
  postTitle: string;
  revision: number;
  terms: HiringSlotTerms;
}
export interface HiringPositionPage { items: HiringPublicPosition[]; next: string | null; }
