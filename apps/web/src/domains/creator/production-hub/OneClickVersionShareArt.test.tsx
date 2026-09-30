// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EmptyVersionsArt,
  VersionFlowDiagram,
  VersionThumbnailArt,
} from "./OneClickVersionShareArt";

describe("OneClickVersionShareArt", () => {
  it("같은 스냅샷 ID는 항상 같은 썸네일 아트를 만든다", () => {
    const { container: first } = render(<VersionThumbnailArt snapshotId="snapshot-1" name="v1" />);
    const { container: second } = render(<VersionThumbnailArt snapshotId="snapshot-1" name="v1" />);
    expect(first.innerHTML).toBe(second.innerHTML);
  });

  it("다른 스냅샷 ID는 다른 썸네일 아트를 만든다", () => {
    const { container: first } = render(<VersionThumbnailArt snapshotId="snapshot-1" name="v1" />);
    const { container: second } = render(<VersionThumbnailArt snapshotId="snapshot-2" name="v1" />);
    expect(first.innerHTML).not.toBe(second.innerHTML);
  });

  it("썸네일에 버전 배지 라벨이 들어간다", () => {
    const { container } = render(<VersionThumbnailArt snapshotId="snapshot-9" name="v3" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.textContent).toContain("v3");
  });

  it("빈 상태 일러스트가 렌더된다", () => {
    const { container } = render(<EmptyVersionsArt />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("플로우 도식이 전달받은 라벨을 그린다", () => {
    const { container } = render(
      <VersionFlowDiagram labels={["작업본", "버전 저장", "링크 공유"]} />,
    );
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.textContent).toContain("작업본");
    expect(container.textContent).toContain("버전 저장");
    expect(container.textContent).toContain("링크 공유");
  });
});
