import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { experienceRoutes } from "./experience.routes";

const FORTUNE_TOOLS = [
  "today",
  "monthly",
  "yearly",
  "zodiac",
  "saju",
  "compatibility",
  "prescription",
  "tarot",
] as const;

describe("experienceRoutes 운세 도구 하위 라우트", () => {
  it("/fortune 허브는 도구 지정 없이 기존 관측소를 연다", () => {
    const hub = experienceRoutes.find((route) => route.path === "/fortune");
    expect(hub?.id).toBe("experience-fortune");
    expect((hub?.element as ReactElement<{ tool?: string }>).props.tool).toBeUndefined();
  });

  it.each(FORTUNE_TOOLS)("/fortune/%s 는 같은 이름의 도구를 지정해 연다", (tool) => {
    const route = experienceRoutes.find((item) => item.path === `/fortune/${tool}`);
    expect(route?.id).toBe(`experience-fortune-${tool}`);
    expect((route?.element as ReactElement<{ tool?: string }>).props.tool).toBe(tool);
  });
});
