import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioVrmPhotoPoseScanner } from "./StudioVrmPhotoPoseScanner";

const source = readFileSync(new URL("./StudioVrmPhotoPoseScanner.tsx", import.meta.url), "utf8");

describe("StudioVrmPhotoPoseScanner", () => {
  it("renders a local-only still-photo workflow with transform controls", () => {
    const html = renderToStaticMarkup(<StudioVrmPhotoPoseScanner onApply={vi.fn(() => true)} />);
    expect(html).toContain("사진 포즈 스캔");
    expect(html).toContain("서버로 보내지 않고");
    expect(html).toContain("사진 회전");
    expect(html).toContain("좌우 반전");
    expect(html).toContain("image/jpeg,image/png,image/webp");
  });

  it("disables file admission when the poser has no usable character", () => {
    const html = renderToStaticMarkup(<StudioVrmPhotoPoseScanner disabled onApply={() => false} />);
    expect(html).toContain("disabled");
    expect(source).toContain('disabled={disabled}');
    expect(source).toContain('if (applied) setCandidate(null)');
  });
});
