import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PUBLIC_ROUTES = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "market", path: "/market" },
] as const;

type AxeViolations = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

function blockingSummary(violations: AxeViolations): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .slice(0, 3)
        .flatMap((node) => node.target)
        .join(", ");
      return (
        (violation.impact ?? "unknown")
        + " "
        + violation.id
        + ": "
        + violation.help
        + " ["
        + targets
        + "]"
      );
    })
    .join("\n");
}

for (const route of PUBLIC_ROUTES) {
  test(route.name + " has no serious or critical WCAG violations", async ({ page }) => {
    const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
    expect(response?.ok(), route.path + " should return a successful document response").toBe(true);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    const blocking = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );

    expect(blocking, blockingSummary(blocking)).toEqual([]);
  });
}
