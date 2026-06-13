 
// Vercel 서버리스 — 모든 /api/* 를 NestJS 앱으로 위임. vercel.json의 routes가
// /api/(.*) → /api/index 로 보내고 원본 req.url(/api/...)을 보존하므로 Nest가 그대로 라우팅한다.
// 컴파일된 dist(tsc, 데코레이터 메타데이터 보존)를 require 한다.
const { getServerlessApp } = require("../apps/api/dist/apps/api/src/serverless");

module.exports = async (req, res) => {
  const app = await getServerlessApp();
  return app(req, res);
};
