# ToonStudio Character Pipeline Blender 확장

`toonstudio_blender_kit`은 ToonStudio character authoring의 production DCC 경계다. versioned JSON recipe와
신뢰한 VRM/GLB/Blend source를 deterministic package로 변환한다.

- authored toon-hair mesh
- semantic facial shape key
- quality report
- contact-sheet render
- portable GLB/VRM/Blend output

## 제품 경계

일반 Python executor가 아니다. MCP surface는 다음 allowlist command만 받는다.

- `inspect_character`
- `build_authored_hair`
- `create_semantic_face_shapes`
- `render_quality_views`
- `validate_character`
- `export_character_package`
- `run_pipeline`

shell 실행, asset download, package install, preference reset, source text eval을 하지 않는다. file access는
`blender_manifest.toml`에 선언하고 network permission을 요청하지 않는다.

## 설치

Blender 5.2 LTS를 설치한 저장소 루트에서:

```sh
pnpm exec tsx scripts/setup-toonstudio-blender-pipeline.mts -- --install-addons
```

local extension을 검증·build해 Blender `user_default` extension repository에 설치한다. Blender 4.5.0용
pinned VRM Add-on archive를 내려받아 SHA-256을 검증하고 필요한 operator를 probe한다.

## headless 실행

```sh
BLENDER_PATH=/Applications/Blender.app/Contents/MacOS/Blender \
  pnpm exec tsx scripts/setup-toonstudio-blender-pipeline.mts -- --check

$BLENDER_PATH --background \
  --python scripts/blender/toonstudio_character_pipeline.py -- \
  --config config/blender/reference-character.json
```

감사된 Orion source:

```sh
$BLENDER_PATH --background \
  --python scripts/blender/toonstudio_character_pipeline.py -- \
  --config config/blender/avatar-orion-production.json
```

## MCP 사용

MCP host는 model이 생성한 임의 Python을 실행하지 않고 installed extension의 allowlisted dispatcher를
호출한다.

```python
from toonstudio_blender_kit.mcp import dispatch

receipt = dispatch(
    "run_pipeline",
    {
        "projectRoot": "/absolute/path/to/toonspectrum",
        "configPath": "/absolute/path/to/toonspectrum/config/blender/avatar-orion-production.json",
    },
)
print(receipt)
```

write destination은 supplied project root 안으로 제한한다. trusted isolated session에서 사람이
`scene["toonstudio_allow_external_output"] = True`를 명시한 경우만 외부 출력을 허용한다.

## package 계약

```text
batch_generated/blender-character/<character-id>/
  character-package.json
  quality-report.json
  <character-id>.blend
  <character-id>.glb
  <character-id>.vrm          # 요청했고 공식 add-on 검증을 통과한 경우
  previews/
    index.html
    <expression>--<view>.png
```

`character-package.json`에는 파일 size·SHA-256, config digest, quality metric, semantic face control,
hair LOD triangle, source provenance와 generator version을 기록한다. ToonStudio TypeScript parser는
traversal, 실패 quality report, 누락 runtime artifact, malformed hash를 import 전에 거부한다.

## 제작 규칙

### 얼굴

- 기존 blink, phoneme/viseme, emotion, look-at key를 rename/reuse하지 않는다.
- 새 semantic key는 `faceEyeSizeBig`/`faceEyeSizeSmall`처럼 설명적 pair를 사용한다.
- explicit metadata를 우선하며 confidence가 recipe보다 낮으면 fail-closed다.
- face dimension은 head bone weighted skin 또는 명시한 face mesh에서 구한다.
- body vertex는 바꾸지 않고 displacement를 face dimension 비율로 제한한다.

### 머리카락

- LOD0은 closed scalp shell과 flattened/tapered/closed six-sided clump로 구성한다.
- sphere/capsule 조합이 아니라 style-specific guide curve에서 생성한다.
- `COLOR_0`, UV, shade/highlight zone, back-face outline shell, LOD 3개를 deterministic하게 만든다.
- original hair는 분리 가능한 hair-only mesh이며 recipe가 replacement를 명시한 경우에만 숨긴다.

### 품질 gate

triangle/material budget, non-manifold/degenerate geometry, skin influence 과다, oversized texture,
negative transform, 불완전 humanoid rig, semantic face control 누락, authored hair 누락, 낮은 score 중 하나라도
있으면 strict release를 실패시킨다.
