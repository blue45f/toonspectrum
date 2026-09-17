import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioTaskFlow.tsx", import.meta.url),
  "utf8",
);

describe("Studio task-first UX primitives", () => {
  it("keeps production steps readable on narrow viewports", () => {
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("min-w-[10.5rem]");
    expect(source).toContain("break-words");
    expect(source).toContain("aria-current={current ? \"step\" : undefined}");
  });

  it("provides an accessible explanation for disabled actions", () => {
    expect(source).toContain("export function DisabledReason");
    expect(source).toContain("role=\"status\"");
    expect(source).toContain("CircleHelp");
  });

  it("keeps errors recoverable and inputs outside the notice lifecycle", () => {
    expect(source).toContain("export function RecoverableActionNotice");
    expect(source).toContain("role={tone === \"danger\" ? \"alert\" : \"status\"}");
    expect(source).toContain("action?: ReactNode");
  });

  it("uses intent-oriented links with a localized action label", () => {
    expect(source).toContain("export function StudioIntentLauncher");
    expect(source).toContain("readonly actionLabel: string");
    expect(source).toContain("{actionLabel}");
    expect(source).not.toContain(">열기<");
  });

  it("supports a compact result summary before committing to an action", () => {
    expect(source).toContain("export function StudioTaskSummary");
    expect(source).toContain("readonly meta?: ReactNode");
  });
});