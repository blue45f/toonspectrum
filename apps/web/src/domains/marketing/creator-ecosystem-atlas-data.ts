import { Binoculars, BookOpen, Compass, Layers, PackageCheck, Sparkles, Store, Users, type LucideIcon } from "lucide-react";

/**
 * 모듈 tint와 아트 tint는 하드코딩하지 않고 기존 시맨틱 토큰에서 유도한다.
 * DESIGN.md가 장식 맥락의 임의 hue를 금지하므로 토큰 파생이어야 warm-ink 축이 유지된다.
 * 아트는 저장소에 이미 커밋된 브랜드 콘셉트이며 AI 제작 사실을 화면에 명시한다.
 *
 * 8개 모듈이 8개의 서로 다른 원본 파일을 쓰도록 골랐다. 이전 커밋은 아틀리에 3종만
 * 크롭으로 반복해 같은 그림처럼 보였다. `toonstudio-route-header-*.jpg` 4장은 이전까지
 * 코드 참조가 0건이었는데 여기서 제품 화면에 들어간다.
 */
export interface AtlasModule {
  readonly icon: LucideIcon;
  readonly href: string;
  readonly image: string;
  readonly width: number;
  readonly height: number;
  /** 시선을 유도할 크롭. 종횡비가 다른 원본에서도 패널 중앙에 오도록 조정한다. */
  readonly position: string;
  readonly span: "wide" | "normal";
  readonly titleKo: string;
  readonly titleEn: string;
  readonly label: string;
  readonly bodyKo: string;
  readonly bodyEn: string;
}

export const ECOSYSTEM_MODULES = [
  {
    icon: Compass,
    href: "/explore",
    image: "/brand/toonstudio-route-header-0.jpg",
    width: 1920,
    height: 768,
    position: "50% 46%",
    span: "wide",
    titleKo: "탐색",
    titleEn: "Explore",
    label: "EVERY PLATFORM IN ONE INDEX",
    bodyKo: "18개 장르 스펙트럼과 태그 구름에서 다음 작품을 찾으세요.",
    bodyEn: "Find your next work across an 18-genre spectrum and a tag cloud.",
  },
  {
    icon: Binoculars,
    href: "/research",
    image: "/brand/toonstudio-route-header-6.jpg",
    width: 1920,
    height: 768,
    position: "38% 44%",
    span: "normal",
    titleKo: "리서치",
    titleEn: "Research",
    label: "FIND YOUR NEXT REFERENCE",
    bodyKo: "배경과 복식, 빛과 구도의 근거를 출처와 함께 모으세요.",
    bodyEn: "Collect sourced references for settings, costumes, light and composition.",
  },
  {
    icon: BookOpen,
    href: "/learn",
    image: "/brand/toonstudio-route-header-12.jpg",
    width: 1920,
    height: 768,
    position: "62% 50%",
    span: "normal",
    titleKo: "배우기",
    titleEn: "Learn",
    label: "GROW YOUR CRAFT",
    bodyKo: "막힌 단계에서 필요한 기법과 복구 방법을 바로 찾으세요.",
    bodyEn: "Find the technique or recovery step you need at the blocked stage.",
  },
  {
    icon: Store,
    href: "/market",
    image: "/brand/toonstudio-route-header-18.jpg",
    width: 1920,
    height: 768,
    position: "44% 42%",
    span: "normal",
    titleKo: "창작 마켓",
    titleEn: "Market",
    label: "MAKE IT YOUR OWN",
    bodyKo: "브러시·소재·3D 에셋의 사용 권리를 확인하고 프로젝트에 추가하세요.",
    bodyEn: "Check usage rights on brushes, materials and 3D assets, then add them.",
  },
  {
    icon: Layers,
    href: "/story-lab",
    image: "/brand/atelier-process.webp",
    width: 1536,
    height: 1024,
    position: "26% 60%",
    span: "normal",
    titleKo: "스토리 랩",
    titleEn: "Story Lab",
    label: "SHAPE YOUR STORY",
    bodyKo: "인물의 욕망과 선택을 정리해 다음에 그릴 컷을 확정하세요.",
    bodyEn: "Settle a character's goals and choices, then fix the next panel.",
  },
  {
    icon: Sparkles,
    href: "/settings/ai",
    image: "/brand/atelier-20260927/creation-world.webp",
    width: 1586,
    height: 992,
    position: "38% 55%",
    span: "normal",
    titleKo: "AI 크리에이티브 디렉터",
    titleEn: "AI Creative Director",
    label: "SMARTER CREATION WITH AI",
    bodyKo: "아이디어와 반복 작업을 돕되 최종 판단은 창작자가 해요.",
    bodyEn: "AI assists with ideas and repetition; the creator still decides.",
  },
  {
    icon: Users,
    href: "/collaborate",
    image: "/brand/atelier-world.webp",
    width: 1536,
    height: 1024,
    position: "82% 30%",
    span: "normal",
    titleKo: "함께 만들기",
    titleEn: "Collaborate",
    label: "BRING YOUR PEOPLE IN",
    bodyKo: "역할과 범위, 마감과 완료 기준을 분명히 한 뒤 협업하세요.",
    bodyEn: "Collaborate with clear roles, scope, deadlines and completion criteria.",
  },
  {
    icon: PackageCheck,
    href: "/studio",
    image: "/brand/atelier-materials.webp",
    width: 1536,
    height: 1024,
    position: "52% 78%",
    span: "wide",
    titleKo: "내 프로젝트",
    titleEn: "My Projects",
    label: "YOUR WORK, IN ONE PLACE",
    bodyKo: "이어서 만들고, 되돌리고, 다음 대화를 이어가세요.",
    bodyEn: "Resume, roll back and carry the next conversation forward.",
  },
] as const satisfies readonly AtlasModule[];
