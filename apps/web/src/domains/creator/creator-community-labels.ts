import type {
  CreatorCommunityContentKind,
  CreatorCommunityProvenance,
} from "@/shared/lib/creator-community-publication-contract";

export const CREATOR_COMMUNITY_KIND_LABEL: Record<CreatorCommunityContentKind, string> = {
  illustration: "일러스트",
  illustration_set: "일러스트 세트",
  art_project: "아트 프로젝트",
  webtoon_episode: "웹툰 회차",
  one_shot: "단편·원샷",
  page_comic: "페이지 만화",
  short_comic: "짧은 컷툰",
  process: "제작 과정",
  wip: "작업 중(WIP)",
};

export const CREATOR_COMMUNITY_PROVENANCE_LABEL: Record<CreatorCommunityProvenance, string> = {
  human: "직접 제작",
  ai_assisted: "AI 보조 사용",
  agent_assisted: "AI 에이전트 협업",
  ai_generated: "AI 생성 중심",
  mixed: "혼합 제작",
};
