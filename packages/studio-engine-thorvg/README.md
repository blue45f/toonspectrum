# @toonspectrum/studio-engine-thorvg

안전한 SVG·Lottie 전문 island를 위한 bounded ThorVG WebCanvas provider다.

- `audit`은 WASM이나 renderer 초기화 전에 실행하는 경량 의존성 검사다.
- immutable provider plan이 ThorVG를 선택한 뒤에만 `runtime`을 동적 import한다.
- 요청마다 `wg`, `gl`, `sw` 중 정확히 하나만 선택한다. 실패해도 다른 backend나 Vello를 재시도하지 않는다.
- 활성·외부 SVG surface, Lottie expression, 외부 image asset을 거부한다.
- `wasm/thorvg.wasm`은 `@thorvg/webcanvas@1.1.2`의 바이트를 그대로 복사하고 `INTEGRITY.sha256`으로 고정한다.
- Canvas paint를 분리·dispose한 뒤 canvas/backend를 제거한다. process-global engine은 마지막 lease가 해제된 뒤 종료한다.

브라우저 수명주기 검증:

```sh
pnpm run verify:studio-thorvg-browser
```
