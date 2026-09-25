// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// 이 검증은 실제 렌더 결과를 비교한다. 모듈 변환 시간은 UI의 1초 조회 제한과 분리한다.
import "../export/studio-svg-export";

import { STUDIO_ILLUSTRATION_SCENE_TEMPLATES } from "./studio-illustration-scene-templates";
import { summarizeStudioSceneTemplate } from "./studio-scene-template-summary";
import { StudioSceneTemplateMap } from "./StudioSceneTemplateMap";

afterEach(cleanup);

describe("생성 배경 템플릿의 실제 작화 미리보기", () => {
  it("빈 구성도 대신 동일한 배경 이미지와 잘리지 않은 대사를 내보내기 렌더러로 표시한다", async () => {
    const template = STUDIO_ILLUSTRATION_SCENE_TEMPLATES[0];
    const summary = summarizeStudioSceneTemplate(template);
    const { container } = render(<StudioSceneTemplateMap summary={summary} label={template.label} />);
    await screen.findByRole("img", { name: `${template.label} · 배경과 편집 가능한 대사 미리보기` });
    expect(container.querySelectorAll("image")).toHaveLength(summary.frames);
    for (const image of container.querySelectorAll("image")) {
      expect(image.getAttribute("href")).toContain("autumn-alley-morning.png");
    }
    expect(container.textContent).toContain("이 골목은 그대로네.");
    expect(container.textContent).toContain("익숙한 길, 낯선 계절.");
  });

  it("나란히 열린 미리보기의 클립 ID가 충돌하지 않는다", async () => {
    const first = summarizeStudioSceneTemplate(STUDIO_ILLUSTRATION_SCENE_TEMPLATES[0]);
    const second = summarizeStudioSceneTemplate(STUDIO_ILLUSTRATION_SCENE_TEMPLATES[1]);
    const { container } = render(<><StudioSceneTemplateMap summary={first} label="첫 장면" /><StudioSceneTemplateMap summary={second} label="둘째 장면" /></>);
    await waitFor(() => expect(container.querySelectorAll("[data-studio-illustration-scene-preview]")).toHaveLength(2));
    const ids = [...container.querySelectorAll("[id]")].map((node) => node.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
