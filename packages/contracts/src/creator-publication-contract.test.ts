import { describe, expect, it } from "vitest";

import { normalizeCreatorPublicationDirective } from "./creator-publication-contract";

describe("게시 메타데이터 제어 문자 정규화", () => {
  it.each([...Array.from({ length: 32 }, (_, code) => code), 127])(
    "제어 문자 U+%s에서 탭·줄바꿈·캐리지리턴만 유지한다",
    (code) => {
      const character = String.fromCharCode(code);
      const input = `가${character}나`;
      const result = normalizeCreatorPublicationDirective({ socialTitle: input, socialDescription: input });
      const expected = [9, 10, 13].includes(code) ? input : "가나";
      expect(result.socialTitle).toBe(expected);
      expect(result.socialDescription).toBe(expected);
    },
  );

  it("한글·보조 평면 문자와 원래 허용한 C1 문자를 손상시키지 않는다", () => {
    const input = `한글 🎨 ${String.fromCharCode(0x85)} 끝`;
    expect(normalizeCreatorPublicationDirective({ socialTitle: `  ${input}  ` }).socialTitle).toBe(input);
  });

  it("정규화 이후에도 제목 70자와 설명 160자 제한을 유지한다", () => {
    const input = `${String.fromCharCode(0)}${"가".repeat(180)}${String.fromCharCode(127)}`;
    const result = normalizeCreatorPublicationDirective({ socialTitle: input, socialDescription: input });
    expect(result.socialTitle).toBe("가".repeat(70));
    expect(result.socialDescription).toBe("가".repeat(160));
  });
});
