import { nextExperienceDestinations } from "./site-experience-model";

export type AtelierScene = "ink" | "layers" | "panels" | "motion" | "materials";
export type AtelierLocale = "ko" | "en";

export const ATELIER_SCENES = {
  ink: {
    ko: ["선의 감각", "선을 쌓아, 표정을 만들다.", "펜선의 굵기와 질감이 만드는 인상을 살펴보세요. 아래 선은 브러시 표현을 설명하는 그래픽입니다.", "브러시로 그리기"],
    en: ["Inking", "Every line has a voice.", "Explore how line weight and texture shape an impression. The marks below are graphics illustrating brush expression.", "Draw with brushes"],
    href: "/studio", image: "materials", tag: "BRUSH / PRESSURE / TEXTURE",
  },
  layers: {
    ko: ["색과 레이어", "겹칠수록 깊어지는 장면.", "선화와 색, 대사의 역할을 분리해 보세요. 아래 스위치로 콘셉트 아트의 설명용 레이어를 켜고 끌 수 있습니다.", "레이어로 작업하기"],
    en: ["Color & layers", "Build a scene, layer by layer.", "Separate the roles of lines, color and dialogue. Toggle the illustrative layers of the concept artwork below.", "Work with layers"],
    href: "/studio", image: "world", tag: "SKETCH / COLOR / DIALOGUE",
  },
  panels: {
    ko: ["컷과 이야기", "컷의 호흡이 바꾸는 이야기.", "같은 작품도 화면의 비율에 따라 다르게 읽힙니다. 세로형과 가로형 구도를 비교해 보세요.", "웹툰 컷 구성하기"],
    en: ["Panels & story", "Compose the rhythm of a story.", "The same artwork reads differently with a new composition. Compare vertical and horizontal panel arrangements.", "Compose comic panels"],
    href: "/studio/comic", image: "process", tag: "PANEL / RHYTHM / STORY",
  },
  motion: {
    ko: ["움직이는 컷", "완성한 장면에, 다음 리듬.", "정지 이미지의 이동과 확대를 조합한 카메라 연출 예시입니다. 캐릭터 자체를 생성하거나 움직이는 영상은 아닙니다.", "홍보 영상 만들기"],
    en: ["Motion comic", "Give still artwork a new rhythm.", "A camera-motion example using a still image. This does not generate video or animate the character itself.", "Create a promo film"],
    href: "/create/promo", image: "world", tag: "STILL ART / CAMERA / TIMELINE",
  },
  materials: {
    ko: ["창작 재료", "다음 표현을 여는 재료.", "붓의 질감, 장면의 색과 공간의 디테일. 목적에 맞는 자료와 리소스를 찾아 작업으로 이어가세요.", "리소스 찾아보기"],
    en: ["Materials", "A new material. A new possibility.", "Brush texture, scene color and spatial details. Find the references and resources that fit your next work.", "Explore resources"],
    href: "/market/browse", image: "materials", tag: "BRUSH / PALETTE / ASSET",
  },
} as const;
export const ATELIER_SCENE_IDS: readonly AtelierScene[] = ["ink", "layers", "panels", "motion", "materials"];

const CHAPTERS = {
  home: { scene: "ink", number: "01", ko: ["전문 도구의 언어를, 눈으로.", "한 획의 질감부터 컷의 리듬까지. 표현 방식을 살펴보고 바로 작업실로 이어가세요."], en: ["See the language of professional tools.", "From the texture of a line to the rhythm of panels. Explore an approach, then enter your workspace."] },
  research: { scene: "layers", number: "02", ko: ["수집한 디테일을, 나만의 장면으로.", "자료는 시작점입니다. 관찰한 구조와 색, 빛을 선화와 레이어로 풀어보세요."], en: ["Turn collected details into your own scene.", "References are a starting point. Interpret structure, color and light through your own lines and layers."] },
  learn: { scene: "ink", number: "03", ko: ["배운 표현은, 한 번의 실습으로.", "기법을 읽는 데서 멈추지 마세요. 펜선과 레이어, 컷 구성의 차이를 살펴보고 직접 그려보세요."], en: ["Turn a technique into practice.", "Go beyond reading. Explore linework, layers and composition, then try them in your own drawing."] },
  market: { scene: "materials", number: "04", ko: ["좋은 재료의 다음은, 당신의 표현.", "리소스의 사용 조건과 호환성을 확인하고, 작품에 필요한 선과 색, 공간을 더하세요."], en: ["Your expression comes after the material.", "Check usage terms and compatibility, then bring the lines, colors and spaces your work needs."] },
  share: { scene: "motion", number: "05", ko: ["보여주고 싶은 장면에, 움직임을.", "완성된 컷을 작품 소개로 이어가세요. 카메라의 이동과 자막으로 새로운 시선을 만듭니다."], en: ["Give your next presentation some movement.", "Turn finished panels into an introduction to your work with camera movement and captions."] },
  discover: { scene: "panels", number: "01", ko: ["좋아하는 장면에서, 나만의 컷으로.", "작품의 구도와 흐름을 관찰하고 나의 이야기로 풀어보세요. 감상의 다음에는 창작이 있습니다."], en: ["From a favorite scene to a panel of your own.", "Observe composition and pacing, then explore them in your own story. Creation follows inspiration."] },
} as const satisfies Record<string, { scene: AtelierScene; number: string; ko: readonly string[]; en: readonly string[] }>;

/** Only enrich supported browsing pages. Keep forms, reading and editors undisturbed. */
export function atelierChapterForPath(pathname: string) {
  const path = pathname.replace(/\/+$/u, "").toLowerCase() || "/";
  if (!nextExperienceDestinations(path).length) return null;
  if (/^\/(?:research|references|insights|now|opportunities)(?:\/|$)/u.test(path)) return CHAPTERS.research;
  if (/^\/(?:learn|guide|help)(?:\/|$)/u.test(path)) return CHAPTERS.learn;
  if (/^\/market(?:\/|$)/u.test(path)) return CHAPTERS.market;
  if (/^\/(?:showcase|create|community|reviews|pencafe)(?:\/|$)/u.test(path)) return CHAPTERS.share;
  if (["/", "/about", "/make", "/contact", "/support", "/sitemap"].includes(path)) return CHAPTERS.home;
  return CHAPTERS.discover;
}

export const DESTINATION_ART = {
  discover: "world", research: "process", learn: "process", market: "materials",
  showcase: "world", community: "world", calendar: "process", library: "materials",
} as const;
