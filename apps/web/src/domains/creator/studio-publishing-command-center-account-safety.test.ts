import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioPublishingCommandCenter.tsx", import.meta.url),
  "utf8",
);

describe("Studio publishing command center account safety wiring", () => {
  it("renders the account review in the canonical final review", () => {
    expect(source).toContain('import { StudioPublishAccountReviewCard }');
    expect(source).toContain("<StudioPublishAccountReviewCard");
    expect(source).toContain("identity={publisherIdentity}");
    expect(source).toContain("visibility={directive.visibility}");
  });

  it("blocks publish both at the action and mutation boundaries until confirmed", () => {
    expect(source).toContain('if (intent === "publish" && !publisherConfirmed)');
    expect(source).toContain('(step === "review" && (!preflight.canPublish || !publisherConfirmed))');
    expect(source).toContain("setPublisherConfirmed(false);");
  });

  it("clears a stale completion receipt as soon as the saved work changes", () => {
    expect(source).toContain("if (workId && publishResult)");
    expect(source).toContain("navigate(buildStudioPublishResultHref(workId), { replace: true })");
  });
});
