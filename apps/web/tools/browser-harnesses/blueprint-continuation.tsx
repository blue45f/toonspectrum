import { useState } from "react";
import { createRoot } from "react-dom/client";

import { persistSession } from "../../src/compat/auth-session-state";
import { SessionContext } from "../../src/compat/auth-session-store";
import { createProductionDemoProject } from "../../src/domains/creator/production-hub/production-demo";
import { ProductionAutomationExecutionControl } from "../../src/domains/creator/production-hub/ProductionAutomationExecutionControl";
import { ProductionNotificationDigest } from "../../src/domains/creator/production-hub/ProductionNotificationDigest";
import { ProductionNotificationPolicyEditor } from "../../src/domains/creator/production-hub/ProductionNotificationPolicyEditor";
import { StudioReviewPolicyPanel } from "../../src/domains/creator/virtual-space/StudioReviewPolicyPanel";

import type { ProductionClientCommand } from "../../src/domains/creator/production-hub/production-api";
import type { StudioVirtualSpaceVerifiedReview } from "../../src/domains/creator/virtual-space/studio-virtual-space-review-invitation";
import type { ProductionProjectAggregate } from "@toonspectrum/core/production";
import "../../src/styles/globals.css";

persistSession({ user: { id: "fixture-artist" }, token: null });
const base = createProductionDemoProject(), assignmentId = base.assignments[0]!.id;
const verified = { subject: { schemaVersion: 1, projectId: "fixture-graph", workId: "fixture-work", reviewId: "fixture-review", artifactId: "fixture-artifact", revisionId: "fixture-revision", rootGraphHash: "a".repeat(64) }, review: { status: "open", comments: [], reviewerIds: ["fixture-artist"] } } as unknown as StudioVirtualSpaceVerifiedReview;
function Fixture() {
  const [aggregate, setAggregate] = useState<ProductionProjectAggregate>(() => ({ ...base, notificationPolicies: [], notifications: [], automationRules: [{
    id: "fixture-rule", projectId: base.projectId, name: "테스트 작업 확인", trigger: "manual", conditions: [],
    actions: [{ type: "notify", assignmentIds: [assignmentId], urgency: "warning", message: "확인한 업무 알림" }],
    enabled: true, failurePolicy: "require-review", revision: 1, lastEvaluatedAt: null, createdByAssignmentId: assignmentId, updatedAt: new Date().toISOString(),
  }] }));
  const [commands, setCommands] = useState<string[]>([]), [reviewChanges, setReviewChanges] = useState(0);
  const execute = async (command: ProductionClientCommand) => {
    if (command.type === "upsert-operations-record" && command.record.kind === "notification-policy") {
      const value = command.record.value;
      setAggregate((a) => ({ ...a, revision: a.revision + 1, notificationPolicies: [value] }));
    } else if (command.type === "apply-automation-execution") {
      setAggregate((a) => ({ ...a, revision: a.revision + 1, tasks: [...a.tasks, ...command.tasks], notifications: [...(a.notifications ?? []), ...command.notifications], automationRules: command.evaluatedRules }));
    } else throw new Error("Unexpected fixture command");
    setCommands((prior) => [...prior, command.type]);
  };
  return <main className="mx-auto max-w-5xl space-y-5 p-4 text-fg">
    <h1 className="text-xl font-bold">검수 정책·알림·자동화 연속 작업 검증</h1>
    <p>합성 계정·원고와 가로챈 HTTP 응답의 실제 UI 검사입니다. 운영 로그인·서버 저장 증거가 아닙니다.</p>
    <output data-command-count={commands.length}>테스트 명령 {commands.length}</output><output data-review-changes={reviewChanges}>검수 새로고침 {reviewChanges}</output>
    <StudioReviewPolicyPanel verified={verified} onRefresh={() => setReviewChanges((n) => n + 1)} onPolicyKnown={() => undefined} />
    <section className="space-y-3 rounded-xl border border-line p-3"><h2>알림 선호</h2>
      <ProductionNotificationPolicyEditor aggregate={aggregate} assignmentId={assignmentId} disabled={false} canManage execute={execute} />
    </section>
    <section className="space-y-3 rounded-xl border border-line p-3"><h2>확인형 자동화</h2><ProductionAutomationExecutionControl aggregate={aggregate} canManage disabled={false} execute={execute} /></section>
    <section className="space-y-3 rounded-xl border border-line p-3"><h2>알림 묶음</h2><ProductionNotificationDigest aggregate={aggregate} assignmentId={assignmentId} disabled onRead={async () => undefined} /></section>
  </main>;
}
const root = document.getElementById("root"); if (!root) throw new Error("Missing fixture root");
createRoot(root).render(<SessionContext.Provider value={{ data: { user: { id: "fixture-artist", name: "Fixture", email: null, image: null, role: "creator" }, token: null }, ready: true, status: "authenticated", update: async () => null }}><Fixture /></SessionContext.Provider>);
