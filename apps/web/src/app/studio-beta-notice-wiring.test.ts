import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const gate = readFileSync(
  new URL("../domains/creator/StudioBetaNoticeGate.tsx", import.meta.url),
  "utf8",
);
const storage = readFileSync(
  new URL("../domains/creator/studio-beta-notice-storage.ts", import.meta.url),
  "utf8",
);

describe("Studio beta notice wiring", () => {
  it("loads the notice only for Studio routes and outside hidden chrome overlays", () => {
    expect(app).toContain("const StudioBetaNoticeGate = lazy(");
    expect(app).toContain("{isStudioRoutePathname(pathname) ? (");
    expect(app).toContain("<StudioBetaNoticeGate pathname={pathname} />");
    expect(app.indexOf("<StudioBetaNoticeGate pathname={pathname} />")).toBeLessThan(
      app.indexOf("<AppShell"),
    );
  });

  it("requires acknowledgement and versions the persistent notice", () => {
    expect(gate).toContain("onEscapeKeyDown={(event) => event.preventDefault()}");
    expect(gate).toContain("onPointerDownOutside={(event) => event.preventDefault()}");
    expect(gate).toContain("저장 데이터 초기화 가능");
    expect(gate).toContain("기능·정책 수시 변경");
    expect(gate).toContain("중요한 작업은 별도 백업");
    expect(storage).toContain("STUDIO_BETA_NOTICE_REVISION");
    expect(storage).toContain("STUDIO_BETA_NOTICE_STORAGE_KEY");
  });
});
