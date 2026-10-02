import { CameraOff, Lock, MicOff, Network, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { Suspense, useState, type ReactNode } from "react";

import Link from "@/shared/navigation/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  STUDIO_VIRTUAL_ART_STYLES,
  type StudioVirtualArtStyleKey,
} from "./studio-virtual-space-art-style";
import { StudioVirtualCharacterPreview } from "./StudioVirtualCharacterPreview";
import { StudioVirtualThemeCharacterPicker } from "./StudioVirtualThemeCharacterPicker";
import { StudioVirtualExperienceArtPreview } from "./StudioVirtualExperienceArtPreview";
import { STUDIO_CHARACTER_SKINS, studioCharacterSkinForArtStyle } from "./studio-virtual-space-character-skins";
import {
  STUDIO_VIRTUAL_SPACE_NICKNAME_MAX_GRAPHEMES,
  normalizeStudioVirtualSpaceNickname,
} from "./studio-virtual-space-entry-preference";
import "./studio-virtual-space.css";
import "./studio-workspace-live.css";
import "./hud/space-lobby.css";
import { createStudioVirtualSpacePanel } from "./StudioVirtualSpaceOnDemandPanel";

const StudioVirtualSpaceRtcPanel = createStudioVirtualSpacePanel(() => import("./StudioVirtualSpaceRtcPanel").then((module) => ({ default: module.StudioVirtualSpaceRtcPanel })));

export type StudioVirtualSpaceEntryVariant = "entry" | "character-onboarding";

function LobbyChip({ icon, children }: { readonly icon: ReactNode; readonly children: ReactNode }) {
  return <li>{icon}<span>{children}</span></li>;
}

/**
 * 입장 로비(게더형 2열).
 * 왼쪽 무대는 고른 캐릭터와 공개 이름표를 월드 아트 위에 크게 보여 주고,
 * 오른쪽 카드는 이름·캐릭터·아트 스타일을 고른 뒤 입장한다. 입장 전에는 위치·미디어·신호를 만들지 않는다.
 */
export function StudioVirtualSpaceEntryLobby({
  avatarIndex,
  artStyle = DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  nickname,
  returning,
  projectName,
  personal = false,
  variant = "entry",
  backHref = "/studio",
  backLabel,
  onAvatarIndex,
  onArtStyle,
  onNickname,
  onEnter,
  guestMode = false,
}: {
  readonly avatarIndex: number;
  readonly artStyle?: StudioVirtualArtStyleKey;
  readonly nickname: string;
  readonly returning: boolean;
  readonly projectName: string;
  readonly personal?: boolean;
  /** Invite-link guest entry: nickname only, no character/art/RTC setup. */
  readonly guestMode?: boolean;
  readonly variant?: StudioVirtualSpaceEntryVariant;
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly onAvatarIndex: (avatarIndex: number) => void;
  readonly onArtStyle?: (artStyle: StudioVirtualArtStyleKey) => void;
  readonly onNickname: (nickname: string) => void;
  readonly onEnter: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceEntryLobby");
  const onboarding = variant === "character-onboarding";
  const sourceCharacter = guestMode ? STUDIO_CHARACTER_SKINS[0] : STUDIO_CHARACTER_SKINS[avatarIndex];
  const characterSelected = guestMode || (Number.isInteger(avatarIndex) && Boolean(sourceCharacter));
  const normalizedNickname = normalizeStudioVirtualSpaceNickname(nickname);
  const selectedCharacter = characterSelected && sourceCharacter ? studioCharacterSkinForArtStyle(sourceCharacter, artStyle) : null;
  const nicknameInvalid = nickname.length > 0 && !normalizedNickname;
  const canEnter = characterSelected && Boolean(normalizedNickname);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const resolvedBackLabel = backLabel ?? (onboarding
    ? bt("홈으로 돌아가기", "Back to home")
    : bt("작업 목록으로", "Back to work list"));
  const title = onboarding
    ? returning
      ? bt("내 캐릭터를 확인하세요", "Confirm your character")
      : bt("함께할 캐릭터를 선택하세요", "Choose the character who will join you")
    : guestMode
      ? bt("초대받은 공간에 입장하세요", "Enter the space you were invited to")
      : returning
        ? bt("다시 스튜디오로", "Return to the studio")
        : personal ? bt("내 원고 작업실에 입장하세요", "Enter your manuscript office")
          : bt("함께 작업할 스튜디오에 입장하세요", "Enter your shared work studio");
  const description = onboarding
    ? bt(
      "직접 고른 캐릭터는 홈, 프로필, 방문자 목록과 가상스튜디오에서 나를 이어 주는 모습이 돼요. 나중에도 언제든 변경할 수 있어요.",
      "The character you choose connects your identity across home, profile, visitor lists and the virtual studio. You can change it later.",
    )
    : guestMode ? bt(
      "초대 링크로 입장하는 게스트예요. 닉네임만 정하면 바로 들어갈 수 있어요. 공간 편집은 할 수 없고, 이동과 음성 대화만 가능해요.",
      "You're entering as an invited guest. Just pick a nickname to join. You can't edit the space — only move around and voice chat.",
    )
      : personal ? bt(
        "내 캐릭터로 작업실에 입장해 원고 작업을 시작하세요. 내 작품을 열거나 새 작품을 만들고, 작업할 위치와 분위기를 고를 수 있어요.",
        "Enter your office with your character to work on a manuscript. Open a work or create one, then choose your workspace and atmosphere.",
      ) : bt(
        `${projectName}에서 오늘 할 원고 작업을 고르고, 동료에게 다가가 대화하거나 검수를 요청하세요. 작업 자리로 돌아와 제작을 이어갈 수 있어요.`,
        `Choose today's manuscript work in ${projectName}, walk to a teammate to talk or request a review, and return to your desk to continue creating.`,
      );
  const enterLabel = onboarding
    ? returning ? bt("이 캐릭터로 계속", "Continue with this character") : bt("이 캐릭터로 시작", "Start with this character")
    : guestMode ? bt("게스트로 입장", "Enter as guest")
      : returning ? bt("이 캐릭터로 바로 입장", "Enter with this character") : bt("선택하고 입장", "Choose and enter");
  const note = !normalizedNickname
    ? bt("공개 닉네임을 확인하면 입장할 수 있어요.", "Confirm a public nickname to enter.")
    : characterSelected
      ? onboarding
        ? bt("닉네임과 캐릭터는 이 브라우저에 저장되며 홈에서 다시 바꿀 수 있어요.", "Your nickname and character are saved in this browser and can be changed from home.")
        : guestMode
          ? bt("게스트 세션은 24시간 동안 유효해요.", "Your guest session is valid for 24 hours.")
          : bt("닉네임·캐릭터·아트 스타일 선택은 이 브라우저에 저장돼요.", "Nickname, character and art-style choices are saved in this browser.")
      : bt("캐릭터를 직접 선택하면 다음 단계로 이동할 수 있어요.", "Choose a character to continue.");

  return <div className="studio-vspace-entry space-lobby" data-route-ready={onboarding ? "studio-character-onboarding" : "studio-virtual-entry"}
    data-art-style={artStyle} data-entry-variant={variant}>
    <div className="space-lobby__backdrop" aria-hidden>
      <StudioVirtualExperienceArtPreview className="space-lobby__backdrop-art" kind="landmarks" artStyle={artStyle} frame={0} preserveAspectRatio="xMidYMid slice" />
    </div>
    <div className="space-lobby__layout">
      <section className="space-lobby__stage" aria-label={bt("입장 미리보기", "Entry preview")}>
        <header className="space-lobby__stage-head">
          <p className="space-lobby__kicker"><Sparkles size={15} aria-hidden />{onboarding ? "ToonStudio Character" : "ToonStudio Spatial Campus"}</p>
          <p className="space-lobby__place">{projectName}</p>
        </header>
        <div className="space-lobby__avatar" data-empty={!selectedCharacter || undefined}>
          <p className="space-lobby__nameplate" aria-live="polite">
            <small>{bt("공개 이름표", "Public nameplate")}</small>
            <strong>{normalizedNickname ?? bt("닉네임을 입력하세요", "Enter a nickname")}</strong>
          </p>
          {selectedCharacter
            ? <StudioVirtualCharacterPreview skin={selectedCharacter} className="space-lobby__character" />
            : <span className="space-lobby__placeholder"><UserRound size={44} aria-hidden /><small>{bt("캐릭터를 골라 주세요", "Choose a character")}</small></span>}
          <span className="space-lobby__floor" aria-hidden />
        </div>
        {!onboarding && !personal && !guestMode ? <ul className="space-lobby__chips" aria-label={bt("입장 시 기본 상태", "Default state on entry")}>
          <LobbyChip icon={<MicOff size={15} aria-hidden />}>{bt("마이크 꺼짐", "Microphone off")}</LobbyChip>
          <LobbyChip icon={<CameraOff size={15} aria-hidden />}>{bt("카메라 꺼짐", "Camera off")}</LobbyChip>
          <LobbyChip icon={<Network size={15} aria-hidden />}>{bt("동료가 수락하면 함께 작업", "Work together after an invitation is accepted")}</LobbyChip>
          <LobbyChip icon={<ShieldCheck size={15} aria-hidden />}>{bt("미디어는 별도 동의 후 시작", "Media starts only after consent")}</LobbyChip>
        </ul> : null}
        {personal && !onboarding ? <ul className="space-lobby__chips" aria-label={bt("개인 작업실 안내", "About your personal office")}>
          <LobbyChip icon={<Lock size={15} aria-hidden />}>{bt("나만 입장하는 개인 작업실", "A personal office only you enter")}</LobbyChip>
          <LobbyChip icon={<MicOff size={15} aria-hidden />}>{bt("마이크·카메라를 쓰지 않아요", "No microphone or camera")}</LobbyChip>
        </ul> : null}
      </section>

      <section className="studio-vspace-entry-card space-lobby__form" aria-labelledby="studio-vspace-entry-title">
        <header className="space-lobby__heading">
          <h1 id="studio-vspace-entry-title">{title}</h1>
          <p>{description}</p>
        </header>

        <label className="space-lobby__field" htmlFor="studio-virtual-nickname">
          <span className="space-lobby__field-label"><UserRound size={16} aria-hidden />{bt("공개 닉네임", "Public nickname")}
            <small>{Array.from(nickname).length}/{STUDIO_VIRTUAL_SPACE_NICKNAME_MAX_GRAPHEMES}</small></span>
          <input
            id="studio-virtual-nickname"
            value={nickname}
            maxLength={STUDIO_VIRTUAL_SPACE_NICKNAME_MAX_GRAPHEMES}
            autoComplete="nickname"
            inputMode="text"
            aria-invalid={nicknameInvalid}
            aria-describedby="studio-virtual-nickname-help"
            placeholder={bt("예: 희준 작가", "For example, Creator Kim")}
            onChange={(event) => onNickname(event.target.value)}
          />
          <small id="studio-virtual-nickname-help" data-invalid={nicknameInvalid || undefined}>
            {normalizedNickname
              ? bt("이 이름이 캐릭터 이름표와 팀원 목록에 표시돼요.", "This name appears on your character and in teammate lists.")
              : bt("2~16자의 한글·영문·숫자·공백을 사용할 수 있어요. 이메일은 공개되지 않아요.", "Use 2–16 letters, numbers or spaces. Email addresses are never shown publicly.")}
          </small>
        </label>

        {!guestMode ? <div className="space-lobby__picker">
          <StudioVirtualThemeCharacterPicker mode="all" artStyle={artStyle} avatarIndex={avatarIndex} onSelect={onAvatarIndex} />
        </div> : null}

        {!onboarding && !guestMode ? <details className="space-lobby__advanced" open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
          <summary>{personal ? bt("아트 스타일 설정", "Art style settings") : bt("아트 스타일·연결 고급 설정", "Advanced art and connection settings")}</summary>
          {advancedOpen ? <div className="space-lobby__advanced-body">
            <fieldset className="studio-vspace-art-style-picker space-lobby__art-styles">
              <legend>{bt("아트 스타일", "Art direction")}</legend>
              <p>{bt(
                "건물·가구·바닥의 작화를 선택해요. 내 캐릭터는 직접 고른 모습을 유지해요.",
                "Choose the art for buildings, furniture and floors. Your character keeps the look you chose.",
              )}</p>
              <div className="studio-vspace-art-style-grid">
                {STUDIO_VIRTUAL_ART_STYLES.map((style) => <button key={style.key} type="button" data-art-style={style.key}
                  aria-pressed={artStyle === style.key} title={bt(style.descriptionKo, style.descriptionEn)}
                  onClick={() => onArtStyle?.(style.key)}>
                  <StudioVirtualExperienceArtPreview kind="landmarks" artStyle={style.key} frame={0} preserveAspectRatio="xMidYMid slice" />
                  <small>{bt(style.labelKo, style.labelEn)}</small>
                </button>)}
              </div>
            </fieldset>
            {!personal ? <Suspense fallback={<p role="status">{bt("연결 설정 불러오는 중…", "Loading connection settings…")}</p>}><StudioVirtualSpaceRtcPanel entryOnly /></Suspense> : null}
          </div> : null}
        </details> : null}

        <details className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-black text-fg [&::-webkit-details-marker]:hidden">
            {bt("입장 전 조작법 미리보기", "Preview controls before entering")}
            <span aria-hidden className="text-base leading-none text-fg-3">＋</span>
          </summary>
          <div className="border-t border-white/10 px-4 py-3">
            <ul className="flex flex-col gap-2 text-xs leading-5 text-fg-2">
              <li className="flex items-center gap-2"><strong className="w-14 shrink-0 text-fg">{bt("이동", "Move")}</strong><span><kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-[0.68rem] font-bold">WASD</kbd> · {bt("방향키 · 빈 공간 클릭 · 모바일 조이스틱", "arrow keys · click empty space · mobile joystick")}</span></li>
              <li className="flex items-center gap-2"><strong className="w-14 shrink-0 text-fg">{bt("상호작용", "Interact")}</strong><span><kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-[0.68rem] font-bold">X</kbd> · {bt("가까이 다가가 상호작용(E도 가능) · 모바일은 화면의 상호작용 버튼", "walk up close and interact (E works too) · on-screen interact button on mobile")}</span></li>
              <li className="flex items-center gap-2"><strong className="w-14 shrink-0 text-fg">{bt("리액션", "Reactions")}</strong><span><kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-[0.68rem] font-bold">1</kbd>–<kbd className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-[0.68rem] font-bold">9</kbd> · {bt("바로 리액션 보내기(Z는 춤) · 모바일은 도크의 리액션 버튼", "send a reaction instantly (Z to dance) · reaction button in the mobile dock")}</span></li>
            </ul>
            <p className="mt-2 text-[0.7rem] leading-5 text-fg-3">{bt("입장하면 3단계 미니 투어가 나타나요. 화면을 막지 않고, 직접 걷고·상호작용하고·리액션하면 다음 단계로 넘어가요. 언제든 건너뛸 수 있고, 다시 보지 않기로 저장하거나 ? 도움말에서 다시 볼 수 있어요.", "A 3-step mini tour appears after you enter. It never blocks the screen and advances as you walk, interact and react. Skip it anytime, choose not to see it again, or replay it from the ? help.")}</p>
          </div>
        </details>

        <div className="space-lobby__actions">
          <Link href={backHref} className={buttonClass({ variant: "outline" })}>{resolvedBackLabel}</Link>
          <button type="button" className={buttonClass()} disabled={!canEnter} onClick={onEnter}>{enterLabel}</button>
        </div>
        <p className="space-lobby__note" role={!canEnter ? "status" : undefined}>{note}</p>
      </section>
    </div>
  </div>;
}
