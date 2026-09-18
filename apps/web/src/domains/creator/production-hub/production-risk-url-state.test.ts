import { describe, expect, it } from "vitest";

import {
  normalizeProductionRiskSearchParams,
  parseProductionRiskUrlState,
  serializeProductionRiskUrlState,
} from "./production-risk-url-state";

const options = {
  episodeIds: ["episode-11", "episode-12"],
  ownerAssignmentIds: ["assignment-a", "assignment-b"],
  ruleKeys: ["task.overdue", "task.forecast-slip"],
  riskIds: ["risk-a", "risk-b"],
} as const;

describe("production risk URL state", () => {
  it("round-trips multi filters, selection, detail tab and matrix cell", () => {
    const state = parseProductionRiskUrlState(new URLSearchParams(
      "q=%EC%84%A0%ED%99%94&severity=critical,high&status=open,mitigating"
      + "&category=schedule,capacity&source=automatic"
      + "&episode=episode-11,project&owner=assignment-a,unassigned"
      + "&rule=task.overdue,task.forecast-slip"
      + "&view=matrix&risk=risk-a&tab=response&matrix=4-5",
    ), options);

    expect(state).toMatchObject({
      search: "선화",
      severities: ["critical", "high"],
      statuses: ["open", "mitigating"],
      categories: ["schedule", "capacity"],
      source: "automatic",
      episodeIds: ["episode-11", "project"],
      ownerAssignmentIds: ["assignment-a", "unassigned"],
      ruleKeys: ["task.overdue", "task.forecast-slip"],
      view: "matrix",
      selectedRiskId: "risk-a",
      detailTab: "response",
      matrixCell: { probability: 4, impact: 5 },
    });

    expect(serializeProductionRiskUrlState(state).toString()).toBe(
      "q=%EC%84%A0%ED%99%94&severity=critical%2Chigh&status=open%2Cmitigating"
      + "&category=schedule%2Ccapacity&source=automatic"
      + "&episode=episode-11%2Cproject&owner=assignment-a%2Cunassigned"
      + "&rule=task.overdue%2Ctask.forecast-slip"
      + "&view=matrix&risk=risk-a&tab=response&matrix=4-5",
    );
  });

  it("drops invalid values while preserving unrelated query parameters", () => {
    const normalized = normalizeProductionRiskSearchParams(new URLSearchParams(
      "surface=production&severity=critical,invalid&episode=missing,episode-12"
      + "&owner=missing,assignment-b&rule=missing,task.overdue&view=unknown&risk=missing&tab=history&matrix=9-9",
    ), options);

    expect(normalized.get("surface")).toBe("production");
    expect(normalized.get("severity")).toBe("critical");
    expect(normalized.get("episode")).toBe("episode-12");
    expect(normalized.get("owner")).toBe("assignment-b");
    expect(normalized.get("rule")).toBe("task.overdue");
    expect(normalized.has("view")).toBe(false);
    expect(normalized.has("risk")).toBe(false);
    expect(normalized.has("tab")).toBe(false);
    expect(normalized.has("matrix")).toBe(false);
  });

  it("removes matrix and tab state when their owning view or selection is absent", () => {
    const state = parseProductionRiskUrlState(
      new URLSearchParams("view=episode&matrix=4-4&tab=response"),
      options,
    );

    expect(state.matrixCell).toBeNull();
    expect(state.detailTab).toBe("overview");
    expect(serializeProductionRiskUrlState(state).toString()).toBe("view=episode");
  });
});
