import { z } from "zod";

import {
  capabilitySchema,
  determinismLevelSchema,
  evaluateLicenseGate,
  providerDescriptorSchema,
} from "./descriptor";
import rawManifest from "./manifest/providers.json";

import type { ProviderDescriptor } from "./descriptor";

/**
 * The E01-E28 file is a candidate survey, not a runtime support manifest.
 *
 * In particular, parsing a CandidateEntry does not make an engine eligible for
 * EngineCapabilityRegistry registration. Runtime activation requires an exact
 * ProviderDescriptor plus independently verified evidence accepted by
 * validateProviderActivationEvidence().
 */
export const CANDIDATE_MANIFEST_SCHEMA_VERSION = 3 as const;
export const CANDIDATE_MANIFEST_CLAIM_SCOPE =
  "candidate-survey-only-not-runtime-support" as const;
export const CANDIDATE_MANIFEST_AUTHORITY =
  "docs/architecture/ToonStudio_V11_하이브리드엔진_장점조합_배치매트릭스.csv" as const;
export const MINIMUM_ACTIVATION_SOAK_HOURS = 8 as const;
export const MINIMUM_PRODUCT_WIDE_SOAK_HOURS = 24 as const;

export const candidateLicenseDispositionSchema = z.enum([
  "bundle-eligible",
  "isolated-only",
  "review-required",
  "internal-only",
]);
export type CandidateLicenseDisposition = z.infer<
  typeof candidateLicenseDispositionSchema
>;

/**
 * Classifies the survey's license string using the same hard gate as runtime
 * descriptors. Unknown and aggregate/mixed licenses are deliberately routed to
 * legal review and can never inherit bundle permission by omission.
 */
export function candidateLicenseDispositionFor(
  license: string,
): CandidateLicenseDisposition {
  if (license === "internal") return "internal-only";
  const gate = evaluateLicenseGate(license);
  if (gate.mode === "bundle") return "bundle-eligible";
  if (gate.mode === "isolated") return "isolated-only";
  return "review-required";
}

export const candidateEntrySchema = z
  .object({
    id: z.string().regex(/^E\d{2}$/),
    key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1),
    area: z.string().min(1),
    role: z.string().min(1),
    verdict: z.string().min(1),
    license: z.string().min(1),
    licenseDisposition: candidateLicenseDispositionSchema,
    url: z.string().url(),
  })
  .strict()
  .superRefine((entry, context) => {
    const expected = candidateLicenseDispositionFor(entry.license);
    if (entry.licenseDisposition !== expected) {
      context.addIssue({
        code: "custom",
        path: ["licenseDisposition"],
        message: `license ${entry.license} requires disposition ${expected}`,
      });
    }
  });
export type CandidateEntry = z.infer<typeof candidateEntrySchema>;
/** Explicit alias for callers migrating away from ambiguous "provider manifest" wording. */
export type CandidateSurveyEntry = CandidateEntry;

export const candidateManifestSchema = z
  .object({
    schemaVersion: z.literal(CANDIDATE_MANIFEST_SCHEMA_VERSION),
    claimScope: z.literal(CANDIDATE_MANIFEST_CLAIM_SCOPE),
    generatedFrom: z.literal(CANDIDATE_MANIFEST_AUTHORITY),
    entries: z.array(candidateEntrySchema).length(28),
  })
  .strict()
  .superRefine((manifest, context) => {
    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();
    const seenUrls = new Set<string>();

    manifest.entries.forEach((entry, index) => {
      const expectedId = `E${String(index + 1).padStart(2, "0")}`;
      if (entry.id !== expectedId) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "id"],
          message: `candidate ids must be the ordered contiguous range E01-E28; expected ${expectedId}`,
        });
      }

      for (const [field, value, seen] of [
        ["id", entry.id, seenIds],
        ["key", entry.key, seenKeys],
        ["url", entry.url, seenUrls],
      ] as const) {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            path: ["entries", index, field],
            message: `duplicate candidate ${field}: ${value}`,
          });
        }
        seen.add(value);
      }
    });
  });
export type CandidateManifest = z.infer<typeof candidateManifestSchema>;
/** Explicit alias emphasizing that this object contains no support claims. */
export type CandidateSurveyManifest = CandidateManifest;

export function parseCandidateManifest(input: unknown): CandidateManifest {
  return candidateManifestSchema.parse(input);
}

export function loadCandidateManifest(): CandidateManifest {
  return parseCandidateManifest(rawManifest);
}

export function findCandidate(idOrKey: string): CandidateEntry | null {
  const manifest = loadCandidateManifest();
  return (
    manifest.entries.find(
      (entry) => entry.id === idOrKey || entry.key === idOrKey,
    ) ?? null
  );
}

const sha256DigestSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "digest must be a lowercase SHA-256 hex string");

export const activationArtifactSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .refine(
        (path) =>
          !path.startsWith("/") &&
          !path.includes("\\") &&
          !path.split("/").includes(".."),
        "artifact path must be repository-relative and must not traverse parents",
      ),
    sha256: sha256DigestSchema,
  })
  .strict();
export type ActivationArtifact = z.infer<typeof activationArtifactSchema>;

const exactVersionPinSchema = z
  .string()
  .min(1)
  .refine(
    (version) =>
      !/[\s~^*<>=|]/u.test(version) &&
      !/(?:^|[.-])[xX](?:$|[.-])/u.test(version) &&
      !/^(?:latest|next|main|master|head)$/iu.test(version),
    "version must be an immutable exact pin, not a range, branch, or dist-tag",
  );
const commitPinSchema = z
  .string()
  .regex(/^[a-f0-9]{7,64}$/i, "commit must be a 7-64 digit hexadecimal pin");

function uniqueStringArray<T extends z.ZodType<string>>(item: T, minimum: 0 | 1) {
  const array = minimum === 1 ? z.array(item).min(1) : z.array(item);
  return array.superRefine((values, context) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `duplicate value: ${value}`,
        });
      }
      seen.add(value);
    });
  });
}

const exactCapabilitySetSchema = uniqueStringArray(capabilitySchema, 1);
const exactLimitationSetSchema = uniqueStringArray(z.string().min(1), 0);

export const providerActivationEvidenceSchema = z
  .object({
    schemaVersion: z.literal(2),
    candidate: z
      .object({
        id: z.string().regex(/^E\d{2}$/),
        key: z.string().min(1),
      })
      .strict(),
    sourcePin: z
      .object({
        providerId: z.string().min(1),
        version: exactVersionPinSchema,
        commit: commitPinSchema.nullable(),
        lockArtifact: activationArtifactSchema,
      })
      .strict(),
    capabilities: exactCapabilitySetSchema,
    limitations: exactLimitationSetSchema,
    license: z
      .object({
        candidateLicense: z.string().min(1),
        candidateDisposition: candidateLicenseDispositionSchema,
        descriptorLicense: z.string().min(1),
        gateMode: z.enum(["bundle", "isolated"]),
        deployment: z.enum([
          "main-bundle",
          "dedicated-worker",
          "native-bridge",
          "server-process",
        ]),
        reviewArtifact: activationArtifactSchema.nullable(),
      })
      .strict(),
    deploymentCost: z
      .object({
        bundleBytes: z.number().int().nonnegative(),
        workerBytes: z.number().int().nonnegative(),
        workerStartupMs: z.number().nonnegative(),
        rawArtifact: activationArtifactSchema,
      })
      .strict(),
    visualQuality: z
      .object({
        metric: z.string().min(1),
        score: z.number().min(0).max(1),
        sampleCount: z.number().int().positive(),
        corpusScope: z.enum(["bounded-corpus", "product-workflows"]),
        coveredCapabilities: exactCapabilitySetSchema,
        rawArtifact: activationArtifactSchema,
      })
      .strict(),
    latency: z
      .object({
        p50Ms: z.number().nonnegative(),
        p95Ms: z.number().nonnegative(),
        p99Ms: z.number().nonnegative(),
        sampleCount: z.number().int().positive(),
        rawArtifact: activationArtifactSchema,
      })
      .strict()
      .superRefine((latency, context) => {
        if (latency.p50Ms > latency.p95Ms || latency.p95Ms > latency.p99Ms) {
          context.addIssue({
            code: "custom",
            path: ["p99Ms"],
            message: "latency percentiles must satisfy p50 <= p95 <= p99",
          });
        }
      }),
    peakMemoryMb: z
      .object({
        cpu: z.number().nonnegative(),
        gpu: z.number().nonnegative(),
        wasm: z.number().nonnegative(),
        rawArtifact: activationArtifactSchema,
      })
      .strict(),
    determinism: z
      .object({
        level: determinismLevelSchema,
        verified: z.boolean(),
        rawArtifact: activationArtifactSchema,
      })
      .strict(),
    failureIsolation: z
      .object({
        result: z.enum(["pass", "fail", "unverified"]),
        behavior: z.literal("fail-closed"),
        scenarios: uniqueStringArray(z.string().min(1), 1),
        rawArtifact: activationArtifactSchema,
      })
      .strict(),
    owner: z
      .object({
        team: z.string().min(1),
        accountable: z.string().min(1),
      })
      .strict(),
    soak: z
      .object({
        result: z.enum(["pass", "fail", "unverified"]),
        durationHours: z.number().nonnegative(),
        completedAt: z.iso.datetime({ offset: true }),
        rawArtifact: activationArtifactSchema,
      })
      .strict(),
    faultInjection: z
      .object({
        result: z.enum(["pass", "fail", "unverified"]),
        scenarios: uniqueStringArray(z.string().min(1), 1),
        rawArtifact: activationArtifactSchema,
      })
      .strict(),
    promotion: z
      .object({
        scope: z.enum(["capability-set", "product-wide"]),
        capabilities: exactCapabilitySetSchema,
      })
      .strict(),
  })
  .strict();
export type ProviderActivationEvidence = z.infer<
  typeof providerActivationEvidenceSchema
>;

export const providerActivationPolicySchema = z
  .object({
    minimumVisualQuality: z.number().min(0).max(1),
    minimumSoakHours: z.number().min(MINIMUM_ACTIVATION_SOAK_HOURS),
    minimumProductWideSoakHours: z
      .number()
      .min(MINIMUM_PRODUCT_WIDE_SOAK_HOURS),
    verifiedArtifactDigests: z.record(z.string(), sha256DigestSchema),
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.minimumProductWideSoakHours < policy.minimumSoakHours) {
      context.addIssue({
        code: "custom",
        path: ["minimumProductWideSoakHours"],
        message: "product-wide soak cannot be shorter than the baseline soak",
      });
    }
  });
export type ProviderActivationPolicy = z.infer<
  typeof providerActivationPolicySchema
>;

export interface VerifiedProviderActivation {
  readonly status: "verified-activation";
  readonly candidate: CandidateEntry;
  readonly descriptor: ProviderDescriptor;
  readonly evidence: ProviderActivationEvidence;
  readonly promotionScope: ProviderActivationEvidence["promotion"];
}

interface VerifiedProviderActivationIssuance {
  readonly candidate: CandidateEntry;
  readonly descriptor: ProviderDescriptor;
  readonly evidence: ProviderActivationEvidence;
  readonly promotionScope: ProviderActivationEvidence["promotion"];
  readonly descriptorFingerprint: string;
}

/**
 * Runtime issuance ledger for activation capabilities.
 *
 * VerifiedProviderActivation is intentionally not trusted structurally. A
 * caller can deserialize or cast an object with the same public fields, but it
 * cannot add that object to this module-private WeakMap. The registry consumes
 * activation objects through resolveVerifiedProviderActivationDescriptor(),
 * which checks both issuance identity and the frozen descriptor snapshot.
 */
const verifiedProviderActivationIssuances = new WeakMap<
  object,
  VerifiedProviderActivationIssuance
>();

export class ProviderActivationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`provider activation rejected: ${issues.join("; ")}`);
    this.name = "ProviderActivationError";
    this.issues = [...issues];
  }
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function descriptorIntegrityFingerprint(descriptor: ProviderDescriptor): string {
  return JSON.stringify(descriptor);
}

/**
 * Resolves an activation capability issued by
 * validateProviderActivationEvidence(). Structural lookalikes, clones,
 * proxies, and objects whose descriptor reference or capability snapshot was
 * swapped all fail closed.
 */
export function resolveVerifiedProviderActivationDescriptor(
  input: unknown,
): ProviderDescriptor {
  if (input === null || typeof input !== "object") {
    throw new ProviderActivationError([
      "activation capability was not issued by validateProviderActivationEvidence",
    ]);
  }

  const issuance = verifiedProviderActivationIssuances.get(input);
  if (issuance === undefined) {
    throw new ProviderActivationError([
      "activation capability was not issued by validateProviderActivationEvidence",
    ]);
  }

  const activation = input as VerifiedProviderActivation;
  const descriptorResult = providerDescriptorSchema.safeParse(activation.descriptor);
  const integrityMatches =
    activation.status === "verified-activation" &&
    activation.candidate === issuance.candidate &&
    activation.descriptor === issuance.descriptor &&
    activation.evidence === issuance.evidence &&
    activation.promotionScope === issuance.promotionScope &&
    descriptorResult.success &&
    descriptorIntegrityFingerprint(activation.descriptor) ===
      issuance.descriptorFingerprint &&
    Object.isFrozen(activation) &&
    Object.isFrozen(activation.descriptor) &&
    Object.isFrozen(activation.descriptor.capabilities);

  if (!integrityMatches) {
    throw new ProviderActivationError([
      "issued activation capability failed descriptor identity or integrity verification",
    ]);
  }

  return issuance.descriptor;
}

function formatSchemaIssues(label: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
    return `${label}${path}: ${issue.message}`;
  });
}

function activationArtifacts(evidence: ProviderActivationEvidence): ActivationArtifact[] {
  const artifacts = [
    evidence.sourcePin.lockArtifact,
    evidence.deploymentCost.rawArtifact,
    evidence.visualQuality.rawArtifact,
    evidence.latency.rawArtifact,
    evidence.peakMemoryMb.rawArtifact,
    evidence.determinism.rawArtifact,
    evidence.failureIsolation.rawArtifact,
    evidence.soak.rawArtifact,
    evidence.faultInjection.rawArtifact,
  ];
  if (evidence.license.reviewArtifact !== null) {
    artifacts.push(evidence.license.reviewArtifact);
  }
  return artifacts;
}

/**
 * Verifies that measured evidence belongs to this exact descriptor and survey
 * candidate. The function is intentionally side-effect free: callers may only
 * register the returned descriptor after this verification succeeds.
 *
 * Artifact hashes are not trusted merely because evidence declares them. The
 * caller must provide content-verified SHA-256 values in policy; a missing or
 * mismatched path fails closed.
 */
export function validateProviderActivationEvidence(
  descriptorInput: unknown,
  evidenceInput: unknown,
  policyInput: unknown,
  manifestInput: unknown = rawManifest,
): VerifiedProviderActivation {
  const descriptorResult = providerDescriptorSchema.safeParse(descriptorInput);
  const evidenceResult = providerActivationEvidenceSchema.safeParse(evidenceInput);
  const policyResult = providerActivationPolicySchema.safeParse(policyInput);
  const manifestResult = candidateManifestSchema.safeParse(manifestInput);
  const schemaIssues: string[] = [];

  if (!descriptorResult.success) {
    schemaIssues.push(...formatSchemaIssues("descriptor", descriptorResult.error));
  }
  if (!evidenceResult.success) {
    schemaIssues.push(...formatSchemaIssues("evidence", evidenceResult.error));
  }
  if (!policyResult.success) {
    schemaIssues.push(...formatSchemaIssues("policy", policyResult.error));
  }
  if (!manifestResult.success) {
    schemaIssues.push(...formatSchemaIssues("manifest", manifestResult.error));
  }
  if (
    !descriptorResult.success ||
    !evidenceResult.success ||
    !policyResult.success ||
    !manifestResult.success
  ) {
    throw new ProviderActivationError(schemaIssues);
  }

  const descriptor = descriptorResult.data;
  const evidence = evidenceResult.data;
  const policy = policyResult.data;
  const manifest = manifestResult.data;
  const issues: string[] = [];
  const candidate = manifest.entries.find(
    (entry) =>
      entry.id === evidence.candidate.id && entry.key === evidence.candidate.key,
  );

  if (!candidate) {
    issues.push(
      `candidate ${evidence.candidate.id}/${evidence.candidate.key} is absent or id/key are stale`,
    );
  }

  if (evidence.sourcePin.providerId !== descriptor.id) {
    issues.push("sourcePin.providerId does not match descriptor.id");
  }
  if (evidence.sourcePin.version !== descriptor.version) {
    issues.push("sourcePin.version does not match descriptor.version");
  }
  const descriptorCommit = descriptor.commit ?? null;
  if (evidence.sourcePin.commit !== descriptorCommit) {
    issues.push("sourcePin.commit does not match descriptor.commit");
  }
  if (!sameStringSet(evidence.capabilities, descriptor.capabilities)) {
    issues.push("evidence capabilities do not exactly match descriptor capabilities");
  }
  if (!sameStringSet(evidence.limitations, descriptor.limitations)) {
    issues.push("evidence limitations do not exactly match descriptor limitations");
  }

  if (candidate) {
    if (evidence.license.candidateLicense !== candidate.license) {
      issues.push("evidence candidate license is stale");
    }
    if (evidence.license.candidateDisposition !== candidate.licenseDisposition) {
      issues.push("evidence candidate license disposition is stale");
    }
  }
  if (evidence.license.descriptorLicense !== descriptor.license) {
    issues.push("evidence descriptor license does not match descriptor.license");
  }

  const licenseGate = evaluateLicenseGate(descriptor.license);
  if (licenseGate.mode === "rejected") {
    issues.push(`descriptor failed license gate: ${licenseGate.reason}`);
  } else if (evidence.license.gateMode !== licenseGate.mode) {
    issues.push("evidence license gate mode does not match the runtime hard gate");
  }

  const isIsolatedDeployment = evidence.license.deployment !== "main-bundle";
  if (licenseGate.mode === "isolated" && !isIsolatedDeployment) {
    issues.push("isolation-only license cannot be deployed in the main bundle");
  }
  if (candidate?.licenseDisposition === "isolated-only" && !isIsolatedDeployment) {
    issues.push("candidate isolation disposition requires an isolated deployment");
  }
  if (candidate?.licenseDisposition === "review-required") {
    if (evidence.license.reviewArtifact === null) {
      issues.push("mixed or unknown candidate license requires reviewed legal evidence");
    }
    if (!isIsolatedDeployment) {
      issues.push("mixed or unknown candidate license cannot be silently main-bundled");
    }
  }
  if (
    candidate?.licenseDisposition === "bundle-eligible" &&
    licenseGate.mode !== "bundle"
  ) {
    issues.push("candidate bundle disposition does not cover the descriptor license");
  }
  if (
    candidate?.licenseDisposition === "internal-only" &&
    descriptor.license !== "internal"
  ) {
    issues.push("internal-only candidate requires an internal descriptor license");
  }

  for (const artifact of activationArtifacts(evidence)) {
    const verifiedDigest = policy.verifiedArtifactDigests[artifact.path];
    if (verifiedDigest === undefined) {
      issues.push(`artifact digest was not independently verified: ${artifact.path}`);
    } else if (verifiedDigest !== artifact.sha256) {
      issues.push(`artifact digest mismatch: ${artifact.path}`);
    }
  }

  if (evidence.visualQuality.score < policy.minimumVisualQuality) {
    issues.push(
      `visual quality ${evidence.visualQuality.score} is below floor ${policy.minimumVisualQuality}`,
    );
  }
  if (
    !evidence.promotion.capabilities.every((capability) =>
      descriptor.capabilities.includes(capability),
    )
  ) {
    issues.push("promotion claims capabilities absent from the descriptor");
  }
  if (
    !evidence.promotion.capabilities.every((capability) =>
      evidence.visualQuality.coveredCapabilities.includes(capability),
    )
  ) {
    issues.push("promotion claims capabilities absent from visual-quality coverage");
  }
  if (
    evidence.promotion.scope === "product-wide" &&
    evidence.visualQuality.corpusScope === "bounded-corpus"
  ) {
    issues.push("bounded corpus cannot support a product-wide promotion claim");
  }
  if (
    evidence.promotion.scope === "product-wide" &&
    !sameStringSet(evidence.promotion.capabilities, descriptor.capabilities)
  ) {
    issues.push("product-wide promotion must cover the descriptor's exact capabilities");
  }

  if (evidence.determinism.level !== descriptor.determinism) {
    issues.push("determinism evidence does not match descriptor.determinism");
  }
  if (!evidence.determinism.verified) {
    issues.push("determinism result is unverified");
  }

  if (evidence.failureIsolation.result !== "pass") {
    issues.push("failure-isolation result is not verified passing evidence");
  }
  if (
    !evidence.faultInjection.scenarios.every((scenario) =>
      evidence.failureIsolation.scenarios.includes(scenario),
    )
  ) {
    issues.push(
      "failure-isolation evidence must cover every fault-injection scenario",
    );
  }

  if (evidence.soak.result !== "pass") {
    issues.push("soak result is not verified passing evidence");
  }
  const requiredSoakHours =
    evidence.promotion.scope === "product-wide"
      ? policy.minimumProductWideSoakHours
      : policy.minimumSoakHours;
  if (evidence.soak.durationHours < requiredSoakHours) {
    issues.push(
      `soak duration ${evidence.soak.durationHours}h is below required ${requiredSoakHours}h`,
    );
  }
  if (evidence.faultInjection.result !== "pass") {
    issues.push("fault-injection result is not verified passing evidence");
  }

  if (issues.length > 0 || !candidate) {
    throw new ProviderActivationError(issues);
  }

  const frozenCandidate = deepFreeze(candidate);
  const frozenDescriptor = deepFreeze(descriptor);
  const frozenEvidence = deepFreeze(evidence);

  const activation: VerifiedProviderActivation = Object.freeze({
    status: "verified-activation" as const,
    candidate: frozenCandidate,
    descriptor: frozenDescriptor,
    evidence: frozenEvidence,
    promotionScope: frozenEvidence.promotion,
  });
  verifiedProviderActivationIssuances.set(activation, {
    candidate: frozenCandidate,
    descriptor: frozenDescriptor,
    evidence: frozenEvidence,
    promotionScope: frozenEvidence.promotion,
    descriptorFingerprint: descriptorIntegrityFingerprint(frozenDescriptor),
  });
  return activation;
}
