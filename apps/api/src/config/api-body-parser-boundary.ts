import { json, urlencoded } from "express";

import {
  BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE,
  BACKEND_CAPABILITY_GATEWAY_PATH,
} from "../infrastructure/backend-capabilities/backend-capability-gateway-contract";
import {
  backendCapabilityWorkerParserLimitBytes,
  createBackendCapabilityWorkerPreBodyAdmission,
  verifyBackendCapabilityWorkerRawBody,
} from "../infrastructure/backend-capabilities/backend-capability-worker-http-admission";

import type { BackendCapabilityPolicy } from "../infrastructure/backend-capabilities/backend-capability-policy";
import type { INestApplication } from "@nestjs/common";
import type { Request, Response } from "express";

/**
 * Installs the canonical Express body boundary. A capability worker authenticates and checks the
 * declared provider budget before JSON consumes a byte, then verifies the exact raw byte count in
 * the parser hook. The authoritative API retains its general JSON/urlencoded parser behavior.
 */
export function configureApiBodyParserBoundary(
  app: Pick<INestApplication, "use">,
  capabilityWorkerPolicy: BackendCapabilityPolicy | null,
): void {
  const gatewayContentType = BACKEND_CAPABILITY_GATEWAY_CONTENT_TYPE
    .toLowerCase()
    .split(";")[0]
    .trim();

  if (capabilityWorkerPolicy) {
    app.use(
      createBackendCapabilityWorkerPreBodyAdmission(capabilityWorkerPolicy),
    );
  }

  app.use(
    json({
      limit: capabilityWorkerPolicy
        ? backendCapabilityWorkerParserLimitBytes(capabilityWorkerPolicy)
        : "16mb",
      type: (request) => {
        const contentType = String(request.headers["content-type"] ?? "")
          .toLowerCase()
          .split(";")[0]
          .trim();
        if (capabilityWorkerPolicy) {
          return (request as Request).path === BACKEND_CAPABILITY_GATEWAY_PATH
            && contentType === gatewayContentType;
        }
        return contentType === "application/json"
          || contentType === gatewayContentType;
      },
      ...(capabilityWorkerPolicy
        ? {
            verify: (request, response, buffer) =>
              verifyBackendCapabilityWorkerRawBody(
                request as Request,
                response as Response,
                buffer,
              ),
          }
        : {}),
    }),
  );

  if (!capabilityWorkerPolicy) {
    app.use(urlencoded({ extended: true, limit: "16mb" }));
  }
}
