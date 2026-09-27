/**
 * Pluggable signer for organization-owned or audited key infrastructure.
 *
 * The callback receives an owned byte array containing only the v1 domain, attestation algorithm,
 * key id, canonical content byte length, and SHA-256 digest. The returned signature must be
 * unpadded base64url.
 */
export interface StudioInkEnvelopeAttester {
  readonly algorithm: string;
  readonly keyId: string;
  readonly sign: (message: Uint8Array) => string | Promise<string>;
}

/** Verification boundary for signatures issued by a selected trust domain. */
export interface StudioInkEnvelopeAttestationVerifier {
  readonly verify: (input: Readonly<{
    algorithm: string;
    keyId: string;
    message: Uint8Array;
    signature: string;
  }>) => boolean | Promise<boolean>;
}

