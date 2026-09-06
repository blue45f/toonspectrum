import { it } from "vitest";

import { creatorResourceCases } from "./creator-resources-cases";

for (const testCase of creatorResourceCases) it(testCase.name, testCase.run);
