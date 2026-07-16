import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioToolHintBubble } from "./components/StudioToolHintBubble";
import { StudioToolHintTarget } from "./StudioToolHint";
import source from "./StudioToolHint.tsx?raw";

describe("StudioToolHint", () => {
  it("renders an animated motion-coach preview, workflow tip, and exact tooltip id", () => {
    const html = renderToStaticMarkup(
      <StudioToolHintBubble
        hint={{
          id: "pen",
          title: "펜",
          description: "자유선으로 그립니다.",
          shortcut: "B",
          preview: "ink",
          tip: "[ 와 ] 키로 크기를 바꿔보세요.",
        }}
        id="pen-motion-coach"
        anchor={{ left: 10, top: 20, right: 50, bottom: 60, width: 40, height: 40, x: 10, y: 20, toJSON: () => ({}) } as DOMRect}
      />
    );
    expect(html).toContain('data-studio-tool-hint="true"');
    expect(html).toContain('id="pen-motion-coach"');
    expect(html).toContain('data-studio-tool-hint-expanded="true"');
    expect(html).toContain('data-studio-tool-hint-preview="ink"');
    expect(html).toContain('data-motion="loading"');
    expect(html).toContain('data-studio-tool-hint-tip="true"');
    expect(html).toContain("펜");
    expect(html).toContain("자유선으로 그립니다.");
    expect(html).toContain("B");
    expect(html).toContain('data-studio-kbd="true"');
    expect(html).toContain("pointer-events-auto");
    expect(html).not.toContain("pointer-events-none");
  });

  it("keeps the first-stage hint compact until hover dwell completes", () => {
    const html = renderToStaticMarkup(
      <StudioToolHintBubble
        expanded={false}
        hint={{ id: "eraser", title: "지우개", description: "획을 지웁니다.", preview: "erase" }}
        anchor={{ left: 1200, top: 20, right: 1240, bottom: 60, width: 40, height: 40 } as DOMRect}
      />
    );
    expect(html).toContain('data-studio-tool-hint-expanded="false"');
    expect(html).toContain('data-side="left"');
    expect(html).not.toContain("data-studio-tool-hint-preview=");
  });

  it("condenses the coach instead of promising a preview hidden by the short-height layout", () => {
    const originalHeight = globalThis.innerHeight;
    Object.defineProperty(globalThis, "innerHeight", { configurable: true, value: 500 });
    try {
      const html = renderToStaticMarkup(
        <StudioToolHintBubble
          hint={{
            id: "pen-short",
            title: "펜",
            description: "짧은 화면에서도 이 설명은 그대로 읽을 수 있습니다.",
            preview: "ink",
          }}
          anchor={{ left: 10, top: 100, right: 50, bottom: 140, width: 40, height: 40 } as DOMRect}
        />
      );
      expect(html).toContain('data-studio-tool-hint-condensed="true"');
      expect(html).toContain('data-studio-tool-hint-expanded="false"');
      expect(html).toContain("짧은 화면에서도 이 설명은 그대로 읽을 수 있습니다.");
      expect(html).not.toContain("data-studio-tool-hint-preview=");
    } finally {
      if (originalHeight === undefined) {
        Reflect.deleteProperty(globalThis, "innerHeight");
      } else {
        Object.defineProperty(globalThis, "innerHeight", {
          configurable: true,
          value: originalHeight,
        });
      }
    }
  });

  it("keeps a completed touch long-press open and consumes its synthetic activation click", () => {
    expect(source).toContain("if (touchHoldOpened.current) {");
    expect(source).toContain("event.preventDefault();");
    expect(source).toContain("event.stopPropagation();");
    expect(source).toContain("onClickCapture={handleClickCapture}");
    expect(source).not.toContain("if (touchHoldOpened.current) scheduleHide()");
  });

  it("keeps unavailable controls inert but makes their usage conditions discoverable", () => {
    const targetHtml = renderToStaticMarkup(
      <StudioToolHintTarget
        disabled
        unavailableReason="먼저 편집할 레이어를 선택하세요."
        hint={{ id: "locked-fill", title: "채우기", description: "닫힌 영역을 채웁니다." }}
      >
        <button type="button" disabled>채우기</button>
      </StudioToolHintTarget>
    );
    const bubbleHtml = renderToStaticMarkup(
      <StudioToolHintBubble
        unavailableReason="먼저 편집할 레이어를 선택하세요."
        hint={{ id: "locked-fill", title: "채우기", description: "닫힌 영역을 채웁니다." }}
        anchor={{ left: 10, top: 20, right: 50, bottom: 60, width: 40, height: 40 } as DOMRect}
      />
    );

    expect(targetHtml).toContain('data-studio-tool-hint-target="true"');
    expect(targetHtml).toContain('data-studio-tool-hint-unavailable="true"');
    expect(targetHtml).toContain('aria-disabled="true"');
    expect(targetHtml).toContain('tabindex="0"');
    expect(targetHtml).toContain('disabled=""');
    expect(bubbleHtml).toContain('data-studio-tool-hint-unavailable="true"');
    expect(bubbleHtml).toContain("사용 조건");
    expect(bubbleHtml).toContain("먼저 편집할 레이어를 선택하세요.");
  });

  it("does not add wrapper keyboard semantics to active controls or no-hint fallbacks", () => {
    const activeHtml = renderToStaticMarkup(
      <StudioToolHintTarget
        hint={{ id: "active-pen", title: "펜", description: "자유선을 그립니다." }}
      >
        <button type="button">펜</button>
      </StudioToolHintTarget>
    );
    const fallbackHtml = renderToStaticMarkup(
      <StudioToolHintTarget hint={null} disabled unavailableReason="사용할 수 없습니다.">
        <button type="button" disabled>미지원</button>
      </StudioToolHintTarget>
    );

    expect(activeHtml).not.toContain("aria-disabled");
    expect(activeHtml).not.toContain("tabindex=");
    expect(fallbackHtml).not.toContain("data-studio-tool-hint-target");
    expect(fallbackHtml).not.toContain("aria-disabled");
    expect(fallbackHtml).not.toContain("tabindex=");
  });

  it("opens from keyboard and assistive focus without depending on :focus-visible support", () => {
    expect(source).toContain("Pointer focus is already filtered by pointerdown suppression");
    expect(source).not.toContain('matches(":focus-visible")');
    expect(source).toContain("reveal(true);");
  });
});
