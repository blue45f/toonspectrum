import { supportsSiteExperience } from "./site-experience-policy";

// Retain the existing public model contract while keeping shell policy lightweight.
export { EXPERIENCE_MODE_KEY, parseExperienceMode, supportsSiteExperience, type ExperienceMode, type ExperienceLocale } from "./site-experience-policy";

export const EXPERIENCE_DESTINATIONS = {
  discover: { href: "/discover", icon: "discover", ko: ["영감 찾기", "취향에 맞는 작품에서 다음 장면의 힌트를 찾으세요."], en: ["Find inspiration", "Discover a story that sparks your next scene."] },
  research: { href: "/research", icon: "research", ko: ["레퍼런스 모으기", "자료의 출처를 살피고 장면에 필요한 디테일을 모으세요."], en: ["Gather references", "Find sourced details to give your scene depth."] },
  learn: { href: "/learn", icon: "learn", ko: ["새로운 기법 익히기", "작업에 필요한 도구와 표현 방법을 알아보세요."], en: ["Learn a technique", "Explore tools and techniques for your next work."] },
  market: { href: "/market", icon: "market", ko: ["창작 재료 고르기", "소재와 사용 조건을 확인하고 작업에 연결하세요."], en: ["Choose your materials", "Explore assets and check their usage terms."] },
  showcase: { href: "/showcase", icon: "showcase", ko: ["창작자의 작품 만나기", "다른 창작자의 표현을 감상하고 나의 시선을 넓히세요."], en: ["Explore the showcase", "See how other creators bring their ideas to life."] },
  community: { href: "/community", icon: "community", ko: ["작업 이야기 나누기", "궁금한 점과 창작의 경험을 커뮤니티에서 나누세요."], en: ["Join the conversation", "Exchange questions and creative experiences."] },
  calendar: { href: "/calendar", icon: "calendar", ko: ["연재 일정 살펴보기", "요일별 작품을 살펴보고 다음 읽을거리를 찾아보세요."], en: ["Explore the schedule", "Find your next read in the weekly release calendar."] },
  library: { href: "/library", icon: "library", ko: ["내 서재로 돌아가기", "저장한 작품과 관심 목록을 한곳에서 이어보세요."], en: ["Return to your library", "Continue with your saved stories and interests."] },
} as const;

export type ExperienceDestinationId = keyof typeof EXPERIENCE_DESTINATIONS;

/** Exact allow-list destinations only: no arbitrary return URLs, IDs or queries. */
export function experienceDestinationForHref(href: string) {
  return Object.values(EXPERIENCE_DESTINATIONS).find((destination) => destination.href === href);
}

export function nextExperienceDestinations(pathname: string): ExperienceDestinationId[] {
  const path = pathname.replace(/\/+$/u, "").toLowerCase() || "/";
  if (!supportsSiteExperience(path)) return [];
  // Do not interrupt purchasing, publishing, settings, authentication or reading.
  if (/^\/(?:me|my|settings|login|register|auth|play|fortune)(?:\/|$)/u.test(path)
    || /^\/market\/(?:publish|manage|checkout|library|wishlist)(?:\/|$)/u.test(path)
    || /^\/(?:create|showcase)\/(?:promo|work|series)(?:\/|$)/u.test(path)
    || /^\/create\/(?!challenges(?:\/|$))/u.test(path)
    || /^\/(?:terms|privacy|copyright)(?:\/|$)/u.test(path)) return [];
  let ids: ExperienceDestinationId[];
  if (/^\/(?:learn|help|guide)(?:\/|$)/u.test(path)) ids = ["research", "market", "showcase"];
  else if (/^\/(?:research|references|insights|now|opportunities|market)(?:\/|$)/u.test(path)) ids = ["learn", "showcase", "community"];
  else if (/^\/(?:showcase|create|community|reviews|pencafe)(?:\/|$)/u.test(path)) ids = ["discover", "learn", "market"];
  else if (path === "/library") ids = ["calendar", "discover", "showcase"];
  else if (/^\/(?:discover|search|ranking|calendar|explore|recommend|random|tags|authors|author|title|compare)(?:\/|$)/u.test(path)) ids = ["research", "library", "learn"];
  else if (["/", "/make", "/about", "/about/data", "/contact", "/support", "/sitemap", "/news", "/now", "/insights", "/opportunities"].includes(path)) ids = ["discover", "learn", "showcase"];
  else return [];
  return ids.filter((id) => EXPERIENCE_DESTINATIONS[id].href !== path);
}
