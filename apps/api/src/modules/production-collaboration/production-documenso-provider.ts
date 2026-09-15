import type {
  ProductionIntegrationConfig,
} from "./production-integration-config";
import type {
  ProductionDocumensoEnvelopeMetadata,
} from "./production-integration.dto";
import {
  externalFetchJson,
  ProductionExternalHttpError,
} from "./production-integration-http";

export interface ProductionPdfUpload {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly originalname: string;
  readonly size: number;
}

export class ProductionDocumensoDistributionError extends Error {
  constructor(
    readonly envelopeId: string,
    readonly causeError: unknown,
  ) {
    super("documenso_distribution_failed");
    this.name = "ProductionDocumensoDistributionError";
  }
}

function defaultFields() {
  return [
    {
      identifier: 0,
      type: "NAME",
      page: 1,
      positionX: 10,
      positionY: 74,
      width: 30,
      height: 3,
    },
    {
      identifier: 0,
      type: "SIGNATURE",
      page: 1,
      positionX: 10,
      positionY: 80,
      width: 30,
      height: 5,
    },
    {
      identifier: 0,
      type: "DATE",
      page: 1,
      positionX: 50,
      positionY: 80,
      width: 20,
      height: 3,
    },
  ];
}
interface DocumensoEnvelopeResponse {
  readonly id: string;
  readonly status?: string;
  readonly title?: string;
}

export async function createDocumensoEnvelope(input: {
  readonly config: ProductionIntegrationConfig;
  readonly metadata: ProductionDocumensoEnvelopeMetadata;
  readonly file: ProductionPdfUpload;
}): Promise<{
  readonly envelope: DocumensoEnvelopeResponse;
  readonly distributed: boolean;
}> {
  const baseUrl = input.config.documenso.baseUrl;
  const token = input.config.documenso.apiToken;
  if (!baseUrl || !token) throw new Error("documenso_not_configured");
  if (
    input.file.mimetype !== "application/pdf"
    || input.file.size !== input.file.buffer.byteLength
    || input.file.size < 5
    || input.file.size > 20 * 1_024 * 1_024
    || input.file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-"
  ) {
    throw new Error("invalid_pdf_upload");
  }
  const payload = {
    type: "DOCUMENT",
    title: input.metadata.title,
    recipients: input.metadata.recipients.map((recipient) => ({
      email: recipient.email,
      name: recipient.name,
      role: recipient.role,
      fields: (recipient.fields.length > 0
        ? recipient.fields.map((field) => ({ identifier: 0, ...field }))
        : defaultFields()),
    })),
  };
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  const pdfBytes = new Uint8Array(input.file.buffer.byteLength);
  pdfBytes.set(input.file.buffer);
  form.append(
    "files",
    new Blob([pdfBytes], { type: "application/pdf" }),
    input.file.originalname || "production-agreement.pdf",
  );
  const envelope = await externalFetchJson<DocumensoEnvelopeResponse>(
    `${baseUrl}/envelope/create`,
    {
      method: "POST",
      headers: { Authorization: token },
      body: form,
    },
    input.config.timeoutMs,
  );
  if (!envelope.id) throw new Error("invalid_documenso_response");  if (!input.metadata.distribute) {
    return { envelope, distributed: false };
  }
  try {
    await externalFetchJson<Record<string, unknown>>(
      `${baseUrl}/envelope/${encodeURIComponent(envelope.id)}/distribute`,
      {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      },
      input.config.timeoutMs,
    );
  } catch (error) {
    throw new ProductionDocumensoDistributionError(envelope.id, error);
  }
  return { envelope, distributed: true };
}

export function documensoFailureState(error: unknown): {
  readonly uncertain: boolean;
  readonly code: string;
  readonly externalId: string | null;
} {
  if (error instanceof ProductionDocumensoDistributionError) {
    const cause = error.causeError;
    return {
      uncertain: true,
      code: cause instanceof ProductionExternalHttpError
        ? cause.code
        : "documenso_distribution_failed",
      externalId: error.envelopeId,
    };
  }
  if (error instanceof ProductionExternalHttpError) {
    return {
      uncertain: error.uncertain,
      code: error.code,
      externalId: null,
    };
  }
  return {
    uncertain: false,
    code: error instanceof Error ? error.message : "documenso_unknown_error",
    externalId: null,
  };
}
