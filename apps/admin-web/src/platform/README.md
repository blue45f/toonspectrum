# Admin Web 플랫폼

관리자 앱의 기술 adapter를 둔다. `http/`는 공통 request transport를 소유한다. 실제 코드가 생길 때
인증, telemetry, 환경, browser adapter를 추가한다.

Platform은 domain을 지원하지만 관리자 비즈니스 규칙을 소유하거나 `src/domains`를 import하지 않는다.
