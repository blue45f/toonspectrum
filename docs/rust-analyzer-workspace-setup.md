# rust-analyzer 워크스페이스 설정 (Cargo.toml 없는 레포 루트)

측정일 2026-08-30 · rustc/cargo 1.94.1 · rust-analyzer 1.94.1

## 증상

rust-analyzer 프로세스는 살아 있는데 아무 기능도 동작하지 않는다. RSS 가 초기값에서
고정되고, CPU 는 0% 이며, hover·goto·completion 이 전부 빈 응답을 돌려준다. 서버가
죽은 게 아니라 **빈 워크스페이스로 올라온** 상태라 크래시도 에러 로그도 남지 않는다.

## 원인 (오진 정정)

이전에 "rustup 툴체인 부재"로 판정한 것은 틀렸다. 툴체인은 정상이다:

```console
$ cargo --version
cargo 1.94.1 (29ea6fb6a 2026-03-24)
$ rustc --version
rustc 1.94.1 (e408947bf 2026-03-25)
```

실제 원인은 **레포 루트에 `Cargo.toml` 이 없다**는 것이다. rust-analyzer 는 시작할 때
`ProjectManifest::discover_single` 로 루트에서 매니페스트를 찾는데, 이 레포는 루트가
pnpm 워크스페이스라 Cargo 매니페스트가 하위 세 곳에만 있다. 루트에서 실행하면 즉시
실패한다:

```console
$ rust-analyzer analysis-stats .
Error: no projects

Stack backtrace:
   0: <anyhow::Error>::msg::<&str>
   1: <project_model::ProjectManifest>::discover_single
   2: <rust_analyzer::cli::flags::AnalysisStats>::run
```

같은 바이너리를 크레이트 디렉터리에서 돌리면 전부 정상 해석된다:

```console
$ cd crates/studio-engine-vello && rust-analyzer analysis-stats .
  Workspace:
    lines of code: 41_606, item trees: 198
  Dependencies:
    lines of code: 2_897_940, item trees: 5_880
    declarations: traits: 1_706, impl: 42_783, mods: 6_975
Item Collection:     18.37s, 1012mb
Inference:           5.56s, 281mb
Total:               36.76s, 2052mb
```

즉 인덱싱 능력의 문제가 아니라 **프로젝트 발견의 문제**다.

### 툴체인 점검 시 같이 볼 것

`~/.cargo/bin/rust-analyzer` 가 존재해도 그건 rustup 프록시 심링크일 뿐이라 컴포넌트가
없으면 실행 시점에 터진다. 존재 여부가 아니라 컴포넌트 목록으로 확인한다:

```console
$ rustup component list --installed | grep rust-analyzer   # 없으면
$ rustup component add rust-analyzer
```

## 해결: `linkedProjects`

루트에 `[workspace]` Cargo.toml 을 만드는 우회는 **금지**한다. 루트 워크스페이스는 세
매니페스트를 하나의 의존성 해석 그래프로 합치는데, 그러면
`crates/vendor/wgpu-toon` 의 `[patch.crates-io]` 고정과
`crates/vendor/wgpu-toon/UPSTREAM.sha256` · `tests/vendor_patch_parity.rs` 가 지키는 봉인
해시, 그리고 `packages/studio-hokusai-wasm` 의 `=0.3.0` hokusai 핀이 함께 흔들린다.

대신 rust-analyzer 에 매니페스트를 명시적으로 넘긴다. `.vscode/settings.json` 에
커밋되어 있다:

```jsonc
"rust-analyzer.linkedProjects": [
  "crates/studio-engine-vello/Cargo.toml",
  "packages/studio-hokusai-wasm/Cargo.toml"
]
```

이러면 레포 루트에서 에디터를 열어도 두 크레이트가 정상 해석된다. 이 설정을 읽지 않는
LSP 클라이언트(대부분의 에이전트 플러그인 포함)를 쓴다면, 차선책은 여전히 유효하다 —
**Rust 작업은 `crates/studio-engine-vello` 에서 세션을 여는 것**.

## 매니페스트 지형

세 개 모두 독립된 단일 크레이트 워크스페이스다 (`cargo metadata` 실측):

| 매니페스트 | workspace_root | 비고 |
| --- | --- | --- |
| `crates/studio-engine-vello/Cargo.toml` | 자기 자신 | `[patch.crates-io] wgpu = { path = "../vendor/wgpu-toon" }` |
| `packages/studio-hokusai-wasm/Cargo.toml` | 자기 자신 | `hokusai-* =0.3.0`, `wasm-bindgen =0.2.123` 고정 |
| `crates/vendor/wgpu-toon/Cargo.toml` | 자기 자신 | 벤더된 wgpu 29.0.4 포크 |

`wgpu-toon` 은 `linkedProjects` 에 넣지 않는다. studio-engine-vello 의 patch 경로
의존성으로 이미 색인되어 goto/hover 가 그 안까지 들어가고, 별도 워크스페이스로 또
링크하면 wgpu 전체를 두 번 로드해 RSS 가 ~1GB 더 늘고 심볼이 중복된다. 벤더 패치 hunk
여섯 개를 직접 편집하며 진단이 필요할 때만 한시적으로 추가한다.

## 확인 방법

```console
# 실패해야 정상 (루트에는 매니페스트가 없다)
rust-analyzer analysis-stats .

# 성공해야 정상
cd crates/studio-engine-vello && rust-analyzer analysis-stats .
cd packages/studio-hokusai-wasm && rust-analyzer analysis-stats .
```

`Total:` 줄까지 도달하면 정상이다. 콜드 캐시 기준 vello 는 약 37초 / 2.0GB 를 쓴다.
컨테이너에서 보이는 `Failed to create perf counter: Operation not permitted` 은
`perf_event_open` 이 막혀 있다는 뜻일 뿐, 분석 결과와는 무관하다.
