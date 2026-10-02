// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { adjacentBoardCard, boardCardElements, boardCardId, focusBoardCardById, focusedBoardCard } from "./board-focus";

function column(id: string, cards: readonly string[], extra = ""): string {
  return `<section data-production-drop-column="${id}" ${extra}>${cards
    .map((card) => `<article data-production-task="${card}"><button data-board-open>${card}</button></article>`)
    .join("")}</section>`;
}

function mount(html: string): HTMLElement {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  const root = document.getElementById("root");
  if (!root) throw new Error("root");
  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("카드 사이 초점 이동", () => {
  it("접힌 열의 카드는 제외하고 읽는 순서대로 카드를 모은다", () => {
    const root = mount(column("queue", ["a", "b"]) + `<div hidden>${column("review", ["z"])}</div>` + column("working", ["c"]));
    expect(boardCardElements(root).map((card) => boardCardId(card))).toEqual(["a", "b", "c"]);
  });

  it("위아래는 같은 열 안에서, 좌우는 이웃 열의 같은 순서 카드로 움직인다", () => {
    const root = mount(column("queue", ["a", "b", "c"]) + column("working", ["d", "e"]));
    const cards = boardCardElements(root);
    const [a, b, c, d, e] = cards;
    if (!a || !b || !c || !d || !e) throw new Error("fixture");
    expect(adjacentBoardCard(root, a, "next")).toBe(b);
    expect(adjacentBoardCard(root, c, "next")).toBeNull();
    expect(adjacentBoardCard(root, a, "prev")).toBeNull();
    expect(adjacentBoardCard(root, b, "right")).toBe(e);
    // 이웃 열에 같은 순서가 없으면 마지막 카드로 간다.
    expect(adjacentBoardCard(root, c, "right")).toBe(e);
    expect(adjacentBoardCard(root, e, "left")).toBe(b);
    expect(adjacentBoardCard(root, d, "left")).toBe(a);
  });

  it("카드가 비어 있는 열은 건너뛰어 다음 열로 간다", () => {
    const root = mount(column("queue", ["a"]) + column("working", []) + column("review", ["r"]));
    const a = boardCardElements(root)[0];
    expect(a && boardCardId(adjacentBoardCard(root, a, "right"))).toBe("r");
  });

  it("초점이 없을 때 아래는 첫 카드, 위는 마지막 카드로 시작한다", () => {
    const root = mount(column("queue", ["a", "b"]));
    expect(boardCardId(adjacentBoardCard(root, null, "next"))).toBe("a");
    expect(boardCardId(adjacentBoardCard(root, null, "prev"))).toBe("b");
  });

  it("스윔레인에서는 같은 줄 안의 열로만 좌우 이동한다", () => {
    const root = mount(
      column("queue", ["a1"], 'data-production-lane="x"') + column("working", ["a2"], 'data-production-lane="x"') + column("queue", ["b1"], 'data-production-lane="y"'),
    );
    const a1 = boardCardElements(root)[0];
    expect(a1 && boardCardId(adjacentBoardCard(root, a1, "right"))).toBe("a2");
    const b1 = boardCardElements(root)[2];
    expect(b1 && adjacentBoardCard(root, b1, "right")).toBeNull();
  });

  it("카드의 제목 버튼에 초점을 주고 지금 초점이 있는 카드를 찾는다", () => {
    const root = mount(column("queue", ["a", "b"]));
    expect(focusBoardCardById(root, "b")).toBe(true);
    expect(boardCardId(focusedBoardCard(root))).toBe("b");
    expect(focusBoardCardById(root, "없음")).toBe(false);
  });
});
