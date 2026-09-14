#!/usr/bin/env node

import { validateFreeInfrastructureRepository } from "./free-infrastructure-policy.mjs";

const issues = validateFreeInfrastructureRepository(process.cwd());
if (issues.length > 0) {
  console.error(`free infrastructure verification failed: ${issues.length} issue(s)`);
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}
console.log("free infrastructure verification passed: strict-free policy and deployment boundaries are consistent");
