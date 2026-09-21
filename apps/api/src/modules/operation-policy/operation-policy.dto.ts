import { z } from "zod";

const mode = z.enum(["free", "paid"]);
const limits = z.object({
  ownedWorkspaces: z.number().int().min(1).max(100),
  projectsPerWorkspace: z.number().int().min(1).max(1000),
  membersPerWorkspace: z.number().int().min(1).max(1000),
}).strict();
const profile = z.object({ limits, features: z.object({
  "team-workspace": z.boolean(), "licensed-assets": z.boolean(), "ai-shading": z.boolean(),
}).strict(), notice: z.string().trim().min(1).max(500) }).strict();
const review = z.object({
  state: z.enum(["pending", "approved", "blocked"]),
  approvedModes: z.array(mode).max(2).refine((items) => new Set(items).size === items.length),
  subjectDigest: z.string().max(71).refine((value) => value === "" || /^sha256:[a-f0-9]{64}$/u.test(value)),
  evidenceRef: z.string().trim().max(512),
  validUntil: z.iso.datetime({ offset: true }).nullable(),
}).strict().superRefine((value, context) => {
  if (value.state === "approved" && (!value.approvedModes.length || !value.subjectDigest || !value.evidenceRef)) {
    context.addIssue({ code: "custom", message: "승인에는 운영 모드·배포물 digest·검토 근거가 필요합니다." });
  }
});
export const OperationPolicyDraftSchema = z.object({
  schemaVersion: z.literal(1), mode,
  profiles: z.object({ free: profile, paid: profile }).strict(), releaseReview: review,
  featureReviews: z.object({ "licensed-assets": review, "ai-shading": review }).strict(),
}).strict();
export const PreviewOperationPolicySchema = z.object({
  expectedRevision: z.number().int().min(0).max(2_147_483_646), draft: OperationPolicyDraftSchema,
}).strict();
export const ApplyOperationPolicySchema = PreviewOperationPolicySchema.extend({
  mutationId: z.string().uuid(), previewDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  reason: z.string().trim().min(5).max(500),
}).strict();
export type OperationPolicyProposal = z.infer<typeof PreviewOperationPolicySchema>;
export type OperationPolicyApply = z.infer<typeof ApplyOperationPolicySchema>;
