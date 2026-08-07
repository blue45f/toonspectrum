import {
  DEFAULT_LICENSE_POLICY,
  evaluateLicenseGate,
  providerDescriptorSchema,
} from "./descriptor";

import type {
  Capability,
  LicenseGateResult,
  LicensePolicy,
  ProviderDescriptor,
  ProviderKind,
} from "./descriptor";

/**
 * EngineCapabilityRegistry (V11 §2) — the only directory of engine adapters.
 *
 * Registration validates the descriptor and runs the license hard gate; a
 * rejected provider is never queryable, so downstream planners cannot
 * accidentally schedule work onto a legally or technically unusable engine.
 */

export interface RegisteredProvider {
  descriptor: ProviderDescriptor;
  licenseGate: Exclude<LicenseGateResult, { mode: "rejected" }>;
}

export class ProviderRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRegistrationError";
  }
}

export class EngineCapabilityRegistry {
  private readonly providers = new Map<string, RegisteredProvider>();

  constructor(private readonly licensePolicy: LicensePolicy = DEFAULT_LICENSE_POLICY) {}

  register(descriptor: ProviderDescriptor): RegisteredProvider {
    const parsed = providerDescriptorSchema.parse(descriptor);
    if (this.providers.has(parsed.id)) {
      throw new ProviderRegistrationError(`provider already registered: ${parsed.id}`);
    }
    const gate = evaluateLicenseGate(parsed.license, this.licensePolicy);
    if (gate.mode === "rejected") {
      throw new ProviderRegistrationError(
        `provider ${parsed.id} failed license gate: ${gate.reason}`,
      );
    }
    const registered: RegisteredProvider = { descriptor: parsed, licenseGate: gate };
    this.providers.set(parsed.id, registered);
    return registered;
  }

  get(id: string): RegisteredProvider | null {
    return this.providers.get(id) ?? null;
  }

  list(kind?: ProviderKind): RegisteredProvider[] {
    const all = [...this.providers.values()];
    return kind ? all.filter((p) => p.descriptor.kind === kind) : all;
  }

  /** Providers of `kind` that declare every capability in `required`. */
  query(kind: ProviderKind, required: Capability[]): RegisteredProvider[] {
    return this.list(kind).filter((provider) =>
      required.every((capability) =>
        provider.descriptor.capabilities.includes(capability),
      ),
    );
  }

  /**
   * Resolves the declared fallback chain from a provider, stopping on cycles.
   * The chain includes the starting provider first.
   */
  fallbackChain(id: string): string[] {
    const chain: string[] = [];
    const seen = new Set<string>();
    let cursor: string | null = id;
    while (cursor !== null && !seen.has(cursor)) {
      const provider = this.providers.get(cursor);
      if (!provider) break;
      chain.push(cursor);
      seen.add(cursor);
      cursor = provider.descriptor.fallbackProviderId;
    }
    return chain;
  }
}
