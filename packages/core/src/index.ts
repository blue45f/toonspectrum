// @toonspectrum/core — 웹과 API가 공유하는 순수 도메인 코어.
// Node/Drizzle/env 의존 없는 타입·플랫폼 메타·포맷터·카탈로그 슬리밍 규약 + 공유 fx 를 모은다.
// 웹의 lib/* 는 얇은 재-export 시밍으로 이 패키지를 가리킵니다.
//
// 예외: ./fx 는 브라우저 fx(오디오·파티클)와 React 훅을 포함한다(React 는 선택 peer, DOM/WAAPI 사용).
// 도메인 코어 본체는 여전히 React/DOM 비종속이며, fx 는 `@toonspectrum/core/fx` 서브패스로도 직접 import 가능.

export * from "./types";
export * from "./business";
export * from "./platforms";
export * from "./format";
export * from "./catalog-slim";
export * from "./estimate";
export * from "./taxonomy";
export * from "./calendar";
export * from "./search";
export * from "./recommend";
export * from "./title-filters";
export * from "./ranking";
export * from "./derive";
export * from "./library/store";
export * from "./fortune";
export * from "./community";
export * from "./fx";
