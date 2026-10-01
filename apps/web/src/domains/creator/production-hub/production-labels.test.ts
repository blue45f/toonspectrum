import { describe, expect, it } from "vitest";

import { productionActivityLabel, submissionStatusLabel } from "./production-labels";

const ko = (text: string) => text;
const en = (_ko: string, text: string) => text;

describe("제작 관리 이름표", () => {
  it("활동 기록의 명령 이름을 사람이 읽는 말로 바꾼다", () => {
    expect(productionActivityLabel("upsert-clarification", ko)).toBe("질문·답변 저장");
    expect(productionActivityLabel("record-review-decision", ko)).toBe("검수 결정 기록");
    expect(productionActivityLabel("project-created", en)).toBe("Project created");
  });

  it("모르는 기록은 숨기지 않고 원문 그대로 보여 준다", () => {
    expect(productionActivityLabel("future-command", ko)).toBe("future-command");
    expect(productionActivityLabel("toString", ko)).toBe("toString");
  });

  it("제출본 상태를 한국어·영어 이름으로 보여 준다", () => {
    expect(submissionStatusLabel("in-review", ko)).toBe("검수 중");
    expect(submissionStatusLabel("changes-requested", en)).toBe("Changes requested");
  });
});
