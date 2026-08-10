# CSP blind lab license and deployment

## 라이선스

- 분석 하니스는 ToonStudio 저장소 코드로 배포한다.
- Clip Studio Paint 실행 파일·브러시·프리셋·사용자 자산은 저장소나 제품 번들에 포함하지 않는다. 랩 운영자가 적법한 CSP 라이선스와 자산 권리를 별도로 확보한다.
- 평가용 이미지에는 원본 자산 권리, 생성 제품·버전, 제작자 동의, 허용 목적과 보존 기간을 기록한 Rights BOM을 붙인다.

## 개인정보와 블라인딩

- 평가자 실명·이메일은 하니스 입력에 넣지 않고 가명 `evaluatorId`만 사용한다.
- participant packet과 sealed source key는 서로 다른 접근 제어 위치에 둔다.
- 결과 잠금 전에는 source key를 평가자·분석자에게 공개하지 않는다.
- 원본 캡처와 동의 기록은 제한된 랩 저장소에 두고, 저장소에는 권리 확인된 파생 결과와 집계 통계만 커밋한다.

## 배포 비용과 장애 처리

하니스는 순수 TypeScript이며 제품 번들/Worker에 포함되지 않는다. 메모리·GPU 비용은 사실상 없고 표본 수에 선형인 집계만 수행한다. 부분 파일, 중복 행, 잘못된 study ID, 누락 assignment는 조용히 버리지 않고 오류 또는 `insufficient-data`로 표면화한다. 랩을 운영할 수 없으면 다른 엔진 레인은 계속 검증하되 CSP 출시 게이트는 보류 상태를 유지한다.
