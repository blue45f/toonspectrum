import { Brush, Check, Eraser, Eye, Layers3, MessageSquare, MousePointer2, Plus, Type, type LucideIcon } from "lucide-react";

import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { cx } from "@/shared/lib/cx";

import { HOME_EDITOR_FRAMES, homeArt } from "../reference-home-content";

import "./intro-studio-window.css";

const SCOPE = "domains.marketing.public.intro-studio-window";

/** 예시 편집기에서 설명할 수 있는 다섯 영역. */
export type StudioRegionId = "topbar" | "tools" | "canvas" | "layers" | "pages";

/** 영역에 번호를 달고 눌러 고르게 하는 '주석 모드'. 번호 순서는 `regions` 배열 순서다. */
export interface StudioWindowInteractive {
  readonly regions: readonly StudioRegionId[];
  readonly active: StudioRegionId;
  readonly onSelect: (region: StudioRegionId) => void;
}

const TOOLS: readonly (readonly [string, LucideIcon])[] = [
  ["select", MousePointer2],
  ["brush", Brush],
  ["eraser", Eraser],
  ["text", Type],
  ["balloon", MessageSquare],
];

const LAYERS = [
  ["대사", "Dialogue"],
  ["캐릭터", "Character"],
  ["효과", "Effects"],
  ["배경", "Background"],
] as const;

/**
 * 작업실(편집기)의 단순화한 예시 화면. 실제 사용자 작품·저장 상태가 아니라 구성을 설명하는 그림이다.
 * - 기본: 붓 선이 그려지고 말풍선이 붙는 짧은 루프(감속 모드에서는 완성된 장면으로 멈춤).
 * - `interactive`: 영역마다 번호 핀을 달아 눌러서 설명을 고른다(핀은 마우스·터치용 보조 — 같은 선택은 옆 목록 버튼으로도 키보드로 할 수 있다).
 */
export function StudioWindowMock({ interactive, caption = true, className }: {
  readonly interactive?: StudioWindowInteractive;
  /** 그림 아래의 '예시' 표기. 다른 설명이 이미 있으면 끈다. */
  readonly caption?: boolean;
  readonly className?: string;
}) {
  const bi = useBilingualLocalizer(SCOPE);

  const region = (id: StudioRegionId) => ({
    "data-region": id,
    "data-active": interactive?.active === id ? "" : undefined,
  });
  const pin = (id: StudioRegionId) => {
    if (!interactive) return null;
    const number = interactive.regions.indexOf(id) + 1;
    return number > 0 ? (
      <button type="button" tabIndex={-1} className="isw-pin" onClick={() => interactive.onSelect(id)}>{number}</button>
    ) : null;
  };

  return (
    <figure className={cx("isw", className)} data-interactive={interactive ? "" : undefined}>
      <div className="isw-window" aria-hidden="true">
        <div className="isw-bar" {...region("topbar")}>
          <span className="isw-dots"><i /><i /><i /></span>
          <strong>ToonStudio</strong>
          <span className="isw-title">{bi("회색의 도시 · 예시", "City in grey · sample")}</span>
          <span className="isw-saved"><Check size={11} />{bi("자동 저장됨", "Autosaved")}</span>
          <span className="isw-export">{bi("내보내기", "Export")}</span>
          {pin("topbar")}
        </div>
        <div className="isw-main">
          <div className="isw-tools" {...region("tools")}>
            {TOOLS.map(([id, Icon]) => <span key={id} data-on={id === "brush" ? "" : undefined}><Icon size={14} /></span>)}
            {pin("tools")}
          </div>
          <div className="isw-canvas" {...region("canvas")}>
            <img src={homeArt("canvas-noir", 640)} alt="" width={640} height={638} decoding="async" fetchPriority="high" />
            <svg className="isw-stroke" viewBox="0 0 320 200" preserveAspectRatio="none">
              <path d="M34 160 C 82 70, 140 190, 196 92 S 276 70, 292 34" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="isw-bubble">{bi("…아직 끝나지 않았어.", "…It isn't over yet.")}</span>
            {pin("canvas")}
          </div>
          <div className="isw-layers" {...region("layers")}>
            <strong><Layers3 size={11} />{bi("레이어", "Layers")}</strong>
            {LAYERS.map(([ko, en], index) => (
              <span key={en} data-row={index + 1}><i>{String(index + 1).padStart(2, "0")}</i>{bi(ko, en)}<Eye size={10} /></span>
            ))}
            {pin("layers")}
          </div>
        </div>
        <div className="isw-strip" {...region("pages")}>
          {HOME_EDITOR_FRAMES.map((frame, index) => (
            <span key={frame} className="isw-thumb" data-n={index + 1}>
              <img src={homeArt(frame, 320)} alt="" width={96} height={64} loading="lazy" decoding="async" />
            </span>
          ))}
          <span className="isw-add"><Plus size={13} /></span>
          {pin("pages")}
        </div>
      </div>
      {caption ? (
        <figcaption className="isw-caption">
          {bi("예시 화면 · 실제 작업실을 단순화한 그림이며 저장되지 않아요", "Sample screen · a simplified picture of the real studio, nothing is saved")}
        </figcaption>
      ) : null}
    </figure>
  );
}
