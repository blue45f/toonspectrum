# 유료·상용급 엔진 — 소스 공개분만 코어 반영 정책

기준: texture-first hybrid · fail-closed · 라이선스 게이트 (2026-08-12)

## 원칙

1. **소스가 공개된 것만 분석·이식**한다.
2. **유료 바이너리 리버스 엔지니어링 금지** (CSP, Rebelle, Magma, Expresii, Procreate…).
3. **라이선스 클래스**
   - permissive (MIT/ISC/Apache) → 제품 이식 가능
   - GPL → 개념 clean-room 또는 법적 격리
   - CC BY-NC → **비상업 무료 프로필에서만 허용**, 상용 배포는 별도 라이선스 전 차단
   - 무라이선스 → **제품 반입 금지**
4. 엔진 교체는 pin 승격 프로세스이지, 장애 시 폴백 사다리가 아니다.

## 카탈로그 요약

| 엔진 | 상용 맥락 | 라이선스 | 제품 | 브러시 질감 |
|------|-----------|----------|------|-------------|
| libmypaint | Krita 등 탑재 | ISC | 벤치·.myb DNA | oil/dry/calligraphy |
| Hokusai WASM | 웹 자연매체 제품 후보 | MIT/Apache | pin 후보 | oil/pencil/charcoal |
| Pavel WebGL Fluid | 업계 표준 웹 유체 | MIT | supporting kernel | wet watercolor/inkwash |
| Klecks | Kleki OSS | MIT | kernels | spray/chalk |
| LiquidFun Paint | Google Play 데모 앱 | Apache-2.0 | 개념·입자 | splatter/wet UX |
| LiquidFun | 상용 모바일 물리 | zlib 계열 | supporting | particle spray |
| Open Brush (Tilt Brush) | 유료 VR → 오픈소스 | Apache-2.0 | 개념 | ribbon/FX |
| **Mixbox** | **Rebelle Pro 안료** | **CC BY-NC** | **비상업 프로필만** | oil mix |
| Krita paintops | 프로급 무료 앱 | GPL | clean-room only | smudge/spray/hairy |
| Inkwash | 상용급 습식 UX | 없음 | 차단·개념만 | wet ink |
| CSP / Rebelle 본체 | 유료 클로즈드 | proprietary | 블라인드 바만 | — |

## 코어 추가물

| 모듈 | 출처 | 역할 |
|------|------|------|
| `studio-webgl-stable-fluid-core` | Pavel MIT / Stam | 습식 수송 |
| `studio-spectral-pigment-mix-approx` | 공개 KM 이론 (≠Mixbox) | 유화 혼색 근사 |
| `studio-oss-brush-kernels` | Klecks MIT + Krita 수식 | spray/chalk/wax |
| `studio-commercial-open-engine-evaluation` | 본 문서 SSOT | 라이선스 게이트 |
| Living Ink + wet-ink | 자체 + Inkwash 개념 | 수묵/수채 pin |
| Hokusai + texture v2 | 자체/ISC DNA | natural media pin |

## Mixbox

Rebelle 5 Pro에 탑재된 **상용 안료 스택**. 공개 저장소는 **비상업 CC BY-NC**.
현재 ToonSpectrum의 무료·비상업 배포 프로필에는 `mixbox@2.0.0`을 정확히 고정해 사용한다.
상용 배포·유료 배포·상업적 포크에서는 Mixbox 프로바이더를 제거하거나 비활성화해야 하며,
사용하려면 Secret Weapons의 별도 상용 라이선스를 먼저 확보한다.
`permissive-only` 및 `source-available` 프로필은 Mixbox 노드를 허용하지 않는다.

## 코드

- SSOT: `src/domains/creator/studio-commercial-open-engine-evaluation.ts`
- 테스트: `studio-commercial-open-engine-evaluation.test.ts`
