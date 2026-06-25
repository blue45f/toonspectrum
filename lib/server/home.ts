// 시밍: 홈 read-model(getHomeData)은 @toonspectrum/core 패키지(packages/core/src/server/home.ts)로 이전됨.
// @/lib/server/home 임포트 경로 보존용 상대 재-export.
// (home 은 reviews→db 에 의존하므로 이 모듈을 value 로 import 하는 쪽만 DB 환경이 필요 — 기존과 동일.)
export * from "../../packages/core/src/server/home";
