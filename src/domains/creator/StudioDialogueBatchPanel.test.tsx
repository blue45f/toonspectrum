// The repository test environment is Node. Static markup verifies the progressive
// enhancement shell and accessible control contract; queue/controller behavior is
// covered independently without requiring the browser Web Speech API.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  StudioDialogueBatchPanel,
  type StudioDialogueBatchPanelProps,
} from "./StudioDialogueBatchPanel";

import type { DialogueSpeechAdapter, DialogueSpeechVoice } from "./studio-dialogue-read-aloud";

const noop = () => {
  // Static render never invokes event handlers.
};

const PAGES: StudioDialogueBatchPanelProps["pages"] = [
  {
    id: "page-1",
    elements: [
      { id: "bubble-1", type: "bubble", variant: "speech", text: "첫 번째 대사" },
      { id: "text-1", type: "text", text: "두 번째 대사" },
    ],
  },
];

function speechAdapter(supported: boolean): DialogueSpeechAdapter {
  const voices: DialogueSpeechVoice[] = [
    {
      name: "한국어 시스템 음성",
      lang: "ko-KR",
      voiceURI: "test-ko",
      default: true,
      localService: true,
    },
  ];
  return {
    supported,
    getVoices: () => (supported ? voices : []),
    speak: () => supported,
    cancel: () => supported,
    pause: () => supported,
    resume: () => supported,
  };
}

function onlineOnlySpeechAdapter(): DialogueSpeechAdapter {
  return {
    supported: true,
    getVoices: () => [
      {
        name: "온라인 한국어",
        lang: "ko-KR",
        voiceURI: "remote-ko",
        localService: false,
      },
      {
        name: "출처 불명 음성",
        lang: "en-US",
        voiceURI: "unknown-en",
      },
    ],
    speak: () => true,
    cancel: () => true,
    pause: () => true,
    resume: () => true,
  };
}

function renderPanel(
  readAloudAdapter: DialogueSpeechAdapter,
  overrides: Partial<StudioDialogueBatchPanelProps> = {}
): string {
  return renderToStaticMarkup(
    <StudioDialogueBatchPanel
      pages={PAGES}
      currentPageId="page-1"
      selectedId={null}
      onClose={noop}
      onSelectElement={noop}
      onPatchText={noop}
      onApplyReplace={noop}
      readAloudAdapter={readAloudAdapter}
      {...overrides}
    />
  );
}

function hasNestedButton(html: string): boolean {
  const tags = html.match(/<\/?button\b[^>]*>/g) ?? [];
  let depth = 0;
  for (const tag of tags) {
    if (tag.startsWith("</")) depth -= 1;
    else {
      depth += 1;
      if (depth > 1) return true;
    }
  }
  return false;
}

describe("StudioDialogueBatchPanel read-aloud progressive enhancement", () => {
  it("keeps dialogue editing available with a clear unsupported-browser message", () => {
    const html = renderPanel(speechAdapter(false));

    expect(html).toContain("대사 낭독 검수");
    expect(html).toContain("이 브라우저는 음성 낭독을 지원하지 않아요.");
    expect(html).toContain("대사 편집은 그대로 사용할 수 있습니다.");
    expect(html).toContain('aria-label="1페이지 말풍선·말하기 대사 수정"');
    expect(html).not.toContain('aria-label="검색된 대사 전체 낭독"');
    expect(html).not.toContain("대사만 낭독하고 캔버스에서 선택");
  });

  it("renders supported queue controls, voice/rate choices, progress semantics, and 44px targets", () => {
    const html = renderPanel(speechAdapter(true));

    expect(html).toContain('aria-label="검색된 대사 전체 낭독"');
    expect(html).toContain('aria-label="대사 낭독 일시 정지"');
    expect(html).toContain('aria-label="대사 낭독 중지"');
    expect(html).toContain('aria-label="대사 낭독 속도"');
    expect(html).toContain('aria-label="대사 낭독 시스템 음성"');
    expect(html).toContain("속도 1.0×");
    expect(html).toContain("한국어 시스템 음성 · ko-KR");
    expect(html).toContain("기기 내");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-pressed="false"');
    expect(html.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(15);
    expect(html).toContain("검수할 대사 2개");
  });

  it("blocks remote or unknown voices until the author explicitly accepts the OS-service boundary", () => {
    const html = renderPanel(onlineOnlySpeechAdapter());
    const playLabelIndex = html.indexOf('aria-label="검색된 대사 전체 낭독"');
    const playTag = html.slice(html.lastIndexOf("<button", playLabelIndex), html.indexOf(">", playLabelIndex));
    const voiceLabelIndex = html.indexOf('aria-label="대사 낭독 시스템 음성"');
    const voiceTag = html.slice(html.lastIndexOf("<select", voiceLabelIndex), html.indexOf(">", voiceLabelIndex));

    expect(html).toContain('aria-label="온라인 시스템 음성 허용"');
    expect(html).toContain("대사가 운영체제·브라우저의 음성 서비스로 전송될 수 있어요.");
    expect(html).toContain("ToonSpectrum 서버와 AI에는 보내지 않습니다.");
    expect(playTag).toContain('disabled=""');
    expect(voiceTag).toContain('disabled=""');
    expect(html).toContain("기기 내 음성 없음");
    expect(html).not.toContain("온라인 한국어 · ko-KR · 온라인 가능");
  });

  it("keeps each row speaker and canvas-selection action as separate sibling buttons", () => {
    const html = renderPanel(speechAdapter(true));
    const speakerLabel =
      'aria-label="1페이지 말풍선·말하기 대사만 낭독하고 캔버스에서 선택"';
    const selectLabel =
      'aria-label="1페이지 말풍선·말하기 &quot;첫 번째 대사&quot; 캔버스에서 선택"';
    const speakerStart = html.indexOf(speakerLabel);
    const speakerEnd = html.indexOf("</button>", speakerStart);
    const speakerMarkup = html.slice(speakerStart, speakerEnd);

    expect(speakerStart).toBeGreaterThan(-1);
    expect(html).toContain(selectLabel);
    expect(speakerMarkup).toContain("lucide-volume-2");
    expect(speakerMarkup).not.toContain("대사 수정");
    expect(hasNestedButton(html)).toBe(false);
    expect(html.match(/<button\b/g)?.length).toBe(html.match(/<\/button>/g)?.length);
  });

  it("tracks the mobile keyboard inset without allowing negative or fractional layout values", () => {
    expect(renderPanel(speechAdapter(true), { mobileKeyboardInset: 181.6 })).toContain(
      "--studio-mobile-keyboard-inset:182px"
    );
    expect(renderPanel(speechAdapter(true), { mobileKeyboardInset: -20 })).toContain(
      "--studio-mobile-keyboard-inset:0px"
    );
  });
});
