# 3D 참조 디자인 작업 공간 — 2026-09-28

상태: `current` — 이 변경 브랜치에 구현된 UI. 메인 병합·운영 배포 완료를 뜻하지 않는다.

## 적용 범위

사용자가 제공한 참조 이미지의 차콜 패널, 라벤더 강조, 중앙 모델 중심의 작업 배치를 기존 3D 편집기에 적용했다.

- 캐릭터 셰이퍼의 데스크톱 화면을 캐릭터 라이브러리 / 단일 3D 뷰포트 / 프리셋·정밀 조절의 세 열로 구성한다.
- 라이브러리는 실제 등록된 VRM 목록과 썸네일을 사용한다. 검색, 내 캐릭터 필터, 현재 선택 표시, VRM 가져오기를 제공한다.
- 얼굴·헤어·의상·체형·포즈·소품의 여섯 카테고리로 탐색한다. 원래의 15개 문서 슬롯은 유지한다.
- 모바일은 여섯 카테고리를 한 줄에 표시하고 세부 부위를 시트에서 고른다. 세로는 하단 시트, 짧은 가로 화면은 측면 시트를 사용한다.
- 데스크톱 하단의 빠른 프리셋은 기존 적용 명령을 사용한다. 도해를 실제 렌더 썸네일로 표시하지 않는다.
- 출력 설정은 팝오버로 열려 캔버스 크기를 바꾸지 않는다. 기존 호출자는 기존 설정 배치를 유지한다.
- 장면 도우미·정밀 배경 편집기·고급 VRM 포저도 같은 모달 전용 시각 토큰을 사용한다.

## 상태와 접근성

키보드 카테고리 이동, Home/End, 선택 상태, 시트 펼치기·접기, Escape와 포커스 복원을 유지한다.
캡처·모델 로딩·공유·표면 드로잉 중에는 캐릭터 교체를 잠근다. 이미지가 깨지면 인물 아이콘으로 대체하며 다른 모델의 사진을 대신 표시하지 않는다.
밝은 테마, 고대비, 강제 색상, 동작 줄이기 상태를 별도로 정의한다. 모바일 카테고리의 터치 영역은 최소 44px를 검증한다.

## 변경하지 않은 범위

캐릭터 문서·Undo·적용 authority, 실제 모델 메시·텍스처, 렌더러, PNG/PSD 캡처 계약, DB 연결·환경변수·마이그레이션은 변경하지 않았다.
참조 이미지의 캐릭터 조형·모발 디테일 자체를 기존 VRM이 그대로 재현하는 것은 아니다. 실제 모델 품질을 정지 일러스트로 덮지 않는다.

## 재현 명령

저장소 루트에서 의존성을 해당 worktree에 설치한 후 실행한다. 공유 `node_modules` 링크로 다른 체크아웃의 패키지를 참조하지 않는다.

```sh
pnpm harness:verify
pnpm exec vitest run \
  apps/web/src/domains/creator/character-shaper/StudioCharacterShaperDialog.test.tsx \
  apps/web/src/domains/creator/character-shaper/CharacterShaperOutputDock.test.tsx \
  apps/web/src/domains/creator/character-shaper/CharacterShaperSummaryBar.test.tsx \
  apps/web/src/domains/creator/character-shaper/CharacterShaperShelf.test.tsx \
  apps/web/src/domains/creator/character-shaper/character-shaper-reference-model.test.ts \
  apps/web/src/domains/creator/bg3d/StudioBg3dEditorModal.compositor.test.tsx \
  apps/web/src/domains/creator/bg3d/StudioBg3dProfessionalWorkspace.test.tsx --maxWorkers=1
pnpm exec playwright test --config playwright.studio-3d-reference.config.ts
```

이미 별도 검증용 개발 서버가 켜져 있으면 `STUDIO_3D_REFERENCE_URL=http://127.0.0.1:5249`를 지정한다.
브라우저 증거는 `test-results/studio-3d-reference/`에 생성하며 소스에 포함하지 않는다.

## 검증 경계

관련 단위 테스트는 7개 파일, 96개 테스트가 통과했다. 프런트엔드 전체 TypeScript 검사는 저장소 표준의 12GB 힙 설정에서 통과했다.
최초 8GB 검사에서는 Node 힙 부족이 발생했으며 이를 타입 오류로 처리하거나 검사를 생략하지 않았다.

브라우저 검증은 실제 정적 VRM과 편집기를 실행한다. 캐릭터 준비 완료, 카테고리·시트 전환, 캐릭터 교체, 카메라, 출력 설정, 화면 폭과 터치 영역을 검사한다.
데스크톱은 1280/1440/1920px, 터치는 320×800/390×844/820×1180/844×390을 대상으로 한다.
로컬 API 서버 없이 실행하므로 인증·클라우드 저장·협업·외부 AI API 성공은 이 검증의 보증 범위가 아니다.

최종 브라우저·하네스 결과는 PR의 실제 실행 결과와 함께 기록한다. 운영 배포는 이 변경의 일부로 실행하지 않는다.
