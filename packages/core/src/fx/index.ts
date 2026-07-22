// @toonspectrum/core/fx — 공용 fx(오디오 + 파티클 + 키프레임 + React 훅) 배럴.
//
// 구성
//  - audio.ts     : lazy AudioContext 싱글톤 · 합성 SFX(tick/pop/success/error) ·
//                   애니메이션 OST풍 생성형 BGM(5 무드 프리셋, crossfade 로테이션) · mute/volume ·
//                   영속 opt-in 토글 + 상태 구독. (Web Audio only, 프레임워크 비종속)
//  - particles.ts : triggerParticleBurst — DOM 파티클 "팡"(self-cleaning). (DOM + WAAPI only)
//  - fx.css       : pf-jelly-pop · pf-sparkle · pf-aurora · pf-glow 키프레임/유틸. (앱에서 import)
//  - hooks.ts     : useClickSfx · useAmbientBgm · useAudioState · useFx. (React peer)
//
// 전부 isomorphic — 브라우저에서 동작하고, SSR/비브라우저에서는 graceful no-op입니다.
// fx.css 는 CSS 라 JS 배럴로 재노출하지 않습니다(앱이 직접 import: `@toonspectrum/core/fx/fx.css`).

export * from "./audio";
export * from "./particles";
export * from "./hooks";
