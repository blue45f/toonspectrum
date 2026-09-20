# 브러시 원본 보존과 OPFS 참조

상태: 구현 및 검증 진행. 기준 main `9ceb6d9b25432574c7a28bc9fc424de3e4a343ee`.

## 제품 범위

MYB/KPP 가져오기는 기존 Studio 그리기 설정 변환을 그대로 유지하면서 입력 원본 바이트·크기·SHA-256·안전한 파일명을 별도 보존한다. 원본 바이트 보존은 libmypaint/Krita의 원본 엔진 렌더링 동등성을 의미하지 않는다. 파일명을 위한 경로/제어문자 정리는 파일 내용에 영향을 주지 않는다.

`StudioSavedBrush.originalSource`는 라이브러리 메타데이터이며 `StudioBrushSnapshot`에 들어가지 않는다. 따라서 매 포인터/획에 원본 파일을 복제하지 않는다. 이름 변경·설정 변경·복제·삭제/복원은 원본 출처를 유지한다. 현재 브러시 설정으로 원본 MYB/KPP를 다시 생성하지 않는다.

## 저장 경계

기존 `acquireProductStudioAssetCasStore()`와 공유 asset-library Web Lock을 재사용한다. 대형 bytes를 SQLite TEXT/base64에 넣지 않는 ADR-0012를 따른다.

1. 가져오기/보존 JSON은 검증된 base64 원본을 일시적으로 가진다.
2. 실제 SQL 어댑터가 기존 OPFS CAS에 bytes를 기록하고 해시/길이를 검증한다.
3. 원본의 내용 해시를 owner로 고정한다.
4. SQLite에는 encoding `opfs-cas`, 파일명, 형식, 크기, 해시만 저장한다.
5. 파일 내보내기 시 필요한 원본만 비동기로 읽고 다시 검증한다.

원본 없는 브러시는 기존 SQL/JSON 경로를 유지한다. 메모리 세션은 명시적으로 비영속이며 portable bytes를 유지할 수 있다. SQL row에 inline original을 직접 넘기는 것은 거부한다. 일반 앱 부팅에 별도 저장소를 추가하거나 legacy 자동 migration을 켜지 않는다.

CAS 또는 SQL 실패 시 부분 row를 정상 저장으로 게시하지 않는다. 실패한 SQL 작업에 앞서 쓴 CAS blob/owner는 남을 수 있다. 삭제·Undo·복제·다른 참조를 파괴하지 않기 위해 이 슬라이스는 원본 owner를 자동 회수하지 않는다. 추후 참조·복구 이력을 검증하는 명시적 GC가 필요하다. CAS와 SQL을 하나의 물리 transaction이라고 주장하지 않는다.

## 내보내기와 지원 범위

원본 없는 브러시는 기존 `toonspectrum-studio-brush` JSON을 유지한다. 원본이 있는 경우 새로운 `toonspectrum-studio-brush-source-archive` envelope에 현재 Studio 설정과 원본 base64를 함께 담는다. 구형 클라이언트가 새 보존 형식을 알지 못하면 가져오기를 거부하며, 원본을 조용히 버리고 설정만 복원하지 않는다. 로컬 OPFS 참조만 있는 휴대 파일은 거부한다.

일반 설정 파일의 기존 2MiB 한도와 MYB/KPP 원본 8MiB 한도를 유지한다. 원본을 포함한 JSON은 base64·UTF-8 팽창을 고려한 별도 유한 한도를 사용한다. 해시는 우발적 손상을 검출하는 값이며 저작권·작성자의 증명이나 디지털 서명이 아니다.

범위는 성공적으로 가져온 단일 MYB/KPP다. ABR/SUT/SUTG/Krita bundle의 전체 원본 보존, 기존에 버려진 바이트의 복원, 가져온 원본을 같은 외부 엔진으로 그대로 그리는 작업은 완료하지 않았다. 임의 원본의 미지원 설정·외부 텍스처를 새 물리 파라미터로 추정하는 일도 없다.

## 재현 명령과 검증 경계

- `pnpm exec vitest run apps/web/src/domains/creator/brush/studio-brush-original-source.test.ts apps/web/src/domains/creator/brush/studio-brush-original-source-storage.test.ts apps/web/src/domains/creator/brush/studio-brush-original-roundtrip.test.ts apps/web/src/domains/creator/brush/StudioBrushOriginalSourceActions.test.tsx`
- `node scripts/verify-brush-original-source.mjs <output-directory>`

단위·통합 검사는 실제 SQLite WASM memory VFS와 CAS memory filesystem을 사용해 원본 읽기·변조·파일 누락·쿼터 실패·중복·복원·동시 store의 stale index를 검증한다. 이는 OPFS 내구성 검증으로 세지 않는다.
브라우저 검사는 production build한 Worker가 실제 OPFS SAH-pool SQLite와 제품 CAS에 MYB/KPP를 저장하고, Worker 종료 후 새 Worker로 다시 열어 휴대 JSON 왕복을 검사한다. 실제 원본 다운로드 버튼도 실행해 내려받은 파일의 SHA-256과 크기를 Node에서 별도 확인한다. 격리된 새 브라우저 origin이며 사용자의 기존 데이터는 열거나 삭제하지 않는다.

Chrome 153.0.8010.48에서 두 형식의 원본 해시·크기가 재개방/다운로드 뒤 동일했다. Worker 잔존·페이지 오류·콘솔 오류·실패 요청은 모두 0이었다. 최초 fixture는 favicon 404를 오류로 검출해 실패했고, 명시적 빈 favicon을 추가한 뒤 다시 통과했다. 브라우저 오류를 제외하도록 검사를 약화하지 않았다. fixture build의 비차단 chunk·dynamic import 경고는 남는다.
