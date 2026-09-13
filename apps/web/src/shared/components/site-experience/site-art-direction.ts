import { nextExperienceDestinations, supportsSiteExperience, type ExperienceLocale } from "./site-experience-model";

export type ArtworkKind = "world" | "process" | "materials";
export type ArtworkView = "art" | "values" | "composition";
type DirectionCopy = readonly [title: string, description: string, action: string];
export interface SiteArtDirection {
  readonly chapter: string;
  readonly image: ArtworkKind;
  readonly href: string;
  readonly ko: DirectionCopy;
  readonly en: DirectionCopy;
}

const DIRECTIONS = {
  discover: { chapter: "01 / OBSERVE", image: "world", href: "/research", ko: ["좋은 장면을 발견했다면, 나만의 시선으로.", "작품의 구도와 색, 컷의 호흡을 관찰하고 출처가 있는 레퍼런스로 표현의 단서를 모으세요. 감상에서 멈추지 않고 나의 드로잉으로 이어집니다.", "레퍼런스 찾기"], en: ["A new scene. Your own perspective.", "Study composition, color and panels. Collect sourced references and turn observation into your own drawing practice.", "Find references"] },
  research: { chapter: "02 / COLLECT", image: "materials", href: "/studio", ko: ["자료의 디테일을, 내 그림의 설득력으로.", "복식과 건축, 빛과 질감을 모았다면 스케치로 옮겨 보세요. 자료의 출처와 이용 조건을 확인하는 것도 전문적인 제작 과정의 일부입니다.", "스케치 시작하기"], en: ["Give every detail a reason to be there.", "Bring studies of costume, architecture, light and texture into a sketch. Checking sources and usage terms is part of your creative process.", "Start a sketch"] },
  learn: { chapter: "03 / PRACTICE", image: "process", href: "/studio?uiMode=simple", ko: ["배운 기법은, 직접 그릴 때 내 것이 됩니다.", "선 연습부터 명암, 채색과 컷 구성까지. 한 번에 모든 도구를 익히기보다 지금 배운 한 가지를 캔버스에서 실험해 보세요.", "캔버스에서 연습하기"], en: ["Make a technique yours by drawing.", "From line studies to values, color and panels: take one technique at a time and try it on your canvas.", "Practice on canvas"] },
  market: { chapter: "04 / EQUIP", image: "materials", href: "/studio", ko: ["좋은 소재는, 당신의 필치를 돕는 도구.", "브러시의 질감과 팔레트의 분위기, 배경 소재의 쓰임을 살펴보세요. 형식과 이용 조건을 확인한 뒤 내 작업에 맞는 재료를 선택하세요.", "작업실로 이어가기"], en: ["Materials that support your signature.", "Explore brush textures, palette moods and scene assets. Check formats and usage terms before choosing materials for your work.", "Continue to the studio"] },
  create: { chapter: "05 / CREATE", image: "process", href: "/studio", ko: ["한 획의 감각부터, 한 장면의 완성까지.", "브러시와 레이어로 선을 쌓고, 컷과 말풍선으로 이야기를 구성하세요. ToonStudio는 웹툰·일러스트를 직접 그리는 전문 창작 도구입니다.", "전문 드로잉 시작하기"], en: ["From a single mark to a complete scene.", "Build your lines with brushes and layers; shape stories with panels and dialogue. ToonStudio is a professional tool for drawing webtoons and illustrations.", "Start drawing"] },
  share: { chapter: "06 / PRESENT", image: "world", href: "/create/promo", ko: ["완성한 그림에, 사람을 만나는 다음 장면을.", "작품을 감상하고 작업 경험을 나누며 표현의 폭을 넓히세요. 내 작품이 준비됐다면 컷과 자막으로 소개 영상을 구성할 수 있습니다.", "작품 소개 영상 만들기"], en: ["Your finished work deserves its next scene.", "Explore artwork and exchange creative experiences. When your own work is ready, compose a promo with panels and captions.", "Create a work promo"] },
} as const satisfies Record<string, SiteArtDirection>;

/** Public browsing only: never promote another task inside an editor, form or reader. */
export function siteArtDirection(pathname: string): SiteArtDirection | null {
  const path = pathname.replace(/\/+$/u, "").toLowerCase() || "/";
  if (!supportsSiteExperience(path) || path === "/") return null;
  if (/^\/(?:me|my|settings|login|register|auth|play|fortune|terms|privacy|copyright)(?:\/|$)/u.test(path)) return null;
  if (/^\/market\/(?:publish|manage|checkout|library|wishlist)(?:\/|$)/u.test(path)
    || /^\/(?:create|showcase)\/(?:promo|work|series)(?:\/|$)/u.test(path)
    || /^\/create\/(?!challenges(?:\/|$))/u.test(path)) return null;
  if (/^\/(?:learn|help|guide)(?:\/|$)/u.test(path)) return DIRECTIONS.learn;
  if (/^\/(?:research|references|insights)(?:\/|$)/u.test(path)) return DIRECTIONS.research;
  if (/^\/market(?:\/|$)/u.test(path)) return DIRECTIONS.market;
  if (path === "/make" || ["/about", "/support", "/contact", "/sitemap"].includes(path)) return DIRECTIONS.create;
  if (/^\/(?:showcase|community|reviews|pencafe|opportunities)(?:\/|$)/u.test(path) || path === "/create" || path === "/create/challenges") return DIRECTIONS.share;
  return nextExperienceDestinations(path).length > 0 ? DIRECTIONS.discover : null;
}

export const DESTINATION_ART = {
  discover: "world", research: "materials", learn: "process", market: "materials",
  showcase: "world", community: "process", calendar: "world", library: "materials",
} as const satisfies Record<string, ArtworkKind>;
export const ART_VIEW_LABELS: Record<ExperienceLocale, Record<ArtworkView, string>> = {
  ko: { art: "작품", values: "명암", composition: "구도" },
  en: { art: "Artwork", values: "Values", composition: "Composition" },
};
export function artworkSources(image: ArtworkKind): string {
  return `/brand/atelier-${image}-640.webp 640w, /brand/atelier-${image}-960.webp 960w, /brand/atelier-${image}.webp 1536w`;
}

/** Only provide responsive candidates for our three explicitly owned brand images. */
export function artworkSourcesForPath(src: string): string | undefined {
  const image = (["world", "process", "materials"] as const).find((kind) => src === `/brand/atelier-${kind}.webp`);
  return image ? artworkSources(image) : undefined;
}
