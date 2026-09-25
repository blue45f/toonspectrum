# 아키텍처 문서 지도

- 상태: **현재 문서 색인**
- 최종 갱신: **2026-09-26**

## 현재 권위 문서

| 문서 | 역할 |
| --- | --- |
| [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) | 저장소 전체의 현재 구조와 경계 |
| [`frontend-layered-architecture.md`](frontend-layered-architecture.md) | Web/Admin의 `app/domains/platform/shared` 규칙 |
| [`modular-monorepo-target.md`](modular-monorepo-target.md) | 모듈형 모노레포 목표와 마이그레이션 순서 |
| [`studio-current-boundaries.md`](studio-current-boundaries.md) | Studio의 현재 권위·저장·렌더링·협업 경계 |
| [`studio-3d-asset-governance-v1.md`](studio-3d-asset-governance-v1.md) | 3D 에셋 품질·권리·공개 게이트 |
| [`studio-3d-web-authoring-v3-2026-09-24.md`](studio-3d-web-authoring-v3-2026-09-24.md) | 브라우저 우선 3D 저작 경계 |
| [`studio-live-canvas-gesture.md`](studio-live-canvas-gesture.md) | 라이브 캔버스 제스처 수명주기 |

렌더러·엔진의 현재 역할은 직접 편집하는 산문 문서가 아니라
[`../engines/renderer-roles.md`](../engines/renderer-roles.md)와 그 생성 원장이 권위다.

## 역사적 설계·벤치마크 원천

이 디렉터리의 `ToonStudio_*_V5/V11/V11.1/V12` 문서와 CSV는 2026년 8월의 설계·후보 조사·
벤치마크 원천이다. 일부 코드와 테스트가 후보 ID, 요구 절, 라이선스 분류를 참조하므로 유지한다.
현재 폴더 구조나 제품 완료 상태를 판단할 때는 사용하지 않는다.

`studio-architecture-review-2026-09-02.md`도 특정 시점의 외부 검토 기록이다. 이후 결정과 현재
렌더러 원장이 우선한다.

## 유지 규칙

- 새 현재 문서는 상태와 갱신일을 상단에 적는다.
- 과거 명세를 현재 문서로 복사하지 않는다.
- 실행 지시용 Codex 프롬프트는 유지 문서로 보관하지 않는다.
- 현재 경로가 바뀌면 코드·테스트·문서 링크를 같은 변경에서 갱신한다.
- 현재/목표/역사 자료를 한 문단에서 섞어 완료 상태를 과장하지 않는다.
