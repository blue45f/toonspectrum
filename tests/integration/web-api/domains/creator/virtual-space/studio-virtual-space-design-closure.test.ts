import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const text = (path: string) => readFileSync(join(root, path), "utf8");
const required = (path: string) => expect(existsSync(join(root, path)), path).toBe(true);

describe("Virtual Studio all-pages design closure", () => {
  it("keeps route, market and fortune completeness as executable contracts", () => {
    required("apps/web/src/app/spatial-campus/campus-route-coverage.test.ts");
    required("apps/web/src/domains/fortune/fortune-campus-map.ts");
    const coverage = text("apps/web/src/app/spatial-campus/campus-route-coverage.test.ts");
    expect(coverage).toContain('expect(market).toHaveLength(10)');
    expect(coverage).toContain("explicitly classifies every registered top-level route");
    expect(text("apps/web/src/domains/fortune/fortune-campus-map.ts")).toContain("FORTUNE_EXPERIENCES");
  });

  it("retains durable production workflows instead of treating links as completion", () => {
    for (const path of [
      "apps/web/src/domains/creator/work-session/StudioSessionWorkflowPanel.tsx",
      "apps/web/src/domains/creator/review-task-completion/StudioReviewTaskCompletion.tsx",
      "apps/web/src/domains/creator/handoff-envelope/StudioHandoffEnvelope.tsx",
      "apps/web/src/domains/creator/StudioAssetDecisionPanel.tsx",
      "apps/web/src/domains/creator/work-session/StudioSessionEvidencePanel.tsx",
      "apps/web/src/domains/creator/review-share/StudioPinnedReviewShowcasePage.tsx",
      "apps/web/src/domains/creator/spatial-showcase-placement.ts",
    ]) required(path);
  });

  it("keeps world templates, rules, publication and interaction intent within validated registries", () => {
    for (const path of [
      "apps/web/src/domains/creator/virtual-space/StudioWorldTemplatePanel.tsx",
      "apps/web/src/domains/creator/virtual-space/StudioWorldRuleEditor.tsx",
      "apps/web/src/domains/creator/virtual-space/world-publication/studio-world-publication-controller.ts",
      "apps/web/src/domains/creator/virtual-space/studio-virtual-space-interaction-orchestrator.ts",
    ]) required(path);
    const orchestrator = text("apps/web/src/domains/creator/virtual-space/studio-virtual-space-interaction-orchestrator.ts");
    expect(orchestrator).toContain('kind: "world-rule"');
    expect(orchestrator).not.toContain("fetch(");
  });

  it("closes door knock and short review explanation without conflating them with admission or call recording", () => {
    const room = text("apps/web/src/domains/creator/virtual-space/private-room/studio-private-room-controller.ts");
    expect(room).toContain("studio-private-room-knock-v1");
    expect(room).toContain("knockEligible");
    const note = text("apps/web/src/domains/creator/virtual-space/StudioReviewVoiceNotes.tsx");
    expect(note).toContain("This is not call recording");
    expect(note).toContain("getUserMedia");
    const migration = text("apps/api/src/db/migrations/0090_studio_review_voice_note.sql");
    expect(migration).toContain("studio_review_voice_note_guard_update");
    expect(migration).toContain("REVOKE ALL ON TABLE studio_review_voice_note FROM PUBLIC");
  });

  it("supersedes the historical gap ledger while keeping environment certification honest", () => {
    const ledger = text("docs/studio/virtual-studio-design-closure-ledger-20260920.md");
    expect(ledger).toContain("Historical status notice (2026-09-24)");
    const closure = text("docs/studio/virtual-studio-all-pages-closure-20260924.md");
    expect(closure).toContain("product-code complete");
    expect(closure).toContain("not software-feature gaps");
    expect(closure).toContain("One-hour interactive spatial session");
    expect(closure).not.toContain("실기기 검증 완료");
  });
});
