# 폐기된 DB migration 보관소

production numbered migration sequence에 포함되면 안 되는 대체된 SQL을 보관한다.

`0063_studio_project_graph_v3.superseded.sql`은 이전 ProjectGraph v3 초안이다. production sequence는
`migrations/0064_studio_project_graph_v3.sql`을 사용하며 현재 runtime model의 review-comment anchor
계약과 일치한다.

보관소는 작업·review 이력을 유지하되 중복 migration 번호가 production manifest를 모호하게 만드는 것을
방지한다. 이 디렉터리의 SQL을 migration runner 입력으로 추가하지 않는다.
