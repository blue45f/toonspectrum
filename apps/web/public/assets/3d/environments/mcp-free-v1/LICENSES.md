# MCP Free 3D Environment Pack v1 — provenance and usage

Generated on 2026-09-25 for ToonSpectrum through the official Tripo MCP/API workflow and processed with Blender 5.2 plus glTF-Transform 4.4.2.

## Provider and billing boundary

- Provider: Tripo
- Provider model: `v3.0-20250812`
- Generation settings: detailed geometry, detailed PBR textures, 40,000-face ceiling
- Funding source: promotional **free API wallet** activated without a payment method
- Cost: 50 promotional credits per asset, 600 promotional credits total
- Paid upgrade, card registration, prepaid purchase, and automatic recharge: **not used**
- Meshy CLI was connected and authenticated separately, but free-plan API/CLI task creation returned `NoMorePendingTasks`; no Meshy model was generated and no Meshy credits were consumed.

## Output rights

These files are **not CC0**. They are distributed as provider-generated user output under the Tripo Terms of Service in force when generated:

- Terms: https://www.tripo3d.ai/terms
- Commercial and non-commercial use by the user is permitted under those terms.
- Use is non-exclusive.
- Tripo retains the rights and interests described in its terms.
- No third-party trademark, logo, readable sign, or branded design was intentionally requested.
- Downstream users must review the current provider terms and perform their own rights assessment before redistribution or commercial release.

The checked-in `manifest.json` records the exact prompt, provider task ID, model version, prompt hash, model hash, free-credit cost, processing path, runtime metrics, and visual-review receipt for each asset. API credentials and expiring provider download URLs are not included.

## Local processing

Raw provider GLBs were normalized to metric scale, centered, grounded, texture-bounded to 1024 px, rendered from three review angles, and exported as self-contained GLBs. Final delivery files use Meshopt geometry compression and embedded WebP PBR textures. No network resource is required at runtime.

Relevant tooling:

- Official Tripo MCP: https://github.com/VAST-AI-Research/tripo-mcp
- Official Tripo Blender add-on: https://github.com/VAST-AI-Research/tripo-3d-for-blender
- Reproducible processor: `scripts/blender/process_tripo_mcp_environment_pack_v1.py`
- Reproducible manifest builder: `scripts/build_tripo_mcp_environment_manifest_v1.py`
