import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioBubbleToolPopoverBody } from "./StudioBubbleToolPopoverBody";

import type { StudioToolBeltContentProps } from "../StudioToolBeltContent";

function containsNestedButton(html: string): boolean {
  return /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/.test(html);
}

function toolBelt(dialogueScript = ""): StudioToolBeltContentProps {
  return {
    dialogueScript,
    setDialogueBatchOpen: vi.fn(),
    setDialogueScript: vi.fn(),
    setDialogueTranslateOpen: vi.fn(),
    setMenu: vi.fn(),
    stableHandlers: {
      addBubble: vi.fn(),
      addDialogueBubbles: vi.fn(),
      openFeatureTutorial: vi.fn(),
    },
  } as unknown as StudioToolBeltContentProps;
}

describe("StudioBubbleToolPopoverBody library", () => {
  it("renders a searchable, touch-sized, non-nested bubble catalog", () => {
    const html = renderToStaticMarkup(
      <StudioBubbleToolPopoverBody toolBelt={toolBelt()} />,
    );

    expect(html).toContain('data-studio-bubble-library="true"');
    expect(html).toContain('data-studio-bubble-library-search="true"');
    expect(html).toContain('aria-keyshortcuts="/"');
    expect(html).toContain('data-studio-bubble-favorites-filter="true"');
    expect(html).toContain('role="list"');
    expect(html).not.toContain('role="menu"');
    expect(html.match(/data-studio-bubble-variant=/g)).toHaveLength(16);
    expect(html.match(/data-studio-bubble-favorite=/g)).toHaveLength(16);
    expect(html).toContain("min-h-11");
    expect(containsNestedButton(html)).toBe(false);
  });

  it("surfaces the existing local emotion matcher in the production insertion flow", () => {
    const html = renderToStaticMarkup(
      <StudioBubbleToolPopoverBody
        toolBelt={toolBelt("지영: 쉿, 이건 우리 둘만의 비밀이야...")}
      />,
    );

    expect(html).toContain('data-studio-bubble-recommendation="whisper"');
    expect(html).toContain("기기 안에서 분석");
    expect(html).toContain("추천 넣기");
  });
});
