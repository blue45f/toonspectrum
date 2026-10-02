// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioHybridDccIntro } from "./StudioHybridDccIntro";

afterEach(cleanup);

describe("StudioHybridDccIntro", () => {
  it("answers what, when and why in plain words before any button", () => {
    render(<StudioHybridDccIntro onStart={vi.fn()} />);

    const purpose = document.querySelector<HTMLElement>("[data-studio-hybrid-dcc-intro-purpose]");
    expect(purpose).not.toBeNull();
    const terms = [...purpose!.querySelectorAll("dt")].map((node) => node.textContent);
    expect(terms).toEqual(["무엇", "언제", "왜"]);
    expect(within(purpose!).getByText(/컷에 자주 나오는 소품과 배경을 3D로 만드는 작업대/u)).toBeTruthy();
    // 업계 용어를 앞세우지 않는다: 제목과 목적 문장에는 DCC·CAD·Hybrid가 나오지 않는다.
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.textContent).not.toMatch(/DCC|CAD|Hybrid/u);
    expect(purpose!.textContent).not.toMatch(/DCC|Hybrid/u);
  });

  it("walks three numbered steps and labels the picture as an example", () => {
    render(<StudioHybridDccIntro onStart={vi.fn()} />);

    const steps = screen.getByRole("list", { name: "세 단계 사용법" });
    const items = within(steps).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain("시작하기");
    expect(items[1]?.textContent).toContain("다듬기");
    expect(items[2]?.textContent).toContain("컷으로 보내기");

    // 실제 렌더가 아닌 코드 그림이므로 예시임을 화면에 밝힌다.
    expect(screen.getByRole("img", { name: /예시 그림/u })).toBeTruthy();
    expect(screen.getByText(/예시 그림입니다\. 실제 결과는 장면과 카메라 설정에 따라 달라집니다/u)).toBeTruthy();
  });

  it("starts from a cube, a classroom set or an import file", () => {
    const onStart = vi.fn();
    render(<StudioHybridDccIntro onStart={onStart} />);

    fireEvent.click(screen.getByRole("button", { name: "큐브로 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "교실 세트로 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "3D 파일 가져오기" }));
    expect(onStart.mock.calls.map(([kind]) => kind)).toEqual(["cube", "room", "import"]);
  });

  it("disables every start button while an edit is running", () => {
    const onStart = vi.fn();
    render(<StudioHybridDccIntro busy onStart={onStart} />);

    for (const name of ["큐브로 시작", "교실 세트로 시작", "3D 파일 가져오기"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled, name).toBe(true);
    }
  });

  it("tells people about browser support and where work is saved", () => {
    render(<StudioHybridDccIntro onStart={vi.fn()} />);

    const environment = screen.getByRole("list", { name: "사용 환경과 저장" });
    expect(environment.textContent).toContain("WebGL");
    expect(environment.textContent).toContain("하드웨어 가속");
    expect(environment.textContent).toContain("태블릿·데스크톱");
    expect(environment.textContent).toMatch(/클라우드 백업 아님/u);
  });

  it("shows a preparing note instead of start buttons while the workbench loads", () => {
    render(<StudioHybridDccIntro />);

    expect(screen.queryByRole("button", { name: "큐브로 시작" })).toBeNull();
    expect(screen.getByText(/3D 작업대를 준비하고 있습니다/u)).toBeTruthy();
    // 닫을 대상이 없으면 닫기 버튼도 없다.
    expect(screen.queryByRole("button", { name: "안내 닫기" })).toBeNull();
  });

  it("closes only when the host gives it a dismiss handler", () => {
    const onDismiss = vi.fn();
    render(<StudioHybridDccIntro id="guide" onStart={vi.fn()} onDismiss={onDismiss} />);

    expect(screen.getByRole("region", { name: /웹툰 배경·소품을 3D로 한 번 만들고/u }).id).toBe("guide");
    fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
