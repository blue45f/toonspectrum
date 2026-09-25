# @toonspectrum/contracts

둘 이상의 배포 가능한 애플리케이션이 공유하는 좁고 실행 환경에 중립적인 계약 package다.

React, DOM/browser runtime API, NestJS, DB client, HTTP client, storage adapter와 application source import를
금지한다. UI helper는 소유 앱에 남기고 안정된 DTO, schema, protocol 상수, 순수 validation만 둔다.

`packages/domains/*`의 우회 경로로 사용하지 않는다. 새 export에는 실제 두 번째 소비자가 필요하다.
