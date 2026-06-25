// 커뮤니티 / 리뷰 게시판 — 토스 영속 레이어.
// 채널·게시판·카페·댓글의 순수 엔진은 @toonspectrum/core/community(createCommunityStore)를 공유한다.
// 이 파일은 토스용 인스턴스(네임스페이스 + 웹툰 시드)만 만들고 얇은 래퍼를 노출한다(중복 제거).

import {
  createCommunityStore,
  type BoardPost,
  type Cafe,
  type Channel,
  type CommunityState,
  type Comment,
  type Post,
  type ReviewSort,
  type ReviewsResponse,
} from '@toonspectrum/core';

import { API_BASE } from './api';

export type { BoardPost, Cafe, Channel, CommunityState, Comment, Post, ReviewSort, ReviewsResponse };

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

const seed: CommunityState = {
  channels: [
    { id: 'free', name: '자유 수다', description: '웹툰 이야기 자유롭게', topic: '아무 웹툰 이야기나 환영' },
    { id: 'recommend', name: '추천 받아요', description: '취향 저격 추천 요청', topic: '이런 작품 찾아요' },
    { id: 'spoiler', name: '스포 주의', description: '최신화 떡밥 토론', topic: '본 사람만 들어와요' },
  ],
  posts: [
    { id: 'p1', channelId: 'free', author: '독자A', body: '요즘 정주행할 완결작 추천 좀요!', createdAt: iso(42) },
    { id: 'p2', channelId: 'recommend', author: '독자B', body: '회귀물 좋아하는데 숨은 명작 없을까요?', createdAt: iso(18) },
  ],
  boardPosts: [
    {
      id: 'b1',
      category: '리뷰',
      title: '이 작품 그림체가 미쳤어요',
      author: '평론가',
      body: '연출과 컷 분할이 정말 영화 같습니다. 후반부 떡밥 회수도 깔끔.',
      createdAt: iso(120),
    },
  ],
  cafes: [
    { id: 'romance', name: '로맨스 정주행단', description: '로맨스 웹툰 덕후 모임', topic: '설렘 공유', emoji: '💞' },
    { id: 'action', name: '액션 길드', description: '사이다 액션 모임', topic: '먼치킨 환영', emoji: '⚔️' },
  ],
  comments: [{ id: 'c1', postId: 'b1', author: '독자C', body: '저도 완전 동의해요!', createdAt: iso(90) }],
};

export const community = createCommunityStore({
  storageKeyPrefix: 'toonspectrum.community',
  seed,
  cafeBaseMemberCounts: { romance: 1284, action: 932 },
  defaultNickname: '웹툰러',
});

/** 게시판 카테고리(시드 + 사용자 작성 카테고리 합집합). */
export const BOARD_CATEGORIES = ['리뷰', '추천', '잡담', '질문'] as const;

/** 상대 시간 표기("방금 전"·"N분 전"·"N시간 전"·"N일 전"). */
export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return '';
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

/* ── 브랜치 A: 읽기전용 리뷰 피드(GET /api/reviews, 공개·CORS OK·no-store) ─────── */

/** 리뷰 정렬 옵션 메타(웹 ReviewControls 와 동일 키). */
export const REVIEW_SORTS: { id: ReviewSort; label: string }[] = [
  { id: 'recent', label: '최신순' },
  { id: 'likes', label: '좋아요순' },
  { id: 'high', label: '고평점' },
  { id: 'low', label: '저평점' },
];

/**
 * GET /api/reviews 호출(공개 읽기 전용). 정렬/스포일러 필터를 쿼리로 넘긴다.
 * 쓰기(작성/답글)는 x-user-id(mTLS 로그인) 필수 + CORS가 GET만 허용이라 토스 MVP에서는 미노출.
 * 네트워크/CORS 실패 시 throw → 페이지에서 에러 상태로 표시한다.
 */
export async function fetchReviews(opts: {
  sort?: ReviewSort;
  spoiler?: 'hide';
  signal?: AbortSignal;
}): Promise<ReviewsResponse> {
  const params = new URLSearchParams({ sort: opts.sort ?? 'recent' });
  if (opts.spoiler) params.set('spoiler', opts.spoiler);
  const res = await fetch(`${API_BASE}/api/reviews?${params.toString()}`, {
    cache: 'no-store',
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as ReviewsResponse;
}
