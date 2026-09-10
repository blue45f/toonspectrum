import { parse } from "yaml";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseWorkflow(source, issues) {
  try {
    const parsed = parse(source);
    if (!isRecord(parsed)) {
      issues.push("workflow root must be a YAML mapping");
      return null;
    }
    return parsed;
  } catch (error) {
    issues.push(`workflow YAML is invalid: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function requireUnconditionalStep(step, label, issues) {
  if (!isRecord(step)) {
    issues.push(`${label} step is missing`);
    return null;
  }
  if ("if" in step) issues.push(`${label} step must not be conditionally skipped`);
  if (step["continue-on-error"] === true) {
    issues.push(`${label} step must not continue on error`);
  }
  return step;
}

function stepRun(step) {
  return step && typeof step.run === "string" ? step.run.trim() : "";
}

function requireRunFragments(run, fragments, message, issues) {
  if (fragments.some((fragment) => !run.includes(fragment))) {
    issues.push(message);
  }
}

export function validateVercelFallbackWorkflow(source) { // NOSONAR javascript:S3776
  const issues = [];
  const workflow = parseWorkflow(source, issues);
  if (!workflow) return issues;

  const triggers = isRecord(workflow.on) ? Object.keys(workflow.on) : [];
  if (triggers.length !== 1 || triggers[0] !== "workflow_dispatch") {
    issues.push("Vercel CLI fallback must expose workflow_dispatch as its only trigger");
  }
  const permissions = isRecord(workflow.permissions) ? workflow.permissions : null;
  if (
    !permissions ||
    Object.keys(permissions).length !== 1 ||
    permissions.contents !== "read"
  ) {
    issues.push("Vercel CLI fallback must grant only contents: read permission");
  }

  const jobs = isRecord(workflow.jobs) ? workflow.jobs : null;
  const deployJob = jobs && isRecord(jobs.deploy) ? jobs.deploy : null;
  if (!deployJob) {
    issues.push("Vercel fallback workflow is missing jobs.deploy");
    return issues;
  }

  const env = isRecord(deployJob.env) ? deployJob.env : {};
  for (const secretName of ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]) {
    if (env[secretName] !== `\${{ secrets.${secretName} }}`) {
      issues.push(`Vercel fallback workflow is missing the exact ${secretName} secret binding`);
    }
  }
  const pinnedVersion = typeof env.VERCEL_CLI_VERSION === "string"
    ? env.VERCEL_CLI_VERSION
    : "";
  if (!/^\d+\.\d+\.\d+$/.test(pinnedVersion)) {
    issues.push("Vercel fallback workflow has no exact VERCEL_CLI_VERSION");
  }
  if (String(env.VERCEL_TELEMETRY_DISABLED ?? "") !== "1") {
    issues.push("Vercel fallback workflow must disable CLI telemetry");
  }

  const steps = Array.isArray(deployJob.steps) ? deployJob.steps : [];
  if (steps.length !== 10) {
    issues.push(`Vercel prebuilt fallback workflow must keep exactly 10 auditable steps (found ${steps.length})`);
  }
  const [
    preflightRaw,
    checkoutRaw,
    sourceGuardRaw,
    pnpmSetupRaw,
    setupNodeRaw,
    installRaw,
    pullRaw,
    buildRaw,
    verifyRaw,
    deployRaw,
  ] = steps;

  const preflight = requireUnconditionalStep(preflightRaw, "configuration preflight", issues);
  const checkout = requireUnconditionalStep(checkoutRaw, "checkout", issues);
  const sourceGuard = requireUnconditionalStep(sourceGuardRaw, "main ancestry guard", issues);
  const pnpmSetup = requireUnconditionalStep(pnpmSetupRaw, "pnpm setup", issues);
  const setupNode = requireUnconditionalStep(setupNodeRaw, "Node setup", issues);
  const install = requireUnconditionalStep(installRaw, "CLI install", issues);
  const pull = requireUnconditionalStep(pullRaw, "production settings pull", issues);
  const build = requireUnconditionalStep(buildRaw, "prebuilt production build", issues);
  const verify = requireUnconditionalStep(verifyRaw, "prebuilt output verification", issues);
  const deploy = requireUnconditionalStep(deployRaw, "production deploy", issues);

  const preflightRun = stepRun(preflight);
  if (preflight?.name !== "Require fallback deployment configuration") {
    issues.push("Vercel fallback workflow is missing its configuration preflight step");
  }
  if (preflight?.shell !== "bash") {
    issues.push("Vercel fallback configuration preflight must use bash");
  }
  for (const secretName of ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]) {
    if (!preflightRun.includes(`-z "\${${secretName}:-}"`)) {
      issues.push(`Vercel fallback preflight must reject an empty ${secretName}`);
    }
  }
  if (!/(?:^|\n)\s*exit 1\s*(?:\n|$)/.test(preflightRun)) {
    issues.push("Vercel fallback preflight must fail instead of reporting a successful no-op");
  }

  if (checkout?.uses !== "actions/checkout@v6") {
    issues.push("Vercel fallback workflow must checkout the requested Git revision");
  }
  const checkoutWith = checkout && isRecord(checkout.with) ? checkout.with : {};
  if (checkoutWith.ref !== "${{ inputs.ref || github.sha }}") {
    issues.push("Vercel fallback checkout must use the requested ref or triggering SHA");
  }
  if (checkoutWith["persist-credentials"] !== false) {
    issues.push("Vercel fallback checkout must not persist repository credentials");
  }

  const sourceGuardRun = stepRun(sourceGuard);
  if (sourceGuard?.name !== "Require a reviewed commit from the current main history") {
    issues.push("Vercel fallback workflow is missing its current-main ancestry guard");
  }
  if (sourceGuard?.shell !== "bash") {
    issues.push("Vercel fallback ancestry guard must use bash");
  }
  requireRunFragments(
    sourceGuardRun,
    [
      "git fetch --no-tags origin main",
      'git merge-base --is-ancestor "$deploy_sha" "$main_sha"',
      'echo "sha=${deploy_sha}" >> "$GITHUB_OUTPUT"',
      'echo "main_sha=${main_sha}" >> "$GITHUB_OUTPUT"',
    ],
    "Vercel fallback must reject refs outside current main history",
    issues,
  );

  if (pnpmSetup?.uses !== "pnpm/action-setup@v6") {
    issues.push("Vercel fallback workflow must initialize the repository pnpm toolchain");
  }
  if (setupNode?.uses !== "actions/setup-node@v6") {
    issues.push("Vercel fallback workflow must use actions/setup-node@v6");
  }
  const setupWith = setupNode && isRecord(setupNode.with) ? setupNode.with : {};
  if (String(setupWith["node-version"] ?? "") !== "24") {
    issues.push("Vercel fallback workflow must select Node 24");
  }
  if (String(setupWith.cache ?? "") !== "pnpm") {
    issues.push("Vercel fallback workflow must reuse the pnpm dependency cache");
  }

  const installRun = stepRun(install);
  const pinnedInstall = 'npm install --global --no-audit --no-fund "vercel@${VERCEL_CLI_VERSION}"';
  if (install?.name !== "Install and verify pinned Vercel CLI") {
    issues.push("Vercel fallback workflow is missing its pinned CLI installation step");
  }
  if (!installRun.split(/\r?\n/).some((line) => line.trim() === pinnedInstall)) {
    issues.push("Vercel fallback workflow does not install its pinned CLI version");
  }
  if (!installRun.includes('test "$actual_version" = "$VERCEL_CLI_VERSION"')) {
    issues.push("Vercel fallback workflow does not verify the installed CLI version");
  }

  const pullRun = stepRun(pull);
  if (
    pull?.name !== "Pull production project settings and environment" ||
    pullRun !== 'vercel pull --yes --environment=production --token "$VERCEL_TOKEN"'
  ) {
    issues.push("Vercel fallback workflow must pull the linked production project settings");
  }

  const buildRun = stepRun(build);
  if (
    build?.name !== "Build production output on the GitHub runner" ||
    buildRun !== 'vercel build --prod --yes --token "$VERCEL_TOKEN"'
  ) {
    issues.push("Vercel fallback workflow must create the production prebuilt artifact");
  }

  const verifyRun = stepRun(verify);
  if (verify?.name !== "Verify immutable prebuilt output") {
    issues.push("Vercel fallback workflow is missing its prebuilt output verification step");
  }
  if (verify?.shell !== "bash") {
    issues.push("Vercel fallback prebuilt output verification must use bash");
  }
  requireRunFragments(
    verifyRun,
    [
      "test -f .vercel/output/config.json",
      "test -d .vercel/output/static",
      "test -d .vercel/output/functions",
      "find .vercel/output/functions -type d -name '*.func'",
    ],
    "Vercel fallback workflow must verify the immutable static and function output",
    issues,
  );

  const deployRun = stepRun(deploy);
  if (deploy?.name !== "Deploy prebuilt output to Vercel production") {
    issues.push("Vercel fallback workflow is missing its prebuilt production deploy step");
  }
  if (deploy?.id !== "deploy") {
    issues.push("Vercel fallback production deploy must expose its URL receipt");
  }
  if (deploy?.shell !== "bash") {
    issues.push("Vercel fallback production deploy must use bash");
  }
  requireRunFragments(
    deployRun,
    [
      'vercel deploy --prebuilt --prod --yes --archive=tgz --token "$VERCEL_TOKEN"',
      'if [[ ! "$deployment_url" =~ ^https:// ]]',
      'echo "url=${deployment_url}" >> "$GITHUB_OUTPUT"',
      "## Vercel production fallback",
      "Mode: GitHub-runner prebuilt upload",
    ],
    "Vercel fallback workflow is missing its exact prebuilt production deploy contract",
    issues,
  );

  for (const [index, rawStep] of steps.entries()) {
    if (!isRecord(rawStep)) continue;
    const stepEnv = isRecord(rawStep.env) ? rawStep.env : {};
    for (const name of ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]) {
      if (Object.hasOwn(stepEnv, name)) {
        issues.push(`Vercel fallback step ${index + 1} must not override job-level ${name}`);
      }
    }
    const run = typeof rawStep.run === "string" ? rawStep.run : "";
    if (/(?:^|\n)\s*(?:export\s+)?VERCEL_(?:ORG|PROJECT)_ID\s*=/.test(run)) {
      issues.push(`Vercel fallback step ${index + 1} must not override the target project`);
    }
    for (const line of run.split(/\r?\n/).map((item) => item.trim())) {
      if (!/^(?:npm|pnpm|yarn|bun)\s+(?:i|install|add|ci)\b/.test(line)) continue;
      if (line !== pinnedInstall) {
        issues.push(`Vercel source fallback must not install workspace dependencies: ${line}`);
      }
    }
  }

  return issues;
}

export function validateNoDuplicateVercelTrigger(source, { workflow = false } = {}) {
  const issues = [];
  if (/VERCEL_DEPLOY_HOOK_URL/.test(source)) {
    issues.push("must not invoke or configure a Vercel Deploy Hook");
  }
  if (/\bgh\s+workflow\s+run\b/.test(source)) {
    issues.push("must not dispatch a second deployment workflow");
  }
  if (/\bvercel\s+(?:deploy\b|--prod\b)/.test(source)) {
    issues.push("must not invoke a second Vercel CLI deployment");
  }
  if (workflow) {
    const parseIssues = [];
    const parsed = parseWorkflow(source, parseIssues);
    issues.push(...parseIssues);
    const permissions = parsed && isRecord(parsed.permissions) ? parsed.permissions : null;
    if (
      !permissions ||
      Object.keys(permissions).length !== 1 ||
      permissions.contents !== "write"
    ) {
      issues.push("must grant only contents: write permission");
    }
  }
  return issues;
}
