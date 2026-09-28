import { describe, expect, it } from "vitest";
import { insertReplyNode } from "./fan-cafe-tree-utils";

interface Node { id: string; children?: Node[] }
const tree: Node[] = [
  { id: "first", children: [{ id: "unrelated" }] },
  { id: "second", children: [{ id: "parent", children: [{ id: "existing" }] }] },
];
describe("댓글 가지 삽입", () => {
  it("정확한 부모 가지에 한 번만 삽입하고 형제 참조를 보존한다", () => {
    const reply: Node = { id: "new" };
    const next = insertReplyNode(tree, "parent", reply);
    expect(next[0]).toBe(tree[0]);
    expect(next[1].children?.[0].children).toEqual([{ id: "existing" }, reply]);
    expect(JSON.stringify(next).match(/new/g)).toHaveLength(1);
    expect(tree[1].children?.[0].children).toEqual([{ id: "existing" }]);
  });
  it("부모가 없으면 잘못된 위치에 삽입하지 않는다", () => {
    expect(insertReplyNode(tree, "missing", { id: "new" })).toBe(tree);
  });
  it("중복 응답과 재시도는 같은 댓글을 두 번 표시하지 않는다", () => {
    expect(insertReplyNode(tree, null, { id: "existing" })).toBe(tree);
  });
  it("루트 댓글은 정확히 한 번 추가한다", () => {
    expect(insertReplyNode(tree, null, { id: "new" })).toEqual([...tree, { id: "new" }]);
  });
});
