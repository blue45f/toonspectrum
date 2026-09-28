import type { FanCafeReply } from "@/shared/lib/types";

// 소프트 삭제 마스킹(서버 maskDeletedReply와 동일 형태) — 하위 답글 자리 보존.
export function maskReplyNode(tree: FanCafeReply[], replyId: string): FanCafeReply[] {
  return tree.map((item) => {
    if (item.id === replyId) {
      return { ...item, deleted: true, text: "", author: { name: "삭제됨", avatar: "#5b5751" } };
    }
    if (!item.children || item.children.length === 0) return item;
    return { ...item, children: maskReplyNode(item.children, replyId) };
  });
}

export function removeReplyNode(tree: FanCafeReply[], replyId: string): FanCafeReply[] {
  return tree
    .filter((item) => item.id !== replyId)
    .map((item) =>
      item.children && item.children.length > 0 ? { ...item, children: removeReplyNode(item.children, replyId) } : item
    );
}

export function countReplies(items: FanCafeReply[]): number {
  return items.reduce((count, item) => count + 1 + countReplies(item.children ?? []), 0);
}

/** 부모가 존재하는 가지 하나만 갱신한다. 없는 부모를 루트나 형제 가지로 승격하지 않는다. */
export function insertReplyNode<T extends { id: string; children?: T[] }>(
  tree: T[], parentId: string | null, reply: T,
): T[] {
  const contains = (nodes: T[]): boolean => nodes.some(
    (node) => node.id === reply.id || contains(node.children ?? []),
  );
  if (contains(tree)) return tree;
  if (!parentId) return [...tree, reply];
  function insert(nodes: T[]): T[] {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node.id === parentId) {
        const next = [...nodes];
        next[index] = { ...node, children: [...(node.children ?? []), reply] };
        return next;
      }
      if (node.children?.length) {
        const children = insert(node.children);
        if (children !== node.children) {
          const next = [...nodes];
          next[index] = { ...node, children };
          return next;
        }
      }
    }
    return nodes;
  }
  return insert(tree);
}
