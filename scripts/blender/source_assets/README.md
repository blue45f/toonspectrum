# Blender source assets

## Avatar Orion VRM0 audit source

`Avatar_Orion_vrm0_source.vrm` is the immutable pre-repair binary that was
previously served at `/vrm/Avatar_Orion.vrm`.

- SHA-256: `efa262d131a6bd919c1a776f0707c2d358bfb3bf0b82e6886b43d873969574f5`
- Bytes: `6,148,340`
- Embedded author: `Polygonal Mind`
- Embedded contact: `www.PolygonalMind.com`
- Embedded VRM0 license name: `CC0`

The source does **not** embed an external distribution page or direct license
URL. Its embedded VRM0 metadata is therefore the only direct CC0 evidence kept
by this repository; no external source URL is inferred.

[`../repair_avatar_orion_vrm1.py`](../repair_avatar_orion_vrm1.py) imports this
exact binary, preserves its authored mesh, packed textures, original skin and
16 morph targets, then exports the repaired public file through the official
Blender VRM Add-on. The public URL and catalog ID remain unchanged.

Reproduce from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b \
  --python-expr 'import bpy; bpy.context.scene["toonspectrum_orion_source_path"]="/absolute/repo/scripts/blender/source_assets/Avatar_Orion_vrm0_source.vrm"; bpy.context.scene["toonspectrum_orion_output_path"]="/absolute/repo/public/vrm/Avatar_Orion.vrm"' \
  --python scripts/blender/repair_avatar_orion_vrm1.py
```

The repair script validates the model before export and intentionally leaves
VRM1 `otherLicenseUrl` empty: the source proves `licenseName=CC0`, but does not
provide a URL that can be preserved as direct provenance.
