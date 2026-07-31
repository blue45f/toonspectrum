import { REALTIME_PROTOCOL_VERSION } from "./protocol";
import {
  hasForbiddenCredentialQuery,
  isAllowedRealtimeOrigin,
  isWebSocketUpgrade,
  normalizeRealtimeRoomObjectName,
  parseRealtimeRoomPath,
  resolveAllowedOrigins,
} from "./security";
import {
  extractRealtimeTicketFromSubprotocols,
  verifyRealtimeTicket,
} from "./ticket";

import type { RealtimeWorkerEnv } from "./runtime-types";

export { RealtimeRoom } from "./room";

function jsonResponse(
  status: number,
  body: Readonly<Record<string, unknown>>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function handleFetch(
  request: Request,
  env: RealtimeWorkerEnv,
): Promise<Response> {
  const url = new URL(request.url);
  if (
    request.method === "GET" &&
    url.pathname === "/health" &&
    url.search === ""
  ) {
    return jsonResponse(200, {
      version: REALTIME_PROTOCOL_VERSION,
      status: "ok",
      service: "cloudflare-realtime-coordinator",
    });
  }

  if (
    url.search !== "" ||
    hasForbiddenCredentialQuery(url) ||
    !isWebSocketUpgrade(request)
  ) {
    return jsonResponse(400, {
      version: REALTIME_PROTOCOL_VERSION,
      ok: false,
      code: "invalid-websocket-request",
    });
  }
  const scope = parseRealtimeRoomPath(url.pathname);
  const allowedOrigins = resolveAllowedOrigins(
    env.REALTIME_ALLOWED_ORIGINS,
  );
  const origin = request.headers.get("Origin");
  if (
    scope === null ||
    !isAllowedRealtimeOrigin(origin, allowedOrigins)
  ) {
    return jsonResponse(403, {
      version: REALTIME_PROTOCOL_VERSION,
      ok: false,
      code: "origin-or-room-denied",
    });
  }

  const extracted = extractRealtimeTicketFromSubprotocols(
    request.headers.get("Sec-WebSocket-Protocol"),
  );
  if (!extracted.ok) {
    return jsonResponse(401, {
      version: REALTIME_PROTOCOL_VERSION,
      ok: false,
      code: "ticket-required",
    });
  }
  const verified = await verifyRealtimeTicket(
    extracted.ticket,
    env.REALTIME_TICKET_SECRET,
    {
      issuer: env.REALTIME_TICKET_ISSUER,
      audience: env.REALTIME_TICKET_AUDIENCE,
      workId: scope.workId,
      roomId: scope.roomId,
      origin,
      nowMs: Date.now(),
    },
  );
  if (!verified.ok) {
    return jsonResponse(401, {
      version: REALTIME_PROTOCOL_VERSION,
      ok: false,
      code: "ticket-rejected",
    });
  }

  const durableObjectId = env.REALTIME_ROOMS.idFromName(
    normalizeRealtimeRoomObjectName(scope),
  );
  return await env.REALTIME_ROOMS.get(durableObjectId).fetch(request);
}

export default {
  async fetch(
    request: Request,
    env: RealtimeWorkerEnv,
  ): Promise<Response> {
    try {
      return await handleFetch(request, env);
    } catch {
      // Never reflect request headers, subprotocol tickets, or raw exceptions.
      return jsonResponse(503, {
        version: REALTIME_PROTOCOL_VERSION,
        ok: false,
        code: "realtime-unavailable",
      });
    }
  },
};
