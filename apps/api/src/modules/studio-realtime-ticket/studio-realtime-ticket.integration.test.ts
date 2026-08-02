import { describe, expect, it } from "vitest";

import {
  verifyRealtimeTicket,
} from "../../../../../deploy/cloudflare-realtime/src/ticket";
import { CreatorModule } from "../creator/creator.module";

import {
  CreatorStudioRealtimeTicketAuthorization,
} from "./studio-realtime-ticket.creator-authorization";
import {
  StudioRealtimeTicketConfigurationError,
  createStudioRealtimeTicketDynamicModule,
  resolveStudioRealtimeTicketDeployment,
} from "./studio-realtime-ticket.integration";
import { StudioRealtimeTicketModule } from "./studio-realtime-ticket.module";
import {
  CloudflareStudioRealtimeTicketSigner,
} from "./studio-realtime-ticket.provider";
import { StudioRealtimeTicketService } from "./studio-realtime-ticket.service";

import type { CreatorCollaborationRepository } from "../creator/creator-collaboration.repository";

const TEST_SECRET =
  "test-only-cloudflare-ticket-secret-with-more-than-32-bytes";

function enabledEnvironment(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    API_CORS_ALLOWED_ORIGINS:
      "https://www.toonstudio.cloud,https://toonstudio.cloud",
    STUDIO_REALTIME_TICKET_ENABLED: "true",
    STUDIO_REALTIME_CLOUDFLARE_PROVIDER_ID:
      "cloudflare-realtime-v1",
    STUDIO_REALTIME_CLOUDFLARE_TICKET_ISSUER:
      "toonspectrum-api",
    STUDIO_REALTIME_CLOUDFLARE_TICKET_AUDIENCE:
      "toonspectrum-realtime",
    STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET: TEST_SECRET,
    STUDIO_REALTIME_CLOUDFLARE_TICKET_TTL_SECONDS: "120",
    STUDIO_REALTIME_CLOUDFLARE_SESSION_TTL_SECONDS: "300",
    ...overrides,
  };
}

describe("Studio realtime ticket deployment configuration", () => {
  it("does not mount the route until the feature is explicitly enabled", () => {
    expect(resolveStudioRealtimeTicketDeployment({})).toEqual({
      enabled: false,
    });
    expect(
      resolveStudioRealtimeTicketDeployment({
        STUDIO_REALTIME_TICKET_ENABLED: "false",
      }),
    ).toEqual({ enabled: false });
    expect(createStudioRealtimeTicketDynamicModule({})).toBeNull();
  });

  it("declares every workload supported by the Cloudflare worker", () => {
    const deployment =
      resolveStudioRealtimeTicketDeployment(enabledEnvironment());

    expect(deployment.enabled).toBe(true);
    if (!deployment.enabled) return;
    expect(deployment.signer).toMatchObject({
      providerId: "cloudflare-realtime-v1",
      provider: "cloudflare",
      issuer: "toonspectrum-api",
      audience: "toonspectrum-realtime",
      ticketTtlSeconds: 120,
      sessionTtlSeconds: 300,
      workloads: [
        "presence",
        "comments",
        "screen-signaling",
      ],
      capabilities: [
        "presence.snapshot-v1",
        "presence.members-v1",
        "presence.cursor-v1",
        "presence.resume-v1",
        "comments.invalidation-v1",
        "comments.resume-v1",
        "screen-signaling.session-v1",
        "screen-signaling.webrtc-v1",
        "screen-signaling.resume-v1",
      ],
    });
    expect(deployment.allowedOrigins).toEqual([
      "https://www.toonstudio.cloud",
      "https://toonstudio.cloud",
    ]);
  });

  it("builds the dynamic module with the Creator ACL dependency", () => {
    const dynamicModule =
      createStudioRealtimeTicketDynamicModule(
        enabledEnvironment(),
      );

    expect(dynamicModule?.module).toBe(
      StudioRealtimeTicketModule,
    );
    expect(dynamicModule?.imports).toContain(CreatorModule);
  });

  it("issues a Worker-verifiable ticket through the Creator ACL and service boundary", async () => {
    const deployment =
      resolveStudioRealtimeTicketDeployment(enabledEnvironment());
    expect(deployment.enabled).toBe(true);
    if (!deployment.enabled) return;
    const getAuthorization = async () => ({
      workId: "work-1",
      viewer: {
        userId: "artist-1",
        role: "editor" as const,
        status: "active" as const,
        capabilities: {
          view: true,
          comment: true,
          edit: true,
          manageMembers: false,
        },
      },
    });
    const creatorAuthorization =
      new CreatorStudioRealtimeTicketAuthorization(
        {
          getAuthorization,
        } as unknown as CreatorCollaborationRepository,
        {
          providerIds: [deployment.signer.providerId],
          allowedOrigins: deployment.allowedOrigins,
        },
      );
    const service = new StudioRealtimeTicketService(
      creatorAuthorization,
      [new CloudflareStudioRealtimeTicketSigner(deployment.signer)],
    );

    const response = await service.issue(
      {
        userId: "artist-1",
        sessionVersion: 9,
        expiresAt: Date.now() + 4 * 60 * 1_000,
      },
      "https://www.toonstudio.cloud",
      {
        version: 1,
        providerId: "cloudflare-realtime-v1",
        sessionId: "session-1",
        scope: { workId: "work-1", roomId: "work-1" },
        workloads: [
          "presence",
          "comments",
          "screen-signaling",
        ],
        capabilities: [
          "presence.snapshot-v1",
          "comments.invalidation-v1",
          "screen-signaling.session-v1",
        ],
      },
    );
    const verified = await verifyRealtimeTicket(
      response.ticket,
      TEST_SECRET,
      {
        issuer: "toonspectrum-api",
        audience: "toonspectrum-realtime",
        workId: "work-1",
        roomId: "work-1",
        origin: "https://www.toonstudio.cloud",
        nowMs: Date.parse(response.issuedAt) + 1_000,
      },
    );

    expect(verified).toMatchObject({
      ok: true,
      claims: {
        subject: "artist-1",
        sessionVersion: 9,
        workId: "work-1",
        roomId: "work-1",
        scopes: [
          "presence",
          "comments",
          "screen-signaling",
        ],
      },
    });
  });

  it.each([
    {
      label: "partial enabled configuration",
      override: {
        STUDIO_REALTIME_CLOUDFLARE_TICKET_AUDIENCE: undefined,
      },
    },
    {
      label: "weak secret",
      override: {
        STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET: "weak",
      },
    },
    {
      label: "non-canonical switch",
      override: { STUDIO_REALTIME_TICKET_ENABLED: "TRUE" },
    },
    {
      label: "overlong ticket lifetime",
      override: {
        STUDIO_REALTIME_CLOUDFLARE_TICKET_TTL_SECONDS: "121",
      },
    },
    {
      label: "session shorter than ticket",
      override: {
        STUDIO_REALTIME_CLOUDFLARE_SESSION_TTL_SECONDS: "60",
      },
    },
    {
      label: "session longer than the bounded revocation lease",
      override: {
        STUDIO_REALTIME_CLOUDFLARE_SESSION_TTL_SECONDS: "301",
      },
    },
  ])("fails closed for $label", ({ override }) => {
    let caught: unknown;
    try {
      resolveStudioRealtimeTicketDeployment(
        enabledEnvironment(override),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(
      StudioRealtimeTicketConfigurationError,
    );
    expect(String(caught)).not.toContain(TEST_SECRET);
  });
});
