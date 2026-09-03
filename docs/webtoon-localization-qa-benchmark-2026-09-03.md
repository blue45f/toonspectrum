# 웹툰 현지화(번역·식자) QA 벤치마크와 ToonSpectrum 현지화 QA 계층 (2026-09-03)

## 1. 왜 이 계층이 필요했나

`StudioDialogueTranslatePanel`은 로케일별 번역 **존재 비율**(`dialogueTranslationCoverage`)만 보여줬다.
"몇 줄이 번역됐는가"는 알 수 있어도 "그 번역이 말풍선에 들어가는가, 영문 식자 규칙을 지키는가,
품질이 어느 수준인가"는 아무 데도 없었다. 넘침(overflow) 신호는 인스펙터의 자동 축소 패널이
**선택된 말풍선 하나**에 대해서만 냈고, 문서 단위·로케일 단위 집계는 없었다. 이 문서는 그 공백을
메우기 위해 조사한 외부 근거와, 그 근거를 어디까지 코드로 옮겼는지를 기록한다.

## 2. 조사 결과 — 1차 출처만 채택

| 출처 | 확인한 사실 | 신뢰도 |
|---|---|---|
| Mantra, AAAI-21 *Towards Fully Automated Manga Translation* (arXiv 2012.14271) | 읽기 순서 규칙 정확도 258쪽 중 91.9%; 만화 특화 OCR 61.7%(Google Cloud Vision 21.5%, Tesseract 1.5%); 식자 목표 = "텍스트가 영역 안에 들어가는 한 폰트 최대화"; **BLEU가 사람 평가와 순위가 뒤집힘** | 논문 |
| Mantra + TU Delft, COLING 2025 (2025.coling-main.232) | 페이지 단위 문맥이 문장 단위보다 우수; 전문 번역가 MQM 점수 — 공식 인간 번역 −1.31, 최고 AI −1.98, 범용 MT −4.25 | 논문 |
| MQM-Core (themqm.org) | 7차원·38서브타입; 심각도 배수 Neutral 0 / Minor 1 / Major 5 / Critical 25; APT·PWPT·NPT·QS; raw 합격선 99; Critical 1건 = 자동 Fail; 표본 500~20,000단어. `Design and markup › Truncation/text expansion`이 말풍선 넘침에 정확히 대응 | 공식 |
| ISO 5060:2024 | 분모를 단어 대신 **글자 또는 행**으로 둘 수 있음(만화 말풍선에 필요). 수치 배수는 유료 규격 — **미검증** | 규격 개요 |
| WMT 운영 변형 (Freitag et al., TACL 2021, Table 4) | Major/Non-translation 25, Major 5, Minor 1, Minor Fluency/Punctuation 0.1, 세그먼트당 최대 5건 | 논문 |
| WEBTOON 영문 스타일 가이드 (guide.totus.pro 공개본 2종) | 대사 ALLCAPS(작화 내 텍스트 제외), 말줄임표 정확히 3점, `?!`(역순 금지), `?`/`!` 최대 3개, 금지 문자 집합(`; : ~ 〜 、。「」『』<> ^^ ㅠㅠ` 이모지), 문장 끝 구두점 필수, SFX 단일 어근형, 관사 뒤 줄바꿈 금지·하이픈 뒤 허용, **다이아몬드 실루엣(모래시계 금지)**, 시리즈별 용어집 강제 | 공개 가이드 |
| Blambot *Comic Book Grammar & Tradition* | crossbar-I는 "I"·약어에만, 끼어듦은 이중 대시·여운은 3점 말줄임표, 사고/라디오/외국어/속삭임은 이탤릭 | 공개 |
| Comicraft 레터링 용어집 | 말풍선 여백 ≈ 글자 폭 1자, 양축 중앙 정렬 | 공개 |
| W3C i18n *Text size in translation* | 원문 길이별 EN→유럽어 확장률(≤10자 200~300% … >70자 130%); 폭 정규화 언어비 KO 0.8·ZH 1.2·PT/FR 2.6·DE 2.8·IT 3.0. 51~70자 행이 앞뒤와 비단조(151~170%) — **원문 오타로 의심되나 임의 수정하지 않음** | 공식 |
| Microsoft 의사현지화(pseudolocalization) 지침 | 기본 +40%, 극단 200~400% | 공식 |
| UAX #14 | 한글 H2/H3/JL/JV/JT는 기본 ID(어절 중간 분리 허용)이며 AL로 tailoring 가능 = CSS `word-break: keep-all`이 한국어 말풍선의 올바른 기본값 | 표준 |

**미검증으로 남긴 것**: KO→EN·JA→EN 확장률 공개 표(어디에도 없음), 네이버웹툰 자체 번역 제품 규격,
Toonsquare/Kakao 번역 사양, 경어·의성어 매핑 표준, ISO 5060 수치 배수, LISA QA 1/5/10 가중치(벤더 재인용).

## 3. 사전 조사 — 이미 있던 것과 없던 것

이 레포는 `creator` 도메인에만 2,600여 파일이 있어 **중복 구현이 최대 리스크**였다. 구현 전에 다섯
후보를 코드로 대조했다.

| 후보 | 판정 | 근거 |
|---|---|---|
| (a) 오류 분류·심각도·품질 점수 | **없음** | 번역 커버리지(존재 비율)만 존재 |
| (b) 영문 대사 문체·구두점 린터 | **없음** | 린터 3종(캔버스·레이어·에셋)은 텍스트와 무관 |
| (c) 렌더 전 넘침 예측 | **절반** | `studio-bubble-text-fit.bubbleTextFitsInBox`·`fitBubbleFontSize`가 요소 1개의 산술 판정을 제공. 문서·로케일 단위 집계와 처방(재줄바꿈→축소→확대→사람) 없음 |
| (d) 시리즈 용어집 강제 | **절반** | `studio-translation-memory`에 용어집 규칙·충돌 감지(`ambiguous-rule`·`missing-target`)가 있고 TM 항목 승인을 게이트함 |
| (e) 한국어 keep-all·금칙 가로쓰기 랩 | **규칙만 있고 배선 없음** | `studio-kinsoku-line-break.ts`는 **임포터 0·테스트 0인 죽은 모듈**이었고, `packages/studio-project-model/…/balloon-text-layout.ts`에 두 번째 미배선 구현이 또 있음. 세로쓰기만 `studio-vertical-text`로 실제 동작 |

(d)는 건드리지 않았다(이미 있는 것을 다시 만들지 않는다). (e)는 새 규칙표를 만들지 않고 죽은
모듈을 **넘침 게이트가 임포트해 되살리는** 방식으로 처리했다 — 세 번째 규칙표는 결함이다.

## 4. 구현 — `src/domains/creator/lettering/`

| 모듈 | 역할 | 근거 인코딩 | 테스트 |
|---|---|---|---|
| `studio-localization-mqm.ts` | MQM-Core 분류·채점 | 7차원 38서브타입 데이터, `STUDIO_MQM_SEVERITY_WEIGHTS` 0/1/5/25, `STUDIO_MQM_PASS_THRESHOLD` 99, `STUDIO_MQM_CRITICAL_AUTO_FAIL`, 분모 단위(`word`·`character`·`line`)를 결과에 명시, `detectStudioMqmTruncationErrors`가 넘침을 `Truncation/text expansion`으로 자동 채점, WMT 세그먼트당 5건 캡(`capStudioMqmErrorsPerSegment`) | 51 |
| `studio-localization-style-lint.ts` | 영문 대사 문체 린터 | 13개 규칙(`allcaps-dialogue` `ellipsis-three-dots` `interrobang-order` `punctuation-run-limit` `banned-dialogue-mark` `banned-source-locale-mark` `sentence-final-punctuation` `sfx-single-word` `sfx-root-form` `sfx-standalone-punctuation` `line-break-after-article` `line-break-before-hyphen` `balloon-silhouette-hourglass`), 발견마다 MQM 서브타입 매핑(`studioLocalizationStyleFindingToMqmError`), 규칙별 토글(성인물·작화 내 텍스트 예외) | 110 |
| `studio-localization-overflow-gate.ts` | 렌더 전 넘침 예측·처방 | em폭×행간 예산(`measureLocalizationEmBudget`), W3C 확장 표·폭 정규화 비율·Microsoft 의사현지화 수치, `DERIVED_KO_TO_EN_EXPANSION_PERCENT = 125`를 **파생값으로 라벨**, 근거 없는 언어쌍은 숫자 미생성, 처방 사다리 `fits → rebreak → shrink → enlarge → human`(절대 잘라내기 없음), `studio-bubble-text-fit`의 여백·행간과 `studio-kinsoku-line-break`의 금칙 후퇴 재사용 | 35 |
| `studio-localization-qa.ts` | 조립 | 번역 패널 큐 위에서 린트+게이트를 돌려 MQM 차원별 그룹과 점수 하나를 냄(`runStudioLocalizationQa`·`studioLocalizationQaGroups`·`studioLocalizationQaCueIndex`) | 13 |

네 모듈 모두 순수·결정적이며 `document`/`window`/`navigator` 참조가 없다. 폭 측정은 호출부가 주입한다
(기존 fit 모듈과 같은 계약).

## 5. 제품 배선

- **패널**: `StudioDialogueTranslatePanel`에 `qaOpen`/`onQaOpenChange`(선택 prop) 화면 추가.
  초안이 있으면 **적용 전** 초안을, 없으면 문서의 현재 문자열을 검사한다. `StudioLocalizationQaReport`가
  발견을 MQM 차원별로 묶고, 심각도는 색과 함께 **반드시 글자 라벨**로 표시하며(색만으로 의미 전달 금지),
  각 발견은 초안 행과 캔버스 요소로 되짚는다. 깨끗한 초안은 `StudioEmptyState`.
- **명령**: `text.localization-qa` (메뉴 `text/localization-qa`), 별칭 포함. 호스트 상태는
  `dialogueTranslateOpen: false | "translate" | "qa"`로 확장.
- **메뉴 그룹 명세**: §15.3 *Localization Layout* 행에 대응하므로 `extras`가 아니라 `rowsPartial`에
  claim — 커버리지 핀은 움직이지 않는다(로케일별 폰트/박스 오버라이드가 남아 `present`로 올리지 않음).

## 6. 벤치마크 대비 위치와 미해결

- BLEU를 게이트로 쓰지 않는다(AAAI-21에서 사람 평가와 역순). 기준점은 COLING-25의 MQM
  −1.31(인간) / −1.98(최고 AI) / −4.25(범용 MT).
- 처방 사다리는 Mantra의 "영역 안에서 폰트 최대화" 목표를 뒤집은 것 — 넘칠 때 **먼저 줄바꿈을 다시**
  하고, 그다음 축소, 그다음 확대, 마지막에 사람에게 넘긴다.
- **미해결**: KO→EN 확장률은 파생값(실측 코퍼스로 대체 예정); 시리즈 용어집을 QA 발견으로 승격하는
  연결(`studio-translation-memory` 충돌을 MQM `Terminology`로 채점)은 이번 범위 밖; 가로쓰기 한국어
  말풍선 랩에 keep-all/금칙을 **실제 렌더 경로**에 배선하는 일은 별도 과제 — 이번에는 넘침 게이트의
  예측 경로에서만 사용한다.
