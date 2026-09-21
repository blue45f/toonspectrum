import { canonicalJson } from "@toonspectrum/studio-project-model";
import type { StudioSessionEvidence } from "@toonspectrum/studio-project-model/work-session-evidence";

/** An explicit citation, not an AI execution, manuscript edit, approval, or billing attestation. */
export function studioSessionEvidenceNote(evidence: StudioSessionEvidence, operation: StudioSessionEvidence["aiOperations"][number]): string {
  if (!evidence.aiOperations.some((item) => canonicalJson(item) === canonicalJson(operation))) throw new Error("Unknown pinned evidence record");
  return [
    "제출본 보존 AI 기록 / AI record preserved in the submitted snapshot",
    `제출본 / Source: r${evidence.sourceServerRevision} · ${evidence.sourceContentDigest}`,
    `작업 / Operation: ${operation.id} · ${operation.status}`,
    `제공자·모델 / Provider·model: ${operation.provider} / ${operation.model} (${operation.transport})`,
    `기록 시각 / Recorded at: ${operation.createdAt}`,
    `프롬프트 해시 / Prompt hash: ${operation.promptDigest ?? "unknown"}`,
    `대상 / Target: ${operation.target ? `${operation.target.pageId} / ${operation.target.frameId ?? operation.target.elementId ?? "page"}` : operation.targetStatus}`,
    `보고된 토큰 / Reported tokens: input=${operation.usage?.promptTokens ?? "unknown"}, output=${operation.usage?.completionTokens ?? "unknown"}, total=${operation.usage?.totalTokens ?? "unknown"}`,
    "제공자 영수증·실제 비용·전체 입력·출력 변경은 미검증. 편집 반영 또는 승인 기록이 아닙니다.",
    "Provider receipts, actual cost, complete inputs and output changes are not verified. This is not an edit or approval.",
  ].join("\n");
}
