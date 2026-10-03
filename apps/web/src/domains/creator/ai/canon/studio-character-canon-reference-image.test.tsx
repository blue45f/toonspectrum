// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { isSafeReferenceImageUrl, safeReferenceImageSrc } from "./reference-image-src";

const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);

describe("레퍼런스 이미지 URL 스킴 경계", () => {
  it("업로드·번들·셰이퍼가 실제로 쓰는 값은 통과시킨다", () => {
    expect(safeReferenceImageSrc("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    expect(safeReferenceImageSrc("http://example.com/a.png")).toBe("http://example.com/a.png");
    expect(safeReferenceImageSrc("blob:https://app.example/uuid")).toBe("blob:https://app.example/uuid");
    expect(safeReferenceImageSrc("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(safeReferenceImageSrc("data:image/jpeg;base64,/9j/4AAQ")).toBe("data:image/jpeg;base64,/9j/4AAQ");
    expect(safeReferenceImageSrc("/avatars/placeholder.png")).toBe("/avatars/placeholder.png");
    expect(safeReferenceImageSrc("./snapshot/a.png")).toBe("./snapshot/a.png");
  });

  it("스크립트 스킴은 대소문자·공백·제어문자와 무관하게 모두 차단한다", () => {
    for (const hostile of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "   javascript:alert(1)",
      `${NUL}javascript:alert(1)`,
      `java${TAB}script:alert(1)`,
      "java\nscript:alert(1)",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(safeReferenceImageSrc(hostile), hostile).toBeNull();
    }
  });

  it("스크립트를 실행할 수 있는 data URL은 이미지 mime 타입이어도 차단한다", () => {
    expect(safeReferenceImageSrc("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeReferenceImageSrc("DATA:TEXT/HTML,<script>")).toBeNull();
    expect(safeReferenceImageSrc("DaTa:TeXt/HtMl,<script>")).toBeNull();
    expect(safeReferenceImageSrc("data:image/svg+xml,<svg onload=alert(1)>")).toBeNull();
    expect(safeReferenceImageSrc("DATA:IMAGE/SVG+XML,<svg onload=alert(1)>")).toBeNull();
  });

  it("스킴 판정은 대소문자를 무시한다(대문자 data URL도 정당한 이미지다)", () => {
    for (const value of [
      "DATA:IMAGE/PNG;base64,iVBOR",
      "Data:Image/Png;base64,iVBOR",
      "data:image/PNG;base64,iVBOR",
      "HTTPS://cdn.example.com/a.png",
      "HTTP://example.com/a.png",
      "BLOB:https://app.example/uuid",
    ]) {
      expect(safeReferenceImageSrc(value), value).not.toBeNull();
    }
  });

  it("프로토콜 상대 URL은 상대경로로 통과시키지 않는다", () => {
    expect(safeReferenceImageSrc("//evil.example/a.png")).toBeNull();
    expect(safeReferenceImageSrc("///evil.example/a.png")).toBeNull();
  });

  it("빈 값은 렌더하지 않는다", () => {
    expect(safeReferenceImageSrc(null)).toBeNull();
    expect(safeReferenceImageSrc("")).toBeNull();
    expect(safeReferenceImageSrc("    ")).toBeNull();
expect(safeReferenceImageSrc(`${NUL}${TAB} `)).toBeNull();
});

describe("sink 직전 스킴 재검증", () => {
  it("실제 렌더 경로 값은 통과시킨다", () => {
    expect(isSafeReferenceImageUrl("https://cdn.example.com/a.png")).toBe(true);
    expect(isSafeReferenceImageUrl("blob:https://app.example/uuid")).toBe(true);
    expect(isSafeReferenceImageUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isSafeReferenceImageUrl("data:image/PNG;base64,iVBORw0KGgo=")).toBe(true);
    expect(isSafeReferenceImageUrl("./local.png")).toBe(true);
  });

  it("XSS·프로토콜 상대 URL은 거부한다", () => {
    expect(isSafeReferenceImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeReferenceImageUrl("JavaScript:alert(1)")).toBe(false);
    expect(isSafeReferenceImageUrl("data:image/svg+xml,<svg/onload=alert(1)>")).toBe(false);
    expect(isSafeReferenceImageUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeReferenceImageUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeReferenceImageUrl("//evil.example/a.png")).toBe(false);
  });

  it("sanitizer 결과와 sink 검증이 같은 결론을 낸다", () => {
    for (const value of [
      "https://cdn.example.com/a.png",
      "blob:https://app.example/uuid",
      "data:image/png;base64,iVBORw0KGgo=",
      "./local.png",
    ]) {
      const sanitized = safeReferenceImageSrc(value);
      expect(sanitized, value).not.toBeNull();
      expect(isSafeReferenceImageUrl(sanitized as string), value).toBe(true);
    }
  });
});
});