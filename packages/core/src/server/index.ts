// @toonspectrum/core/server — 서버에서 적재되는(브라우저-세이프) 카탈로그 read-model 배럴.
// 웹과 API가 공유하는 정적 read-model만 모읍니다.
// 주의: drizzle/pg/db/node API 에 직접 의존하는 진짜 서버 전용 모듈
// (title·reviews·live·oauth·session 등)은 여기로 옮기지 않고 apps/api/src/server/ 에 남긴다.
// 그 모듈들이 필요한 read-model 은 값을 import 하지 말고 호출자에게 주입받는다(home.ts 참고) —
// 패키지가 앱 트리를 되짚는 화살표를 만들지 않기 위해서다.
// cover-policy 는 예외적으로 여기 있다: DB 없이 process.env 만 읽는 순수 모듈이고
// replaceCatalogData(catalog-store)가 이미 값으로 쓰므로 배럴 그래프에 새 의존을 더하지 않는다.
export * from "./catalog-store";
export * from "./cover-policy";
export * from "./author";
export * from "./explore";
export * from "./ranking-service";
export * from "./calendar";
export * from "./home";
export * from "./insights";
