# Studio 일러스트 팩 — 2026-09-26

현재 카탈로그에 등록한 생성 이미지 원본과 출처 기록이다. PNG는 생성 도구가 반환한 픽셀 크기와 파일 내용을 그대로 보존한다. 프레임, 벡터 말풍선, 대사 텍스트는 편집기에서 별도의 요소로 유지한다.

- `SOURCE.json`: 배포 원본의 크기, 바이트, SHA-256, 실제 알파 유무, 검수 기록과 생성 프롬프트 해시.
- `PROMPTS.json`: 생성·수정에 사용한 지시문 원문. 재현을 돕기 위한 기록이며 동일 픽셀의 재생성을 보장하지 않는다.
- 카탈로그 원본: `apps/web/src/domains/creator/catalog/studio-illustration-pack-manifest.json`.
- 생성 경로: 내장 `image_gen` 도구. 도구가 모델 버전을 제공하지 않아 `unverified`로 기록한다.
- 검수 주체: assistant. 사람의 검수나 요청한 특정 모델 버전의 사용을 확인한 것으로 표시하지 않는다.
- 프로젝트 내부 번들 분류: `LicenseRef-ToonSpectrum-BuiltIn-AI-Raster-v1`. 외부 CC0 자료와 구분한다.

`SOURCE.json`에는 검수 후 등록한 자원만 포함한다. `PROMPTS.json`에는 재생성·편집 또는 등록 전 검토에 사용한 지시문도 포함될 수 있다. 새 원본을 등록할 때 두 기록을 함께 갱신하고 파일 내용과 프롬프트 해시를 검증한다.
