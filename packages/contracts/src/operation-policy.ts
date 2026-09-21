/** Operating mode is not a payment mandate or a license grant. */
export type OperatingMode = "free" | "paid";
export type OperationFeature = "team-workspace" | "licensed-assets" | "ai-shading";
export interface WorkspaceLimits {
  readonly ownedWorkspaces: number;
  readonly projectsPerWorkspace: number;
  readonly membersPerWorkspace: number;
}
export interface ModeProfile {
  readonly limits: WorkspaceLimits;
  readonly features: Readonly<Record<OperationFeature, boolean>>;
  readonly notice: string;
}
export interface LicenseReview {
  readonly state: "pending" | "approved" | "blocked";
  readonly approvedModes: readonly OperatingMode[];
  readonly subjectDigest: string;
  readonly evidenceRef: string;
  readonly validUntil: string | null;
}
export interface OperationPolicyDraft {
  readonly schemaVersion: 1;
  readonly mode: OperatingMode;
  readonly profiles: Readonly<Record<OperatingMode, ModeProfile>>;
  readonly releaseReview: LicenseReview;
  readonly featureReviews: Readonly<Record<"licensed-assets" | "ai-shading", LicenseReview>>;
}
export interface OperationPolicyRecord {
  readonly revision: number;
  readonly draft: OperationPolicyDraft;
  readonly updatedAt: string;
}
export interface EffectiveOperationPolicy {
  readonly mode: OperatingMode;
  readonly revision: number;
  readonly limits: WorkspaceLimits;
  readonly features: Readonly<Record<OperationFeature, { readonly enabled: boolean; readonly reason: string | null }>>;
  readonly notice: string;
  /** Workspace service fees only; existing work-contract settlement is a separate system. */
  readonly billing: { readonly state: "disabled"; readonly checkoutEnabled: false; readonly automaticEnrollment: false };
  readonly existingData: "preserve";
}
export interface OperationPolicyPreview {
  readonly expectedRevision: number;
  readonly digest: string;
  readonly blockedReasons: readonly string[];
  readonly effective: EffectiveOperationPolicy;
  readonly changes: readonly string[];
}
export interface OperationPolicyAdminView {
  readonly policy: OperationPolicyRecord;
  readonly effective: EffectiveOperationPolicy;
  readonly runtimeFingerprint: string | null;
  readonly audit: readonly { readonly revision: number; readonly actorUserId: string; readonly reason: string; readonly occurredAt: string }[];
}
const pendingReview = (): LicenseReview => ({ state: "pending", approvedModes: [], subjectDigest: "", evidenceRef: "", validUntil: null });
const profile = (notice: string): ModeProfile => ({
  limits: { ownedWorkspaces: 2, projectsPerWorkspace: 5, membersPerWorkspace: 10 },
  features: { "team-workspace": true, "licensed-assets": false, "ai-shading": false }, notice,
});
export function initialOperationPolicy(): OperationPolicyDraft {
  return { schemaVersion: 1, mode: "free", profiles: {
    free: profile("현재 무료 운영 중입니다. 공통 이용 한도와 작품별 권한이 적용됩니다."),
    paid: profile("유료 운영 정책이 적용됩니다. 별도 동의 없이 요금이 청구되지 않으며 결제는 아직 제공하지 않습니다."),
  }, releaseReview: pendingReview(), featureReviews: { "licensed-assets": pendingReview(), "ai-shading": pendingReview() } };
}
/** Evidence is an operator attestation, not an automated legal opinion. */
export function licenseReviewAllows(review: LicenseReview, mode: OperatingMode, fingerprint: string | null, now: Date): boolean {
  if (review.state !== "approved" || !review.approvedModes.includes(mode) || !fingerprint
    || !/^sha256:[a-f0-9]{64}$/u.test(fingerprint) || review.subjectDigest !== fingerprint
    || !review.evidenceRef.trim() || !Number.isFinite(now.getTime())) return false;
  return review.validUntil === null || (Number.isFinite(Date.parse(review.validUntil)) && Date.parse(review.validUntil) > now.getTime());
}
export function operationTransitionBlockers(draft: OperationPolicyDraft, fingerprint: string | null, now: Date): string[] {
  return draft.mode === "paid" && !licenseReviewAllows(draft.releaseReview, "paid", fingerprint, now)
    ? ["현재 배포물과 일치하는 유료 운영 라이선스 검토 근거가 필요합니다."] : [];
}
export function resolveOperationPolicy(record: OperationPolicyRecord, fingerprint: string | null, now: Date): EffectiveOperationPolicy {
  const { draft, revision } = record;
  const profile = draft.profiles[draft.mode];
  const blockers = operationTransitionBlockers(draft, fingerprint, now);
  const feature = (key: OperationFeature): { enabled: boolean; reason: string | null } => {
    if (!profile.features[key]) return { enabled: false, reason: "운영 설정에서 비활성화되어 있습니다." };
    if (key !== "team-workspace") {
      if (!licenseReviewAllows(draft.featureReviews[key], draft.mode, fingerprint, now)) return { enabled: false, reason: "이 운영 모드의 라이선스 검토가 필요합니다." };
      // Payment/provider/resource adapters are not activated by this configuration.
      return { enabled: false, reason: "제공자·권한 경로의 연동 검증이 아직 완료되지 않았습니다." };
    }
    return blockers.length ? { enabled: false, reason: blockers[0] } : { enabled: true, reason: null };
  };
  return { mode: draft.mode, revision, limits: { ...profile.limits },
    features: { "team-workspace": feature("team-workspace"), "licensed-assets": feature("licensed-assets"), "ai-shading": feature("ai-shading") },
    notice: profile.notice, billing: { state: "disabled", checkoutEnabled: false, automaticEnrollment: false }, existingData: "preserve" };
}
