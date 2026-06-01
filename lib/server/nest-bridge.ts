const DEFAULT_NEST_API_URL = "http://127.0.0.1:4001";

function parseNestUrl() {
  const raw = process.env.NEST_API_URL?.trim();
  return raw ? raw : DEFAULT_NEST_API_URL;
}

interface ForwardOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  userId?: string | null;
  body?: unknown;
  request?: Request;
}

function buildHeaders(method: string, userId: string | null, request?: Request) {
  const headers = new Headers();
  headers.set("x-requested-with", "nest-bridge");

  if (userId) headers.set("x-user-id", userId);
  if (method !== "GET" && method !== "HEAD") headers.set("content-type", "application/json");

  if (request) {
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const authorization = request.headers.get("authorization");
    if (authorization) headers.set("authorization", authorization);
  }
  return headers;
}

function buildResponse(upstream: Response): Response {
  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  responseHeaders.set("x-bridge", "nestjs");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function forwardToNest({
  method,
  path,
  userId = null,
  body,
  request,
}: ForwardOptions): Promise<Response> {
  try {
    const upstream = await fetch(`${parseNestUrl()}/api${path}`, {
      method,
      headers: buildHeaders(method, userId, request),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return buildResponse(upstream);
  } catch (error) {
    console.error("Nest API forwarding failed:", error);
    return Response.json(
      { error: "Nest 백엔드 API가 응답하지 않습니다. 서버 기동 상태를 확인하세요." },
      { status: 502 }
    );
  }
}
