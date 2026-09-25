import { CalendarDays, Copy, History, MapPinned, MessageCircle, Search, Trash2, Type, UsersRound, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualDialogueScale } from "./studio-virtual-space-experience-preference";
import {
  appendStudioVirtualDialogueHistory,
  clearStudioVirtualDialogueHistory,
  readStudioVirtualDialogueHistory,
  speakStudioVirtualDialogue,
  type StudioVirtualDialogueTurn,
} from "./studio-virtual-space-dialogue-history";
import { studioNpcCastSkinByKey } from "./studio-virtual-space-npc-cast";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { StudioVirtualSpacePeer } from "./studio-virtual-space-model";
import { studioNpcLabel, studioNpcRole } from "./studio-virtual-space-npc-director";
import type { StudioWorldNpcDefinition, StudioWorldRoomDefinition } from "./studio-virtual-space-world-manifest";
import { studioTownCompanionSnapshot, studioTownEvents, studioTownSeasonAt } from "./studio-virtual-space-town-program";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";

export type StudioNpcDialogueAction = "today" | "team" | "people" | "review" | "assets" | "guide" | "schedule" | "production" | "town";

function nextWork(snapshot: StudioVirtualOperationsSnapshot, fallback: string): string {
  const task = snapshot.project?.aggregate.tasks
    .filter((item) => !["approved", "done", "cancelled", "out-of-scope"].includes(item.status))
    .sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity))[0];
  return task ? `${task.title} · ${task.status}` : fallback;
}
export function StudioVirtualSpaceNpcDialoguePanel({
  npc, room, operations, peers, artStyle, dialogueScale, ttsEnabled, onDialogueScale, onAction, onClose,
}: {
  readonly npc: StudioWorldNpcDefinition;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly dialogueScale: StudioVirtualDialogueScale;
  readonly ttsEnabled: boolean;
  readonly room?: StudioWorldRoomDefinition;
  readonly operations: StudioVirtualOperationsSnapshot;
  readonly peers: readonly StudioVirtualSpacePeer[];
  readonly onDialogueScale: (scale: StudioVirtualDialogueScale) => void;
  readonly onAction: (action: StudioNpcDialogueAction) => void;
  readonly onClose: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceNpcDialoguePanel");
  const role = studioNpcRole(npc), identity = studioNpcLabel(npc);
  const portraitUrl = studioNpcCastSkinByKey(npc.skinKey, artStyle).directional.down;
  const questionInput = useRef<HTMLInputElement>(null);
  const greeting = bt(
    `${room?.labelKo ?? "스튜디오"}에 오신 것을 환영해요. 일정, 검수, 팀원 위치 또는 다음 작업을 물어보세요.`,
    `Welcome to ${room?.labelEn ?? "the studio"}. Ask about the schedule, reviews, teammate locations or your next task.`,
  );
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(greeting);
  const [history, setHistory] = useState<readonly StudioVirtualDialogueTurn[]>(() => readStudioVirtualDialogueHistory(npc.id));
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    setAnswer(greeting);
    setHistory(readStudioVirtualDialogueHistory(npc.id));
    questionInput.current?.focus();
  }, [greeting, npc.id]);
  const rolePrompts = useMemo(() => {
    const common: Array<{ id: StudioNpcDialogueAction; ko: string; en: string; icon: typeof CalendarDays }> = [
      { id: "today", ko: "오늘 무엇부터 하면 돼?", en: "What should I do first today?", icon: CalendarDays },
      { id: "people", ko: "팀원은 어디 있어?", en: "Where are my teammates?", icon: UsersRound },
      { id: "guide", ko: "공간을 안내해줘", en: "Guide me through the studio", icon: MapPinned },
    ];
    if (role === "producer" || role === "guide") common.splice(1, 0, { id: "schedule", ko: "마감과 회의 알려줘", en: "Show deadlines and meetings", icon: CalendarDays });
    if (role === "editor") common.splice(1, 0, { id: "review", ko: "검수 대기 항목 보여줘", en: "Show pending reviews", icon: MessageCircle });
    if (role === "librarian") common.splice(1, 0, { id: "assets", ko: "필요한 소재를 찾고 싶어", en: "Help me find an asset", icon: Search });
    if (role === "cafe" || role === "security") common.splice(1, 0, { id: "team", ko: "팀 초대와 회의 준비", en: "Prepare team invites and meetings", icon: UsersRound });
    if (role === "host" || role === "guide" || role === "cafe") common.splice(1, 0, { id: "town", ko: "마을 이벤트와 활동", en: "Town events and activities", icon: MapPinned });
    return common;
  }, [role]);
  const commitAnswer = (asked: string, response: string) => {
    setAnswer(response);
    setHistory(appendStudioVirtualDialogueHistory(npc.id, asked, response));
    setQuestion("");
  };

  const respond = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    let response: string;
    if (/일정|마감|회의|schedule|deadline|meeting/u.test(normalized)) {
      const event = operations.calendar[0];
      response = event ? bt(
        `가장 가까운 일정은 “${event.title}”입니다. 일정판에서 전체 계획을 확인할 수 있어요.`,
        `The nearest event is “${event.title}”. Open the schedule board for the full plan.`,
      ) : bt(
        "등록된 일정이 아직 없어요. 프로덕션 관제실에서 일정을 만들거나 확인할 수 있어요.",
        "There is no registered event yet. Use Production Control to create or inspect the schedule.",
      );
    } else if (/검수|리뷰|review|comment/u.test(normalized)) {
      const count = operations.project?.aggregate.tasks.filter((item) => ["internal-review", "external-review", "changes-requested", "conditionally-approved"].includes(item.status)).length ?? 0;
      response = bt(
        `현재 검수 흐름에 ${count}개의 열린 작업이 있어요. 리뷰 시어터까지 안내하거나 검수함을 열 수 있습니다.`,
        `There are ${count} open tasks in review flow. I can guide you to the Review Theater or open the review inbox.`,
      );
    } else if (/사람|팀원|어디|who|where|teammate/u.test(normalized)) {
      response = peers.length ? bt(
        `현재 이 공간에 ${peers.length}명의 팀원이 있어요: ${peers.slice(0, 4).map((peer) => peer.participant.displayName).join(", ")}. 사람 찾기에서 위치를 표시할 수 있습니다.`,
        `${peers.length} teammates are currently here: ${peers.slice(0, 4).map((peer) => peer.participant.displayName).join(", ")}. Use People search to locate them.`,
      ) : bt(
        "현재 연결된 팀원이 없어요. 팀 커먼즈에서 초대 링크를 만들거나 접속을 기다릴 수 있어요.",
        "No teammate is connected right now. Create an invitation in Team Commons or wait for them to join.",
      );
    } else if (/소재|에셋|브러시|asset|brush/u.test(normalized)) {
      response = bt("에셋 아카이브에서 캐릭터·배경·브러시·3D 자료와 버전을 함께 찾을 수 있어요.", "The Asset Archive contains characters, backgrounds, brushes, 3D references and version history.");
    } else if (/초대|그룹|팀|invite|group|team/u.test(normalized)) {
      response = bt("팀 커먼즈에서 제작 그룹을 만들고 멤버·게스트·외부 검수자를 역할별로 초대할 수 있어요.", "Team Commons lets you create production groups and invite members, guests or external reviewers by role.");
    } else if (/이벤트|축제|퀘스트|게임|계절|event|festival|quest|game|season/u.test(normalized)) {
      const companion = studioTownCompanionSnapshot(operations);
      const nextEvent = [...studioTownEvents()].sort((left, right) => left.startsAt - right.startsAt)[0];
      const season = studioTownSeasonAt();
      response = bt(
        `${season.labelKo} 기간이에요. ${companion.summaryKo}.${nextEvent ? ` 다음 마을 일정은 “${nextEvent.labelKo}”입니다.` : ""} 실제 이동·발표·초대는 직접 확인해야 해요.`,
        `${season.labelEn} is active. ${companion.summaryEn}.${nextEvent ? ` The next town event is “${nextEvent.labelEn}”.` : ""} You must explicitly confirm movement, presentations and invitations.`,
      );
    } else {
      response = bt(
        `다음으로 추천하는 작업은 “${nextWork(operations, "Today Board 확인")}”입니다. 실제 도구 실행과 승인 작업은 항상 직접 확인해야 해요.`,
        `Your recommended next action is “${nextWork(operations, "check the Today Board")}”. Tool execution and approvals always require your explicit confirmation.`,
      );
    }
    commitAnswer(value, response);
  };
  const cycleScale = () => onDialogueScale(dialogueScale === "normal" ? "large" : dialogueScale === "large" ? "xlarge" : "normal");
  const copyAnswer = () => { void navigator.clipboard?.writeText(answer); };
  const readAnswer = () => { if (ttsEnabled) speakStudioVirtualDialogue(answer, bt("ko-KR", "en-US")); };

  return <section className="studio-vspace-npc-dialogue" role="dialog" aria-modal="true"
    aria-labelledby="studio-npc-dialogue-title" data-space-interactive="true" data-dialogue-scale={dialogueScale}>
    <header>
      <div className="studio-vspace-npc-portrait"><img src={portraitUrl} alt="" draggable={false} /></div>
      <div><p>{bt(identity.ko, identity.en)}</p><h2 id="studio-npc-dialogue-title">{bt(room?.labelKo ?? "스튜디오", room?.labelEn ?? "Studio")}</h2></div>
      <div className="studio-vspace-npc-dialogue-tools">
        <button type="button" onClick={copyAnswer} aria-label={bt("답변 복사", "Copy answer")}><Copy size={17} aria-hidden /></button>
        {ttsEnabled ? <button type="button" onClick={readAnswer} aria-label={bt("답변 읽기", "Read answer aloud")}><Volume2 size={17} aria-hidden /></button> : null}
        <button type="button" onClick={cycleScale} aria-label={bt("글자 크기 변경", "Change text size")}><Type size={17} aria-hidden /></button>
        <button type="button" aria-pressed={historyOpen} onClick={() => setHistoryOpen((current) => !current)} aria-label={bt("대화 기록", "Dialogue history")}><History size={17} aria-hidden /></button>
        <button type="button" onClick={onClose} aria-label={bt("대화 닫기", "Close dialogue")}><X size={18} aria-hidden /></button>
      </div>
    </header>
    <div className="studio-vspace-npc-answer"><MessageCircle size={16} aria-hidden /><p>{answer}</p></div>
    {historyOpen ? <section className="studio-vspace-npc-history" aria-label={bt("이 NPC와의 대화 기록", "Dialogue history with this NPC")}>
      <header><strong>{bt("이번 방문의 대화", "This visit")}</strong><button type="button" onClick={() => { clearStudioVirtualDialogueHistory(npc.id); setHistory([]); }}><Trash2 size={14} aria-hidden />{bt("비우기", "Clear")}</button></header>
      {history.length ? <ol>{history.map((turn) => <li key={turn.id}><strong>{turn.question}</strong><p>{turn.answer}</p></li>)}</ol>
        : <p>{bt("아직 저장된 대화가 없어요. 기록은 새로고침하면 사라집니다.", "No dialogue yet. This history disappears on refresh.")}</p>}
    </section> : null}
    <div className="studio-vspace-npc-prompts">{rolePrompts.map((prompt) => {
      const Icon = prompt.icon;
      return <button key={prompt.id} type="button" onClick={() => onAction(prompt.id)}><Icon size={15} aria-hidden />{bt(prompt.ko, prompt.en)}</button>;
    })}</div>
    <form onSubmit={(event) => { event.preventDefault(); respond(question); }}>
      <input ref={questionInput} value={question} maxLength={240}
        onChange={(event) => setQuestion(event.target.value)}
        aria-label={bt("NPC에게 질문", "Ask the NPC")}
        placeholder={bt("NPC에게 일정, 팀원, 검수, 소재를 물어보세요", "Ask about schedules, teammates, reviews or assets")} />
      <button type="submit" disabled={!question.trim()}>{bt("질문", "Ask")}</button>
    </form>
    <footer>{bt(
      "NPC는 정보를 정리하고 안전한 화면으로 안내합니다. 초대·승인·배포·권한 변경은 대신 실행하지 않습니다.",
      "NPCs summarize information and guide you to safe screens. They never execute invitations, approvals, publishing or permission changes for you.",
    )}</footer>
  </section>;
}
