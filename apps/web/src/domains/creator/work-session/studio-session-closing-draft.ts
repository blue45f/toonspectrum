import type { StudioWorkSession } from "@toonspectrum/studio-project-model/work-session";

type Translate = (ko: string, en: string) => string;
/** A literal projection of authorized records, not AI synthesis, approval or a new server command. */
export function buildStudioSessionClosingDraft(session: StudioWorkSession, text: Translate): string {
  const agenda = session.workflow?.agenda ?? [];
  const decisions = session.notes.filter((note) => note.category === "decision");
  const unresolved = session.notes.filter((note) => note.category === "unresolved");
  const selection = session.workflow?.materialDecisions.at(-1);
  const candidate = selection?.candidateId ? session.workflow?.materialCandidates.find((item) => item.id === selection.candidateId) : null;
  const lines = [
    `${text("세션", "Session")}: ${session.title} · v${session.version}`,
    `${text("고정 입력", "Pinned input")}: ${session.input.revisionId}`,
    `${text("목적", "Purpose")}: ${session.purpose}`, "",
    text("[기록된 결정]", "[Recorded decisions]"),
    ...decisions.map((note) => `- ${note.body}`),
    ...agenda.filter((item) => item.outcome).map((item) => `- ${item.title}: ${item.outcome!.body}`),
  ];
  if (!decisions.length && !agenda.some((item) => item.outcome)) lines.push(text("- 아직 기록된 결정이 없습니다.", "- No recorded decision yet."));
  if (selection) {
    lines.push("", text("[소재 논의 결과]", "[Material discussion outcome]"));
    lines.push(selection.candidateId ? `${text("기록된 선정", "Recorded selection")}: ${candidate?.title ?? selection.candidateId}`
      : text("선정을 해제하고 재논의 중입니다.", "Selection was reopened for discussion."));
    lines.push(selection.rationale);
    if (candidate) lines.push(`${text("제안자가 기록한 사용 조건", "Proposer-recorded conditions")}: ${candidate.usageConditions}`);
    lines.push(text("선정은 사용권·삽입·구매·공개를 의미하지 않습니다.", "Selection does not grant rights or imply insertion, purchase or publication."));
  }
  lines.push("", text("[미결 기록·결론 없는 안건]", "[Unresolved records and agenda without outcomes]"));
  lines.push(...unresolved.map((note) => `- ${note.body}`));
  const pending = agenda.filter((item) => !item.outcome);
  lines.push(...pending.map((item) => `- ${item.title}`));
  if (!unresolved.length && !pending.length) lines.push(text("- 해당 기록이 없습니다. 모든 작업이 완료됐다는 뜻은 아닙니다.", "- No such records. This does not mean all work is complete."));
  lines.push("", text("[연결된 후속 작업·산출물]", "[Linked follow-up work and outputs]"));
  lines.push(...session.results.map((result) => result.type === "review"
    ? `- ${text("검수본", "Review")}: ${result.subject.revisionId}`
    : `- ${result.type === "task" ? text("작업", "Task") : text("인수인계", "Handoff")}: ${result.id}`));
  if (!session.results.length) lines.push(text("- 연결된 후속 작업이 없습니다. 다음 행동을 직접 보완하세요.", "- No linked follow-up work. Add the next action explicitly."));
  lines.push("", text("이 초안은 기록을 옮긴 것입니다. 다음 행동과 미확인 사항을 검토한 뒤 종료를 확인하세요.", "This draft copies recorded information. Review next steps and unknowns before confirming closure."));
  return lines.join("\n");
}
