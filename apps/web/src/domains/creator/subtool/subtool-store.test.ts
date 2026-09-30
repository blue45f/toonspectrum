import { beforeEach, describe, expect, it } from "vitest";

import {
  clearStoredSubTools,
  cloneSubTool,
  createSubTool,
  deleteSubTool,
  findSubTool,
  getBrowserSubToolStorage,
  loadSubTools,
  parseSubTool,
  renameSubTool,
  saveSubTools,
  SUBTOOL_STORAGE_KEY,
  upsertSubTool,
  type SubTool,
  type SubToolStorageLike,
} from "./subtool-store";
import { normalizeSubToolParams } from "./subtool-params";

function createMemoryStorage(initial?: Record<string, string>): SubToolStorageLike {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function validToolPayload(): Record<string, unknown> {
  return {
    id: "subtool-1",
    name: "수채화 펜",
    baseBrushId: "watercolor-round",
    params: normalizeSubToolParams({ tip: { shape: "textured", size: 40 } }),
    createdAt: "2026-09-30T00:00:00.000Z",
    isPreset: false,
  };
}

describe("parseSubTool", () => {
  it("유효한 페이로드를 그대로 파싱한다", () => {
    const tool = parseSubTool(validToolPayload());
    expect(tool?.id).toBe("subtool-1");
    expect(tool?.name).toBe("수채화 펜");
    expect(tool?.baseBrushId).toBe("watercolor-round");
    expect(tool?.params.tip.shape).toBe("textured");
    expect(tool?.params.tip.size).toBe(40);
  });

  it("파라미터가 오염되어도 정규화되어 살아남는다", () => {
    const tool = parseSubTool({
      ...validToolPayload(),
      params: { tip: { size: 9999, shape: "unknown" } },
    });
    expect(tool?.params.tip.size).toBe(200);
    expect(tool?.params.tip.shape).toBe("round");
  });

  it.each([
    ["빈 객체", {}],
    ["이름 누락", { ...validToolPayload(), name: "" }],
    ["이름 공백", { ...validToolPayload(), name: "   " }],
    ["id 누락", { ...validToolPayload(), id: "" }],
    ["baseBrushId 누락", { ...validToolPayload(), baseBrushId: "" }],
    ["잘못된 날짜", { ...validToolPayload(), createdAt: "어제" }],
    ["배열 입력", [validToolPayload()]],
    ["문자열 입력", "subtool"],
  ])("%s 입력은 null을 반환한다", (_label, input) => {
    expect(parseSubTool(input)).toBeNull();
  });
});

describe("createSubTool", () => {
  it("새 서브툴을 만들고 고유 id를 부여한다", () => {
    const a = createSubTool("펜 A", "brush-a");
    const b = createSubTool("펜 A", "brush-a");
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe("펜 A");
    expect(a.baseBrushId).toBe("brush-a");
    expect(a.isPreset).toBe(false);
    expect(Number.isNaN(Date.parse(a.createdAt))).toBe(false);
  });

  it("이름 앞뒤 공백을 제거한다", () => {
    expect(createSubTool("  잉크펜  ", "brush-a").name).toBe("잉크펜");
  });

  it("빈 이름이나 빈 baseBrushId에는 예외를 던진다", () => {
    expect(() => createSubTool("", "brush-a")).toThrow();
    expect(() => createSubTool("펜", "")).toThrow();
    expect(() => createSubTool("펜", "   ")).toThrow();
  });

  it("60자를 초과하는 이름에는 예외를 던진다", () => {
    expect(() => createSubTool("가".repeat(61), "brush-a")).toThrow();
  });
});

describe("cloneSubTool", () => {
  it("복제본은 새 id와 생성 시각을 받고 프리셋이 아니다", () => {
    const original = createSubTool("원본", "brush-a", { tip: { size: 50 } });
    const clone = cloneSubTool(original);
    expect(clone.id).not.toBe(original.id);
    expect(clone.name).toBe("원본 (복사본)");
    expect(clone.baseBrushId).toBe(original.baseBrushId);
    expect(clone.params).toEqual(original.params);
    expect(clone.isPreset).toBe(false);
  });

  it("이름을 지정해 복제할 수 있다", () => {
    const original = createSubTool("원본", "brush-a");
    expect(cloneSubTool(original, "새 이름").name).toBe("새 이름");
  });
});

describe("renameSubTool", () => {
  it("이름만 바꾸고 나머지는 유지한다", () => {
    const original = createSubTool("원본", "brush-a", { tip: { size: 50 } });
    const renamed = renameSubTool(original, "바뀐 이름");
    expect(renamed.name).toBe("바뀐 이름");
    expect(renamed.id).toBe(original.id);
    expect(renamed.params).toEqual(original.params);
  });

  it("빈 이름에는 예외를 던지고 원본은 변경되지 않는다", () => {
    const original = createSubTool("원본", "brush-a");
    expect(() => renameSubTool(original, "  ")).toThrow();
    expect(original.name).toBe("원본");
  });
});

describe("upsertSubTool / findSubTool / deleteSubTool", () => {
  it("upsert는 없으면 추가하고 있으면 교체한다", () => {
    const tool = createSubTool("펜", "brush-a");
    const added = upsertSubTool([], tool);
    expect(added).toHaveLength(1);

    const renamed = renameSubTool(tool, "펜 v2");
    const replaced = upsertSubTool(added, renamed);
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.name).toBe("펜 v2");

    // 입력 배열은 변경되지 않는다 (불변성)
    expect(added[0]?.name).toBe("펜");
  });

  it("findSubTool은 id로 찾고 없으면 null을 반환한다", () => {
    const tool = createSubTool("펜", "brush-a");
    const tools = upsertSubTool([], tool);
    expect(findSubTool(tools, tool.id)?.name).toBe("펜");
    expect(findSubTool(tools, "nope")).toBeNull();
  });

  it("deleteSubTool은 해당 id만 제거한다", () => {
    const a = createSubTool("A", "brush-a");
    const b = createSubTool("B", "brush-b");
    const tools = upsertSubTool(upsertSubTool([], a), b);
    const remaining = deleteSubTool(tools, a.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(b.id);

    // 없는 id를 지워도 목록 내용은 같다
    expect(deleteSubTool(remaining, "nope")).toHaveLength(1);
  });
});

describe("localStorage 영속화", () => {
  let storage: SubToolStorageLike;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("저장 후 불러오면 동일하게 복원된다", () => {
    const tools: SubTool[] = [
      createSubTool("펜 A", "brush-a", { tip: { shape: "neon", size: 60 } }),
      createSubTool("펜 B", "brush-b"),
    ];
    expect(saveSubTools(storage, tools)).toBe(true);
    const loaded = loadSubTools(storage);
    expect(loaded).toHaveLength(2);
    expect(loaded[0]?.name).toBe("펜 A");
    expect(loaded[0]?.params.tip.shape).toBe("neon");
  });

  it("손상된 JSON이나 잘못된 항목은 건너뛴다", () => {
    storage.setItem(SUBTOOL_STORAGE_KEY, "{ broken json");
    expect(loadSubTools(storage)).toEqual([]);

    storage.setItem(
      SUBTOOL_STORAGE_KEY,
      JSON.stringify([validToolPayload(), { id: "", name: "" }, 42]),
    );
    const loaded = loadSubTools(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe("subtool-1");
  });

  it("중복 id는 처음 항목만 유지한다", () => {
    const payload = validToolPayload();
    storage.setItem(
      SUBTOOL_STORAGE_KEY,
      JSON.stringify([payload, { ...payload, name: "중복" }]),
    );
    const loaded = loadSubTools(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.name).toBe("수채화 펜");
  });

  it("빈 저장소는 빈 배열을 반환한다", () => {
    expect(loadSubTools(storage)).toEqual([]);
    expect(loadSubTools(null)).toEqual([]);
    expect(loadSubTools(undefined)).toEqual([]);
  });

  it("clearStoredSubTools는 저장된 데이터를 지운다", () => {
    saveSubTools(storage, [createSubTool("펜", "brush-a")]);
    clearStoredSubTools(storage);
    expect(loadSubTools(storage)).toEqual([]);
  });

  it("저장 실패 시 saveSubTools는 false를 반환한다", () => {
    const failing: SubToolStorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => {},
    };
    expect(saveSubTools(failing, [createSubTool("펜", "brush-a")])).toBe(false);
    expect(loadSubTools(failing)).toEqual([]);
  });
});

describe("getBrowserSubToolStorage", () => {
  it("node 환경에서는 null을 반환한다", () => {
    expect(getBrowserSubToolStorage()).toBeNull();
  });
});
