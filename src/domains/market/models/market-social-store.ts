/**
 * Market Social Store — Comments, Nested Replies (대댓글), Ratings & Reviews
 * 
 * Provides per-resource persistence in localStorage, rich starter seeds for webtoon creators,
 * reactive events, and instant local updates for production-grade community interaction.
 */

export interface MarketCommentAuthor {
  id: string;
  name: string;
  avatar?: string;
  badge?: "creator" | "verified_buyer" | "pro_artist" | "user";
}

export interface MarketCommentReply {
  id: string;
  commentId: string;
  author: MarketCommentAuthor;
  replyToAuthorName?: string;
  content: string;
  createdAt: string;
  likes: number;
  likedByMe?: boolean;
}

export interface MarketComment {
  id: string;
  resourceId: string;
  author: MarketCommentAuthor;
  content: string;
  createdAt: string;
  updatedAt?: string;
  likes: number;
  likedByMe?: boolean;
  replies: MarketCommentReply[];
}

export interface MarketReview {
  id: string;
  resourceId: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
    roleTag?: string; // e.g. "현역 웹툰 작가", "어시스턴트", "콘티/데생 작가"
    isVerifiedBuyer: boolean;
  };
  rating: number; // 1 to 5
  title: string;
  content: string;
  createdAt: string;
  helpfulCount: number;
  helpfulByMe?: boolean;
  tags?: string[];
}

export interface MarketReviewStats {
  average: number;
  totalCount: number;
  recommendPercentage: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

const COMMENTS_STORAGE_PREFIX = "toonspectrum:market:comments:";
const REVIEWS_STORAGE_PREFIX = "toonspectrum:market:reviews:";
export const MARKET_SOCIAL_EVENT = "toonspectrum:market:social-update";

function emitSocialUpdate(resourceId: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(MARKET_SOCIAL_EVENT, { detail: { resourceId } }),
    );
  }
}

// ── Default Seed Data for Starter Resources ──

function getStarterSeedReviews(resourceId: string): MarketReview[] {
  const is3D = resourceId.includes("3d") || resourceId.startsWith("e0000001");
  const isBrush = resourceId.includes("brush") || resourceId.includes("ink") || resourceId.includes("pencil");

  if (is3D) {
    return [
      {
        id: `rev-${resourceId}-1`,
        resourceId,
        author: {
          id: "artist-101",
          name: "청강 웹툰과 3년차",
          roleTag: "현역 웹툰 어시스턴트",
          isVerifiedBuyer: true,
        },
        rating: 5,
        title: "선화 추출과 투시 구도 잡을 때 필수입니다",
        content:
          "Three.js 뷰어에서 앵글 돌려가며 콘티에 바로 맞출 수 있어서 작업 시간이 절반으로 줄었습니다. Studio에서 은선 추출할 때 잉크 두께 1.5px 맞추면 수작업 펜선과 구분이 안 될 정도로 자연스럽네요.",
        createdAt: "2026-08-28T14:20:00.000Z",
        helpfulCount: 42,
        tags: ["3D 구도 최적", "선화 추출 깔끔", "마감 시간 단축"],
      },
      {
        id: `rev-${resourceId}-2`,
        resourceId,
        author: {
          id: "artist-102",
          name: "로판 연재 작가 K",
          roleTag: "메인 작화가",
          isVerifiedBuyer: true,
        },
        rating: 5,
        title: "하이앵글, 로우앵글 데생 잡기 너무 편해요",
        content:
          "인체 소체 비율이 현대 웹툰 규격에 딱 맞게 세팅되어 있어서 데생 삐꾸 걱정 없이 안정적으로 컷을 칠 수 있습니다. 특히 손떨림 보정 켜고 트레이싱할 때 라인이 기가 막히게 떨어집니다.",
        createdAt: "2026-08-30T09:15:00.000Z",
        helpfulCount: 28,
        tags: ["데생 가이드", "비율 완벽", "강력 추천"],
      },
      {
        id: `rev-${resourceId}-3`,
        resourceId,
        author: {
          id: "artist-103",
          name: "Studio 3D 테크니션",
          roleTag: "3D 배경 어시스턴트",
          isVerifiedBuyer: true,
        },
        rating: 4,
        title: "폴리곤 최적화 훌륭하고 모바일에서도 가볍습니다",
        content:
          "웹툰 규격 렌더링에 필요한 토폴로지만 깔끔하게 남겨두어 스튜디오 뷰포트 버벅임이 전혀 없습니다. 조명 시간대 프리셋(주간/석양/야간) 매칭 기능과 궁합이 환상적입니다.",
        createdAt: "2026-09-01T11:45:00.000Z",
        helpfulCount: 15,
        tags: ["폴리곤 최적화", "렌더링 속도 우수"],
      },
    ];
  }

  if (isBrush) {
    return [
      {
        id: `rev-${resourceId}-1`,
        resourceId,
        author: {
          id: "artist-201",
          name: "액션물 연재 중인 민우",
          roleTag: "현역 웹툰 작가",
          isVerifiedBuyer: true,
        },
        rating: 5,
        title: "필압 반응이 타사 유명 프로그램보다 쫀득합니다",
        content:
          "선 끝 삐침이 거칠지 않고 먹이 살짝 머금은 듯한 질감이 일품입니다. 빠른 펜터치에도 브러시 렉 없이 1:1로 즉각 반응해서 액션 컷 그릴 때 손에 착 감기네요.",
        createdAt: "2026-08-25T16:10:00.000Z",
        helpfulCount: 63,
        tags: ["필압 반응 극상", "손떨림 보정 완벽", "선화 마스터"],
      },
      {
        id: `rev-${resourceId}-2`,
        resourceId,
        author: {
          id: "artist-202",
          name: "밤샘마감러",
          roleTag: "어시스턴트",
          isVerifiedBuyer: true,
        },
        rating: 5,
        title: "스튜디오 1클릭 설치되고 컬러 스와치랑 연동 굿",
        content:
          "복잡한 파일 변환 없이 마켓에서 바로 누르면 스튜디오 도구함에 꽂히는 게 진짜 혁신입니다. 보조선 긋기부터 메인 인물 펜선까지 다 커버됩니다.",
        createdAt: "2026-08-29T18:30:00.000Z",
        helpfulCount: 31,
        tags: ["적용 편의성", "올라운더 펜"],
      },
    ];
  }

  return [
    {
      id: `rev-${resourceId}-1`,
      resourceId,
      author: {
        id: "artist-301",
        name: "웹툰 프로덕션 컬러팀",
        roleTag: "채색 작가",
        isVerifiedBuyer: true,
      },
      rating: 5,
      title: "장르 무드 잡는 시간을 대폭 줄여줍니다",
      content:
        "웹툰 스크롤 뷰에서 시선 유도할 때 컬러 밸런스와 대비가 이상적으로 짜여 있습니다. 상업 연재에 안심하고 쓸 수 있는 라이선스인 점도 매우 만족스럽습니다.",
      createdAt: "2026-08-27T10:00:00.000Z",
      helpfulCount: 22,
      tags: ["색감 통일성", "상업 연재 안심"],
    },
    {
      id: `rev-${resourceId}-2`,
      resourceId,
      author: {
        id: "artist-302",
        name: "신인 작가 하은",
        roleTag: "웹툰 지망생",
        isVerifiedBuyer: true,
      },
      rating: 5,
      title: "스튜디오 캔버스에 원터치로 쏙 들어가네요",
      content:
        "초보자도 헷갈리지 않게 적용되고 가이드 팁대로 곱하기 80% 주니까 완성도가 확 달라졌습니다. 무료로 이런 퀄리티 배포해주셔서 감사합니다!",
      createdAt: "2026-08-31T20:10:00.000Z",
      helpfulCount: 19,
      tags: ["쉬운 사용법", "가성비 최고"],
    },
  ];
}

function getStarterSeedComments(resourceId: string): MarketComment[] {
  return [
    {
      id: `comment-${resourceId}-1`,
      resourceId,
      author: {
        id: "user-commenter-1",
        name: "스토리작가 현석",
        badge: "verified_buyer",
      },
      content:
        "혹시 이 에셋 세로 스크롤 컷(720px~1080px 기준)에서 해상도 깨짐이나 뭉개짐 없이 선명하게 유지되나요?",
      createdAt: "2026-08-29T13:00:00.000Z",
      likes: 8,
      likedByMe: false,
      replies: [
        {
          id: `reply-${resourceId}-1-1`,
          commentId: `comment-${resourceId}-1`,
          author: {
            id: "00000000-0000-4000-8000-000000000001",
            name: "ToonSpectrum 공식",
            badge: "creator",
          },
          replyToAuthorName: "스토리작가 현석",
          content:
            "네! 모든 공식 에셋은 고해상도 웹툰 인쇄 및 4K 울트라 와이드 모니터 규격까지 무손실 벡터/절차형 렌더링을 지원하므로 1080px 이상의 컷에서도 선명하게 사용하실 수 있습니다.",
          createdAt: "2026-08-29T14:15:00.000Z",
          likes: 12,
          likedByMe: false,
        },
        {
          id: `reply-${resourceId}-1-2`,
          commentId: `comment-${resourceId}-1`,
          author: {
            id: "user-commenter-2",
            name: "콘티맨",
            badge: "pro_artist",
          },
          replyToAuthorName: "스토리작가 현석",
          content: "제가 직접 1440px 컷 작업에 써봤는데 라인 전혀 안 깨지고 아주 깔끔했습니다!",
          createdAt: "2026-08-29T17:40:00.000Z",
          likes: 4,
          likedByMe: false,
        },
      ],
    },
    {
      id: `comment-${resourceId}-2`,
      resourceId,
      author: {
        id: "user-commenter-3",
        name: "일러스트레이터 도현",
        badge: "user",
      },
      content: "상업용 외주나 공모전 제출용 단편 웹툰에 써도 저작권 이슈 없을까요?",
      createdAt: "2026-09-01T10:20:00.000Z",
      likes: 5,
      likedByMe: false,
      replies: [
        {
          id: `reply-${resourceId}-2-1`,
          commentId: `comment-${resourceId}-2`,
          author: {
            id: "00000000-0000-4000-8000-000000000001",
            name: "ToonSpectrum 공식",
            badge: "creator",
          },
          replyToAuthorName: "일러스트레이터 도현",
          content:
            "본 에셋은 ToonSpectrum 표준 사용권이 적용되어 있어, 네이버/카카오 연재는 물론 외주 및 공모전 출품작에 출처 표기 의무 없이 자유롭게 상업적 활용이 가능합니다. (단, 에셋 파일 자체를 추출하여 재판매하는 행위는 제한됩니다)",
          createdAt: "2026-09-01T11:05:00.000Z",
          likes: 9,
          likedByMe: false,
        },
      ],
    },
  ];
}

// ── Comments Methods ──

export function getMarketComments(resourceId: string): MarketComment[] {
  if (typeof window === "undefined") return getStarterSeedComments(resourceId);
  try {
    const raw = localStorage.getItem(`${COMMENTS_STORAGE_PREFIX}${resourceId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as MarketComment[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // fallback to seed
  }
  const seed = getStarterSeedComments(resourceId);
  try {
    localStorage.setItem(
      `${COMMENTS_STORAGE_PREFIX}${resourceId}`,
      JSON.stringify(seed),
    );
  } catch {
    // quota safe
  }
  return seed;
}

export function saveMarketComments(
  resourceId: string,
  comments: MarketComment[],
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${COMMENTS_STORAGE_PREFIX}${resourceId}`,
      JSON.stringify(comments),
    );
    emitSocialUpdate(resourceId);
  } catch {
    // quota safe
  }
}

export function addMarketComment(
  resourceId: string,
  input: {
    content: string;
    authorName?: string;
    authorBadge?: "creator" | "verified_buyer" | "pro_artist" | "user";
  },
): MarketComment {
  const comments = getMarketComments(resourceId);
  const newComment: MarketComment = {
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    resourceId,
    author: {
      id: `user-${Date.now()}`,
      name: input.authorName?.trim() || "익명의 웹툰 작가",
      badge: input.authorBadge || "verified_buyer",
    },
    content: input.content.trim(),
    createdAt: new Date().toISOString(),
    likes: 0,
    likedByMe: false,
    replies: [],
  };

  const updated = [newComment, ...comments];
  saveMarketComments(resourceId, updated);
  return newComment;
}

export function addMarketCommentReply(
  resourceId: string,
  commentId: string,
  input: {
    content: string;
    authorName?: string;
    replyToAuthorName?: string;
    authorBadge?: "creator" | "verified_buyer" | "pro_artist" | "user";
  },
): MarketCommentReply | null {
  const comments = getMarketComments(resourceId);
  const targetComment = comments.find((c) => c.id === commentId);
  if (!targetComment) return null;

  const newReply: MarketCommentReply = {
    id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    commentId,
    author: {
      id: `user-${Date.now()}`,
      name: input.authorName?.trim() || "익명의 웹툰 작가",
      badge: input.authorBadge || "user",
    },
    replyToAuthorName: input.replyToAuthorName,
    content: input.content.trim(),
    createdAt: new Date().toISOString(),
    likes: 0,
    likedByMe: false,
  };

  targetComment.replies.push(newReply);
  saveMarketComments(resourceId, comments);
  return newReply;
}

export function toggleMarketCommentLike(
  resourceId: string,
  commentId: string,
  replyId?: string,
): void {
  const comments = getMarketComments(resourceId);
  const targetComment = comments.find((c) => c.id === commentId);
  if (!targetComment) return;

  if (replyId) {
    const targetReply = targetComment.replies.find((r) => r.id === replyId);
    if (targetReply) {
      if (targetReply.likedByMe) {
        targetReply.likes = Math.max(0, targetReply.likes - 1);
        targetReply.likedByMe = false;
      } else {
        targetReply.likes += 1;
        targetReply.likedByMe = true;
      }
    }
  } else {
    if (targetComment.likedByMe) {
      targetComment.likes = Math.max(0, targetComment.likes - 1);
      targetComment.likedByMe = false;
    } else {
      targetComment.likes += 1;
      targetComment.likedByMe = true;
    }
  }

  saveMarketComments(resourceId, comments);
}

export function deleteMarketComment(
  resourceId: string,
  commentId: string,
): void {
  const comments = getMarketComments(resourceId);
  const filtered = comments.filter((c) => c.id !== commentId);
  saveMarketComments(resourceId, filtered);
}

export function deleteMarketCommentReply(
  resourceId: string,
  commentId: string,
  replyId: string,
): void {
  const comments = getMarketComments(resourceId);
  const targetComment = comments.find((c) => c.id === commentId);
  if (!targetComment) return;
  targetComment.replies = targetComment.replies.filter((r) => r.id !== replyId);
  saveMarketComments(resourceId, comments);
}

// ── Reviews & Ratings Methods ──

export function calculateReviewStats(reviews: MarketReview[]): MarketReviewStats {
  if (reviews.length === 0) {
    return {
      average: 5.0,
      totalCount: 0,
      recommendPercentage: 100,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  let sum = 0;
  let recommendCount = 0;

  for (const rev of reviews) {
    const safeRating = Math.max(1, Math.min(5, Math.round(rev.rating))) as 1 | 2 | 3 | 4 | 5;
    distribution[safeRating] += 1;
    sum += safeRating;
    if (safeRating >= 4) recommendCount += 1;
  }

  const average = Number((sum / reviews.length).toFixed(1));
  const recommendPercentage = Math.round((recommendCount / reviews.length) * 100);

  return {
    average,
    totalCount: reviews.length,
    recommendPercentage,
    distribution,
  };
}

export function getMarketReviews(resourceId: string): {
  reviews: MarketReview[];
  stats: MarketReviewStats;
} {
  if (typeof window === "undefined") {
    const seed = getStarterSeedReviews(resourceId);
    return { reviews: seed, stats: calculateReviewStats(seed) };
  }
  let reviews: MarketReview[] = [];
  try {
    const raw = localStorage.getItem(`${REVIEWS_STORAGE_PREFIX}${resourceId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as MarketReview[];
      if (Array.isArray(parsed)) reviews = parsed;
    }
  } catch {
    // fallback
  }

  if (reviews.length === 0) {
    reviews = getStarterSeedReviews(resourceId);
    try {
      localStorage.setItem(
        `${REVIEWS_STORAGE_PREFIX}${resourceId}`,
        JSON.stringify(reviews),
      );
    } catch {
      // quota
    }
  }

  return {
    reviews,
    stats: calculateReviewStats(reviews),
  };
}

export function saveMarketReviews(
  resourceId: string,
  reviews: MarketReview[],
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${REVIEWS_STORAGE_PREFIX}${resourceId}`,
      JSON.stringify(reviews),
    );
    emitSocialUpdate(resourceId);
  } catch {
    // quota
  }
}

export function addMarketReview(
  resourceId: string,
  input: {
    rating: number;
    title: string;
    content: string;
    authorName?: string;
    roleTag?: string;
    tags?: string[];
  },
): MarketReview {
  const { reviews } = getMarketReviews(resourceId);
  const newReview: MarketReview = {
    id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    resourceId,
    author: {
      id: `user-${Date.now()}`,
      name: input.authorName?.trim() || "웹툰 창작자",
      roleTag: input.roleTag || "현역 웹툰 작가",
      isVerifiedBuyer: true,
    },
    rating: Math.max(1, Math.min(5, input.rating)),
    title: input.title.trim(),
    content: input.content.trim(),
    createdAt: new Date().toISOString(),
    helpfulCount: 0,
    helpfulByMe: false,
    tags: input.tags ?? ["직접 사용 피드백", "스튜디오 연동"],
  };

  const updated = [newReview, ...reviews];
  saveMarketReviews(resourceId, updated);
  return newReview;
}

export function toggleMarketReviewHelpful(
  resourceId: string,
  reviewId: string,
): void {
  const { reviews } = getMarketReviews(resourceId);
  const target = reviews.find((r) => r.id === reviewId);
  if (!target) return;

  if (target.helpfulByMe) {
    target.helpfulCount = Math.max(0, target.helpfulCount - 1);
    target.helpfulByMe = false;
  } else {
    target.helpfulCount += 1;
    target.helpfulByMe = true;
  }

  saveMarketReviews(resourceId, reviews);
}

export function deleteMarketReview(
  resourceId: string,
  reviewId: string,
): void {
  const { reviews } = getMarketReviews(resourceId);
  const filtered = reviews.filter((r) => r.id !== reviewId);
  saveMarketReviews(resourceId, filtered);
}
