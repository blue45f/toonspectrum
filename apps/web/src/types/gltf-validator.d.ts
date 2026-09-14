declare module "gltf-validator" {
  export interface ValidationMessage {
    readonly code: string;
    readonly message: string;
    readonly severity: number;
  }

  export interface ValidationReport {
    readonly issues: {
      readonly numErrors: number;
      readonly numWarnings: number;
      readonly numInfos: number;
      readonly messages: readonly ValidationMessage[];
    };
  }

  export function validateBytes(
    bytes: Uint8Array,
    options?: { readonly maxIssues?: number },
  ): Promise<ValidationReport>;
}
