/**
 * 컷츠 패널 아트 테스트 — 프로시저럴 SVG 생성 검증.
 */

import { describe, expect, it } from "vitest";

import { buildPanelArt } from "./cuts-panel-art";

describe("buildPanelArt", () => {
  it("data:image/svg+xml URL을 반환한다", () => {
    const url = buildPanelArt({ seed: "test-seed" });
    expect(url.startsWith("data:image/svg+xml,")).toBe(true);
    const decoded = decodeURIComponent(url.slice("data:image/svg+xml,".length));
    expect(decoded).toContain("<svg");
    expect(decoded).toContain("</svg>");
  });

  it("같은 시드는 같은 아트를 만든다", () => {
    expect(buildPanelArt({ seed: "same" })).toBe(buildPanelArt({ seed: "same" }));
  });

  it("다른 시드는 다른 아트를 만든다", () => {
    expect(buildPanelArt({ seed: "a" })).not.toBe(buildPanelArt({ seed: "b" }));
  });

  it("라벨이 SVG 텍스트로 들어간다", () => {
    const decoded = decodeURIComponent(
      buildPanelArt({ seed: "label-test", label: "테스트 문구" }).slice("data:image/svg+xml,".length),
    );
    expect(decoded).toContain("테스트 문구");
  });

  it("라벨의 XML 특수문자를 이스케이프한다", () => {
    const decoded = decodeURIComponent(
      buildPanelArt({ seed: "escape-test", label: "<b>굵게</b> & \"인용\"" }).slice(
        "data:image/svg+xml,".length,
      ),
    );
    expect(decoded).not.toContain("<b>굵게</b>");
    expect(decoded).toContain("&lt;b&gt;");
  });
});
