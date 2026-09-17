# ToonStudio 전문 창작자 검증 계획

- 기준일: 2026-09-17
- 목적: 경쟁 제품 대체 주장을 실제 웹툰 제작 완주 증거로 제한한다.
- 상태: **외부 참여자 검증 필요**. 이 문서는 검증 절차이며 통과 증거가 아니다.

## 1. 검증 참가자

최소 12명으로 구성한다.

- 1인 웹툰 작가 4명
- 선화·채색·배경 전문 작업자 각 2명
- 웹툰 PD·검수자 2명

참가자는 Clip Studio Paint, Photoshop, Procreate, MediBang 또는 SketchUp 중 하나를 최근 12개월 안에 실무 사용한 경험이 있어야 한다.

## 2. 블라인드 제작 과제

동일한 원고 요구사항과 동일한 입력 소재로 다음을 수행한다.

1. 대본에서 20컷 콘티 생성
2. 10컷 선화·채색·말풍선 완성
3. 3D 배경을 직접 수정하고 2D 컷에 연결
4. PSD 가져오기·수정·다시 내보내기
5. 오프라인 편집 후 다른 기기에서 이어 작업
6. 검수 요청, 위치 댓글, 수정, 승인
7. 플랫폼 규격 게시 패키지 생성

## 3. 수집 지표

- 과제 완료 여부와 소요 시간
- 실행 취소·저장·복구 실패 횟수
- 입력 지연 p50·p95와 장시간 프레임 유지율
- PSD 구조 보존율과 시각 차이
- 3D 카메라·출력 패스 재현성
- 검수 댓글 위치와 승인본 불변성
- 기능 발견 시간과 도움말 의존 횟수
- SUS 및 작업별 7점 만족도
- 경쟁 제품으로 되돌아간 이유와 막힌 단계

## 4. 통과 기준

- 참가자 12명 모두 작품 데이터 유실 없이 과제 종료
- 핵심 제작 과제 완료율 90% 이상
- 저장·복구 치명 실패 0건
- 게시 패키지 사전검사 누락 0건
- PSD 손실 보고와 실제 손실의 불일치 0건
- 중앙값 SUS 80 이상
- 치명적 접근성·보안 결함 0건

## 5. 증거 보관

각 실행은 익명 참가자 ID, 앱·브라우저·GPU·펜 장치, 프로젝트 checksum, 시작·종료 시각, 실패 로그, 결과 파일 checksum을 기록한다. 원본 작품은 참가자 동의 범위에서 암호화 보관하며 공개 저장소에는 익명 집계와 재현 가능한 기술 로그만 남긴다.

## 6. 판정 원칙

실제 참가자 실행과 서명된 결과가 없으면 `PR-057`은 `external-validation-required`로 유지한다. 자동 테스트, 내부 스크린샷 또는 개발자 자체 사용은 전문 창작자 검증을 대체하지 않는다.

## Automated A–D prerequisite gate

External sessions start only after `pnpm run verify:studio-reference-projects` passes. The automated gate runs four deterministic project suites:

- A · solo vertical webtoon: project creation, durable resume, lettering and publish package
- B · team production: role gates, exact ProjectGraph revision binding, review and comment re-anchoring
- C · PSD and CLIP interchange: import, editable text, adjustment graph, selection round-trip and loss reporting
- D · editable 3D production: scene document, camera, multi-pass output, archive restore and VRM editing

The gate records evidence hashes and explicitly leaves `professionalReplacementClaimAllowed=false`. Passing it is a prerequisite, not a substitute, for signed participant evidence.

## 7. 실행 패키지와 제출 형식

검증 운영자는 다음 순서로 실행한다.

1. `docs/validation/studio-professional-creator-validation-protocol.json`의 역할·과제·통과 임계값을 검토한다.
2. `docs/validation/studio-professional-creator-validation-template.json`의 익명 참가자 슬롯을 실제 세션 기록으로 채운 별도 evidence JSON을 만든다.
3. 서명 원본과 작품 원본은 접근 통제된 외부 저장소에 보관하고, evidence JSON에는 파일의 SHA-256만 기록한다.
4. 다음 명령으로 구조, 역할별 인원, 7개 과제, 장치 정보, 결과 checksum, 참가자별 독립 서명과 통과 임계값을 검증한다.

```bash
node scripts/verify-studio-professional-validation.mjs \
  --evidence /secure/path/studio-professional-evidence.json \
  --receipt qa-results/studio-professional-validation/receipt.json
```

검증기는 참가자 12명과 역할별 최소 인원, 84개 과제 결과, 데이터 유실·게시 사전검사·PSD 손실 보고 불일치, SUS 중앙값, 치명적 접근성·보안 결함을 집계한다. 참가자와 코디네이터의 서명 파일 checksum이 모두 독립적이지 않거나 임계값 하나라도 충족하지 못하면 종료 코드가 실패하고 대체 완료 문구는 계속 차단된다.

저장소 CI는 protocol과 빈 template, 판정 로직을 검증하지만 실제 참가자 evidence를 생성하거나 통과로 가장하지 않는다. 최종 receipt의 `receiptSha256`, 원본 evidence checksum, 외부 서명 파일은 동일한 검증 실행 기록으로 보관한다.
