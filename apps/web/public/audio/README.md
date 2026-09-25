# ToonSpectrum 오리지널 OST 자산

- 상태: **검토된 오리지널 음원 release**
- 최종 갱신: **2026-09-26**

이 디렉터리는 ToonSpectrum 자체 제작 soundtrack만 보관한다.

- `playlist.json`에는 provenance가 확인되고 승인된 원곡만 등록한다.
- 최종 master는 `original/`에 48 kHz stereo, 192 kbps MP3와 provenance JSON sidecar로 둔다.
- 과거 license reference demo는 2026-09-18 제거했다.
- global player는 reference나 browser 합성 placeholder music으로 fallback하지 않는다.
- 제작 brief와 한국어 원문 가사는 `config/site-original-ost.production.json`이 소유한다.

초기 공개 master 9개는 Apple Silicon에서 **ACE-Step 1.5 / `acestep-v15-turbo`**로 로컬 생성했다.
source audio나 기존 곡 reference를 사용하지 않았다. sidecar에는 deterministic seed, generator Git revision,
model weight hash, source FLAC hash, 최종 MP3 hash, mastering target과 loudness/true-peak QC를 기록한다.

재현 경로는 `scripts/generate-site-original-ost-acestep.py`다. `--approve-generated`를 명시하지 않은 생성
sidecar는 승인 상태가 아니다. Eleven Music v2.5 경로는
`scripts/generate-site-original-ost.mjs`에 유지하며 C2PA 요청 provenance는 ACE-Step 로컬 생성 기록과
구분한다. runtime은 해당 integrity gate를 통과한 경우에만 각 경로를 허용한다.

release 정책과 provenance는 `docs/AUDIO-ASSETS.md`를 따른다.
