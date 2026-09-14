# 사용자 비용형 AI와 창작 생태계 작업대

작성일: 2026-09-14

## 제품 원칙

- ToonStudio 운영측 AI 키, 운영측 GPU, 자동 유료 폴백을 생성 기능에 사용하지 않는다.
- 텍스트·이미지는 사용자가 등록한 OpenAI 호환 키를 브라우저에서 공급자에게 직접 보낸다.
- Hyper3D/Rodin은 통합 설정의 사용자 키를 요청 단위로 전달하며 서버 DB·작품 파일·로그에 저장하지 않는다.
- 영상·2D↔3D 변환은 사용자가 운영하는 Creator Runtime에 브라우저가 직접 연결한다.
- 비밀 값은 현재 탭의 `sessionStorage`에만 보관한다. 탭 종료·전체 키 삭제 시 제거된다.
- 연결 테스트와 생성 비용은 사용자 API 또는 개인 서버 계정에 발생할 수 있다.
- AI 미설정 상태에서도 샘플, 장면 팩, 학습, 검수, 연속성, 번역 수동 입력, 베타 독자, 과정 갤러리는 동작한다.

## 통합 설정

`/studio/ai-settings`가 AI 연결의 단일 사용자 표면이다.

1. OpenAI 호환 baseURL, 텍스트·이미지 모델, 키와 API 경로
2. Hyper3D/Rodin 사용자 키
3. 개인 Creator Runtime 주소, 토큰, 작업 소유자 ID

Studio 내부의 기존 AI 설정 패널도 같은 컴포넌트와 저장 키를 사용한다. 개별 기능 화면에서 별도 키 입력을 만들지 않는다.

## 비용 차단 경계

다음 레거시 API는 상태 정보만 제공하고 생성 요청은 `503`으로 닫는다.

- `POST /api/studio-ai/chat`
- `/api/studio-ai/inference/*`
- `/api/studio-ai/media/*`
- 서버 이미지 에셋 생성 경로

3D 생성 API는 `X-Studio-3D-Provider-Key`가 없는 생성·진행·취소 요청을 거부한다. 서비스 환경변수의 공급자 키가 있더라도 컨트롤러가 사용자 키 없는 유료 작업을 허용하지 않는다.

운세는 로컬 규칙과 직접 작성한 웹툰 콘티 폴백을 사용한다. 운영측 Gemini 키를 읽거나 호출하지 않는다.

이 경계는 AI 공급자·GPU 비용을 운영측에 발생시키지 않기 위한 것이다. 웹 호스팅, DB, 트래픽, 파일 저장 등 일반 서비스 비용까지 0원을 보장하지는 않는다.

## 개인 Creator Runtime

브라우저 연결용 실행 예시:

```bash
cd services/creator-inference
export CREATOR_INFERENCE_TOKEN='32자 이상의 무작위 토큰'
export CREATOR_BROWSER_ORIGINS='https://www.toonstudio.cloud,http://localhost:5173'
uvicorn browser_app:app --host 0.0.0.0 --port 8000
```

- 와일드카드 CORS는 허용하지 않는다.
- 운영 도메인은 HTTPS exact origin으로 등록한다.
- 토큰은 URL이나 쿼리 문자열에 넣지 않는다.
- Runtime은 한 `CREATOR_DATA_DIR`당 단일 worker만 소유한다.
- 모델·GPU smoke test 성공은 작품 품질 보장이 아니므로 결과 파일을 검토한다.

## 창작 생태계 작업대

`/studio/ecosystem`은 기능 목록이 아니라 완결된 제작 흐름을 제공한다.

- 자체 샘플 작품 4종과 장면 팩 6종
- 저장·내보내기까지 확인하는 안내형 실습
- 원고 JSON preflight, 안전한 공백·중복 수정, 오류 재검사
- 회차별 캐릭터·의상·소품·장소 연속성 검사
- 원문 revision에 묶인 번역 초안·승인·stale 판정
- 텍스트 중심 베타 독자 패키지와 응답 가져오기
- 콘티·선화·채색·완성 과정 패키지
- 감상 장르를 자체 창작 과제로 바꾸는 연결

브라우저 저장 데이터는 버전·개수·문자열 길이·파일 크기를 제한하고, 손상된 항목은 신뢰하지 않는다. 작품 원본을 자동 수정하는 기능은 제목 공백과 중복 태그처럼 의미가 변하지 않는 항목에만 적용한다.
