#!/usr/bin/env node
// Fail closed: legacy package aliases must never start a remote build or deployment.
console.error("Deployment was NOT started. Automatic and source-build deployments are disabled.");
console.error("Read docs/operations/minimum-cost-deployment-policy.md before an explicitly approved release.");
console.error("Use the manual Cloudflare static release and Render Core API verification paths.");
console.error("The deploy-vercel.yml workflow is an emergency prebuilt rollback only; do not reconnect Vercel Git.");
process.exitCode = 1;
