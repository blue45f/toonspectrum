import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { studioBrushDynamicsPresetSettings } from "./studio-brush-dynamics";
import { MAX_BRUSHES } from "./studio-brush-library";
import { StudioBrushLibraryPanel } from "./StudioBrushLibraryPanel";

import type { StudioBrushSnapshot, StudioSavedBrush } from "./studio-brush-library";

const snapshot: StudioBrushSnapshot = {
  brushId: "pen",
  strokeWidth: 6,
  brushOpacity: 1,
  color: "#ff6600",
  stabilizer: 6,
  stabilizerMode: "adaptive",
  postCorrection: 4,
  preserveCorners: true,
  pressureCurve: 1,
      pressureMinSize: 0,
  useVelocityPressure: true,
  velocitySensitivity: 0.65,
  tiltEnabled: true,
  tipAngle: -30,
  tipRoundness: 0.24,
  brushDynamics: studioBrushDynamicsPresetSettings("ink-particle"),
  stampTuning: null,
};

const saved: StudioSavedBrush = {
  id: "saved-1",
  name: "주력 펜",
  createdAt: 1,
  updatedAt: 2,
  pinned: true,
  lastUsedAt: 3,
  ...snapshot,
};

describe("StudioBrushLibraryPanel", () => {
  it("controlled 목록과 고정·복제·이름·내보내기·공유·삭제 액션을 렌더한다", () => {
    const html = renderToStaticMarkup(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[saved]}
        activeBrushId={saved.id}
        onBrushesChange={() => undefined}
        onApplyBrush={() => undefined}
        onBrushDeleted={() => undefined}
      />
    );
    expect(html).toContain('data-studio-brush-library-scope="saved"');
    expect(html).toContain('data-studio-brush-surface-role="user-library-management"');
    expect(html).toContain('aria-label="내 브러시"');
    expect(html).toContain("내 브러시 · 사용자 설정");
    expect(html).toContain("저장·가져오기·공유·재적용");
    expect(html).toContain(`1/${MAX_BRUSHES}`);
    expect(html).toContain('aria-label="브러시 설정 또는 Photoshop ABR 가져오기"');
    expect(html).toContain('accept=".json,.abr,application/json,application/octet-stream,application/x-photoshop"');
    expect(html).toContain("주력 펜 고정 해제");
    expect(html).toContain("주력 펜 복제");
    expect(html).toContain("주력 펜 이름 변경");
    expect(html).toContain("주력 펜 내보내기");
    expect(html).toContain("주력 펜 브러시 공유");
    expect(html).toContain("주력 펜 브러시 삭제");
    expect(html).toContain("<details");
    expect(html).toContain("관리 · 덮어쓰기, 복제, 공유");
    expect(html).not.toContain("<details open");
    expect(html).toContain("grid-cols-3");
    expect(html).toContain("sm:grid-cols-6");
    expect(html).toContain('aria-label="주력 펜 브러시 적용, 펜(매끈), 6px, 100퍼센트"');
    expect(html).toContain('aria-pressed="true"');
  });

  it("모바일 조작 영역과 투명 색상용 명암 미리보기를 유지한다", () => {
    const html = renderToStaticMarkup(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[saved]}
        onBrushesChange={() => undefined}
        onApplyBrush={() => undefined}
        onBrushDeleted={() => undefined}
      />
    );
    expect(html).toContain("min-h-11");
    expect(html).toContain("size-11");
    expect(html).toContain("min-h-12");
    expect(html).toContain(
      "bg-[linear-gradient(135deg,#f8fafc_0_50%,#242936_50%_100%)]"
    );
    expect(html).toContain("background:#ff6600");
    expect(html).toContain("opacity:1");
  });

  it("빈 상태는 모바일에서도 저장 브러시를 재사용할 수 있음을 안내한다", () => {
    const html = renderToStaticMarkup(
      <StudioBrushLibraryPanel
        currentSnapshot={snapshot}
        brushes={[]}
        onBrushesChange={() => undefined}
        onApplyBrush={() => undefined}
        onBrushDeleted={() => undefined}
      />
    );
    expect(html).toContain("모바일에서도 바로 꺼내 쓸 수 있어요");
  });
});
