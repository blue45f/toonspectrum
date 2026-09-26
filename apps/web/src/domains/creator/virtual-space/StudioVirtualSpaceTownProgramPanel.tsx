import { useMemo, useState } from "react";
import { CalendarDays, Gamepad2, MapPin, MessageCircle, Presentation, Smartphone, Sparkles, UsersRound, Wrench } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { answerStudioMiniGameRound, createStudioMiniGameRound, type StudioMiniGameResult, type StudioMiniGameRound } from "./studio-virtual-space-mini-games";
import {
  STUDIO_TOWN_BLUEPRINTS,
  STUDIO_TOWN_DESK_PODS,
  STUDIO_TOWN_MINI_GAMES,
  applyStudioTownBlueprint,
  studioTownCompanionSnapshot,
  studioTownEvents,
  studioTownQuests,
  type StudioTownEvent,
} from "./studio-virtual-space-town-program";
import type { StudioVirtualDecorationState } from "./studio-virtual-space-customization";
import {
  STUDIO_VIRTUAL_REWARDS,
  studioVirtualRewardById,
  studioVirtualRewardUnlocked,
  type StudioVirtualRewardId,
  type StudioVirtualRewardInventory,
} from "./studio-virtual-space-rewards";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";

const TABS = ["quests", "events", "activities", "rewards", "desks", "blueprints", "companion"] as const;
type Tab = typeof TABS[number];

export function StudioVirtualSpaceTownProgramPanel({
  personal = false,
  operations,
  manifest,
  decorations,
  rewards,
  spotlightActive,
  onDecorations,
  onClaimReward,
  onEquipReward,
  onMoveToRoom,
  onOpenPeople,
  onOpenAnnotation,
  onOpenSessions,
  onStartSpotlight,
  onStopSpotlight,
}: {
  readonly personal?: boolean;
  readonly operations: StudioVirtualOperationsSnapshot;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly decorations: StudioVirtualDecorationState;
  readonly rewards: StudioVirtualRewardInventory;
  readonly spotlightActive: boolean;
  readonly onDecorations: (next: StudioVirtualDecorationState) => void;
  readonly onClaimReward: (id: StudioVirtualRewardId) => void;
  readonly onEquipReward: (id: StudioVirtualRewardId) => void;
  readonly onMoveToRoom: (roomId: string) => void;
  readonly onOpenPeople: () => void;
  readonly onOpenAnnotation: () => void;
  readonly onOpenSessions: () => void;
  readonly onStartSpotlight: (event: StudioTownEvent) => void;
  readonly onStopSpotlight: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceTownProgramPanel");
  const [requestedTab, setTab] = useState<Tab>("quests");
  const tabs: readonly Tab[] = personal ? TABS.filter((item) => item !== "desks" && item !== "companion") : TABS;
  const tab = tabs.includes(requestedTab) ? requestedTab : "quests";
  const [round, setRound] = useState<StudioMiniGameRound | null>(null);
  const [result, setResult] = useState<StudioMiniGameResult | null>(null);
  const quests = useMemo(() => studioTownQuests(operations, manifest, decorations.placements.length)
    .filter((quest) => !personal || quest.kind === "exploration" || quest.kind === "customization"), [decorations.placements.length, manifest, operations, personal]);
  const events = useMemo(() => studioTownEvents(), []);
  const companion = useMemo(() => studioTownCompanionSnapshot(operations), [operations]);

  return <section className="vs2-panel studio-vspace-town-program" data-space-interactive="true">
    <header>
      <div><Sparkles size={17} aria-hidden /><h2>{bt("살아 있는 제작 마을", "Living production town")}</h2></div>
      <p>{personal
        ? bt("마을을 둘러보고 미니게임, 꾸미기 보상과 공간 블루프린트를 즐겨 보세요.", "Explore the town, play mini-games and enjoy cosmetic rewards and space blueprints.")
        : bt("업무 동선, 이벤트, 소규모 대화, 미니게임, 팀 자리와 공간 블루프린트를 한곳에서 관리합니다.", "Manage work routes, events, bubbles, mini-games, desk pods and space blueprints in one place.")}</p>
    </header>
    <div className="studio-vspace-town-tabs" role="tablist" aria-label={bt("마을 기능", "Town features")}>
      {tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{bt({ quests: "퀘스트", events: "이벤트", activities: "활동", rewards: "보상", desks: "팀 자리", blueprints: "블루프린트", companion: "모바일" }[item], { quests: "Quests", events: "Events", activities: "Activities", rewards: "Rewards", desks: "Desk pods", blueprints: "Blueprints", companion: "Companion" }[item])}</button>)}
    </div>
    {tab === "quests" ? <div className="studio-vspace-town-cards">
      {quests.map((quest) => {
        const unlocked = studioVirtualRewardUnlocked(rewards, quest.rewardId);
        const complete = quest.progress >= quest.target;
        return <article key={quest.id}>
          <div><MapPin size={15} aria-hidden /><strong>{bt(quest.labelKo, quest.labelEn)}</strong><span>{quest.progress}/{quest.target}</span></div>
          <p>{bt(quest.descriptionKo, quest.descriptionEn)}</p>
          <small>{bt("보상", "Reward")} · {quest.reward}</small>
          <div className="studio-vspace-town-actions">
            <button type="button" onClick={() => onMoveToRoom(quest.roomId)}>{bt("목적지까지 안내", "Guide me there")}</button>
            {complete ? <button type="button" onClick={() => unlocked ? onEquipReward(quest.rewardId) : onClaimReward(quest.rewardId)}>
              {unlocked ? bt("꾸미기 적용", "Equip cosmetic") : bt("보상 받기", "Claim reward")}
            </button> : null}
          </div>
        </article>;
      })}
    </div> : null}

    {tab === "events" ? <div className="studio-vspace-town-cards">
      {events.map((event) => <article key={event.id}>
        <div><CalendarDays size={15} aria-hidden /><strong>{bt(event.labelKo, event.labelEn)}</strong></div>
        <p>{new Date(event.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–{new Date(event.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        <div className="studio-vspace-town-actions">
          <button type="button" onClick={() => onMoveToRoom(event.roomId)}>{bt("장소로 이동", "Walk to venue")}</button>
          {!personal && event.spotlight ? spotlightActive
            ? <button type="button" onClick={onStopSpotlight}>{bt("Spotlight 종료", "Stop spotlight")}</button>
            : <button type="button" onClick={() => onStartSpotlight(event)}><Presentation size={14} aria-hidden />{bt("발표 준비", "Prepare spotlight")}</button> : null}
        </div>
      </article>)}
      {!personal ? <><article className="studio-vspace-town-feature-card">
        <strong>{bt("소규모 Bubble", "Conversation bubble")}</strong>
        <p>{bt("근처 팀원을 최대 세 명 선택하면 전체 명단 동의 후 임시 대화 그룹이 열리고, 공간 범위를 벗어나면 종료됩니다.", "Choose up to three nearby teammates. The temporary bubble opens after full-roster consent and closes when the spatial scope ends.")}</p>
        <button type="button" onClick={onOpenPeople}><UsersRound size={14} aria-hidden />{bt("Bubble 만들기", "Create a bubble")}</button>
      </article>
      <article className="studio-vspace-town-feature-card">
        <strong>{bt("공유 화면 주석", "Shared-screen annotation")}</strong>
        <p>{bt("레이저·펜·메모를 P2P 보드에 표시하고 영구 검수 의견은 별도 검수 흐름으로 남깁니다.", "Use laser, pen and notes on the P2P board; durable review comments remain in the review workflow.")}</p>
        <button type="button" onClick={onOpenAnnotation}><MessageCircle size={14} aria-hidden />{bt("주석 보드 열기", "Open annotation board")}</button>
      </article></> : null}
    </div> : null}

    {tab === "activities" ? <div className="studio-vspace-town-cards">
      {STUDIO_TOWN_MINI_GAMES.map((game) => <article key={game.id}>
        <div><Gamepad2 size={15} aria-hidden /><strong>{bt(game.labelKo, game.labelEn)}</strong><span>{game.players[0]}–{game.players[1]}</span></div>
        <p>{bt(game.descriptionKo, game.descriptionEn)}</p>
        <small>{game.durationSeconds}s · {game.reward}</small>
        <button type="button" onClick={() => { setRound(createStudioMiniGameRound(game.id, `${manifest.id}:${game.id}`, Date.now(), game.durationSeconds)); setResult(null); }}>{bt("라운드 시작", "Start round")}</button>
      </article>)}
      {round ? <article className="studio-vspace-mini-game-round" aria-live="polite">
        <strong>{bt(round.promptKo, round.promptEn)}</strong>
        <div>{round.choices.map((choice, index) => <button key={choice} type="button" disabled={Boolean(result)} onClick={() => {
          const next = answerStudioMiniGameRound(round, index);
          setResult(next);
          const rewardId = STUDIO_TOWN_MINI_GAMES.find((game) => game.id === round.gameId)?.rewardId;
          if (next.correct && rewardId) onClaimReward(rewardId);
        }}>{choice}</button>)}</div>
        {result ? <p role="status">{result.correct ? bt(`정답 · ${result.score}점`, `Correct · ${result.score} points`) : bt("다시 도전해 보세요.", "Try another round.")}</p> : null}
      </article> : null}
    </div> : null}

    {tab === "rewards" ? <div className="studio-vspace-town-cards studio-vspace-reward-inventory">
      {STUDIO_VIRTUAL_REWARDS.map((reward) => {
        const unlocked = studioVirtualRewardUnlocked(rewards, reward.id);
        const definition = studioVirtualRewardById(reward.id);
        return <article key={reward.id} data-unlocked={unlocked || undefined}>
          <div><Sparkles size={15} aria-hidden /><strong>{bt(definition.labelKo, definition.labelEn)}</strong>
            <span>{unlocked ? bt("획득", "Unlocked") : bt("잠김", "Locked")}</span></div>
          <p>{unlocked
            ? bt("확률형 재화 없이 획득한 꾸미기 보상입니다.", "A cosmetic reward earned without currency or chance mechanics.")
            : bt("연결된 퀘스트 또는 활동을 완료하면 받을 수 있어요.", "Complete the linked quest or activity to unlock it.")}</p>
          <button type="button" disabled={!unlocked} onClick={() => onEquipReward(reward.id)}>
            {bt("내 캐릭터에 적용", "Equip on my character")}
          </button>
        </article>;
      })}
    </div> : null}

    {tab === "desks" ? <div className="studio-vspace-town-cards">
      {STUDIO_TOWN_DESK_PODS.map((pod) => <article key={pod.id}>
        <div><UsersRound size={15} aria-hidden /><strong>{bt(pod.labelKo, pod.labelEn)}</strong></div>
        <p>{pod.roles.join(" · ")}</p>
        <p>{bt("자리에서는 현재 작업, 집중 상태와 검수 대기 상태만 보이고 권한 없는 문서 내용은 노출하지 않습니다.", "Desks show work, focus and review status without exposing unauthorized document content.")}</p>
        <button type="button" onClick={() => onMoveToRoom(pod.roomId)}>{bt("팀 자리로 이동", "Walk to desk pod")}</button>
      </article>)}
      <article className="studio-vspace-town-feature-card"><strong>{bt("작업 세션 연결", "Work-session handoff")}</strong><p>{bt("자리에서 대본 리딩·콘티·검수 세션을 명시적으로 시작하거나 이어갑니다.", "Explicitly start or continue reading, storyboard and review sessions from the desk.")}</p><button type="button" onClick={onOpenSessions}>{bt("세션 열기", "Open sessions")}</button></article>
    </div> : null}

    {tab === "blueprints" ? <div className="studio-vspace-town-cards">
      {STUDIO_TOWN_BLUEPRINTS.map((blueprint) => <article key={blueprint.id}>
        <div><Wrench size={15} aria-hidden /><strong>{bt(blueprint.labelKo, blueprint.labelEn)}</strong><span>{blueprint.decor.length}</span></div>
        <p>{bt("가구, 조명과 상호작용 배치를 한 번에 추가합니다. 배치 후 개별 제거할 수 있어요.", "Place bundled furniture, lighting and interaction-ready decor together; remove items individually afterward.")}</p>
        <button type="button" disabled={decorations.placements.length >= 36} onClick={() => onDecorations(applyStudioTownBlueprint(decorations, manifest, blueprint))}>{bt("블루프린트 배치", "Place blueprint")}</button>
      </article>)}
    </div> : null}

    {tab === "companion" ? <div className="studio-vspace-town-companion">
      <Smartphone size={28} aria-hidden />
      <h3>{bt("모바일 Companion", "Mobile companion")}</h3>
      <p>{bt(companion.summaryKo, companion.summaryEn)}</p>
      <p>{bt("모바일에서는 회의 참가, 채팅, 반응, Today Board, 검수 알림과 승인을 우선하고 전체 월드 편집은 데스크톱으로 이어갑니다.", "Mobile prioritizes meetings, chat, reactions, Today Board, review alerts and approvals; continue full world editing on desktop.")}</p>
      <button type="button" onClick={() => onMoveToRoom(companion.suggestedRoomId)}>{bt("추천 장소로 안내", "Guide to suggested room")}</button>
      <button type="button" onClick={onOpenPeople}>{bt("팀 상태·채팅", "Team status & chat")}</button>
    </div> : null}
  </section>;
}
