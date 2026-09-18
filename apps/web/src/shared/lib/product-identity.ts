
import { getActiveI18nLocale } from "@/shared/lib/i18n-bilingual-copy";

export type ProductLocale = "ko" | "en";

export interface ProductIdentityCopy {
  readonly brand: string;
  readonly category: string;
  readonly headline: readonly [string, string];
  readonly description: string;
  readonly promise: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
}

export const PRODUCT_IDENTITY = {
  ko: {
    brand: "툰스튜디오",
    category: "올인원 웹툰 제작 스튜디오",
    headline: ["기획부터 연재까지,", "웹툰 제작의 모든 것을 한곳에서."],
    description:
      "대본과 콘티, 전문 2D 작화, 3D 캐릭터·배경, 소재, 파일과 버전, 일정·협업, 검수와 연재 준비를 하나의 작품 프로젝트에서 이어가세요.",
    promise: "작품을 시작하고 함께 완성해 독자에게 공개하는 핵심 흐름을 ToonStudio 안에서 끝까지 이어갑니다.",
    seoTitle: "툰스튜디오 · 기획부터 연재까지 올인원 웹툰 제작",
    seoDescription:
      "대본·콘티·전문 2D 작화·3D 캐릭터와 배경·소재·클라우드 파일·일정·협업·검수·연재 준비를 한곳에서 연결하는 올인원 웹툰 제작 스튜디오입니다.",
  },
  en: {
    brand: "ToonStudio",
    category: "All-in-one webtoon creation studio",
    headline: ["From planning to publishing,", "make the whole webtoon in one place."],
    description:
      "Connect scripts, storyboards, professional 2D art, 3D characters and backgrounds, assets, files and versions, schedules, collaboration, review and publishing in one project.",
    promise: "Carry the essential workflow from the first idea to a finished, published episode inside ToonStudio.",
    seoTitle: "ToonStudio · All-in-one webtoon creation from planning to publishing",
    seoDescription:
      "An all-in-one webtoon creation studio for scripts, storyboards, professional 2D art, 3D characters and backgrounds, assets, cloud files, schedules, collaboration, review and publishing.",
  },
} as const satisfies Record<ProductLocale, ProductIdentityCopy>;

export interface ProductStartDestination {
  readonly id: "plan" | "draw" | "three-d" | "assets" | "collaborate" | "publish";
  readonly href: string;
  readonly label: Readonly<Record<ProductLocale, string>>;
  readonly description: Readonly<Record<ProductLocale, string>>;
}

export const PRODUCT_START_DESTINATIONS = [
  {
    id: "plan",
    href: "/story-lab",
    label: { ko: "기획 시작", en: "Start planning" },
    description: { ko: "작품 설정·캐릭터·시즌·대본을 정리합니다.", en: "Shape the world, characters, season and script." },
  },
  {
    id: "draw",
    href: "/studio/new",
    label: { ko: "2D 작업", en: "Create in 2D" },
    description: { ko: "콘티·선화·채색·컷·말풍선을 직접 만듭니다.", en: "Create storyboards, line art, color, panels and balloons." },
  },
  {
    id: "three-d",
    href: "/studio/bg3d",
    label: { ko: "3D 작업", en: "Create in 3D" },
    description: { ko: "캐릭터 포즈·배경·소품·카메라 구도를 만듭니다.", en: "Build poses, backgrounds, props and camera compositions." },
  },
  {
    id: "assets",
    href: "/studio/assets",
    label: { ko: "소재", en: "Assets" },
    description: { ko: "브러시·배경·캐릭터·폰트와 사용 권리를 관리합니다.", en: "Manage brushes, backgrounds, characters, fonts and rights." },
  },
  {
    id: "collaborate",
    href: "/production",
    label: { ko: "제작·협업", en: "Production & teamwork" },
    description: { ko: "회차·일정·담당자·인수인계와 진행 상태를 연결합니다.", en: "Connect episodes, schedules, owners, handoffs and progress." },
  },
  {
    id: "publish",
    href: "/studio/publish",
    label: { ko: "검토·연재", en: "Review & publish" },
    description: { ko: "수정 요청·승인·플랫폼 규격과 게시본을 확인합니다.", en: "Handle feedback, approval, platform checks and releases." },
  },
] as const satisfies readonly ProductStartDestination[];

export type ProductStartDestinationId = (typeof PRODUCT_START_DESTINATIONS)[number]["id"];

export function resolveProductLocale(_language): ProductLocale {
  return getActiveI18nLocale();
}
