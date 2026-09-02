import { globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import legacyExceptions from "../eslint.legacy-exceptions.json" with { type: "json" };

const ROOT = path.resolve(fileURLToPath(new URL("./", import.meta.url)), "..");

/**
 * ratchet: new files may not be added; remove entries as files are cleaned.
 *
 * eslint.config.mjs 의 두 예외 블록은 "기계적 추출" 상태(호스트 closure 를 `any` bag 으로
 * 넘긴 분할)를 영구 동결시키는 장치다. 목록이 설정 파일 안에 있으면 아무도 그 길이를
 * 보지 않으므로, 목록을 원장으로 빼고 길이를 여기서 얼린다. 파일을 정리해 예외에서
 * 빼면 이 숫자도 함께 내려간다 — 올릴 일은 없어야 한다.
 */
const FROZEN_LENGTHS = {
  compilerOptOutFiles: 4,
  closureBagFiles: 51,
};

const LEDGER_KEYS = Object.keys(FROZEN_LENGTHS);

describe("eslint legacy exception ledger", () => {
  it("exposes exactly the two exception lists eslint.config.mjs consumes", () => {
    expect(Object.keys(legacyExceptions).sort()).toEqual([...LEDGER_KEYS].sort());
    for (const key of LEDGER_KEYS) {
      expect(Array.isArray(legacyExceptions[key])).toBe(true);
      expect(legacyExceptions[key].every((entry) => typeof entry === "string")).toBe(true);
    }
  });

  it("keeps every glob pointed at a file that still exists", () => {
    const dead = [];
    for (const key of LEDGER_KEYS) {
      for (const pattern of legacyExceptions[key]) {
        const matches = globSync(pattern, { cwd: ROOT });
        if (matches.length === 0) dead.push(`${key}: ${pattern}`);
      }
    }
    // 죽은 글롭은 "예외가 필요한 파일"이 아니라 남은 흔적이다 — 지워야 목록이 줄어든다.
    expect(dead).toEqual([]);
  });

  it("holds both lists at or below their frozen lengths", () => {
    // ratchet: new files may not be added; remove entries as files are cleaned.
    const overBudget = LEDGER_KEYS.filter(
      (key) => legacyExceptions[key].length > FROZEN_LENGTHS[key],
    ).map((key) => `${key}: ${legacyExceptions[key].length} > ${FROZEN_LENGTHS[key]}`);
    expect(overBudget).toEqual([]);
  });

  it("keeps each list duplicate-free", () => {
    for (const key of LEDGER_KEYS) {
      const seen = new Set();
      const duplicates = legacyExceptions[key].filter((entry) => {
        if (seen.has(entry)) return true;
        seen.add(entry);
        return false;
      });
      expect({ [key]: duplicates }).toEqual({ [key]: [] });
    }
  });
});
