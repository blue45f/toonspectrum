# Shaper 후속 품질 개선 — 2026-09-12

기준 main: `a6a1f1b3d14265a9f43a3a8e2d93c45a15d237c0`(PR #1345). 이전 [기능별 비교](shaper-competitive-benchmark-2026-09-12.md)와 [엔진 평가](studio-3d-engine-evaluation-2026-09-12.md)에서 남긴 출력 응답성·미리보기 신뢰성·제한된 텍스처 출력 경로를 이어서 개선했다. Shaper 설치 앱과의 동일 장면 비교나 게임 엔진 전체 교체를 완료한 보고서는 아니다.

## PNG 캡처의 반응성과 취소

기존 4K 출력은 GPU 타깃을 타일로 제한했지만 모든 타일을 한 작업에서 연속 처리했다. 새 제품 PNG 경로는 해상도에 관계없이 최대 1024×1024 타일을 사용하고, 타일 사이에 실제 이벤트 루프 작업을 양보한다. 시작 전과 각 타일 전후에 취소·장면 권한·WebGL context loss를 검사하며 UI에 진행률을 표시한다.

카메라 투영·MToon 화면 외곽선·장면 배경·렌더 타깃·clear 상태를 각 타일의 `finally`에서 복원한 다음 UI 작업을 받는다. 타일 사이에 다른 viewport frame이 렌더러 상태를 바꾸면 다음 타일은 그 최신 상태를 보존한다. 취소 시 generator를 닫아 GPU 타깃과 출력 패스 재질을 정리하며, 다음 캡처에 뒤늦게 도착하는 GPU readback 작업은 없다. 동기 캡처 API는 짧은 썸네일과 PSD의 일시적 재질 변경 범위에 유지한다.

Three 0.184의 `readRenderTargetPixelsAsync`는 AbortSignal을 받지 않고, 내부 PBO/fence 대기·readback을 둘러싼 `finally`도 제공하지 않는다. 외부 Promise 경쟁만으로 취소해 버리면 원래 GPU 작업이 살아남을 수 있어 이번 변경은 그 API를 단순 치환하지 않았다.

한 타일의 render/readback은 여전히 동기다. 복잡한 모델의 입력 지연 상한을 보장하지 않으며, 총 메모리가 1024²로 줄어드는 것도 아니다. 최종 RGBA, PNG worker 사본, 인코더·canvas 저장소는 별도로 존재한다.

## PSD 파일 조립 Worker

패스 캡처의 동기 material scope와 최대 2K 규격을 유지하고, 마스크 합성·레이어 구성·ag-psd 파일 쓰기를 전용 module Worker로 분리했다. GPU 캡처가 끝나면 helper를 복원하고 ‘PSD 파일 만드는 중’을 표시한다. 최종 결과 검증까지 export 권한과 문서 상태 검사는 유지한다.

기본 Worker API는 caller buffer를 복제한다. 제품 캡처가 독점 소유한 패스만 명시적으로 transfer하며, 부분 view와 중복 backing buffer는 이 경로에서 거부한다. 버전·요청 ID·패스·동일 크기·바이트 예산·응답 형식과 PSD v1/RGB8 헤더를 검사한다. 최대 14패스·2048²·입력 224MiB·PSD 출력 256MiB이며, 조립 중간 버퍼의 추가 메모리를 포함한 총 프로세스 예산이라는 뜻은 아니다.

취소·시작/작업 timeout·Worker 실패·잘못된 응답과 성공 모두에서 리스너를 제거하고 Worker를 종료한다. Worker 실패 뒤 동기 조립으로 자동 전환하지 않는다. GPU 패스와 선화·음영 파생 계산의 기존 동기 처리까지 모두 옮긴 변경은 아니다.

프로덕션 검증 중 새 Worker 파일명이 기존 `studio-*.worker` 응답 헤더 규약에서 빠져, 격리된 Studio 문서에서 실행 전에 차단되는 결함을 재현했다. 같은 Worker 바이트에 COEP 헤더 유무를 달리한 실제 브라우저 비교로 원인을 확인하고 기존 파일명 규약에 맞췄다. 격리 정책을 완화하지 않았다.

기존 PSD는 레이어에 정상 픽셀이 있어도 merged image를 지정하지 않아 파일 미리보기에서 검은 화면이 나왔다. 이제 캡처한 Beauty의 RGB·alpha를 저장된 합성 미리보기로 제공한다. 이는 파일을 여는 도구의 미리보기 품질 수정이며, semantic 레이어 스택을 실제로 다시 합성한 결과의 Beauty 동일성은 검증하지 않았다. 저장된 기준 이미지 비교를 Photoshop·Clip Studio Paint의 편집 스택 재합성 검증으로 해석하지 않는다.

## 현재 조합과 일치하는 미리보기

기존 썸네일 조회는 모델 ID와 선택 카드 ID만 비교해, 같은 카드의 세부 길이·포즈·색이 바뀌어도 과거 이미지를 ‘실제 모델’로 표시할 수 있었다. 이제 전체 편집 상태·리그·페인트 리비전과 실제 모델 인스턴스를 확인한다. 임시 착용·비교·편집·출력 중 촬영을 제한하며 늦은 결과는 게시하지 않는다.

자동 썸네일은 export와 같은 캡처 권한을 먼저 획득한다. RGBA readback 직후 helper와 권한을 반납하고 압축을 기다리므로, 출력 타일 사이에 배경을 숨기거나 encoder를 기다리는 동안 장면을 점유하지 않는다. 캐시에는 WeakMap으로 발급한 인스턴스 토큰만 저장해 과거 VRM의 메시·CPU 텍스처를 보유하지 않는다.

카드는 ‘모양 도해’와 ‘현재 조합 · 실제 3D’를 구분한다. 실제 이미지는 해당 의상 하나의 독립 렌더가 아니라 전체 현재 조합임을 설명하고, 원래 카메라 비율을 유지한다. 원본 의상 기본값과 실험 의상 opt-in은 유지했다.

## Babylon 텍스처 출력의 제한된 확장

임베디드 텍스처를 전부 거부하던 전문 출력 경로에 단일 GLB BIN 내부의 PNG base-color 프로필을 추가한다. 정적 OPAQUE 재질·FLOAT VEC2 UV0·8-bit RGB/RGBA·최대 2048px로 한정한다. animation·skin·morph가 없고, root extension은 KHR_materials_unlit만 허용한다. PNG는 IHDR/IDAT/IEND 및 선택적 sRGB 청크만 받는다. JPEG·팔레트/인터레이스 PNG·색 프로필/부가 청크·압축 텍스처·UV transform·MASK/BLEND·다른 텍스처 채널은 여전히 명시적 미지원이다.

GLB SHA와 소유한 byte 사본 검증을 유지한다. 이미지 디코딩 전에 BIN/view 범위·CRC·치수·샘플러·mip·배치된 모델 전체의 메모리 상한을 검사한다. import 뒤 실제 크기·mip·자원 수·실제 재질의 albedo 연결을 다시 대조하고, 텍스처 누락을 흰 모델의 정상 출력으로 처리하지 않는다. import 뒤 연결 확인은 실제 로드된 재질만 대상으로 한다. 디코딩 전 허용 프로필 검사는 GLB 전체 images/materials에 적용하므로 미사용 자산도 제한을 만족해야 한다.

실제 생성된 mip 체인을 Babylon의 기본 메타데이터 값 1개로 축소 계상하던 문제도 수정했다. WebGL2·WebGPU 모두 공개 `useExactSrgbConversions` 옵션을 적용해 근사 색 변환의 오차를 줄였다. 이는 엔진 교체나 모든 배경 텍스처 지원이 아니다.

## 검증 기록

- 최종 집중 회귀 15개 파일 300개 통과. 최종 CI 실행 계약 103개 통과. 추가 회귀 8개 경로를 필수 core 검사에 연결했다.
- 실제 Chromium 151.0.7922.34, `ANGLE Metal Renderer: Apple M2 Max`, `/vrm/sample.vrm`을 사용한 동기 대 cooperative 비교 통과.
- 2050×1025 원근/평행 카메라, lens shift, 마지막 부분 타일을 worldCoordinates/screenCoordinates 외곽선 각각으로 총 네 번 비교했다. 화면 기준 선폭 0.003을 적용한 실제 outline draw 재질 7개가 픽셀을 바꾸는지도 확인했다. world 평균 합성 채널 차이는 0.00018346/0.00001454(0–255), screen은 0.00036466/0.00001175였다. 네 경우 중 최대 타일 경계 평균은 0.00306229였다. 소수 픽셀에서 alpha 차이 최대 64·합성 채널 차이 최대 136이 있으므로 바이트 단위 완전 일치라고 주장하지 않는다.
- 네 실행 모두 실제 타일 사이 event-loop heartbeat를 관측했다. 4K 취소는 첫 타일에서 끝났고 GPU texture 수 28→28, 재시도 성공, page/console 오류 0이었다.
- 위 native 비교 원본: `/private/tmp/shaper-next-qa/cooperative-outline-native/result.json`. 한 모델의 짧은 실행이며 장시간 성능·모든 장치 품질의 근거가 아니다.

- 최종 생산 빌드(TypeScript·Vite·라이선스·CSP) 통과. API TypeScript, 변경 코드 ESLint, 아키텍처, 정적 Studio 번들 게이트 통과. 번들 시작 네트워크의 과거 측정은 재측정하지 않았으며 이를 현재 로딩 성능 근거로 사용하지 않는다.
- 전체 캐릭터 제품 UI의 native 검사 통과: 1926×2048 및 3852×4096 투명 PNG, 4K 렌더 6%에서 취소/다운로드 0/권한 반납/재시도, 실제 PSD Worker 실행 1회와 파일 다운로드, 390px·320px 모바일 버튼·overflow 검사, page 오류 0. 원본: `/private/tmp/shaper-next-qa/character-final-native/character-shaper-evidence.json`.
- 실제 PSD 1926×2048을 다시 읽어 9개 raster(숨김 Beauty 포함) 각각 비어 있지 않은 픽셀을 확인했다. 합성 미리보기의 유효 픽셀 467,564개, 투명 픽셀 3,476,884개를 확인했다. 첫 2K PNG와 PSD 숨김 Beauty의 평균 alpha 차이는 0.00001623, 검정/흰 배경 합성 채널 차이는 0.00031126/0.00032511(0–255)였다. 소수 가장자리에서 최대 차이 98이 있으므로 완전 일치는 아니다.
- 최종 Babylon native 14개 통과: unlit PNG 샘플러 6종 × WebGL2/WebGPU, PBR 1종 × 두 backend. 각 unlit 경우 내부 900픽셀을 실제 Three GLTFLoader 출력과 비교했다. 정확 sRGB 적용 후 최대 RGB 차이 1/255(이전 근사 변환 5/255), 6종 중 5종은 차이 0이었다. OPAQUE alpha·깊이·canonical object/material ID도 검증했다. PBR은 색상 순서와 coverage 검증이며 엔진 간 광량 동일성 검증은 아니다. Chromium 151.0.7922.34·Apple metal-3·`isFallbackAdapter=false`, 원본 로그: `/private/tmp/shaper-next-texture-gpu.log`.
- 로컬 직렬 성능 검사 432개 중 431개가 첫 실행에서 통과했다. 변경하지 않은 impasto CPU 비용 비율 1개가 4.81로 하한 6에 미달했으며, 해당 파일을 단독 실행해 2개 모두 통과했다. 임계값은 수정하지 않았다. 전체 직렬 검사의 최종 병합 판정은 PR 현재 head의 필수 CI 결과로 확인한다.

## 남은 검증·구현 경계

설치형 SHAPER와 동일 장면·같은 조작의 직접 비교, 실제 저사양/모바일 하드웨어, 인증된 cloud save/sync, 운영 배포는 이번 기록의 검증 범위가 아니다. 고품질 의상 자산·천 시뮬레이션·전체 게임 엔진 포팅이 완료된 것도 아니다.

`ag-psd` 31.0.1은 2×1 RGBA 합성 이미지의 임시 RLE 저장소를 작게 잡는 극소 입력 결함이 재현됐다. 이번 제품 UI의 1024/2048/4096px 출력 검증과 구분하며, 내부 API의 모든 극소 해상도까지 검증 완료로 표시하지 않는다. PSD Worker 회귀는 불투명·반투명·투명 픽셀을 가진 4×1 파일을 실제로 다시 읽는다.
