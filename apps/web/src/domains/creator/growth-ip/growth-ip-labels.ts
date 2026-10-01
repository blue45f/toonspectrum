// 작가 성장·IP 작업대의 선택지·상태 라벨(한국어, 영어). 저장 값(영문 식별자)을 화면에 그대로 노출하지 않는다.
import type {
  CreatorAgeBand,
  CreatorCapability,
  CreatorSupportArea,
  CreatorSupportRequest,
  EducationProgram,
  RightsInquiry,
  RookieCreatorProfile,
  WebNovelChapter,
} from "./creator-growth-ip-model";

export type LabelPair = readonly [ko: string, en: string];

export const AGE_BANDS: readonly CreatorAgeBand[] = ["unknown", "under-14", "14-15", "16-17", "18-plus"];
export const CAPABILITIES: readonly CreatorCapability[] = ["browse", "learning", "community-posting", "public-profile", "direct-messaging", "assistant-hiring", "payments", "rights-offers", "mature-content"];
export const SUPPORT_AREAS: readonly CreatorSupportArea[] = ["mentoring", "editing", "legal", "tax", "translation", "marketing", "assistant", "education", "publishing"];
export const RIGHTS_MEDIA: readonly RightsInquiry["medium"][] = ["film", "animation", "drama", "game", "translation", "audio", "merchandise"];
export const RIGHTS_STATUSES: readonly RightsInquiry["status"][] = ["received", "reviewing", "needs-counsel", "declined", "closed"];
export const CREATOR_STAGES: readonly RookieCreatorProfile["stage"][] = ["student", "rookie", "independent", "professional"];
export const EDUCATION_MODES: readonly EducationProgram["mode"][] = ["offline", "online", "hybrid"];
export const EDUCATION_LEVELS: readonly EducationProgram["level"][] = ["beginner", "intermediate", "advanced"];
export const CHAPTER_STATUSES: readonly WebNovelChapter["status"][] = ["idea", "draft", "review", "published"];

export const AGE_BAND_LABEL: Record<CreatorAgeBand, LabelPair> = {
  unknown: ["미확인", "Not confirmed"],
  "under-14": ["만 14세 미만", "Under 14"],
  "14-15": ["만 14–15세", "14–15"],
  "16-17": ["만 16–17세", "16–17"],
  "18-plus": ["만 18세 이상", "18 or older"],
};

export const CAPABILITY_LABEL: Record<CreatorCapability, LabelPair> = {
  browse: ["공개 탐색", "Public browsing"],
  learning: ["학습", "Learning"],
  "community-posting": ["커뮤니티 게시", "Community posting"],
  "public-profile": ["공개 프로필", "Public profile"],
  "direct-messaging": ["개인 메시지(DM)", "Direct messages"],
  "assistant-hiring": ["업무 매칭", "Assistant hiring"],
  payments: ["결제·정산", "Payments"],
  "rights-offers": ["판권 제안", "Rights offers"],
  "mature-content": ["성인 콘텐츠", "Mature content"],
};

export const SUPPORT_AREA_LABEL: Record<CreatorSupportArea, LabelPair> = {
  mentoring: ["멘토링", "Mentoring"],
  editing: ["편집·기획", "Editing & planning"],
  legal: ["법무·계약", "Legal & contracts"],
  tax: ["세무", "Tax"],
  translation: ["번역", "Translation"],
  marketing: ["마케팅", "Marketing"],
  assistant: ["어시스트", "Assistants"],
  education: ["교육", "Education"],
  publishing: ["연재·출판", "Serialization & publishing"],
};

export const SUPPORT_STATUS_LABEL: Record<CreatorSupportRequest["status"], LabelPair> = {
  draft: ["초안", "Draft"],
  requested: ["요청됨", "Requested"],
  matched: ["연결됨", "Matched"],
  done: ["완료", "Done"],
};

export const CREATOR_STAGE_LABEL: Record<RookieCreatorProfile["stage"], LabelPair> = {
  student: ["학생", "Student"],
  rookie: ["신인", "Rookie"],
  independent: ["독립 작가", "Independent"],
  professional: ["프로 작가", "Professional"],
};

export const DISCOVERY_STATUS_LABEL: Record<RookieCreatorProfile["discoveryStatus"], LabelPair> = {
  private: ["비공개", "Private"],
  review: ["검토 대기", "Pending review"],
  discoverable: ["발굴 목록 공개", "Discoverable"],
};

export const CHAPTER_STATUS_LABEL: Record<WebNovelChapter["status"], LabelPair> = {
  idea: ["아이디어", "Idea"],
  draft: ["초고", "Draft"],
  review: ["검토", "Review"],
  published: ["연재됨", "Published"],
};

export const RIGHTS_MEDIUM_LABEL: Record<RightsInquiry["medium"], LabelPair> = {
  film: ["영화", "Film"],
  animation: ["애니메이션", "Animation"],
  drama: ["드라마", "Drama"],
  game: ["게임", "Game"],
  translation: ["번역 출판", "Translation"],
  audio: ["오디오", "Audio"],
  merchandise: ["상품화", "Merchandise"],
};

export const RIGHTS_STATUS_LABEL: Record<RightsInquiry["status"], LabelPair> = {
  received: ["접수", "Received"],
  reviewing: ["검토 중", "Reviewing"],
  "needs-counsel": ["법률 검토 필요", "Needs counsel"],
  declined: ["거절", "Declined"],
  closed: ["종료", "Closed"],
};

export const EDUCATION_MODE_LABEL: Record<EducationProgram["mode"], LabelPair> = {
  offline: ["오프라인", "Offline"],
  online: ["온라인", "Online"],
  hybrid: ["혼합", "Hybrid"],
};

export const EDUCATION_LEVEL_LABEL: Record<EducationProgram["level"], LabelPair> = {
  beginner: ["입문", "Beginner"],
  intermediate: ["중급", "Intermediate"],
  advanced: ["심화", "Advanced"],
};

/** WEBTOON_CURRICULUM_GUIDE(한국어)와 같은 순서의 영어 로드맵. */
export const CURRICULUM_GUIDE_EN: readonly { readonly phase: string; readonly subjects: readonly string[] }[] = [
  { phase: "Foundations", subjects: ["Drawing basics", "Story structure", "Digital tools", "Copyright basics"] },
  { phase: "Production", subjects: ["Storyboards & direction", "Characters & backgrounds", "Coloring & post-processing", "Lettering & effects"] },
  { phase: "Serialization", subjects: ["Episode operations", "Deadlines & collaboration", "Platform specs", "Reader feedback"] },
  { phase: "Expansion", subjects: ["Portfolio", "Contracts & tax", "Global translation", "Film, animation & game IP"] },
];

/** 작업대 섹션 순서 — 성장 여정(보호 → 발굴·지원 → 제작·협업 → 확장 → 준비) 흐름을 따른다. */
export const GROWTH_SECTIONS = [
  { id: "age", label: ["연령 정책", "Age policy"] },
  { id: "support", label: ["발굴·지원", "Discovery & support"] },
  { id: "assistants", label: ["어시스트", "Assistants"] },
  { id: "story", label: ["시놉시스·웹소설", "Synopsis & novel"] },
  { id: "voice", label: ["음성 대사", "Voice dialogue"] },
  { id: "rights", label: ["판권", "Rights"] },
  { id: "share", label: ["SNS 공유", "Social sharing"] },
  { id: "environment", label: ["환경·앱 설치", "Environment & app"] },
  { id: "education", label: ["교육", "Education"] },
] as const satisfies readonly { id: string; label: LabelPair }[];

export type GrowthSectionId = (typeof GROWTH_SECTIONS)[number]["id"];
