export const STUDIO_IP_MEDIA = [
  "webtoon",
  "web-novel",
  "film",
  "series",
  "animation",
  "game",
  "audio-drama",
  "merchandise",
] as const;
export type StudioIpMedia = (typeof STUDIO_IP_MEDIA)[number];

export type StudioIpRightsStatus = "owned" | "co-owned" | "represented" | "unknown";
export type StudioIpAvailability = "available" | "optioned" | "licensed" | "not-offered" | "unknown";
export type StudioIpInquiryStatus = "new" | "reviewing" | "meeting" | "negotiating" | "closed";

export interface StudioIpInquiry {
  readonly id: string;
  readonly company: string;
  readonly contact: string;
  readonly media: StudioIpMedia;
  readonly territory: string;
  readonly status: StudioIpInquiryStatus;
  readonly note: string;
  readonly createdAt: string;
}

export interface StudioIpOpportunityDocument {
  readonly version: 1;
  readonly projectId: string;
  readonly rightsStatus: StudioIpRightsStatus;
  readonly availability: StudioIpAvailability;
  readonly availableMedia: readonly StudioIpMedia[];
  readonly territories: readonly string[];
  readonly contributorAgreementsComplete: boolean;
  readonly sourceRightsVerified: boolean;
  readonly assetRightsVerified: boolean;
  readonly logline: string;
  readonly synopsis: string;
  readonly audience: string;
  readonly comparableTitles: string;
  readonly creatorBio: string;
  readonly contact: string;
  readonly inquiries: readonly StudioIpInquiry[];
}

export interface StudioIpReadinessReport {
  readonly status: "ready" | "review" | "blocked";
  readonly score: number;
  readonly issues: readonly string[];
}

export function createStudioIpOpportunityDocument(projectId: string): StudioIpOpportunityDocument {
  return Object.freeze({
    version: 1,
    projectId,
    rightsStatus: "unknown",
    availability: "available",
    availableMedia: Object.freeze(["film", "series", "animation"]),
    territories: Object.freeze(["worldwide"]),
    contributorAgreementsComplete: false,
    sourceRightsVerified: false,
    assetRightsVerified: false,
    logline: "",
    synopsis: "",
    audience: "",
    comparableTitles: "",
    creatorBio: "",
    contact: "",
    inquiries: Object.freeze([]),
  });
}

export function ipOpportunityStorageKey(projectId: string): string {
  return `toonstudio:ip-opportunity:v1:${encodeURIComponent(projectId)}`;
}

export function evaluateStudioIpReadiness(document: StudioIpOpportunityDocument): StudioIpReadinessReport {
  const issues: string[] = [];
  let score = 0;

  if (document.rightsStatus === "unknown") issues.push("rights-status-unknown");
  else score += 20;
  if (!document.sourceRightsVerified) issues.push("source-rights-unverified");
  else score += 15;
  if (!document.contributorAgreementsComplete) issues.push("contributor-agreements-incomplete");
  else score += 15;
  if (!document.assetRightsVerified) issues.push("asset-rights-unverified");
  else score += 10;
  if (!document.logline.trim()) issues.push("logline-missing");
  else score += 10;
  if (!document.synopsis.trim()) issues.push("synopsis-missing");
  else score += 10;
  if (!document.audience.trim()) issues.push("audience-missing");
  else score += 5;
  if (!document.creatorBio.trim()) issues.push("creator-bio-missing");
  else score += 5;
  if (!document.contact.trim()) issues.push("contact-missing");
  else score += 5;
  if (document.availableMedia.length === 0) issues.push("media-rights-not-selected");
  else score += 5;

  const blockers = new Set([
    "rights-status-unknown",
    "source-rights-unverified",
    "contributor-agreements-incomplete",
  ]);
  return Object.freeze({
    status: issues.some((issue) => blockers.has(issue)) ? "blocked" : issues.length > 0 ? "review" : "ready",
    score,
    issues: Object.freeze(issues),
  });
}

export function createStudioIpInquiry(
  input: Omit<StudioIpInquiry, "id" | "createdAt" | "status"> & { readonly status?: StudioIpInquiryStatus },
  now = new Date(),
): StudioIpInquiry {
  const seed = now.getTime().toString(36);
  return Object.freeze({
    ...input,
    id: `ip-inquiry-${seed}`,
    status: input.status ?? "new",
    createdAt: now.toISOString(),
  });
}
