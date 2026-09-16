declare module "gltf-validator" {
  export interface ValidationMessage {
    readonly code: string;
    readonly message: string;
    readonly severity: number;
    readonly pointer?: string;
  }

  export interface ValidationReport {
    readonly issues: {
      readonly numErrors: number;
      readonly numWarnings: number;
      readonly numInfos: number;
      readonly numHints?: number;
      readonly messages: readonly ValidationMessage[];
      readonly truncated?: boolean;
    };
  }

  export interface ValidationOptions {
    readonly uri?: string;
    readonly maxIssues?: number;
    readonly ignoredIssues?: readonly string[];
    readonly severityOverrides?: Readonly<Record<string, number>>;
    readonly externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
  }

  export function validateBytes(
    bytes: Uint8Array,
    options?: ValidationOptions,
  ): Promise<ValidationReport>;

  export function validateString(
    json: string,
    options?: ValidationOptions,
  ): Promise<ValidationReport>;
}
