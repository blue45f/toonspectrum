# TOONSPECTRUM ORIGINAL OST — Prism Awakening

Status: production worktree; audio generation and release checks are recorded separately. This document does not claim a live deployment.

## Creative direction

웅장한 일본 애니메이션풍의 심포닉 록·시네마틱 오케스트라를 중심으로 구성한 신규 6곡이다. 한국어 창작 가사를 기본으로 오프닝 → 각성 → 결전 → 귀환의 감정선을 연결한다. 특정 가수, 애니메이션 작품, 상업 음원, 실존 인물의 목소리는 생성 레퍼런스로 입력하지 않았다.

| Track | Form / production intention | Duration | Tempo | Role |
| --- | --- | --- | --- | --- |
| SPECTRUM BREAKER — 빛의 경계선 | 여성 리드 / 심포닉 애니메이션 오프닝 | 3:30 | 164 BPM | opening |
| 이름 없는 날개 — Wings of the Unwritten | 남성 테너 / 각성 록 테마 | 3:15 | 152 BPM | creator |
| 천 개의 빛, 하나의 약속 | 남녀 교차·화음 / 결전 보컬 테마 | 3:30 | 144 BPM | action |
| 별이 돌아오는 자리 | 여성 리드 / 피아노·첼로·현악 엔딩 | 3:30 | 78 BPM | ending |
| 별빛의 아틀라스 | 순수 연주 / 판타지 세계 탐험 | 3:00 | 96 BPM | story |
| DAWNFALL — 새벽을 되찾는 전투 | 순수 연주 / 하이브리드 오케스트라 전투 | 3:00 | 156 BPM | action |

신규 6곡의 목표 총 길이는 **19:45**다. 각 보컬 곡의 전체 창작 가사와 구간별 편곡 의도는 같은 디렉터리의 개별 Markdown 파일과 `config/site-original-ost.production.json`에 기록했다.

공통 모티프의 제작 의도는 `1–3(또는 ♭3)–5–4`다. 지정한 조성, 템포, 화음, 듀엣 분리, 구간 배치 및 모티프 재현은 생성 지시이며, 출력 음원의 실제 청취·채보 검증으로 보증한 사실은 아니다.

## Audio delivery and review

신규 사이트용 파일의 규격은 48 kHz stereo / MP3 320 kbps다. 생성한 무손실 FLAC은 저장소 밖의 로컬 음원 보관 디렉터리에 유지한다. 사이트에는 오디오를 자동 재생시키거나 작업 중인 사용자의 음성·오디오 편집 기능을 방해하는 새 동작을 추가하지 않는다.

최종 음량은 무손실 원본에서 2-pass loudness normalization으로 다시 맞춘다. 측정값, 파일 해시, 모델 리비전, 모델 아티팩트 해시, 생성 시드는 각 MP3 옆의 JSON에 기록한다. 목표값은 -14 LUFS / -1.5 dBTP이며 실제 MP3 측정값으로 통과 여부를 확인한다.

청취 검수는 아직 사람이 수행하지 않았다. `approvedForSite`는 소유자의 추가 요청, 생성 이력과 자동 신호 검사를 기록하는 배포 준비 플래그이며, 가창 발음·가사 일치·듀엣 분리·작곡 완성도 또는 법적 권리 검토가 완료되었다는 뜻이 아니다.

## Verified production results — 2026-09-21

Six complete new recordings were generated locally and remastered from their preserved lossless sources. New MP3 measurements are -14.0 to -13.9 LUFS, true peak -3.1 to -1.5 dBFS, 48 kHz stereo and approximately 320 kbps. Full measurements and SHA-256 values are in `audio-qc.json` and the individual media sidecars. Five masters used linear normalization; Atlas used the normalizer's dynamic mode.

The repository playlist now contains the six existing masters and all six new masters: twelve tracks, 41:00 total. The three legacy compositions without media remain plans and were not represented as generated recordings.

Validation: the original-OST media/provenance verifier passed for twelve masters; all 47 tests in the player, manifest and media-asset test files passed; the Python generator compiled; `git diff --check` passed. This is not a claim that the entire repository test suite was run.

Worktree: `feat/original-ost-prism-awakening-20260921`. No live production deployment was performed. The music-generation API started for this task was stopped after all six recordings finished.

Dependency safety: an initial attempt to reuse the original checkout dependencies failed the full pre-push typecheck because workspace package resolution and installed packages did not match the isolated worktree. The push was blocked, not bypassed. Only the temporary worktree symlink was removed; the original checkout dependencies were left untouched. `pnpm install --frozen-lockfile --offline` then installed 1,344 cached packages successfully into the isolated worktree. The lockfile and dependency declarations were not changed. Subsequent hooks run normally without the temporary warning setting; lint, secret, architecture and type checks remain enabled.
