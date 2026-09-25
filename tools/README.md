# 저장소 도구

`tools/`에는 제품 자산·workflow를 만들고 검사하고 package하거나 자동화하는 비제품 utility를 둔다.
제품 애플리케이션은 runtime에서 tool source를 import하지 않는다.

```text
automation/   외부 workflow 정의와 운영 자동화
media/        결정적인 media·film authoring 도구
blender/      Blender extension과 asset pipeline
toonbridge/   로컬 DCC bridge와 command adapter
creator-runtime/ 독립 복구·공간 reader 제작 도구
```

실행 제품은 `apps/`, 선택형 서비스는 `services/`, 교차 앱 테스트와 benchmark는 `tests/`에 둔다.
