// .wesl 소스를 Vite `?raw` 로 문자열 import 하기 위한 타입 심.
// 런타임 해석은 Vite(앱 번들·vitest 트랜스폼)가 담당한다 — 이 패키지는
// 소스 배포(main: ./src/index.ts)라 소비자도 동일한 Vite 파이프라인을 쓴다.
declare module "*.wesl?raw" {
  const source: string;
  export default source;
}
