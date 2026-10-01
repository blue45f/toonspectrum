# brush-lab(Sumi) 브러시 엔진 참고 문헌 원장 — 2026-10-01

- 상태: **현재(참고 문헌·라이선스 판정 원장)**. 기법별 구현 상태는 표의 `단계`(MVP / Beta / Later)와
  `apps/brush-lab/README.md`의 레인 상태 표가 권위다. 2026-10-01 현재 엔진 코어는 작업 트리에 작성 중이며 브라우저 실기기 픽셀은 검증되지 않았다.
- 출처: 2026-10-01 연구 워크플로우 종합(채택 기법 16건, 참고 코드 50건, 논문 49건, 라이선스 경고 14건, 수치 목표 14건)과
  2026-09-30 정찰·물리 설계 보충(팁 접촉·필기감, 습식 매체). 결정의 권위는
  [ADR-0026](../adr/0026-labs-experimental-apps-engine-selection-and-promotion.md)이다.
- 사용 규칙: 참고 코드는 **개념·수식만** 가져오고 코드를 복제하지 않는다. MIT/Apache/BSD/ISC/CC0/Zlib은 출처 주석과 함께 재구현할 수 있다.
  GPL/AGPL/CC BY-NC/Prosperity 저장소는 코드·LUT·상수·곡선 데이터를 열람·복제하지 않는다.

## 1. 채택 기법(모듈 매핑·알고리즘 요약·출처)

모듈 경로는 `apps/brush-lab/src/` 기준이다.

| # | 기법 | 모듈 | 알고리즘 요약 | 주요 출처 | 단계 |
| --- | --- | --- | --- | --- | --- |
| 1 | sort-middle 타일 비닝 파이프라인 | `engine/raster/tile-binning.ts`, `engine/gpu/layout.ts`, `engine/gpu/wgsl/{bin-count,bin-scan,bin-scatter,fine-raster}` | dab 인스턴스(64 B) → bbox → bin → 타일 카운트 reduce-then-scan → 안정 scatter(CSR) → 타일당 워크그룹(16,16,1) fine 래스터, 공유 메모리 rgba32f 누적 후 1회 storage 쓰기. `dabIdx` 오름차순 고정으로 atomic 순서 비의존 | Vello(Apache/MIT), Levien sort-middle 2020, Laine & Karras HPG 2011 | MVP |
| 2 | prefix sum | `engine/raster/tile-binning.ts`, `engine/gpu/wgsl/bin-scan` | 3 dispatch reduce → spine → downsweep(~3n). decoupled look-back은 WebGPU forward-progress 미보장과 NVIDIA 특허 때문에 `experimental.chainedScan` 플래그 한정 | GPUPrefixSums(MIT, study-only), Merrill & Garland 2016 | MVP |
| 3 | 해석적 AA 커버리지 | `engine/raster/coverage.ts`(CPU 참조), `fine-raster` WGSL 미러 | hard 타원: 경계적분(Manson-Schaefer) 참조, GPU는 8~32 선분 평탄화 + signed-area 누적; soft: 가우스 CDF 램프 `Φ(−d·r/(0.5w))`, 에지 50%. 두 경로 차 ≤1/255 fixture | Manson & Schaefer 2013, font-rs(Apache-2.0), Rive feathering(MIT), Blend2D(Zlib, study-only), Auzinger 2012 | MVP |
| 4 | 선형 premultiplied 누적 + 획 불투명도 상한 | `engine/raster/stroke-layer.ts`, `engine/raster/composite.ts`, `composite` WGSL | 획 버퍼(희소 타일, rgba16f 저장)에 over 누적. Wash: 합성 시 `α_S' = min(α_S, opacity)`; Build-up: dab over. 간격 보정 `α' = 1−(1−α)^(spacing/ref)`. sRGB는 표시·PNG 저장 시점만 | Porter-Duff 1984, Smith 1995, libmypaint(ISC) `opaque_linearize`, Krita 문서(개념만) | MVP |
| 5 | 스트로크 동역량 매핑 | `engine/dynamics/{mapping-curves,dab-emitter,scatter,color-dynamics,stroke-pipeline}.ts` | 입력 벡터(압력·속도 2시상수·방향·틸트·진행·결정적 random·custom) × 구간선형 곡선 → 설정. dab 간격 누적기, 테이퍼, 멀티팁 시퀀스, 스프레이 이미터(≤16 하위 dab), 듀얼 스트림(13종 결합) | libmypaint `brushsettings.json`(ISC), mypaint-brushes(CC0), CSP·Procreate 매뉴얼(파라미터 의미만), Chu & Tai 2004(개념) | MVP |
| 6 | 입력 파이프라인 | `engine/input/{input-pipeline,one-euro,predictor,corner-preserve,calibration}.ts`, `platform/pointer-capture.ts` | `getCoalescedEvents` 정본, 채널별 1€ 필터(안정화 0~100 → `mincutoff`/`β` 매핑), 코너 보존, `getPredictedEvents` → 등속 외삽 폴백, 예측 dab은 `PREDICTED` 플래그로 롤백, 펜 업 시 큐빅 피팅 재래스터 | Pointer Events L3, Casiez 1€(수식), lazy-brush(MIT), Nancel 2018, perfect-freehand(MIT), kurbo(Apache/MIT) | MVP |
| 7 | 팁 접촉 물리·필기감 | `engine/physics/{tip-contact,nib-flex,bristle-bundle,graphite-deposit,velocity-deposit,friction,physics-model}.ts` | 고정 tick 1/240 s. 탄성 팁(Hertz 접촉 `a³ ∝ FR`), 붓모 다발(비대칭 시상수 스프링 + 잉크 저장고, 이력 8~15%), 닙(2차계 `g'' = ωn²(g*−g) − 2ζωn g'`, 방향 의존 폭), 연필·목탄(그레인 임계 침착 + 마모). 결정성 검증 단위는 CPU `DabInstance[]` | Hertz 접촉 이론, Sousa & Buchanan 1999, libmypaint(개념), google/ink-stroke-modeler(Apache-2.0) | MVP |
| 8 | CPU/WASM 참조 래스터라이저·결정적 fixture | `engine/raster/reference-renderer.ts`, `bench/fixtures/*`, `engine/wasm/*`(확장) | 스트로크 로그(시드·양자화 샘플) 비파괴 재생. 패리티 단계: dab 버퍼 비트 동일 → bin/tile 카운트 → 타일 픽셀 |Δ| ≤ tol → 합성 ΔE. Rust C-ABI wasm은 외부 crate 0 + `INTEGRITY.sha256` | vello_common strip/tile, tiny-skia(BSD-3), zeno(MIT/Apache) | MVP |
| 9 | 절차적 그레인·종이·팁 질감 | `engine/texture/{tip-generators,paper-grain,mip-chain,sampling}.ts` | PCG/xxhash 정수 해시 노이즈(CPU/GPU 비트 동일), fBm + 이방성 Gabor 섬유, 히스토그램 보존 헥스 타일링, Burley mip 분산 보정, `textureSampleGrad`에 해석적 야코비안, EWA 근사 | webgl-noise(MIT), OpenSimplex2(CC0), Heitz & Neyret 2018, EWA on GPU 2011, msdfgen(MIT, 빌드 도구) | MVP |
| 10 | Kubelka-Munk 안료 혼색 자체 구현 | `engine/pigment/{kubelka-munk,pigment-table}.ts` | 참조(CPU 38밴드): `KS=(1−R)²/2R`, 농도 가중 혼합 `c_i = f_i²T_i²L_i`, `R = 1+KS−√(KS²+2KS)` → XYZ → 선형 sRGB. GPU는 3기저→8파장 구적 또는 Jakob-Hanika LUT 후보. K/S 표는 `synthetic` 라벨 | spectral.js(MIT), Haase & Meyer 1992, Burns 2017, Mallett & Yuksel 2019, rgb2spec(BSD-3), Curtis 1997 §5.1, [저장소 KM 검토](brush-spectral-km-20260920.md). **Mixbox 금지** | Beta |
| 11 | 습식 상태 레이어·희소 타일 활성화 | `engine/wet/{state,params,active-tiles,step-water,step-pigment,step-dry,wet-reference}.ts`, `wet-step` WGSL | 젖은 타일 리스트만 indirect dispatch. 수채·수묵: LBM D2Q9 단일 코어(MoXi) + Curtis식 표면/모세관/침착 층, 다공성 부분 bounce-back, 에지 다크닝·그래뉼레이션·백런 창발. 고정 반복·dt·시드 | Curtis 1997, MoXi 2005, Van Laerhoven 2004–05, Sun 2018, Gruszczynski 2024, dli/paint(MIT), WebGL-Fluid-Simulation(MIT), Bousseau 2006(경량 모드) | Beta |
| 12 | 유화·임파스토 | `engine/wet/impasto.ts` | 높이맵 + 부피 보존 gather 밀기(원자 없이 정확 보존), 4슬롯 KM, 릴리프 조명(중앙차분 법선 + Blinn-Phong), 건조 평탄화 | IMPaSTo 2004, Hertzmann 2002 | Beta / 조명 Later |
| 13 | smudge / pickup | `engine/raster/fine-raster.ts`(smudge 상태), `engine/wet/*` | 획 시작 시 bbox 타일 스냅샷 Ω(COW), 픽업 맵 `P ← lerp(P, Ω, rate)`(자기 피드백 차단), Dulling/Smearing 2전략, 질량 보존 지표 | Chu et al. NPAR 2010, dAb 2001, Krita 문서(개념만), SmartSmudge 2024 | Beta |
| 14 | 픽셀→dab 구간 역방향 합산·에어브러시 닫힌 형식 적분 | `engine/raster/fine-raster.ts`(SEGMENT 명령) | 간격 ≤0.1r 획은 `SEGMENT(p0,p1,r0,r1)` 명령으로 치환해 픽셀에서 영향 스탬프 정수 구간 합산(상한 64). 에어브러시는 erf 닫힌 형식 | Ciallo 2024(논문만, 코드 AGPL 미열람), Konieczny & Meyer 2009 | Beta |
| 15 | 스크린톤·해칭·특수 패턴 | `engine/texture/tip-generators.ts`(hatch·stipple·particle), `engine/dynamics/scatter.ts` | 톤 = dab 커버리지 × 문서 좌표 고정 필드 F(q). 회전 격자 하프톤 SDF 셀, 블루노이즈 순위 디더(void-and-cluster, 빌드 생성), phasor 위상장 해칭 | Georgiev-Fajardo, Phasor 2019, three.js HalftoneShader(MIT), glsl-halftone(MIT), Ostromoukhov 2001, klecks(MIT), p5.brush(MIT) | Beta |
| 16 | WebGPU 리소스·한도·계측 규약 | `engine/gpu/{device,buffers,timing,pipeline-compute,present,readback}.ts` | `writeBuffer` + 3-deep 스테이징 링, 256 B 정렬, 바인드 그룹 g0 프레임/g1 브러시/g2 타일, `layout:'auto'` 금지, 파이프라인 시작 시 전부 생성, `getCompilationInfo` 오류 표면화, `timestamp-query` 100 µs 양자화 전제 p50/p95, 기능 부재는 `null` + 사유 | toji.dev, WebGPU Fundamentals, MDN GPUSupportedLimits, W3C WebGPU/WGSL, Chrome 120·121·146 블로그 | MVP |

상충 해결 기록: Vello compute 렌더러 구조를 GPU 경로로, sparse strips 자료구조를 CPU 참조로 채택(sparse strips는 상류가 프로덕션 부적합 명시).
SDF+smoothstep 커버리지는 GPU 근사로만 허용하고 ground truth는 경계적분. DiVerdi 2013 벡터 폴리곤 수채는 Adobe 특허로 미채택.

## 2. 참고 코드와 라이선스 판정

활용 방식: **활용**(출처 표기 후 수식·구조 재구현 또는 빌드 도구), **개념만**(study-only, 코드 미복제), **직접 의존**(npm), **금지**.

| 저장소 | 라이선스(확인일) | 활용 방식 | 용도 |
| --- | --- | --- | --- |
| linebender/vello | Apache-2.0 OR MIT(README 2026-09-30) | 활용 | 파이프라인 골격, 패리티 전략, 희소 strip. 커밋된 `pkg-gpu`는 벡터 비교 레인([Vello 핀](vello-baseline.md)) |
| mypaint/libmypaint | ISC(COPYING 2026-10-01) | 활용 | 동역량 스키마, dab 간격, falloff, 결정적 난수. v1.6.1 wasm은 저장소 기준선 레인 |
| mypaint/mypaint-brushes | CC0-1.0 | 활용 | `.myb` 설정만 fixture 입력(`_prev.png` 미사용) |
| rvanwijnen/spectral.js | MIT | 활용 | KM 참조 수식·테스트 벡터 |
| mitsuba-renderer/rgb2spec | BSD-3 | 활용 | 빌드 타임 LUT 생성 |
| raphlinus/font-rs | Apache-2.0 | 활용 | signed-area 커버리지 |
| linebender/tiny-skia | BSD-3 | 활용 | 슈퍼샘플 골든, 스테이지 파이프라인 |
| dfrg/zeno | MIT OR Apache | 활용 | Rust→wasm 참조 래스터 |
| blend2d/blend2d | Zlib | 개념만 | cover/area 수식, compop 참조 |
| google/skia | BSD-3 | 개념만 | AA·블렌드 테스트 벡터 |
| rive-app/rive-runtime | MIT | 활용(참고) | 가우스 CDF 소프트 에지 |
| b0nes164/GPUPrefixSums | MIT(특허 주의) | 개념만 | reduce-then-scan 참고. look-back은 실험 플래그 |
| casiez/OneEuroFilter | BSD-3(루트 LICENSE 부재) | 자체 구현 | 입력 필터(수식 출처는 논문) |
| dulnan/lazy-brush | MIT | 활용 | pull-string |
| steveruizok/perfect-freehand | MIT | 활용(저장소 1.2.3 의존) | 스무딩·모의 압력·외곽선 |
| linebender/kurbo | Apache OR MIT | 활용 | 사후 보정·벡터 잉크 |
| stegu/webgl-noise, KdotJPG/OpenSimplex2 | MIT / CC0 | 활용 | 그레인(정수 해시로 수정) |
| Chlumsky/msdfgen | MIT | 활용(빌드 도구) | 절차 팁 MSDF |
| dli/paint | MIT(`third_party/dli-paint/LICENSE`) | 활용(WGSL 포팅) | 유체·강모·높이맵 조명 |
| PavelDoGreat/WebGL-Fluid-Simulation | MIT | 활용 | 반해상도 유체 폴백 |
| bitbof/klecks | MIT | 활용(로직) | 플러그인 인터페이스, sketchy |
| acamposuribe/p5.brush | MIT(저장소 patch 적용) | 활용 | 절차 질감 파라미터·해칭·수채 채움 |
| webgpu/webgpu-samples | BSD-3 | 활용 | 베이스라인·mipmap |
| google/forma, servo/pathfinder | Apache-2.0 / MIT OR Apache(아카이브·휴면) | 개념만 | 증분 타일 합성, solid 타일 fast path |
| GraphiteEditor/Graphite | MIT OR Apache | 개념만 | 비파괴 스트로크, 블렌드 수식 |
| jamieowen/glsl-blend | MIT | 활용 | 분리형 블렌드 모드 |
| mrdoob/three.js HalftoneShader, stackgl/glsl-halftone | MIT | 활용 | 톤 셀 수식 |
| thorvg/thorvg | MIT | 개념만 | compute 없는 합성 폴백 |
| opentoonz/opentoonz | BSD-3(에셋 별도) | 개념만 | 상한 패턴, 표면 어댑터 |
| gfx-rs/wgpu(naga) | MIT OR Apache | 활용(도구) | WGSL 검증, WebGL2 폴백 생성 |
| Agamnentzar/ag-psd | MIT | 직접 의존(루트) | PSD 내보내기 |
| google/ink-stroke-modeler | Apache-2.0 | 활용(저장소 wasm 백엔드) | 예측은 자체 구현 |
| Flutter Impeller README, Skia Graphite DrawPass | BSD-3 | 개념만 | 설계 원리 |
| KDE/krita, GNOME/gimp, mypaint/mypaint, drawpile, harmony, milton | GPL | **금지** | 문서·개념만 |
| darkly-art/darkly, ShenCiao/Ciallo | AGPL | **금지** | 공개 설명·논문 수식만 |
| scrtwpns/mixbox, lygia | CC BY-NC 4.0 / Prosperity | **금지** | 요구사항·체크리스트만([저장소 고지](../../third_party/mixbox/README.md)) |
| msxie92/ScreenStyle(ScreenVAE) | 커스텀(상업 시 서면 통지) | 보류 | 법무 확인 전 미도입 |
| cudaraster, Elasticurve-src, Unity stochastic texturing, simple-spectral, Burns MATLAB | 미확인 | 개념만 | 수식만 |

## 3. 논문·공개 자료 목록

| 자료 | 용도 |
| --- | --- |
| Levien, sort-middle(2020) / piet-gpu progress(2020) | 파이프라인 단계, bin/tile 크기, 성능 비율 |
| Laine & Karras, High-Performance Software Rasterization on GPUs(HPG 2011) | 순서 보존 큐, fine 워크그룹 설계 |
| Merrill & Garland, Single-pass Parallel Prefix Scan with Decoupled Look-back(2016) | 실험 플래그 스캔(특허 주의) |
| Manson & Schaefer, Analytic Rasterization of Curves with Polynomial Filters(EG 2013) | 타원 정확 커버리지 |
| Auzinger et al., Analytic Anti-Aliasing of Linear Functions on Polytopes(EG 2012) | 다각형 팁·선형 그라디언트 AA |
| Porter & Duff, Compositing Digital Images(1984) / Smith, Image Compositing Fundamentals(1995) | premultiplied 누적 근거 |
| Curtis et al., Computer-Generated Watercolor(1997) | 수채 6커널, K/S 역산 |
| Chu & Tai, MoXi: Real-Time Ink Dispersion in Absorbent Paper(2005) | 먹 LBE D2Q9 |
| Baxter et al., IMPaSTo(NPAR 2004) | 유화 높이장, 8성분 KM |
| Van Laerhoven & Van Reeth(2004–05) | 희소 타일 활성화, 층별 캔버스 |
| Sun et al.(i3D 2018) / Gruszczynski(2024) | granulation·LBM 파라미터 |
| Bousseau et al., Interactive Watercolor Rendering(2006) | 경량 수채 모드 |
| DiVerdi et al., A Procedural Watercolor Engine(2013) | 미채택 근거(특허) |
| Sochorová & Jamriška, Practical Pigment Mixing(TOG 2021) | KM 요구사항만(구현물 Mixbox 금지) |
| Haase & Meyer, Modeling Pigmented Materials(1992) | KM 1차 문헌 |
| Burns, Numerical Methods for Smoothest Reflectance(arXiv 1710.05732) | 안료 스펙트럼 생성 |
| Mallett & Yuksel(2019) / Jakob & Hanika(2019) | GPU 스펙트럼 경로 후보 |
| Chu et al., Detail-Preserving Paint Modeling(NPAR 2010) / Baxter dAb(2001) / SmartSmudge(2024) | smudge/pickup |
| Chu & Tai, Real-time Painting with an Expressive Virtual Chinese Brush(2004) / DiVerdi 2010 / Chen et al. WetBrush(2015) | 팁 물리 근사(특허 검토) |
| Sousa & Buchanan, Observational Model of Blenders and Erasers / Graphite Pencil(1999) | 흑연-종이 결 침착 |
| Ciallo(2024) / Konieczny & Meyer(NPAR 2009) | 구간 합산, 에어브러시 적분 |
| Hertzmann, Fast Paint Texture(NPAR 2002) | 임파스토 조명 |
| EWA on GPU(2011) / Heitz & Neyret(2018) / Gabor Noise(2009) / Phasor Noise(2019) | 그레인 생성·샘플링 |
| Void-and-cluster / Georgiev & Fajardo(2016) / Ostromoukhov(2001) / Pang 2008·Qu 2008 / ScreenVAE(2020) | 스크린톤·하프톤 |
| Casiez 1€ Filter(CHI 2012) / Elasticurves(2011) / Nancel et al.(2018) / Ng et al.(UIST 2012) | 입력 안정화·예측·지연 예산 |
| Pointer Events L3 / Chrome desynchronized / W3C WebGPU·WGSL / MDN Limits / Chrome 120·121·146·147-148 블로그 / toji.dev / WebGPU Fundamentals | 플랫폼 규약 |
| Skia Graphite 소개 / Impeller README | 엔진 구조 원칙 |
| CSP 매뉴얼(Brush tip·Stroke·Correction·Spraying·Screentones) / Procreate Brush Studio / Krita 문서 / Photoshop 호환표 / Rebelle 블로그 | 파라미터 패리티·수치 목표(파라미터 의미만) |

## 4. 라이선스 경고

1. **금지**: Mixbox·Rebelle Pigments(CC BY-NC), LYGIA(Prosperity), GPL/AGPL 저장소(Krita, GIMP, MyPaint 앱, Drawpile, harmony, Milton, Darkly, Ciallo).
   코드·LUT·상수·곡선 데이터 일체 복제 금지. 경계 테스트와 PR 리뷰 체크리스트에 `mixbox`·`lygia` 문자열 검색을 둔다.
2. **SA 전염**: Ciallo brush-rendering-tutorial(CC BY-SA 4.0)은 읽은 뒤 독자 구현. Krita 문서(GFDL) 문구 복제 금지, 원리만 재서술.
3. **특허(법무 검토 후 진행)**: NVIDIA US9928033B2(look-back scan) → 기본 경로 제외; Adobe US8917283B2/US8917282B2(절차적 벡터 수채) → 미채택;
   Adobe US8605095B2/US8760438(가상 붓모→벡터) → 붓모는 2D 절차 팁으로 한정; WetBrush 특허 가능성 미확인; Curtis 관련 US6198489는 만료.
4. **독점 문서**: CSP/Procreate/Photoshop/Rebelle 매뉴얼은 파라미터 의미만. 용어·UI·아이콘·기본 프리셋·재질 에셋(.abr/.brush/.sut/톤) 복제 금지.
5. **unknown**: ScreenVAE(상업 시 서면 통지 의무) → 법무 확인 전 미도입.
6. **미확인 코드(수식만)**: cudaraster, Elasticurve-src, Unity stochastic texturing 데모, simple-spectral, Burns MATLAB, SmartSmudge 코드, Shadertoy phasor,
   toji.dev·webgpufundamentals 예제.
7. **고지 의무**: Apache-2.0(font-rs, Vello, kurbo, ink-stroke-modeler) NOTICE 유지, BSD-3(tiny-skia, rgb2spec, webgpu-samples, OpenToonz) 저작권 고지,
   Zlib(Blend2D) 수정 사실 표기, MIT 전반 LICENSE 동봉. OpenToonz·Pinta 내 thirdparty/Paint.NET 유래 파일은 별도 라이선스.
8. **확인 미완**: Vello LICENSE 파일 직접 조회(프록시 차단, README로 확인), casiez/OneEuroFilter 루트 LICENSE 부재, 공개 블루노이즈 텍스처(CC0) 대체 시 재확인.
9. **에셋 원칙**: mypaint-brushes `.myb` 설정만 사용하고 `_prev.png` 미사용. 블루노이즈·그레인·팁은 빌드 스크립트로 자체 생성.
10. **libmypaint(ISC) vs mypaint 앱(GPL-2)** 혼동 금지. harmony는 조사 메모에 MIT로 오기된 전례가 있으므로 모든 도입 전 LICENSE 파일 재확인.

## 5. 수치 목표(자체 정의, CSP 대비)

CSP의 브러시 크기 상한(2,000 px)과 PRO/EX 캔버스 상한은 비공식(tips 기사) 출처라 비교 기준은 **자체 정의 목표**다. 브라우저 실측 전까지 "달성"으로 보고하지 않는다.

| 지표 | 목표 | 근거 |
| --- | --- | --- |
| 브러시 지름 | 2,000 px에서 p95 ≤ 16.7 ms | CSP 700 px "무거움" 안내의 약 3배 |
| 캔버스 | 최장변 ≥ 16,384 px, 134 MP 메모리 예산(MVP 랩 캔버스는 2048² 상한) | Procreate 상한, CSP DEBUT 10,000 px; 8192 텍스처 한도는 타일 아틀라스로 우회 |
| dab 처리량 | ≤ 2M dab/프레임(96 MB < 128 MiB 바인딩), 통합 GPU에서 ≥ 1M dab/s(반경 32 px) | MDN/W3C 한도 |
| 지연 | 파이프라인 ≤ 1프레임(60 Hz 16.7 ms, 120 Hz 8.3 ms), 체감 ≤ 20 ms(예측 포함) | Ng 2012, Cattan 2015 |
| GPU 단계 비율 | fine ≤ 1/3, 비닝+coarse ≤ 1/2 | piet-gpu 측정 |
| 패리티 | 커버리지 |Δ| ≤ 1/255(Precision 1~5 = ×1,2,4,8,16), 단계별 버퍼 비트 동일, δ48 퍼지 불일치 ≤ 0.5%, ΔE2000 p99 < 1.0 | Krita Precision 등급 차용, 저장소 `createFuzzyNeighborhoodGate` |
| 결정성 | 동일 입력 재생 해시 동일(CPU `DabInstance[]`·참조 래스터 기준). GPU 비트 동일은 같은 장치·드라이버 안에서만 | 설계 원칙 |
| KM 혼색 | GPU vs CPU 38밴드 ΔE2000 median ≤ 1.0, p95 ≤ 2.5 | 자체 기준 |
| 불투명도 상한 | 10회 dab Wash α ≤ opacity(±1/255), Build-up 1−(1−flow)^10, 누적 오차 ≤ 0.01 | Krita 문서 정의 |
| 필기감 | 압력 단조성 위반 0·선형성 R² ≥ 0.98, 히스테리시스 닙 ≤ 3%·탄성 ≤ 2%·먹붓 8~15%(의도), 저속 지터 RMS ≤ 0.25 px, 모서리 편차 ≤ 1.0 px | 팁 물리 설계 보충 |
| 안정화 | 0~100 연속 + 속도 모드 2종, 지터 감소율·지연 ms 지표 | CSP Correction |
| 그레인 | 비반복, 모아레 피크 억제, mip 분산 오차 ≤ 5%, smudge 블러 증가 ≤ 20% | Heitz, Chu 2010 |
| 스크린톤 | LPI 20~85, 형상 ≥ 8종, 각도 스윕 모아레 fixture, 줌 400% 이음새 0 | CSP 톤(LPI 범위는 매뉴얼 미명시) |
| 습식 | 활성 타일 ≤ 10%에서 60 fps, 반복·dt·시드 고정, 재현 100%. 에지 다크닝 비 수채 1.3~1.8·수묵 1.1~1.4, 그래뉼레이션 대비 0.15~0.35 | Van Laerhoven, Curtis, 습식 설계 보충 |
| 카탈로그 | ≥ 24종(스펙 30종), 외부 에셋 0, JSON ≤ 1 MiB, 승격 게이트 6항목 | 기존 workbench 제약([brush-lab workbench](../brush-lab-workbench.md)) |
| 기능 폴백 | `shader-f16`/`float32-filterable`/`subgroups`/`timestamp-query` 각각 off에서 골든 통과, compat 4096 자동 축소(기록) | W3C 기능 목록 |
| 콜드 시작 | 파이프라인 컴파일 포함 < 1 s | 자체 기준 |

인증 리포트의 전역 임계값(`bench/report/thresholds.ts`): `opacityAccumulationError ≤ 0.01`, `fuzzyMismatchPct ≤ 0.5`, `deltaEP99 < 1.0`, 결정성 해시 동일,
`latencyP95 ≤ 16.7`. 매체 가족 지표(연필·목탄 Spearman ≥ 0.95, 잉크 에지 전이 ≤ 1.2 px, 수채 에지 다크닝 ≥ 1.15, 유화 릴리프 상관 ≥ 0.9,
에어브러시 가우시안 R² ≥ 0.97, 해칭 모아레 ≤ 0.35, smudge 질량 보존 ≤ 0.02 등)는 스펙의 `FAMILY_TARGETS`가 원천이다.

미확인 수치("미확인" 유지): CSP 브러시 크기 상한·안정화 슬라이더 범위·LPI 범위, Photoshop spacing/Smoothing 세부, Rebelle 캔버스 상한, Vello WideTile 상수.

## 6. 관련 저장소 문서

- [ADR-0008 라이선스 격리 정책](../adr/0008-license-isolation-policy.md), [ADR-0017 대안 엔진 레인](../adr/0017-vello-gap-alternative-engine-lanes.md),
  [ADR-0018 자동 폴백 금지](../adr/0018-no-automatic-engine-fallback-vello-primary.md), [ADR-0021 획 예산](../adr/0021-stroke-budget-myb-disposition-execution-profiles.md)
- [Vello 기준선 핀](vello-baseline.md), [KM 안료 검토](brush-spectral-km-20260920.md), [브러시 엔진 v7 재질 설계](../brush-engine-v7-material-design.md)
- [apps/brush-lab README](../../apps/brush-lab/README.md)
