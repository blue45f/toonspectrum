import { describe, expect, it } from "vitest";

import { spaceKoParticle } from "./space-korean";

describe("spaceKoParticle", () => {
  it.each([
    ["스카이 포트", "으로", "스카이 포트로"],
    ["창작자 광장", "으로", "창작자 광장으로"],
    ["프로덕션 관제실", "으로", "프로덕션 관제실로"],
    ["스토리 랩", "으로", "스토리 랩으로"],
    ["NPC · 안내원", "과", "NPC · 안내원과"],
    ["NPC · 카페 매니저", "과", "NPC · 카페 매니저와"],
    ["리뷰 테이블 왼쪽", "을", "리뷰 테이블 왼쪽을"],
    ["공동 자리 오른쪽", "을", "공동 자리 오른쪽을"],
    ["창가 자리", "을", "창가 자리를"],
    ["Studio", "으로", "Studio로"],
    ["3번 책상", "이", "3번 책상이"],
  ] as const)("%s + %s → %s", (word, particle, expected) => {
    expect(spaceKoParticle(word, particle)).toBe(expected);
  });
});
