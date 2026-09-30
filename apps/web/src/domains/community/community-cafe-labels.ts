import { defineBilingualText } from "@/shared/lib/i18n-bilingual-copy";
import type { MotionIllustrationName } from "@/shared/motion-assets";
import type {
  CommunityCafeJoinPolicy,
  CommunityCafeKind,
  CommunityCafePostingPolicy,
  CommunityCafeRole,
  CommunityCafeVisibility,
  FanCafeScopeFilter,
} from "@/shared/lib/types";

/**
 * 커뮤니티 카페 분류 라벨의 공용 바이링구얼 키.
 * packages/core의 `COMMUNITY_CAFE_*_LABELS`는 한국어 전용이라
 * community 도메인 페이지에서 이 키들을 사용한다.
 */
export const CAFE_KIND_LABEL_KEYS: Readonly<Record<CommunityCafeKind, string>> = {
  creator: defineBilingualText("communityCafe", "kindCreator", "창작자 팬 커뮤니티", "Creator fan community"),
  work: defineBilingualText("communityCafe", "kindWork", "작품 팬 커뮤니티", "Work fan community"),
  genre: defineBilingualText("communityCafe", "kindGenre", "장르·관심사", "Genres & interests"),
  project: defineBilingualText("communityCafe", "kindProject", "공동창작·프로젝트", "Co-creation & projects"),
  study: defineBilingualText("communityCafe", "kindStudy", "정보 공유·스터디", "Info sharing & study"),
  social: defineBilingualText("communityCafe", "kindSocial", "자유 친목", "Casual social"),
};

export const CAFE_VISIBILITY_LABEL_KEYS: Readonly<Record<CommunityCafeVisibility, string>> = {
  public: defineBilingualText("communityCafe", "visibilityPublic", "공개", "Public"),
  private: defineBilingualText("communityCafe", "visibilityPrivate", "비공개", "Private"),
};

export const CAFE_JOIN_POLICY_LABEL_KEYS: Readonly<Record<CommunityCafeJoinPolicy, string>> = {
  open: defineBilingualText("communityCafe", "joinOpen", "바로 가입", "Join instantly"),
  approval: defineBilingualText("communityCafe", "joinApproval", "가입 승인", "Approval required"),
  invite: defineBilingualText("communityCafe", "joinInvite", "초대 전용", "Invite only"),
};

export const CAFE_POSTING_POLICY_LABEL_KEYS: Readonly<Record<CommunityCafePostingPolicy, string>> = {
  members: defineBilingualText("communityCafe", "postingMembers", "회원 작성", "Members can post"),
  staff: defineBilingualText("communityCafe", "postingStaff", "운영진만 작성", "Staff only"),
};

export const CAFE_ROLE_LABEL_KEYS: Readonly<Record<CommunityCafeRole, string>> = {
  owner: defineBilingualText("communityCafe", "roleOwner", "소유자", "Owner"),
  admin: defineBilingualText("communityCafe", "roleAdmin", "관리자", "Admin"),
  moderator: defineBilingualText("communityCafe", "roleModerator", "운영자", "Moderator"),
  member: defineBilingualText("communityCafe", "roleMember", "회원", "Member"),
};

/**
 * 카페 유형별 카드 커버 일러스트. CafesPage 카드와 CafeDetailPage 헤더 배너가 공유한다.
 */
export const CAFE_KIND_ILLUSTRATIONS: Readonly<Record<CommunityCafeKind, MotionIllustrationName>> = {
  creator: "hero-silhouette",
  work: "webtoon-panels",
  genre: "layers",
  project: "pen-tool",
  study: "lightbulb",
  social: "sparkles",
} as const;

type CommunityScope = Exclude<FanCafeScopeFilter, "all">;

/**
 * contracts 패키지의 `COMMUNITY_SCOPE_LABEL`은 한국어 전용이라
 * community 도메인 페이지에서 이 바이링구얼 키들을 사용한다.
 */
export const COMMUNITY_SCOPE_LABEL_KEYS: Readonly<Record<CommunityScope, string>> = {
  title: defineBilingualText("communityScope", "labelTitle", "작품", "Works"),
  author: defineBilingualText("communityScope", "labelAuthor", "작가", "Creators"),
  pencafe: defineBilingualText("communityScope", "labelPencafe", "펜카페", "Pencafe"),
  cafe: defineBilingualText("communityScope", "labelCafe", "장르 카페", "Genre cafes"),
};

/**
 * contracts 패키지의 `COMMUNITY_SCOPE_DESCRIPTION` 바이링구얼 버전.
 */
export const COMMUNITY_SCOPE_DESCRIPTION_KEYS: Readonly<Record<CommunityScope, string>> = {
  title: defineBilingualText(
    "communityScope",
    "descriptionTitle",
    "작품별 토론 스레드를 한 곳에 모아 탐색합니다.",
    "Browse discussion threads gathered by work.",
  ),
  author: defineBilingualText(
    "communityScope",
    "descriptionAuthor",
    "작가 작품과 에피소드 중심으로 토론이 올라옵니다.",
    "Discussions centered on a creator's works and episodes.",
  ),
  pencafe: defineBilingualText(
    "communityScope",
    "descriptionPencafe",
    "번역·편집·연재 운영 노하우를 함께 정리합니다.",
    "Share translation, editing, and serialization know-how together.",
  ),
  cafe: defineBilingualText(
    "communityScope",
    "descriptionCafe",
    "회원이 직접 만든 장르 소모임을 둘러보고 가입합니다.",
    "Browse and join genre clubs created by members.",
  ),
};

/**
 * contracts 패키지의 `COMMUNITY_SCOPE_TABS`(디렉터리 카드) 바이링구얼 버전.
 */
export const COMMUNITY_SCOPE_DIRECTORY_LABEL_KEYS: Readonly<Record<CommunityScope, string>> = {
  title: defineBilingualText("communityScope", "directoryLabelTitle", "작품", "Works"),
  author: defineBilingualText("communityScope", "directoryLabelAuthor", "작가", "Creators"),
  pencafe: defineBilingualText("communityScope", "directoryLabelPencafe", "펜카페", "Pencafe"),
  cafe: defineBilingualText("communityScope", "directoryLabelCafe", "장르 카페", "Genre cafes"),
};

export const COMMUNITY_SCOPE_DIRECTORY_DESCRIPTION_KEYS: Readonly<Record<CommunityScope, string>> = {
  title: defineBilingualText(
    "communityScope",
    "directoryDescriptionTitle",
    "작품별 토론 스레드의 최근 대화",
    "Recent discussion threads by work",
  ),
  author: defineBilingualText(
    "communityScope",
    "directoryDescriptionAuthor",
    "작가 중심 커뮤니티 활동",
    "Creator-focused community activity",
  ),
  pencafe: defineBilingualText(
    "communityScope",
    "directoryDescriptionPencafe",
    "번역·편집·작가 팬모임 공간",
    "Translation, editing & creator fan spaces",
  ),
  cafe: defineBilingualText(
    "communityScope",
    "directoryDescriptionCafe",
    "회원이 직접 만드는 장르 소모임",
    "Genre clubs created by members",
  ),
};
