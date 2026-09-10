import {
  Box,
  Brush,
  Cuboid,
  Images,
  LayoutTemplate,
  Palette,
  SlidersHorizontal,
} from "lucide-react";

import type {
  CreatorMarketplaceResourceKind,
  CreatorMarketplaceResourceLicense,
} from "@/shared/lib/creator-marketplace-resource-contract";
import type { LucideIcon } from "lucide-react";

export interface MarketKindMeta {
  readonly kind: CreatorMarketplaceResourceKind;
  readonly label: string;
  readonly english: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly hue: number;
}

export const MARKET_KINDS: readonly MarketKindMeta[] = Object.freeze([
  {
    kind: "template",
    label: "템플릿",
    english: "TEMPLATE",
    description: "컷 구성·대사·연출이 준비된 웹툰 장면 시작점",
    icon: LayoutTemplate,
    hue: 232,
  },
  {
    kind: "asset",
    label: "2D 에셋",
    english: "2D ASSET",
    description: "캔버스에 바로 배치하는 배경·소품·효과·그래픽",
    icon: Images,
    hue: 95,
  },
  {
    kind: "3d-asset",
    label: "3D 에셋",
    english: "3D ASSET",
    description: "배경·소품·인체·자연물을 카메라로 돌려 바로 배치",
    icon: Cuboid,
    hue: 170,
  },
  {
    kind: "3d-preset",
    label: "3D 프리셋",
    english: "3D PRESET",
    description: "카메라·조명·공간 구도를 빠르게 시작하는 3D 설정",
    icon: Box,
    hue: 200,
  },
  {
    kind: "brush",
    label: "브러시",
    english: "BRUSH",
    description: "선화·스케치·채색·질감·이펙트용 드로잉 도구",
    icon: Brush,
    hue: 150,
  },
  {
    kind: "palette",
    label: "팔레트",
    english: "PALETTE",
    description: "장르·인물·환경의 색 조합을 프로젝트에 바로 적용",
    icon: Palette,
    hue: 330,
  },
  {
    kind: "filter",
    label: "보정·효과",
    english: "FILTER",
    description: "색보정·분위기·마감 효과를 비파괴적으로 적용",
    icon: SlidersHorizontal,
    hue: 280,
  },
]);

const MARKET_KIND_BY_KIND = new Map(MARKET_KINDS.map((meta) => [meta.kind, meta]));

export function marketKindMeta(kind: CreatorMarketplaceResourceKind): MarketKindMeta {
  return MARKET_KIND_BY_KIND.get(kind) ?? {
    kind,
    label: kind,
    english: kind.toUpperCase(),
    description: "",
    icon: Images,
    hue: 70,
  };
}

export interface MarketLicenseMeta {
  readonly license: CreatorMarketplaceResourceLicense;
  readonly label: string;
  readonly summary: string;
  readonly url: string | null;
}

export const MARKET_LICENSES: readonly MarketLicenseMeta[] = Object.freeze([
  {
    license: "toonspectrum-standard",
    label: "ToonSpectrum 표준 사용권",
    summary: "작품에는 사용할 수 있고 리소스 파일 자체의 재배포는 허용하지 않음",
    url: null,
  },
  {
    license: "cc0-1.0",
    label: "CC0 1.0",
    summary: "상업 이용·수정·재배포 모두 가능한 공개 리소스",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  {
    license: "cc-by-4.0",
    label: "CC BY 4.0",
    summary: "저작자 표시 조건으로 상업 이용·수정·재배포 가능",
    url: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    license: "cc-by-nc-4.0",
    label: "CC BY-NC 4.0",
    summary: "저작자 표시가 필요하며 비상업 작품에만 사용 가능",
    url: "https://creativecommons.org/licenses/by-nc/4.0/",
  },
]);

const MARKET_LICENSE_BY_LICENSE = new Map(MARKET_LICENSES.map((meta) => [meta.license, meta]));

export function marketLicenseMeta(license: CreatorMarketplaceResourceLicense): MarketLicenseMeta {
  return MARKET_LICENSE_BY_LICENSE.get(license) ?? MARKET_LICENSES[0]!;
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });

export function formatMarketDate(isoDate: string): string {
  const date = new Date(isoDate);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : isoDate;
}

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatMarketDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  return Number.isFinite(date.getTime()) ? dateTimeFormatter.format(date) : isoDate;
}

export function formatMarketByteSize(bytes: number): string {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
