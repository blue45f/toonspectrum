/**
 * 툴벨트 전용 기능의 도달성 계약.
 *
 * 배경(`docs/perf/heavy-feature-findings.md` §4-1): 툴벨트 호스트는 데스크톱에서 `lg:hidden`,
 * 모바일 몰입 모드에서 `mobileImmersive && "max-lg:hidden"`이다. 두 조건이 겹쳐 1600×1000 /
 * 900×1000 / 430×932 세 뷰포트 모두에서 `display:none`이 되고, 벨트에만 트리거가 있던 검수·
 * 미리보기 7종이 어느 폭에서도 클릭 불가였다. 가시 컨트롤 336개 전수 스윕에서도 발견되지 않았다.
 *
 * 여기서 고정하는 불변식은 리포트가 제안한 것 그대로다:
 *   "각 뷰포트에서 벨트 호스트가 보이거나, 벨트 전용 액션마다 가시 대체 진입점이 존재한다."
 * 둘 중 하나라도 성립하지 않으면 실패한다 — 벨트를 다시 켜는 방향의 수정도, 대체 진입점을
 * 유지하는 방향의 수정도 모두 통과시키되, 둘 다 없는 상태로 조용히 되돌아가는 것만 막는다.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { STUDIO_PROJECT_REVIEW_ACTION_IDS } from "./studio-project-review-actions";

function source(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

const page = source("./StudioPage.tsx");
const menubar = source("./StudioMenubarContent.tsx");
const reviewActions = source("./StudioProjectReviewActions.tsx");

/** `<StudioToolBelt …>` 여는 태그 전체 (호스트의 뷰포트 게이트가 여기에 있다). */
function toolBeltHostTag(): string {
  const start = page.indexOf("<StudioToolBelt\n");
  expect(start, "StudioToolBelt 호스트를 찾지 못했습니다").toBeGreaterThan(-1);
  const end = page.indexOf(">", start);
  return page.slice(start, end);
}

const beltHost = toolBeltHostTag();
const beltHiddenOnDesktop = /"lg:hidden"/u.test(beltHost);
const beltHiddenOnMobileImmersive = /mobileImmersive\s*&&\s*"max-lg:hidden"/u.test(beltHost);
/** 몰입 모드를 끄지 않은 기본 상태에서 벨트가 보이는 폭이 하나라도 있는가. */
const beltVisibleAtSomeViewport = !(beltHiddenOnDesktop && beltHiddenOnMobileImmersive);

const RESTORED_HANDLERS = [
  "toggleAnimationTimeline",
  "openTimelapse",
  "openStoryboardGrid",
  "openScrollPreview",
  "openContinuityCheck",
  "toggleDocumentComments",
  "openPageReview",
] as const;

describe("툴벨트 전용 기능 도달성", () => {
  it("벨트가 전 뷰포트에서 숨겨진다면 검수 7종은 벨트 밖 진입점을 가져야 한다", () => {
    const hasAlternativeOwner = menubar.includes("<StudioProjectReviewActions");
    expect(
      beltVisibleAtSomeViewport || hasAlternativeOwner,
      "벨트도 숨겨져 있고 대체 진입점도 없습니다 — 7종이 다시 도달 불가가 됩니다",
    ).toBe(true);
  });

  it.each(STUDIO_PROJECT_REVIEW_ACTION_IDS)(
    "%s 는 안정적인 셀렉터를 가진 진입점으로 선언돼 있다",
    (actionId) => {
      expect(reviewActions).toContain(`id: "${actionId}",`);
      expect(reviewActions).toContain("data-studio-project-action={action.id}");
    },
  );

  it("대체 진입점 호스트에는 벨트를 죽였던 뷰포트 게이트가 없다", () => {
    const dialogStart = menubar.indexOf('data-studio-project-actions-menu="true"');
    const mountPoint = menubar.indexOf("<StudioProjectReviewActions");
    expect(dialogStart).toBeGreaterThan(-1);
    expect(mountPoint).toBeGreaterThan(dialogStart);

    const dialog = menubar.slice(dialogStart, mountPoint);
    expect(dialog).not.toMatch(/\blg:hidden\b/u);
    expect(dialog).not.toMatch(/\bmax-lg:hidden\b/u);
    expect(dialog).not.toContain("mobileImmersive");
    expect(dialog).not.toContain("inert");
  });

  it("진단이 측정한 세 뷰포트 중 최소 하나에서 대체 진입점이 실제로 보인다", () => {
    // 진단 하네스가 실제로 조작한 폭들(docs/perf/heavy-feature-findings.md).
    const measuredViewports = [1_600, 900, 430] as const;
    const tailwindSm = 640;

    const triggerStart = menubar.indexOf("<div ref={projectActionsRef}");
    expect(triggerStart).toBeGreaterThan(-1);
    const triggerHost = menubar.slice(triggerStart, menubar.indexOf(">", triggerStart));
    const hiddenBelowSm = triggerHost.includes("max-sm:hidden");
    expect(triggerHost).not.toMatch(/\blg:hidden\b/u);

    const reachableWidths = measuredViewports.filter(
      (width) => !hiddenBelowSm || width >= tailwindSm,
    );
    expect(reachableWidths.length).toBeGreaterThan(0);
    expect(reachableWidths).toContain(1_600);
  });

  it("폰 폭에서 벨트를 숨기는 조건은 몰입 모드 하나뿐이다 — 430px의 탈출구", () => {
    // 430px에서는 프로젝트 시트가 `max-sm:hidden`이라, 몰입 해제로 벨트를 되살리는 경로가
    // 남아 있어야 한다. 무조건 `max-lg:hidden`이 하나라도 붙으면 그 탈출구가 사라진다.
    const narrowGates = (beltHost.match(/"max-lg:hidden"/gu) ?? []).length;
    const immersiveGates =
      (beltHost.match(/mobileImmersive\s*&&\s*"max-lg:hidden"/gu) ?? []).length;

    expect(narrowGates).toBe(immersiveGates);
    expect(menubar).toContain("changeMobileImmersiveMode");
  });

  it("StudioPage가 7종 핸들러를 메뉴바 stable handler 백으로 넘긴다", () => {
    const bagStart = page.indexOf(
      "useStudioStableHandlers<StudioMenubarContentHandlers>({",
    );
    expect(bagStart).toBeGreaterThan(-1);
    const bag = page.slice(bagStart, page.indexOf("\n  });", bagStart));

    for (const handler of RESTORED_HANDLERS) {
      expect(bag, `${handler} 배선이 사라졌습니다`).toContain(`${handler}:`);
    }
  });

  it("복구된 진입점은 벨트와 같은 패널 상태를 연다", () => {
    // 새 상태를 만들지 않고 기존 패널 상태를 그대로 토글해야 한다 — 두 진입점이 갈라지면
    // 한쪽에서 연 패널을 다른 쪽에서 닫지 못하는 유령 상태가 생긴다.
    for (const setter of [
      "setTimelineOpen((open) => !open)",
      "setTimelapseOpen(true)",
      "setStoryboardGridOpen(true)",
      "setScrollPreviewOpen(true)",
      "setContinuityOpen(true)",
      "setCommentsOpen((open) => !open)",
      "setPageReviewOpen(true)",
    ]) {
      expect(page).toContain(setter);
    }
  });
});
