import { Bot, CalendarDays, MapPinned, MessageCircle, Search, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpacePeer } from "./studio-virtual-space-model";
import { studioNpcLabel, studioNpcRole } from "./studio-virtual-space-npc-director";
import type { StudioWorldNpcDefinition, StudioWorldRoomDefinition } from "./studio-virtual-space-world-manifest";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";

export type StudioNpcDialogueAction = "today" | "team" | "people" | "review" | "assets" | "guide" | "schedule" | "production";

function nextWork(snapshot: StudioVirtualOperationsSnapshot, fallback: string): string {
  const task = snapshot.project?.aggregate.tasks
    .filter((item) => !["approved", "done", "cancelled", "out-of-scope"].includes(item.status))
    .sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity))[0];
  return task ? `${task.title} · ${task.status}` : fallback;
}

export function StudioVirtualSpaceNpcDialoguePanel({ npc, room, operations, peers, onAction, onClose }: {
  readonly npc: StudioWorldNpcDefinition;
  readonly room?: StudioWorldRoomDefinition;
  readonly operations: StudioVirtualOperationsSnapshot;
  readonly peers: readonly StudioVirtualSpacePeer[];
  readonly onAction: (action: StudioNpcDialogueAction) => void;
  readonly onClose: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceNpcDialoguePanel");
  const role = studioNpcRole(npc), identity = studioNpcLabel(npc);
  const questionInput = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(() => bt(
    `${room?.labelKo ?? "스튜디오"}에 오신 것을 환영해요. 일정, 검수, 팀원 위치 또는 다음 작업을 물어보세요.`,
    `Welcome to ${room?.labelEn ?? "the studio"}. Ask about the schedule, reviews, teammate locations or your next task.`,
  ));
  useEffect(() => { questionInput.current?.focus(); }, [npc.id]);
  const rolePrompts = useMemo(() => {
    const common: Array<{ id: StudioNpcDialogueAction; ko: string; en: string; icon: typeof CalendarDays }> = [
      { id: "today" as const, ko: "오늘 무엇부터 하면 돼?", en: "What should I do first today?", icon: CalendarDays },
      { id: "people" as const, ko: "팀원은 어디 있어?", en: "Where are my teammates?", icon: UsersRound },
      { id: "guide" as const, ko: "공간을 안내해줘", en: "Guide me through the studio", icon: MapPinned },
    ];
    if (role === "producer" || role === "guide") common.splice(1, 0, { id: "schedule", ko: "마감과 회의 알려줘", en: "Show deadlines and meetings", icon: CalendarDays });
    if (role === "editor") common.splice(1, 0, { id: "review", ko: "검수 대기 항목 보여줘", en: "Show pending reviews", icon: MessageCircle });
    if (role === "librarian") common.splice(1, 0, { id: "assets", ko: "필요한 소재를 찾고 싶어", en: "Help me find an asset", icon: Search });
    if (role === "cafe" || role === "security") common.splice(1, 0, { id: "team", ko: "팀 초대와 회의 준비", en: "Prepare team invites and meetings", icon: UsersRound });
    return common;
  }, [role]);

  const respond = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    if (/일정|마감|회의|schedule|deadline|meeting/u.test(normalized)) {
      const event = operations.calendar[0];
      setAnswer(event ? bt(`가장 가까운 일정은 “${event.title}”입니다. 일정판에서 전체 계획을 확인할 수 있어요.`, `The nearest event is “${event.title}”. Open the schedule board for the full plan.`)
        : bt("등록된 일정이 아직 없어요. 프로덕션 관제실에서 일정을 만들거나 확인할 수 있어요.", "There is no registered event yet. Use Production Control to create or inspect the schedule."));
    } else if (/검수|리뷰|review|comment/u.test(normalized)) {
      const count = operations.project?.aggregate.tasks.filter((item) => ["internal-review", "external-review", "changes-requested", "conditionally-approved"].includes(item.status)).length ?? 0;
      setAnswer(bt(`현재 검수 흐름에 ${count}개의 열린 작업이 있어요. 리뷰 시어터까지 안내하거나 검수함을 열 수 있습니다.`, `There are ${count} open tasks in review flow. I can guide you to the Review Theater or open the review inbox.`));
    } else if (/사람|팀원|어디|who|where|teammate/u.test(normalized)) {
      setAnswer(peers.length ? bt(`현재 이 공간에 ${peers.length}명의 팀원이 있어요: ${peers.slice(0, 4).map((peer) => peer.participant.displayName).join(", ")}. 사람 찾기에서 위치를 표시할 수 있습니다.`, `${peers.length} teammates are currently here: ${peers.slice(0, 4).map((peer) => peer.participant.displayName).join(", ")}. Use People search to locate them.`)
        : bt("현재 연결된 팀원이 없어요. 팀 커먼즈에서 초대 링크를 만들거나 접속을 기다릴 수 있어요.", "No teammate is connected right now. Create an invitation in Team Commons or wait for them to join."));
    } else if (/소재|에셋|브러시|asset|brush/u.test(normalized)) {
      setAnswer(bt("에셋 아카이브에서 캐릭터·배경·브러시·3D 자료와 버전을 함께 찾을 수 있어요.", "The Asset Archive contains characters, backgrounds, brushes, 3D references and version history."));
    } else if (/초대|그룹|팀|invite|group|team/u.test(normalized)) {
      setAnswer(bt("팀 커먼즈에서 여러 제작 그룹을 만들고 멤버·게스트·외부 검수자를 역할별로 초대할 수 있어요. 초대는 명시적으로 링크를 만든 뒤 전송합니다.", "Team Commons lets you create production groups and invite members, guests or external reviewers by role. Invitations are sent only after you explicitly create a link."));
    } else {
      setAnswer(bt(`다음으로 추천하는 작업은 “${nextWork(operations, "Today Board 확인")}”입니다. 제가 위치를 안내해도 실제 도구 실행과 승인 작업은 항상 직접 확인해야 해요.`, `Your recommended next action is “${nextWork(operations, "check the Today Board")}”. I can guide you, but tool execution and approvals always require your explicit confirmation.`));
    }
    setQuestion("");
  };

  return <section className="studio-vspace-npc-dialogue" role="dialog" aria-modal="true" aria-labelledby="studio-npc-dialogue-title" data-space-interactive="true">
    <header><div className="studio-vspace-npc-portrait"><Bot size={25} aria-hidden /></div><div><p>{bt(identity.ko, identity.en)}</p><h2 id="studio-npc-dialogue-title">{bt(room?.labelKo ?? "스튜디오", room?.labelEn ?? "Studio")}</h2></div>
      <button type="button" onClick={onClose} aria-label={bt("대화 닫기", "Close dialogue")}><X size={18} aria-hidden /></button></header>
    <div className="studio-vspace-npc-answer"><MessageCircle size={16} aria-hidden /><p>{answer}</p></div>
    <div className="studio-vspace-npc-prompts">{rolePrompts.map((prompt) => { const Icon = prompt.icon; return <button key={prompt.id} type="button" onClick={() => onAction(prompt.id)}><Icon size={15} aria-hidden />{bt(prompt.ko, prompt.en)}</button>; })}</div>
    <form onSubmit={(event) => { event.preventDefault(); respond(question); }}><input ref={questionInput} value={question} maxLength={240} onChange={(event) => setQuestion(event.target.value)} placeholder={bt("NPC에게 일정, 팀원, 검수, 소재를 물어보세요", "Ask about schedules, teammates, reviews or assets")} /><button type="submit" disabled={!question.trim()}>{bt("질문", "Ask")}</button></form>
    <footer>{bt("NPC는 정보를 정리하고 안전한 화면으로 안내합니다. 초대·승인·배포·권한 변경은 대신 실행하지 않습니다.", "NPCs summarize information and guide you to safe screens. They never execute invitations, approvals, publishing or permission changes for you.")}</footer>
  </section>;
}
