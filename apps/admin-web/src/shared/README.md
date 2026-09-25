# Admin Web 공용 영역

둘 이상의 Admin domain이 실제로 사용하는 UI primitive와 순수 helper를 둔다. `shared`는
`src/domains`나 `src/app`을 import하지 않는다.

Web과 Admin이 함께 필요한 코드를 복사하거나 `apps/web`에서 import하지 않는다. 좁고 실행 환경에
중립적인 계약·primitive만 focused package로 승격한다.
