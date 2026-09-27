# 테마별 가구·랜드마크 원본 프레임 검수 — 2026-09-27

상태: **migration**. `codex/virtual-studio-experience-20260927` 작업에서 검수한 원본과 연결을 기록한다. 원본 PNG를 재샘플링하거나 편집하지 않았다. 실행 중인 운영 서비스에 반영되었다는 기록은 아니다.

## 원본과 의미 순서 — current

`experience-v8/furniture.png`, `furniture-{webtoon,pastel,retro,ink,neon}.png`, `landmarks-{sky-island,webtoon,pastel,retro,ink,neon}.png`의 **12장 모두 1254×1254 RGBA**다. 전체 원본을 직접 열어 확인했고, 각 원본의 큰 알파 연결 성분 16개와 분리된 의자·잎·꽃잎·장식 효과를 연결해 프레임을 검수했다. 분석 스크립트는 `/tmp/toonstudio-analyze-props.py`, `/tmp/toonstudio-quantify-prop-overlap.py`의 임시 파일로 만들었다.

| 프레임 | 가구 의미 | 랜드마크 의미 |
| --- | --- | --- |
| 0 | 나무 | 제작 아틀리에 |
| 1 | 화단 | 카페 |
| 2 | 벤치 | 자료실·도서관 |
| 3 | 조명 | 관측소·회의실 |
| 4 | 배너 | 행사·발표 무대 |
| 5 | 부스·안내 단말 | 갤러리 |
| 6 | 분수 | 입구·아치 |
| 7 | 포털·입구 | 중앙 분수 |
| 8 | 러그 | 큰 나무 정원 |
| 9 | 안내판 | 꽃 정원 |
| 10 | 파라솔·테이블 | 퍼걸러·휴식 공간 |
| 11 | 고양이 | 다리 |
| 12 | 드로잉 책상 | 폭포 |
| 13 | 책장 | 울타리·파티션 |
| 14 | 리뷰 보드 | 공동 제작 테이블 |
| 15 | 소파 | 테마별 이동·운반 오브젝트 |

테마에 따라 형태가 달라진다. 예를 들어 현대적인 웹툰 테마의 랜드마크 3은 유리 회의실이고, 15는 운반 로봇이다. 잉크 테마의 15는 고양이가 탄 자전거다. 프레임을 그림의 형태와 맞지 않는 동일 건축 이름으로 단정하지 않는다.

## 잘림과 패딩 검사 — current

기존 4×4 균등 슬라이스에서는 잉크 나무의 아래쪽과 레트로 러그의 옆부분이 잘렸다. 명시적 프레임은 원본 알파 본문 범위를 포함하고 가능한 부분에는 2px 여백을 둔다. 이웃 본문에 닿는 여백은 줄인다. 분리된 네온 의자, 웹툰 파라솔 의자, 잉크 입구 발판, 꽃잎 등도 해당 소품 범위에 포함했다.

12장 모두에서 최종 프레임들의 합집합 밖에 남은 **알파 100 초과 픽셀은 0개**였다. 이는 모든 반투명 픽셀까지 보존한다는 의미는 아니다. 원본의 넓게 분산된 알파 1~100 테두리·노이즈 일부는 프레임 밖에 남는다. 추가 패딩만으로 생기는 사각형 중첩은 없다. 다음 두 원본은 본문 사각 경계 자체가 겹쳐 있으며 본문을 손상시키지 않기 위해 예외로 유지했다.

| 원본·프레임 | 들어오는 이웃 알파 >100 픽셀 | 그중 알파 255 픽셀 | 자기 본문 픽셀 대비 | 이웃 조각의 원본 영역 |
| --- | ---: | ---: | ---: | --- |
| `furniture-ink.png` 0 ← 4 | 20 | 0 | 0.049% | x199–206, y326–328 |
| `furniture-ink.png` 4 ← 0 | 22 | 1 | 0.080% | x162–172, y326–328 |
| `landmarks-webtoon.png` 0 ← 4 | 46 | 8 | 0.072% | x81–95, y318–321 |
| `landmarks-webtoon.png` 4 ← 0 | 29 | 4 | 0.040% | x178–189, y318–321 |

잉크 가구의 조각 높이는 기본 82px 표시에서 약 0.8px다. 랜드마크 조각은 원본에서 4px 높이다. 이 검수는 원본과 메타데이터에 대한 것이며 실제 브라우저 화면에서 조각이 보이지 않는다고 단정하지 않는다. 픽셀 삭제, 별도 GPU 마스크, 파생 PNG를 추가하지 않았다. 향후 해당 원본을 교체하면 SHA-256 계약 테스트가 메타데이터 재검수를 요구한다.

## 렌더러·UI 연결 — current

[원본 프레임 메타데이터](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-experience-atlases.json)는 12장 원본의 SHA-256과 192개 사각형을 보관한다. [공통 helper](../../apps/web/src/domains/creator/virtual-space/studio-virtual-space-experience-art.ts)의 `studioExperienceAtlas`는 Phaser와 SVG가 같은 프레임을 사용하도록 한다. `studioExperienceFrameGeometry`는 기존 정수 격자 셀의 픽셀 배율과 기준점을 보존해, 프레임을 잘라 등록해도 가구의 배치 좌표·회전·물리 충돌체가 이동하지 않게 한다.

[공통 SVG 미리보기](../../apps/web/src/domains/creator/virtual-space/StudioVirtualExperienceArtPreview.tsx)는 정확한 프레임의 `viewBox`와 `clipPath`를 함께 사용한다. 가구 목록과 배치 지도는 테마별 동일 원본을 사용하며 배치 지도에는 렌더러와 같은 기하 보정을 적용한다. Page와 입장 화면의 아트 스타일 선택은 구형 `world-base` 그림 대신 실제 신규 랜드마크 0번을 표시한다. 배경 설정 화면에도 현재 테마를 전달한다.

## 검증과 남은 범위

- `studio-virtual-space-experience-art`, `StudioVirtualExperienceArtPreview`, `StudioVirtualSpaceCustomizationPanel`, `StudioVirtualSpaceEnvironmentPanel`, `StudioVirtualSpaceEntryLobby`, `StudioVirtualSpacePage.social`: 명령을 나누어 **6파일의 59테스트 통과**. 최종 원본 계약 파일은 기존 원장 무결성과 6개 테마×4개 배경 연결을 포함한 10테스트를 재실행했다.
- 원본 SHA·PNG 크기·192개 프레임 범위·두 원본 중첩 예외·192개 프레임의 픽셀 배율과 기준점, 실제 SVG crop, 가구 배치 유지, 배경 테마 연결을 확인했다.
- 수정한 TS/TSX ESLint, 문서 Secretlint, `git diff --check`를 통과했다.
- 12장 원본 시각 검수와 알파 정량 분석을 실행했다. CUA 브라우저 검수는 `iab` 사용 불가 및 사용 가능한 브라우저 목록이 빈 상태라 완료하지 못했다. 실제 장면·모바일 UI의 시각 확인, 최종 통합 타입 검사·빌드·CI는 부모 작업의 검증 범위다.
- 운영 배포는 실행하지 않았다.
