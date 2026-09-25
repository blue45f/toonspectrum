# Blender 원본 자산

## Avatar Orion VRM0 감사 원본

`Avatar_Orion_vrm0_source.vrm`은 과거 `/vrm/Avatar_Orion.vrm`에서 제공하던 파일의 복구 전 immutable
binary다.

- SHA-256: `efa262d131a6bd919c1a776f0707c2d358bfb3bf0b82e6886b43d873969574f5`
- byte: `6,148,340`
- embedded author: `Polygonal Mind`
- embedded contact: `www.PolygonalMind.com`
- embedded VRM0 license name: `CC0`

원본에는 외부 배포 페이지나 직접 license URL이 없다. 따라서 embedded VRM0 metadata가 저장소가 보존하는
유일한 직접 CC0 근거이며 외부 source URL을 추정하지 않는다.

`../repair_avatar_orion_vrm1.py`는 정확히 이 binary를 import해 authored mesh, packed texture, 원 skin과
morph target 16개를 보존하고 공식 Blender VRM Add-on으로 public file을 export한다. public URL과 catalog
ID는 바뀌지 않는다.

저장소 루트에서 재현:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b \
  --python-expr 'import bpy; bpy.context.scene["toonspectrum_orion_source_path"]="/absolute/repo/scripts/blender/source_assets/Avatar_Orion_vrm0_source.vrm"; bpy.context.scene["toonspectrum_orion_output_path"]="/absolute/repo/apps/web/public/vrm/Avatar_Orion.vrm"' \
  --python scripts/blender/repair_avatar_orion_vrm1.py
```

script는 export 전에 model을 검증한다. VRM1 `otherLicenseUrl`은 의도적으로 비운다. 원본이
`licenseName=CC0`은 증명하지만 보존 가능한 직접 URL은 제공하지 않기 때문이다.
