import { it } from "vitest";

import { creatorResourceWorkflowCases } from "./creator-resource-workflow-cases";

for (const testCase of creatorResourceWorkflowCases) it(testCase.name, testCase.run);
