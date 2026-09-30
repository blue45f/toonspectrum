// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FortuneBirthGate } from "./FortuneBirthGate";

afterEach(() => {
  cleanup();
});

describe("FortuneBirthGate", () => {
  it("월간 게이트에 단계 도식과 핵심 입력이 있다", () => {
    render(
      <FortuneBirthGate
        kind="monthly"
        birthDate=""
        birthTime=""
        onBirthDateChange={() => {}}
        onBirthTimeChange={() => {}}
      />
    );
    expect(screen.getByText("이번 달의 흐름을 읽어드릴게요")).not.toBeNull();
    expect(screen.getByLabelText(/생년월일/)).not.toBeNull();
    expect(screen.getByLabelText(/태어난 시간/)).not.toBeNull();
    // 3단계 도식
    expect(screen.getByText("생년월일 입력")).not.toBeNull();
    expect(screen.getByText("월운·세운 계산")).not.toBeNull();
    expect(screen.getByText("별빛 리빌")).not.toBeNull();
  });

  it("연간 게이트에 연간 문구가 있다", () => {
    render(
      <FortuneBirthGate
        kind="yearly"
        birthDate=""
        birthTime=""
        onBirthDateChange={() => {}}
        onBirthTimeChange={() => {}}
      />
    );
    expect(screen.getByText("올해의 큰 흐름을 보여드릴게요")).not.toBeNull();
  });

  it("생년월일 변경 콜백이 호출된다", () => {
    const onBirthDateChange = vi.fn();
    render(
      <FortuneBirthGate
        kind="monthly"
        birthDate=""
        birthTime=""
        onBirthDateChange={onBirthDateChange}
        onBirthTimeChange={() => {}}
      />
    );
    fireEvent.change(screen.getByLabelText(/생년월일/), { target: { value: "1990-01-01" } });
    expect(onBirthDateChange).toHaveBeenCalledWith("1990-01-01");
  });
});
