import { describe, expect, it } from "vitest";

import { resolveRouteTitle } from "./route-titles";

const translate = ((key: string) => key) as unknown as Parameters<typeof resolveRouteTitle>[1];

describe("route title resolution", () => {
  it("keeps legacy and canonical showcase URLs on the same browser title", () => {
    expect(resolveRouteTitle("/create", translate)).toBe("route.create");
    expect(resolveRouteTitle("/showcase", translate)).toBe("route.create");
  });

  it("normalizes redirected creation tools before resolving their title", () => {
    expect(resolveRouteTitle("/publishing", translate)).toBe("route.studio");
    expect(resolveRouteTitle("/music", translate)).toBe("route.studio");
    expect(resolveRouteTitle("/brush-lab", translate)).toBe("route.studio");
  });

  it("retains useful dynamic labels for creator pages", () => {
    expect(resolveRouteTitle("/author/%EA%B9%80%ED%9D%AC%EC%A4%80", translate)).toBe("김희준");
  });
});
