/**
 * Studio Brand Kit — 팔레트(참조)·제목/본문 글꼴·로고를 하나의 이름 붙은 "킷"으로 묶어
 * 재사용한다. studio-palette-library.ts(팔레트 자체)와 studio-master-page.ts(문서 전역
 * 로고/워터마크 레이어)의 "재료"를 한 번에 적용 가능한 세트로 번들링하는 상위 레이어다.
 *
 * 팔레트는 원본을 복사하지 않고 studio-palette-library.ts의 StudioNamedPalette.id를
 * 참조(paletteId)한다 — 팔레트 라이브러리에서 팔레트를 고치면 이 킷에도 즉시 반영되고,
 * 원본이 삭제되면 참조가 끊긴다(dangling). 로고와 글꼴은 킷 자체가 값을 직접 보관한다
 * (로고는 참조할 "로고 라이브러리"가 앱에 없고, 글꼴은 애초에 문자열 값이라 참조할
 * 이유가 없다).
 *
 * 이 모듈은 저장소(localStorage 호환 인터페이스)를 주입받아 순수하게 동작한다
 * (studio-palette-library.ts·studio-clips.ts와 동일 패턴).
 */

import type { StudioNamedPalette } from "./studio-palette-library";

/** 글꼴 선택지 — StudioPage.tsx 속성 패널의 인라인 글꼴 그리드(텍스트/말풍선 "글꼴" 절)와
 *  값이 1:1로 일치해야 한다(el.font 로 그대로 쓰이는 CSS font-family 문자열이므로).
 *  통합 시 StudioPage.tsx의 인라인 배열과 이 상수는 값이 어긋나면 안 된다 — 의도적 중복이다
 *  (§4 디자인 편차: 13k줄 StudioPage.tsx를 이 기능 랜딩과 함께 리팩터링하지 않기 위한 절충). */
export interface BrandKitFontOption {
  label: string;
  value: string; // CSS font-family 값. El.font 와 동일 shape.
}

export const BRAND_KIT_FONTS: BrandKitFontOption[] = [
  { label: "고딕", value: "Pretendard, sans-serif" },
  { label: "명조", value: "'Nanum Myeongjo', serif" },
  { label: "둥근만화", value: "'Jua', sans-serif" },
  { label: "타이틀/굵은", value: "'Black Han Sans', sans-serif" },
  { label: "손글씨", value: "'Gaegu', cursive" },
  { label: "펜글씨", value: "'Nanum Pen Script', cursive" },
  { label: "아기자기", value: "'Gamja Flower', cursive" },
  { label: "붓글씨/고풍", value: "'Yeon Sung', cursive" },
  { label: "분노/공포", value: "'East Sea Dokdo', cursive" },
];

/** El.font 의 기본값과 동일 문자열(StudioPage.tsx 전역 fallback: `el.font ?? "Pretendard, sans-serif"`). */
export const DEFAULT_BRAND_KIT_FONT = "Pretendard, sans-serif";

/** 로고 — 다운스케일된(webp) data URL + 그 자연 크기. 크기를 함께 저장하는 이유는
 *  §4 디자인 편차에서 설명: 마스터에 적용할 때 이미지 재로딩 없이 동기적으로 종횡비를
 *  계산하기 위해서다(logoDataUrl 단일 문자열 스케치를 따랐다면 applyBrandKitLogo가
 *  비동기여야 했고, 이 코드베이스의 다른 모든 master 변형 함수는 동기다). */
export interface BrandKitLogo {
  dataUrl: string; // data:image/webp;base64,... — 업로드 시 studio-image-utils.downscaleImageFile 로 미리 축소된 값이어야 한다(이 모듈은 크기를 강제하지 않는다).
  width: number; // (다운스케일된) 자연 픽셀 너비
  height: number;
}

export interface BrandKit {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** studio-palette-library.ts StudioNamedPalette.id 참조. null = 팔레트 미번들. */
  paletteId: string | null;
  headingFont: string; // CSS font-family. 기본 DEFAULT_BRAND_KIT_FONT.
  bodyFont: string;
  logo: BrandKitLogo | null; // null = 로고 미번들.
}

export interface BrandKitStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const BRAND_KIT_KEY = "toonspectrum-studio-brand-kits";
export const MAX_BRAND_KITS = 40; // studio-clips.ts MAX_CLIPS / studio-palette-library.ts MAX_PALETTES 와 동일 상한 정책.
export const DEFAULT_BRAND_KIT_NAME = "이름 없는 브랜드 킷";

/** 문서 마스터에서 "브랜드 킷 로고"를 식별하는 고정 id — 일반 요소는 uid()(crypto.randomUUID())를
 *  쓰지만, 이 값은 재적용 시 새 요소를 쌓지 않고 같은 자리(위치·크기)에 교체하기 위해
 *  의도적으로 고정 문자열이다(uuid와 충돌할 일이 없다). */
export const BRAND_KIT_LOGO_MASTER_ID = "brand-kit-logo";

function isBrandKitLogo(v: unknown): v is BrandKitLogo {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.dataUrl === "string" && typeof o.width === "number" && typeof o.height === "number";
}

function isBrandKit(v: unknown): v is BrandKit {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.createdAt === "number" &&
    typeof o.updatedAt === "number" &&
    (o.paletteId === null || typeof o.paletteId === "string") &&
    typeof o.headingFont === "string" &&
    typeof o.bodyFont === "string" &&
    (o.logo === null || isBrandKitLogo(o.logo))
  );
}

/** 저장된 킷 목록(최근 저장 순). 저장소 부재·파싱 실패·형식 불일치 항목은 안전하게 걸러진다. */
export function listBrandKits(storage: BrandKitStorage | null | undefined): BrandKit[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(BRAND_KIT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBrandKit);
  } catch {
    return [];
  }
}

function persist(storage: BrandKitStorage | null | undefined, kits: BrandKit[]): void {
  if (!storage) return;
  try {
    storage.setItem(BRAND_KIT_KEY, JSON.stringify(kits));
  } catch {
    // 저장 실패(쿼터 초과·시크릿 모드 등) — 무시. 팔레트·클립과 동일한 정책.
  }
}

/** 저장(같은 id면 교체하며 맨 앞으로, 새 항목도 맨 앞). MAX_BRAND_KITS로 자른다. */
export function saveBrandKit(storage: BrandKitStorage | null | undefined, kit: BrandKit): BrandKit[] {
  const next = [kit, ...listBrandKits(storage).filter((k) => k.id !== kit.id)].slice(0, MAX_BRAND_KITS);
  persist(storage, next);
  return next;
}

/** 이름 변경(순서 유지, updatedAt 갱신). 빈 이름은 무시. */
export function renameBrandKit(storage: BrandKitStorage | null | undefined, id: string, name: string): BrandKit[] {
  const trimmed = name.trim();
  const current = listBrandKits(storage);
  if (!trimmed) return current;
  const next = current.map((k) => (k.id === id ? { ...k, name: trimmed, updatedAt: Date.now() } : k));
  persist(storage, next);
  return next;
}

/** 삭제. */
export function deleteBrandKit(storage: BrandKitStorage | null | undefined, id: string): BrandKit[] {
  const next = listBrandKits(storage).filter((k) => k.id !== id);
  persist(storage, next);
  return next;
}

/**
 * 새 브랜드 킷 생성 — createPalette와 달리 **절대 던지지 않는다**. 브랜드 킷은 팔레트처럼
 * "유효한 색이 하나는 있어야" 하는 불변식이 없다: 이름만 있고 나머지는 비어 있는 킷도
 * 유효하다(사용자가 이름부터 짓고 점진적으로 채워나가는 흐름을 막지 않기 위함).
 * 빈 이름/빈 글꼴은 각각 DEFAULT_BRAND_KIT_NAME/DEFAULT_BRAND_KIT_FONT로 대체된다.
 */
export function createBrandKit(input: {
  name: string;
  paletteId?: string | null;
  headingFont?: string;
  bodyFont?: string;
  logo?: BrandKitLogo | null;
}): BrandKit {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: input.name.trim() || DEFAULT_BRAND_KIT_NAME,
    createdAt: now,
    updatedAt: now,
    paletteId: input.paletteId ?? null,
    headingFont: input.headingFont?.trim() || DEFAULT_BRAND_KIT_FONT,
    bodyFont: input.bodyFont?.trim() || DEFAULT_BRAND_KIT_FONT,
    logo: input.logo ?? null,
  };
}

/**
 * 킷에 번들된 paletteId를 실제 팔레트로 해석한다. paletteId가 null이면 null(팔레트 미번들),
 * 참조가 끊겼으면(팔레트가 삭제됨) 마찬가지로 null(패널이 "삭제된 팔레트"로 표시할 신호).
 * palettes는 호출측이 studio-palette-library.listPalettes(...)로 얻어 전달한다.
 */
export function resolveBrandKitPalette(
  kit: BrandKit,
  palettes: readonly StudioNamedPalette[]
): StudioNamedPalette | null {
  if (!kit.paletteId) return null;
  return palettes.find((p) => p.id === kit.paletteId) ?? null;
}

export interface BrandKitLogoPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/**
 * 로고를 캔버스 우하단 모서리에 여백을 두고 종횡비를 보존해 배치한다(코너 워터마크 관례,
 * studio-watermark.ts의 margin 계산과 같은 자릿수). "기존 로고 요소가 있으면 그 위치·크기를
 * 재사용한다"는 로직은 이 함수의 책임이 아니다 — 그건 호출측(StudioPage.tsx)이 결정할
 * "같은 자리에 교체할지, 새로 배치할지"의 정책이고, 이 함수는 "처음 배치할 때" 좌표만
 * 계산하는 순수 함수다.
 */
export function placeBrandKitLogo(
  canvasWidth: number,
  canvasHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  maxDim = 140,
  margin = 28
): BrandKitLogoPlacement {
  const safeW = Math.max(1, sourceWidth);
  const safeH = Math.max(1, sourceHeight);
  const fit = Math.min(1, maxDim / Math.max(safeW, safeH));
  const width = Math.max(1, Math.round(safeW * fit));
  const height = Math.max(1, Math.round(safeH * fit));
  return {
    x: Math.max(0, Math.round(canvasWidth - margin - width)),
    y: Math.max(0, Math.round(canvasHeight - margin - height)),
    width,
    height,
    rotation: 0,
  };
}
