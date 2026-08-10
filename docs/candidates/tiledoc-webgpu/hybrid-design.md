# Tiled document WebGPU 하이브리드 설계

## 제품 감사 결과와 컷오버

기존 저장소·planner·bridge·WebGPU consumer는 각각 구현되어 있었지만, 제품 `/studio` 경로에는
`StudioTiledDocumentStore`의 비테스트 인스턴스가 없었다. 또한 consumer가 자체 adapter/device를
만들어 `StudioGpuFabric`과 분리돼 있었다. 따라서 이전 상태는 “구현 모듈 존재”였을 뿐 제품
vertical slice는 no-op이었다.

이번 컷오버는 기존 CRDT raster island의 경계만 교체했다.

```text
StudioRasterCrdtSurface (/studio product path)
  └─ StudioTiledDocWebGpuSurface           one bounded document island
       ├─ StudioTileDocProductIslandStore  immutable CRDT tile → premultiplied tiledoc tile
       ├─ StudioTiledDocumentStore         stable sparse tile authority
       ├─ StudioTileDocCompositePlanner    dirty/visible stack planning
       ├─ StudioTileDocWebGpuBridge         snapshot validation + serialized frame
       ├─ WebGPU retained compositor        source LRU + RGBA16F composite residency
       └─ StudioGpuFabric lease             shared GPUDevice + epoch ownership

Vello surface                              selection/vector overlay island only
Canvas2D                                   explicit handoff fallback only
```

`StudioRasterCrdtSurface`가 기존 두 단계 presentation authority를 계속 소유한다. 새 wrapper는 WebGPU
frame이 ready이기 전에는 숨겨지고, fallback을 mount할 때 WebGPU canvas를 먼저 비가시화한다.
`data-studio-primary-surface-owner`는 `none`, `tiledoc-webgpu`, `canvas2d-fallback` 중 하나뿐이다.

## GPU upload와 retained residency

1. bridge는 visible viewport에 포함된 store buffer를 `(bufferId, contentRevision)` snapshot으로
   검증해 넘긴다.
2. source texture LRU는 같은 content revision의 512² `rgba8unorm-srgb` upload를 재사용한다.
   같은 buffer가 edit되면 이전 revision texture를 즉시 축출한다.
3. composite tile은 두 장의 `rgba16float` ping-pong texture를 갖는다. stack content signature가
   같으면 dirty 요청이 와도 recomposite하지 않는다.
4. presentation pass는 retained final texture를 현재 `GPUCanvasContext`에 그린 뒤
   `queue.onSubmittedWorkDone()`까지 기다려 timing을 닫는다.
5. resize는 context backing size를 바꾸고 마지막 frame을 재요청한다. viewport scope가 바뀌면
   planner가 visible tile만 반환하므로 offscreen presentation은 일어나지 않는다.

실측 최종 source cache는 두 case 모두 100MiB였고, retained final set은 현재 visible viewport에
맞춰 4MiB였다. 8K와 webtoon에서 source cache hit는 각각 40,099회, composite cache reuse는
203회와 171회였다.

## readback 경계

`present()`와 내부 `executePlan()`에는 `copyTextureToBuffer`, `mapAsync`, `getImageData`,
`readPixels`가 없다. stats의 `hotPathReadbackCount`는 구조적으로 0이다.

품질 실험실만 `readbackRetainedTileForValidation(tileId)`를 호출할 수 있다. 이 API는 consumer가
idle이고 완료 frame이 있을 때만 동작한다. 브라우저 하니스는 pan/zoom·edit·reorder·resize·loss
복구 timing을 모두 끝낸 후 동일 tile을 두 번 읽었다. 각 case의 validation count는 2,
bytes는 4,194,304이고 digest는 일치했다.

## device loss와 폴백

```text
healthy shared epoch
  ├─ transient loss → runtime invalidates retained/source cache
  │                  → StudioGpuFabric acquires next epoch
  │                  → last frame request replay → WebGPU owner restored
  └─ unavailable/repeated failure/unsupported flip
                     → wrapper hides WebGPU owner
                     → Canvas2D fallback mounts with gpu=null
```

명시적 fabric destruction으로 두 case에서 epoch `1→2`, `3→4`를 실제 발생시켰고 각각
`deviceLossCount=1`, recovered status `ready`, active shared leases 2를 확인했다. consumer dispose는
공유 device를 destroy하지 않고 lease만 반환한다. isolated test override만 자체 device를 파기한다.

## Vello와 소유권 충돌 방지

Vello GPU는 document raster owner가 아니다. selection·vector overlay island에만 남으며, 새 product
surface는 Vello 모듈을 import하지 않는다. 둘 사이에 CPU pixel roundtrip도 없다. 추후 wgpu 30의
외부 device/texture adoption이 가능해져도 island 역할을 먼저 유지하고, 소유권 변경은 별도 ADR과
동일 exact workload 승격 게이트를 요구한다.
