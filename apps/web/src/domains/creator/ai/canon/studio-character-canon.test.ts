import { describe, expect, it } from "vitest";

import {
  buildCharacterCanonSheet,
  canonPanelUsageForCharacter,
  emptyCharacterCanonDocument,
  loadCharacterCanonDocument,
  parseCharacterCanonDocument,
  recordCanonPanelUsage,
  removeCharacterCanonSheet,
  saveCharacterCanonDocument,
  upsertCharacterCanonSheet,
  validateCanonSheetDraft,
  CANON_TAGS_MAX,
  CHARACTER_CANON_STORAGE_KEY,
  type CanonSheetDraft,
  type CanonStorage,
} from "./studio-character-canon";

function draft(overrides: Partial<CanonSheetDraft> = {}): CanonSheetDraft {
  return {
    name: "유진",
    appearance: "긴 흑발, 회색 눈, 왼쪽 눈 밑에 점",
    outfit: "남색 교복 재킷과 붉은 넥타이",
    tags: ["차분함", "안경"],
    referenceImage: null,
    referenceSource: null,
    referenceLabel: null,
    ...overrides,
  };
}

function memoryStorage(initial: Record<string, string> = {}): CanonStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("캐릭터 캐논 시트 모델", () => {
  it("이름과 외모가 비면 폼 오류를 돌려준다", () => {
    expect(validateCanonSheetDraft(draft({ name: "  " }))).toContain(
      "캐릭터 이름을 입력해 주세요.",
    );
    expect(validateCanonSheetDraft(draft({ appearance: "" })).length).toBe(1);
    expect(validateCanonSheetDraft(draft())).toHaveLength(0);
  });

  it("입력값을 정리하고 길이 상한을 지킨다", () => {
    const sheet = buildCharacterCanonSheet(
      draft({
        name: "  유진  ",
        tags: ["차분함", "차분함", "  안경  ", "", "#태그"],
        referenceImage: "javascript:alert(1)",
      }),
      { id: "sheet-1", now: "2026-10-01T00:00:00.000Z" },
    );
    expect(sheet.id).toBe("sheet-1");
    expect(sheet.name).toBe("유진");
    expect(sheet.tags).toEqual(["차분함", "안경", "태그"]);
    expect(sheet.tags.length).toBeLessThanOrEqual(CANON_TAGS_MAX);
    // 허용되지 않은 스킴의 레퍼런스는 버린다.
    expect(sheet.referenceImage).toBeNull();
  });

  it("깨진 저장값을 만나도 빈 문서로 복구된다", () => {
    expect(parseCharacterCanonDocument(null)).toEqual(
      emptyCharacterCanonDocument(),
    );
    expect(parseCharacterCanonDocument("not-json{")).toEqual(
      emptyCharacterCanonDocument(),
    );
    const recovered = parseCharacterCanonDocument(
      JSON.stringify({ sheets: [{ id: "a" }, null, "x"], usage: "nope" }),
    );
    expect(recovered.sheets).toHaveLength(1);
    expect(recovered.sheets[0]!.id).toBe("a");
    expect(recovered.usage).toEqual([]);
  });

  it("시트를 저장·수정·삭제하고 localStorage에 왕복한다", () => {
    const storage = memoryStorage();
    let document = loadCharacterCanonDocument(storage);
    expect(document.sheets).toHaveLength(0);

    const sheet = buildCharacterCanonSheet(draft(), { id: "sheet-1" });
    document = upsertCharacterCanonSheet(document, sheet);
    saveCharacterCanonDocument(storage, document);

    const reloaded = loadCharacterCanonDocument(storage);
    expect(reloaded.sheets).toHaveLength(1);
    expect(reloaded.sheets[0]!.name).toBe("유진");
    expect(storage.getItem(CHARACTER_CANON_STORAGE_KEY)).toContain("sheet-1");

    const updated = buildCharacterCanonSheet(draft({ name: "유진2" }), {
      id: "sheet-1",
    });
    document = upsertCharacterCanonSheet(reloaded, updated);
    expect(document.sheets).toHaveLength(1);
    expect(document.sheets[0]!.name).toBe("유진2");

    document = removeCharacterCanonSheet(document, "sheet-1");
    expect(document.sheets).toHaveLength(0);
  });

  it("사용 기록은 캐릭터·세션·패널 단위로 중복을 합치고 최신순으로 보여준다", () => {
    let document = emptyCharacterCanonDocument();
    document = recordCanonPanelUsage(document, {
      characterId: "c1",
      sessionId: "s1",
      sessionLabel: "세션 1",
      panelIndex: 0,
      panelSummary: "첫 컷",
      injectedAt: "2026-10-01T01:00:00.000Z",
      id: "u1",
    });
    document = recordCanonPanelUsage(document, {
      characterId: "c1",
      sessionId: "s1",
      sessionLabel: "세션 1",
      panelIndex: 1,
      panelSummary: "둘째 컷",
      injectedAt: "2026-10-01T02:00:00.000Z",
      id: "u2",
    });
    // 같은 패널에 다시 주입하면 기록이 하나로 합쳐진다.
    document = recordCanonPanelUsage(document, {
      characterId: "c1",
      sessionId: "s1",
      sessionLabel: "세션 1",
      panelIndex: 0,
      panelSummary: "첫 컷 다시",
      injectedAt: "2026-10-01T03:00:00.000Z",
      id: "u3",
    });
    expect(document.usage).toHaveLength(2);
    const forCharacter = canonPanelUsageForCharacter(document, "c1");
    expect(forCharacter[0]!.panelIndex).toBe(0);
    expect(forCharacter[0]!.panelSummary).toBe("첫 컷 다시");

    // 시트를 지우면 사용 기록도 함께 사라진다.
    document = removeCharacterCanonSheet(
      upsertCharacterCanonSheet(
        document,
        buildCharacterCanonSheet(draft(), { id: "c1" }),
      ),
      "c1",
    );
    expect(document.usage).toHaveLength(0);
  });
});
