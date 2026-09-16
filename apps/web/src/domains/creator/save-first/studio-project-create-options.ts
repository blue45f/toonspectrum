import type { StudioProjectKind } from "../studio-project-library-store";
import { STUDIO_WEBTOON_CANVAS_PRESETS } from "../studio-webtoon-canvas-presets";
import type { StudioStorageProvider } from "./studio-save-profile";

export interface StudioProjectCreateKindOption {
  readonly id: StudioProjectKind;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly defaultTitleKo: string;
  readonly defaultTitleEn: string;
  readonly featured: boolean;
}

export interface StudioProjectCreateTemplateOption {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface StudioProjectCreateStorageOption {
  readonly id: StudioStorageProvider;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly badgeKo: string;
  readonly badgeEn: string;
}

const WEBTOON_CANVAS_TEMPLATE_OPTIONS: readonly StudioProjectCreateTemplateOption[] = Object.freeze(
  STUDIO_WEBTOON_CANVAS_PRESETS.map((preset) => ({
    id: preset.id,
    labelKo: preset.labelKo,
    labelEn: preset.labelEn,
  })),
);

export const STUDIO_PROJECT_CREATE_KINDS: readonly StudioProjectCreateKindOption[] = Object.freeze([
  {
    id: "webtoon",
    titleKo: "웹툰",
    titleEn: "Webtoon",
    descriptionKo: "세로 원고, 컷, 말풍선과 모바일 미리보기를 함께 준비합니다.",
    descriptionEn: "Prepare a vertical manuscript, panels, balloons and mobile preview.",
    defaultTitleKo: "새 웹툰",
    defaultTitleEn: "New webtoon",
    featured: true,
  },
  {
    id: "illustration",
    titleKo: "일러스트",
    titleEn: "Illustration",
    descriptionKo: "레이어와 전문 브러시가 준비된 빈 그림 문서를 만듭니다.",
    descriptionEn: "Create a blank art document with layers and professional brushes.",
    defaultTitleKo: "새 일러스트",
    defaultTitleEn: "New illustration",
    featured: true,
  },
  {
    id: "design",
    titleKo: "표지·홍보 디자인",
    titleEn: "Cover and promotion",
    descriptionKo: "표지, 썸네일과 홍보물을 템플릿 기반으로 만듭니다.",
    descriptionEn: "Create covers, thumbnails and promotion from templates.",
    defaultTitleKo: "새 디자인",
    defaultTitleEn: "New design",
    featured: true,
  },
  {
    id: "slides",
    titleKo: "발표 자료",
    titleEn: "Presentation",
    descriptionKo: "작품 피칭과 제작 공유용 슬라이드를 시작합니다.",
    descriptionEn: "Start slides for pitching and production sharing.",
    defaultTitleKo: "새 발표 자료",
    defaultTitleEn: "New presentation",
    featured: false,
  },
  {
    id: "storyboard",
    titleKo: "스토리보드",
    titleEn: "Storyboard",
    descriptionKo: "대본, 장면, 샷과 애니매틱 타이밍을 연결합니다.",
    descriptionEn: "Connect script, scenes, shots and animatic timing.",
    defaultTitleKo: "새 스토리보드",
    defaultTitleEn: "New storyboard",
    featured: true,
  },
  {
    id: "image",
    titleKo: "이미지 편집",
    titleEn: "Image editing",
    descriptionKo: "사진 보정, 합성, 배경 제거와 비파괴 편집을 시작합니다.",
    descriptionEn: "Start retouching, compositing and non-destructive editing.",
    defaultTitleKo: "새 이미지 작업",
    defaultTitleEn: "New image project",
    featured: false,
  },
  {
    id: "three-d",
    titleKo: "3D 장면",
    titleEn: "3D scene",
    descriptionKo: "웹툰 배경·포즈·카메라와 분리 렌더를 준비합니다.",
    descriptionEn: "Prepare backgrounds, poses, cameras and layered render passes.",
    defaultTitleKo: "새 3D 장면",
    defaultTitleEn: "New 3D scene",
    featured: false,
  },
  {
    id: "animation",
    titleKo: "애니메이션·모션",
    titleEn: "Animation and motion",
    descriptionKo: "장면, 음성, 자막과 타임라인을 한 프로젝트에서 관리합니다.",
    descriptionEn: "Manage scenes, voice, captions and timeline in one project.",
    defaultTitleKo: "새 모션 프로젝트",
    defaultTitleEn: "New motion project",
    featured: false,
  },
]);

export const STUDIO_PROJECT_CREATE_TEMPLATES: Readonly<
  Record<StudioProjectKind, readonly StudioProjectCreateTemplateOption[]>
> = Object.freeze({
  webtoon: Object.freeze([
    ...WEBTOON_CANVAS_TEMPLATE_OPTIONS,
    { id: "webtoon-four-cut", labelKo: "4컷·컷툰 · 1080 × 4320px", labelEn: "Four-panel comic · 1080 × 4320px" },
    { id: "webtoon-page", labelKo: "페이지 만화 · 1600 × 2400px", labelEn: "Page comic · 1600 × 2400px" },
  ]),
  illustration: Object.freeze([
    { id: "illustration-portrait", labelKo: "인물 일러스트", labelEn: "Character illustration" },
    { id: "illustration-landscape", labelKo: "배경 일러스트", labelEn: "Environment illustration" },
  ]),
  image: Object.freeze([
    { id: "image-edit", labelKo: "빈 이미지 편집", labelEn: "Blank image edit" },
    { id: "image-composite", labelKo: "합성 작업", labelEn: "Composite" },
  ]),
  design: Object.freeze([
    { id: "design-cover", labelKo: "작품 표지", labelEn: "Series cover" },
    { id: "design-social", labelKo: "SNS 홍보", labelEn: "Social promotion" },
    { id: "design-thumbnail", labelKo: "연재 썸네일", labelEn: "Episode thumbnail" },
  ]),
  slides: Object.freeze([
    { id: "slides-pitch", labelKo: "작품 피칭", labelEn: "Series pitch" },
    { id: "slides-production", labelKo: "제작 공유", labelEn: "Production review" },
  ]),
  storyboard: Object.freeze([
    { id: "storyboard-webtoon", labelKo: "웹툰 콘티", labelEn: "Webtoon storyboard" },
    { id: "storyboard-video", labelKo: "영상 콘티", labelEn: "Video storyboard" },
  ]),
  "three-d": Object.freeze([
    { id: "3d-background", labelKo: "웹툰 배경", labelEn: "Webtoon background" },
    { id: "3d-pose", labelKo: "캐릭터 포즈", labelEn: "Character pose" },
  ]),
  animation: Object.freeze([
    { id: "motion-webtoon", labelKo: "모션 웹툰", labelEn: "Motion webtoon" },
    { id: "animation-short", labelKo: "세로 쇼츠", labelEn: "Vertical short" },
  ]),
});

export const STUDIO_PROJECT_CREATE_STORAGE: readonly StudioProjectCreateStorageOption[] = Object.freeze([
  {
    id: "browser",
    titleKo: "이 브라우저에 저장",
    titleEn: "Save in this browser",
    descriptionKo: "가장 빠르게 시작합니다. 파일이나 원격 저장소를 나중에 백업으로 추가할 수 있습니다.",
    descriptionEn: "Start immediately and add a file or remote backup later.",
    badgeKo: "기본",
    badgeEn: "Default",
  },
  {
    id: "local-file",
    titleKo: "파일·동기화 폴더에 저장",
    titleEn: "Save to a file or synced folder",
    descriptionKo: ".toonstudio 원본을 내 컴퓨터, iCloud Drive, Drive 동기화 폴더 등에 저장합니다.",
    descriptionEn: "Save an editable .toonstudio original to your computer or a synced folder.",
    badgeKo: "추천 백업",
    badgeEn: "Recommended backup",
  },
  {
    id: "toonstudio-cloud",
    titleKo: "ToonStudio 비공개 저장소",
    titleEn: "ToonStudio private storage",
    descriptionKo: "게시와 무관한 비공개 원격 사본을 준비합니다. 계정 연결 후 첫 동기화가 필요합니다.",
    descriptionEn: "Prepare a private remote copy, independent from publishing. First sync is required.",
    badgeKo: "연결 필요",
    badgeEn: "Connection required",
  },
  {
    id: "google-drive",
    titleKo: "Google Drive",
    titleEn: "Google Drive",
    descriptionKo: "사용자 소유 Drive를 기준 원본 또는 백업으로 연결합니다. 생성 후 인증합니다.",
    descriptionEn: "Connect your Drive as the canonical copy or a backup after creation.",
    badgeKo: "연결 필요",
    badgeEn: "Connection required",
  },
  {
    id: "dropbox",
    titleKo: "Dropbox",
    titleEn: "Dropbox",
    descriptionKo: "Dropbox를 원격 백업 위치로 준비합니다. 생성 후 인증합니다.",
    descriptionEn: "Prepare Dropbox as a remote backup and authenticate after creation.",
    badgeKo: "연결 필요",
    badgeEn: "Connection required",
  },
  {
    id: "onedrive",
    titleKo: "OneDrive",
    titleEn: "OneDrive",
    descriptionKo: "OneDrive를 원격 백업 위치로 준비합니다. 생성 후 인증합니다.",
    descriptionEn: "Prepare OneDrive as a remote backup and authenticate after creation.",
    badgeKo: "연결 필요",
    badgeEn: "Connection required",
  },
]);
