# ToonStudio 3D 슬롯 아이콘 디자인 참고 원본

- 상태: `current` — 2026-09-27에 생성·보존한 디자인 참고 자료다. 실제 앱 화면, 실제 모델 렌더링, 제품용 아이콘 스프라이트가 아니다.
- 목적: 얼굴형·눈·눈동자·코·입·귀·헤어·체형·상의·하의·신발·액세서리·표정·포즈·손포즈 15개 슬롯의 의미와 일관된 선형 아이콘 방향을 검토한다.
- 실제 제품 연결 원칙: 제품 버튼은 직접 구현한 SVG 아이콘을 사용한다. 이 PNG를 아이콘이나 실제 모델 썸네일로 사용하지 않는다.
- 원본 파일: [toonstudio-3d-slot-icons-reference-v1-20260927.png](./toonstudio-3d-slot-icons-reference-v1-20260927.png)

## 생성 도구와 모델 확인 범위

- 사용한 스킬: `/Users/hjunkim/.codex/skills/.system/imagegen/SKILL.md`의 내장 도구 경로.
- 실제 호출 도구: `tools.image_gen__imagegen` (`functions.exec` 안에서 호출).
- 호출 인자: 아래의 정확한 `prompt`만 전달했다. 새 이미지 생성이므로 `referenced_image_paths`와 `num_last_images_to_include`는 전달하지 않았다.
- 호출 횟수: 1회.
- 모델: **미확인**. 이 세션에 제공된 도구에는 모델 선택 인자가 없고 응답에도 모델명이 없으므로, **이미젠 2.5를 사용했다고 확인하거나 주장하지 않는다**.
- 응답에서 확인된 필드: `image_url`(PNG data URL), `output_hint`(원본 저장 위치 안내).
- 별도의 생성 ID나 모델 ID는 응답에 없었다. 아래 디렉터리/파일 식별자는 저장 경로에서 확인한 값이며 모델 버전을 뜻하지 않는다.
- 외부 API, 별도 계정, CLI fallback을 사용하지 않았다. `.env`, API 키, 토큰을 읽지 않았다.

## 원본과 무결성

- 내장 도구가 반환한 원본 경로: `/Users/hjunkim/.codex/generated_images/01a0e2f3-6411-7f11-a0d1-65f6b1083c29/exec-dd163795-b72c-4d25-a1fd-3e2fa97d2e3c.png`
- 저장 디렉터리 식별자: `01a0e2f3-6411-7f11-a0d1-65f6b1083c29`
- 출력 파일 식별자: `exec-dd163795-b72c-4d25-a1fd-3e2fa97d2e3c`
- 저장 형식: PNG, 1536 × 1024, 8-bit RGBA.
- 파일 크기: 1,720,776 bytes.
- SHA-256: `ce6b1fcc10d122c230ba7cd01c578d90498abcac9eed915ee10c51975a978074`.
- 보존 방법: 생성 원본을 삭제하거나 편집하지 않고 위 버전 파일로 복사했다. 원본과 저장본의 SHA-256 일치를 검증했다.

## 시각 검토와 검증 한계

- 15개 슬롯, 한글 라벨, 밝음·어두움 참고, 크기 비교, 터치 영역 안내가 포함되어 있다.
- 헤어는 머리카락 실루엣, 코는 콧대·콧방울, 하의는 바지로 구분된다.
- 눈·눈동자와 얼굴형·표정은 서로 다른 도형으로 표현된다.
- 선택 예시에는 색 외에도 체크 표시와 `선택됨` 라벨이 있다.
- 배경에 생성된 명암·그라데이션과 일부 낮은 대비의 보조 문구가 남아 있다. 이런 장식은 실제 버튼 디자인 지침으로 채택하지 않는다.
- 이미지 안의 18px·20px·24px·44px 문구는 생성된 참고 표기다. 실제 픽셀 크기, WCAG 대비, 44px DOM 터치 영역, SVG 확대 품질을 검증한 결과가 아니다.
- 고대비 모드 및 실제 제품의 크기·접근성은 코드·테스트·브라우저 검증으로 별도 확인해야 한다.
- 이미 승인된 시안 이미지 파일은 이 호출에 입력되지 않았다. 전달된 텍스트 방향을 바탕으로 생성했다.

## 정확한 생성 프롬프트

```text
Use case: infographic-diagram
Asset type: ToonStudio 3D character editor semantic icon design reference board, not an app screenshot and not actual rendered model output.
Primary request: Create one polished, precise design reference board for a cohesive 15-icon functional outline system for ToonStudio character authoring. This reference informs hand-authored SVG production icons. Maintain a broad, calm canvas, consistent tool rail rhythm, tidy rounded panels, restrained accent color, and sharply recognizable small icons.
Composition: landscape professional design-system board. Main area: exactly 15 labeled icons in a clean 5-column by 3-row grid, generous whitespace, consistent optically centered 24px design grid, enlarged enough to inspect. Each icon is centered inside a clear 44px-equivalent touch-cell outline, with Korean label below. Include a secondary matching dark-mode reference strip and a compact true-size visual comparison strip marked 18px / 20px / 24px. Explain target touch area as 44px with a simple dimension mark. Label the board clearly as a design reference, never as a product screenshot.
Style: flat, production-minded vector-like outline artwork. All icons share 1.75–2px-equivalent rounded strokes, rounded joins, consistent visual weight and optical balance. Essential silhouettes with no tiny decoration. Light panel charcoal ink on near-white; dark panel soft-white ink on charcoal. One restrained muted teal accent for a selected cell. Selection also uses a checkmark and label, not color alone.
The fifteen icon subjects, order and exact Korean labels:
1. 얼굴형 — recognizable front-facing face contour with jaw and chin, without expression details.
2. 눈 — a pair of eyelid/eye outlines with minimal pupils.
3. 눈동자 — one distinct circular iris/pupil with a simple iris ring, clearly different from the eyes icon.
4. 코 — anatomical nose outline with bridge curve, tip and nostrils; never a triangle.
5. 입 — clear upper and lower lip contour, minimal curves.
6. 귀 — anatomical outer ear and inner fold silhouette.
7. 헤어 — recognizable swept fringe and hair/head silhouette; no scissors or comb.
8. 체형 — torso/body silhouette with shoulders, waist and hips.
9. 상의 — clear T-shirt outline with collar and sleeves.
10. 하의 — clear trousers with waistband, crotch and two legs; no stack or layers symbol.
11. 신발 — a side-profile sneaker silhouette with toe and sole.
12. 액세서리 — round glasses with bridge and short temples.
13. 표정 — expressive smiling face with eyebrows.
14. 포즈 — clear human figure with one bent arm and one bent knee to express posing.
15. 손포즈 — an open hand silhouette with four fingers and thumb.
Text (verbatim): "ToonStudio", "3D 슬롯 아이콘", "디자인 참고 · 실제 앱 화면 아님", "24px grid", "44px touch", "18px", "20px", "24px", "Light", "Dark", "선택됨".
Constraints: preserve all fifteen semantic slots, distinguish eyes versus irises and face shape versus expression; no model thumbnails, no characters, no fake app screenshot, no photorealism, no glossy 3D material, no bevel, no gradients, no shadows behind icons, no scissors, no generic triangles, no stacked layers. Do not name or claim the image generation model in the artwork.
```

