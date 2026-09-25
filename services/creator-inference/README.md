# Creator Inference Worker

Wan2.1 image-to-video, TripoSR single-view reconstruction, Blender-rendered SDXL ControlNet
image-to-image를 실행하는 별도 model adapter 서비스다. 성공 형태의 placeholder inference는 없다.
model이 설정되지 않으면 503, inference가 실패하면 실패 상태를 유지한다.

## 운영 상태

CPU API·validation test는 weight 없이 **test-only runner**를 주입해 실행한다. 생성 품질을 측정하지
않으며 CUDA GPU 운영 검증이나 production 배포 완료를 의미하지 않는다. Creator에게 노출하기 전에
`gpu-smoke.py`를 실행하고 실제 output, GPU memory, latency, disk, license, content moderation budget을
검토한다.

유료 third-party API를 호출하지 않는다. model 파일을 소유해도 GPU hosting 비용은 사라지지 않는다.
hardware provision, license 수락, 대용량 weight download를 자동화하지 않는다.

## 설치

대상: Linux, Python 3.11/3.12, data directory당 worker process 1개.

1. virtual environment를 만들고 공식 PyTorch selector로 CUDA에 맞는 PyTorch/torchvision을 설치한다.
   system `ffmpeg`와 security patch가 적용된 Blender를 설치하되 Blender를 직접 외부에 노출하지 않는다.
2. `python -m pip install -r requirements-models.txt`를 실행한다. 실제 GPU 검증 뒤 승인된 runtime image에
   resolution을 고정한다.
3. `VAST-AI-Research/TripoSR`과 `tatsy/torchmcubes`를 검토된 immutable commit으로 설치한다. upstream의
   오래된 전체 requirements를 이 환경에 덮어쓰지 않는다.
4. 각 model card·license를 검토하고 정확한 40자리 repository revision을 명시해 weight를 받는다.

```sh
python install-models.py wan --directory /models --revision "$WAN_REVISION" --accept-model-license
python install-models.py triposr --directory /models --revision "$TRIPOSR_REVISION" --accept-model-license
python install-models.py dino --directory /models --revision "$DINO_REVISION" --accept-model-license
python install-models.py sdxl --directory /models --revision "$SDXL_REVISION" --accept-model-license
python install-models.py controlnet --directory /models --revision "$CONTROLNET_REVISION" --accept-model-license
```

`main` 같은 이동 branch를 revision으로 사용하지 않는다. downloader는 파일별 SHA-256 manifest를 만들고
실행 code와 일반 pickle을 제외한다. 명시적으로 허용한 TripoSR `model.ckpt`는 `weights_only=True`로
읽는다. manifest와 notice는 read-only model volume과 함께 보존한다.

opaque background 제거가 필요하면 `rembg[cpu]`와 검토한 `u2net.onnx`를 `/models/rembg`에 별도 설치한다.
이 애플리케이션은 자동으로 받지 않는다.

```sh
export CREATOR_INFERENCE_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
export CREATOR_MODEL_ROOT=/models
export CREATOR_TRIPOSR_CODE=/opt/TripoSR
export CREATOR_DATA_DIR=/var/lib/toonstudio-inference
export CREATOR_INFERENCE_ENABLED=1
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
uvicorn app:application --factory --host 127.0.0.1 --port 8090 --workers 1
```

Nest API에는 같은 secret과 `CREATOR_INFERENCE_URL`을 설정한다. URL은 실제 API 배포에서 접근 가능한
loopback/private container URL 또는 보호된 HTTPS origin이어야 한다. browser는 기존 signed HttpOnly
session + CSRF를 사용하고 shared secret은 API만 본다.

multiworker uvicorn을 사용하지 않는다. OS advisory lock이 같은 data directory의 두 번째 runtime을
거부한다. SQLite는 durable local storage에 두고 NFS를 사용하지 않는다. unprivileged user로 실행하고
model/code는 read-only, data volume은 worker 전용, ingress는 인증 gateway만 허용한다. child process
network egress와 credential 전달을 차단하고 restricted `worker.log`를 보호·회전한다.

## API·저장 계약

- upload: 1 MiB 인증 JSON/base64 chunk, 전체 SHA-256과 format 검증
- input URL 금지, GLB external HTTP/file reference 금지
- owner ID는 browser header가 아니라 검증된 server session에서 설정
- job은 SQLite에 저장하고 stable idempotency key로 중복 제출 방지
- GPU job은 한 번에 하나
- restart 시 running job은 성공으로 위장하지 않고 interrupted 처리
- cancel 시 subprocess group 종료
- terminal result와 사용하지 않는 upload는 사용자 명시 삭제 지원

기본 한도:

- 사용자당 active job 2개
- 전체 queued+running 12개
- 사용자당 하루 submission 12개
- 사용자당 upload allocation 256 MiB
- free disk reserve 2 GiB
- job timeout 1시간

`CREATOR_DAILY_JOB_LIMIT`, `CREATOR_JOB_TIMEOUT_SECONDS`는 실제 측정 뒤 조정한다. 자동 retention 삭제는
기본 제공하지 않는다. production 전에 정책을 게시하고 owner 요청 또는 운영자 검토 절차로 삭제한다.

결과는 success 전에 format, size, SHA-256을 검증한다. download도 1 MiB chunk를 사용한다. 모든 job
endpoint는 `no-store`이며 private content를 service worker cache에 넣지 않는다.

## 기능 의미와 제한

- Wan: 새 frame을 생성하고 최대 8개 shot을 MP4, SRT caption, provenance storyboard로 묶는다.
  synthetic speech·music이나 shot 간 character consistency를 보장하지 않는다.
- TripoSR: 단일 image에서 colored GLB mesh를 추론한다. 보이지 않는 면은 추정이며 rig, watertight topology,
  scan-equivalent 결과를 보장하지 않는다.
- 3D -> 2D: Blender yaw render에서 Canny structure를 추출하고 SDXL img2img를 실행한다. structure
  conditioning이며 얼굴·손·character identity를 수학적으로 보장하지 않는다.

## dependency 보안 기준

- `diffusers==0.38.0`: GHSA-98h9-4798-4q5v, GHSA-7wx4-6vff-v64p 대응
- `safetensors>=0.8,<1`
- CPU test profile `pytest==9.0.3`: GHSA-6w46-j5rx-g56g 대응

```sh
python -m pytest services/creator-inference/test_runtime.py -q
```

dependency resolution과 CPU test는 CUDA/PyTorch 조합이나 실제 생성 품질을 인증하지 않는다. 이 보안
갱신만 확인하기 위해 weight를 받거나 engine을 켜지 않는다.

## 라이선스와 원 구현

model notice와 사용 제한을 feature 공개 전에 검토·보존한다.

- Wan weight: model card의 Apache-2.0
- TripoSR code/weight: 게시자 기준 MIT
- SDXL·ControlNet: CreativeML Open RAIL++-M, 사용 제한 포함
- Blender와 transitive runtime: 각자 license 유지

model weight나 third-party source를 저장소에 vendor하지 않는다. 원 구현 링크는 model acquisition
검토 시 공식 문서와 model card에서 확인한다.
