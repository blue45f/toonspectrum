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
import { STUDIO_CHARACTER_SKINS } from "./studio-virtual-space-character-skins";
import { STUDIO_VIRTUAL_SPACE_AUTO_AVATAR } from "./studio-virtual-space-model";

export function StudioVirtualSpaceEntryLobby({
  avatarIndex,
  artStyle = DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  returning,
  projectName,
  onAvatarIndex,
  onArtStyle,
  onEnter,
}: {
  readonly avatarIndex: number;
  readonly artStyle?: StudioVirtualArtStyleKey;
  readonly returning: boolean;
  readonly projectName: string;
  readonly onAvatarIndex: (avatarIndex: number) => void;
  readonly onArtStyle?: (artStyle: StudioVirtualArtStyleKey) => void;
  readonly onEnter: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceEntryLobby");
  const previewCharacter = STUDIO_CHARACTER_SKINS[0]!;
  return <div className="studio-vspace-entry" data-route-ready="studio-virtual-entry" data-art-style={artStyle}>
    <Container size="wide" className="studio-vspace-entry-container">
      <section className="studio-vspace-entry-card" aria-labelledby="studio-vspace-entry-title">
        <div className="studio-vspace-entry-copy">
          <p className="studio-vspace-entry-kicker"><Sparkles size={15} aria-hidden /> ToonStudio Spatial Campus</p>
          <h1 id="studio-vspace-entry-title">{returning
            ? bt("다시 스튜디오로", "Return to the studio")
            : bt("입장할 캐릭터를 선택하세요", "Choose your character before entering")}</h1>
          <p>{bt(
            `${projectName} 공간에서 팀원과 이동하고, 대화·검수·화이트보드를 P2P로 함께 사용할 수 있어요.`,
            `Move through ${projectName}, meet teammates and use conversations, reviews and whiteboards over P2P.`,
          )}</p>
          <ul className="studio-vspace-entry-privacy" aria-label={bt("입장 시 기본 상태", "Default state on entry")}>
            <li><MicOff size={16} aria-hidden />{bt("마이크 꺼짐", "Microphone off")}</li>
            <li><CameraOff size={16} aria-hidden />{bt("카메라 꺼짐", "Camera off")}</li>
            <li><Network size={16} aria-hidden />{bt("소규모 협업은 P2P 우선", "Small-group collaboration is P2P-first")}</li>
            <li><ShieldCheck size={16} aria-hidden />{bt("미디어는 별도 동의 후 시작", "Media starts only after consent")}</li>
          </ul>
        </div>

        <fieldset className="studio-vspace-entry-avatars">
          <legend>{bt("내 캐릭터", "My character")}</legend>
          <button type="button" className={cn("studio-vspace-entry-avatar studio-vspace-entry-avatar--auto",
            avatarIndex === STUDIO_VIRTUAL_SPACE_AUTO_AVATAR && "is-selected")}
            aria-pressed={avatarIndex === STUDIO_VIRTUAL_SPACE_AUTO_AVATAR}
            onClick={() => onAvatarIndex(STUDIO_VIRTUAL_SPACE_AUTO_AVATAR)}>
            <Sparkles size={34} aria-hidden />
            <strong>{bt("자동 선택", "Automatic")}</strong>
            <span>{bt("내 식별자에 맞춘 안정적인 캐릭터", "A stable character selected from your identity")}</span>
          </button>
          {STUDIO_CHARACTER_SKINS.map((character, index) => <button key={character.key} type="button"
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
          </button>)}
        </fieldset>

        <fieldset className="studio-vspace-entry-art-styles">
          <legend>{bt("아트 스타일", "Art direction")}</legend>
          <p>{bt(
            "캐릭터와 공간은 그대로 유지하면서 전체 작화 톤을 바꿉니다. 언제든 공간 안에서 다시 변경할 수 있어요.",
            "Keep the same character and layout while changing the full art direction. You can switch again inside the space.",
          )}</p>
          <div>
            {STUDIO_VIRTUAL_ART_STYLES.map((style) => <button
              key={style.key}
              type="button"
              data-art-style={style.key}
              aria-pressed={artStyle === style.key}
              className={cn("studio-vspace-entry-art-style", artStyle === style.key && "is-selected")}
              onClick={() => onArtStyle?.(style.key)}
            >
              <span className="studio-vspace-entry-art-style-preview" aria-hidden>
                <img src={previewCharacter.directional.down} alt="" draggable={false} />
                <i />
              </span>
              <strong>{bt(style.labelKo, style.labelEn)}</strong>
              <small>{bt(style.descriptionKo, style.descriptionEn)}</small>
            </button>)}
          </div>
        </fieldset>

        <div className="studio-vspace-entry-actions">
          <Link href="/studio" className={buttonClass({ variant: "outline" })}>{bt("작업 목록으로", "Back to work list")}</Link>
          <button type="button" className={buttonClass()} onClick={onEnter}>
            {returning ? bt("이 캐릭터로 바로 입장", "Enter with this character") : bt("선택하고 입장", "Choose and enter")}
          </button>
        </div>
        <p className="studio-vspace-entry-note">{bt(
          "캐릭터와 아트 스타일 선택은 이 브라우저에 저장됩니다.",
          "Character and art-style choices are saved in this browser.",
        )}</p>
      </section>
    </Container>
  </div>;
}
