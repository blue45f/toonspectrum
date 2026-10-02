import { CalendarDays, Check, Copy, Handshake, History, Lightbulb, MapPinned, MessageCircle, Search, Trash2, Type, UsersRound, Volume2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualDialogueScale } from "./studio-virtual-space-experience-preference";
import {
  appendStudioVirtualDialogueHistory,
  clearStudioVirtualDialogueHistory,
  readStudioVirtualDialogueHistory,
  speakStudioVirtualDialogue,
  type StudioVirtualDialogueTurn,
} from "./studio-virtual-space-dialogue-history";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { studioVirtualCampusZoneMeta } from "./studio-virtual-space-campus-world";
import type { StudioVirtualSpacePeer } from "./studio-virtual-space-model";
import { studioNpcCastHasKey, studioNpcCastSkinByKey } from "./studio-virtual-space-npc-cast";
import { studioNpcLabel, studioNpcRole } from "./studio-virtual-space-npc-director";
import type { StudioWorldNpcDefinition, StudioWorldRoomDefinition } from "./studio-virtual-space-world-manifest";
import { studioTownCompanionSnapshot, studioTownEvents, studioTownSeasonAt } from "./studio-virtual-space-town-program";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";
import { SpaceNpcPortrait } from "./hud/SpaceNpcPortrait";
import { spaceKoCopula } from "./hud/space-korean";
import { spaceNpcDayIndex, spaceNpcTip, spaceNpcZoneGuide } from "./hud/space-npc-dialogue-content";
import { spaceNpcExpressionFor, type SpaceNpcDialogueMoment } from "./hud/space-npc-portrait";

export type StudioNpcDialogueAction = "today" | "team" | "people" | "review" | "assets" | "guide" | "schedule" | "production" | "town" | "cowork";

/** 인사 뒤 이 시간이 지나면 선택지를 기다리는 표정(생각 중)으로 바꾼다. */
const CHOICE_WAIT_MS = 2_600;

function nextWork(snapshot: StudioVirtualOperationsSnapshot, fallback: string): string {
  const task = snapshot.project?.aggregate.tasks
    .filter((item) => !["approved", "done", "cancelled", "out-of-scope"].includes(item.status))
    .sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity))[0];
  return task ? `${task.title} · ${task.status}` : fallback;
}

/** 캐스트 라벨 '모아 · 컨시어지'를 이름과 역할로 나눈다. 캐스트 밖 NPC는 역할 라벨만 쓴다. */
function npcIdentity(npc: StudioWorldNpcDefinition) {
  const role = studioNpcLabel(npc);
  if (!studioNpcCastHasKey(npc.skinKey)) {
    const roleKo = role.ko.replace(/^NPC\s*·\s*/u, "");
    const roleEn = role.en.replace(/^NPC\s*·\s*/u, "");
    return { nameKo: roleKo, nameEn: roleEn, roleKo, roleEn };
  }
  const skin = studioNpcCastSkinByKey(npc.skinKey);
  const [nameKo = skin.labelKo, roleKo = ""] = skin.labelKo.split(" · ");
  const [nameEn = skin.labelEn, roleEn = ""] = skin.labelEn.split(" · ");
  return { nameKo, nameEn, roleKo, roleEn };
}

/**
 * NPC 대화 카드.
 * - 데스크톱은 화면을 막지 않는 카드(aria-modal=false): 대화 중에도 걸을 수 있고, 멀어지면 Page가 닫는다.
 * - 모바일(modal)은 바텀시트로 띄운다.
 * - 초상화는 NPC 본인 스프라이트의 흉상 크롭을 쓰고, 대화 흐름(인사·팁·새 소식·완료)에 따라 표정 몸짓을 바꾼다.
 * - 선택지: 구역 안내 · 오늘의 팁 · 같이 작업하기 + 역할별 바로 가기. 직접 질문도 할 수 있다.
 */
export function StudioVirtualSpaceNpcDialoguePanel({
  npc, room, operations, peers, artStyle, dialogueScale, ttsEnabled, onDialogueScale, onAction, onClose,
  modal = false, roomInteractions = [], personal = false,
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
  /** 모바일 바텀시트처럼 다른 조작을 막아야 하면 true. 기본은 비모달 카드. */
  readonly modal?: boolean;
  /** 이 NPC가 있는 구역에서 X로 쓸 수 있는 대상(구역 안내에 쓴다). */
  readonly roomInteractions?: readonly { readonly labelKo: string; readonly labelEn: string }[];
  /** 개인 공간이면 같이 작업하기 대신 팀 공간 안내를 한다. */
  readonly personal?: boolean;
}) {
  const bt = useBilingual("StudioVirtualSpaceNpcDialoguePanel");
  const titleId = useId();
  const role = studioNpcRole(npc);
  const identity = npcIdentity(npc);
  const zoneMeta = room ? studioVirtualCampusZoneMeta(room.id) : null;
  const roomLabelKo = zoneMeta?.labelKo ?? room?.labelKo ?? "스튜디오";
  const roomLabelEn = zoneMeta?.labelEn ?? room?.labelEn ?? "the studio";
  const questionInput = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // 카드 안에서 누른 Esc는 여기서 닫고 HUD 전역 Esc(다른 창 닫기)로 번지지 않게 한다.
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    element.addEventListener("keydown", onKeyDown);
    return () => element.removeEventListener("keydown", onKeyDown);
  }, []);
  const greeting = bt(
    `${roomLabelKo}에 오신 것을 환영해요. 저는 ${spaceKoCopula(identity.nameKo)}. 구역 안내, 오늘의 팁, 같이 작업하기 중에서 골라 보세요.`,
    `Welcome to ${roomLabelEn}. I'm ${identity.nameEn}. Choose a zone guide, today's tip, or working together.`,
  );
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(greeting);
  const [moment, setMoment] = useState<SpaceNpcDialogueMoment>("greeting");
  const [tipOffset, setTipOffset] = useState(0);
  const [history, setHistory] = useState<readonly StudioVirtualDialogueTurn[]>(() => readStudioVirtualDialogueHistory(npc.id));
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    setAnswer(greeting);
    setMoment("greeting");
    setHistory(readStudioVirtualDialogueHistory(npc.id));
    // 비모달 카드는 포커스를 빼앗지 않는다(키보드로 계속 걸을 수 있게). 모바일 시트만 입력으로 옮긴다.
    if (modal) questionInput.current?.focus({ preventScroll: true });
  }, [greeting, modal, npc.id]);
  // 인사 뒤 잠시 지나면 선택지를 기다리는 표정으로 바꾼다.
  useEffect(() => {
    if (moment !== "greeting") return undefined;
    const timer = globalThis.setTimeout(() => setMoment("choices"), CHOICE_WAIT_MS);
    return () => globalThis.clearTimeout(timer);
  }, [moment]);
  const rolePrompts = useMemo(() => {
    const common: Array<{ id: StudioNpcDialogueAction; ko: string; en: string; icon: typeof CalendarDays }> = [
      { id: "today", ko: "오늘은 무엇부터 할까요?", en: "What should I do first today?", icon: CalendarDays },
      { id: "people", ko: "팀원은 어디?", en: "Where is my team?", icon: UsersRound },
    ];
    if (role === "guide") common.push({ id: "guide", ko: "함께 둘러보기", en: "Show me around", icon: MapPinned });
    if (role === "producer" || role === "guide") common.push({ id: "schedule", ko: "마감과 회의", en: "Deadlines & meetings", icon: CalendarDays });
    if (role === "editor") common.push({ id: "review", ko: "검수 대기 항목", en: "Pending reviews", icon: MessageCircle });
    if (role === "librarian") common.push({ id: "assets", ko: "소재 찾기", en: "Find assets", icon: Search });
    if (role === "cafe" || role === "security") common.push({ id: "team", ko: "팀 초대·회의 준비", en: "Invites & meetings", icon: UsersRound });
    if (role === "host" || role === "guide" || role === "cafe") common.push({ id: "town", ko: "마을 이벤트", en: "Town events", icon: MapPinned });
    return common;
  }, [role]);
  const commitAnswer = (asked: string, response: string, nextMoment: SpaceNpcDialogueMoment) => {
    setAnswer(response);
    setMoment(nextMoment);
    setHistory(appendStudioVirtualDialogueHistory(npc.id, asked, response));
    setQuestion("");
  };

  const showZoneGuide = () => {
    const line = spaceNpcZoneGuide({ roomId: room?.id, roomLabelKo, roomLabelEn, interactions: roomInteractions });
    commitAnswer(bt("구역 안내", "Zone guide"), bt(line.ko, line.en), line.moment);
  };
  const showTip = () => {
    const line = spaceNpcTip(spaceNpcDayIndex(), tipOffset);
    setTipOffset((value) => value + 1);
    commitAnswer(bt("오늘의 팁", "Today's tip"), bt(line.ko, line.en), line.moment);
  };
  const startCowork = () => {
    if (personal) {
      commitAnswer(bt("같이 작업하기", "Work together"), bt(
        "개인 스튜디오에는 혼자만 들어올 수 있어요. 팀 작품 공간에서 팀원에게 다가가면 '같이 작업하기'를 요청할 수 있어요.",
        "Only you are in your personal studio. In a team project space, walk up to a teammate to ask them to work together.",
      ), "info");
      return;
    }
    setMoment("done");
    onAction("cowork");
  };

  const respond = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    let response: string;
    let nextMoment: SpaceNpcDialogueMoment = "info";
    if (/일정|마감|회의|schedule|deadline|meeting/u.test(normalized)) {
      const event = operations.calendar[0];
      nextMoment = event ? "news" : "info";
      response = event ? bt(
        `가장 가까운 일정은 “${spaceKoCopula(event.title)}”. 일정판에서 전체 계획을 확인할 수 있어요.`,
        `The nearest event is “${event.title}”. Open the schedule board for the full plan.`,
      ) : bt(
        "등록된 일정이 아직 없어요. 프로덕션 관제실에서 일정을 만들거나 확인할 수 있어요.",
        "There is no registered event yet. Use Production Control to create or inspect the schedule.",
      );
    } else if (/검수|리뷰|review|comment/u.test(normalized)) {
      const count = operations.project?.aggregate.tasks.filter((item) => ["internal-review", "external-review", "changes-requested", "conditionally-approved"].includes(item.status)).length ?? 0;
      nextMoment = count > 0 ? "news" : "info";
      response = count > 0 ? bt(
        `현재 검수 흐름에 ${count}개의 열린 작업이 있어요. 리뷰 시어터까지 안내하거나 검수함을 열 수 있어요.`,
        `There are ${count} open tasks in review flow. I can guide you to the Review Theater or open the review inbox.`,
      ) : bt(
        "지금은 검수 대기 중인 작업이 없어요.",
        "There are no open tasks in review flow right now.",
      );
    } else if (/사람|팀원|어디|who|where|teammate/u.test(normalized)) {
      response = peers.length ? bt(
        `현재 이 공간에 ${peers.length}명의 팀원이 있어요: ${peers.slice(0, 4).map((peer) => peer.participant.displayName).join(", ")}. 사람 찾기에서 위치를 표시할 수 있어요.`,
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
      nextMoment = "event";
      response = bt(
        `${season.labelKo} 기간이에요. ${companion.summaryKo}.${nextEvent ? ` 다음 마을 일정은 “${spaceKoCopula(nextEvent.labelKo)}”.` : ""} 실제 이동·발표·초대는 직접 확인해야 해요.`,
        `${season.labelEn} is active. ${companion.summaryEn}.${nextEvent ? ` The next town event is “${nextEvent.labelEn}”.` : ""} You must explicitly confirm movement, presentations and invitations.`,
      );
    } else {
      nextMoment = "tip";
      response = bt(
        `다음으로 추천하는 작업은 “${spaceKoCopula(nextWork(operations, "오늘의 보드 확인"))}”. 실제 도구 실행과 승인 작업은 항상 직접 확인해야 해요.`,
        `Your recommended next action is “${nextWork(operations, "check the Today Board")}”. Tool execution and approvals always require your explicit confirmation.`,
      );
    }
    commitAnswer(value, response, nextMoment);
  };
  const cycleScale = () => onDialogueScale(dialogueScale === "normal" ? "large" : dialogueScale === "large" ? "xlarge" : "normal");
  const [copied, setCopied] = useState(false);
  const copyAnswer = () => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(answer).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  };
  const readAnswer = () => { if (ttsEnabled) speakStudioVirtualDialogue(answer, bt("ko-KR", "en-US")); };
  const expression = spaceNpcExpressionFor(moment);
  const nameRole = identity.roleKo ? bt(`${identity.nameKo} · ${identity.roleKo}`, `${identity.nameEn} · ${identity.roleEn}`) : bt(identity.nameKo, identity.nameEn);

  return <section ref={rootRef} className="space-npc-dialogue" role="dialog" aria-modal={modal} aria-labelledby={titleId}
    data-space-interactive="true" data-dialogue-scale={dialogueScale} data-modal={modal || undefined} data-expression={expression}>
    <header className="space-npc-dialogue__header">
      <SpaceNpcPortrait skinKey={npc.skinKey} expression={expression} alt={nameRole} artStyle={artStyle} />
      <div className="space-npc-dialogue__who">
        <p className="space-npc-dialogue__where"><span className="space-npc-dialogue__badge">NPC</span>{bt(roomLabelKo, roomLabelEn)}</p>
        <h2 id={titleId}>{bt(identity.nameKo, identity.nameEn)}</h2>
        {identity.roleKo ? <p className="space-npc-dialogue__role">{bt(identity.roleKo, identity.roleEn)}</p> : null}
      </div>
      <div className="space-npc-dialogue__tools">
        <button type="button" className="space-icon-button" onClick={copyAnswer} aria-label={copied ? bt("복사했어요", "Copied") : bt("답변 복사", "Copy answer")}>{copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}</button>
        {ttsEnabled ? <button type="button" className="space-icon-button" onClick={readAnswer} aria-label={bt("답변 읽기", "Read answer aloud")}><Volume2 size={16} aria-hidden /></button> : null}
        <button type="button" className="space-icon-button" onClick={cycleScale} aria-label={bt("글자 크기 변경", "Change text size")}><Type size={16} aria-hidden /></button>
        <button type="button" className="space-icon-button" aria-pressed={historyOpen} onClick={() => setHistoryOpen((current) => !current)} aria-label={bt("대화 기록", "Dialogue history")}><History size={16} aria-hidden /></button>
        <button type="button" className="space-icon-button" onClick={onClose} aria-label={bt("대화 닫기", "Close dialogue")}><X size={17} aria-hidden /></button>
      </div>
    </header>
    <div className="space-npc-dialogue__speech" aria-live="polite"><p>{answer}</p></div>
    {historyOpen ? <section className="space-npc-dialogue__history" aria-label={bt("이 NPC와의 대화 기록", "Dialogue history with this NPC")}>
      <header><strong>{bt("이번 방문의 대화", "This visit")}</strong><button type="button" className="space-pill-button" onClick={() => { clearStudioVirtualDialogueHistory(npc.id); setHistory([]); }}><Trash2 size={14} aria-hidden />{bt("비우기", "Clear")}</button></header>
      {history.length ? <ol>{history.map((turn) => <li key={turn.id}><strong>{turn.question}</strong><p>{turn.answer}</p></li>)}</ol>
        : <p>{bt("아직 저장된 대화가 없어요. 기록은 새로고침하면 사라져요.", "No dialogue yet. This history disappears on refresh.")}</p>}
    </section> : null}
    <div className="space-npc-dialogue__choices" role="group" aria-label={bt("대화 선택지", "Dialogue choices")}>
      <button type="button" onClick={showZoneGuide}><MapPinned size={18} aria-hidden /><span>{bt("구역 안내", "Zone guide")}</span></button>
      <button type="button" onClick={showTip}><Lightbulb size={18} aria-hidden /><span>{tipOffset > 0 ? bt("다른 팁", "Another tip") : bt("오늘의 팁", "Today's tip")}</span></button>
      <button type="button" onClick={startCowork}><Handshake size={18} aria-hidden /><span>{bt("같이 작업하기", "Work together")}</span></button>
    </div>
    <div className="space-npc-dialogue__quick" role="group" aria-label={bt("바로 가기", "Shortcuts")}>{rolePrompts.map((prompt) => {
      const Icon = prompt.icon;
      return <button key={prompt.id} type="button" className="space-pill-button" onClick={() => { setMoment("done"); onAction(prompt.id); }}><Icon size={15} aria-hidden />{bt(prompt.ko, prompt.en)}</button>;
    })}</div>
    <form className="space-npc-dialogue__ask" onSubmit={(event) => { event.preventDefault(); respond(question); }}>
      <input ref={questionInput} value={question} maxLength={240}
        onChange={(event) => { setQuestion(event.target.value); if (event.target.value.trim()) setMoment("question"); }}
        onKeyDown={(event) => { if (event.key !== "Escape") event.stopPropagation(); }}
        aria-label={bt("NPC에게 질문", "Ask the NPC")}
        placeholder={bt("일정, 팀원, 검수, 소재를 물어보세요", "Ask about schedules, teammates, reviews or assets")} />
      <button type="submit" className="space-pill-button space-pill-button--primary" disabled={!question.trim()}>{bt("질문", "Ask")}</button>
    </form>
    <footer>{bt(
      "NPC는 정보를 정리하고 안전한 화면으로 안내해요. 초대·승인·배포·권한 변경은 대신 실행하지 않아요.",
      "NPCs summarize information and guide you to safe screens. They never execute invitations, approvals, publishing or permission changes for you.",
    )}</footer>
  </section>;
}
