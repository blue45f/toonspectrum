# Creator inference worker

Actual model adapters for Wan2.1 image-to-video, TripoSR single-view reconstruction,
and Blender-rendered SDXL ControlNet image-to-image. There is **no success-shaped
placeholder inference**. An unconfigured model returns 503; failed inference remains failed.

## Operational status

The CPU API/validation tests run without model weights, with an explicitly injected
**test-only runner**. They do not measure generated visual quality. This integration
has not been qualified on a CUDA GPU or deployed to production. Before exposing it
to creators, run `gpu-smoke.py`, inspect its actual outputs and establish GPU memory,
latency, disk, license and content-moderation budgets for your installation.

No third-party paid API is called. Owning model files is not free GPU hosting. Do not
provision hardware, accept a model license or download large weights automatically.

## Setup (Linux, Python 3.11/3.12, one worker process per data directory)

1. Create a virtual environment. Install a matching CUDA PyTorch/torchvision pair
   using the official PyTorch installation selector. Install system `ffmpeg` and
   a current security-patched Blender binary. Do not expose Blender directly.
2. `python -m pip install -r requirements-models.txt`. Resolve and freeze this profile
   in your approved runtime image after real GPU tests; it is not a GPU-tested lock.
3. Review and clone `VAST-AI-Research/TripoSR` to an immutable approved commit under
   `/opt/TripoSR`. Compile `tatsy/torchmcubes` at an approved commit against the same
   CUDA/PyTorch version. Do not run upstream's entire old requirements file over this
   environment; it pins older Transformers/Pillow. The adapter overrides only DINO
   config loading, keeping all network access out of inference.
4. For each selected model, inspect its model card/license and copy the **40-character
   repository revision** into the explicit acquisition command below. This command
   downloads model weights and requires an operator's network/storage budget.

```sh
python install-models.py wan --directory /models --revision "$WAN_REVISION" --accept-model-license
python install-models.py triposr --directory /models --revision "$TRIPOSR_REVISION" --accept-model-license
python install-models.py dino --directory /models --revision "$DINO_REVISION" --accept-model-license
python install-models.py sdxl --directory /models --revision "$SDXL_REVISION" --accept-model-license
python install-models.py controlnet --directory /models --revision "$CONTROLNET_REVISION" --accept-model-license
```

The variables above must contain reviewed revisions, not `main`. The downloader
records per-file SHA-256 manifests and excludes executable code and generic pickle
formats. TripoSR's explicitly allowed `model.ckpt` is loaded with `weights_only=True`.
Retain manifests and notices with the read-only model volume. Transparent PNG is
sufficient for TripoSR. For opaque source removal, separately install `rembg[cpu]`
and review/place `u2net.onnx` in `/models/rembg`; it is never auto-acquired by this app.

```sh
# Supply a secret using your secret manager; never commit it or send it to a browser.
export CREATOR_INFERENCE_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
export CREATOR_MODEL_ROOT=/models
export CREATOR_TRIPOSR_CODE=/opt/TripoSR
export CREATOR_DATA_DIR=/var/lib/toonstudio-inference
export CREATOR_INFERENCE_ENABLED=1
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
uvicorn app:application --factory --host 127.0.0.1 --port 8090 --workers 1
```

Configure the existing Nest API with the same secret and `CREATOR_INFERENCE_URL`:
loopback/private container URL, or a protected **HTTPS** origin reachable from the
actual API deployment. A Vercel function's localhost is not the GPU machine. An API
URL root has no credentials, path, query or fragment. The browser uses the existing
signed HttpOnly session + CSRF middleware; only the API sees this shared secret.

Do not enable multiworker uvicorn; an OS advisory lock refuses a second runtime on
one data directory. Keep the SQLite directory on durable local storage (not NFS).
Run unprivileged, mount model/code read-only, give the data volume only to this worker,
allow ingress only from your authenticated gateway, and deny model-subprocess network
egress in the container/firewall. The child environment explicitly excludes gateway
and database credentials. Protect restricted `worker.log` files and rotate them.

## API behavior

Uploads use 1 MiB authenticated JSON/base64 chunks, full SHA-256 and format validation.
Inputs never accept a URL; GLB rejects external HTTP/file references. Owner IDs are
set by validated server sessions, not browser headers. Inputs and outputs stay within
that owner. Jobs persist to SQLite, and a stable idempotency key prevents duplicate
submission after ambiguous network failure. One GPU job runs at a time. Restart marks
running jobs interrupted rather than claiming success or invisibly charging another run.

Cancellation terminates the subprocess group. The UI can delete terminal results and
explicitly remove unused uploaded inputs. Active/cancelling jobs protect their inputs.
Limits: 2 active jobs/user, 12 global queued+running, 12 submissions/user/day by default,
256 MiB/user upload allocation, 2 GiB free-disk reserve, one-hour job timeout. Set
`CREATOR_DAILY_JOB_LIMIT` and `CREATOR_JOB_TIMEOUT_SECONDS` for your measured deployment.
No automatic retention deletion is configured; publish a retention policy and run
owner-requested deletion or an operator-reviewed retention process before production.

Results are validated, sized and SHA-256 hashed before success. Browser downloads
also use 1 MiB chunks, respecting serverless response-size limits. All job endpoints
are `no-store`; no private content is put in a service-worker cache.

## Semantics and limitations

- Wan generates new frames (not just camera transforms), then combines up to 8 shots
  with an MP4, SRT captions and a provenance storyboard. There is no synthetic speech,
  music or guarantee of character consistency between shots.
- TripoSR infers a colored GLB mesh from a single image. Hidden surfaces are guesses.
  It does not produce a skeletal rig, guaranteed watertight production topology or
  a scan-equivalent reconstruction. `preview.png` is the normalized input reference.
- 3D→2D renders the uploaded GLB at the requested yaw using Blender, extracts Canny
  control structure and runs SDXL img2img. It preserves structure as conditioning,
  not as a mathematical guarantee of face, hand or character identity.

## Dependency security baseline

The model profile pins `diffusers==0.38.0` to address
[GHSA-98h9-4798-4q5v](https://github.com/advisories/GHSA-98h9-4798-4q5v) and
[GHSA-7wx4-6vff-v64p](https://github.com/advisories/GHSA-7wx4-6vff-v64p).
Use stable `safetensors>=0.8,<1` with this release. The existing Transformers 4.x
and Hugging Face Hub 0.x ranges remain in place; this security update does not
require a major-version migration or changes to the model acquisition command.
The CPU test profile pins `pytest==9.0.3` for
[GHSA-6w46-j5rx-g56g](https://github.com/advisories/GHSA-6w46-j5rx-g56g).

Run `python -m pytest services/creator-inference/test_runtime.py -q` from the
repository root after installing `requirements-test.txt`. This includes regression
checks on the dependency security floors. Dependency resolution and CPU tests do
not qualify a CUDA/PyTorch pair or prove real model inference quality; retain the
operator-run GPU acceptance process above. Do not download weights or enable an
engine just to verify this dependency update.

## Licenses / primary implementation references

Retain model notices and review usage restrictions before publishing the feature.
Wan weights: Apache-2.0 model card. TripoSR code/weights: MIT per publisher. SDXL and
ControlNet: CreativeML Open RAIL++-M, including usage restrictions, not an unrestricted
MIT/Apache equivalent. Blender and each transitive runtime dependency retain their own
licenses. No model weights or third-party source are vendored in this change.

- https://huggingface.co/docs/diffusers/v0.38.0/api/pipelines/wan
- https://huggingface.co/Wan-AI/Wan2.1-I2V-14B-480P-Diffusers
- https://github.com/VAST-AI-Research/TripoSR
- https://huggingface.co/stabilityai/TripoSR
- https://huggingface.co/facebook/dino-vitb16
- https://huggingface.co/docs/diffusers/api/pipelines/controlnet_sdxl
- https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md
- https://huggingface.co/diffusers/controlnet-canny-sdxl-1.0
