import { CameraOff, MicOff, Network, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { Suspense, useState } from "react";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

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
import { createStudioVirtualSpacePanel } from "./StudioVirtualSpaceOnDemandPanel";

const StudioVirtualSpaceRtcPanel = createStudioVirtualSpacePanel(() => import("./StudioVirtualSpaceRtcPanel").then((module) => ({ default: module.StudioVirtualSpaceRtcPanel })));

export type StudioVirtualSpaceEntryVariant = "entry" | "character-onboarding";

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
}: {
  readonly avatarIndex: number;
  readonly artStyle?: StudioVirtualArtStyleKey;
  readonly nickname: string;
  readonly returning: boolean;
  readonly projectName: string;
  readonly personal?: boolean;
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
  const characterSelected = Number.isInteger(avatarIndex)
    && avatarIndex >= 0
    && avatarIndex < STUDIO_CHARACTER_SKINS.length;
  const normalizedNickname = normalizeStudioVirtualSpaceNickname(nickname);
  const selectedCharacter = characterSelected
    ? studioCharacterSkinForArtStyle(STUDIO_CHARACTER_SKINS[avatarIndex]!, artStyle)
    : null;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const resolvedBackLabel = backLabel ?? (onboarding
    ? bt("홈으로 돌아가기", "Back to home")
    : bt("작업 목록으로", "Back to work list"));

  return <div className="studio-vspace-entry" data-route-ready={onboarding ? "studio-character-onboarding" : "studio-virtual-entry"} data-art-style={artStyle} data-entry-variant={variant}>
    <Container size="wide" className="studio-vspace-entry-container">
      <section className="studio-vspace-entry-card" aria-labelledby="studio-vspace-entry-title">
        <div className="studio-vspace-entry-copy">
          <p className="studio-vspace-entry-kicker"><Sparkles size={15} aria-hidden /> {onboarding ? "ToonStudio Character" : "ToonStudio Spatial Campus"}</p>
          <h1 id="studio-vspace-entry-title">{onboarding
            ? returning
              ? bt("내 캐릭터를 확인하세요", "Confirm your character")
              : bt("함께할 캐릭터를 선택하세요", "Choose the character who will join you")
            : returning
              ? bt("다시 스튜디오로", "Return to the studio")
              : personal ? bt("내 원고 작업실에 입장하세요", "Enter your manuscript office")
                : bt("함께 작업할 스튜디오에 입장하세요", "Enter your shared work studio")}</h1>
          <p>{onboarding
            ? bt(
              "직접 고른 캐릭터는 홈, 프로필, 방문자 목록과 가상스튜디오에서 나를 이어 주는 모습이 됩니다. 나중에도 언제든 변경할 수 있어요.",
              "The character you choose connects your identity across home, profile, visitor lists and the virtual studio. You can change it later.",
            )
            : personal ? bt(
              "내 캐릭터로 작업실에 입장해 원고 작업을 시작하세요. 내 작품을 열거나 새 작품을 만들고, 작업할 위치와 분위기를 고를 수 있어요.",
              "Enter your office with your character to work on a manuscript. Open a work or create one, then choose your workspace and atmosphere.",
            ) : bt(
              `${projectName}에서 오늘 할 원고 작업을 고르고, 동료에게 다가가 대화하거나 검수를 요청하세요. 작업 자리로 돌아와 제작을 이어갈 수 있어요.`,
              `Choose today's manuscript work in ${projectName}, walk to a teammate to talk or request a review, and return to your desk to continue creating.`,
            )}</p>
          {!onboarding && !personal ? <ul className="studio-vspace-entry-privacy" aria-label={bt("입장 시 기본 상태", "Default state on entry")}>
            <li><MicOff size={16} aria-hidden />{bt("마이크 꺼짐", "Microphone off")}</li>
            <li><CameraOff size={16} aria-hidden />{bt("카메라 꺼짐", "Camera off")}</li>
            <li><Network size={16} aria-hidden />{bt("동료가 수락하면 함께 작업", "Work together after an invitation is accepted")}</li>
            <li><ShieldCheck size={16} aria-hidden />{bt("미디어는 별도 동의 후 시작", "Media starts only after consent")}</li>
          </ul> : null}
        </div>

        <div className="studio-vspace-entry-identity">
          <label htmlFor="studio-virtual-nickname">
            <span><UserRound size={16} aria-hidden />{bt("공개 닉네임", "Public nickname")}<small>{Array.from(nickname).length}/{STUDIO_VIRTUAL_SPACE_NICKNAME_MAX_GRAPHEMES}</small></span>
            <input
              id="studio-virtual-nickname"
              value={nickname}
              maxLength={STUDIO_VIRTUAL_SPACE_NICKNAME_MAX_GRAPHEMES}
              autoComplete="nickname"
              inputMode="text"
              aria-invalid={nickname.length > 0 && !normalizedNickname}
              aria-describedby="studio-virtual-nickname-help"
              placeholder={bt("예: 희준 작가", "For example, Creator Kim")}
              onChange={(event) => onNickname(event.target.value)}
            />
            <small id="studio-virtual-nickname-help" data-invalid={nickname.length > 0 && !normalizedNickname || undefined}>
              {normalizedNickname
                ? bt("이 이름이 캐릭터 이름표와 팀원 목록에 표시됩니다.", "This name appears on your character and in teammate lists.")
                : bt("2~16자의 한글·영문·숫자·공백을 사용할 수 있어요. 이메일은 공개되지 않습니다.", "Use 2–16 letters, numbers or spaces. Email addresses are never shown publicly.")}
            </small>
          </label>
          <div className="studio-vspace-entry-identity-preview" data-empty={!selectedCharacter || undefined} aria-live="polite">
            {selectedCharacter ? <StudioVirtualCharacterPreview skin={selectedCharacter} /> : <UserRound size={34} aria-hidden />}
            <span><small>{bt("공개 이름표", "Public nameplate")}</small><strong>{normalizedNickname ?? bt("닉네임을 입력하세요", "Enter a nickname")}</strong></span>
          </div>
        </div>

        <StudioVirtualThemeCharacterPicker artStyle={artStyle} avatarIndex={avatarIndex} onSelect={onAvatarIndex} />
        <fieldset className="studio-vspace-entry-avatars">
          <legend>{bt("내 캐릭터", "My character")}</legend>
          {STUDIO_CHARACTER_SKINS.map((sourceCharacter, index) => {
            if (sourceCharacter.selectionOnly && sourceCharacter.nativeArtStyle) return null;
            const character = studioCharacterSkinForArtStyle(sourceCharacter, artStyle);
            return <button key={sourceCharacter.key} type="button"
              className={cn("studio-vspace-entry-avatar", avatarIndex === index && "is-selected")}
              aria-label={bt(`${character.labelKo} 캐릭터 선택`, `Select ${character.labelEn} character`)}
              aria-pressed={avatarIndex === index}
              onClick={() => onAvatarIndex(index)}>
              <span className="studio-vspace-entry-avatar-preview">
                <StudioVirtualCharacterPreview skin={character} />
              </span>
              <strong>{bt(character.labelKo, character.labelEn)}</strong>
              <span>{bt("걷기·앉기·인사 지원", "Walk, sit and wave")}</span>
              {avatarIndex === index ? <b aria-hidden>✓</b> : null}
            </button>;
          })}
        </fieldset>

        {!onboarding ? <details className="studio-vspace-entry-advanced" open={advancedOpen}
          onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
          <summary>{personal ? bt("아트 스타일 설정", "Art style settings") : bt("아트 스타일·연결 고급 설정", "Advanced art and connection settings")}</summary>
          {advancedOpen ? <div className="studio-vspace-entry-advanced-body">
            <fieldset className="studio-vspace-entry-art-styles">
              <legend>{bt("아트 스타일", "Art direction")}</legend>
              <p>{bt(
                "건물·가구·바닥의 작화를 선택해요. 내 캐릭터는 직접 고른 모습을 유지해요.",
                "Choose the art for buildings, furniture and floors. Your character keeps the look you chose.",
              )}</p>
              <div>
                {STUDIO_VIRTUAL_ART_STYLES.map((style) => {
                  return <button
                    key={style.key}
                    type="button"
                    data-art-style={style.key}
                    aria-pressed={artStyle === style.key}
                    className={cn("studio-vspace-entry-art-style", artStyle === style.key && "is-selected")}
                    onClick={() => onArtStyle?.(style.key)}
                  >
                    <span className="studio-vspace-entry-art-style-preview" aria-hidden>
                      <StudioVirtualExperienceArtPreview className="studio-vspace-entry-art-style-world" kind="landmarks" artStyle={style.key} frame={0} />
                      <i />
                    </span>
                    <strong>{bt(style.labelKo, style.labelEn)}</strong>
                    <small>{bt(style.descriptionKo, style.descriptionEn)}</small>
                  </button>;
                })}
              </div>
            </fieldset>
            {!personal ? <Suspense fallback={<p role="status">{bt("연결 설정 불러오는 중…", "Loading connection settings…")}</p>}><StudioVirtualSpaceRtcPanel entryOnly /></Suspense> : null}
          </div> : null}
        </details> : null}

        <div className="studio-vspace-entry-actions">
          <Link href={backHref} className={buttonClass({ variant: "outline" })}>{resolvedBackLabel}</Link>
          <button type="button" className={buttonClass()} disabled={!characterSelected || !normalizedNickname} onClick={onEnter}>
            {onboarding
              ? returning ? bt("이 캐릭터로 계속", "Continue with this character") : bt("이 캐릭터로 시작", "Start with this character")
              : returning ? bt("이 캐릭터로 바로 입장", "Enter with this character") : bt("선택하고 입장", "Choose and enter")}
          </button>
        </div>
        <p className="studio-vspace-entry-note" role={!characterSelected || !normalizedNickname ? "status" : undefined}>{!normalizedNickname
          ? bt("공개 닉네임을 확인하면 입장할 수 있어요.", "Confirm a public nickname to enter.")
          : characterSelected
            ? onboarding
              ? bt("닉네임과 캐릭터는 이 브라우저에 저장되며 홈에서 다시 바꿀 수 있습니다.", "Your nickname and character are saved in this browser and can be changed from home.")
              : bt("닉네임·캐릭터·아트 스타일 선택은 이 브라우저에 저장됩니다.", "Nickname, character and art-style choices are saved in this browser.")
            : bt("캐릭터를 직접 선택하면 다음 단계로 이동할 수 있어요.", "Choose a character to continue.")}</p>
      </section>
    </Container>
  </div>;
}
