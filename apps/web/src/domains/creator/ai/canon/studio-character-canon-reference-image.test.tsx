// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { safeReferenceImageSrc } from "./reference-image-src";

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
    expect(safeReferenceImageSrc("data:image/svg+xml,<svg onload=alert(1)>")).toBeNull();
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
});