export interface ValidationMessage {
  code: string;
  message: string;
  severity: number;
  pointer?: string;
  offset?: number;
}

export interface ValidationReport {
  uri?: string;
  mimeType?: string;
  validatorVersion?: string;
  validatedAt?: string;
  issues: {
    numErrors: number;
    numWarnings: number;
    numInfos: number;
    numHints?: number;
    messages: ValidationMessage[];
    truncated?: boolean;
  };
  info?: Record<string, unknown>;
}

export interface ValidationOptions {
  uri?: string;
  maxIssues?: number;
  ignoredIssues?: string[];
  onlyIssues?: string[];
  severityOverrides?: Record<string, number>;
  externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
}

export interface GltfValidatorApi {
  validateBytes(bytes: Uint8Array, options?: ValidationOptions): Promise<ValidationReport>;
  version(): string;
}
