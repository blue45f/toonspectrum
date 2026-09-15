import type { ChangeAction, ChangeImpact, ChangeRequest, ScopeRef } from "./types";

function includesKind(scopes: readonly ScopeRef[], kind: ScopeRef["kind"]): boolean {
  return scopes.some((scope) => scope.kind === kind);
}

export function analyzeProductionChangeImpact(input: {
  readonly request: ChangeRequest;
  readonly affectedApprovalIds?: readonly string[];
  readonly touchesDialogue?: boolean;
  readonly touchesCanon?: boolean;
  readonly touchesVisualAsset?: boolean;
  readonly touchesRightsMetadata?: boolean;
  readonly agreementScoped?: boolean;
}): ChangeImpact {
  const actions = new Set<ChangeAction>();
  const processes = new Set<string>();
  const explanation: string[] = [];
  let severity: ChangeImpact["severity"];
  let schedule = false;
  let compensation = false;
  let agreement = false;
  let rights = false;

  if (input.request.stage === "pre-lock") {
    actions.add("acknowledge");
    severity = "low";
    explanation.push("잠금 전 변경이므로 영향받는 초안 branch를 다시 확인하면 됩니다.");
  } else {
    actions.add("rebase");
    actions.add("re-review");
    severity = "medium";
    explanation.push("승인된 입력 revision 이후 변경이므로 downstream 작업의 기준 revision을 다시 고정해야 합니다.");
  }

  if (input.touchesDialogue || input.touchesCanon) {
    processes.add("story");
    processes.add("storyboard");
    processes.add("lettering");
    processes.add("localization");
    actions.add("revise");
  }
  if (input.touchesVisualAsset || includesKind(input.request.changedScopes, "cut") || includesKind(input.request.changedScopes, "layer-group")) {
    processes.add("storyboard");
    processes.add("line-art");
    processes.add("color");
    processes.add("background");
    actions.add("revise");
  }
  if (["post-thumbnail-lock", "in-final-art", "post-joint-proof", "post-publish"].includes(input.request.stage)) {
    schedule = true;
    compensation = true;
    severity = input.request.stage === "post-thumbnail-lock" ? "high" : "critical";
    explanation.push("ThumbnailLock 이후 변경은 이미 생성된 산출물의 재작업과 일정 재산정이 필요합니다.");
  }
  if (input.agreementScoped) {
    agreement = true;
    actions.add("change-order");
    explanation.push("계약 범위 또는 포함 수정 횟수를 벗어나 ChangeOrder 검토가 필요합니다.");
  }
  if (input.touchesRightsMetadata) {
    rights = true;
    actions.add("rights-review");
    processes.add("rights-compliance");
  }
  if (input.request.stage === "post-publish") {
    actions.add("publication-hotfix");
    processes.add("distribution");
    explanation.push("게시본 수정은 기존 게시 snapshot을 보존한 별도 hotfix 및 회수 이력이 필요합니다.");
  }
  if (actions.size === 0) actions.add("no-action");

  return Object.freeze({
    severity,
    actions: Object.freeze([...actions]),
    affectedProcessKeys: Object.freeze([...processes]),
    invalidatedApprovalIds: Object.freeze([...(input.affectedApprovalIds ?? [])]),
    requiresScheduleRebaseline: schedule,
    requiresCompensationReview: compensation,
    requiresAgreementChange: agreement,
    requiresRightsReview: rights,
    explanation: Object.freeze(explanation),
  });
}
