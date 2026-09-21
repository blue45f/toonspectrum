import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonspectrum/contracts/security/csrf";

import type { OperationPolicyAdminView, OperationPolicyDraft, OperationPolicyPreview } from "@toonspectrum/contracts/operation-policy";

const root = "/api/admin/production/operation-policy";
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${root}${path}`, {
    method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
    headers: body === undefined ? {} : { "Content-Type": "application/json", [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
      ? payload.message : "설정을 처리하지 못했습니다. 관리자 로그인과 연결을 확인해주세요.";
    throw new Error(message);
  }
  return payload as T;
}
export const loadOperationPolicy = (): Promise<OperationPolicyAdminView> => request("");
export const previewOperationPolicy = (expectedRevision: number, draft: OperationPolicyDraft): Promise<OperationPolicyPreview> =>
  request("/preview", { expectedRevision, draft });
export const applyOperationPolicy = (expectedRevision: number, draft: OperationPolicyDraft, previewDigest: string, reason: string, mutationId: string): Promise<{ acceptedRevision: number }> =>
  request("/apply", { expectedRevision, draft, previewDigest, reason, mutationId });
