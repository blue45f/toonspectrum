// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Compass, Layers } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SectionTabs, SectionTabsFooter } from "./SectionTabs";
import { sectionFromHash, useSectionTabHash, type SectionTab } from "./section-tabs";

const IDS = ["one", "two", "three"] as const;
type Id = (typeof IDS)[number];

const TABS: readonly SectionTab<Id>[] = [
  { id: "one", label: "첫째", icon: Compass },
  { id: "two", label: "둘째", icon: Layers, count: 3 },
  { id: "three", label: "셋째", icon: Compass },
];

function Harness({ onNavigate }: { readonly onNavigate?: (id: Id) => void }) {
  const { active, select } = useSectionTabHash(IDS, "one", onNavigate);
  return (
    <div>
      <SectionTabs
        label="단계"
        tabs={TABS}
        active={active}
        onSelect={select}
        tabId={(id) => `tab-${id}`}
        panelId={(id) => `panel-${id}`}
        numbered
        countLabel=" · 항목 "
      />
      {TABS.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={active !== tab.id}>
          <input aria-label={`${tab.label} 입력`} />
        </div>
      ))}
      <SectionTabsFooter label="이전·다음" tabs={TABS} active={active} onSelect={select} previousLabel="이전" nextLabel="다음" />
    </div>
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(cleanup);

describe("sectionFromHash", () => {
  it("알려진 id만 돌려주고, 모르는 값·깨진 인코딩은 null이다", () => {
    expect(sectionFromHash(IDS, "#two")).toBe("two");
    expect(sectionFromHash(IDS, "two")).toBe("two");
    expect(sectionFromHash(IDS, "#nope")).toBeNull();
    expect(sectionFromHash(IDS, "")).toBeNull();
    expect(sectionFromHash(IDS, "#%E0%A4%A")).toBeNull();
  });
});

describe("SectionTabs", () => {
  it("탭 패턴과 순번·개수 배지를 갖추고, 선택된 탭만 Tab 순서에 둔다", () => {
    render(<Harness />);
    const list = screen.getByRole("tablist", { name: "단계" });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs[1]?.getAttribute("aria-controls")).toBe("panel-two");
    // 순번은 장식이고, 개수는 화면낭독기용 문구와 함께 이름에 들어간다.
    // (jsdom의 이름 계산은 중첩 요소 안쪽 공백을 잘라 "둘째· 항목3"으로 만들므로 공백 차이는 허용한다.)
    expect(within(list).getByRole("tab", { name: /^둘째\s*·\s*항목\s*3$/u })).toBeTruthy();
    expect(within(list).getByRole("tab", { name: "첫째" })).toBeTruthy();
    expect(tabs[0]?.textContent).toContain("01");
  });

  it("방향키·Home·End로 이동하고 초점을 따라 보내며 해시를 남긴다", () => {
    render(<Harness />);
    const first = screen.getByRole("tab", { name: "첫째" });
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("셋째");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "셋째" }));
    expect(window.location.hash).toBe("#three");

    fireEvent.keyDown(screen.getByRole("tab", { selected: true }), { key: "Home" });
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("첫째");
    fireEvent.keyDown(screen.getByRole("tab", { selected: true }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("둘째");
    fireEvent.keyDown(screen.getByRole("tab", { selected: true }), { key: "x" });
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("둘째");
  });

  it("선택한 패널만 보이고, 숨겨진 패널의 입력은 단계를 오가도 남는다", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("첫째 입력"), { target: { value: "초안" } });
    fireEvent.click(screen.getByRole("tab", { name: /둘째/u }));
    // 숨긴 패널은 화면낭독기·접근성 트리에서 빠지지만 DOM에는 남아 입력값을 지킨다.
    expect(screen.queryByRole("textbox", { name: "첫째 입력" })).toBeNull();
    expect(screen.getByLabelText("첫째 입력").closest("[role=tabpanel]")?.hasAttribute("hidden")).toBe(true);
    expect(screen.getByRole("tabpanel").id).toBe("panel-two");
    fireEvent.click(screen.getByRole("tab", { name: "첫째" }));
    expect(screen.getByRole("textbox", { name: "첫째 입력" })).toHaveProperty("value", "초안");
  });

  it("이전·다음 이동은 양 끝에서 한쪽만 보인다", () => {
    render(<Harness />);
    const footer = () => screen.getByRole("navigation", { name: "이전·다음" });
    expect(within(footer()).queryByRole("button", { name: /^이전/u })).toBeNull();
    fireEvent.click(within(footer()).getByRole("button", { name: "다음 · 둘째" }));
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("둘째");
    fireEvent.click(within(footer()).getByRole("button", { name: "다음 · 셋째" }));
    expect(within(footer()).queryByRole("button", { name: /^다음/u })).toBeNull();
    fireEvent.click(within(footer()).getByRole("button", { name: "이전 · 둘째" }));
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("둘째");
  });
});

describe("useSectionTabHash", () => {
  it("처음 주소의 해시로 시작한다", () => {
    window.history.replaceState(null, "", "/#three");
    render(<Harness />);
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("셋째");
  });

  it("해시가 바뀌면 그 탭을 열고 알리며, 모르는 해시는 무시한다", async () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    act(() => {
      window.location.hash = "#two";
    });
    await waitFor(() => expect(screen.getByRole("tab", { selected: true }).textContent).toContain("둘째"));
    expect(onNavigate).toHaveBeenCalledWith("two");

    onNavigate.mockClear();
    act(() => {
      window.location.hash = "#unknown";
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("둘째");
    expect(onNavigate).not.toHaveBeenCalled();

    // 탭을 눌러 바꾼 것은 해시 이동이 아니므로 알리지 않는다.
    fireEvent.click(screen.getByRole("tab", { name: "첫째" }));
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
