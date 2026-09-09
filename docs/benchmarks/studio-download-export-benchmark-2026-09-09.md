# Studio 다운로드·내보내기 벤치마크 (2026-09-09)

## 검토 대상

- Figma export settings: 배율 배수(`x`), 고정 폭(`w`), 고정 높이(`h`), 파일명 suffix, 포맷별 옵션
  - https://help.figma.com/hc/en-us/articles/13402894554519-Export-formats-and-settings-for-static-designs
- Clip Studio Paint multi-page/batch export: 출력 폴더, 포맷, 페이지 범위, 일괄 설정
  - https://help.clip-studio.com/en-us/manual_en/570_pages/Exporting_multi-page_projects.htm
- Clip Studio Paint webtoon export: 페이지별/연속 출력, 세로 분할, 출력 폭·배율, 자동 순번
  - https://help.clip-studio.com/en-us/manual_en/540_comic/Webtoons.htm
- Adobe Express transparent PNG: 투명 배경을 포맷 선택과 명시적으로 결합
  - https://helpx.adobe.com/express/web/image-creation-and-editing/edit-images/remove-background.html
- Canva transparent output and flattened PDF guidance
  - https://www.canva.com/pro/transparent-images/
  - https://www.canva.com/help/download-flattened-pdf-variantb/

## 기존 Studio 강점

Studio는 이미 PNG/JPEG/WebP, 공개 래스터 교환 포맷, SVG/PSD/PDF/CBZ/ORA/InkML/WILL,
페이지 범위, 플랫폼 프리셋, DPI·트림·도련 프리플라이트, 워터마크, 웹툰 연합 스트립과
캔버스 한계 초과 시 배율 하향·분할을 제공한다. 경쟁 제품과 비교해 포맷 폭과 사전검사는 강하다.

## 발견한 전달 계층 결함

1. 긴 스트립이 여러 파일로 분할되면 브라우저가 파일마다 자동 다운로드 권한을 판단한다.
2. 뒤쪽 파트 인코딩이 실패해도 앞쪽 파트는 이미 저장되어 부분 결과가 남을 수 있다.
3. 작품 제목이 경로 문자, 제어 문자, bidi override, Windows 장치명을 포함하면 휴대성이 떨어진다.
4. Blob URL을 anchor click 직후 해제하면 WebKit 계열에서 읽기와 경쟁할 수 있다.
5. 분할 파일 집합 자체의 순서·MIME·크기를 설명하는 전달 매니페스트가 없었다.

## 이번 구현

- 분할 스트립을 모두 성공적으로 인코딩한 뒤 ZIP32 한 파일로 원자적 전달한다.
- 기존 bounded package writer를 재사용해 안전 경로, 중복 거부, CRC-32, 취소, 파일 수·크기·메모리
  상한을 그대로 적용한다.
- ZIP에 `manifest.json`과 `files/`를 넣어 순서, MIME, 바이트 크기, 생성 시각을 기록한다.
- 단일 스트립은 기존처럼 이미지 한 파일로 유지해 불필요한 압축 단계를 만들지 않는다.
- 모든 `downloadBlob` 호출에 교차 플랫폼 파일명 정규화와 WebKit용 Blob URL 유예 해제를 적용한다.
- 합성 캔버스는 Blob 생성 직후 1×1로 축소하고, 페이지 캔버스도 완료 후 해제한다.
- 캡처뿐 아니라 인코딩·ZIP 구성까지 `isExporting` 상태를 유지해 중복 실행 UI를 막는다.

## 검증 계약

- 한국어·Unicode 보존, traversal/제어/bidi/예약명 제거, 길이 상한, 대소문자 비구분 중복 이름
- ZIP signature, deterministic timestamp, manifest 내용, CRC 진행 콜백
- 기존 PNG/JPEG/WebP 이름 규칙과 단일 스트립 동작의 하위 호환성
- 실제 CI의 lint, typecheck, Vitest, build, architecture/bundle guard 통과

## 후속 후보

Figma식 `2x/1200w/2400h` 입력과 사용자 suffix UI, 손실 포맷 품질 슬라이더, File System Access API 기반
폴더 저장, 작업 큐·재시도 UI는 별도 상태·호스트 배선이 필요하다. 이번 변경은 그 전에 가장 큰 실제
실패 지점인 다중 다운로드 전달의 원자성·무결성·파일명 안전성을 우선 해결한다.
