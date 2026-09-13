#!/usr/bin/env node
// Fail closed: legacy package aliases must never start a remote build or deployment.
console.error("Deployment was NOT started. Automatic and source-build deployments are disabled.");
console.error("Read docs/operations/minimum-cost-deployment-policy.md before an explicitly approved release.");
console.error("Use the manual deploy-vercel.yml workflow with an approved 40-character main SHA and confirmation.");
console.error("Only verified Linux-compatible prebuilt output may be uploaded; do not reconnect Vercel Git.");
process.exitCode = 1;
