# Supabase PostgreSQL TLS 신뢰 인증서

이 디렉터리의 `supabase-prod-ca-2021.crt`는 Supabase의 **공개 Root CA**다.
개인 키나 서비스 자격 증명이 아니다. Core API Linux 이미지에 포함하고
`NODE_EXTRA_CA_CERTS=/app/deploy/trust/supabase-prod-ca-2021.crt`로 Node 시작 시 로드한다.
`DATABASE_URL`의 `sslmode=verify-full`과 서버 이름 검증을 유지한다.

- 확인일: 2026-09-26
- 공식 출처: [Supabase Studio 인증서 URL 설정](https://github.com/supabase/supabase/blob/b044408e79cc25299139c68959863e6f06cc1e4d/apps/studio/hooks/custom-content/custom-content.json#L63)
- 다운로드: [Supabase 운영 CA](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt)
- PEM 파일 SHA256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`
- 인증서 DER SHA256: `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`
- 만료: 2031-04-26 10:56:53 UTC

2026-09-26에 세션 풀러의 인증서 체인과 hostname을 Python 및 Node로 검증했다.
동일 CA를 사용하는 `psql`의 `verify-full` 연결에서 TLSv1.3, runtime 역할 인증,
트랜잭션 안의 사용자 생성과 롤백을 확인했다. 이 검증은 Render 운영 연결 완료를 의미하지 않는다.

인증서를 교체할 때는 Supabase 공식 배포 경로와 인증서 지문·유효기간을 다시 검증하고,
승인한 새 이미지에 반영한다. 런타임의 `NODE_EXTRA_CA_CERTS` 변경만으로 이미 실행 중인
Node 프로세스의 신뢰 저장소는 갱신되지 않는다. 인증서 검증을 끄는 설정은 사용하지 않는다.
