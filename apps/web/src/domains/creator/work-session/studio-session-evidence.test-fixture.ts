import { createStudioWorkSession, type StudioWorkSessionView } from "@toonspectrum/studio-project-model/work-session";
import type { StudioSessionEvidenceResponse } from "@toonspectrum/studio-project-model/work-session-evidence";

export const evidenceTestDigest = "a".repeat(64);
export const evidenceTestSource = { version: 1 as const, sourceServerRevision: 4, sourceContentDigest: evidenceTestDigest, pageOrdinal: 0, pageId: "page-1" };
export function evidenceTestView(): StudioWorkSessionView {
  const session = createStudioWorkSession({ id: "session", operationId: "create", title: "검토 세션", purpose: "제출본 기록 검토", kind: "review", invitedUserIds: [],
    input: { schemaVersion: 1, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: evidenceTestDigest } },
    { userId: "host", canEdit: true, canComment: true }, "2026-09-21T10:00:00.000Z");
  return { session, capabilities: { edit: true, comment: true } };
}
export function evidenceTestResponse(): StudioSessionEvidenceResponse {
  return { workId: "work", sessionId: "session", inputDigest: evidenceTestDigest, offset: 0, nextOffset: 25,
    expiresAt: new Date(Date.now() + 15_000).toISOString(),
    evidence: { version: 1, sourceContentDigest: evidenceTestDigest, sourceServerRevision: 4,
      omittedAssets: 0, omittedAiOperations: 0, invalidEntries: 0,
      assets: [{ source: { ...evidenceTestSource, elementId: "image-1" }, name: "실제 제출본 소재", kind: "local", assetId: null,
        licenseLabel: null, attribution: null, commercialUse: "unknown", nativeSceneKind: null },
        { source: { ...evidenceTestSource, elementId: "scene-1" }, name: "제출된 3D 장면", kind: "native-3d", assetId: null,
        licenseLabel: "작성자가 입력한 조건", attribution: null, commercialUse: "allowed", nativeSceneKind: "background3d" }],
      aiOperations: [{ id: "ai-1", kind: "text", status: "failed", provider: "기록된 제공자", model: "기록된 모델", transport: "local",
        createdAt: "2026-09-20T00:00:00.000Z", promptDigest: null, target: evidenceTestSource, targetStatus: "mapped", usage: { promptTokens: 0 } }] } };
}
