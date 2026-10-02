// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { failVisible } from "../../contracts";

import { CatalogInvariantError } from "./catalog-registry";
import { CompositionFailure, describeCompositionError } from "./CompositionFailure";

afterEach(cleanup);

describe("app/shell/CompositionFailure", () => {
  it("카탈로그 불변식 오류는 위반 목록을, 일반 오류는 메시지를 그대로 보여준다", () => {
    const error = new CatalogInvariantError([failVisible("catalog-slot-min", "슬롯 hair의 프리셋이 부족합니다.", undefined, 0)]);
    render(<CompositionFailure error={error} />);
    expect(screen.getByRole("alert").textContent).toContain("프리셋 카탈로그 불변식 위반");
    expect(screen.getByText("[catalog-slot-min] 슬롯 hair의 프리셋이 부족합니다.")).toBeTruthy();
    expect(describeCompositionError(new TypeError("boom")).title).toBe("앱 조립 실패: TypeError");
    expect(describeCompositionError("문자열").lines).toEqual(["문자열"]);
  });
});
