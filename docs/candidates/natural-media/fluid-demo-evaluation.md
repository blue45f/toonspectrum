# 수묵·젖은 잉크 유체 데모 평가 (2026-08-12)

Texture-first hybrid · fail-closed pin (hybrid-design.md §0 / §4)

## 대상

| 데모 | URL | 소스 | 라이선스 |
|------|-----|------|----------|
| WebGL Fluid Simulation | https://paveldogreat.github.io/WebGL-Fluid-Simulation/ | [PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) | **MIT** |
| Inkwash | https://johnowhitaker.github.io/inkwash/about | [johnowhitaker/inkwash](https://github.com/johnowhitaker/inkwash) | **저장소에 LICENSE 없음** |
| Paint (WebGL) | https://piellardj.github.io/paint-webgl/ | [piellardj/paint-webgl](https://github.com/piellardj/paint-webgl) | **ISC** |

## 판정 요약

| 데모 | 질감 적합성 (수묵/수채) | 제품 사용 | 이유 |
|------|-------------------------|-----------|------|
| Pavel Fluid | 높음 (이류·소용돌이·압력) | **supporting kernel 채택** | MIT, Stam 안정 유체. 엔터테인먼트 연출은 제외하고 수송 수학만 Studio 코어로 이식 |
| Inkwash | **최고** (펜/물붓, wet 구속, ink/fixed/dry) | **개념만 Living Ink에 흡수** | 라이선스 부재 → 소스 복사 금지. 필드 분리·듀얼 툴 UX는 clean-room |
| paint-webgl | 낮음 (플로우맵 입자 시각화) | **참고 전용** | 자유 획 잉크 침착 모델이 아님. 유화 pin과 무관 |

## 제품 핀 (질감 우선)

```text
wet-watercolor / wet-inkwash 주력 pin
  → Living Ink field + wet-ink runtime (+ causal watercolor dabs)
  → 지원 커널: studio-webgl-stable-fluid-core (MIT Pavel/Stam 계열)
  → Inkwash: 개념 정렬만 (소스 미반입)
  → 실패 시 airbrush/oil로 조용히 치환 금지 (fail-closed)
```

## 코드 위치

- 평가 SSOT: `src/domains/creator/studio-fluid-demo-evaluation.ts`
- 유체 코어: `src/domains/creator/studio-webgl-stable-fluid-core.ts`
- 제3자 고지: `third_party/webgl-fluid-simulation/`, `third_party/inkwash/`, `third_party/paint-webgl/`

## 다음 단계

1. Living Ink GPU 패스에 안정 유체 이류/와도 항 선택 이식 (MIT 고지 유지)
2. Inkwash 라이선스 확보 시 재평가 (그때도 monorepo 통합보다 개념 대조 우선 권장)
3. paint-webgl flowmap은 bristle 방향 실험 후보로만 백로그
