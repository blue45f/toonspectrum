import { CameraOff, MicOff, Network, ShieldCheck, Sparkles } from "lucide-react";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  STUDIO_VIRTUAL_ART_STYLES,
  type StudioVirtualArtStyleKey,
} from "./studio-virtual-space-art-style";
import { STUDIO_CHARACTER_SKINS, studioCharacterSkinForArtStyle } from "./studio-virtual-space-character-skins";
import { StudioVirtualSpaceRtcPanel } from "./StudioVirtualSpaceRtcPanel";
import "./studio-virtual-space.css";

export type StudioVirtualSpaceEntryVariant = "entry" | "character-onboarding";

export function StudioVirtualSpaceEntryLobby({
  avatarIndex,
  artStyle = DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  returning,
  projectName,
  variant = "entry",
  backHref = "/studio",
  backLabel,
  onAvatarIndex,
  onArtStyle,
  onEnter,
}: {
  readonly avatarIndex: number;
  readonly artStyle?: StudioVirtualArtStyleKey;
  readonly returning: boolean;
  readonly projectName: string;
  readonly variant?: StudioVirtualSpaceEntryVariant;
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly onAvatarIndex: (avatarIndex: number) => void;
  readonly onArtStyle?: (artStyle: StudioVirtualArtStyleKey) => void;
  readonly onEnter: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceEntryLobby");
  const onboarding = variant === "character-onboarding";
  const characterSelected = Number.isInteger(avatarIndex)
    && avatarIndex >= 0
    && avatarIndex < STUDIO_CHARACTER_SKINS.length;
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
              : bt("입장할 캐릭터를 선택하세요", "Choose your character before entering")}</h1>
          <p>{onboarding
            ? bt(
              "직접 고른 캐릭터는 홈, 프로필, 방문자 목록과 가상스튜디오에서 나를 이어 주는 모습이 됩니다. 나중에도 언제든 변경할 수 있어요.",
              "The character you choose connects your identity across home, profile, visitor lists and the virtual studio. You can change it later.",
            )
            : bt(
              `${projectName} 공간에서 팀원과 이동하고, 대화·검수·화이트보드를 P2P로 함께 사용할 수 있어요.`,
              `Move through ${projectName}, meet teammates and use conversations, reviews and whiteboards over P2P.`,
            )}</p>
          {!onboarding ? <ul className="studio-vspace-entry-privacy" aria-label={bt("입장 시 기본 상태", "Default state on entry")}>
            <li><MicOff size={16} aria-hidden />{bt("마이크 꺼짐", "Microphone off")}</li>
            <li><CameraOff size={16} aria-hidden />{bt("카메라 꺼짐", "Camera off")}</li>
            <li><Network size={16} aria-hidden />{bt("소규모 협업은 P2P 우선", "Small-group collaboration is P2P-first")}</li>
            <li><ShieldCheck size={16} aria-hidden />{bt("미디어는 별도 동의 후 시작", "Media starts only after consent")}</li>
          </ul> : null}
        </div>

        <fieldset className="studio-vspace-entry-avatars">
          <legend>{bt("내 캐릭터", "My character")}</legend>
          {STUDIO_CHARACTER_SKINS.map((sourceCharacter, index) => {
            const character = studioCharacterSkinForArtStyle(sourceCharacter, artStyle);
            return <button key={sourceCharacter.key} type="button"
              className={cn("studio-vspace-entry-avatar", avatarIndex === index && "is-selected")}
              aria-label={bt(`${character.labelKo} 캐릭터 선택`, `Select ${character.labelEn} character`)}
              aria-pressed={avatarIndex === index}
              onClick={() => onAvatarIndex(index)}>
              <span className="studio-vspace-entry-avatar-preview">
                <img src={character.directional.down} alt="" draggable={false} />
              </span>
              <strong>{bt(character.labelKo, character.labelEn)}</strong>
              <span>{bt("걷기·앉기·인사 지원", "Walk, sit and wave")}</span>
              {avatarIndex === index ? <b aria-hidden>✓</b> : null}
            </button>;
          })}
        </fieldset>

        {!onboarding ? <fieldset className="studio-vspace-entry-art-styles">
          <legend>{bt("아트 스타일", "Art direction")}</legend>
          <p>{bt(
            "팀과 기능은 유지하면서 캐릭터·NPC·건물·타일·환경 애니메이션을 독립 아트팩으로 전환합니다.",
            "Keep the same team and tools while switching characters, NPCs, architecture, tiles and environment animation as an independent art pack.",
          )}</p>
          <div>
            {STUDIO_VIRTUAL_ART_STYLES.map((style) => {
              const stylePreview = studioCharacterSkinForArtStyle(STUDIO_CHARACTER_SKINS[0]!, style.key);
              return <button
                key={style.key}
                type="button"
                data-art-style={style.key}
                aria-pressed={artStyle === style.key}
                className={cn("studio-vspace-entry-art-style", artStyle === style.key && "is-selected")}
                onClick={() => onArtStyle?.(style.key)}
              >
                <span className="studio-vspace-entry-art-style-preview" aria-hidden>
                  <img src={stylePreview.directional.down} alt="" draggable={false} />
                  <i />
                </span>
                <strong>{bt(style.labelKo, style.labelEn)}</strong>
                <small>{bt(style.descriptionKo, style.descriptionEn)}</small>
              </button>;
            })}
          </div>
        </fieldset> : null}

        {!onboarding ? <StudioVirtualSpaceRtcPanel entryOnly /> : null}

        <div className="studio-vspace-entry-actions">
          <Link href={backHref} className={buttonClass({ variant: "outline" })}>{resolvedBackLabel}</Link>
          <button type="button" className={buttonClass()} disabled={!characterSelected} onClick={onEnter}>
            {onboarding
              ? returning ? bt("이 캐릭터로 계속", "Continue with this character") : bt("이 캐릭터로 시작", "Start with this character")
              : returning ? bt("이 캐릭터로 바로 입장", "Enter with this character") : bt("선택하고 입장", "Choose and enter")}
          </button>
        </div>
        <p className="studio-vspace-entry-note" role={!characterSelected ? "status" : undefined}>{characterSelected
          ? onboarding
            ? bt("선택한 캐릭터는 이 브라우저에 저장되며 홈에서 다시 바꿀 수 있습니다.", "Your choice is saved in this browser and can be changed from home.")
            : bt("캐릭터와 아트 스타일 선택은 이 브라우저에 저장됩니다.", "Character and art-style choices are saved in this browser.")
          : bt("캐릭터를 직접 선택하면 다음 단계로 이동할 수 있어요.", "Choose a character to continue.")}</p>
      </section>
    </Container>
  </div>;
}
