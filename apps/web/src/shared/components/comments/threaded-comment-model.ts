export type ThreadedCommentSort = "oldest" | "newest" | "popular";

export interface ThreadedCommentAuthor {
  id?: string;
  name: string;
  avatar?: string | null;
}

export interface ThreadedCommentRecord {
  id: string;
  parentId: string | null;
  author: ThreadedCommentAuthor;
  text: string;
  deleted: boolean;
  hidden?: boolean;
  likes: number;
  viewerLiked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadedCommentNode<T extends ThreadedCommentRecord> {
  comment: T;
  children: ThreadedCommentNode<T>[];
  depth: number;
}

export interface ThreadedCommentDeleteResult {
  deleted: true;
  soft: boolean;
  removedIds: string[];
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rootComparator<T extends ThreadedCommentRecord>(sort: ThreadedCommentSort) {
  return (left: ThreadedCommentNode<T>, right: ThreadedCommentNode<T>): number => {
    if (sort === "popular") {
      const likeOrder = right.comment.likes - left.comment.likes;
      if (likeOrder !== 0) return likeOrder;
    }
    const dateOrder = timestamp(left.comment.createdAt) - timestamp(right.comment.createdAt);
    if (dateOrder !== 0) return sort === "oldest" ? dateOrder : -dateOrder;
    return sort === "oldest"
      ? left.comment.id.localeCompare(right.comment.id)
      : right.comment.id.localeCompare(left.comment.id);
  };
}

function createsCycle<T extends ThreadedCommentRecord>(
  commentId: string,
  parentId: string,
  comments: ReadonlyMap<string, T>,
): boolean {
  const visited = new Set<string>([commentId]);
  let cursor: string | null = parentId;
  while (cursor) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = comments.get(cursor)?.parentId ?? null;
  }
  return false;
}

function setDepth<T extends ThreadedCommentRecord>(
  node: ThreadedCommentNode<T>,
  depth: number,
): void {
  node.depth = depth;
  node.children.sort((left, right) => {
    const dateOrder = timestamp(left.comment.createdAt) - timestamp(right.comment.createdAt);
    return dateOrder || left.comment.id.localeCompare(right.comment.id);
  });
  for (const child of node.children) setDepth(child, depth + 1);
}

export function buildThreadedCommentForest<T extends ThreadedCommentRecord>(
  comments: readonly T[],
  sort: ThreadedCommentSort,
): ThreadedCommentNode<T>[] {
  const commentsById = new Map(comments.map((comment) => [comment.id, comment] as const));
  const nodes = new Map<string, ThreadedCommentNode<T>>(
    comments.map((comment) => [comment.id, { comment, children: [], depth: 0 }] as const),
  );
  const roots: ThreadedCommentNode<T>[] = [];

  for (const comment of comments) {
    const node = nodes.get(comment.id);
    if (!node) continue;
    const parentId = comment.parentId;
    const parent = parentId ? nodes.get(parentId) : null;
    if (parentId && parent && parentId !== comment.id && !createsCycle(comment.id, parentId, commentsById)) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  roots.sort(rootComparator(sort));
  for (const root of roots) setDepth(root, 0);
  return roots;
}

export function countActiveComments(comments: readonly ThreadedCommentRecord[]): number {
  return comments.reduce((count, comment) => count + (comment.deleted || comment.hidden ? 0 : 1), 0);
}

export function replaceThreadedComment<T extends ThreadedCommentRecord>(
  comments: readonly T[],
  replacement: T,
): T[] {
  return comments.map((comment) => comment.id === replacement.id ? replacement : comment);
}

export function applyThreadedCommentLike<T extends ThreadedCommentRecord>(
  comments: readonly T[],
  commentId: string,
  result: { liked: boolean; likes: number },
): T[] {
  return comments.map((comment) => comment.id === commentId
    ? { ...comment, viewerLiked: result.liked, likes: result.likes }
    : comment);
}

export function applyThreadedCommentDelete<T extends ThreadedCommentRecord>(
  comments: readonly T[],
  commentId: string,
  result: ThreadedCommentDeleteResult,
): T[] {
  if (result.soft) {
    const updatedAt = new Date().toISOString();
    return comments.map((comment) => comment.id === commentId
      ? {
          ...comment,
          text: "",
          deleted: true,
          likes: 0,
          viewerLiked: false,
          updatedAt,
        }
      : comment);
  }
  const removedIds = new Set(result.removedIds.length > 0 ? result.removedIds : [commentId]);
  return comments.filter((comment) => !removedIds.has(comment.id));
}
