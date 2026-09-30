import {
  Check,
  Download,
  ImagePlus,
  Info,
  Laugh,
  Layers,
  Lock,
  Palette,
  PersonStanding,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Shirt,
  Smile,
  Sparkles,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StudioSliderRow } from "../studio-panel-ui";

import {
  DEFAULT_SHAPER_APPEARANCE_STATE,
  DEFAULT_SHAPER_BODY_SLIDERS,
  DEFAULT_SHAPER_SELECTION,
  SHAPER_AI_ARCHETYPES,
  SHAPER_AI_ARCHETYPE_EN,
  SHAPER_APPEARANCE_ANCHOR_HINTS,
  SHAPER_APPEARANCE_CATEGORIES,
  SHAPER_BODY_PRESET_SLIDERS,
  SHAPER_CATEGORIES,
  SHAPER_CATEGORY_DESCRIPTION_EN,
  SHAPER_CATEGORY_LABEL_EN,
  SHAPER_ITEM_COLOR_SWATCHES,
  SHAPER_MANNEQUIN_SUPPORTED_CATEGORIES,
  SHAPER_PRESETS,
  SHAPER_PRESET_LABEL_EN,
  recommendShaperPreset,
  type ShaperAiArchetype,
  type ShaperAppearanceCategory,
  type ShaperAppearanceState,
  type ShaperBodySliderValues,
  type ShaperPresetCategory,
  type ShaperPresetSelection,
} from "./studio-shaper-model";
import {
  STUDIO_BODY_SLIDER_DEFS,
  STUDIO_HEAD_RATIO_PRESETS,
  shaperBodySlidersToMannequinParams,
} from "./studio-body-morphs";
import {
  DEFAULT_SHAPER_EXPRESSION_SELECTION,
  STUDIO_VRM_EXPRESSION_COMBOS,
  type StudioShaperExpressionSelection,
} from "./studio-vrm-expressions";
import type { StudioMannequinBodyParams } from "./studio-mannequin-model";

import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export interface StudioShaperPanelProps {
  readonly selection?: Partial<ShaperPresetSelection>;
  readonly supportedCategories?: readonly ShaperPresetCategory[];
  readonly onSelectionChange?: (selection: ShaperPresetSelection) => void;
  /** 체형 슬라이더/프리셋 값을 인형 체형 파라미터로 실시간 전달합니다. */
  readonly onBodyParamsChange?: (params: Partial<StudioMannequinBodyParams>) => void;
  /** 표정 콤보+강도 선택을 VRM 표정 스펙으로 전달합니다. */
  readonly onExpressionChange?: (selection: StudioShaperExpressionSelection) => void;
  /** 외형 코디(헤어·액세서리·의상+색상) 선택을 전달합니다. 인형에는 적용되지 않습니다. */
  readonly onAppearanceChange?: (state: ShaperAppearanceState) => void;
  readonly onExportPsd?: () => void;
  readonly onInsertCanvas?: () => void;
  readonly onTriggerPoseScanner?: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

type ShaperSectionTab = "face" | "outfit" | "body" | "expression" | "assist" | "output";

const SECTION_TABS: readonly {
  readonly id: ShaperSectionTab;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly icon: LucideIcon;
}[] = [
  {
    id: "face",
    labelKo: "얼굴 레시피",
    labelEn: "Face",
    descriptionKo: "얼굴형·눈·코 — 데생 인형에 즉시 적용",
    descriptionEn: "Face shape, eyes, nose — applied to the mannequin instantly",
    icon: Smile,
  },
  {
    id: "outfit",
    labelKo: "외형 코디",
    labelEn: "Outfit",
    descriptionKo: "헤어·액세서리·의상 — 미리보기로 확인하고 저장",
    descriptionEn: "Hair, accessories, clothing — preview and save",
    icon: Shirt,
  },
  {
    id: "body",
    labelKo: "체형",
    labelEn: "Body",
    descriptionKo: "슬라이더·프리셋 — 인형에 실시간 반영",
    descriptionEn: "Sliders and presets — reflected on the mannequin live",
    icon: PersonStanding,
  },
  {
    id: "expression",
    labelKo: "표정",
    labelEn: "Expression",
    descriptionKo: "5종 감정+강도 — VRM 연결 시 적용",
    descriptionEn: "5 emotions with intensity — applied when VRM is connected",
    icon: Laugh,
  },
  {
    id: "assist",
    labelKo: "추천·포즈",
    labelEn: "Assist",
    descriptionKo: "장르 레시피·포즈 검수 — 지원 범주만 적용",
    descriptionEn: "Genre recipes and pose review — supported categories only",
    icon: Sparkles,
  },
  {
    id: "output",
    labelKo: "출력",
    labelEn: "Export",
    descriptionKo: "캔버스 추가·PSD 내보내기",
    descriptionEn: "Add to canvas, export layered PSD",
    icon: Layers,
  },
];

/** 얼굴 탭에 노출되는 범주. 동공·입술·귀는 VRM 전용이라 <details> 안내로만 노출합니다. */
const FACE_CATEGORIES: readonly ShaperPresetCategory[] = ["face", "eye", "nose"];

/** 착용 해제 프리셋 id (카테고리별). */
const APPEARANCE_REMOVAL_PRESET: Record<ShaperAppearanceCategory, string> = {
  hair: "hair-none",
  accessories: "acc-none",
  top: "top-none",
  bottom: "bottom-none",
  shoes: "shoes-none",
};

/** VRM 전용 범주 안내 (감사 조치 #2 — 유지). */
const VRM_ONLY_REASON: Readonly<Partial<Record<ShaperPresetCategory, string>>> = Object.freeze({
  pupil: "홍채와 동공은 텍스처·morph가 있는 VRM 캐릭터에서 편집합니다.",
  lip: "입술 형태는 호환 morph가 있는 VRM 캐릭터에서만 안전하게 편집합니다.",
  ear: "귀 모양은 해당 메시·morph가 있는 VRM 캐릭터에서 편집합니다.",
  hair: "고품질 헤어는 VRM 캐릭터 조형의 시각 헤어 레시피에서 편집합니다.",
  top: "상의는 VRM 의상 슬롯과 스키닝 검증이 끝난 에셋만 적용합니다.",
  bottom: "하의는 VRM 의상 슬롯과 스키닝 검증이 끝난 에셋만 적용합니다.",
  shoes: "신발은 VRM 의상 슬롯에서 발 리그 호환성을 확인한 뒤 적용합니다.",
  accessories: "액세서리는 VRM 소품 부착점과 라이선스가 확인된 에셋만 적용합니다.",
});

const SHAPER_GUIDE_STORAGE_KEY = "toonstudio.shaper.guide.v1";

function readGuideDismissed(): boolean {
  try {
    return window.localStorage.getItem(SHAPER_GUIDE_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

/** 아이템 기본 색상 (사용자가 색상을 고르기 전 미리보기에 사용). */
const DEFAULT_ITEM_COLORS: Record<ShaperAppearanceCategory, string> = {
  hair: "#5b4636",
  accessories: "#1f2937",
  top: "#4f6fb3",
  bottom: "#374151",
  shoes: "#7c2d12",
};

function visualToken(category: ShaperPresetCategory, presetId: string): string {
  if (category === "face") {
    if (presetId.includes("round") || presetId.includes("chibi")) return "rounded-[45%]";
    if (presetId.includes("sharp")) return "[clip-path:polygon(18%_5%,82%_5%,96%_48%,50%_100%,4%_48%)]";
    if (presetId.includes("square")) return "rounded-lg";
    return "rounded-[48%_48%_44%_44%]";
  }
  if (category === "body") {
    if (presetId.includes("chibi")) return "h-10 w-8";
    if (presetId.includes("tall")) return "h-16 w-5";
    if (presetId.includes("muscular")) return "h-14 w-10";
    return "h-14 w-7";
  }
  return "";
}

/** 얼굴·눈·코·체형·포즈 썸네일 (CSS 도형 기반). */
function PresetPreview({
  category,
  presetId,
}: {
  readonly category: ShaperPresetCategory;
  readonly presetId: string;
}) {
  if (category === "face") {
    return (
      <span className={cn(
        "relative block h-14 w-11 border-2 border-current bg-[linear-gradient(145deg,oklch(0.92_0.03_65),oklch(0.78_0.06_55))]",
        visualToken(category, presetId),
      )}>
        <span className="absolute left-2 top-5 size-1.5 rounded-full bg-current" />
        <span className="absolute right-2 top-5 size-1.5 rounded-full bg-current" />
        <span className="absolute bottom-3 left-1/2 h-px w-3 -translate-x-1/2 bg-current" />
      </span>
    );
  }
  if (category === "eye") {
    const scale = presetId.includes("romance") ? "scale-110" : presetId.includes("action") ? "scale-y-75" : "";
    return (
      <span className={cn("flex items-center gap-2", scale)}>
        <span className="h-3 w-7 rounded-[50%] border-2 border-current"><span className="mx-auto mt-0.5 block size-1.5 rounded-full bg-current" /></span>
        <span className="h-3 w-7 rounded-[50%] border-2 border-current"><span className="mx-auto mt-0.5 block size-1.5 rounded-full bg-current" /></span>
      </span>
    );
  }
  if (category === "nose") {
    return (
      <span className={cn(
        "block border-b-2 border-r-2 border-current",
        presetId.includes("dot") ? "size-3 rounded-full border-2" : "h-9 w-4 skew-y-12",
      )} />
    );
  }
  if (category === "body") {
    return (
      <span className={cn("relative block rounded-t-full border-2 border-current bg-accent-soft", visualToken(category, presetId))}>
        <span className="absolute -left-2 top-3 h-8 w-1.5 rotate-6 rounded-full bg-current" />
        <span className="absolute -right-2 top-3 h-8 w-1.5 -rotate-6 rounded-full bg-current" />
        <span className="absolute -bottom-7 left-1 h-8 w-1.5 rounded-full bg-current" />
        <span className="absolute -bottom-7 right-1 h-8 w-1.5 rounded-full bg-current" />
      </span>
    );
  }
  if (category === "bodypose" || category === "handpose") {
    return (
      <span className="relative block h-16 w-16">
        <span className="absolute left-1/2 top-0 size-4 -translate-x-1/2 rounded-full border-2 border-current" />
        <span className={cn(
          "absolute left-1/2 top-4 h-8 w-0.5 -translate-x-1/2 bg-current",
          presetId.includes("run") || presetId.includes("sword") ? "rotate-12" : "",
        )} />
        <span className="absolute left-2 top-7 h-0.5 w-12 rotate-[-12deg] bg-current" />
        <span className="absolute bottom-0 left-4 h-0.5 w-8 rotate-[55deg] bg-current" />
        <span className="absolute bottom-0 right-4 h-0.5 w-8 rotate-[-55deg] bg-current" />
      </span>
    );
  }
  return <span className="grid size-14 place-items-center rounded-2xl border border-dashed border-line text-[0.58rem] text-fg-3">VRM</span>;
}

// ── 외형 썸네일 (SVG) ─────────────────────────────────────────────────────────

function RemovalThumb() {
  return (
    <g>
      <rect x="10" y="10" width="28" height="28" rx="8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" opacity="0.55" />
      <line x1="16" y1="32" x2="32" y2="16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
    </g>
  );
}

function HairThumb({ presetId, color }: { readonly presetId: string; readonly color: string }) {
  if (presetId === "hair-none") return <RemovalThumb />;
  if (presetId === "hair-bob") {
    return (
      <g fill={color}>
        <path d="M10 26c0-10 7-16 14-16s14 6 14 16v6c0 2-1.5 3-3 3H13c-1.5 0-3-1-3-3v-6Z" />
        <path d="M12 26c2-6 7-9 12-9s10 3 12 9l-4 1c-2-4-5-6-8-6s-6 2-8 6l-4-1Z" fill="#00000033" />
      </g>
    );
  }
  if (presetId === "hair-long-straight") {
    return (
      <g fill={color}>
        <path d="M10 24c0-9 6-14 14-14s14 5 14 14v4h-6V20c-2-4-5-6-8-6s-6 2-8 6v18H10V24Z" />
        <path d="M32 20v18h6V24c0-9-6-14-14-14 4 2 7 5 8 10Z" opacity="0.85" />
      </g>
    );
  }
  if (presetId === "hair-dandy") {
    return (
      <g fill={color}>
        <path d="M10 26c0-10 7-15 14-15 5 0 9 2 11 5-3-1-6-1-8 0 3 1 5 3 6 5-4-2-9-3-13-2-5 1-8 4-10 9v-2Z" />
      </g>
    );
  }
  if (presetId === "hair-ponytail") {
    return (
      <g fill={color}>
        <circle cx="35" cy="12" r="4" />
        <path d="M33 14c4 3 5 8 4 14l-4 1c1-6 0-10-3-13l3-2Z" />
        <path d="M10 26c0-9 6-14 13-14s13 5 13 13c0 1-1 2-2 2H12c-1 0-2-1-2-2Z" />
      </g>
    );
  }
  if (presetId === "hair-wavy") {
    return (
      <g fill={color}>
        <path d="M10 26c0-10 7-16 14-16s14 6 14 16c0 4-1 8-3 11l-3-4 2-3-4-1-1 5-4-3 1-5h-6l1 5-4 3-1-5-4 1 2 3-3 4c-2-3-1-7-1-11Z" />
      </g>
    );
  }
  // hair-short
  return (
    <g fill={color}>
      <path d="M10 26c0-10 7-16 14-16s14 6 14 16c0 1-1 2-2 2-3-5-7-8-12-8s-9 3-12 8c-1 0-2-1-2-2Z" />
    </g>
  );
}

function AccessoryThumb({ presetId, color }: { readonly presetId: string; readonly color: string }) {
  if (presetId === "acc-none") return <RemovalThumb />;
  if (presetId === "acc-glasses") {
    return (
      <g fill="none" stroke={color} strokeWidth="2.5">
        <rect x="6" y="18" width="14" height="10" rx="4" fill={`${color}22`} />
        <rect x="28" y="18" width="14" height="10" rx="4" fill={`${color}22`} />
        <line x1="20" y1="22" x2="28" y2="22" />
        <line x1="6" y1="21" x2="2" y2="18" />
        <line x1="42" y1="21" x2="46" y2="18" />
      </g>
    );
  }
  if (presetId === "acc-headphones") {
    return (
      <g>
        <path d="M10 30c0-12 6-20 14-20s14 8 14 20" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
        <rect x="6" y="26" width="8" height="12" rx="4" fill={color} />
        <rect x="34" y="26" width="8" height="12" rx="4" fill={color} />
      </g>
    );
  }
  if (presetId === "acc-earring") {
    return (
      <g fill="none" stroke={color} strokeWidth="2.5">
        <circle cx="24" cy="28" r="8" />
        <circle cx="24" cy="28" r="2.5" fill={color} stroke="none" />
      </g>
    );
  }
  if (presetId === "acc-cap") {
    return (
      <g>
        <path d="M10 26c0-9 6-14 14-14s14 5 14 14H10Z" fill={color} />
        <ellipse cx="36" cy="26" rx="9" ry="3.5" fill={color} />
        <circle cx="24" cy="12" r="2.2" fill={color} opacity="0.75" />
      </g>
    );
  }
  // acc-beanie
  return (
    <g>
      <path d="M10 24c0-9 6-15 14-15s14 6 14 15v3H10v-3Z" fill={color} />
      <rect x="10" y="24" width="28" height="7" rx="3" fill={color} opacity="0.72" />
      <circle cx="24" cy="7" r="3.5" fill={color} opacity="0.9" />
    </g>
  );
}

function TopThumb({ presetId, color }: { readonly presetId: string; readonly color: string }) {
  if (presetId === "top-none") return <RemovalThumb />;
  const body = (
    <path d="M14 12l-7 5 3 8 4-2v15h20V23l4 2 3-8-7-5c-2 3-5 4-10 4s-8-1-10-4Z" fill={color} />
  );
  if (presetId === "top-school") {
    return (
      <g>
        {body}
        <path d="M20 12l4 5 4-5" fill="none" stroke="#ffffffaa" strokeWidth="2" />
        <rect x="22" y="18" width="4" height="10" rx="1.5" fill="#b91c1c" />
      </g>
    );
  }
  if (presetId === "top-hoodie") {
    return (
      <g>
        {body}
        <path d="M17 12c1-4 4-6 7-6s6 2 7 6c-2 1-4 2-7 2s-5-1-7-2Z" fill={color} opacity="0.7" />
        <rect x="19" y="27" width="10" height="7" rx="2" fill="#00000030" />
      </g>
    );
  }
  if (presetId === "top-suit") {
    return (
      <g>
        {body}
        <path d="M24 12l-6 8 6 12 6-12-6-8Z" fill="#00000038" />
        <path d="M24 12l-6 8M24 12l6 8" stroke="#ffffffaa" strokeWidth="1.6" />
      </g>
    );
  }
  // top-martial
  return (
    <g>
      {body}
      <path d="M18 12l6 8 8-6M30 12l-6 8-8-6" fill="none" stroke="#ffffffaa" strokeWidth="2" />
      <rect x="14" y="29" width="20" height="3" rx="1.5" fill="#00000040" />
    </g>
  );
}

function BottomThumb({ presetId, color }: { readonly presetId: string; readonly color: string }) {
  if (presetId === "bottom-none") return <RemovalThumb />;
  if (presetId === "bottom-skirt") {
    return (
      <g>
        <path d="M16 8h16l6 26H10l6-26Z" fill={color} />
        <line x1="21" y1="10" x2="19" y2="32" stroke="#00000030" strokeWidth="1.6" />
        <line x1="27" y1="10" x2="29" y2="32" stroke="#00000030" strokeWidth="1.6" />
        <line x1="24" y1="10" x2="24" y2="32" stroke="#00000030" strokeWidth="1.6" />
      </g>
    );
  }
  const legs = (wide: boolean) => (
    <g fill={color}>
      <path d={wide ? "M14 8h9v28h-8l-3-28Z" : "M15 8h8v28h-6l-4-28Z"} />
      <path d={wide ? "M25 8h9l-3 28h-8V8Z" : "M25 8h8l-4 28h-6V8Z"} />
    </g>
  );
  if (presetId === "bottom-slacks") return <g>{legs(false)}<rect x="14" y="6" width="20" height="4" rx="1.5" fill={color} opacity="0.7" /></g>;
  if (presetId === "bottom-jeans") {
    return (
      <g>
        {legs(false)}
        <rect x="17" y="10" width="5" height="6" rx="1" fill="#00000028" />
        <rect x="26" y="10" width="5" height="6" rx="1" fill="#00000028" />
      </g>
    );
  }
  return <g>{legs(true)}<rect x="13" y="6" width="22" height="4" rx="1.5" fill={color} opacity="0.7" /></g>;
}

function ShoesThumb({ presetId, color }: { readonly presetId: string; readonly color: string }) {
  if (presetId === "shoes-none") return <RemovalThumb />;
  if (presetId === "shoes-loafer") {
    return (
      <g>
        <path d="M8 30c6-1 10-6 14-6 5 0 8 2 14 4 3 1 4 3 4 5H10c-1 0-2-2-2-3Z" fill={color} />
        <rect x="20" y="22" width="10" height="4" rx="2" fill={color} opacity="0.65" />
      </g>
    );
  }
  if (presetId === "shoes-boots") {
    return (
      <g>
        <rect x="14" y="8" width="10" height="18" rx="3" fill={color} />
        <path d="M14 26h14l6 6v3H10v-3l4-6Z" fill={color} />
      </g>
    );
  }
  // shoes-sneakers
  return (
    <g>
      <path d="M8 28c5-1 8-8 13-8 4 0 7 3 12 5 3 1 5 2 5 5H10c-1.5 0-2-1-2-2Z" fill={color} />
      <path d="M20 22l3 3M24 20l3 3" stroke="#ffffffaa" strokeWidth="1.6" />
      <rect x="8" y="30" width="32" height="4" rx="2" fill="#ffffffcc" />
    </g>
  );
}

/** 외형 아이템 썸네일. */
function AppearanceThumb({
  category,
  presetId,
  color,
}: {
  readonly category: ShaperAppearanceCategory;
  readonly presetId: string;
  readonly color: string;
}) {
  return (
    <svg viewBox="0 0 48 48" className="size-12 text-fg-2" role="img" aria-hidden>
      {category === "hair" ? <HairThumb presetId={presetId} color={color} /> : null}
      {category === "accessories" ? <AccessoryThumb presetId={presetId} color={color} /> : null}
      {category === "top" ? <TopThumb presetId={presetId} color={color} /> : null}
      {category === "bottom" ? <BottomThumb presetId={presetId} color={color} /> : null}
      {category === "shoes" ? <ShoesThumb presetId={presetId} color={color} /> : null}
    </svg>
  );
}

// ── 표정 썸네일 (SVG) ─────────────────────────────────────────────────────────

/** 감정 콤보 얼굴 썸네일. intensity(0~100)에 따라 표정이 강해집니다. */
function ExpressionFace({
  comboId,
  intensity,
}: {
  readonly comboId: string;
  readonly intensity: number;
}) {
  const t = Math.min(100, Math.max(0, intensity)) / 100;
  const mouthH = 1.5 + t * 5;
  const eyeScale = 0.7 + t * 0.5;
  return (
    <svg viewBox="0 0 48 48" className="size-12" role="img" aria-hidden>
      <circle cx="24" cy="24" r="17" fill="#f6d7b8" stroke="#8a5a3b" strokeWidth="2" />
      {comboId === "surprised" ? (
        <g>
          <ellipse cx="17" cy="21" rx={3.4 * eyeScale} ry={4.6 * eyeScale} fill="#fff" stroke="#3b2a20" strokeWidth="1.6" />
          <ellipse cx="31" cy="21" rx={3.4 * eyeScale} ry={4.6 * eyeScale} fill="#fff" stroke="#3b2a20" strokeWidth="1.6" />
          <circle cx="17" cy="22" r="1.8" fill="#3b2a20" />
          <circle cx="31" cy="22" r="1.8" fill="#3b2a20" />
          <ellipse cx="24" cy="34" rx={2.6 + t * 2.4} ry={mouthH} fill="#7c2d12" />
        </g>
      ) : comboId === "angry" ? (
        <g stroke="#3b2a20" strokeLinecap="round">
          <line x1="12" y1="15" x2="21" y2="19" strokeWidth="2.6" />
          <line x1="36" y1="15" x2="27" y2="19" strokeWidth="2.6" />
          <circle cx="17" cy="24" r="2.4" fill="#3b2a20" stroke="none" />
          <circle cx="31" cy="24" r="2.4" fill="#3b2a20" stroke="none" />
          <path d={`M17 34 Q24 ${32 - t * 3} 31 34`} fill="none" strokeWidth="2.4" />
        </g>
      ) : comboId === "sad" ? (
        <g stroke="#3b2a20" strokeLinecap="round">
          <path d="M13 19 Q17 16 21 19" fill="none" strokeWidth="2" />
          <path d="M27 19 Q31 16 35 19" fill="none" strokeWidth="2" />
          <circle cx="17" cy="24" r="2.2" fill="#3b2a20" stroke="none" />
          <circle cx="31" cy="24" r="2.2" fill="#3b2a20" stroke="none" />
          <path d={`M18 35 Q24 ${31 - t * 3} 30 35`} fill="none" strokeWidth="2.4" />
        </g>
      ) : comboId === "neutral" ? (
        <g stroke="#3b2a20" strokeLinecap="round">
          <circle cx="17" cy="24" r="2.2" fill="#3b2a20" stroke="none" />
          <circle cx="31" cy="24" r="2.2" fill="#3b2a20" stroke="none" />
          <line x1="19" y1="33" x2="29" y2="33" strokeWidth="2.4" />
        </g>
      ) : (
        <g stroke="#3b2a20" strokeLinecap="round">
          <path d={`M13 ${23 - t} Q17 ${19 - t} 21 ${23 - t}`} fill="none" strokeWidth="2.2" />
          <path d={`M27 ${23 - t} Q31 ${19 - t} 35 ${23 - t}`} fill="none" strokeWidth="2.2" />
          <path d={`M16 31 Q24 ${35 + t * 4} 32 31`} fill="none" strokeWidth="2.4" />
        </g>
      )}
    </svg>
  );
}

// ── 코디 합성 미리보기 (SVG) ──────────────────────────────────────────────────

const SKIN = "#f2c9a4";
const SKIN_DARK = "#d9a878";

function DressUpPreview({
  selection,
  colors,
}: {
  readonly selection: Partial<Record<ShaperAppearanceCategory, string>>;
  readonly colors: Record<string, string>;
}) {
  const hairId = selection.hair ?? "hair-short";
  const accId = selection.accessories ?? "acc-none";
  const topId = selection.top ?? "top-school";
  const bottomId = selection.bottom ?? "bottom-skirt";
  const shoesId = selection.shoes ?? "shoes-sneakers";
  const hairColor = colors[hairId] ?? DEFAULT_ITEM_COLORS.hair;
  const accColor = colors[accId] ?? DEFAULT_ITEM_COLORS.accessories;
  const topColor = colors[topId] ?? DEFAULT_ITEM_COLORS.top;
  const bottomColor = colors[bottomId] ?? DEFAULT_ITEM_COLORS.bottom;
  const shoesColor = colors[shoesId] ?? DEFAULT_ITEM_COLORS.shoes;
  const longHairBack = hairId === "hair-long-straight" || hairId === "hair-wavy";

  return (
    <svg viewBox="0 0 120 168" className="h-44 w-auto" role="img" aria-label="코디 합성 미리보기">
      {/* 다리 */}
      <rect x="48" y="104" width="10" height="40" rx="5" fill={SKIN} />
      <rect x="62" y="104" width="10" height="40" rx="5" fill={SKIN} />
      {/* 신발 */}
      {shoesId === "shoes-boots" ? (
        <g fill={shoesColor}>
          <rect x="46" y="112" width="14" height="26" rx="4" />
          <rect x="60" y="112" width="14" height="26" rx="4" />
          <rect x="44" y="134" width="18" height="10" rx="3" />
          <rect x="58" y="134" width="18" height="10" rx="3" />
        </g>
      ) : shoesId === "shoes-loafer" ? (
        <g fill={shoesColor}>
          <ellipse cx="53" cy="141" rx="9" ry="5" />
          <ellipse cx="67" cy="141" rx="9" ry="5" />
        </g>
      ) : shoesId === "shoes-sneakers" ? (
        <g>
          <path d="M44 136h18v6a4 4 0 0 1-4 4H46a2 2 0 0 1-2-2v-8Z" fill={shoesColor} />
          <path d="M58 136h18v6a4 4 0 0 1-4 4H60a2 2 0 0 1-2-2v-8Z" fill={shoesColor} />
          <rect x="44" y="142" width="18" height="3" fill="#ffffffcc" />
          <rect x="58" y="142" width="18" height="3" fill="#ffffffcc" />
        </g>
      ) : null}
      {/* 하의 */}
      {bottomId === "bottom-skirt" ? (
        <g>
          <path d="M44 88h32l8 26H36l8-26Z" fill={bottomColor} />
          <line x1="52" y1="90" x2="50" y2="112" stroke="#00000030" strokeWidth="1.6" />
          <line x1="60" y1="90" x2="60" y2="112" stroke="#00000030" strokeWidth="1.6" />
          <line x1="68" y1="90" x2="70" y2="112" stroke="#00000030" strokeWidth="1.6" />
        </g>
      ) : bottomId !== "bottom-none" ? (
        <g fill={bottomColor}>
          <rect x="46" y="88" width="13" height="50" rx="5" />
          <rect x="61" y="88" width="13" height="50" rx="5" />
        </g>
      ) : (
        <g fill={SKIN}>
          <rect x="46" y="88" width="13" height="50" rx="5" />
          <rect x="61" y="88" width="13" height="50" rx="5" />
        </g>
      )}
      {/* 팔 */}
      <rect x="36" y="56" width="8" height="38" rx="4" fill={SKIN} transform="rotate(6 40 60)" />
      <rect x="76" y="56" width="8" height="38" rx="4" fill={SKIN} transform="rotate(-6 80 60)" />
      {/* 몸통 */}
      <rect x="46" y="52" width="28" height="40" rx="9" fill={topId === "top-none" ? SKIN : topColor} />
      {/* 상의 디테일 */}
      {topId === "top-school" ? (
        <g>
          <path d="M54 52l6 7 6-7" fill="none" stroke="#ffffffaa" strokeWidth="2" />
          <rect x="58" y="60" width="4" height="12" rx="1.5" fill="#b91c1c" />
        </g>
      ) : topId === "top-hoodie" ? (
        <g>
          <path d="M50 52c1-6 5-9 10-9s9 3 10 9c-3 2-6 3-10 3s-7-1-10-3Z" fill={topColor} opacity="0.75" />
          <rect x="54" y="72" width="12" height="9" rx="2.5" fill="#00000030" />
        </g>
      ) : topId === "top-suit" ? (
        <path d="M60 52l-8 12 8 16 8-16-8-12Z" fill="#00000038" />
      ) : topId === "top-martial" ? (
        <g>
          <path d="M52 52l8 10 8-8M68 52l-8 10-8-8" fill="none" stroke="#ffffffaa" strokeWidth="2" />
          <rect x="46" y="78" width="28" height="3.5" rx="1.7" fill="#00000040" />
        </g>
      ) : null}
      {/* 목·머리 */}
      <rect x="55" y="40" width="10" height="13" fill={SKIN} />
      {longHairBack ? (
        <g fill={hairColor}>
          <rect x="40" y="16" width="10" height="56" rx="5" />
          <rect x="70" y="16" width="10" height="56" rx="5" />
        </g>
      ) : null}
      <ellipse cx="60" cy="27" rx="14" ry="15" fill={SKIN} />
      {/* 귀걸이 */}
      {accId === "acc-earring" ? (
        <circle cx="45" cy="32" r="3.5" fill="none" stroke={accColor} strokeWidth="2" />
      ) : null}
      {/* 헤어 앞 */}
      {hairId === "hair-short" ? (
        <path d="M44 26c0-11 7-17 16-17s16 6 16 17c0 1-1 2-2 2-3-6-8-9-14-9s-11 3-14 9c-1 0-2-1-2-2Z" fill={hairColor} />
      ) : hairId === "hair-bob" ? (
        <g fill={hairColor}>
          <path d="M42 28c0-12 8-19 18-19s18 7 18 19v5c0 2-1.5 3-3 3H45c-1.5 0-3-1-3-3v-5Z" />
          <path d="M45 28c2-7 8-11 15-11s13 4 15 11l-5 1c-2-5-6-8-10-8s-8 3-10 8l-5-1Z" fill="#00000033" />
        </g>
      ) : hairId === "hair-long-straight" ? (
        <path d="M42 26c0-11 8-17 18-17s18 6 18 17c-4-4-10-7-18-7s-14 3-18 7Z" fill={hairColor} />
      ) : hairId === "hair-dandy" ? (
        <path d="M44 26c0-11 7-17 16-17 6 0 11 2 14 6-4-1-8-1-11 0 4 1 7 3 9 6-5-3-11-4-17-3-6 1-10 4-12 10l1-2Z" fill={hairColor} />
      ) : hairId === "hair-ponytail" ? (
        <g fill={hairColor}>
          <circle cx="80" cy="14" r="4.5" />
          <path d="M78 16c5 4 7 10 6 18l-4.5 1c1.5-8 0-13-4-17l2.5-2Z" />
          <path d="M44 26c0-11 7-17 16-17s16 6 16 17c0 1-1 2-2 2-3-6-8-9-14-9s-11 3-14 9c-1 0-2-1-2-2Z" />
        </g>
      ) : hairId === "hair-wavy" ? (
        <path d="M42 28c0-12 8-19 18-19s18 7 18 19c0 3-1 6-2 8l-3-4 2-3-4-1-1 5-4-2 1-5h-6l1 5-4 2-1-5-4 1 2 3-3 4c-1-2-2-5-2-7Z" fill={hairColor} />
      ) : null}
      {/* 모자 */}
      {accId === "acc-cap" ? (
        <g fill={accColor}>
          <path d="M43 22c0-9 7-15 17-15s17 6 17 15H43Z" />
          <ellipse cx="78" cy="23" rx="10" ry="3.5" />
        </g>
      ) : accId === "acc-beanie" ? (
        <g fill={accColor}>
          <path d="M43 20c0-9 7-15 17-15s17 6 17 15v3H43v-3Z" />
          <rect x="43" y="20" width="34" height="7" rx="3" opacity="0.72" />
          <circle cx="60" cy="4" r="4" opacity="0.9" />
        </g>
      ) : null}
      {/* 얼굴 */}
      <circle cx="55" cy="27" r="1.8" fill={SKIN_DARK} />
      <circle cx="65" cy="27" r="1.8" fill={SKIN_DARK} />
      <path d="M56 34 Q60 37 64 34" fill="none" stroke={SKIN_DARK} strokeWidth="1.8" strokeLinecap="round" />
      {/* 안경·헤드폰 */}
      {accId === "acc-glasses" ? (
        <g fill="none" stroke={accColor} strokeWidth="2">
          <rect x="48" y="23" width="10" height="7" rx="3" />
          <rect x="62" y="23" width="10" height="7" rx="3" />
          <line x1="58" y1="26" x2="62" y2="26" />
        </g>
      ) : null}
      {accId === "acc-headphones" ? (
        <g>
          <path d="M44 30c0-14 7-23 16-23s16 9 16 23" fill="none" stroke={accColor} strokeWidth="4" strokeLinecap="round" />
          <rect x="40" y="26" width="8" height="13" rx="4" fill={accColor} />
          <rect x="72" y="26" width="8" height="13" rx="4" fill={accColor} />
        </g>
      ) : null}
    </svg>
  );
}

// ── 공용 소품 ────────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  description,
  badge,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly badge?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent-soft text-accent">
        <Icon size={16} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 text-[0.72rem] font-extrabold text-fg">
          {title}
          {badge ? (
            <span className="rounded-full bg-accent px-1.5 py-px text-[0.56rem] font-extrabold text-on-accent">
              {badge}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-[0.6rem] leading-relaxed text-fg-3">{description}</p>
      </div>
    </div>
  );
}

/** 색상 스와치 + 직접 선택 컬러 입력. */
function ColorSwatches({
  value,
  onChange,
  label,
  disabled = false,
}: {
  readonly value: string;
  readonly onChange: (hex: string) => void;
  readonly label: string;
  readonly disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1 text-[0.62rem] font-bold text-fg-2">
        <Palette size={12} aria-hidden />
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {SHAPER_ITEM_COLOR_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            disabled={disabled}
            aria-label={`${hex} 색상 선택`}
            aria-pressed={value.toLowerCase() === hex.toLowerCase()}
            title={hex}
            className={cn(
              "size-7 rounded-full border-2 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 motion-safe:hover:scale-110",
              value.toLowerCase() === hex.toLowerCase() ? "border-accent" : "border-line",
            )}
            style={{ backgroundColor: hex }}
            onClick={() => onChange(hex)}
          />
        ))}
        <label className="relative grid size-7 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-line" title={label}>
          <input
            type="color"
            value={value}
            disabled={disabled}
            aria-label={`${label} 직접 선택`}
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => onChange(event.target.value)}
          />
          <span className="text-[0.5rem] font-extrabold text-fg-3" aria-hidden>+</span>
        </label>
      </div>
    </div>
  );
}

const GUIDE_STEPS: readonly { readonly ko: string; readonly en: string }[] = [
  { ko: "얼굴·체형·표정을 골라 캐릭터 레시피를 만드세요", en: "Pick face, body, and expression recipes to build your character" },
  { ko: "외형 코디는 미리보기로 확인하고 저장하세요 (인형 적용 제외)", en: "Preview and save outfits — they are not applied to the mannequin" },
  { ko: "체형 슬라이더는 데생 인형에 실시간으로 반영됩니다", en: "Body sliders update the mannequin in real time" },
];

function GuideBanner({ ko, onClose }: { readonly ko: boolean; readonly onClose: () => void }) {
  return (
    <div
      role="note"
      aria-label={ko ? "처음 사용 가이드" : "First-run guide"}
      className="space-y-1.5 rounded-xl border border-accent/30 bg-accent-soft/40 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.66rem] font-extrabold text-fg">
          {ko ? "10초 가이드 — 이 패널의 사용법" : "10-second guide — how to use this panel"}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={ko ? "가이드 닫기" : "Dismiss guide"}
          className="grid size-6 shrink-0 place-items-center rounded-full text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X size={13} aria-hidden />
        </button>
      </div>
      <ol className="space-y-1">
        {GUIDE_STEPS.map((step, index) => (
          <li key={step.en} className="flex items-start gap-1.5 text-[0.6rem] leading-relaxed text-fg-2">
            <span className="grid size-4 shrink-0 place-items-center rounded-full bg-accent text-[0.55rem] font-extrabold text-on-accent">
              {index + 1}
            </span>
            {ko ? step.ko : step.en}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── 메인 패널 ────────────────────────────────────────────────────────────────

export function StudioShaperPanel({
  selection = DEFAULT_SHAPER_SELECTION,
  supportedCategories = SHAPER_MANNEQUIN_SUPPORTED_CATEGORIES,
  onSelectionChange,
  onBodyParamsChange,
  onExpressionChange,
  onAppearanceChange,
  onExportPsd,
  onInsertCanvas,
  onTriggerPoseScanner,
  disabled = false,
  className,
}: StudioShaperPanelProps) {
  const ko = useI18n((state) => state.lang.startsWith("ko"));
  const supported = useMemo(() => new Set(supportedCategories), [supportedCategories]);

  const [activeTab, setActiveTab] = useState<ShaperSectionTab>("face");
  const [faceCategory, setFaceCategory] = useState<ShaperPresetCategory>("face");
  const [outfitCategory, setOutfitCategory] = useState<ShaperAppearanceCategory>("hair");
  const [currentSelection, setCurrentSelection] = useState<ShaperPresetSelection>({
    ...DEFAULT_SHAPER_SELECTION,
    ...selection,
  });
  const [appearance, setAppearance] = useState<ShaperAppearanceState>({
    selection: { ...DEFAULT_SHAPER_APPEARANCE_STATE.selection },
    colors: { ...DEFAULT_SHAPER_APPEARANCE_STATE.colors },
  });
  const [bodySliders, setBodySliders] = useState<ShaperBodySliderValues>({
    ...DEFAULT_SHAPER_BODY_SLIDERS,
  });
  const [bodyCustom, setBodyCustom] = useState(false);
  const [expression, setExpression] = useState<StudioShaperExpressionSelection>({
    ...DEFAULT_SHAPER_EXPRESSION_SELECTION,
  });
  const [guideOpen, setGuideOpen] = useState<boolean>(() => !readGuideDismissed());

  useEffect(() => {
    setCurrentSelection({ ...DEFAULT_SHAPER_SELECTION, ...selection });
  }, [selection]);

  const supportedCount = SHAPER_CATEGORIES.filter((category) => supported.has(category.id)).length;
  const unsupportedCategories = SHAPER_CATEGORIES.filter((category) => !supported.has(category.id));

  const categoryLabel = (id: ShaperPresetCategory): string =>
    ko
      ? (SHAPER_CATEGORIES.find((category) => category.id === id)?.label ?? id)
      : SHAPER_CATEGORY_LABEL_EN[id];
  const categoryDescription = (id: ShaperPresetCategory): string =>
    ko
      ? (SHAPER_CATEGORIES.find((category) => category.id === id)?.description ?? "")
      : SHAPER_CATEGORY_DESCRIPTION_EN[id];
  const presetLabel = (id: string, fallback: string): string =>
    ko ? fallback : (SHAPER_PRESET_LABEL_EN[id] ?? fallback);

  const closeGuide = () => {
    setGuideOpen(false);
    try {
      window.localStorage.setItem(SHAPER_GUIDE_STORAGE_KEY, "1");
    } catch {
      // 저장 실패 시 다음 진입에도 다시 보여줍니다. 치명적이지 않습니다.
    }
  };

  const commitSelection = (next: ShaperPresetSelection) => {
    setCurrentSelection(next);
    onSelectionChange?.(next);
  };

  const selectPreset = (category: ShaperPresetCategory, presetId: string) => {
    if (disabled || !supported.has(category)) return;
    commitSelection({ ...currentSelection, [category]: presetId });
  };

  const applyArchetype = (archetypeId: ShaperAiArchetype) => {
    if (disabled) return;
    const recommended = recommendShaperPreset(archetypeId);
    const next = { ...currentSelection };
    for (const category of supportedCategories) next[category] = recommended[category];
    commitSelection(next);
  };

  // ── 외형 코디 ──
  const commitAppearance = (next: ShaperAppearanceState) => {
    setAppearance(next);
    onAppearanceChange?.(next);
  };
  const selectOutfitItem = (category: ShaperAppearanceCategory, presetId: string) => {
    if (disabled) return;
    commitAppearance({
      selection: { ...appearance.selection, [category]: presetId },
      colors: appearance.colors,
    });
  };
  const removeOutfitItem = (category: ShaperAppearanceCategory) => {
    selectOutfitItem(category, APPEARANCE_REMOVAL_PRESET[category]);
  };
  const setItemColor = (presetId: string, hex: string) => {
    if (disabled) return;
    commitAppearance({
      selection: appearance.selection,
      colors: { ...appearance.colors, [presetId]: hex },
    });
  };

  // ── 체형 ──
  const emitBodyParams = (values: ShaperBodySliderValues) => {
    onBodyParamsChange?.(shaperBodySlidersToMannequinParams(values));
  };
  const applyBodyPreset = (presetId: string) => {
    if (disabled) return;
    const sliders = SHAPER_BODY_PRESET_SLIDERS[presetId] ?? DEFAULT_SHAPER_BODY_SLIDERS;
    setBodySliders({ ...sliders });
    setBodyCustom(false);
    commitSelection({ ...currentSelection, body: presetId });
    emitBodyParams(sliders);
  };
  const updateBodySlider = (key: keyof ShaperBodySliderValues, value: number) => {
    if (disabled) return;
    const next = { ...bodySliders, [key]: value };
    setBodySliders(next);
    setBodyCustom(true);
    emitBodyParams(next);
  };
  const applyHeadRatio = (headCount: number) => updateBodySlider("headCount", headCount);
  const resetBodySliders = () => {
    if (disabled) return;
    const next = { ...DEFAULT_SHAPER_BODY_SLIDERS };
    setBodySliders(next);
    setBodyCustom(false);
    emitBodyParams(next);
  };

  // ── 표정 ──
  const commitExpression = (next: StudioShaperExpressionSelection) => {
    setExpression(next);
    onExpressionChange?.(next);
  };

  const bodyPresets = SHAPER_PRESETS.filter((preset) => preset.category === "body");
  const posePresets = SHAPER_PRESETS.filter(
    (preset) => (preset.category === "bodypose" || preset.category === "handpose") && supported.has(preset.category),
  );
  const facePresets = SHAPER_PRESETS.filter((preset) => preset.category === faceCategory);
  const outfitPresets = SHAPER_PRESETS.filter((preset) => preset.category === outfitCategory);
  const activeOutfitPresetId = appearance.selection[outfitCategory] ?? APPEARANCE_REMOVAL_PRESET[outfitCategory];
  const activeOutfitPreset = outfitPresets.find((preset) => preset.id === activeOutfitPresetId);
  const activeOutfitColor =
    appearance.colors[activeOutfitPresetId] ?? DEFAULT_ITEM_COLORS[outfitCategory];

  const activeTabMeta = SECTION_TABS.find((tab) => tab.id === activeTab) ?? SECTION_TABS[0];

  return (
    <section
      className={cn(
        "space-y-3 rounded-2xl border border-accent/25 bg-[linear-gradient(145deg,var(--color-card),color-mix(in_oklch,var(--color-accent)_6%,var(--color-panel)))] p-3 text-xs shadow-sm",
        className,
      )}
      aria-label={ko ? "웹툰 캐릭터 셰이퍼" : "Webtoon character shaper"}
    >
      <header className="space-y-2 border-b border-line/70 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-fg">
              <Wand2 size={15} className="text-accent" aria-hidden />
              {ko ? "웹툰 캐릭터 셰이퍼" : "Webtoon Character Shaper"}
            </h3>
            <p className="mt-1 text-[0.62rem] leading-relaxed text-fg-3">
              {ko
                ? "현재 데생 인형이 실제로 지원하는 얼굴·체형·포즈만 즉시 적용합니다."
                : "Only face, body, and pose categories the mannequin actually supports are applied instantly."}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.58rem] font-extrabold text-accent">
            TOONSTUDIO
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-panel/60 p-2">
          <span className="rounded-lg bg-card px-2 py-1.5 text-[0.6rem] text-fg-3">
            {ko ? "즉시 적용" : "Instant"} <b className="text-fg">{supportedCount}{ko ? "개 범주" : " categories"}</b>
          </span>
          <span className="rounded-lg bg-card px-2 py-1.5 text-[0.6rem] text-fg-3">
            {ko ? "VRM 전용" : "VRM only"} <b className="text-fg">{unsupportedCategories.length}{ko ? "개 범주" : " categories"}</b>
          </span>
        </div>
      </header>

      {guideOpen ? <GuideBanner ko={ko} onClose={closeGuide} /> : null}

      <div role="tablist" aria-label={ko ? "캐릭터 셰이퍼 작업" : "Character shaper tasks"} className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-panel/65 p-1">
        {SECTION_TABS.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1 text-[0.6rem] font-bold motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                activeTab === tab.id
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-transparent text-fg-3 hover:bg-raised hover:text-fg",
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <TabIcon size={14} aria-hidden />
              {ko ? tab.labelKo : tab.labelEn}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={ko ? activeTabMeta.labelKo : activeTabMeta.labelEn} className="space-y-3">
        <SectionHeader
          icon={activeTabMeta.icon}
          title={ko ? activeTabMeta.labelKo : activeTabMeta.labelEn}
          description={ko ? activeTabMeta.descriptionKo : activeTabMeta.descriptionEn}
          badge={activeTab === "body" && bodyCustom ? (ko ? "사용자 지정" : "Custom") : undefined}
        />

        {activeTab === "face" ? (
          <>
            <div className="flex gap-1.5" role="tablist" aria-label={ko ? "얼굴 범주" : "Face categories"}>
              {FACE_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={faceCategory === category}
                  className={cn(
                    "min-h-10 flex-1 rounded-full border px-3 text-[0.6rem] font-bold motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                    faceCategory === category
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised",
                  )}
                  onClick={() => setFaceCategory(category)}
                >
                  {categoryLabel(category)}
                </button>
              ))}
            </div>
            <p className="text-[0.58rem] leading-relaxed text-fg-3">{categoryDescription(faceCategory)}</p>
            <div className="grid grid-cols-2 gap-2">
              {facePresets.map((preset) => {
                const selected = currentSelection[faceCategory] === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    aria-label={`${categoryLabel(faceCategory)}: ${presetLabel(preset.id, preset.label)} ${ko ? "선택" : "select"}`}
                    className={cn(
                      "min-h-[8.5rem] overflow-hidden rounded-xl border text-left motion-safe:transition-[border-color,background-color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40",
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 motion-safe:hover:-translate-y-0.5 hover:bg-raised",
                    )}
                    onClick={() => selectPreset(faceCategory, preset.id)}
                  >
                    <span className="grid h-[5.5rem] place-items-center border-b border-line/60 bg-panel/65">
                      <PresetPreview category={faceCategory} presetId={preset.id} />
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-2 text-[0.63rem] font-bold">
                      <span className="min-w-0 flex-1 truncate">{presetLabel(preset.id, preset.label)}</span>
                      {selected ? <Check size={12} className="shrink-0 text-accent" aria-hidden /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <details className="group rounded-xl border border-dashed border-line/80 bg-panel/40 px-3 py-2">
              <summary className="flex cursor-pointer items-center gap-1.5 text-[0.62rem] font-bold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                <Lock size={11} className="shrink-0 text-fg-3" aria-hidden />
                {ko ? "VRM 전용 얼굴 옵션 (동공·입술·귀)" : "VRM-only face options (pupils, lips, ears)"}
              </summary>
              <ul className="mt-2 space-y-1.5">
                {(["pupil", "lip", "ear"] as const).map((category) => (
                  <li key={category} className="flex items-start gap-1.5 text-[0.58rem] leading-relaxed text-fg-3">
                    <Lock size={10} className="mt-0.5 shrink-0" aria-hidden />
                    <span>
                      <b className="text-fg-2">{categoryLabel(category)}</b> —{" "}
                      {VRM_ONLY_REASON[category]}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[0.56rem] leading-relaxed text-fg-3">
                {ko
                  ? "VRM 캐릭터를 불러오면 이 패널에서 바로 고를 수 있습니다."
                  : "Load a VRM character to pick these options right here in this panel."}
              </p>
            </details>
          </>
        ) : null}

        {activeTab === "outfit" ? (
          <>
            <p className="flex items-start gap-1.5 rounded-xl border border-line bg-panel/55 p-2.5 text-[0.6rem] leading-relaxed text-fg-2">
              <Info size={12} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
              {ko
                ? "이 탭의 코디는 데생 인형에 적용되지 않습니다. SVG 미리보기로 확인하고 저장하세요."
                : "Outfits are not applied to the mannequin. Preview them as SVG and save."}
            </p>
            <div className="grid place-items-center rounded-xl border border-line bg-panel/55 py-3">
              <DressUpPreview selection={appearance.selection} colors={appearance.colors} />
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label={ko ? "착용 중인 아이템" : "Worn items"}>
              {SHAPER_APPEARANCE_CATEGORIES.map((category) => {
                const presetId = appearance.selection[category] ?? APPEARANCE_REMOVAL_PRESET[category];
                const item = SHAPER_PRESETS.find((p) => p.id === presetId);
                const label = item ? presetLabel(item.id, item.label) : presetId;
                const removable = presetId !== APPEARANCE_REMOVAL_PRESET[category];
                return (
                  <span
                    key={category}
                    className="inline-flex min-h-8 items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-2 py-1 text-[0.6rem] font-bold text-accent"
                  >
                    {categoryLabel(category)}: {label}
                    {removable ? (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => removeOutfitItem(category)}
                        aria-label={ko ? `${label} 착용 해제` : `Remove ${label}`}
                        className="grid size-5 place-items-center rounded-full hover:bg-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
                      >
                        <X size={11} aria-hidden />
                      </button>
                    ) : null}
                  </span>
                );
              })}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]" role="tablist" aria-label={ko ? "외형 범주" : "Outfit categories"}>
              {SHAPER_APPEARANCE_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={outfitCategory === category}
                  className={cn(
                    "min-h-10 shrink-0 rounded-full border px-3 text-[0.6rem] font-bold motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                    outfitCategory === category
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised",
                  )}
                  onClick={() => setOutfitCategory(category)}
                >
                  {categoryLabel(category)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {outfitPresets.map((preset) => {
                const selected = activeOutfitPresetId === preset.id;
                const anchor = outfitCategory === "accessories" ? SHAPER_APPEARANCE_ANCHOR_HINTS[preset.id] : undefined;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    title={anchor ? (ko ? anchor.ko : anchor.en) : undefined}
                    aria-label={`${categoryLabel(outfitCategory)}: ${presetLabel(preset.id, preset.label)} ${ko ? "선택" : "select"}${anchor ? ` — ${ko ? anchor.ko : anchor.en}` : ""}`}
                    className={cn(
                      "min-h-[8.5rem] overflow-hidden rounded-xl border text-left motion-safe:transition-[border-color,background-color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40",
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 motion-safe:hover:-translate-y-0.5 hover:bg-raised",
                    )}
                    onClick={() => selectOutfitItem(outfitCategory, preset.id)}
                  >
                    <span className="grid h-[5.5rem] place-items-center border-b border-line/60 bg-panel/65">
                      <AppearanceThumb
                        category={outfitCategory}
                        presetId={preset.id}
                        color={appearance.colors[preset.id] ?? DEFAULT_ITEM_COLORS[outfitCategory]}
                      />
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-2 text-[0.63rem] font-bold">
                      <span className="min-w-0 flex-1 truncate">{presetLabel(preset.id, preset.label)}</span>
                      {selected ? <Check size={12} className="shrink-0 text-accent" aria-hidden /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {activeOutfitPreset ? (
              <ColorSwatches
                value={activeOutfitColor}
                disabled={disabled}
                label={`${presetLabel(activeOutfitPreset.id, activeOutfitPreset.label)} ${ko ? "색상" : "color"}`}
                onChange={(hex) => setItemColor(activeOutfitPreset.id, hex)}
              />
            ) : null}
          </>
        ) : null}

        {activeTab === "body" ? (
          <>
            {onBodyParamsChange ? null : (
              <p className="flex items-start gap-1.5 rounded-xl border border-dashed border-line bg-panel/55 p-2.5 text-[0.6rem] leading-relaxed text-fg-3">
                <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
                {ko
                  ? "호스트 연결 대기 중 — 슬라이더 값은 저장만 되고 인형에는 반영되지 않습니다."
                  : "Waiting for host connection — slider values are saved only, not applied to the mannequin."}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {bodyPresets.map((preset) => {
                const selected = currentSelection.body === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    aria-label={`${ko ? "체형" : "Body"}: ${presetLabel(preset.id, preset.label)} ${ko ? "선택" : "select"}`}
                    className={cn(
                      "min-h-[8.5rem] overflow-hidden rounded-xl border text-left motion-safe:transition-[border-color,background-color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40",
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 motion-safe:hover:-translate-y-0.5 hover:bg-raised",
                    )}
                    onClick={() => applyBodyPreset(preset.id)}
                  >
                    <span className="grid h-[5.5rem] place-items-center border-b border-line/60 bg-panel/65">
                      <PresetPreview category="body" presetId={preset.id} />
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-2 text-[0.63rem] font-bold">
                      <span className="min-w-0 flex-1 truncate">{presetLabel(preset.id, preset.label)}</span>
                      {selected ? <Check size={12} className="shrink-0 text-accent" aria-hidden /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="space-y-1.5">
              <p className="text-[0.62rem] font-bold text-fg-2">{ko ? "두신 프리셋" : "Head-ratio presets"}</p>
              <div className="flex flex-wrap gap-1.5">
                {STUDIO_HEAD_RATIO_PRESETS.map((preset) => {
                  const active = bodySliders.headCount === preset.headCount;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={active}
                      disabled={disabled}
                      className={cn(
                        "min-h-9 rounded-full border px-3 text-[0.6rem] font-bold motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40",
                        active
                          ? "border-accent/60 bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-2 hover:bg-raised",
                      )}
                      onClick={() => applyHeadRatio(preset.headCount)}
                    >
                      {preset.label} · {preset.headCount}{ko ? "등신" : " heads"}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-line/70 bg-panel/55 p-3">
              {STUDIO_BODY_SLIDER_DEFS.map((def) => {
                const value = bodySliders[def.key];
                const unit = ko ? (def.unitKo ?? "") : (def.unitEn ?? "");
                const display = Number.isInteger(def.step) ? value.toFixed(0) : value.toFixed(1);
                return (
                  <StudioSliderRow
                    key={def.key}
                    label={
                      <span className="flex items-center gap-1.5 text-[0.62rem] font-bold text-fg-2">
                        {ko ? def.labelKo : def.labelEn}
                        <b className="text-fg">
                          {display}
                          {unit}
                        </b>
                      </span>
                    }
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={value}
                    disabled={disabled}
                    onChange={(next) => updateBodySlider(def.key, next)}
                  />
                );
              })}
              <button
                type="button"
                disabled={disabled}
                onClick={resetBodySliders}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-[0.6rem] font-bold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
              >
                <RotateCcw size={12} aria-hidden />
                {ko ? "프리셋으로 되돌리기" : "Reset to preset"}
              </button>
            </div>
          </>
        ) : null}

        {activeTab === "expression" ? (
          <>
            <p className="flex items-start gap-1.5 rounded-xl border border-line bg-panel/55 p-2.5 text-[0.6rem] leading-relaxed text-fg-2">
              <Info size={12} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
              {ko
                ? "데생 인형에는 얼굴 리그가 없어 미리보기·저장으로 동작합니다. VRM 캐릭터 연결 시 블렌드셰이프로 적용됩니다."
                : "The mannequin has no face rig, so this is preview and save only. Applied as blendshapes when a VRM character is connected."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {STUDIO_VRM_EXPRESSION_COMBOS.map((combo) => {
                const selected = expression.comboId === combo.id;
                const label = ko ? combo.label : combo.labelEn;
                return (
                  <button
                    key={combo.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={disabled}
                    aria-label={`${label} ${ko ? "표정 선택" : "expression select"}`}
                    className={cn(
                      "min-h-[8.5rem] overflow-hidden rounded-xl border text-left motion-safe:transition-[border-color,background-color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40",
                      selected
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2 motion-safe:hover:-translate-y-0.5 hover:bg-raised",
                    )}
                    onClick={() => commitExpression({ ...expression, comboId: combo.id })}
                  >
                    <span className="grid h-[5.5rem] place-items-center border-b border-line/60 bg-panel/65">
                      <ExpressionFace comboId={combo.id} intensity={expression.intensity} />
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-2 text-[0.63rem] font-bold">
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {selected ? <Check size={12} className="shrink-0 text-accent" aria-hidden /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="rounded-xl border border-line/70 bg-panel/55 p-3">
              <StudioSliderRow
                label={
                  <span className="flex items-center gap-1.5 text-[0.62rem] font-bold text-fg-2">
                    {ko ? "강도" : "Intensity"}
                    <b className="text-fg">{expression.intensity}%</b>
                  </span>
                }
                min={0}
                max={100}
                step={1}
                value={expression.intensity}
                disabled={disabled}
                onChange={(next) => commitExpression({ ...expression, intensity: Math.round(next) })}
              />
            </div>
          </>
        ) : null}

        {activeTab === "assist" ? (
          <>
            <div className="flex items-start gap-2 rounded-xl border border-accent/25 bg-accent-soft/30 p-3">
              <Sparkles size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <p className="text-[0.61rem] leading-relaxed text-fg-2">
                {ko
                  ? `장르 레시피는 현재 인형이 실제로 지원하는 ${supportedCount}개 범주만 바꿉니다. 의상·헤어를 적용한 것처럼 보이게 꾸미지 않습니다.`
                  : `Genre recipes change only the ${supportedCount} categories the mannequin actually supports. They never pretend to apply outfits or hair.`}
              </p>
            </div>
            <div className="space-y-2">
              {SHAPER_AI_ARCHETYPES.map((archetype) => {
                const meta = SHAPER_AI_ARCHETYPE_EN[archetype.id];
                return (
                  <button
                    key={archetype.id}
                    type="button"
                    disabled={disabled}
                    className="w-full rounded-xl border border-line bg-card p-3 text-left motion-safe:transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
                    onClick={() => applyArchetype(archetype.id)}
                    aria-label={`${ko ? archetype.label : meta.label} ${ko ? "지원 범주 적용" : "— apply supported categories"}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[0.68rem] font-extrabold text-fg">{ko ? archetype.label : meta.label}</span>
                      <span className="rounded-full border border-accent/25 bg-accent-soft px-2 py-0.5 text-[0.56rem] font-bold text-accent">
                        {supportedCount}{ko ? "개 적용" : " applied"}
                      </span>
                    </span>
                    <span className="mt-1 block text-[0.59rem] leading-relaxed text-fg-3">
                      {ko ? archetype.description : meta.description}
                    </span>
                  </button>
                );
              })}
            </div>
            {posePresets.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[0.62rem] font-bold text-fg-2">
                  {ko ? "포즈 프리셋 (인형에 즉시 적용)" : "Pose presets (applied instantly)"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {posePresets.map((preset) => {
                    const selected = currentSelection[preset.category] === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabled}
                        aria-label={`${categoryLabel(preset.category)}: ${presetLabel(preset.id, preset.label)} ${ko ? "선택" : "select"}`}
                        className={cn(
                          "min-h-[8.5rem] overflow-hidden rounded-xl border text-left motion-safe:transition-[border-color,background-color,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40",
                          selected
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-line bg-card text-fg-2 motion-safe:hover:-translate-y-0.5 hover:bg-raised",
                        )}
                        onClick={() => selectPreset(preset.category, preset.id)}
                      >
                        <span className="grid h-[5.5rem] place-items-center border-b border-line/60 bg-panel/65">
                          <PresetPreview category={preset.category} presetId={preset.id} />
                        </span>
                        <span className="flex items-center gap-1.5 px-2.5 py-2 text-[0.63rem] font-bold">
                          <span className="min-w-0 flex-1 truncate">{presetLabel(preset.id, preset.label)}</span>
                          {selected ? <Check size={12} className="shrink-0 text-accent" aria-hidden /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <button
              type="button"
              disabled={disabled || !onTriggerPoseScanner}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft px-3 text-[0.65rem] font-extrabold text-accent hover:bg-accent/15 disabled:opacity-40"
              onClick={onTriggerPoseScanner}
            >
              <ScanSearch size={14} aria-hidden />
              {ko ? "사진 위 랜드마크로 포즈 검수" : "Review pose with photo landmarks"}
            </button>
          </>
        ) : null}

        {activeTab === "output" ? (
          <>
            <div className="flex items-start gap-2 rounded-xl border border-line bg-panel/55 p-3">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-good" aria-hidden />
              <p className="text-[0.61rem] leading-relaxed text-fg-2">
                {ko
                  ? "캡처와 PSD는 현재 3D 장면에서 생성합니다. 콜백이 연결되지 않은 환경에서는 가짜 픽셀이나 빈 PSD를 만들지 않습니다."
                  : "Captures and PSDs are generated from the live 3D scene. Without connected callbacks, no fake pixels or empty PSDs are created."}
              </p>
            </div>
            <button
              type="button"
              disabled={disabled || !onInsertCanvas}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-accent/50 bg-accent px-3 text-[0.66rem] font-extrabold text-on-accent hover:bg-accent/90 disabled:opacity-40"
              onClick={onInsertCanvas}
            >
              <ImagePlus size={14} aria-hidden />
              {ko ? "현재 장면을 캔버스에 추가" : "Add current scene to canvas"}
            </button>
            <button
              type="button"
              disabled={disabled || !onExportPsd}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[0.66rem] font-extrabold text-fg-2 hover:bg-raised disabled:opacity-40"
              onClick={onExportPsd}
            >
              <Layers size={14} aria-hidden />
              {ko ? "레이어드 PSD 내보내기" : "Export layered PSD"}
            </button>
            <div className="rounded-xl border border-dashed border-line bg-card/45 p-3 text-[0.59rem] leading-relaxed text-fg-3">
              <p className="flex items-center gap-1.5 font-bold text-fg-2">
                <Download size={12} aria-hidden />
                {ko ? "직접 표면 드로잉" : "Direct surface drawing"}
              </p>
              <p className="mt-1">
                {ko
                  ? "UV가 있는 VRM 캐릭터의 표면 탭에서 B 브러시, F ColorDrop, I 스포이드를 사용합니다. 데생 인형에는 존재하지 않는 UV 기능을 가짜 토글로 노출하지 않습니다."
                  : "Use the B brush, F ColorDrop, and I eyedropper on the surface tab of a VRM character with UVs. No fake toggles for UV features the mannequin does not have."}
              </p>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
