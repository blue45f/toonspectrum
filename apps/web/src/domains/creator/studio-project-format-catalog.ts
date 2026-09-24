import { createStudioProjectDefinition, type StudioProjectCollaboration, type StudioProjectDefinition, type StudioProjectFormat, type StudioProjectPurpose, type StudioProjectStartPoint, type StudioWorkspaceMode } from "./studio-project-definition";
import type { StudioProjectKind } from "./studio-project-library-reader";
import { STUDIO_WEBTOON_CANVAS_PRESETS } from "./studio-webtoon-canvas-presets";

export type StudioProjectFormatVisual = "vertical-scroll" | "card-sequence" | "page-spread" | "timeline" | "canvas";

export interface StudioProjectFormatTemplateOption {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly pageCount: number;
}

export interface StudioProjectFormatProfile {
  readonly id: StudioProjectFormat;
  readonly projectKind: Extract<StudioProjectKind, "webtoon" | "illustration" | "animation">;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly defaultTitleKo: string;
  readonly defaultTitleEn: string;
  readonly visual: StudioProjectFormatVisual;
  readonly hierarchyKo: readonly string[];
  readonly hierarchyEn: readonly string[];
  readonly workflowKo: readonly string[];
  readonly workflowEn: readonly string[];
  readonly keyToolsKo: readonly string[];
  readonly keyToolsEn: readonly string[];
  readonly checksKo: readonly string[];
  readonly checksEn: readonly string[];
  readonly outputsKo: readonly string[];
  readonly outputsEn: readonly string[];
  readonly primaryWorkspace: StudioWorkspaceMode;
  readonly enabledWorkspaces: readonly StudioWorkspaceMode[];
  readonly deliveryProfileIds: readonly string[];
  readonly templates: readonly StudioProjectFormatTemplateOption[];
}

export interface StudioProjectIntentOption<T extends string> {
  readonly id: T;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
}

export interface StudioAuxiliaryWorkspaceOption {
  readonly id: Extract<StudioProjectKind, "storyboard" | "image" | "three-d" | "design" | "slides">;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly defaultTitleKo: string;
  readonly defaultTitleEn: string;
  readonly templateId: string;
}

const template = (
  id: string,
  labelKo: string,
  labelEn: string,
  detailKo: string,
  detailEn: string,
  pageCount: number,
): StudioProjectFormatTemplateOption => Object.freeze({ id, labelKo, labelEn, detailKo, detailEn, pageCount });

const verticalTemplates = STUDIO_WEBTOON_CANVAS_PRESETS.map((preset) => template(
  preset.id,
  preset.labelKo,
  preset.labelEn,
  "긴 세로 원고 1개를 모바일 스크롤 기준으로 시작합니다.",
  "Starts one long vertical manuscript for mobile scrolling.",
  1,
));

export const STUDIO_PROJECT_FORMAT_PROFILES: readonly StudioProjectFormatProfile[] = Object.freeze([
  Object.freeze({
    id: "vertical-webtoon",
    projectKind: "webtoon",
    titleKo: "세로 연재 웹툰",
    titleEn: "Vertical serial webtoon",
    descriptionKo: "회차·장면·컷을 긴 세로 원고와 모바일 읽기 흐름으로 제작합니다.",
    descriptionEn: "Produce episodes, scenes and panels as a long mobile-first scroll.",
    defaultTitleKo: "새 세로 웹툰",
    defaultTitleEn: "New vertical webtoon",
    visual: "vertical-scroll",
    hierarchyKo: ["작품", "시즌", "회차", "장면", "컷"],
    hierarchyEn: ["Series", "Season", "Episode", "Scene", "Panel"],
    workflowKo: ["기획", "콘티", "원고", "식자", "모바일 검수"],
    workflowEn: ["Plan", "Storyboard", "Artwork", "Lettering", "Mobile review"],
    keyToolsKo: ["긴 캔버스", "컷", "말풍선", "캐릭터 연속성"],
    keyToolsEn: ["Long canvas", "Panels", "Balloons", "Character continuity"],
    checksKo: ["컷 간격", "모바일 글자 크기", "말풍선 잘림", "분할 지점"],
    checksEn: ["Panel spacing", "Mobile type size", "Balloon clipping", "Slice points"],
    outputsKo: ["긴 세로 원고", "플랫폼별 분할 이미지", "회차 업로드 패키지"],
    outputsEn: ["Long scroll image", "Platform slices", "Episode upload package"],
    primaryWorkspace: "webtoon",
    enabledWorkspaces: ["planning", "storyboard", "webtoon", "image", "three-d", "design", "animation", "localization", "review"],
    deliveryProfileIds: ["webtoon-long-image", "episode-package", "platform-preview"],
    templates: Object.freeze(verticalTemplates),
  }),
  Object.freeze({
    id: "cuttoon",
    projectKind: "webtoon",
    titleKo: "컷툰·SNS 만화",
    titleEn: "Card comic & social series",
    descriptionKo: "여러 장의 카드를 순서대로 읽는 짧은 만화를 채널 비율에 맞춰 만듭니다.",
    descriptionEn: "Create short, ordered card comics for social channel ratios.",
    defaultTitleKo: "새 컷툰",
    defaultTitleEn: "New card comic",
    visual: "card-sequence",
    hierarchyKo: ["시리즈", "게시물", "카드"],
    hierarchyEn: ["Series", "Post", "Card"],
    workflowKo: ["카드 구성", "그리기", "텍스트", "비율 변형", "게시 검사"],
    workflowEn: ["Card plan", "Artwork", "Text", "Ratio variants", "Publish check"],
    keyToolsKo: ["카드 보드", "순서 편집", "안전 영역", "비율 변형"],
    keyToolsEn: ["Card board", "Sequence", "Safe areas", "Ratio variants"],
    checksKo: ["첫 카드 주목도", "카드별 가독성", "순서", "피드 잘림"],
    checksEn: ["First-card hook", "Card readability", "Sequence", "Feed crop"],
    outputsKo: ["번호가 붙은 카드 ZIP", "대표 표지", "채널별 변형본"],
    outputsEn: ["Numbered card ZIP", "Cover card", "Channel variants"],
    primaryWorkspace: "webtoon",
    enabledWorkspaces: ["planning", "storyboard", "webtoon", "image", "design", "animation", "review"],
    deliveryProfileIds: ["social-card-sequence", "social-square", "vertical-promo"],
    templates: Object.freeze([
      template("cuttoon-square-4", "정사각 4컷 · 1080 × 1080px × 4장", "Square 4-card · 1080 × 1080px × 4", "피드형 4장 카드 세트", "Four-card feed set", 4),
      template("cuttoon-portrait-8", "세로형 8컷 · 1080 × 1350px × 8장", "Portrait 8-card · 1080 × 1350px × 8", "4:5 피드형 8장 카드 세트", "Eight-card 4:5 feed set", 8),
      template("cuttoon-story-10", "스토리형 10컷 · 1080 × 1920px × 10장", "Story 10-card · 1080 × 1920px × 10", "9:16 스토리·쇼츠형 카드 세트", "Ten-card 9:16 story set", 10),
    ]),
  }),
  Object.freeze({
    id: "page-comic",
    projectKind: "webtoon",
    titleKo: "페이지 만화",
    titleEn: "Page comic",
    descriptionKo: "페이지와 좌우 스프레드, 재단 여백과 읽기 방향을 기준으로 제작합니다.",
    descriptionEn: "Author pages and spreads with trim, gutter and reading-direction controls.",
    defaultTitleKo: "새 페이지 만화",
    defaultTitleEn: "New page comic",
    visual: "page-spread",
    hierarchyKo: ["작품", "챕터", "스프레드", "페이지", "컷"],
    hierarchyEn: ["Series", "Chapter", "Spread", "Page", "Panel"],
    workflowKo: ["페이지 구성", "콘티", "원고", "식자", "출판 검사"],
    workflowEn: ["Pagination", "Storyboard", "Artwork", "Lettering", "Publication check"],
    keyToolsKo: ["페이지 썸네일", "좌우 스프레드", "재단선", "제본 여백"],
    keyToolsEn: ["Page thumbnails", "Spreads", "Trim guides", "Binding gutter"],
    checksKo: ["페이지 순서", "좌우 배치", "재단 여백", "인쇄 해상도"],
    checksEn: ["Page order", "Spread pairing", "Trim margin", "Print resolution"],
    outputsKo: ["출판용 PDF", "페이지별 PNG", "디지털 뷰어 패키지"],
    outputsEn: ["Publication PDF", "Page PNG files", "Digital reader package"],
    primaryWorkspace: "webtoon",
    enabledWorkspaces: ["planning", "storyboard", "webtoon", "image", "three-d", "design", "localization", "review"],
    deliveryProfileIds: ["page-pdf", "page-images", "print-package"],
    templates: Object.freeze([
      template("page-comic-digital-8", "디지털 페이지 · 1600 × 2400px · 8p", "Digital pages · 1600 × 2400px · 8p", "웹·전자책용 8페이지", "Eight pages for web and digital reading", 8),
      template("page-comic-b5-24", "B5 출판형 · 1760 × 2508px · 24p", "B5 publication · 1760 × 2508px · 24p", "단행본·동인지용 24페이지", "Twenty-four pages for print publication", 24),
    ]),
  }),
  Object.freeze({
    id: "motion-toon",
    projectKind: "animation",
    titleKo: "모션툰·세로 영상",
    titleEn: "Motion toon & vertical video",
    descriptionKo: "컷, 카메라 움직임, 음성, 자막과 오디오를 시간축에서 편집합니다.",
    descriptionEn: "Edit panels, camera motion, voice, captions and audio on a timeline.",
    defaultTitleKo: "새 모션툰",
    defaultTitleEn: "New motion toon",
    visual: "timeline",
    hierarchyKo: ["작품", "에피소드", "장면", "샷", "시간"],
    hierarchyEn: ["Series", "Episode", "Scene", "Shot", "Time"],
    workflowKo: ["장면", "모션", "음성·오디오", "자막", "재생 검수"],
    workflowEn: ["Scenes", "Motion", "Voice & audio", "Captions", "Playback review"],
    keyToolsKo: ["재생 화면", "타임라인", "키프레임", "오디오 트랙"],
    keyToolsEn: ["Playback", "Timeline", "Keyframes", "Audio tracks"],
    checksKo: ["전체 길이", "자막 안전 영역", "음성 싱크", "첫 프레임"],
    checksEn: ["Duration", "Caption safe area", "Voice sync", "First frame"],
    outputsKo: ["MP4", "WebM", "GIF", "9:16 세로 쇼츠"],
    outputsEn: ["MP4", "WebM", "GIF", "9:16 vertical short"],
    primaryWorkspace: "animation",
    enabledWorkspaces: ["planning", "storyboard", "illustration", "image", "three-d", "animation", "design", "review"],
    deliveryProfileIds: ["mp4", "webm", "gif", "vertical-short"],
    templates: Object.freeze([
      template("motion-toon-vertical", "세로 모션툰 · 1080 × 1920px", "Vertical motion toon · 1080 × 1920px", "쇼츠·릴스·세로 재생용", "For shorts, reels and vertical playback", 1),
      template("motion-toon-landscape", "가로 모션툰 · 1920 × 1080px", "Landscape motion toon · 1920 × 1080px", "영상·프레젠테이션용", "For video and presentation playback", 1),
    ]),
  }),
  Object.freeze({
    id: "illustration",
    projectKind: "illustration",
    titleKo: "일러스트·키비주얼",
    titleEn: "Illustration & key visual",
    descriptionKo: "한 장의 완성 이미지에 집중해 브러시, 레이어, 색과 레퍼런스로 제작합니다.",
    descriptionEn: "Focus on a finished image with brushes, layers, color and references.",
    defaultTitleKo: "새 일러스트",
    defaultTitleEn: "New illustration",
    visual: "canvas",
    hierarchyKo: ["작품", "아트보드", "레이어"],
    hierarchyEn: ["Work", "Artboard", "Layer"],
    workflowKo: ["러프", "선화", "채색", "효과", "마감"],
    workflowEn: ["Rough", "Line art", "Color", "Effects", "Finish"],
    keyToolsKo: ["넓은 캔버스", "브러시", "레이어", "레퍼런스"],
    keyToolsEn: ["Wide canvas", "Brushes", "Layers", "References"],
    checksKo: ["출력 크기", "투명 배경", "잘린 요소", "해상도"],
    checksEn: ["Output size", "Transparency", "Clipped objects", "Resolution"],
    outputsKo: ["고해상도 PNG", "JPEG", "투명 이미지", "편집 원본"],
    outputsEn: ["High-resolution PNG", "JPEG", "Transparent image", "Editable source"],
    primaryWorkspace: "illustration",
    enabledWorkspaces: ["illustration", "image", "three-d", "design", "review"],
    deliveryProfileIds: ["png", "jpeg", "high-resolution"],
    templates: Object.freeze([
      template("illustration-portrait", "인물 일러스트 · 2048 × 2560px", "Character illustration · 2048 × 2560px", "세로형 인물·키비주얼", "Portrait character or key visual", 1),
      template("illustration-landscape", "배경 일러스트 · 2560 × 1440px", "Environment illustration · 2560 × 1440px", "가로형 배경·콘셉트 아트", "Landscape environment or concept art", 1),
      template("illustration-square", "정사각 키비주얼 · 2048 × 2048px", "Square key visual · 2048 × 2048px", "대표 이미지·앨범형 비주얼", "Square hero image or cover visual", 1),
    ]),
  }),
]);

export const STUDIO_PROJECT_START_POINT_OPTIONS: readonly StudioProjectIntentOption<StudioProjectStartPoint>[] = Object.freeze([
  { id: "idea", titleKo: "아이디어부터", titleEn: "Start from an idea", descriptionKo: "작품 Brief와 첫 구조를 준비합니다.", descriptionEn: "Prepare the work brief and initial structure." },
  { id: "script", titleKo: "대본이 있어요", titleEn: "I have a script", descriptionKo: "대본을 장면·컷·샷으로 분해합니다.", descriptionEn: "Break the script into scenes, panels or shots." },
  { id: "storyboard", titleKo: "콘티·이미지가 있어요", titleEn: "I have boards or images", descriptionKo: "기존 자료를 제작 순서에 배치합니다.", descriptionEn: "Arrange existing material into the production flow." },
  { id: "files", titleKo: "작업 파일이 있어요", titleEn: "I have working files", descriptionKo: "가져오기 전에 맞는 프로젝트 구조를 준비합니다.", descriptionEn: "Prepare the right project structure before import." },
]);

export const STUDIO_PROJECT_PURPOSE_OPTIONS: readonly StudioProjectIntentOption<StudioProjectPurpose>[] = Object.freeze([
  { id: "serial", titleKo: "연재·공개", titleEn: "Serial publishing", descriptionKo: "회차와 게시 규격 중심", descriptionEn: "Episode and publishing focused" },
  { id: "portfolio", titleKo: "포트폴리오", titleEn: "Portfolio", descriptionKo: "완성도와 고해상도 출력 중심", descriptionEn: "Quality and high-resolution output" },
  { id: "brand", titleKo: "광고·브랜드", titleEn: "Brand campaign", descriptionKo: "브랜드 기준과 승인 단계 포함", descriptionEn: "Brand rules and approval stages" },
  { id: "client-work", titleKo: "클라이언트 납품", titleEn: "Client delivery", descriptionKo: "검토·수정·납품 이력 중심", descriptionEn: "Review, revision and delivery focused" },
]);

export const STUDIO_PROJECT_COLLABORATION_OPTIONS: readonly StudioProjectIntentOption<StudioProjectCollaboration>[] = Object.freeze([
  { id: "solo", titleKo: "개인 작업", titleEn: "Solo", descriptionKo: "내 작업과 다음 행동 중심", descriptionEn: "Focused on your work and next action" },
  { id: "team", titleKo: "팀 제작", titleEn: "Team", descriptionKo: "역할·마감·인수인계 포함", descriptionEn: "Roles, deadlines and handoffs" },
  { id: "client", titleKo: "외부 검토 포함", titleEn: "External review", descriptionKo: "클라이언트 승인·수정 요청 포함", descriptionEn: "Client approval and change requests" },
]);

export const STUDIO_AUXILIARY_WORKSPACE_OPTIONS: readonly StudioAuxiliaryWorkspaceOption[] = Object.freeze([
  { id: "storyboard", titleKo: "스토리보드만 열기", titleEn: "Storyboard only", descriptionKo: "대본을 장면과 샷으로 분해합니다.", descriptionEn: "Break a script into scenes and shots.", defaultTitleKo: "새 스토리보드", defaultTitleEn: "New storyboard", templateId: "storyboard-webtoon" },
  { id: "image", titleKo: "이미지 편집", titleEn: "Image editing", descriptionKo: "보정·합성·배경 제거를 시작합니다.", descriptionEn: "Start retouching, compositing and background removal.", defaultTitleKo: "새 이미지 작업", defaultTitleEn: "New image edit", templateId: "image-edit" },
  { id: "three-d", titleKo: "3D 장면", titleEn: "3D scene", descriptionKo: "배경·포즈·카메라 레퍼런스를 만듭니다.", descriptionEn: "Create background, pose and camera references.", defaultTitleKo: "새 3D 장면", defaultTitleEn: "New 3D scene", templateId: "3d-background" },
  { id: "design", titleKo: "표지·홍보 디자인", titleEn: "Cover & promotion", descriptionKo: "표지·썸네일·SNS 파생본을 만듭니다.", descriptionEn: "Create covers, thumbnails and social variants.", defaultTitleKo: "새 홍보 디자인", defaultTitleEn: "New promotion design", templateId: "design-cover" },
  { id: "slides", titleKo: "발표 자료", titleEn: "Presentation", descriptionKo: "작품 피칭과 제작 공유용 자료를 만듭니다.", descriptionEn: "Create pitch and production review slides.", defaultTitleKo: "새 발표 자료", defaultTitleEn: "New presentation", templateId: "slides-pitch" },
]);

export function studioProjectFormatProfile(id: StudioProjectFormat): StudioProjectFormatProfile {
  const profile = STUDIO_PROJECT_FORMAT_PROFILES.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`Unknown Studio project format: ${id}`);
  return profile;
}

export function studioProjectFormatTemplate(
  profile: StudioProjectFormatProfile,
  templateId?: string | null,
): StudioProjectFormatTemplateOption {
  return profile.templates.find((candidate) => candidate.id === templateId) ?? profile.templates[0]!;
}

export function studioProjectFormatFromLegacy(
  kind?: string | null,
  templateId?: string | null,
): StudioProjectFormat | null {
  if (kind === "animation" || templateId?.startsWith("motion-toon-")) return "motion-toon";
  if (kind === "illustration" || templateId?.startsWith("illustration-")) return "illustration";
  if (kind !== "webtoon" && !templateId?.startsWith("webtoon-") && !templateId?.startsWith("cuttoon-") && !templateId?.startsWith("page-comic-")) return null;
  if (templateId === "webtoon-four-cut" || templateId?.startsWith("cuttoon-")) return "cuttoon";
  if (templateId === "webtoon-page" || templateId?.startsWith("page-comic-")) return "page-comic";
  return "vertical-webtoon";
}

export function studioProjectDefinitionFromSelection(
  profile: StudioProjectFormatProfile,
  purpose: StudioProjectPurpose,
  startPoint: StudioProjectStartPoint,
  collaboration: StudioProjectCollaboration,
): StudioProjectDefinition {
  return createStudioProjectDefinition({
    format: profile.id,
    purpose,
    startPoint,
    collaboration,
    primaryWorkspace: profile.primaryWorkspace,
    enabledWorkspaces: profile.enabledWorkspaces,
    deliveryProfileIds: profile.deliveryProfileIds,
  });
}

export function studioProjectFormatDocumentTitle(
  format: StudioProjectFormat,
  projectTitle: string,
  locale: "ko" | "en",
): string {
  if (format === "vertical-webtoon") return locale === "ko" ? "EP01 원고" : "EP01 manuscript";
  if (format === "cuttoon") return locale === "ko" ? "첫 게시물 카드" : "First post cards";
  if (format === "page-comic") return locale === "ko" ? "챕터 1 원고" : "Chapter 1 pages";
  if (format === "motion-toon") return locale === "ko" ? "에피소드 1 타임라인" : "Episode 1 timeline";
  return locale === "ko" ? `${projectTitle} 아트보드` : `${projectTitle} artboard`;
}
