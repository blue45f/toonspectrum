import { defineBilingualText } from "@/shared/lib/i18n-bilingual-copy";
import type {
  CommunityCafeJoinPolicy,
  CommunityCafeKind,
  CommunityCafePostingPolicy,
  CommunityCafeRole,
  CommunityCafeVisibility,
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
