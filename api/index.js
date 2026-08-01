 
// Vercel 서버리스 — 모든 /api/* 를 NestJS 앱으로 위임.
// vercel.json의 routes가 /api/(.*) → /api/index 로 재작성하고 path 쿼리가 주입되므로,
// serverless 엔트리 포인트는 내부에서 경로를 보정합니다.
// 컴파일된 dist(tsc, 데코레이터 메타데이터 보존)를 require 한다.
const { getServerlessApp } = require("../apps/api/dist/apps/api/src/serverless");

module.exports = async (req, res) => {
  const app = await getServerlessApp();
  return app(req, res);
};
