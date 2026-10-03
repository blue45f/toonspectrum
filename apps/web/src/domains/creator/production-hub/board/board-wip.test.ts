import { describe, expect, it } from "vitest";

import { boardWipForMove, boardWipOverflow } from "./board-wip";
import { boardTask, smallBoardFixture } from "./board-fixtures";

const KO = (ko: string) => ko;

describe("동시 작업 한도", () => {
  it("작업 중 열로 옮길 때만 공정별 한도 현황을 계산한다", () => {
    const aggregate = smallBoardFixture();
    expect(boardWipForMove(aggregate, ["board-ready"], "internal-review", KO)).toEqual([]);
    const info = boardWipForMove(aggregate, ["board-ready"], "in-progress", KO);
    expect(info).toEqual([expect.objectContaining({ key: "story-lock", count: 0, incoming: 1, limit: 1 })]);
    expect(boardWipOverflow(info)).toEqual([]);
  });

  it("이미 한도에 찬 공정이나 한 번에 한도를 넘는 이동을 넘침으로 알린다", () => {
    const base = smallBoardFixture();
    const busy = { ...base, tasks: [...base.tasks, boardTask({ id: "busy", status: "in-progress" })] };
    expect(boardWipOverflow(boardWipForMove(busy, ["board-ready"], "in-progress", KO))).toHaveLength(1);
    const many = { ...base, tasks: [...base.tasks, boardTask({ id: "second", status: "ready" })] };
    expect(boardWipOverflow(boardWipForMove(many, ["board-ready", "second"], "in-progress", KO))[0]).toMatchObject({ incoming: 2, limit: 1 });
  });

  it("공정 설정이 없으면 한도 없음으로 보고 넘침을 알리지 않는다", () => {
    const aggregate = { ...smallBoardFixture(), workflowProfile: null };
    const info = boardWipForMove(aggregate, ["board-ready"], "in-progress", KO);
    expect(info[0]?.limit).toBeNull();
    expect(boardWipOverflow(info)).toEqual([]);
  });
});
