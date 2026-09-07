// Vercel 서버리스 — 모든 /api/* 를 NestJS 앱으로 위임.
// vercel.json의 rewrite가 /api/(.*) → /api/index 로 전달하며, 사용되지 않은 path 파라미터는
// query로 보존될 수 있으므로 아래 경계와 NestJS 어댑터가 모두 원래 경로를 정규화한다.
//
// Liveness는 데이터베이스·스키마·외부 서비스와 독립적이어야 한다. NestJS 모듈 그래프는 DB를
// 사용하는 제품 모듈도 포함하므로, DATABASE_URL이 없는 Preview에서도 probe가 프로세스를
// 관찰할 수 있도록 health 경계를 먼저 처리하고 컴파일된 앱은 실제 API 요청 때 지연 로드한다.
let getServerlessApp;

function safeDecodePath(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function extractPathValue(req, parsedUrl) {
  const queryPath =
    req && req.query && typeof req.query === "object"
      ? req.query.path
      : undefined;
  if (Array.isArray(queryPath)) {
    const joined = queryPath
      .filter((value) => typeof value === "string")
      .join("/");
    if (joined) return joined;
  } else if (typeof queryPath === "string" && queryPath) {
    return queryPath;
  }

  const values = parsedUrl.searchParams.getAll("path");
  return values.length > 0 ? values.join("/") : undefined;
}

function resolveOriginalApiPath(req) {
  const parsedUrl = new URL(req && req.url ? req.url : "/", "https://example.local");
  const extractedPath = extractPathValue(req, parsedUrl);
  if (typeof extractedPath !== "string") return parsedUrl.pathname;

  const decodedPath = safeDecodePath(extractedPath);
  const absolutePath = decodedPath.startsWith("/")
    ? decodedPath
    : `/${decodedPath}`;
  return absolutePath.startsWith("/api")
    ? absolutePath
    : `/api${absolutePath}`;
}

function sendJson(req, res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.end(req.method === "HEAD" ? undefined : body);
}

function loadServerlessApp() {
  if (!getServerlessApp) {
    ({ getServerlessApp } = require("../apps/api/dist/apps/api/src/serverless"));
  }
  return getServerlessApp;
}

module.exports = async (req, res) => {
  const method = String(req.method || "GET").toUpperCase();
  const path = resolveOriginalApiPath(req);
  const readRequest = method === "GET" || method === "HEAD";

  if (
    readRequest &&
    (path === "/api/health" || path === "/api/health/live")
  ) {
    sendJson(req, res, 200, { status: "ok" });
    return;
  }

  if (
    readRequest &&
    path === "/api/health/ready" &&
    !process.env.DATABASE_URL?.trim()
  ) {
    sendJson(req, res, 503, {
      statusCode: 503,
      status: "not_ready",
      error: "service_not_ready",
      message: "Service is not ready",
    });
    return;
  }

  const app = await loadServerlessApp()();
  return app(req, res);
};
