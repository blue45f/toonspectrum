# Studio 다운로드·내보내기 벤치마크 및 구현 기록

작성일: 2026-09-09

## 목표

기존 Studio의 PNG/JPG/WebP, SVG, PSD, PDF, CBZ, ORA, TIFF, InkML, WILL, 규격 슬라이스와 웹툰 연합 스크롤을 유지하면서, 여러 페이지를 외부 전달·업로드·장기 보관할 때 필요한 **단일 다운로드, 명확한 파일명, 진행·취소, 무결성 검증**을 보강한다.

## 공식 문서 기반 벤치마크

| 서비스 | 확인한 다운로드 동작 | Studio 적용 판단 |
| --- | --- | --- |
| Figma | 배율(`x`), 고정 너비(`w`), 고정 높이(`h`), suffix와 포맷을 export 설정으로 제공 | 기존 Studio 배율·포맷을 패키지에도 그대로 전달하고, 패키지 파일명과 페이지 파일명을 명시적으로 생성 |
| Figma | 선택한 여러 에셋을 미리 보고 일괄 export | 페이지 단위 캡처를 문서 순서대로 묶고 진행 상태를 단계별로 노출 |
| Canva | 페이지 선택 후 다중 페이지 다운로드, 출력 크기와 다운로드 문제 해결 가이드 제공 | 기존 페이지 범위·preflight는 유지하고 브라우저 메모리 한도와 실패 이유를 사용자 메시지로 노출 |
| Canva | PDF flatten 옵션 제공 | 검증 패키지의 capture mode를 `flattened-page`로 명시해 편집 가능한 원본과 구분 |
| CLIP STUDIO PAINT | 웹툰 내보내기에서 JPG/PNG, 파일명+연번, 배율/고정 너비, 페이지 범위, 개별 페이지/연결 출력, 세로 분할 제공 | 기존 연합 스크롤과 규격 슬라이스는 변경하지 않고, 별도 페이지 ZIP을 추가해 기능 의미를 섞지 않음 |
| CLIP STUDIO PAINT | PNG/WebP 투명 배경, 다중 페이지 워터마크, 100% export preview 제공 | 현재 포맷·투명 요청·워터마크 설정을 패키지 매니페스트에 기록하고 기존 캡처·워터마크 합성 경로를 재사용 |
| Adobe Express | 배경을 제거한 투명 PNG 다운로드 제공 | PNG/WebP의 투명 요청을 유지하되 패키지는 실제 캡처 특성을 `flattened-page`로 정직하게 표시 |

### 참고한 공식 문서

- Figma export settings: https://help.figma.com/hc/en-us/articles/13402894554519-Use-advanced-export-settings
- Figma export multiple layers: https://help.figma.com/hc/en-us/articles/360040028114-Export-from-Figma
- Figma color profiles: https://help.figma.com/hc/en-us/articles/360039825114-Manage-color-profiles
- Canva page download: https://www.canva.com/help/download-or-publish-your-design/
- Canva flattened PDF: https://www.canva.com/help/flatten-pdf/
- CLIP STUDIO PAINT webtoon export: https://help.clip-studio.com/en-us/manual_en/540_comic/Exporting_webtoons.htm
- CLIP STUDIO PAINT transparency: https://support.clip-studio.com/en-us/faq/articles/20200063
- CLIP STUDIO PAINT watermark: https://help.clip-studio.com/en-us/manual_en/540_comic/Watermark_settings.htm
- Adobe Express transparent PNG: https://www.adobe.com/express/feature/image/remove-background/transparent

## 구현 범위

### UI

기존 내보내기 패널 하단에 `검증 다운로드 패키지`를 추가한다.

- 현재 문서의 전체 페이지를 한 ZIP으로 다운로드
- 현재 PNG/JPG/WebP와 배율 설정 재사용
- JPG/WebP 품질 40~100% 조절, PNG는 무손실 표시
- 캡처, 인코딩, SHA-256, ZIP 조립 단계 상태 표시
- 진행률과 취소 버튼
- 실패·취소 후 동일 버튼에서 재시도
- 기존 PDF, CBZ, 웹툰 연합 스크롤의 의미와 동작은 유지

### ZIP 계약

```text
<작품명>-verified-pages.zip
├── manifest.json
├── README.txt
└── pages/
    ├── 0001-<페이지명>.png
    ├── 0002-<페이지명>.png
    └── ...
```

`manifest.json`은 다음 정보를 포함한다.

- schema/schemaVersion
- 생성 시각, 작품명, 포맷, 배율, 투명 배경 요청 여부
- `flattened-page` 캡처 모드
- 문서 원본 index와 패키지 page number
- 페이지 라벨, 경로, MIME, 픽셀 크기, 바이트 크기
- 페이지별 SHA-256

### 안전성

- NFKC Unicode 정규화
- 제어문자, bidi 제어문자, 경로 구분자와 Windows 예약명 차단
- 중복 page index 차단
- 선택 포맷과 Blob MIME 불일치 시 fail-closed
- 페이지 수, 개별 파일, 전체 바이트와 ZIP32 한도 적용
- 기존 dependency-free ZIP32 writer 및 CRC-32 Worker 재사용
- AbortSignal을 SHA-256/ZIP 조립 경계에 전파
- 동일 입력·생성 시각에서 안정적인 페이지 순서와 archive timestamp

## 비범위

- 기존 CBZ를 대체하지 않는다. CBZ는 ComicInfo 기반 뷰어 교환 포맷이고, 검증 패키지는 제작 전달·업로드·보관용이다.
- 웹툰 연합 스크롤을 ZIP으로 바꾸지 않는다.
- PSD/ORA처럼 편집 가능한 레이어 왕복을 주장하지 않는다.
- 매니페스트의 `transparentRequested`는 사용자 요청 기록이며, 실제 패키지 이미지는 `flattened-page`로 명시한다.
