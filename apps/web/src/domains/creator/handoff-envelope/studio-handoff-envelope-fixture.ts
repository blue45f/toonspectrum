import { studioHandoffEnvelopePrepareSchema, studioHandoffEnvelopeViewSchema } from "@toonspectrum/studio-project-model";
import { completionFixture } from "../review-task-completion/studio-review-task-completion-fixture";

export function handoffFixture() {
  const completion = completionFixture().completed.evidence!.receipt;
  const recipient = { userId: "recipient", roleAssignmentId: "role" };
  const view = studioHandoffEnvelopeViewSchema.parse({
    envelope: { contract: "studio-handoff-envelope-v1", id: "envelope", workId: "work", taskId: "task",
      taskTitle: "두 번째 컷 수정", senderUserId: "actor", recipient, createdAt: "2026-09-20T00:02:00.000Z", completion,
      brief: { id: "handoff", fromRole: "story", toRole: "lineart", scenePurpose: "손의 방향 수정", emotionalBeat: "",
        mustShow: [], continuityNotes: [], lockedFields: [], acceptanceCriteria: completion.criteria },
      remainingIssues: [], usageConditions: "해당 장면의 선화 작업용", remainingNotes: "소매 연결을 확인해 주세요." },
    envelopeDigest: "d".repeat(64), status: "delivered", opened: null, accepted: null, cancelled: null,
    canAccept: false, canCancel: true,
  });
  const prepared = studioHandoffEnvelopePrepareSchema.parse({ workId: "work", taskId: "task", taskTitle: view.envelope.taskTitle,
    baseRevision: 5, completionFingerprint: "f".repeat(64), recipients: [{ ...recipient,
      displayName: "선화 담당자", roleLabel: "선화", bindingDigest: "e".repeat(64) }] });
  const choice = { roleId: recipient.roleAssignmentId, usageConditions: view.envelope.usageConditions, remainingNotes: view.envelope.remainingNotes };
  return { prepared, view, choice };
}
