export const STUDIO_ASSET_PROVIDER_MODES = [
  "official-api",
  "connected-account",
  "manual-import",
] as const;

export const STUDIO_ASSET_PROVIDER_ACTIONS = [
  "search",
  "purchase",
  "download",
  "update",
  "sync-entitlements",
  "register-file",
  "register-receipt",
] as const;

export type StudioAssetProviderMode =
  (typeof STUDIO_ASSET_PROVIDER_MODES)[number];
export type StudioAssetProviderAction =
  (typeof STUDIO_ASSET_PROVIDER_ACTIONS)[number];
export type StudioAssetProviderDecisionStatus = "allowed" | "confirmation" | "blocked";

export interface StudioAssetProviderDefinition {
  readonly id: string;
  readonly name: string;
  readonly mode: StudioAssetProviderMode;
  readonly actions: readonly StudioAssetProviderAction[];
  readonly authorizedDomains: readonly string[];
  readonly requiresAuthentication: boolean;
  readonly allowsBackgroundSync: boolean;
}

export interface StudioAssetProviderRequest {
  readonly action: StudioAssetProviderAction;
  readonly authenticated: boolean;
  readonly userInitiated: boolean;
  readonly sourceUrl: string | null;
  readonly bypassesAccessControl: boolean;
}

export interface StudioAssetProviderDecision {
  readonly status: StudioAssetProviderDecisionStatus;
  readonly code: string;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StudioAssetEntitlement {
  readonly providerId: string;
  readonly assetId: string;
  readonly versionId: string;
  readonly ownerId: string;
  readonly receiptId: string | null;
  readonly purchasedAt: string;
  readonly expiresAt: string | null;
  readonly seatLimit: number | null;
}

export interface StudioAssetEntitlementContext {
  readonly providerId: string;
  readonly ownerId: string;
  readonly teamSeats: number;
  readonly now: string;
  readonly requiresReceipt: boolean;
}

export interface StudioAssetEntitlementDecision {
  readonly status: "active" | "warning" | "blocked";
  readonly codes: readonly string[];
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function domainAllowed(url: string, domains: readonly string[]): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return domains.some((domain) => {
      const normalized = domain.toLowerCase();
      return hostname === normalized || hostname.endsWith(`.${normalized}`);
    });
  } catch {
    return false;
  }
}

function providerDecision(
  status: StudioAssetProviderDecisionStatus,
  code: string,
  messageKo: string,
  messageEn: string,
): StudioAssetProviderDecision {
  return Object.freeze({ status, code, messageKo, messageEn });
}

export function validateStudioAssetProvider(
  provider: StudioAssetProviderDefinition,
): readonly string[] {
  const issues: string[] = [];
  if (!provider.id.trim() || !provider.name.trim()) issues.push("provider-required");
  if (new Set(provider.actions).size !== provider.actions.length) issues.push("duplicate-action");
  if (new Set(provider.authorizedDomains.map((domain) => domain.toLowerCase())).size
    !== provider.authorizedDomains.length) {
    issues.push("duplicate-domain");
  }
  if (
    provider.mode === "manual-import"
    && provider.actions.some((action) => !["register-file", "register-receipt"].includes(action))
  ) {
    issues.push("manual-provider-remote-action");
  }
  if (provider.allowsBackgroundSync && provider.mode !== "official-api") {
    issues.push("background-sync-mode");
  }
  return Object.freeze(issues);
}

export function evaluateStudioAssetProviderRequest(
  provider: StudioAssetProviderDefinition,
  request: StudioAssetProviderRequest,
): StudioAssetProviderDecision {
  const providerIssues = validateStudioAssetProvider(provider);
  if (providerIssues.length > 0) {
    return providerDecision(
      "blocked",
      "provider-invalid",
      "에셋 공급자 설정이 안전 기준을 충족하지 않습니다.",
      "The asset provider configuration does not meet safety requirements.",
    );
  }
  if (request.bypassesAccessControl) {
    return providerDecision(
      "blocked",
      "access-control-bypass",
      "로그인·결제·DRM을 우회하는 작업은 실행할 수 없습니다.",
      "Operations that bypass authentication, payment or DRM are not allowed.",
    );
  }
  if (!provider.actions.includes(request.action)) {
    return providerDecision(
      "blocked",
      "action-unsupported",
      "이 연결 방식에서는 해당 작업을 지원하지 않습니다.",
      "This connection mode does not support the requested action.",
    );
  }
  if (provider.requiresAuthentication && !request.authenticated) {
    return providerDecision(
      "blocked",
      "authentication-required",
      "에셋 공급자 계정 연결이 필요합니다.",
      "Connect the asset provider account first.",
    );
  }
  if (request.sourceUrl && !domainAllowed(request.sourceUrl, provider.authorizedDomains)) {
    return providerDecision(
      "blocked",
      "domain-not-authorized",
      "공급자가 허용한 주소가 아닙니다.",
      "The URL is not on an authorized provider domain.",
    );
  }
  if (!request.userInitiated && !provider.allowsBackgroundSync) {
    return providerDecision(
      "blocked",
      "background-action-disabled",
      "사용자가 시작하지 않은 원격 작업은 허용되지 않습니다.",
      "Remote actions that were not initiated by the user are disabled.",
    );
  }
  if (["purchase", "download", "register-file"].includes(request.action)) {
    return providerDecision(
      "confirmation",
      "user-confirmation",
      "가격·라이선스·가져올 파일을 확인한 뒤 진행합니다.",
      "Confirm price, license and selected files before continuing.",
    );
  }
  return providerDecision(
    "allowed",
    "allowed",
    "이 작업을 실행할 수 있습니다.",
    "This operation is allowed.",
  );
}

export function evaluateStudioAssetEntitlement(
  entitlement: StudioAssetEntitlement,
  context: StudioAssetEntitlementContext,
): StudioAssetEntitlementDecision {
  requireText(entitlement.providerId, "Provider id");
  requireText(entitlement.assetId, "Asset id");
  requireText(entitlement.versionId, "Version id");
  requireText(entitlement.ownerId, "Owner id");
  if (!isValidTimestamp(entitlement.purchasedAt) || !isValidTimestamp(context.now)) {
    throw new Error("Entitlement timestamps must be valid ISO dates.");
  }
  if (!Number.isSafeInteger(context.teamSeats) || context.teamSeats < 1) {
    throw new Error("Team seats must be a positive integer.");
  }

  const codes: string[] = [];
  let blocked = false;
  if (entitlement.providerId !== context.providerId) {
    codes.push("provider-mismatch");
    blocked = true;
  }
  if (entitlement.ownerId !== context.ownerId) {
    codes.push("owner-mismatch");
    blocked = true;
  }
  if (context.requiresReceipt && !entitlement.receiptId?.trim()) {
    codes.push("receipt-missing");
    blocked = true;
  }
  if (
    entitlement.expiresAt
    && (!isValidTimestamp(entitlement.expiresAt)
      || Date.parse(context.now) > Date.parse(entitlement.expiresAt))
  ) {
    codes.push("entitlement-expired");
    blocked = true;
  }
  if (entitlement.seatLimit !== null && context.teamSeats > entitlement.seatLimit) {
    codes.push("seat-limit-exceeded");
    blocked = true;
  }
  if (!blocked && entitlement.seatLimit === null) codes.push("seat-limit-unverified");

  return Object.freeze({
    status: blocked ? "blocked" : codes.length > 0 ? "warning" : "active",
    codes: Object.freeze(codes),
  });
}
