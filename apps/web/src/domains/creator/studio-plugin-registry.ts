export const STUDIO_PLUGIN_PERMISSIONS = [
  "document-read",
  "document-write",
  "asset-read",
  "asset-write",
  "network",
  "filesystem",
  "ai",
  "publish",
] as const;

export type StudioPluginPermission =
  (typeof STUDIO_PLUGIN_PERMISSIONS)[number];
export type StudioPluginRuntime = "worker" | "iframe" | "server";
export type StudioPluginSignature = "trusted" | "verified" | "unsigned" | "revoked";
export type StudioPluginInstallStatus = "ready" | "confirmation" | "blocked";

export interface StudioPluginManifest {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly publisher: string;
  readonly runtime: StudioPluginRuntime;
  readonly signature: StudioPluginSignature;
  readonly permissions: readonly StudioPluginPermission[];
  readonly networkDomains: readonly string[];
  readonly entrypoint: string;
}

export interface StudioPluginInstallContext {
  readonly trustedPublisherIds: readonly string[];
  readonly confirmedPermissions: readonly StudioPluginPermission[];
  readonly allowedNetworkDomains: readonly string[];
  readonly enterprisePolicyAllowsUnsigned: boolean;
}

export interface StudioPluginInstallDecision {
  readonly status: StudioPluginInstallStatus;
  readonly blockingCodes: readonly string[];
  readonly confirmationPermissions: readonly StudioPluginPermission[];
  readonly grantedPermissions: readonly StudioPluginPermission[];
  readonly grantedNetworkDomains: readonly string[];
}

const ELEVATED_PERMISSIONS = new Set<StudioPluginPermission>([
  "document-write",
  "asset-write",
  "filesystem",
  "publish",
]);

function validDomain(value: string): boolean {
  if (!value.trim() || value.includes("/") || value.includes(":")) return false;
  return /^[a-z0-9.-]+$/iu.test(value) && !value.startsWith(".") && !value.endsWith(".");
}

export function validateStudioPluginManifest(
  manifest: StudioPluginManifest,
): readonly string[] {
  const issues: string[] = [];
  if (
    !manifest.id.trim()
    || !manifest.version.trim()
    || !manifest.name.trim()
    || !manifest.publisher.trim()
    || !manifest.entrypoint.trim()
  ) {
    issues.push("plugin-required");
  }
  if (new Set(manifest.permissions).size !== manifest.permissions.length) {
    issues.push("permission-duplicate");
  }
  if (new Set(manifest.networkDomains.map((domain) => domain.toLowerCase())).size
    !== manifest.networkDomains.length) {
    issues.push("domain-duplicate");
  }
  if (manifest.networkDomains.some((domain) => !validDomain(domain))) {
    issues.push("domain-invalid");
  }
  if (!manifest.permissions.includes("network") && manifest.networkDomains.length > 0) {
    issues.push("network-domain-without-permission");
  }
  if (manifest.runtime === "server" && !manifest.permissions.includes("network")) {
    issues.push("server-network-required");
  }
  return Object.freeze(issues);
}

export function evaluateStudioPluginInstall(
  manifest: StudioPluginManifest,
  context: StudioPluginInstallContext,
): StudioPluginInstallDecision {
  if (validateStudioPluginManifest(manifest).length > 0) {
    return Object.freeze({
      status: "blocked",
      blockingCodes: Object.freeze(["manifest-invalid"]),
      confirmationPermissions: Object.freeze([]),
      grantedPermissions: Object.freeze([]),
      grantedNetworkDomains: Object.freeze([]),
    });
  }
  const blockingCodes: string[] = [];
  if (manifest.signature === "revoked") blockingCodes.push("signature-revoked");
  const publisherTrusted = context.trustedPublisherIds.includes(manifest.publisher);
  const unsigned = manifest.signature === "unsigned";
  if (unsigned && !context.enterprisePolicyAllowsUnsigned) blockingCodes.push("unsigned-disabled");
  if (
    unsigned
    && manifest.permissions.some((permission) => ELEVATED_PERMISSIONS.has(permission))
  ) {
    blockingCodes.push("unsigned-elevated-permission");
  }
  if (manifest.runtime === "server" && !publisherTrusted) {
    blockingCodes.push("untrusted-server-runtime");
  }
  const allowedDomains = new Set(context.allowedNetworkDomains.map((domain) => domain.toLowerCase()));
  const rejectedDomains = manifest.networkDomains.filter(
    (domain) => !allowedDomains.has(domain.toLowerCase()),
  );
  if (rejectedDomains.length > 0) blockingCodes.push("network-domain-not-allowed");

  const confirmed = new Set(context.confirmedPermissions);
  const confirmationPermissions = manifest.permissions.filter((permission) => {
    if (permission === "document-read" || permission === "asset-read") return false;
    return !confirmed.has(permission);
  });
  if (blockingCodes.length > 0) {
    return Object.freeze({
      status: "blocked",
      blockingCodes: Object.freeze(blockingCodes),
      confirmationPermissions: Object.freeze(confirmationPermissions),
      grantedPermissions: Object.freeze([]),
      grantedNetworkDomains: Object.freeze([]),
    });
  }
  const grantedPermissions = manifest.permissions.filter((permission) => {
    if (permission === "document-read" || permission === "asset-read") return true;
    return confirmed.has(permission);
  });
  return Object.freeze({
    status: confirmationPermissions.length > 0 ? "confirmation" : "ready",
    blockingCodes: Object.freeze([]),
    confirmationPermissions: Object.freeze(confirmationPermissions),
    grantedPermissions: Object.freeze(grantedPermissions),
    grantedNetworkDomains: Object.freeze(
      manifest.permissions.includes("network") ? [...manifest.networkDomains] : [],
    ),
  });
}
