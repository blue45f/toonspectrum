import { ChevronDown, ExternalLink, FileDown, RotateCcw, ScrollText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import "./studio-lpc-credits.css";
import {
  STUDIO_LPC_CHARACTERS,
  STUDIO_LPC_CREDIT_AUTHORS,
  STUDIO_LPC_CREDITS_MARKDOWN_URL,
  STUDIO_LPC_CREDITS_URL,
  STUDIO_LPC_GENERATOR_URL,
  STUDIO_LPC_LICENSE_USES,
} from "./studio-lpc-characters";
import { parseStudioLpcCreditEntries, studioLpcCreditUrlLabel, type StudioLpcCreditEntry } from "./studio-lpc-credits";

const NPC_COUNT = STUDIO_LPC_CHARACTERS.filter((character) => character.kind === "npc").length;
const PLAYER_COUNT = STUDIO_LPC_CHARACTERS.length - NPC_COUNT;
const LAYER_COUNT = STUDIO_LPC_LICENSE_USES.reduce((sum, use) => sum + use.layers, 0);

type LayerCreditsState =
  | { readonly status: "idle" | "loading" | "error" }
  | { readonly status: "ready"; readonly entries: readonly StudioLpcCreditEntry[] };

/**
 * 레이어별 전체 출처. 펼칠 때 한 번만 credits.json을 내려받고, 실패하면 다시 시도할 수 있다.
 * (CREDITS.md는 브라우저가 화면에 열지 않고 내려받기 때문에 화면 안에서 바로 읽을 수 있게 따로 보여 준다.)
 */
function LayerCredits() {
  const bt = useBilingual("StudioLpcCreditsNotice");
  const [state, setState] = useState<LayerCreditsState>({ status: "idle" });
  const request = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ status: "loading" });
    void (async () => {
      try {
        const response = await fetch(STUDIO_LPC_CREDITS_URL, { signal: controller.signal });
        if (!response.ok) throw new Error(`credits.json ${response.status}`);
        const body: unknown = await response.json();
        const entries = parseStudioLpcCreditEntries(body);
        if (!controller.signal.aborted) setState(entries ? { status: "ready", entries } : { status: "error" });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    })();
  }, []);
  useEffect(() => () => request.current?.abort(), []);

  return <details className="studio-lpc-credits__layers" onToggle={(event) => {
    if (event.currentTarget.open && state.status === "idle") load();
  }}>
    <summary>
      <span>{bt(`레이어별 전체 출처 보기 (${LAYER_COUNT}개)`, `Per-layer sources (${LAYER_COUNT})`)}</span>
      <ChevronDown size={16} aria-hidden />
    </summary>
    {state.status === "loading" ? <p className="studio-lpc-credits__status" role="status">{bt("출처 목록을 불러오는 중…", "Loading the source list…")}</p> : null}
    {state.status === "error" ? <div className="studio-lpc-credits__status" role="alert">
      <p>{bt("출처 목록을 불러오지 못했어요. 연결을 확인하고 다시 시도하거나 아래 CREDITS.md 파일을 받아 보세요.",
        "Couldn't load the source list. Check your connection and retry, or download the CREDITS.md file below.")}</p>
      <button type="button" className="studio-lpc-credits__retry" onClick={load}>
        <RotateCcw size={15} aria-hidden />{bt("다시 시도", "Try again")}
      </button>
    </div> : null}
    {state.status === "ready" ? <ol className="studio-lpc-credits__entries" aria-label={bt("레이어별 출처", "Per-layer sources")}>
      {state.entries.map((entry) => <li key={entry.id}>
        <strong>{entry.sourcePath}</strong>
        <span>{bt("작가", "Artists")}: {entry.authors.join(", ")}</span>
        <span>{bt("선택 라이선스", "License")}: <a href={entry.chosenLicenseUrl} target="_blank" rel="noopener noreferrer">{entry.chosenLicense}</a></span>
        {entry.urls.length ? <span className="studio-lpc-credits__sources">
          {entry.urls.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">{studioLpcCreditUrlLabel(url)}</a>)}
        </span> : null}
      </li>)}
    </ol> : null}
  </details>;
}

/**
 * 캐릭터 아트 출처·라이선스 표기(접힘). LPC 픽셀 캐릭터의 작가·선택 라이선스와 NPC 대화 초상화의 AI 생성 사실을 밝힌다.
 * 요약은 정적 상수(credits.json과 테스트로 대조)라 오프라인에서도 바로 보이고, 레이어별 전체 목록은 펼칠 때 불러온다.
 * 로비·꾸미기 패널·설정 어디에 놓아도 같은 모양이 되도록 스타일은 이 폴더의 CSS만 쓴다.
 */
export function StudioLpcCreditsNotice() {
  const bt = useBilingual("StudioLpcCreditsNotice");
  return <details className="studio-lpc-credits">
    <summary>
      <span className="studio-lpc-credits__title"><ScrollText size={16} aria-hidden />{bt("캐릭터 아트 출처·라이선스", "Character art credits & licenses")}</span>
      <small>{bt(`LPC 픽셀 캐릭터 작가 ${STUDIO_LPC_CREDIT_AUTHORS.length}명 · NPC 초상화 AI 생성 표기`,
        `${STUDIO_LPC_CREDIT_AUTHORS.length} LPC pixel artists · AI-generated NPC portraits`)}</small>
      <ChevronDown className="studio-lpc-credits__chevron" size={18} aria-hidden />
    </summary>
    <div className="studio-lpc-credits__body">
      <p>{bt(
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
      <LayerCredits />
      <div className="studio-lpc-credits__links">
        <a href={STUDIO_LPC_CREDITS_MARKDOWN_URL} download="CREDITS.md">
          <FileDown size={17} aria-hidden />{bt("전체 출처 파일 받기 (CREDITS.md)", "Download the full credits file (CREDITS.md)")}
        </a>
        <a href={STUDIO_LPC_GENERATOR_URL} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={17} aria-hidden />{bt("LPC 캐릭터 생성기 저장소 (GitHub)", "LPC character generator repository (GitHub)")}
          <span className="sr-only">{bt(", 새 탭에서 열림", ", opens in a new tab")}</span>
        </a>
      </div>
      <p>{bt(
        "NPC 대화 초상화는 AI로 생성한 이미지예요(Canva Magic Media·Hugging Face FLUX.1, 무료 한도). LPC 픽셀 캐릭터는 AI 생성물이 아니라 위 작가들이 그린 픽셀 아트를 조합한 것이에요.",
        "NPC dialogue portraits are AI-generated images (Canva Magic Media and Hugging Face FLUX.1, free tiers). The LPC pixel characters are not AI-generated; they combine pixel art drawn by the artists above.",
      )}</p>
    </div>
  </details>;
}
