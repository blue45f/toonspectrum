# Filters 서브시스템 — 엔진 후보 역량 조사 (Capability Survey)

- 기준일: 2026-08-07
- 권위 소스: `docs/architecture/ToonStudio_검증엔진우선_하이브리드최적조합_선택적자체구현_최종아키텍처_V11_2026-08-07.md`, `docs/architecture/ToonStudio_V11_하이브리드엔진_장점조합_배치매트릭스.csv`
- 담당 매트릭스 행: **E01(Skia/CanvasKit), E16(OpenCV/OpenCV.js), E17(libvips/wasm-vips), E18(G'MIC/libgmic), E19(GEGL), E20(OCIO+LittleCMS+skcms)**
- 관점: V11 §7 필터 아키텍처와 §7.3 EffectGraph 컴파일(preview/final 분리, ROI/halo, cross-provider copy-cost)

## 조사 원칙

1. **성능 수치는 전부 미실측이다.** p50/p95/p99·Peak Memory는 `tests/benchmarks` 하니스(→ `benchmark-plan.md`)로 측정하기 전까지 절대 수치를 기재하지 않는다.
2. 정성적 사실은 공식 출처가 확인된 것만 기재하고 출처를 명시한다.
3. 판정(Final Role)은 배치매트릭스의 판정을 따르되, filters 관점의 세부 역할로 구체화한다.
4. Custom Provider(E28 wgpu 확장 계열)는 V11 §7.2에 따라 "비교 후보"로 함께 올린다. 금지 대상이 아니라 벤치마크 경쟁자다.

## 후보 요약표

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CanvasKit ImageFilter / RuntimeEffect (E01) | Skia의 성숙한 ImageFilter DAG(blur·colorFilter·displacement·lighting 등)와 SkSL 기반 RuntimeEffect 커스텀 셰이더를 주 컴포지터 안에서 바로 실행. 필터 결과가 합성 파이프라인과 같은 GPU 컨텍스트에 있어 재주입 비용이 없음 (출처: skia.org CanvasKit 문서) | 초대형 이미지의 demand-driven 타일 스트리밍 없음. 창작 필터 카탈로그(수백 개) 부재. 비파괴 필터 그래프의 영속 의미는 앱(EffectGraphIR) 몫. 색관리(ICC/OCIO)는 별도 계층 필요 | 실시간 기본 효과 기준선. GPU 래스터 품질은 안정적이나 대반경 blur·복합 체인의 정밀도는 final provider 대비 검증 필요 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 주 렌더 코어로 이미 상주하므로 filters를 위한 추가 번들·Worker 비용이 사실상 0. RuntimeEffect는 셰이더 컴파일 캐시 필요 | GPU 백엔드는 드라이버/기기별 픽셀 차이 가능. CPU(Software) 백엔드로 결정적 기준 이미지 생성 가능 | BSD 계열 (매트릭스 E01) | 최저. 동일 GPU texture/view 내 처리 — V11 §9.2 복사 비용 1순위 경로 | 낮음. Google 주도 성숙 프로젝트. WASM 번들·객체 수명 관리 필요(매트릭스 E01 위험) | **Preview 주력 + 실시간 기본 효과 final.** 모든 필터 노드의 interactive proxy 기준선 |
| OpenCV / OpenCV.js (E16) | threshold·morphology·gradients·Canny·contours·transforms·inpainting 등 검증된 CV/화상처리 연산 폭이 가장 넓음 (출처: docs.opencv.org imgproc). 마스크 생성·분석 능력이 강점 | 색관리 없음. 예술·창작 필터 부족. WASM 빌드는 GPU 가속이 제한적(주로 CPU+SIMD). 합성/블렌딩 품질 파이프라인은 렌더러 몫 | 분석·마스크 정확도 기준선. 시각 효과 자체보다 "선택·전처리 품질"로 평가 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 풀 빌드는 무겁다고 알려져 있어 custom build로 모듈 축소 + Worker lazy-load + 종료 시 메모리 회수 전제(매트릭스 E16 위험 항목). 정확한 크기·시간은 미실측 | CPU 연산 위주로 대체로 결정적. 멀티스레드 빌드의 부동소수 누적 순서 차이는 벤치마크에서 검증 | Apache-2.0 (매트릭스 E16) | 중간. Mat ↔ RGBA 타일 변환 + Worker 경계 SharedArrayBuffer/ImageBitmap 전달 필요 | 낮음~중간. 대형 커뮤니티. OpenCV.js 서브셋 유지·재빌드 파이프라인을 우리가 소유해야 함 | **분석·마스크 Provider.** 마술봉·선화 추출·먼지 제거·gap 분석·간단 preview 근사 |
| libvips / wasm-vips (E17) | demand-driven·horizontally threaded 파이프라인으로 대형 이미지에서 낮은 메모리·높은 처리량을 목표로 함 (출처: libvips.github.io). 8K·초장축 웹툰 스트립 export에 구조적으로 적합 | 인터랙티브 프레임 단위 preview에 부적합(파이프라인 지향). 창작 필터 카탈로그 없음. GPU 합성 경로 없음 | 대형 final 처리 품질 기준선. 리사이즈·피라미드·포맷 변환 품질은 업계 검증됨 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | Worker 격리 + lazy-load 전제. wasm-vips는 스레드 활용을 위해 SharedArrayBuffer(COOP/COEP 헤더) 요구 — 배포 헤더 정책과 함께 검증 필요 | 대체로 결정적. 타일 처리 순서에 따른 부동소수 누적 차이 여부를 golden diff로 검증 | LGPL-2.1-or-later (매트릭스 E17) — 격리·재링크 의무는 `license-deployment.md` 참조 | 중간. final 전용이라 hot path 밖. 타일/스트림 단위 전달로 peak memory 억제 | 중간. libvips 본체는 활발하나 wasm-vips 포팅 계층의 추적 비용 존재 | **대형 Final·Batch 주력.** 8K/초장축 export, pyramid, 일괄 변환, 대반경 연산 final |
| G'MIC / libgmic (E18) | 공식 GUI 기준 640개 이상의 필터와 자체 확장 언어·멀티스레드 라이브러리 (출처: gmic.eu). 창작 필터 카탈로그를 가장 빠르게 확보할 수 있는 단일 소스 | GPU 실시간 아님(CPU 멀티스레드). 브라우저 직접 번들이 라이선스·크기 면에서 곤란. 진행률·취소·비파괴 저장 의미는 앱이 감싸야 함 | 예술 효과·복원·패턴의 final 품질 상한이 높음. preview는 저해상 proxy 근사로 대체(품질 격차 계약 필요) | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | **번들 금지 기본.** Local ToonBridge/격리 Provider/서버 실행이 기본 후보(V11 §11). 브리지 프로세스 상주 비용은 on-demand 기동으로 관리 | 필터 스크립트에 난수 사용 가능 — seed 고정·스레드 수 고정 계약으로 결정성 확보. 미고정 시 비결정 | CeCILL 계열 (매트릭스 E18) — copyleft 격리 필수 | 높음. 프로세스/네트워크 경계 직렬화 + 타일 인코딩. final 전용으로 한정해 상쇄 | 중간. 단일 핵심 메인테이너 구조로 알려진 프로젝트 — 버전 고정·recipe 스냅샷 필요 | **창작 필터 Final 카탈로그(격리 Provider).** 600+ 필터 부트스트랩, marketplace recipe 원천 |
| GEGL (E19) | operation graph + loadable operation API로 비파괴 이미지 처리 DAG에 구조적으로 부합 (출처: gegl.org). GIMP 계열 연산 재사용, 연산 메타데이터 기반 자동 UI 생성 | 브라우저 WASM 배포가 비표준 경로(glib 의존성 무거움). 실시간 상호작용 제한. GPU 경로(OpenCL)는 웹에서 사용 불가 | 비파괴 filter graph final 품질 기준. float linear 파이프라인으로 고비트 처리에 유리 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | **번들 금지 기본.** bridge/서버 Provider 격리(매트릭스 E19 자체 위험 항목에 명시). EffectGraphIR→GEGL chain 컴파일러가 통합 비용의 본체 | CPU float 파이프라인은 대체로 결정적. 버전 간 연산 구현 변화는 golden corpus로 감시 | library LGPL, tools GPL (매트릭스 E19) — 격리 필수 | 높음. 프로세스 경계 + buffer 직렬화. native-node grouping으로 경계 횟수 최소화 | 중간. GIMP 생태계에 묶인 릴리스 주기. 웹 지향 포팅은 우리가 소유 | **비파괴 DAG Final Provider(격리).** 고급 non-destructive 체인의 offline final |
| OCIO + LittleCMS + skcms (E20) | 영화(OCIO config·display transform)·인쇄(ICC)·브라우저/Skia(skcms 고속 변환)를 각각 검증된 도구로 커버 (출처: opencolorio.org 외) | 필터 엔진이 아님 — 색 변환 전용. 캔버스 합성·효과는 담당하지 않음 | 색 정확도의 단일 기준. soft proof·export 변환 품질이 전체 필터 체인의 신뢰도를 결정 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | skcms는 Skia/CanvasKit에 사실상 동반. LCMS는 소형 라이브러리로 알려짐. OCIO는 config 로딩 포함 중형 — 정확 수치는 미실측. export Worker에 배치 | 색 변환 자체는 결정적. LUT 보간 구현 차이는 cross-engine color chart로 검증(매트릭스 E20) | mixed permissive/LGPL (매트릭스 E20 기재 기준 — 컴포넌트별 재확인을 `license-deployment.md`에서 수행) | 낮음~중간. 픽셀 대량 변환은 export 경계에서 1회만 수행하는 설계로 억제 | 낮음. 셋 다 성숙. 단, "여러 엔진이 색 변환을 중복 적용하지 않도록 ColorPipeline 하나가 소유"(매트릭스 E20) 규율 필요 | **ColorPipeline 단일 소유자.** import/display/export 경계의 색관리, 필터 working space 계약 |
| (비교 후보) Custom Provider — wgpu/WGSL pass fusion (E28 연계) | EffectGraphIR을 직접 컴파일해 pass fusion·타일 상주·고유 웹툰 효과(톤 인식 blur 등)를 구현할 수 있음. provider 경계 복사 자체를 제거할 잠재력 | 모든 것이 미구현. 검증 엔진의 640+ 카탈로그·수십 년 검증을 대체하지 못함 | 미검증 — reference corpus에서 기존 Provider 대비 우위를 입증해야 채택(V11 §3.3) | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 자체 WGSL 모듈은 소형. 유지보수 비용이 번들 비용보다 지배적 | 우리가 설계 소유 — 결정성 요건을 스펙에 내장 가능 | internal + wgpu permissive (매트릭스 E28) | 최저(주 frame graph 내부) | 높음. 전부 자체 부담 — 그래서 "공백 pass"부터 좁게 시작 | **증거 기반 승격 후보.** 병목 fusion·고유 효과에 한정해 벤치마크 경쟁 참여 |

## 후보별 보충 메모

### CanvasKit ImageFilter / RuntimeEffect (E01)
- V11 §7.2의 "실시간 기본 효과" 담당이자 §5의 "실시간 색·블러·그림자 → CanvasKit ImageFilter/RuntimeEffect → EffectGraph cache" 파이프라인의 주체.
- filters 관점 핵심 가치는 **preview proxy의 보편 기준선**이다: 어떤 final provider(libvips/G'MIC/GEGL)를 쓰든, 사용자가 슬라이더를 움직이는 동안 보는 것은 CanvasKit 경로다.
- RuntimeEffect(SkSL)는 G'MIC/GEGL 노드의 "근사 preview 셰이더"를 노드별로 등록하는 확장점으로 사용한다. 근사 품질 격차는 benchmark-plan의 픽셀 diff 예산으로 관리한다.

### OpenCV / OpenCV.js (E16)
- filters 서브시스템에서의 역할은 시각 효과가 아니라 **분석 전단**이다: 엣지·형태학·마스크·contour를 만들어 CanvasKit 합성 또는 final provider 입력으로 넘긴다(V11 §5 "엣지·형태학·먼지 제거" 행).
- 번들 전략: imgproc 중심 custom build 목록을 `provider-catalog`에 고정하고, 사용 모듈 목록 변화를 CI에서 diff한다.

### libvips / wasm-vips (E17)
- "편집 중 preview는 CanvasKit/Vello, 최종 대형 출력은 libvips"(매트릭스 E17)가 filters의 Preview/Final 분리 원칙 그 자체다.
- demand-driven 특성상 **EffectGraph final 컴파일 시 ROI·타일 계획을 vips 파이프라인 구성으로 직접 번역**할 수 있는지가 통합 검증의 1번 항목이다.

### G'MIC / libgmic (E18)
- "저해상도 proxy는 CanvasKit/OpenCV, 고품질 final은 Local ToonBridge/격리 provider의 G'MIC, 결과는 EffectGraph node로 저장"(매트릭스 E18)을 그대로 채택한다.
- recipe(필터 스크립트)는 버전·seed·파라미터를 EffectGraphIR 노드에 고정 저장해 재실행 재현성을 보장한다.

### GEGL (E19)
- "Toon EffectGraphIR을 GEGL chain으로 컴파일하고 interactive subset은 CanvasKit/OpenCV가 preview"(매트릭스 E19).
- G'MIC과 역할이 겹치는 구간(복원·color grading)은 동일 corpus 벤치마크로 노드 클래스별 승자를 정하고, 둘 다 격리 Provider이므로 동시 상주시키지 않는다(V11 §9.1).

### OCIO + LittleCMS + skcms (E20)
- 필터 체인의 **working color space 계약**(linear 합성 → export/display 경계 변환)을 이 계층이 소유한다. CanvasKit/Vello/libvips가 각자 색 변환을 수행하는 중복을 금지한다.
- cross-engine color chart 검증(매트릭스 E20)을 benchmark corpus에 상설 포함한다.

## 미해결 질문 (벤치마크로 답할 것)

1. wasm-vips의 스레드 미지원 환경(COOP/COEP 미적용 임베드) 폴백 성능이 final 게이트를 통과하는가.
2. G'MIC 격리 Provider의 왕복(직렬화+처리) 시간이 "final 대기 UX 예산" 안에 드는가 — ToonBridge vs 서버 실행 비교.
3. GEGL 도입이 G'MIC+libvips+OpenCV 조합 대비 실질 이득(비파괴 DAG 충실도)을 주는가, 아니면 EffectGraphIR 자체 스케줄러로 충분한가.
4. CanvasKit RuntimeEffect 근사 preview와 final 결과의 픽셀 diff가 노드 클래스별 예산을 넘는 필터 목록(=proxy 품질 부채 목록).
5. Custom wgpu pass fusion이 실제로 copy-cost를 줄여 p95를 개선하는 병목 체인이 존재하는가(V11 §3.3 조건 3).
