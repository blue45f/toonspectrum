import { requestAdminJson } from "../../../../platform/http/admin-api";

import type { OperationPolicyAdminView, OperationPolicyDraft, OperationPolicyPreview } from "@toonspectrum/contracts/operation-policy";

const root = "/api/admin/production/operation-policy";

export const loadOperationPolicy = (): Promise<OperationPolicyAdminView> =>
  requestAdminJson(root);

export const previewOperationPolicy = (
  expectedRevision: number,
  draft: OperationPolicyDraft,
): Promise<OperationPolicyPreview> =>
  requestAdminJson(`${root}/preview`, { body: { expectedRevision, draft } });

export const applyOperationPolicy = (
  expectedRevision: number,
  draft: OperationPolicyDraft,
  previewDigest: string,
  reason: string,
  mutationId: string,
): Promise<{ acceptedRevision: number }> =>
  requestAdminJson(`${root}/apply`, {
    body: { expectedRevision, draft, previewDigest, reason, mutationId },
  });
