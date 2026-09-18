import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_PROFESSIONAL_PROTOCOL =
  "docs/validation/studio-professional-creator-validation-protocol.json";
export const DEFAULT_PROFESSIONAL_TEMPLATE =
  "docs/validation/studio-professional-creator-validation-template.json";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const TASK_STATUSES = new Set(["passed", "failed", "blocked"]);

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function assertText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array.`);
  }
  return value;
}

function assertInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be an integer >= ${minimum}.`);
  }
  return value;
}

function assertFiniteNumber(value, label, minimum, maximum) {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < minimum
    || value > maximum
  ) {
    throw new TypeError(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function assertTimestamp(value, label) {
  const text = assertText(value, label);
  if (!Number.isFinite(Date.parse(text))) {
    throw new TypeError(`${label} must be an ISO timestamp.`);
  }
  return text;
}

function assertSha256(value, label) {
  const text = assertText(value, label).toLowerCase();
  if (!SHA256_PATTERN.test(text)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest.`);
  }
  return text;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Json(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function validateProfessionalValidationProtocol(protocol) {
  assertObject(protocol, "protocol");
  if (protocol.schemaVersion !== 1) {
    throw new TypeError("protocol.schemaVersion must be 1.");
  }
  const protocolId = assertText(protocol.protocolId, "protocol.protocolId");
  assertText(protocol.title, "protocol.title");
  const minimumParticipants = assertInteger(
    protocol.minimumParticipants,
    "protocol.minimumParticipants",
    1,
  );
  const requiredRoles = assertObject(
    protocol.requiredRoles,
    "protocol.requiredRoles",
  );
  const roleEntries = Object.entries(requiredRoles);
  if (roleEntries.length === 0) {
    throw new TypeError("protocol.requiredRoles must not be empty.");
  }
  let requiredRoleTotal = 0;
  for (const [role, amount] of roleEntries) {
    assertText(role, "protocol role");
    requiredRoleTotal += assertInteger(
      amount,
      `protocol.requiredRoles.${role}`,
      1,
    );
  }
  if (requiredRoleTotal !== minimumParticipants) {
    throw new TypeError(
      "protocol role minimums must total minimumParticipants.",
    );
  }

  const eligibleTools = assertArray(
    protocol.eligibleTools,
    "protocol.eligibleTools",
  ).map((value, index) => assertText(value, `protocol.eligibleTools[${index}]`));
  if (new Set(eligibleTools).size !== eligibleTools.length || eligibleTools.length === 0) {
    throw new TypeError("protocol.eligibleTools must be non-empty and unique.");
  }

  const tasks = assertArray(
    protocol.requiredTasks,
    "protocol.requiredTasks",
  );
  if (tasks.length === 0) throw new TypeError("protocol.requiredTasks must not be empty.");
  const taskIds = tasks.map((task, index) => {
    assertObject(task, `protocol.requiredTasks[${index}]`);
    assertText(task.label, `protocol.requiredTasks[${index}].label`);
    return assertText(task.id, `protocol.requiredTasks[${index}].id`);
  });
  if (new Set(taskIds).size !== taskIds.length) {
    throw new TypeError("protocol task ids must be unique.");
  }

  const thresholds = assertObject(protocol.thresholds, "protocol.thresholds");
  assertFiniteNumber(
    thresholds.minimumTaskCompletionRate,
    "protocol.thresholds.minimumTaskCompletionRate",
    0,
    1,
  );
  assertInteger(
    thresholds.maximumFatalDataLossCount,
    "protocol.thresholds.maximumFatalDataLossCount",
  );
  assertInteger(
    thresholds.maximumPublishPreflightMissCount,
    "protocol.thresholds.maximumPublishPreflightMissCount",
  );
  assertInteger(
    thresholds.maximumPsdLossReportMismatchCount,
    "protocol.thresholds.maximumPsdLossReportMismatchCount",
  );
  assertFiniteNumber(
    thresholds.minimumMedianSusScore,
    "protocol.thresholds.minimumMedianSusScore",
    0,
    100,
  );
  assertInteger(
    thresholds.maximumCriticalAccessibilityFindings,
    "protocol.thresholds.maximumCriticalAccessibilityFindings",
  );
  assertInteger(
    thresholds.maximumCriticalSecurityFindings,
    "protocol.thresholds.maximumCriticalSecurityFindings",
  );
  const statementVersion = assertText(
    protocol.attestationStatementVersion,
    "protocol.attestationStatementVersion",
  );
  const consentScope = assertText(protocol.consentScope, "protocol.consentScope");

  return Object.freeze({
    protocolId,
    minimumParticipants,
    requiredRoles: Object.freeze({ ...requiredRoles }),
    eligibleTools: Object.freeze(eligibleTools),
    taskIds: Object.freeze(taskIds),
    thresholds: Object.freeze({ ...thresholds }),
    statementVersion,
    consentScope,
  });
}

export function validateProfessionalValidationTemplate(template, protocol) {
  const validatedProtocol = validateProfessionalValidationProtocol(protocol);
  assertObject(template, "template");
  if (template.schemaVersion !== 1) {
    throw new TypeError("template.schemaVersion must be 1.");
  }
  if (template.protocolId !== validatedProtocol.protocolId) {
    throw new TypeError("template.protocolId does not match the protocol.");
  }
  if (template.status !== "draft-template") {
    throw new TypeError("template.status must be draft-template.");
  }
  assertText(template.studyId, "template.studyId");
  if (template.coordinatorAttestation !== null) {
    throw new TypeError("template coordinatorAttestation must remain null.");
  }
  if (assertArray(template.sessions, "template.sessions").length !== 0) {
    throw new TypeError("template.sessions must remain empty.");
  }

  const slots = assertArray(template.participantSlots, "template.participantSlots");
  if (slots.length !== validatedProtocol.minimumParticipants) {
    throw new TypeError("template participant slot count does not match the protocol.");
  }
  const participantIds = new Set();
  const roleCounts = {};
  for (const [index, slot] of slots.entries()) {
    assertObject(slot, `template.participantSlots[${index}]`);
    const participantId = assertText(
      slot.participantId,
      `template.participantSlots[${index}].participantId`,
    );
    if (participantIds.has(participantId)) {
      throw new TypeError(`duplicate participant slot: ${participantId}`);
    }
    participantIds.add(participantId);
    const role = assertText(slot.role, `template.participantSlots[${index}].role`);
    if (!(role in validatedProtocol.requiredRoles)) {
      throw new TypeError(`unsupported participant role: ${role}`);
    }
    roleCounts[role] = (roleCounts[role] ?? 0) + 1;
  }
  for (const [role, required] of Object.entries(validatedProtocol.requiredRoles)) {
    if ((roleCounts[role] ?? 0) !== required) {
      throw new TypeError(`template role count mismatch for ${role}.`);
    }
  }
  return Object.freeze({ participantSlots: slots.length, roleCounts: Object.freeze(roleCounts) });
}

function validateAttestation(attestation, label, protocol) {
  assertObject(attestation, label);
  assertTimestamp(attestation.signedAt, `${label}.signedAt`);
  if (attestation.statementVersion !== protocol.statementVersion) {
    throw new TypeError(`${label}.statementVersion does not match the protocol.`);
  }
  if (attestation.consentScope !== protocol.consentScope) {
    throw new TypeError(`${label}.consentScope does not match the protocol.`);
  }
  return assertSha256(
    attestation.signatureArtifactSha256,
    `${label}.signatureArtifactSha256`,
  );
}

export function validateProfessionalValidationEvidence(evidence, protocol) {
  const validatedProtocol = validateProfessionalValidationProtocol(protocol);
  assertObject(evidence, "evidence");
  if (evidence.schemaVersion !== 1) {
    throw new TypeError("evidence.schemaVersion must be 1.");
  }
  if (evidence.protocolId !== validatedProtocol.protocolId) {
    throw new TypeError("evidence.protocolId does not match the protocol.");
  }
  const studyId = assertText(evidence.studyId, "evidence.studyId");
  assertTimestamp(evidence.startedAt, "evidence.startedAt");
  assertTimestamp(evidence.endedAt, "evidence.endedAt");
  const coordinatorSignature = validateAttestation(
    evidence.coordinatorAttestation,
    "evidence.coordinatorAttestation",
    validatedProtocol,
  );

  const sessions = assertArray(evidence.sessions, "evidence.sessions");
  const participantIds = new Set();
  const signatureDigests = new Set([coordinatorSignature]);
  const requiredTaskIds = new Set(validatedProtocol.taskIds);
  const eligibleTools = new Set(validatedProtocol.eligibleTools);

  for (const [index, session] of sessions.entries()) {
    const label = `evidence.sessions[${index}]`;
    assertObject(session, label);
    const participantId = assertText(session.participantId, `${label}.participantId`);
    if (participantIds.has(participantId)) {
      throw new TypeError(`duplicate participant id: ${participantId}`);
    }
    participantIds.add(participantId);
    const role = assertText(session.role, `${label}.role`);
    if (!(role in validatedProtocol.requiredRoles)) {
      throw new TypeError(`unsupported participant role: ${role}`);
    }
    if (session.recentProfessionalUse !== true) {
      throw new TypeError(`${label}.recentProfessionalUse must be true.`);
    }
    const tools = assertArray(session.professionalTools, `${label}.professionalTools`);
    if (tools.length === 0) {
      throw new TypeError(`${label}.professionalTools must not be empty.`);
    }
    for (const [toolIndex, toolValue] of tools.entries()) {
      const tool = assertText(toolValue, `${label}.professionalTools[${toolIndex}]`);
      if (!eligibleTools.has(tool)) {
        throw new TypeError(`unsupported professional tool: ${tool}`);
      }
    }

    const environment = assertObject(session.environment, `${label}.environment`);
    for (const field of ["os", "appVersion", "browser", "gpu", "penDevice"]) {
      assertText(environment[field], `${label}.environment.${field}`);
    }
    assertSha256(environment.projectInputSha256, `${label}.environment.projectInputSha256`);
    assertSha256(environment.resultBundleSha256, `${label}.environment.resultBundleSha256`);

    const taskResults = assertArray(session.taskResults, `${label}.taskResults`);
    const taskIds = new Set();
    for (const [taskIndex, result] of taskResults.entries()) {
      const taskLabel = `${label}.taskResults[${taskIndex}]`;
      assertObject(result, taskLabel);
      const taskId = assertText(result.taskId, `${taskLabel}.taskId`);
      if (!requiredTaskIds.has(taskId)) {
        throw new TypeError(`unsupported task id: ${taskId}`);
      }
      if (taskIds.has(taskId)) throw new TypeError(`duplicate task result: ${taskId}`);
      taskIds.add(taskId);
      if (!TASK_STATUSES.has(result.status)) {
        throw new TypeError(`${taskLabel}.status is invalid.`);
      }
      assertFiniteNumber(result.durationSeconds, `${taskLabel}.durationSeconds`, 0, Number.MAX_SAFE_INTEGER);
      assertInteger(result.fatalDataLossCount, `${taskLabel}.fatalDataLossCount`);
      assertInteger(result.publishPreflightMissCount, `${taskLabel}.publishPreflightMissCount`);
      assertInteger(result.psdLossReportMismatchCount, `${taskLabel}.psdLossReportMismatchCount`);
    }
    if (taskIds.size !== requiredTaskIds.size) {
      throw new TypeError(`${label}.taskResults must include every required task exactly once.`);
    }

    const metrics = assertObject(session.metrics, `${label}.metrics`);
    assertFiniteNumber(metrics.susScore, `${label}.metrics.susScore`, 0, 100);
    assertInteger(
      metrics.criticalAccessibilityFindings,
      `${label}.metrics.criticalAccessibilityFindings`,
    );
    assertInteger(
      metrics.criticalSecurityFindings,
      `${label}.metrics.criticalSecurityFindings`,
    );

    const signature = validateAttestation(
      session.attestation,
      `${label}.attestation`,
      validatedProtocol,
    );
    if (signatureDigests.has(signature)) {
      throw new TypeError("attestation signature artifact digests must be unique.");
    }
    signatureDigests.add(signature);
  }

  return Object.freeze({
    studyId,
    sessionCount: sessions.length,
    protocol: validatedProtocol,
  });
}

export function evaluateProfessionalValidationEvidence(evidence, protocol) {
  const validation = validateProfessionalValidationEvidence(evidence, protocol);
  const sessions = evidence.sessions;
  const roleCounts = countBy(sessions.map((session) => session.role));
  const taskResults = sessions.flatMap((session) => session.taskResults);
  const passedTasks = taskResults.filter((result) => result.status === "passed").length;
  const taskCompletionRate = taskResults.length === 0 ? 0 : passedTasks / taskResults.length;
  const fatalDataLossCount = taskResults.reduce(
    (total, result) => total + result.fatalDataLossCount,
    0,
  );
  const publishPreflightMissCount = taskResults.reduce(
    (total, result) => total + result.publishPreflightMissCount,
    0,
  );
  const psdLossReportMismatchCount = taskResults.reduce(
    (total, result) => total + result.psdLossReportMismatchCount,
    0,
  );
  const medianSusScore = median(sessions.map((session) => session.metrics.susScore));
  const criticalAccessibilityFindings = sessions.reduce(
    (total, session) => total + session.metrics.criticalAccessibilityFindings,
    0,
  );
  const criticalSecurityFindings = sessions.reduce(
    (total, session) => total + session.metrics.criticalSecurityFindings,
    0,
  );

  const issues = [];
  if (sessions.length < validation.protocol.minimumParticipants) {
    issues.push(
      `participants ${sessions.length}/${validation.protocol.minimumParticipants}`,
    );
  }
  for (const [role, required] of Object.entries(validation.protocol.requiredRoles)) {
    if ((roleCounts[role] ?? 0) < required) {
      issues.push(`role ${role} ${(roleCounts[role] ?? 0)}/${required}`);
    }
  }
  const thresholds = validation.protocol.thresholds;
  if (taskCompletionRate < thresholds.minimumTaskCompletionRate) {
    issues.push(
      `task completion ${taskCompletionRate.toFixed(4)}/${thresholds.minimumTaskCompletionRate}`,
    );
  }
  if (fatalDataLossCount > thresholds.maximumFatalDataLossCount) {
    issues.push(`fatal data loss ${fatalDataLossCount}/${thresholds.maximumFatalDataLossCount}`);
  }
  if (publishPreflightMissCount > thresholds.maximumPublishPreflightMissCount) {
    issues.push(
      `publish preflight misses ${publishPreflightMissCount}/${thresholds.maximumPublishPreflightMissCount}`,
    );
  }
  if (psdLossReportMismatchCount > thresholds.maximumPsdLossReportMismatchCount) {
    issues.push(
      `PSD loss report mismatches ${psdLossReportMismatchCount}/${thresholds.maximumPsdLossReportMismatchCount}`,
    );
  }
  if (medianSusScore < thresholds.minimumMedianSusScore) {
    issues.push(`median SUS ${medianSusScore}/${thresholds.minimumMedianSusScore}`);
  }
  if (criticalAccessibilityFindings > thresholds.maximumCriticalAccessibilityFindings) {
    issues.push(
      `critical accessibility findings ${criticalAccessibilityFindings}/${thresholds.maximumCriticalAccessibilityFindings}`,
    );
  }
  if (criticalSecurityFindings > thresholds.maximumCriticalSecurityFindings) {
    issues.push(
      `critical security findings ${criticalSecurityFindings}/${thresholds.maximumCriticalSecurityFindings}`,
    );
  }

  const passed = issues.length === 0;
  return Object.freeze({
    studyId: validation.studyId,
    participantCount: sessions.length,
    roleCounts: Object.freeze(roleCounts),
    requiredTaskCount: validation.protocol.taskIds.length,
    taskResultCount: taskResults.length,
    passedTaskCount: passedTasks,
    taskCompletionRate,
    fatalDataLossCount,
    publishPreflightMissCount,
    psdLossReportMismatchCount,
    medianSusScore,
    criticalAccessibilityFindings,
    criticalSecurityFindings,
    issues: Object.freeze(issues),
    passed,
    professionalReplacementClaimAllowed: passed,
    externalValidationRequired: !passed,
  });
}

export function createProfessionalValidationReceipt({
  protocol,
  evidence,
  generatedAt = new Date().toISOString(),
}) {
  const evaluation = evaluateProfessionalValidationEvidence(evidence, protocol);
  const body = {
    schemaVersion: 1,
    protocolId: protocol.protocolId,
    studyId: evidence.studyId,
    generatedAt,
    protocolSha256: sha256Json(protocol),
    evidenceSha256: sha256Json(evidence),
    evaluation,
  };
  return Object.freeze({ ...body, receiptSha256: sha256Json(body) });
}

async function readJson(root, relativePath) {
  const absolutePath = resolve(root, relativePath);
  const raw = await readFile(absolutePath, "utf8");
  return { absolutePath, raw, value: JSON.parse(raw) };
}

export async function verifyProfessionalValidationKit({
  root = process.cwd(),
  protocolPath = DEFAULT_PROFESSIONAL_PROTOCOL,
  templatePath = DEFAULT_PROFESSIONAL_TEMPLATE,
  evidencePath = null,
  receiptPath = null,
} = {}) {
  const protocolFile = await readJson(root, protocolPath);
  const templateFile = await readJson(root, templatePath);
  const protocol = validateProfessionalValidationProtocol(protocolFile.value);
  const template = validateProfessionalValidationTemplate(
    templateFile.value,
    protocolFile.value,
  );

  if (evidencePath === null) {
    console.log(
      `Professional validation kit verified: ${protocol.protocolId} · ${template.participantSlots} participant slots · external signed evidence still required`,
    );
    return Object.freeze({ protocol, template, receipt: null });
  }

  const evidenceFile = await readJson(root, evidencePath);
  const receipt = createProfessionalValidationReceipt({
    protocol: protocolFile.value,
    evidence: evidenceFile.value,
  });
  if (receiptPath !== null) {
    const absoluteReceiptPath = resolve(root, receiptPath);
    await mkdir(dirname(absoluteReceiptPath), { recursive: true });
    await writeFile(
      absoluteReceiptPath,
      `${JSON.stringify(receipt, null, 2)}\n`,
      "utf8",
    );
  }
  if (!receipt.evaluation.passed) {
    throw new Error(
      `Professional validation did not pass: ${receipt.evaluation.issues.join("; ")}`,
    );
  }
  console.log(
    `Professional validation passed: ${receipt.evaluation.participantCount} signed participants · receipt ${receipt.receiptSha256}`,
  );
  return Object.freeze({ protocol, template, receipt });
}

function parseArguments(argv) {
  const options = {
    protocolPath: DEFAULT_PROFESSIONAL_PROTOCOL,
    templatePath: DEFAULT_PROFESSIONAL_TEMPLATE,
    evidencePath: null,
    receiptPath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") continue;
    if (argument === "--protocol") options.protocolPath = argv[++index];
    else if (argument === "--template") options.templatePath = argv[++index];
    else if (argument === "--evidence") options.evidencePath = argv[++index];
    else if (argument === "--receipt") options.receiptPath = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

if (
  process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await verifyProfessionalValidationKit({
    root: process.cwd(),
    ...parseArguments(process.argv.slice(2)),
  });
}
