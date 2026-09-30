// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, type ReactNode } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { IllustratedFeatureCard } from "./IllustratedFeatureCard";

afterEach(() => {
  cleanup();
});

function renderCard(node: ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("IllustratedFeatureCard", () => {
  it("이미지·제목·설명·단일 CTA를 렌더한다", () => {
    renderCard(
      <IllustratedFeatureCard
        imageSrc="/images/section-studio-lobby.webp"
        imageAlt="스튜디오 일러스트"
        eyebrow="제작"
        title="스튜디오에서 그리기"
        body="브러시와 레이어로 바로 시작하세요."
        href="/studio/new"
        actionLabel="새 작품 시작"
      />,
    );
    expect(screen.getByAltText("스튜디오 일러스트")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "스튜디오에서 그리기" })).not.toBeNull();
    expect(screen.getByText("브러시와 레이어로 바로 시작하세요.")).not.toBeNull();
    const cta = screen.getByRole("link", { name: /새 작품 시작/ });
    expect(cta.getAttribute("href")).toBe("/studio/new");
  });

  it("카드 안에 링크 CTA는 하나만 둔다 (단일 CTA 원칙)", () => {
    renderCard(
      <IllustratedFeatureCard
        imageSrc="/images/section-market.webp"
        imageAlt="마켓 일러스트"
        title="소재 마켓"
        body="바로 쓸 소재를 찾으세요."
        href="/market"
        actionLabel="마켓 둘러보기"
      />,
    );
    const card = screen.getByRole("heading", { name: "소재 마켓" }).closest(".illustrated-feature-card");
    expect(card?.querySelectorAll("a")).toHaveLength(1);
  });

  it("eager 지정 시 이미지를 즉시 로딩한다", () => {
    renderCard(
      <IllustratedFeatureCard
        imageSrc="/images/hero-main.webp"
        imageAlt="히어로"
        title="제목"
        body="설명"
        href="/"
        actionLabel="시작"
        eager
      />,
    );
    expect(screen.getByAltText("히어로").getAttribute("loading")).toBe("eager");
  });
});
