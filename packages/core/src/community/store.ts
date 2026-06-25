// 작성형 데모 커뮤니티의 localStorage 엔진(브랜치 B) — 웹·토스 공유.
// 백엔드 없이 브라우저 로컬에만 저장하는 데모 레이어(웹의 server-backed 커뮤니티와 별개).
// React/DOM-비종속(typeof window 가드)·순수 함수. 채널/게시판/카페/댓글 + isOwner(익명키).
//
// aidigestdesk 의 검증된 모듈 싱글톤 패턴을 제네릭 팩토리로 일반화한다: createCommunityStore
// (config) 가 storageKeyPrefix·시드를 받아 같은 메커니즘의 독립 네임스페이스 스토어를 만든다.
// useSyncExternalStore 용 안정 스냅샷(쓰기 전까지 동일 참조)으로 React Compiler·lint 안전.

export interface Channel {
  id: string;
  name: string;
  description: string;
  topic: string;
}

export interface Post {
  id: string;
  channelId: string;
  author: string;
  body: string;
  /** ISO 8601 문자열 */
  createdAt: string;
  /** 작성자 멤버 ID(소유권 — 수정/삭제 권한 판정). 구버전 데이터는 없을 수 있다. */
  authorId?: string;
  /** 마지막 수정 시각(수정된 경우만). */
  editedAt?: string;
}

export interface BoardPost {
  id: string;
  /** 일반 게시판은 카테고리 문자열, 카페 게시판은 `cafe:${cafeId}`. */
  category: string;
  title: string;
  author: string;
  body: string;
  createdAt: string;
  authorId?: string;
  editedAt?: string;
}

/** 게시판 글의 댓글. postId 로 BoardPost/Post 와 연결한다. */
export interface Comment {
  id: string;
  postId: string;
  author: string;
  body: string;
  createdAt: string;
  authorId?: string;
  editedAt?: string;
}

export interface Cafe {
  id: string;
  name: string;
  description: string;
  topic: string;
  emoji?: string;
}

export interface CommunityState {
  channels: Channel[];
  posts: Post[];
  boardPosts: BoardPost[];
  cafes: Cafe[];
  comments: Comment[];
}

/** 스토어 생성 설정 — 앱별 네임스페이스·시드·카페 기본 멤버수·기본 닉네임. */
export interface CommunityStoreConfig {
  /** localStorage 키 접두(앱 고유). 예: "toonspectrum.community". */
  storageKeyPrefix: string;
  /** 시드 상태(빈 채널/카페면 시드로 복구). */
  seed: CommunityState;
  /** 카페별 데모 기본 멤버 수(가입 시 +1). */
  cafeBaseMemberCounts?: Record<string, number>;
  /** 기본 닉네임(미설정 시 "게스트"). */
  defaultNickname?: string;
}

export interface CommunityStore {
  /* 구독(useSyncExternalStore) */
  getSnapshot(): CommunityState;
  subscribe(listener: () => void): () => void;
  /* 스냅샷 기반 selector */
  selectChannelPosts(state: CommunityState, channelId: string): Post[];
  selectBoardPosts(state: CommunityState, category?: string): BoardPost[];
  selectComments(state: CommunityState, postId: string): Comment[];
  selectCommentCount(state: CommunityState, postId: string): number;
  /* 채널 */
  listChannels(): Channel[];
  listPosts(channelId: string): Post[];
  addPost(input: { channelId: string; author: string; body: string }): Post;
  editPost(id: string, body: string): Post;
  deletePost(id: string): void;
  /* 게시판 */
  listBoardPosts(category?: string): BoardPost[];
  addBoardPost(input: { category: string; title: string; author: string; body: string }): BoardPost;
  editBoardPost(id: string, input: { title: string; body: string }): BoardPost;
  deleteBoardPost(id: string): void;
  /* 댓글 */
  listComments(postId: string): Comment[];
  countComments(postId: string): number;
  addComment(input: { postId: string; author: string; body: string }): Comment;
  editComment(id: string, body: string): Comment;
  deleteComment(id: string): void;
  /* 카페 */
  listCafes(): Cafe[];
  isCafeMember(cafeId: string): boolean;
  joinCafe(cafeId: string): void;
  leaveCafe(cafeId: string): void;
  getCafeMemberCount(cafeId: string): number;
  /* 닉네임 / 소유권 / 멤버 */
  getNickname(): string;
  setNickname(name: string): void;
  isOwner(authorId: string | undefined): boolean;
  getMemberId(): string;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isChannel(v: unknown): v is Channel {
  return isObj(v) && isString(v.id) && isString(v.name) && isString(v.description) && isString(v.topic);
}
function isPost(v: unknown): v is Post {
  return isObj(v) && isString(v.id) && isString(v.channelId) && isString(v.author) && isString(v.body) && isString(v.createdAt);
}
function isBoardPost(v: unknown): v is BoardPost {
  return isObj(v) && isString(v.id) && isString(v.category) && isString(v.title) && isString(v.author) && isString(v.body) && isString(v.createdAt);
}
function isComment(v: unknown): v is Comment {
  return isObj(v) && isString(v.id) && isString(v.postId) && isString(v.author) && isString(v.body) && isString(v.createdAt);
}
function isCafe(v: unknown): v is Cafe {
  return isObj(v) && isString(v.id) && isString(v.name) && isString(v.description) && isString(v.topic) && (v.emoji === undefined || isString(v.emoji));
}

/**
 * 데모 커뮤니티 스토어 한 개를 만든다(앱별 네임스페이스). 로컬 전용·SSR 안전·결정적 시드.
 */
export function createCommunityStore(config: CommunityStoreConfig): CommunityStore {
  const STORAGE_KEY = `${config.storageKeyPrefix}.v2`;
  const NICKNAME_KEY = `${config.storageKeyPrefix}.nickname.v1`;
  const CAFE_MEMBERSHIP_KEY = `${config.storageKeyPrefix}.cafeMembership.v1`;
  const MEMBER_ID_KEY = `${config.storageKeyPrefix}.memberId.v1`;
  const DEFAULT_NICKNAME = config.defaultNickname ?? "게스트";
  const cafeBaseMemberCounts = config.cafeBaseMemberCounts ?? {};

  function createSeedState(): CommunityState {
    return {
      channels: config.seed.channels.map((c) => ({ ...c })),
      posts: config.seed.posts.map((p) => ({ ...p })),
      boardPosts: config.seed.boardPosts.map((p) => ({ ...p })),
      cafes: config.seed.cafes.map((c) => ({ ...c })),
      comments: config.seed.comments.map((c) => ({ ...c })),
    };
  }

  function readRawState(): Record<string, unknown> | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isObj(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function loadState(): CommunityState {
    if (typeof window === "undefined") return createSeedState();
    const candidate = readRawState();
    if (!candidate) return createSeedState();

    const channels = Array.isArray(candidate.channels) ? candidate.channels.filter(isChannel) : [];
    const posts = Array.isArray(candidate.posts) ? candidate.posts.filter(isPost) : [];
    const boardPosts = Array.isArray(candidate.boardPosts) ? candidate.boardPosts.filter(isBoardPost) : [];
    const cafes = Array.isArray(candidate.cafes) ? candidate.cafes.filter(isCafe) : [];
    const comments = Array.isArray(candidate.comments) ? candidate.comments.filter(isComment) : [];

    const seed = createSeedState();
    return {
      channels: channels.length > 0 ? channels : seed.channels,
      posts,
      boardPosts: boardPosts.length > 0 ? boardPosts : seed.boardPosts,
      cafes: cafes.length > 0 ? cafes : seed.cafes,
      comments,
    };
  }

  const listeners = new Set<() => void>();
  let stateSnapshot: CommunityState | null = null;

  function getSnapshot(): CommunityState {
    if (!stateSnapshot) stateSnapshot = loadState();
    return stateSnapshot;
  }

  function notify(): void {
    stateSnapshot = null; // 다음 스냅샷은 새 참조로 재생성 → 구독자 리렌더
    for (const listener of listeners) listener();
  }

  function saveState(state: CommunityState): void {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* 저장 공간 초과/프라이빗 모드 등은 데모에서 치명적이지 않으므로 무시 */
      }
    }
    notify();
  }

  let idCounter = 0;
  function createId(prefix = "post"): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    idCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
  }

  function getMemberId(): string {
    if (typeof window === "undefined") return `anon:${createId("member")}`;
    try {
      const existing = window.localStorage.getItem(MEMBER_ID_KEY)?.trim();
      if (existing) return existing;
      const generated = `anon:${createId("member")}`;
      window.localStorage.setItem(MEMBER_ID_KEY, generated);
      return generated;
    } catch {
      return `anon:${createId("member")}`;
    }
  }

  function isOwner(authorId: string | undefined): boolean {
    if (!authorId) return false;
    return authorId === getMemberId();
  }

  function readCafeMembership(): string[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(CAFE_MEMBERSHIP_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isString) : [];
    } catch {
      return [];
    }
  }

  function writeCafeMembership(ids: string[]): void {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(CAFE_MEMBERSHIP_KEY, JSON.stringify([...new Set(ids)]));
      } catch {
        /* 멤버십 저장 실패는 데모에서 무시 */
      }
    }
    notify();
  }

  return {
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    selectChannelPosts(state, channelId) {
      return state.posts
        .filter((p) => p.channelId === channelId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    selectBoardPosts(state, category) {
      const filtered = category
        ? state.boardPosts.filter((p) => p.category === category)
        : state.boardPosts.filter((p) => !p.category.startsWith("cafe:"));
      return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    selectComments(state, postId) {
      return state.comments
        .filter((c) => c.postId === postId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    selectCommentCount(state, postId) {
      return state.comments.filter((c) => c.postId === postId).length;
    },

    listChannels() {
      return loadState().channels;
    },
    listPosts(channelId) {
      return loadState()
        .posts.filter((p) => p.channelId === channelId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    addPost(input) {
      const body = input.body.trim();
      if (!body) throw new Error("빈 메시지는 등록할 수 없습니다.");
      const author = input.author.trim() || DEFAULT_NICKNAME;
      const post: Post = {
        id: createId("post"),
        channelId: input.channelId,
        author,
        body,
        createdAt: new Date().toISOString(),
        authorId: getMemberId(),
      };
      const state = loadState();
      saveState({ ...state, posts: [...state.posts, post] });
      return post;
    },
    editPost(id, body) {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("빈 메시지로 수정할 수 없습니다.");
      const state = loadState();
      const target = state.posts.find((p) => p.id === id);
      if (!target) throw new Error("메시지를 찾을 수 없습니다.");
      if (!isOwner(target.authorId)) throw new Error("본인 글만 수정할 수 있습니다.");
      const updated: Post = { ...target, body: trimmed, editedAt: new Date().toISOString() };
      saveState({ ...state, posts: state.posts.map((p) => (p.id === id ? updated : p)) });
      return updated;
    },
    deletePost(id) {
      const state = loadState();
      const target = state.posts.find((p) => p.id === id);
      if (!target || !isOwner(target.authorId)) return;
      saveState({
        ...state,
        posts: state.posts.filter((p) => p.id !== id),
        comments: state.comments.filter((c) => c.postId !== id),
      });
    },

    listBoardPosts(category) {
      const posts = loadState().boardPosts;
      const filtered = category
        ? posts.filter((p) => p.category === category)
        : posts.filter((p) => !p.category.startsWith("cafe:"));
      return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    addBoardPost(input) {
      const title = input.title.trim();
      const body = input.body.trim();
      if (!title) throw new Error("제목을 입력해 주세요.");
      if (!body) throw new Error("내용을 입력해 주세요.");
      const author = input.author.trim() || DEFAULT_NICKNAME;
      const post: BoardPost = {
        id: createId("board"),
        category: input.category,
        title,
        author,
        body,
        createdAt: new Date().toISOString(),
        authorId: getMemberId(),
      };
      const state = loadState();
      saveState({ ...state, boardPosts: [post, ...state.boardPosts] });
      return post;
    },
    editBoardPost(id, input) {
      const title = input.title.trim();
      const body = input.body.trim();
      if (!title) throw new Error("제목을 입력해 주세요.");
      if (!body) throw new Error("내용을 입력해 주세요.");
      const state = loadState();
      const target = state.boardPosts.find((p) => p.id === id);
      if (!target) throw new Error("글을 찾을 수 없습니다.");
      if (!isOwner(target.authorId)) throw new Error("본인 글만 수정할 수 있습니다.");
      const updated: BoardPost = { ...target, title, body, editedAt: new Date().toISOString() };
      saveState({ ...state, boardPosts: state.boardPosts.map((p) => (p.id === id ? updated : p)) });
      return updated;
    },
    deleteBoardPost(id) {
      const state = loadState();
      const target = state.boardPosts.find((p) => p.id === id);
      if (!target || !isOwner(target.authorId)) return;
      saveState({
        ...state,
        boardPosts: state.boardPosts.filter((p) => p.id !== id),
        comments: state.comments.filter((c) => c.postId !== id),
      });
    },

    listComments(postId) {
      return loadState()
        .comments.filter((c) => c.postId === postId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    countComments(postId) {
      return loadState().comments.filter((c) => c.postId === postId).length;
    },
    addComment(input) {
      const body = input.body.trim();
      if (!body) throw new Error("댓글 내용을 입력해 주세요.");
      const author = input.author.trim() || DEFAULT_NICKNAME;
      const comment: Comment = {
        id: createId("comment"),
        postId: input.postId,
        author,
        body,
        createdAt: new Date().toISOString(),
        authorId: getMemberId(),
      };
      const state = loadState();
      saveState({ ...state, comments: [...state.comments, comment] });
      return comment;
    },
    editComment(id, body) {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("빈 댓글로 수정할 수 없습니다.");
      const state = loadState();
      const target = state.comments.find((c) => c.id === id);
      if (!target) throw new Error("댓글을 찾을 수 없습니다.");
      if (!isOwner(target.authorId)) throw new Error("본인 댓글만 수정할 수 있습니다.");
      const updated: Comment = { ...target, body: trimmed, editedAt: new Date().toISOString() };
      saveState({ ...state, comments: state.comments.map((c) => (c.id === id ? updated : c)) });
      return updated;
    },
    deleteComment(id) {
      const state = loadState();
      const target = state.comments.find((c) => c.id === id);
      if (!target || !isOwner(target.authorId)) return;
      saveState({ ...state, comments: state.comments.filter((c) => c.id !== id) });
    },

    listCafes() {
      return loadState().cafes;
    },
    isCafeMember(cafeId) {
      return readCafeMembership().includes(cafeId);
    },
    joinCafe(cafeId) {
      const ids = readCafeMembership();
      if (!ids.includes(cafeId)) writeCafeMembership([...ids, cafeId]);
    },
    leaveCafe(cafeId) {
      writeCafeMembership(readCafeMembership().filter((id) => id !== cafeId));
    },
    getCafeMemberCount(cafeId) {
      const base = cafeBaseMemberCounts[cafeId] ?? 0;
      return base + (this.isCafeMember(cafeId) ? 1 : 0);
    },

    getNickname() {
      if (typeof window === "undefined") return DEFAULT_NICKNAME;
      try {
        const raw = window.localStorage.getItem(NICKNAME_KEY);
        const trimmed = raw?.trim();
        return trimmed ? trimmed : DEFAULT_NICKNAME;
      } catch {
        return DEFAULT_NICKNAME;
      }
    },
    setNickname(name) {
      if (typeof window === "undefined") return;
      try {
        const trimmed = name.trim();
        if (trimmed) window.localStorage.setItem(NICKNAME_KEY, trimmed);
        else window.localStorage.removeItem(NICKNAME_KEY);
      } catch {
        /* 닉네임 저장 실패는 데모에서 무시 */
      }
    },
    isOwner,
    getMemberId,
  };
}
