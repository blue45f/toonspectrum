import { describe, expect, it } from "vitest";

import {
  buildCodeInviteFragment,
  createEntryCode,
  createEntryCodeRecord,
  isEntryCodeRecordValid,
  isEntryCodeValid,
  parseCodeInviteFragment,
  renderEntryCodeQrDataUrl,
  STUDIO_ENTRY_CODE_ALPHABET,
  STUDIO_ENTRY_CODE_LENGTH,
} from "./studio-virtual-space-entry-code";

describe("createEntryCode", () => {
  it("6자리 코드를 만든다", () => {
    const code = createEntryCode();
    expect(code).toHaveLength(STUDIO_ENTRY_CODE_LENGTH);
    expect(isEntryCodeValid(code)).toBe(true);
  });

  it("혼동 문자(0/O/1/I)를 쓰지 않는다", () => {
    for (const char of ["0", "O", "1", "I"]) {
      expect(STUDIO_ENTRY_CODE_ALPHABET).not.toContain(char);
    }
  });

  it("pick 주입 시 결정적으로 생성한다", () => {
    expect(createEntryCode(() => 0)).toBe("AAAAAA");
    expect(createEntryCode((index) => index)).toBe(
      STUDIO_ENTRY_CODE_ALPHABET.slice(0, 6),
    );
  });
});

describe("isEntryCodeValid", () => {
  it("형식을 검증한다", () => {
    expect(isEntryCodeValid("ABC234")).toBe(true);
    expect(isEntryCodeValid("abc234")).toBe(true);
    expect(isEntryCodeValid("  ABC234  ")).toBe(true);
    expect(isEntryCodeValid("ABC12")).toBe(false);
    expect(isEntryCodeValid("ABC2344")).toBe(false);
    expect(isEntryCodeValid("ABC12!")).toBe(false);
    expect(isEntryCodeValid("ABC1O3")).toBe(false);
  });
});

describe("createEntryCodeRecord / isEntryCodeRecordValid", () => {
  it("발급 기록을 만들고 만료를 판정한다", () => {
    const record = createEntryCodeRecord({ code: "ABC234", spaceId: "space-1", spaceName: "콘티룸", now: 1000 });
    expect(record?.expiresAt).toBeGreaterThan(1000);
    expect(isEntryCodeRecordValid(record!, 2000)).toBe(true);
    expect(isEntryCodeRecordValid(record!, 999)).toBe(false);
    expect(isEntryCodeRecordValid(record!, record!.expiresAt)).toBe(false);
  });

  it("무효 입력은 거부한다", () => {
    expect(createEntryCodeRecord({ code: "ABC12", spaceId: "s", spaceName: "n" })).toBeNull();
    expect(createEntryCodeRecord({ code: "ABC234", spaceId: " ", spaceName: "n" })).toBeNull();
    expect(createEntryCodeRecord({ code: "ABC234", spaceId: "s", spaceName: " " })).toBeNull();
  });
});

describe("code invite fragment", () => {
  it("빌드·파싱이 왕복한다", () => {
    const fragment = buildCodeInviteFragment("abc234");
    expect(fragment).toBe("#code=ABC234");
    expect(parseCodeInviteFragment(fragment)).toBe("ABC234");
  });

  it("형식이 맞지 않으면 null", () => {
    expect(parseCodeInviteFragment("#code=ABC12")).toBeNull();
    expect(parseCodeInviteFragment("#invite=token")).toBeNull();
    expect(parseCodeInviteFragment("")).toBeNull();
  });
});

describe("renderEntryCodeQrDataUrl", () => {
  it("QR PNG data URL을 만든다", async () => {
    const url = await renderEntryCodeQrDataUrl("https://toonstudio.cloud/vspace#code=ABC234");
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    expect(url.length).toBeGreaterThan(1000);
  });
});
