import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createProfessionalValidationReceipt,
  evaluateProfessionalValidationEvidence,
  validateProfessionalValidationEvidence,
  validateProfessionalValidationProtocol,
  validateProfessionalValidationTemplate,
} from "./verify-studio-professional-validation.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const ROOT = resolve(import.meta.dirname, "..");
const PROTOCOL_PATH = resolve(
  ROOT,
  "docs/validation/studio-professional-creator-validation-protocol.json",
);
const TEMPLATE_PATH = resolve(
  ROOT,
  "docs/validation/studio-professional-creator-validation-template.json",
);

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function loadFixtures() {
  const [protocolRaw, templateRaw] = await Promise.all([
    readFile(PROTOCOL_PATH, "utf8"),
    readFile(TEMPLATE_PATH, "utf8"),
  ]);
  return {
    protocol: JSON.parse(protocolRaw),
    template: JSON.parse(templateRaw),
  };
}

function completeEvidence(protocol) {
  const roles = Object.entries(protocol.requiredRoles).flatMap(([role, count]) =>
    Array.from({ length: count }, () => role));
  return {
    schemaVersion: 1,
    protocolId: protocol.protocolId,
    studyId: "professional-pilot-2026-09",
    startedAt: "2026-09-17T00:00:00.000Z",
    endedAt: "2026-09-18T00:00:00.000Z",
    coordinatorAttestation: {
      signedAt: "2026-09-18T00:05:00.000Z",
      statementVersion: protocol.attestationStatementVersion,
      consentScope: protocol.consentScope,
      signatureArtifactSha256: digest("coordinator-signature"),
    },
    sessions: roles.map((role, index) => {
      const participantId = `P-${String(index + 1).padStart(3, "0")}`;
      return {
        participantId,
        role,
        recentProfessionalUse: true,
        professionalTools: [protocol.eligibleTools[index % protocol.eligibleTools.length]],
        environment: {
          os: "test-os",
          appVersion: "test-build",
          browser: "test-browser",
          gpu: "test-gpu",
          penDevice: "test-pen",
          projectInputSha256: digest(`${participantId}-input`),
          resultBundleSha256: digest(`${participantId}-result`),
        },
        taskResults: protocol.requiredTasks.map((task, taskIndex) => ({
          taskId: task.id,
          status: "passed",
          durationSeconds: 300 + taskIndex,
          fatalDataLossCount: 0,
          publishPreflightMissCount: 0,
          psdLossReportMismatchCount: 0,
        })),
        metrics: {
          susScore: 85,
          criticalAccessibilityFindings: 0,
          criticalSecurityFindings: 0,
        },
        attestation: {
          signedAt: "2026-09-18T00:01:00.000Z",
          statementVersion: protocol.attestationStatementVersion,
          consentScope: protocol.consentScope,
          signatureArtifactSha256: digest(`${participantId}-signature`),
        },
      };
    }),
  };
}

test("committed protocol and participant template preserve the 12-person role mix", async () => {
  const { protocol, template } = await loadFixtures();
  const validatedProtocol = validateProfessionalValidationProtocol(protocol);
  const validatedTemplate = validateProfessionalValidationTemplate(template, protocol);

  assert.equal(validatedProtocol.minimumParticipants, 12);
  assert.equal(validatedProtocol.taskIds.length, 7);
  assert.equal(validatedTemplate.participantSlots, 12);
  assert.deepEqual(validatedTemplate.roleCounts, protocol.requiredRoles);
});

test("only complete signed evidence that meets every threshold unlocks the claim", async () => {
  const { protocol } = await loadFixtures();
  const evidence = completeEvidence(protocol);
  const validation = validateProfessionalValidationEvidence(evidence, protocol);
  const evaluation = evaluateProfessionalValidationEvidence(evidence, protocol);
  const receipt = createProfessionalValidationReceipt({
    protocol,
    evidence,
    generatedAt: "2026-09-18T00:10:00.000Z",
  });

  assert.equal(validation.sessionCount, 12);
  assert.equal(evaluation.taskResultCount, 84);
  assert.equal(evaluation.taskCompletionRate, 1);
  assert.equal(evaluation.medianSusScore, 85);
  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.professionalReplacementClaimAllowed, true);
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("data loss or incomplete task outcomes keep replacement claims blocked", async () => {
  const { protocol } = await loadFixtures();
  const evidence = completeEvidence(protocol);
  evidence.sessions[0].taskResults[0].status = "blocked";
  evidence.sessions[0].taskResults[0].fatalDataLossCount = 1;

  const evaluation = evaluateProfessionalValidationEvidence(evidence, protocol);
  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.professionalReplacementClaimAllowed, false);
  assert.equal(evaluation.externalValidationRequired, true);
  assert.ok(evaluation.issues.some((issue) => issue.startsWith("fatal data loss")));
});

test("reused signature artifacts are rejected as non-independent attestations", async () => {
  const { protocol } = await loadFixtures();
  const evidence = completeEvidence(protocol);
  evidence.sessions[1].attestation.signatureArtifactSha256 =
    evidence.sessions[0].attestation.signatureArtifactSha256;

  assert.throws(
    () => validateProfessionalValidationEvidence(evidence, protocol),
    /signature artifact digests must be unique/u,
  );
});
