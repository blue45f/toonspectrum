import { ExternalLink, FileText } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import "./studio-lpc-credits.css";
import {
  STUDIO_LPC_CHARACTERS,
  STUDIO_LPC_CREDIT_AUTHORS,
  STUDIO_LPC_CREDITS_MARKDOWN_URL,
  STUDIO_LPC_GENERATOR_URL,
  STUDIO_LPC_LICENSE_USES,
} from "./studio-lpc-characters";

const NPC_COUNT = STUDIO_LPC_CHARACTERS.filter((character) => character.kind === "npc").length;
const PLAYER_COUNT = STUDIO_LPC_CHARACTERS.length - NPC_COUNT;

/**
 * 캐릭터 아트 출처·라이선스 표기(접힘). LPC 픽셀 캐릭터의 작가·선택 라이선스와 NPC 대화 초상화의 AI 생성 사실을 밝힌다.
 * 요약은 정적 상수(credits.json과 테스트로 대조)라 오프라인에서도 바로 보이고, 레이어별 전체 목록은 CREDITS.md로 연다.
 */
export function StudioLpcCreditsNotice() {
  const bt = useBilingual("StudioLpcCreditsNotice");
  return <details className="space-panel-section space-avatar-detail studio-lpc-credits">
    <summary>
      <span>{bt("캐릭터 아트 출처·라이선스", "Character art credits & licenses")}</span>
      <small>{bt(`LPC 픽셀 캐릭터 작가 ${STUDIO_LPC_CREDIT_AUTHORS.length}명 · NPC 초상화 AI 생성 표기`,
        `${STUDIO_LPC_CREDIT_AUTHORS.length} LPC pixel artists · AI-generated NPC portraits`)}</small>
    </summary>
    <div className="studio-lpc-credits__body">
      <p className="space-panel-note">{bt(
        `LPC 픽셀 캐릭터(NPC ${NPC_COUNT}명·프리셋 ${PLAYER_COUNT}종)는 오픈소스 Universal LPC Spritesheet Character Generator의 원본 레이어를 겹치고 팔레트로 다시 칠해 만든 2차 저작물이에요. 레이어마다 OGA-BY 3.0을 먼저 고르고, 없으면 CC0·CC-BY만 썼어요(CC-BY-SA·GPL 전용 레이어는 쓰지 않았어요).`,
        `The LPC pixel characters (${NPC_COUNT} NPCs, ${PLAYER_COUNT} presets) are derivative works layered and recolored from the open-source Universal LPC Spritesheet Character Generator. For each layer we chose OGA-BY 3.0 first, otherwise only CC0 or CC-BY (no layers offered only under CC-BY-SA or GPL).`,
      )}</p>
      <ul className="studio-lpc-credits__licenses" aria-label={bt("선택한 라이선스", "Chosen licenses")}>
        {STUDIO_LPC_LICENSE_USES.map((use) => <li key={use.license}>
          <a href={use.url} target="_blank" rel="noopener noreferrer">{use.license}</a>
          <span>{bt(`레이어 ${use.layers}개`, `${use.layers} ${use.layers === 1 ? "layer" : "layers"}`)}</span>
        </li>)}
      </ul>
      <h4 className="studio-lpc-credits__heading">{bt("작가", "Artists")}</h4>
      <p className="studio-lpc-credits__authors">{STUDIO_LPC_CREDIT_AUTHORS.join(", ")}</p>
      <a className="space-link-row" href={STUDIO_LPC_CREDITS_MARKDOWN_URL} target="_blank" rel="noopener noreferrer">
        <FileText size={17} aria-hidden />{bt("레이어별 전체 출처 보기 (CREDITS.md, 새 탭)", "Full per-layer credits (CREDITS.md, new tab)")}
      </a>
      <a className="space-link-row" href={STUDIO_LPC_GENERATOR_URL} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={17} aria-hidden />{bt("LPC 캐릭터 생성기 저장소 (GitHub, 새 탭)", "LPC character generator repository (GitHub, new tab)")}
      </a>
      <p className="space-panel-note">{bt(
        "NPC 대화 초상화는 AI로 생성한 이미지예요(Canva Magic Media·Hugging Face FLUX, 무료 한도). LPC 픽셀 캐릭터는 AI 생성물이 아니라 위 작가들이 그린 픽셀 아트를 조합한 것이에요.",
        "NPC dialogue portraits are AI-generated images (Canva Magic Media and Hugging Face FLUX, free tiers). The LPC pixel characters are not AI-generated; they combine pixel art drawn by the artists above.",
      )}</p>
    </div>
  </details>;
}
