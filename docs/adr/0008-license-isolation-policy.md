# ADR 0008 — 라이선스 격리 정책: permissive 직접 번들, LGPL 동적/격리 검토, G'MIC·GEGL 격리 provider/bridge, Krita GPL 코어 reference-only

## 상태

승인 (2026-08-07)

## 맥락

V11은 라이선스·안전성을 하드 게이트로 둔다(§3.1): 상용 배포 가능 여부, 사용자 파일의 서버 전송 여부, copyleft 격리 요구, codec·asset의 별도 라이선스가 품질 평가 이전의 관문이다. §11의 배포 원칙:

- "permissive 엔진은 browser/worker 직접 통합을 우선한다."
- "LGPL/CeCILL/GPL-compatible 계층은 정적 링크를 무조건 금지하는 대신 실제 라이선스 의무에 맞는 배포 방식을 법무 검토해 결정한다."
- "G'MIC·GEGL은 Local ToonBridge·격리 Provider·서버 실행을 기본 후보로 두되, 허용되는 형태가 확인되면 WASM/직접 통합도 비교한다."
- "Krita GPL 코어는 현재 상용 웹 번들에 바로 혼합하지 않고 format/behavior reference와 ToonBridge 경로를 우선한다."

매트릭스 라이선스 분포: permissive 다수(BSD/MIT/Apache/ISC — E01~E16, E21~E28 대부분), LGPL-2.1+(libvips E17), CeCILL 계열(G'MIC E18), library LGPL + tools GPL(GEGL E19), mixed(색관리 E20, 미디어 E23). Provider descriptor는 license/attribution 선언이 필수다(§2.2).

## 결정

1. **permissive(BSD·MIT·Apache·ISC·public domain) 후보는 직접 번들한다.** browser/worker WASM 직접 통합을 기본으로 하고, 고지·NOTICE·라이선스 사본을 앱 라이선스 페이지와 패키지에 동봉한다. 대상: CanvasKit, Vello 계열, Linebender 스택, Google Ink(Apache-2.0), perfect-freehand/Lyon, libmypaint(ISC), Hokusai, ThorVG, resvg, OpenCV, Three.js 스택, Rapier/Manifold, Yjs/Loro, SQLite 등.
2. **LGPL 계층(libvips, FFmpeg LGPL 빌드, LGPL 확인 구성요소)은 동적 결합/교체 가능 구조를 전제로 법무 검토 후 배포 형태를 확정한다.** 잠정 운용: 독립 WASM 모듈로 Worker에 로드해 라이브러리 교체 가능성을 확보하고, 소스 제공 고지를 게시한다. "정적 링크 무조건 금지"가 아니라 실제 의무 이행 가능한 형태를 선택한다(§11). FFmpeg는 GPL 전용 컴포넌트를 배제한 LGPL 빌드 플래그를 고정한다.
3. **G'MIC(CeCILL 계열)·GEGL(LGPL lib/GPL tools)은 격리 provider/bridge가 기본이다.** Local ToonBridge(로컬 헬퍼 프로세스) 또는 서버 provider로 실행하고, ToonStudio와는 직렬화된 job/result(EffectGraphIR 부분집합)만 교환한다. 서버 실행은 사용자 파일 전송 하드 게이트에 따라 기본 off·명시 옵트인이다. 법무 검토로 허용 형태가 확인되면 WASM 직접 통합을 벤치마크 비교 대상에 추가한다(§11).
4. **Krita GPL 코어는 reference-only다.** 상용 웹 번들에 코드·셰이더·리소스를 혼합하지 않는다. 허용 범위: 포맷(KPP/Krita bundle)·동작의 관찰과 문서 기반 재구현, ToonBridge 경로 검토. 코드 복사·이식은 금지하며, import 구현은 공개 포맷 명세와 자체 리버스 노트에서만 출발한다.
5. **집행 장치**: (a) CI license scan — 번들 산출물에서 GPL/CeCILL 서명 검출 시 릴리스 차단(매트릭스 검증 게이트 공통 항목), (b) Provider descriptor의 license 필수 선언, (c) 모든 asset·brush·font·3D·AI model의 Rights BOM(§11), (d) fork·고정 commit 사용 시 upstream hash·패치 목록·라이선스 사본 동봉(studio-hokusai-wasm의 LICENSE-* 동봉 방식 표준화).

## 근거

- 라이선스는 §3.1에서 품질보다 앞선 하드 게이트다 — 품질이 아무리 좋아도 배포 불가능한 결합은 후보 자격이 없으므로, 배포 방식 정책이 엔진 선택 알고리즘의 전제 조건이 된다.
- 4단 구분(직접 번들/동적·격리 검토/격리 필수/reference-only)은 매트릭스의 실제 라이선스 분포를 그대로 반영한다. 후보의 대부분이 permissive이므로 기본 경로를 가볍게 유지하고, 격리 비용은 G'MIC·GEGL 두 계층에만 지불한다.
- G'MIC 격리는 비용이 아니라 거래다: "공식 GUI 기준 640개 이상의 필터"(E18)를 자체 개발 없이 확보하는 대가로 브리지 1개를 유지한다. 필터 카탈로그 하드 캡 없음(§0.3) 목표에서 이 거래의 가치가 크다.
- Krita reference-only는 GPL 전파 위험의 원천 차단이면서도, SUT/KPP 등 외부 창작 포맷 최대 호환(§0.3) 요구를 포맷 수준 재구현으로 충족할 수 있게 한다 — 코드가 아니라 동작이 요구사항이다.
- 법무 검토 위임(§11)은 엔지니어링 문서가 라이선스 해석을 확정하지 않기 위한 경계다 — 본 ADR은 검토 전 잠정 안전값(더 보수적인 쪽)을 정하고, 완화는 검토 결과로만 한다.

## 결과

- license-deployment.md의 후보별 표가 본 정책의 적용 결과물이며, 신규 후보 추가 시 표와 Rights BOM 갱신이 필수 절차가 된다.
- `crates/gmic-provider-v11`·`crates/gegl-provider-v11`은 격리 경계(브리지 프로토콜)를 구현하는 크레이트로 설계된다 — 직접 링크 어댑터가 아니다.
- Local ToonBridge라는 배포 채널(로컬 헬퍼 설치·업데이트·프로세스 관리)이 신규 인프라 비용으로 발생한다. 서버 provider는 옵트인 UI·전송 범위 고지가 함께 필요하다.
- G'MIC/GEGL 필터의 preview는 격리 경계 밖(CanvasKit/OpenCV proxy)에서 제공되므로(§5 창작 필터 600+), preview/final 분리 스케줄러가 라이선스 격리의 성능 완충이 된다.
- LGPL 빌드 산출물·소스 고지 페이지·NOTICE 집계를 릴리스 파이프라인이 자동 생성해야 한다.
- 법무 검토 결과에 따라 일부 계층의 배포 방식이 완화(예: libvips 직접 번들 허용)되거나 강화될 수 있다 — 그 변경은 본 ADR 개정으로 기록한다.

## 재검토 조건

- 법무 검토가 완료되어 LGPL·CeCILL 계층의 허용 배포 형태가 확정될 때(잠정 안전값을 확정값으로 개정).
- G'MIC/GEGL의 WASM 직접 통합이 법적으로 허용 가능하다고 확인되고 벤치마크에서 브리지 대비 우위가 실측될 때(격리 기본값 재검토).
- 상류 라이선스 변경(재라이선스·듀얼 라이선스 제공 등)이 발생할 때(해당 후보 행 재분류).
- Local ToonBridge 설치율·운영 부담이 실사용에서 과도해 격리 필터 계층의 실효성이 떨어질 때(서버 provider 중심 재편 또는 해당 카탈로그 재평가).
- Krita 관련 기능이 포맷 호환을 넘어 동작 이식 요구로 확장될 때(reference-only 경계의 상위 재결정 — 별도 법무 검토 필수).
