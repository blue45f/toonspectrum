import {
  REALTIME_ACTOR_REVOKE_PATH,
  REALTIME_INTERNAL_CONTROL_HEADER,
  REALTIME_INTERNAL_CONTROL_VALUE,
} from "./actor-directory";
import {
  REALTIME_CONTROL_CONTENT_TYPE,
  REALTIME_CONTROL_MAX_BODY_BYTES,
  REALTIME_CONTROL_NONCE_HEADER,
  REALTIME_CONTROL_PATH,
  REALTIME_CONTROL_SIGNATURE_HEADER,
  REALTIME_CONTROL_TIMESTAMP_HEADER,
  verifyRealtimeControlEvent,
} from "./control";
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
export { RealtimeActorDirectory } from "./actor-directory";

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
  const controlConfigured =
    typeof env.REALTIME_CONTROL_SECRET === "string" &&
    new TextEncoder().encode(env.REALTIME_CONTROL_SECRET).byteLength >= 32 &&
    env.REALTIME_CONTROL_SECRET !== env.REALTIME_TICKET_SECRET;
  if (
    request.method === "GET" &&
    url.pathname === "/health" &&
    url.search === ""
  ) {
    return jsonResponse(controlConfigured ? 200 : 503, {
      version: REALTIME_PROTOCOL_VERSION,
      status: controlConfigured ? "ok" : "unavailable",
      service: "cloudflare-realtime-coordinator",
    });
  }

  if (!controlConfigured) {
    return jsonResponse(503, {
      version: REALTIME_PROTOCOL_VERSION,
      ok: false,
      code: "realtime-unavailable",
    });
  }
  if (
    request.method === "POST" &&
    url.pathname === REALTIME_CONTROL_PATH
  ) {
    if (
      url.search !== "" ||
      request.headers.get("Content-Type") !==
        REALTIME_CONTROL_CONTENT_TYPE
    ) {
      return jsonResponse(400, {
        version: REALTIME_PROTOCOL_VERSION,
        ok: false,
        code: "invalid-control-request",
      });
    }
    const declaredLength = request.headers.get("Content-Length");
    if (
      declaredLength !== null &&
      (!/^(?:0|[1-9]\d*)$/u.test(declaredLength) ||
        Number(declaredLength) > REALTIME_CONTROL_MAX_BODY_BYTES)
    ) {
      return jsonResponse(413, {
        version: REALTIME_PROTOCOL_VERSION,
        ok: false,
        code: "control-request-too-large",
      });
    }
    const body = new Uint8Array(await request.arrayBuffer());
    if (
      body.byteLength === 0 ||
      body.byteLength > REALTIME_CONTROL_MAX_BODY_BYTES
    ) {
      return jsonResponse(413, {
        version: REALTIME_PROTOCOL_VERSION,
        ok: false,
        code: "control-request-too-large",
      });
    }
    const nonce = request.headers.get(REALTIME_CONTROL_NONCE_HEADER);
    const timestamp = request.headers.get(
      REALTIME_CONTROL_TIMESTAMP_HEADER,
    );
    const signature = request.headers.get(
      REALTIME_CONTROL_SIGNATURE_HEADER,
    );
    if (nonce === null || timestamp === null || signature === null) {
      return jsonResponse(401, {
        version: REALTIME_PROTOCOL_VERSION,
        ok: false,
        code: "control-authentication-required",
      });
    }
    const verified = await verifyRealtimeControlEvent(
      body,
      { nonce, timestamp, signature },
      env.REALTIME_CONTROL_SECRET,
      Date.now(),
    );
    if (!verified.ok) {
      return jsonResponse(401, {
        version: REALTIME_PROTOCOL_VERSION,
        ok: false,
        code: "control-authentication-rejected",
      });
    }
    const actorDirectoryId = env.REALTIME_ACTORS.idFromName(
      verified.event.actorId,
    );
    return await env.REALTIME_ACTORS.get(actorDirectoryId).fetch(
      new Request(`https://internal.invalid${REALTIME_ACTOR_REVOKE_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [REALTIME_INTERNAL_CONTROL_HEADER]:
            REALTIME_INTERNAL_CONTROL_VALUE,
        },
        body,
      }),
    );
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
