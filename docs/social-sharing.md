# 소셜 공유 운영 가이드

ToonSpectrum의 공유 UI는 브라우저 기본 공유와 채널별 링크 공유를 함께 제공한다. 작품 상세는 제목·설명·표지 이미지를 전달하고, 일반 페이지는 페이지 제목과 기본 OG 이미지를 사용한다.

## 제공 채널

| 채널 | 별도 개발자 등록 | 구현 방식 |
| --- | --- | --- |
| 기기 공유 | 불필요 | Web Share API |
| 카카오톡 | 필요 | Kakao SDK for JavaScript |
| 네이버 | 불필요 | 공식 Share URL |
| LINE | 불필요 | LINE Social Plugins Share URL |
| X · Facebook · Telegram | 불필요 | 각 서비스의 공유 URL |
| 이메일 | 불필요 | `mailto:` |
| 링크 복사 | 불필요 | Clipboard API + 제한 환경 폴백 |
| QR 코드 | 불필요 | 사용 시점에만 QR 모듈 지연 로드 |

인스타그램처럼 일반 웹 공유 URL을 제공하지 않는 설치 앱은 지원 브라우저의 **기기 공유** 목록을 통해 선택한다.

## 카카오 앱 등록

1. 카카오디벨로퍼스에 로그인하고 앱을 생성한다. 기존 ToonSpectrum/ToonStudio 앱이 있다면 새 앱을 중복 생성하지 않고 기존 앱을 사용한다.
2. **앱 > 플랫폼 키 > JavaScript 키 > JavaScript SDK 도메인**에 다음 Origin을 등록한다.
   - `https://www.toonstudio.cloud`
   - `http://localhost:5173` — 로컬 개발이 필요할 때만 등록
3. JavaScript 키를 배포 환경의 `VITE_KAKAO_JAVASCRIPT_KEY`로 설정한다.
4. 빌드 후 작품 상세에서 공유 패널을 열고 카카오톡 공유 팝업과 모바일 앱 전환을 각각 확인한다.

`VITE_KAKAO_JAVASCRIPT_KEY`는 브라우저에 포함되는 공개 식별자다. 로그인용 REST API 키, Client Secret, Admin 키를 대신 넣으면 안 된다.

## SDK와 보안 정책

- SDK는 공식 CDN의 `2.8.3`을 필요할 때만 로드한다.
- 스크립트는 SHA-384 SRI를 검증하고 `crossorigin="anonymous"`로 로드한다.
- CSP는 다음 최소 범위만 허용한다.
  - `script-src`: `https://t1.kakaocdn.net`
  - `connect-src`: `https://kapi.kakao.com`
  - `form-action`: `https://sharer.kakao.com`
- 카카오 키가 없으면 SDK와 카카오 버튼 모두 비활성화되고, 다른 공유 방식은 정상 제공된다.

## 유입 측정

모든 공유 링크에는 기존 쿼리와 해시를 보존한 채 다음 값이 추가된다.

- `utm_source`: `kakao`, `naver`, `line`, `x`, `facebook`, `telegram`, `email`, `native`, `copy`, `qr`
- `utm_medium`: `social`, `share`, `email`
- `utm_campaign`: `content_share`

현재 트래픽 분석기는 이 UTM 값을 새 방문의 유입 소스·매체·캠페인으로 수집한다. 브라우저 내부 공유 이벤트에는 전체 URL이나 제목을 넣지 않고 채널·결과·경로만 전달한다.

## 배포 전 점검

- `VITE_KAKAO_JAVASCRIPT_KEY`가 프런트 빌드 환경에만 설정됐는지 확인한다.
- 카카오 JavaScript SDK 도메인에 실제 정본 Origin이 등록됐는지 확인한다.
- 작품 상세 OG 응답에 작품 제목·설명·표지·정본 URL이 들어가는지 확인한다.
- 모바일 Web Share 취소가 오류 메시지로 노출되지 않는지 확인한다.
- 클립보드가 제한된 웹뷰에서 복사 폴백이 작동하는지 확인한다.
- QR 코드가 공유 URL의 UTM 값을 포함하는지 확인한다.
- CSP 검증, TypeScript, 단위 테스트, 프로덕션 빌드를 모두 통과시킨다.
