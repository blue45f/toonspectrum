import { test } from "vitest";

import { brandIconChecks } from "./verify-brand-icons.mjs";

for (const [name, check] of brandIconChecks) {
  test(name, check);
}
