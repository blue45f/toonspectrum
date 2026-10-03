/**
 * 커스텀 브랜딩 (Track 4 · 벤치마크 gap 2)
 *
 * B2B 판매 필수 요소: 로딩화면·로고·URL 커스텀.
 * 이 모듈은 브랜딩 설정의 구조(스키마·기본값·검증·병합)까지만 다룬다.
 *
 * 범위 명시 (후속 작업):
 * - 로딩화면 컴포넌트에 브랜딩 적용 (UI).
 * - 커스텀 도메인/URL 실제 연결 (인프라·배포 정책과 조율).
 * - 파비콘·OG 이미지 동적 교체.
 */

export interface StudioSpaceBranding {
  /** 공간 이름. */
  readonly spaceName: string;
  /** 로고 이미지 URL (https 또는 /). */
  readonly logoUrl?: string;
  /** 로고 대체 텍스트. */
  readonly logoAlt?: string;
  /** 브랜드 대표 색 (hex). */
  readonly primaryColor?: string;
  /** 로딩화면 제목. */
  readonly loadingTitle?: string;
  /** 로딩화면 부제. */
  readonly loadingSubtitle?: string;
  /** 로딩화면 배경 (색상 hex 또는 이미지 URL). */
  readonly loadingBackground?: string;
  /** 파비콘 URL. */
  readonly faviconUrl?: string;
  /** 표시용 커스텀 도메인 메모 (실제 연결은 인프라 작업). */
  readonly customDomainNote?: string;
}

export const DEFAULT_STUDIO_SPACE_BRANDING: StudioSpaceBranding = Object.freeze({
  spaceName: "툰스튜디오 가상 공간",
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_TEXT = 120;

function isSafeUrl(value: string): boolean {
  return value.startsWith("/") || /^https:\/\//.test(value);
}

/** 브랜딩 설정 검증. 오류 메시지 배열 (빈 배열 = 통과). */
export function validateStudioSpaceBranding(branding: StudioSpaceBranding): readonly string[] {
  const errors: string[] = [];
  if (!branding.spaceName.trim()) errors.push("spaceName이 비어 있습니다");
  if (branding.spaceName.length > MAX_TEXT) errors.push("spaceName이 너무 길다");
  if (branding.logoUrl !== undefined && !isSafeUrl(branding.logoUrl)) errors.push("logoUrl은 / 또는 https:// 로 시작해야 한다");
  if (branding.primaryColor !== undefined && !HEX_COLOR.test(branding.primaryColor)) errors.push("primaryColor는 #rrggbb 형식이어야 한다");
  if (branding.loadingTitle !== undefined && branding.loadingTitle.length > MAX_TEXT) errors.push("loadingTitle이 너무 길다");
  if (branding.loadingSubtitle !== undefined && branding.loadingSubtitle.length > MAX_TEXT) errors.push("loadingSubtitle이 너무 길다");
  if (branding.loadingBackground !== undefined) {
    const background = branding.loadingBackground;
    if (!HEX_COLOR.test(background) && !isSafeUrl(background)) errors.push("loadingBackground는 색상 또는 /·https:// 이미지여야 한다");
  }
  if (branding.faviconUrl !== undefined && !isSafeUrl(branding.faviconUrl)) errors.push("faviconUrl은 / 또는 https:// 로 시작해야 한다");
  return Object.freeze(errors);
}

/** 부분 설정을 기본값과 병합한다. */
export function mergeStudioSpaceBranding(partial: Partial<StudioSpaceBranding>): StudioSpaceBranding {
  return Object.freeze({ ...DEFAULT_STUDIO_SPACE_BRANDING, ...partial });
}

/**
 * unknown 입력을 브랜딩 설정으로 파싱한다.
 * 검증 실패 시 null (호출자가 기본값을 쓴다).
 */
export function parseStudioSpaceBranding(input: unknown): StudioSpaceBranding | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const branding: StudioSpaceBranding = {
    spaceName: typeof record.spaceName === "string" ? record.spaceName : "",
    logoUrl: typeof record.logoUrl === "string" ? record.logoUrl : undefined,
    logoAlt: typeof record.logoAlt === "string" ? record.logoAlt : undefined,
    primaryColor: typeof record.primaryColor === "string" ? record.primaryColor : undefined,
    loadingTitle: typeof record.loadingTitle === "string" ? record.loadingTitle : undefined,
    loadingSubtitle: typeof record.loadingSubtitle === "string" ? record.loadingSubtitle : undefined,
    loadingBackground: typeof record.loadingBackground === "string" ? record.loadingBackground : undefined,
    faviconUrl: typeof record.faviconUrl === "string" ? record.faviconUrl : undefined,
    customDomainNote: typeof record.customDomainNote === "string" ? record.customDomainNote : undefined,
  };
  return validateStudioSpaceBranding(branding).length === 0 ? Object.freeze(branding) : null;
}

/** 로딩화면에 쓸 표시 값 (폴백 포함). */
export function studioBrandingDisplay(branding: StudioSpaceBranding): {
  readonly title: string;
  readonly subtitle: string;
  readonly background: string;
  readonly primaryColor: string;
} {
  return {
    title: branding.loadingTitle?.trim() || branding.spaceName,
    subtitle: branding.loadingSubtitle?.trim() || "",
    background: branding.loadingBackground ?? "#14141f",
    primaryColor: branding.primaryColor ?? "#7c6cf0",
  };
}
