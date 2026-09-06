import { it } from "vitest";

import { creatorWorkspacePersistenceCases } from "./creator-workspace-persistence-cases";

for (const testCase of creatorWorkspacePersistenceCases) it(testCase.name, testCase.run);
