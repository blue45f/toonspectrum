import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioToolHintBubble } from "./StudioToolHint";

describe("StudioToolHint", () => {
  it("renders Magma-style title, body, and shortcut badge", () => {
    const html = renderToStaticMarkup(
      <StudioToolHintBubble
        hint={{
          id: "pen",
          title: "펜",
          description: "자유선으로 그립니다.",
          shortcut: "B",
        }}
        anchor={{ left: 10, top: 20, right: 50, bottom: 60, width: 40, height: 40, x: 10, y: 20, toJSON: () => ({}) } as DOMRect}
      />
    );
    expect(html).toContain('data-studio-tool-hint="true"');
    expect(html).toContain("펜");
    expect(html).toContain("자유선으로 그립니다.");
    expect(html).toContain("B");
    expect(html).toContain('data-studio-kbd="true"');
  });
});
