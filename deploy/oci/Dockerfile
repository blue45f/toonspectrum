# ToonSpectrum NestJS API — OCI Always-Free ARM(Ampere A1, arm64) 컨테이너.
# node:24 는 arm64 멀티아치라 Ampere A1 에서 그대로 동작한다. 모노레포 루트가 빌드 컨텍스트:
#   docker build -f deploy/oci/Dockerfile -t webdex-api .
# (apps/api 는 tsc rootDir=레포루트 라 루트 lib/ 까지 컴파일 → 빌드 컨텍스트는 반드시 레포 루트)

FROM node:24-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate
COPY . .
# pnpm-workspace.yaml 의 onlyBuiltDependencies/allowBuilds 가 @nestjs/core·esbuild 빌드를 승인.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @webtoon-nest/api build

FROM node:24-bookworm-slim AS runtime
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate
ENV NODE_ENV=production
ENV PORT=4001
# 빌드 산출물 + 워크스페이스 node_modules(.pnpm 심링크 보존) 통째로 복사 — 무료 VM 이라 용량보다 신뢰성 우선.
COPY --from=build /repo /repo
EXPOSE 4001
WORKDIR /repo/apps/api
# main.ts 가 PORT(기본 4001)에 0.0.0.0 바인딩. 컨테이너 env 로 DATABASE_URL/AUTH_SECRET 등 주입.
CMD ["node", "dist/apps/api/src/main.js"]
