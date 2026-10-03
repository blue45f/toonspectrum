import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Gamepad2, Hand, MapPin, MessageCircle, MicOff, MonitorUp, Presentation, Smartphone, Sparkles, UsersRound, Wrench } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { answerStudioMiniGameRound, createStudioMiniGameRound, type StudioMiniGameResult, type StudioMiniGameRound } from "./studio-virtual-space-mini-games";
import {
  STUDIO_TOWN_BLUEPRINTS,
  STUDIO_TOWN_DESK_PODS,
  STUDIO_TOWN_MINI_GAMES,
  applyStudioTownBlueprint,
  createStudioSpotlightSession,
  studioSpotlightAudienceViews,
  studioSpotlightLowerHand,
  studioSpotlightNominateSpeaker,
  studioSpotlightRaiseHand,
  studioSpotlightReleaseSpeaker,
  studioSpotlightSetFullscreenShare,
  studioSpotlightSetPresenter,
  studioTownActiveEvent,
  studioTownCompanionSnapshot,
  studioTownEvents,
  studioTownQuests,
  type StudioSpotlightAudienceMember,
  type StudioSpotlightSession,
  type StudioTownEvent,
  type StudioTownDeskPod,
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
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

const TABS = ["quests", "events", "activities", "rewards", "desks", "blueprints", "companion"] as const;
type Tab = typeof TABS[number];

/**
 * 스포트라이트 로컬 미리보기용 기본 참석자. 실제 인원 연동 전까지 사용한다.
 * spotlightRoster prop으로 교체할 수 있다.
 */
const DEFAULT_SPOTLIGHT_ROSTER: readonly StudioSpotlightAudienceMember[] = Object.freeze([
  { id: "spotlight-me", displayNameKo: "나", displayNameEn: "Me" },
  { id: "spotlight-min", displayNameKo: "민 프로듀서", displayNameEn: "Min · Producer" },
  { id: "spotlight-jun", displayNameKo: "준 작가", displayNameEn: "Jun · Artist" },
  { id: "spotlight-sora", displayNameKo: "소라 편집자", displayNameEn: "Sora · Editor" },
]);

export function StudioVirtualSpaceTownProgramPanel({
  personal = false,
  operations,
  manifest,
  selfPoint,
  decorations,
  rewards,
  spotlightActive,
  onDecorations,
  onClaimReward,
  onEquipReward,
  onMoveToRoom,
  onMoveToDesk,
  onOpenPeople,
  onOpenAnnotation,
  onOpenSessions,
  onStartSpotlight,
  onStopSpotlight,
  spotlightRoster,
}: {
  readonly personal?: boolean;
  readonly operations: StudioVirtualOperationsSnapshot;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly selfPoint?: StudioVirtualSpacePoint;
  readonly decorations: StudioVirtualDecorationState;
  readonly rewards: StudioVirtualRewardInventory;
  readonly spotlightActive: boolean;
  readonly onDecorations: (next: StudioVirtualDecorationState) => void;
  readonly onClaimReward: (id: StudioVirtualRewardId) => void;
  readonly onEquipReward: (id: StudioVirtualRewardId) => void;
  readonly onMoveToRoom: (roomId: string) => void;
  readonly onMoveToDesk?: (pod: StudioTownDeskPod) => void;
  readonly onOpenPeople: () => void;
  readonly onOpenAnnotation: () => void;
  readonly onOpenSessions: () => void;
  readonly onStartSpotlight: (event: StudioTownEvent) => void;
  readonly onStopSpotlight: () => void;
  /** 스포트라이트 참석자 명단. 없으면 로컬 미리보기 기본 명단을 사용한다. */
  readonly spotlightRoster?: readonly StudioSpotlightAudienceMember[];
}) {
  const bt = useBilingual("StudioVirtualSpaceTownProgramPanel");
  const [requestedTab, setTab] = useState<Tab>("quests");
  const tabs: readonly Tab[] = personal ? TABS.filter((item) => item !== "desks" && item !== "companion") : TABS;
  const tab = tabs.includes(requestedTab) ? requestedTab : "quests";
  const [round, setRound] = useState<StudioMiniGameRound | null>(null);
  const [result, setResult] = useState<StudioMiniGameResult | null>(null);
  const [blueprintNotice, setBlueprintNotice] = useState("");
  const roster = spotlightRoster ?? DEFAULT_SPOTLIGHT_ROSTER;
  // 스포트라이트 세션은 이 패널이 소유한다. spotlightActive가 꺼지면 세션도 함께 정리된다.
  const [spotlightEvent, setSpotlightEvent] = useState<StudioTownEvent | null>(null);
  const [spotlightSession, setSpotlightSession] = useState<StudioSpotlightSession | null>(null);
  const [presenterDraft, setPresenterDraft] = useState("");
  const spotlightStageRef = useRef<HTMLElement | null>(null);
  const [fullscreenElementActive, setFullscreenElementActive] = useState(false);
  useEffect(() => {
    if (!spotlightActive) {
      setSpotlightEvent(null);
      setSpotlightSession(null);
      setPresenterDraft("");
    }
  }, [spotlightActive]);
  useEffect(() => {
    const sync = () => {
      const active = document.fullscreenElement != null;
      setFullscreenElementActive(active);
      setSpotlightSession((prev) => (prev && prev.fullscreenShare !== active ? studioSpotlightSetFullscreenShare(prev, active) : prev));
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  // 실제 플로우에서는 handleStartSpotlight가 이벤트를 넘기지만, spotlightActive만 켜진 경우를 대비한 폴백이다.
  // startSpotlightSession 클로저보다 먼저 선언해야 React Compiler가 메모이제이션을 유지한다.
  const fallbackSpotlightEvent = useMemo(() => studioTownActiveEvent(), []);
  const handleStartSpotlight = (event: StudioTownEvent) => {
    setSpotlightEvent(event);
    setPresenterDraft("");
    onStartSpotlight(event);
  };
  const handleStopSpotlight = () => {
    setSpotlightEvent(null);
    setSpotlightSession(null);
    setPresenterDraft("");
    onStopSpotlight();
  };
  const startSpotlightSession = () => {
    if (!presenterDraft) return;
    const eventId = spotlightEvent?.id ?? fallbackSpotlightEvent?.id ?? "spotlight";
    setSpotlightSession(createStudioSpotlightSession(eventId, presenterDraft, roster));
  };
  const toggleFullscreenShare = () => {
    const next = !(spotlightSession?.fullscreenShare ?? false);
    const stage = spotlightStageRef.current;
    try {
      if (next && stage && typeof stage.requestFullscreen === "function") {
        stage.requestFullscreen().catch(() => undefined);
      } else if (!next && document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
    } catch {
      // 전체화면 API 실패 시 로컬 표시 상태만 유지한다.
    }
    setSpotlightSession((prev) => (prev ? studioSpotlightSetFullscreenShare(prev, next) : prev));
  };
  const spotlightViews = useMemo(() => (spotlightSession ? studioSpotlightAudienceViews(spotlightSession) : []), [spotlightSession]);
  const spotlightPresenter = spotlightSession ? roster.find((member) => member.id === spotlightSession.presenterId) ?? null : null;
  const spotlightRaisedCount = spotlightViews.filter((view) => view.handPosition !== null).length;
  const consoleEvent = spotlightEvent ?? fallbackSpotlightEvent;
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
      {!personal && spotlightActive ? <article
        ref={spotlightStageRef}
        className="studio-vspace-town-feature-card"
        aria-label={bt("스포트라이트 방송 콘솔", "Spotlight broadcast console")}
        style={spotlightSession?.fullscreenShare && !fullscreenElementActive ? { position: "fixed", inset: 12, zIndex: 80, overflow: "auto" } : undefined}
      >
        <div><Presentation size={15} aria-hidden /><strong>{bt("스포트라이트 방송", "Spotlight broadcast")}</strong>
          <span role="status">{spotlightSession ? bt("방송 중", "Live") : bt("준비 중", "Standby")}</span></div>
        <p>{consoleEvent ? bt(consoleEvent.labelKo, consoleEvent.labelEn) : null}</p>
        <p>{bt("로컬 미리보기 — 실제 음성·영상 송출 없이 발표자 우선 송출과 청중 음소거 상태를 표시합니다.", "Local preview — presenter priority and audience mute state only; no real audio or video is broadcast.")}</p>
        {!spotlightSession ? <>
          <label>{bt("발표자", "Presenter")}
            <select value={presenterDraft} onChange={(event) => setPresenterDraft(event.target.value)}>
              <option value="">{bt("발표자를 선택하세요", "Choose a presenter")}</option>
              {roster.map((member) => <option key={member.id} value={member.id}>{bt(member.displayNameKo, member.displayNameEn)}</option>)}
            </select>
          </label>
          <div className="studio-vspace-town-actions">
            <button type="button" disabled={!presenterDraft} onClick={startSpotlightSession}>{bt("방송 시작", "Start broadcast")}</button>
          </div>
        </> : <>
          <div>
            <span><Presentation size={14} aria-hidden />{bt("발표자", "Presenter")}: <strong>{spotlightPresenter ? bt(spotlightPresenter.displayNameKo, spotlightPresenter.displayNameEn) : spotlightSession.presenterId}</strong></span>
            <span>{bt("우선 송출", "Priority send")}</span>
            <label>{bt("발표자 변경", "Change presenter")}
              <select value={spotlightSession.presenterId} onChange={(event) => {
                if (event.target.value) setSpotlightSession((prev) => (prev ? studioSpotlightSetPresenter(prev, event.target.value) : prev));
              }}>
                {roster.map((member) => <option key={member.id} value={member.id}>{bt(member.displayNameKo, member.displayNameEn)}</option>)}
              </select>
            </label>
          </div>
          <ul>
            {spotlightViews.filter((view) => !view.isPresenter).map((view) => <li key={view.member.id}>
              <span>{bt(view.member.displayNameKo, view.member.displayNameEn)}</span>
              {view.isActiveSpeaker ? <span>{bt("발언 중", "Speaking")}</span>
                : view.handPosition !== null ? <span>{bt(`손들기 ${view.handPosition}번째`, `Hand raised #${view.handPosition}`)}</span>
                : view.muted ? <span><MicOff size={13} aria-hidden />{bt("자동 음소거", "Auto-muted")}</span> : null}
              <div className="studio-vspace-town-actions">
                {view.isActiveSpeaker
                  ? <button type="button" onClick={() => setSpotlightSession((prev) => (prev ? studioSpotlightReleaseSpeaker(prev) : prev))}>{bt("발언 종료", "End turn")}</button>
                  : view.handPosition !== null ? <>
                    <button type="button" onClick={() => setSpotlightSession((prev) => (prev ? studioSpotlightNominateSpeaker(prev, view.member.id) : prev))}><Hand size={13} aria-hidden />{bt("지목하기", "Nominate")}</button>
                    <button type="button" onClick={() => setSpotlightSession((prev) => (prev ? studioSpotlightLowerHand(prev, view.member.id) : prev))}>{bt("손 내리기", "Lower hand")}</button>
                  </>
                  : <button type="button" onClick={() => setSpotlightSession((prev) => (prev ? studioSpotlightRaiseHand(prev, view.member.id) : prev))}><Hand size={13} aria-hidden />{bt("손들기", "Raise hand")}</button>}
              </div>
            </li>)}
          </ul>
          <p aria-live="polite">{bt(`손든 사람 ${spotlightRaisedCount}명`, `${spotlightRaisedCount} hands raised`)}</p>
          <div className="studio-vspace-town-actions">
            <button type="button" onClick={toggleFullscreenShare}><MonitorUp size={14} aria-hidden />{spotlightSession.fullscreenShare ? bt("전체화면 끝내기", "Exit fullscreen") : bt("발표자 화면 전체화면", "Presenter screen fullscreen")}</button>
            <button type="button" onClick={handleStopSpotlight}>{bt("방송 종료", "End broadcast")}</button>
          </div>
          {spotlightSession.fullscreenShare && !fullscreenElementActive ? <small>{bt("브라우저 전체화면 API가 없어 화면 안에서 크게 표시합니다.", "No browser fullscreen API here, so the stage is enlarged in place.")}</small> : null}
        </>}
      </article> : null}
      {events.map((event) => <article key={event.id}>
        <div><CalendarDays size={15} aria-hidden /><strong>{bt(event.labelKo, event.labelEn)}</strong></div>
        <p>{new Date(event.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–{new Date(event.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        <div className="studio-vspace-town-actions">
          <button type="button" onClick={() => onMoveToRoom(event.roomId)}>{bt("장소로 이동", "Walk to venue")}</button>
          {!personal && event.spotlight ? spotlightActive
            ? <button type="button" onClick={handleStopSpotlight}>{bt("Spotlight 종료", "Stop spotlight")}</button>
            : <button type="button" onClick={() => handleStartSpotlight(event)}><Presentation size={14} aria-hidden />{bt("발표 준비", "Prepare spotlight")}</button> : null}
        </div>
      </article>)}
      {!personal ? <><article className="studio-vspace-town-feature-card">
        <strong>{bt("소규모 Bubble", "Conversation bubble")}</strong>
        <p>{bt("근처 팀원을 최대 세 명 선택하면 전체 명단 동의 후 임시 대화 그룹이 열리고, 공간 범위를 벗어나면 종료됩니다.", "Choose up to three nearby teammates. The temporary bubble opens after full-roster consent and closes when the spatial scope ends.")}</p>
        <button type="button" onClick={onOpenPeople}><UsersRound size={14} aria-hidden />{bt("Bubble 만들기", "Create a bubble")}</button>
      </article>
      <article className="studio-vspace-town-feature-card">
        <strong>{bt("공유 화면 주석", "Shared-screen annotation")}</strong>
        <p>{bt("펜·메모를 P2P 보드에 표시하고 영구 검수 의견은 별도 검수 흐름으로 남깁니다.", "Use pen and notes on the P2P board; durable review comments remain in the review workflow.")}</p>
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
        <p>{bt("이 팀의 작업 위치로 이동해요. 자리 사용은 도착한 곳의 작업 자리에서 확인할 수 있어요.", "Walk to this team's workspace. Confirm an available desk in the workspace panel when you arrive.")}</p>
        <button type="button" style={{ minHeight: 44 }} aria-label={bt(`${pod.labelKo} 팀 자리로 이동`, `Walk to ${pod.labelEn} desk pod`)} onClick={() => onMoveToDesk ? onMoveToDesk(pod) : onMoveToRoom(pod.roomId)}>{bt("팀 자리로 이동", "Walk to desk pod")}</button>
      </article>)}
      <article className="studio-vspace-town-feature-card"><strong>{bt("작업 세션 연결", "Work-session handoff")}</strong><p>{bt("자리에서 대본 리딩·콘티·검수 세션을 명시적으로 시작하거나 이어갑니다.", "Explicitly start or continue reading, storyboard and review sessions from the desk.")}</p><button type="button" onClick={onOpenSessions}>{bt("세션 열기", "Open sessions")}</button></article>
    </div> : null}

    {tab === "blueprints" ? <div className="studio-vspace-town-cards">
      {blueprintNotice ? <p role="status">{blueprintNotice}</p> : null}
      {STUDIO_TOWN_BLUEPRINTS.map((blueprint) => <article key={blueprint.id}>
        <div><Wrench size={15} aria-hidden /><strong>{bt(blueprint.labelKo, blueprint.labelEn)}</strong><span>{blueprint.decor.length}</span></div>
        <p>{bt("현재 장소에 업무 테마 가구와 조명을 배치해요. 출입구와 이동 동선을 보호하며 꾸미기에서 개별 편집할 수 있어요.", "Arrange work-themed furniture and lighting in this place. Entrances and walking routes stay clear; edit individual items in customization.")}</p>
        <button type="button" disabled={decorations.placements.length >= 36} onClick={() => {
          const placement = applyStudioTownBlueprint(decorations, manifest, blueprint, selfPoint);
          if (placement.ok) {
            onDecorations(placement.state);
            setBlueprintNotice(bt(`${blueprint.labelKo} 가구 ${blueprint.decor.length}개를 배치했어요. 꾸미기에서 이동·회전·삭제할 수 있어요.`, `Placed ${blueprint.decor.length} objects for ${blueprint.labelEn}. Move, rotate or remove them in customization.`));
          } else setBlueprintNotice(placement.reason === "limit"
            ? bt(`이 배치에는 빈 자리 ${blueprint.decor.length}개가 필요해요. 최대 36개까지 배치할 수 있어요.`, `This layout needs ${blueprint.decor.length} free object slots. The limit is 36.`)
            : bt("이 장소에서는 안전한 배치 공간을 찾지 못했어요. 다른 장소로 이동하거나 기존 가구를 옮겨 주세요. 기존 배치는 유지했어요.", "No safe layout space was found here. Try another place or move existing furniture. Your layout was preserved."));
        }}>{bt("블루프린트 배치", "Place blueprint")}</button>
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
