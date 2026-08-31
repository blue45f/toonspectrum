import { describe, expect, it } from "vitest";

import { providerDescriptorSchema } from "../descriptor";
import {
  registerFilterProviders,
  wasmVipsPipelineDescriptor,
} from "../filter-providers";
import {
  CANDIDATE_MANIFEST_AUTHORITY,
  CANDIDATE_MANIFEST_CLAIM_SCOPE,
  CANDIDATE_MANIFEST_SCHEMA_VERSION,
  MINIMUM_ACTIVATION_SOAK_HOURS,
  MINIMUM_PRODUCT_WIDE_SOAK_HOURS,
  ProviderActivationError,
  candidateEntrySchema,
  candidateLicenseDispositionFor,
  findCandidate,
  loadCandidateManifest,
  parseCandidateManifest,
  validateProviderActivationEvidence,
} from "../manifest";
import {
  EngineCapabilityRegistry,
  ProviderRegistrationError,
  declareTrustedBootstrapProvider,
} from "../registry";

import type { ProviderDescriptor } from "../descriptor";
import type {
  ActivationArtifact,
  CandidateManifest,
  ProviderActivationEvidence,
  ProviderActivationPolicy,
  VerifiedProviderActivation,
} from "../manifest";
import type { TrustedBootstrapProvider } from "../registry";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function artifact(name: string, sha256 = SHA_A): ActivationArtifact {
  return {
    path: `tests/benchmarks/results/manifest-governance-${name}.json`,
    sha256,
  };
}

function descriptor(
  overrides: Partial<ProviderDescriptor> = {},
): ProviderDescriptor {
  return {
    id: "vello-cpu",
    kind: "vector-renderer",
    displayName: "Vello CPU",
    version: "0.2.0",
    commit: "abcdef1234567",
    license: "MIT / Apache-2.0",
    attribution: "Linebender",
    maturity: "conditional",
    runtime: "wasm-worker",
    capabilities: ["render.vector.fill", "render.vector.stroke"],
    limitations: ["bounded reference corpus only"],
    previewQuality: "production",
    finalQuality: "reference",
    determinism: "bit-exact",
    memoryEstimateMb: 32,
    knownIssues: [],
    ...overrides,
  };
}

function evidence(): ProviderActivationEvidence {
  return {
    schemaVersion: 2,
    candidate: { id: "E04", key: "vello-cpu" },
    sourcePin: {
      providerId: "vello-cpu",
      version: "0.2.0",
      commit: "abcdef1234567",
      lockArtifact: artifact("source-lock"),
    },
    capabilities: ["render.vector.fill", "render.vector.stroke"],
    limitations: ["bounded reference corpus only"],
    license: {
      candidateLicense: "MIT / Apache-2.0",
      candidateDisposition: "bundle-eligible",
      descriptorLicense: "MIT / Apache-2.0",
      gateMode: "bundle",
      deployment: "dedicated-worker",
      reviewArtifact: null,
    },
    deploymentCost: {
      bundleBytes: 4_200_000,
      workerBytes: 4_000_000,
      workerStartupMs: 12.5,
      rawArtifact: artifact("deployment-cost"),
    },
    visualQuality: {
      metric: "normalized-fuzzy-visual-quality",
      score: 0.98,
      sampleCount: 512,
      corpusScope: "bounded-corpus",
      coveredCapabilities: ["render.vector.fill", "render.vector.stroke"],
      rawArtifact: artifact("visual-quality"),
    },
    latency: {
      p50Ms: 2,
      p95Ms: 4,
      p99Ms: 7,
      sampleCount: 200,
      rawArtifact: artifact("latency"),
    },
    peakMemoryMb: {
      cpu: 8,
      gpu: 0,
      wasm: 32,
      rawArtifact: artifact("memory"),
    },
    determinism: {
      level: "bit-exact",
      verified: true,
      rawArtifact: artifact("determinism"),
    },
    failureIsolation: {
      result: "pass",
      behavior: "fail-closed",
      scenarios: ["worker-crash", "gpu-device-loss"],
      rawArtifact: artifact("failure-isolation"),
    },
    owner: {
      team: "studio-rendering",
      accountable: "renderer-oncall",
    },
    soak: {
      result: "pass",
      durationHours: 8,
      completedAt: "2026-08-11T00:00:00.000Z",
      rawArtifact: artifact("soak"),
    },
    faultInjection: {
      result: "pass",
      scenarios: ["worker-crash", "gpu-device-loss"],
      rawArtifact: artifact("fault"),
    },
    promotion: {
      scope: "capability-set",
      capabilities: ["render.vector.fill", "render.vector.stroke"],
    },
  };
}

function allArtifacts(value: ProviderActivationEvidence): ActivationArtifact[] {
  const artifacts = [
    value.sourcePin.lockArtifact,
    value.deploymentCost.rawArtifact,
    value.visualQuality.rawArtifact,
    value.latency.rawArtifact,
    value.peakMemoryMb.rawArtifact,
    value.determinism.rawArtifact,
    value.failureIsolation.rawArtifact,
    value.soak.rawArtifact,
    value.faultInjection.rawArtifact,
  ];
  if (value.license.reviewArtifact !== null) {
    artifacts.push(value.license.reviewArtifact);
  }
  return artifacts;
}

function policyFor(value: ProviderActivationEvidence): ProviderActivationPolicy {
  return {
    minimumVisualQuality: 0.9,
    minimumSoakHours: 8,
    minimumProductWideSoakHours: 24,
    verifiedArtifactDigests: Object.fromEntries(
      allArtifacts(value).map((item) => [item.path, item.sha256]),
    ),
  };
}

function cloneManifest(): CandidateManifest {
  return structuredClone(loadCandidateManifest());
}

describe("candidate survey manifest governance", () => {
  it("pins schema, non-support claim scope, authority, and E01-E28 continuity", () => {
    const manifest = loadCandidateManifest();

    expect(manifest.schemaVersion).toBe(CANDIDATE_MANIFEST_SCHEMA_VERSION);
    expect(manifest.claimScope).toBe(CANDIDATE_MANIFEST_CLAIM_SCOPE);
    expect(manifest.generatedFrom).toBe(CANDIDATE_MANIFEST_AUTHORITY);
    expect(manifest.entries.map((entry) => entry.id)).toEqual(
      Array.from({ length: 28 }, (_, index) =>
        `E${String(index + 1).padStart(2, "0")}`,
      ),
    );
  });

  it("keeps id, key, and URL unique", () => {
    const entries = loadCandidateManifest().entries;

    for (const field of ["id", "key", "url"] as const) {
      expect(new Set(entries.map((entry) => entry[field])).size).toBe(28);
    }
  });

  it("describes Google Ink and Perfect Freehand plus Lyon as separately selected paths", () => {
    const googleInk = findCandidate("google-ink");
    const perfectFreehandLyon = findCandidate("perfect-freehand-lyon");

    expect(googleInk?.verdict).toBe("PoC 후 주력 후보");
    expect(perfectFreehandLyon).toMatchObject({
      role: "Google Ink와 별도 명시 선택, 기술 펜, 경량 vector stroke, deterministic export geometry",
      verdict: "명시 선택 독립 경로",
    });
    expect(perfectFreehandLyon?.role).not.toContain("폴백");
    expect(perfectFreehandLyon?.verdict).not.toContain("폴백");
  });

  it("rejects a stale generatedFrom authority path", () => {
    const manifest = {
      ...cloneManifest(),
      generatedFrom: "docs/architecture/copied-or-stale.csv",
    };

    expect(() => parseCandidateManifest(manifest)).toThrow();
  });

  it.each(["id", "key", "url"] as const)(
    "rejects a duplicate candidate %s",
    (field) => {
      const manifest = cloneManifest();
      const first = manifest.entries[0];
      const second = manifest.entries[1] as unknown as Record<string, unknown>;
      second[field] = first?.[field];

      expect(() => parseCandidateManifest(manifest)).toThrow(
        new RegExp(`duplicate candidate ${field}`),
      );
    },
  );

  it("rejects missing or reordered ids even when there are still 28 rows", () => {
    const manifest = cloneManifest();
    const first = manifest.entries[0];
    const second = manifest.entries[1];
    if (!first || !second) throw new Error("fixture requires E01 and E02");
    manifest.entries[0] = second;
    manifest.entries[1] = first;

    expect(() => parseCandidateManifest(manifest)).toThrow(
      /ordered contiguous range E01-E28/,
    );

    const missing = cloneManifest() as unknown as { entries: unknown[] };
    missing.entries.pop();
    expect(() => parseCandidateManifest(missing)).toThrow();
  });

  it("rejects false runtime-support fields on strict survey entries", () => {
    const candidate = findCandidate("E04");
    expect(candidate).not.toBeNull();

    expect(
      candidateEntrySchema.safeParse({
        ...candidate,
        runtimeSupported: true,
        activationComplete: true,
      }).success,
    ).toBe(false);
  });

  it("classifies permissive, isolated, mixed/unknown, and internal licenses", () => {
    expect(candidateLicenseDispositionFor("MIT")).toBe("bundle-eligible");
    expect(candidateLicenseDispositionFor("LGPL-2.1-or-later")).toBe(
      "isolated-only",
    );
    expect(candidateLicenseDispositionFor("mixed")).toBe("review-required");
    expect(candidateLicenseDispositionFor("Unknown-Proprietary")).toBe(
      "review-required",
    );
    expect(candidateLicenseDispositionFor("internal")).toBe("internal-only");
  });

  it("never lets mixed or unknown licenses inherit bundle disposition", () => {
    const candidate = loadCandidateManifest().entries[0];
    expect(candidate).toBeDefined();

    for (const license of ["mixed", "Unknown-Proprietary"]) {
      expect(
        candidateEntrySchema.safeParse({
          ...candidate,
          license,
          licenseDisposition: "bundle-eligible",
        }).success,
      ).toBe(false);
      expect(
        candidateEntrySchema.safeParse({
          ...candidate,
          license,
          licenseDisposition: "review-required",
        }).success,
      ).toBe(true);
    }
  });

  it("pins every checked-in license string to its explicit disposition", () => {
    const manifest = cloneManifest();
    const entry = manifest.entries[16];
    if (!entry) throw new Error("fixture requires E17");
    entry.licenseDisposition = "bundle-eligible";

    expect(() => parseCandidateManifest(manifest)).toThrow(
      /requires disposition isolated-only/,
    );
  });
});

describe("candidate survey versus runtime activation", () => {
  it("does not parse or register a candidate entry as a ProviderDescriptor", () => {
    const candidate = findCandidate("E04");
    if (!candidate) throw new Error("fixture requires E04");
    const registry = new EngineCapabilityRegistry();

    expect(providerDescriptorSchema.safeParse(candidate).success).toBe(false);
    expect(() =>
      registry.register(candidate as unknown as ProviderDescriptor),
    ).toThrow();
    expect(registry.list()).toHaveLength(0);
  });

  it("validates evidence without mutating the registry, then exposes the exact descriptor", () => {
    const runtimeDescriptor = descriptor();
    const activationEvidence = evidence();
    const registry = new EngineCapabilityRegistry();

    const verified = validateProviderActivationEvidence(
      runtimeDescriptor,
      activationEvidence,
      policyFor(activationEvidence),
    );

    expect(verified.status).toBe("verified-activation");
    expect(verified.candidate.id).toBe("E04");
    expect(verified.descriptor).toEqual(runtimeDescriptor);
    expect(Object.isFrozen(verified.descriptor)).toBe(true);
    expect(Object.isFrozen(verified.descriptor.capabilities)).toBe(true);
    expect(Object.isFrozen(verified.evidence.visualQuality)).toBe(true);
    expect(() =>
      verified.descriptor.capabilities.push("render.text.paragraph"),
    ).toThrow(TypeError);
    expect(registry.list()).toHaveLength(0);

    const registered = registry.registerVerifiedActivation(verified);
    expect(registered.descriptor).toBe(verified.descriptor);
    expect(registered.authority).toEqual({
      kind: "verified-activation",
      candidateId: "E04",
      candidateKey: "vello-cpu",
      promotionScope: "capability-set",
    });
    expect(registry.get("vello-cpu")?.descriptor.version).toBe("0.2.0");
  });

  it("rejects cloned, forged, and descriptor-swapped activation capabilities", () => {
    const activationEvidence = evidence();
    const verified = validateProviderActivationEvidence(
      descriptor(),
      activationEvidence,
      policyFor(activationEvidence),
    );

    const exactStructuralClone = {
      ...verified,
    } as unknown as VerifiedProviderActivation;
    const swappedDescriptor = {
      ...verified,
      descriptor: descriptor({
        id: "attacker-swapped-provider",
        capabilities: ["render.vector.fill"],
      }),
    } as unknown as VerifiedProviderActivation;

    for (const forged of [exactStructuralClone, swappedDescriptor]) {
      const registry = new EngineCapabilityRegistry();
      expect(() => registry.registerVerifiedActivation(forged)).toThrowError(
        expect.objectContaining({
          name: "ProviderRegistrationError",
          code: "INVALID_VERIFIED_ACTIVATION",
        }),
      );
      expect(registry.list()).toHaveLength(0);
    }

    expect(Reflect.set(verified, "descriptor", swappedDescriptor.descriptor)).toBe(
      false,
    );
    const registry = new EngineCapabilityRegistry();
    expect(registry.registerVerifiedActivation(verified).descriptor).toBe(
      verified.descriptor,
    );
  });

  it("accepts a production baseline only through an opaque trusted-bootstrap capability", () => {
    const baseline = descriptor({
      id: "checked-in-baseline",
      maturity: "production-baseline",
    });
    const audit = {
      classification: "checked-in-production-baseline" as const,
      source:
        "packages/studio-engine-registry/src/__tests__/manifest-governance.test.ts",
      owner: "studio-engine-registry",
      justification: "bounded bootstrap-governance fixture",
    };
    const registry = new EngineCapabilityRegistry();

    expect(() => registry.register(baseline)).toThrowError(
      expect.objectContaining({ code: "RAW_DESCRIPTOR_FORBIDDEN" }),
    );
    expect(() =>
      registry.registerTrustedBootstrap({
        status: "trusted-bootstrap-provider",
        descriptor: baseline,
        audit,
      } as TrustedBootstrapProvider),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_TRUSTED_BOOTSTRAP" }),
    );

    const bootstrap = declareTrustedBootstrapProvider(baseline, audit);
    const registered = registry.registerTrustedBootstrap(bootstrap);
    expect(registered.descriptor.id).toBe("checked-in-baseline");
    expect(registered.authority).toMatchObject({
      kind: "trusted-bootstrap",
      source: audit.source,
      owner: audit.owner,
    });
  });

  it("keeps candidate descriptors and the candidate manifest outside bootstrap authority", () => {
    const audit = {
      classification: "checked-in-production-baseline" as const,
      source:
        "packages/studio-engine-registry/src/__tests__/manifest-governance.test.ts",
      owner: "studio-engine-registry",
      justification: "negative candidate-governance fixture",
    };
    expect(() => declareTrustedBootstrapProvider(descriptor(), audit)).toThrowError(
      expect.objectContaining({ code: "INVALID_TRUSTED_BOOTSTRAP" }),
    );

    const registry = new EngineCapabilityRegistry();
    const candidateManifest = loadCandidateManifest();
    expect(() =>
      registry.registerVerifiedActivation(
        candidateManifest as unknown as VerifiedProviderActivation,
      ),
    ).toThrow(ProviderRegistrationError);
    expect(() =>
      registry.registerTrustedBootstrap(
        candidateManifest as unknown as TrustedBootstrapProvider,
      ),
    ).toThrow(ProviderRegistrationError);
    expect(registry.list()).toHaveLength(0);
  });

  it("registers only checked-in filter baselines and leaves the vips candidate inactive", () => {
    const registry = new EngineCapabilityRegistry();
    registerFilterProviders(registry);

    expect(registry.get("canvaskit-imagefilter")?.authority.kind).toBe(
      "trusted-bootstrap",
    );
    expect(registry.get("opencv-image-worker")?.authority.kind).toBe(
      "trusted-bootstrap",
    );
    expect(wasmVipsPipelineDescriptor.maturity).toBe("candidate");
    expect(registry.get(wasmVipsPipelineDescriptor.id)).toBeNull();
  });

  it("isolates candidate-like fixtures without inventing product-wide soak evidence", () => {
    const governed = new EngineCapabilityRegistry();
    expect(() => governed.registerTestFixture(descriptor())).toThrowError(
      expect.objectContaining({ code: "TEST_FIXTURE_CONTEXT_REQUIRED" }),
    );

    const fixtureRegistry = EngineCapabilityRegistry.forTestFixtures();
    const registered = fixtureRegistry.registerTestFixture(descriptor());
    expect(registered.authority).toEqual({
      kind: "test-fixture",
      source: "EngineCapabilityRegistry.forTestFixtures",
    });
    expect(fixtureRegistry.query("vector-renderer", ["render.vector.fill"])).toEqual([
      registered,
    ]);
  });

  it("treats capability and limitation order as non-semantic but requires exact sets", () => {
    const activationEvidence = evidence();
    activationEvidence.capabilities.reverse();
    activationEvidence.visualQuality.coveredCapabilities.reverse();
    activationEvidence.promotion.capabilities.reverse();

    expect(
      validateProviderActivationEvidence(
        descriptor(),
        activationEvidence,
        policyFor(activationEvidence),
      ).status,
    ).toBe("verified-activation");
  });
});

describe("activation evidence fail-closed gates", () => {
  it.each([
    "deploymentCost",
    "visualQuality",
    "latency",
    "peakMemoryMb",
    "determinism",
    "failureIsolation",
    "owner",
    "soak",
    "faultInjection",
    "promotion",
  ] as const)("rejects missing %s evidence", (field) => {
    const validEvidence = evidence();
    const invalid = structuredClone(validEvidence) as unknown as Record<
      string,
      unknown
    >;
    delete invalid[field];

    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        invalid,
        policyFor(validEvidence),
      ),
    ).toThrow(ProviderActivationError);
  });

  it.each([
    ["visual score", (value: ProviderActivationEvidence) => ({
      ...value,
      visualQuality: { ...value.visualQuality, score: null },
    })],
    ["latency p95", (value: ProviderActivationEvidence) => ({
      ...value,
      latency: { ...value.latency, p95Ms: null },
    })],
    ["peak GPU memory", (value: ProviderActivationEvidence) => ({
      ...value,
      peakMemoryMb: { ...value.peakMemoryMb, gpu: null },
    })],
    ["worker startup", (value: ProviderActivationEvidence) => ({
      ...value,
      deploymentCost: { ...value.deploymentCost, workerStartupMs: null },
    })],
  ] as const)("rejects null measured field: %s", (_label, mutate) => {
    const validEvidence = evidence();

    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        mutate(validEvidence),
        policyFor(validEvidence),
      ),
    ).toThrow(ProviderActivationError);
  });

  it.each([
    ["version", (value: ProviderActivationEvidence) => {
      value.sourcePin.version = "0.2.1";
    }, /sourcePin.version/],
    ["commit", (value: ProviderActivationEvidence) => {
      value.sourcePin.commit = "1234567890abc";
    }, /sourcePin.commit/],
    ["candidate license", (value: ProviderActivationEvidence) => {
      value.license.candidateLicense = "MIT";
    }, /candidate license is stale/],
    ["descriptor license", (value: ProviderActivationEvidence) => {
      value.license.descriptorLicense = "MIT";
    }, /descriptor license/],
    ["capabilities", (value: ProviderActivationEvidence) => {
      value.capabilities = ["render.vector.fill"];
    }, /capabilities do not exactly match/],
    ["limitations", (value: ProviderActivationEvidence) => {
      value.limitations = [];
    }, /limitations do not exactly match/],
  ] as const)("rejects stale %s evidence", (_label, mutate, message) => {
    const activationEvidence = evidence();
    mutate(activationEvidence);

    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        activationEvidence,
        policyFor(activationEvidence),
      ),
    ).toThrow(message);
  });

  it("rejects floating source versions", () => {
    const activationEvidence = evidence();
    activationEvidence.sourcePin.version = "latest";

    expect(() =>
      validateProviderActivationEvidence(
        descriptor({ version: "latest" }),
        activationEvidence,
        policyFor(activationEvidence),
      ),
    ).toThrow(/immutable exact pin/);
  });

  it("rejects duplicate capability claims", () => {
    const activationEvidence = evidence();
    activationEvidence.capabilities.push("render.vector.fill");

    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        activationEvidence,
        policyFor(activationEvidence),
      ),
    ).toThrow(/duplicate value/);
  });

  it("rejects malformed and independently mismatched artifact digests", () => {
    const malformed = evidence();
    malformed.visualQuality.rawArtifact.sha256 = "not-a-sha256";
    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        malformed,
        policyFor(evidence()),
      ),
    ).toThrow(/SHA-256/);

    const mismatched = evidence();
    const policy = policyFor(mismatched);
    policy.verifiedArtifactDigests[mismatched.visualQuality.rawArtifact.path] = SHA_B;
    expect(() =>
      validateProviderActivationEvidence(descriptor(), mismatched, policy),
    ).toThrow(/artifact digest mismatch/);

    const unverified = evidence();
    const missingPolicy = policyFor(unverified);
    delete missingPolicy.verifiedArtifactDigests[
      unverified.visualQuality.rawArtifact.path
    ];
    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        unverified,
        missingPolicy,
      ),
    ).toThrow(/artifact digest was not independently verified/);
  });

  it("rejects below-floor visual quality", () => {
    const activationEvidence = evidence();
    activationEvidence.visualQuality.score = 0.89;

    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        activationEvidence,
        policyFor(activationEvidence),
      ),
    ).toThrow(/visual quality 0.89 is below floor 0.9/);
  });

  it("rejects invalid percentile ordering", () => {
    const activationEvidence = evidence();
    activationEvidence.latency.p95Ms = 9;
    activationEvidence.latency.p99Ms = 8;

    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        activationEvidence,
        policyFor(activationEvidence),
      ),
    ).toThrow(/p50 <= p95 <= p99/);
  });

  it.each(["fail", "unverified"] as const)(
    "rejects a %s soak result",
    (result) => {
      const activationEvidence = evidence();
      activationEvidence.soak.result = result;

      expect(() =>
        validateProviderActivationEvidence(
          descriptor(),
          activationEvidence,
          policyFor(activationEvidence),
        ),
      ).toThrow(/soak result is not verified passing evidence/);
    },
  );

  it("rejects a soak shorter than the external policy floor", () => {
    const activationEvidence = evidence();
    activationEvidence.soak.durationHours = 7.99;

    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        activationEvidence,
        policyFor(activationEvidence),
      ),
    ).toThrow(/below required 8h/);
  });

  it("does not let callers weaken the V12 8h/24h soak policy", () => {
    const activationEvidence = evidence();
    const weakened = policyFor(activationEvidence);
    weakened.minimumSoakHours = MINIMUM_ACTIVATION_SOAK_HOURS - 1;
    weakened.minimumProductWideSoakHours =
      MINIMUM_PRODUCT_WIDE_SOAK_HOURS - 1;

    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        activationEvidence,
        weakened,
      ),
    ).toThrow(ProviderActivationError);
  });

  it("rejects unverified fault, determinism, and failure-isolation results", () => {
    const fault = evidence();
    fault.faultInjection.result = "unverified";
    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        fault,
        policyFor(fault),
      ),
    ).toThrow(/fault-injection result/);

    const nondeterministic = evidence();
    nondeterministic.determinism.verified = false;
    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        nondeterministic,
        policyFor(nondeterministic),
      ),
    ).toThrow(/determinism result is unverified/);

    const failureIsolation = evidence();
    failureIsolation.failureIsolation.result = "unverified";
    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        failureIsolation,
        policyFor(failureIsolation),
      ),
    ).toThrow(/failure-isolation result is not verified passing evidence/);
  });

  it("rejects legacy fallback evidence and incomplete failure isolation", () => {
    const validEvidence = evidence();
    const legacy = {
      ...structuredClone(validEvidence),
      fallback: {
        providerId: "canvaskit",
        result: "pass",
        rawArtifact: artifact("legacy-fallback"),
      },
    };
    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        legacy,
        policyFor(validEvidence),
      ),
    ).toThrow(/unrecognized key.*fallback/i);

    const incomplete = evidence();
    incomplete.failureIsolation.scenarios = ["worker-crash"];
    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        incomplete,
        policyFor(incomplete),
      ),
    ).toThrow(/must cover every fault-injection scenario/);
  });

  it("rejects promotion capabilities outside descriptor or quality coverage", () => {
    const absentFromDescriptor = evidence();
    absentFromDescriptor.promotion.capabilities = ["render.text.paragraph"];
    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        absentFromDescriptor,
        policyFor(absentFromDescriptor),
      ),
    ).toThrow(/absent from the descriptor/);

    const absentFromQuality = evidence();
    absentFromQuality.visualQuality.coveredCapabilities = ["render.vector.fill"];
    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        absentFromQuality,
        policyFor(absentFromQuality),
      ),
    ).toThrow(/absent from visual-quality coverage/);
  });

  it("rejects bounded-corpus evidence promoted as product-wide", () => {
    const activationEvidence = evidence();
    activationEvidence.promotion.scope = "product-wide";
    activationEvidence.soak.durationHours = 24;

    expect(() =>
      validateProviderActivationEvidence(
        descriptor(),
        activationEvidence,
        policyFor(activationEvidence),
      ),
    ).toThrow(/bounded corpus cannot support a product-wide promotion claim/);
  });

  it("accepts product-wide scope only with workflow coverage and the longer soak", () => {
    const activationEvidence = evidence();
    activationEvidence.visualQuality.corpusScope = "product-workflows";
    activationEvidence.promotion.scope = "product-wide";
    activationEvidence.soak.durationHours = 24;

    expect(
      validateProviderActivationEvidence(
        descriptor(),
        activationEvidence,
        policyFor(activationEvidence),
      ).promotionScope.scope,
    ).toBe("product-wide");
  });

  it("requires isolation for an isolation-only candidate and license", () => {
    const isolatedDescriptor = descriptor({
      id: "libvips",
      license: "LGPL-2.1-or-later",
    });
    const isolatedEvidence = evidence();
    isolatedEvidence.candidate = { id: "E17", key: "libvips" };
    isolatedEvidence.sourcePin.providerId = "libvips";
    isolatedEvidence.license = {
      candidateLicense: "LGPL-2.1-or-later",
      candidateDisposition: "isolated-only",
      descriptorLicense: "LGPL-2.1-or-later",
      gateMode: "isolated",
      deployment: "main-bundle",
      reviewArtifact: null,
    };

    expect(() =>
      validateProviderActivationEvidence(
        isolatedDescriptor,
        isolatedEvidence,
        policyFor(isolatedEvidence),
      ),
    ).toThrow(/cannot be deployed in the main bundle/);

    isolatedEvidence.license.deployment = "dedicated-worker";
    expect(
      validateProviderActivationEvidence(
        isolatedDescriptor,
        isolatedEvidence,
        policyFor(isolatedEvidence),
      ).status,
    ).toBe("verified-activation");
  });

  it("requires reviewed evidence and isolation for a mixed-license candidate", () => {
    const mixedDescriptor = descriptor({ id: "media-worker", license: "MIT" });
    const mixedEvidence = evidence();
    mixedEvidence.candidate = { id: "E23", key: "media-stack" };
    mixedEvidence.sourcePin.providerId = "media-worker";
    mixedEvidence.license = {
      candidateLicense: "mixed",
      candidateDisposition: "review-required",
      descriptorLicense: "MIT",
      gateMode: "bundle",
      deployment: "main-bundle",
      reviewArtifact: null,
    };

    expect(() =>
      validateProviderActivationEvidence(
        mixedDescriptor,
        mixedEvidence,
        policyFor(mixedEvidence),
      ),
    ).toThrow(/requires reviewed legal evidence/);

    mixedEvidence.license.deployment = "dedicated-worker";
    mixedEvidence.license.reviewArtifact = artifact("mixed-license-review");
    expect(
      validateProviderActivationEvidence(
        mixedDescriptor,
        mixedEvidence,
        policyFor(mixedEvidence),
      ).status,
    ).toBe("verified-activation");
  });

  it("rejects a descriptor whose actual license is unknown even with review metadata", () => {
    const activationEvidence = evidence();
    activationEvidence.license.descriptorLicense = "Unknown-Proprietary";
    activationEvidence.license.candidateDisposition = "review-required";
    activationEvidence.license.deployment = "dedicated-worker";
    activationEvidence.license.reviewArtifact = artifact("unknown-license-review");

    expect(() =>
      validateProviderActivationEvidence(
        descriptor({ license: "Unknown-Proprietary" }),
        activationEvidence,
        policyFor(activationEvidence),
      ),
    ).toThrow(/descriptor failed license gate/);
  });
});
