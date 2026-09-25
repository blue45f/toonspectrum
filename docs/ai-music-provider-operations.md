# AI 음악 공급자 운영 가이드

검증 기준일: 2026-09-25

## 목표

툰스펙트럼의 장면·작품 설정을 무료 또는 로컬 AI 음악 도구로 안전하게 넘기고,
생성 파일·라이선스·출처를 확인한 뒤 작품 BGM 또는 사이트 OST 후보로 연결한다.
외부 서비스 결과를 자동 게시하거나 브라우저 번들에 API 키를 넣지 않는다.

## 지원 매트릭스

| 공급자 | 무료 시작 | 검증된 연동 | 기본 게시 정책 |
| --- | --- | --- | --- |
| ACE-Step 1.5 | 로컬 생성량 제한 없음 | CLI, REST API | 사이트 원본 제작 |
| Adobe Firefly Generate Music | 무료 Adobe 계정의 일일 생성 | 웹 | 상업 이용 검수 |
| Soundverse | 가입 무료 토큰 | 웹, API, OAuth MCP | 라이선스 등급 검수 |
| ElevenLabs Music | 월 10,000 무료 크레딧 | 웹, API, CLI, OAuth MCP | 무료는 개인 시안 |
| Suno | 매일 50 무료 크레딧 | 웹 | 비상업 시안 |
| Stable Audio | 웹 월 50크레딧(비상업), 개발자 API 가입 25크레딧 | 웹, API | 생성 시점 라이선스 검수 |
| Mubert Render | 월 25곡·5회 MP3 | 웹, API | 비상업 시안 |
| Udio | 일 10·월 추가 100 크레딧 | 웹 | 다운로드 불가 시안 |
무료 플랜과 상업 이용권은 별개다. Suno·Mubert 무료 결과는 비상업용이며,
ElevenLabs 무료 Music은 개인 사용만 허용된다. Stable Audio 웹 Free 계정도 비상업
라이선스로 표시된다. Udio는 2026-02-17 기준 오디오·비디오·스템 다운로드가 중단돼
사이트 파일로 반출할 수 없다. 정책이 바뀔 수 있으므로 생성 시점의 화면과 약관을 결과별로 보관한다.

## 무과금 API 키 운영 결정

- **Soundverse**: 웹 가입 토큰은 무료지만 공식 API는 호출별 과금이다. 운영 키를 만들거나 등록하지 않는다.
- **ElevenLabs Music**: Free 플랜은 개인 사용 전용이므로 기존 음성 키를 음악 생성에 재사용하거나 `STUDIO_MUSIC_ENABLED`를 켜지 않는다.
- **Google Lyria**: Gemini Developer API 가격표상 무료 등급이 없다. 기존 Gemini TTS 키를 음악에 재사용하지 않는다.
- **Stable Audio**: 개발자 계정은 결제 이력 없이 가입 25크레딧과 API 키를 제공하지만 Stable Audio 2.5 한 번이 20크레딧이며 반복 무료 예산이 아니다. 웹 Free 출력도 비상업 라이선스이므로 키를 운영 서버에 등록하지 않고 자동 호출을 만들지 않는다. 무료 웹 생성물은 내부 시안으로만 보관하고 공개 OST에서 제외한다.
- **ACE-Step 1.5**: 서버 키·호출 과금·원격 데이터 전송이 없는 로컬 경로를 사이트 원본 OST의 기본 제작 권위로 유지한다.

비밀키를 저장소, 브라우저 번들, 인계 JSON, 로그에 넣지 않는다. 무료 크레딧 소진 뒤 자동 구매나 유료 fallback도 두지 않는다.

## 툰스튜디오 사용 흐름

1. `/music`에서 장면, 분위기, 길이, BPM, 악기, 보컬과 가사를 구성한다.
2. **프롬프트** 버튼으로 공급자 웹 작업 화면에 붙여 넣을 원문을 복사한다.
3. **검수 인계 JSON**을 내려받아 공급자, 프롬프트, 작품 범위, 권리 체크리스트를 고정한다.
4. 외부 공급자 또는 로컬 ACE-Step에서 파일을 생성한다.
5. 원본 파일, 프로젝트·song ID, 생성 시각, 플랜·license tier 화면을 보관한다.
6. SHA-256, 길이, 포맷, loudness와 청음 결과를 기록한다.
7. 작품 BGM은 지속 가능한 HTTPS MP3로 연결하고, 사이트 전역 OST는 별도 큐레이션 검수를 거친다.

외부 결과는 `autoPublish: false`, `reviewRequired: true`인 인계 manifest로 시작한다.
사이트 전역 플레이리스트에 곧바로 들어가는 공급자는 로컬 ACE-Step뿐이다.

## 프로젝트 CLI

```bash
pnpm music:providers
pnpm music:handoff -- \
  --provider soundverse \
  --brief ./music-brief.json \
  --out ./soundverse-handoff.json
```
`--brief` 파일은 `MusicBrief` 전체 필드와 `rightsConfirmed: true`를 포함해야 한다.
`--prompt-file`을 생략하면 툰스튜디오의 비모사·원본성 프롬프트를 동일하게 생성한다.
출력 경로가 이미 있으면 덮어쓰지 않고 실패하며, 어떤 공급자 API도 호출하지 않는다.

## MCP

### Soundverse

- Remote server: `https://mcp.soundverse.ai/mcp`
- 인증: OAuth
- Public client ID: `jt7cp9hv4m9idkuyv2gt0`
- Client secret: 비워 둔다.
- 기본 권한은 각 도구 실행 전 승인을 요구하도록 유지한다.

공식 안내: <https://www.soundverse.ai/mcp>

### ElevenLabs

- Hosted server: `https://api.elevenlabs.io/v1/mcp`
- 인증: OAuth
- 음악 생성뿐 아니라 효과음·음성 도구가 함께 노출될 수 있으므로 필요한 도구만 승인한다.
- 음성 복제와 사용자 음성 업로드는 별도 동의 없이 활성화하지 않는다.

공식 안내: <https://elevenlabs.io/mcp>

MCP 실행 결과도 웹 생성과 동일하게 라이선스 원장과 원본 파일을 보관한다.

## 공급자 CLI·API

### ElevenLabs CLI

```bash
npm install --global @elevenlabs/cli
elevenlabs auth login
```

브라우저 OAuth를 사용한다. 토큰을 저장소, `.env.example`, 이슈 또는 로그에 복사하지 않는다.
무료 계정은 개인 사용 시안으로만 취급하며 상업 이용은 생성 당시 플랜을 확인한다.

### ACE-Step 1.5

```bash
cd ~/.cache/toonspectrum-ace-step-1.5
uv run acestep-api --host 127.0.0.1 --port 8001
python cli.py
```

사이트 마스터 생성은 저장소 래퍼를 사용한다.

```bash
ACESTEP_RAW_DIR=~/.toonstudio-audio-archive/site-original-ost \
python3 scripts/generate-site-original-ost-acestep.py \
  --track midnight-storyboard --approve-generated --keep-source
```

장시간 디코딩 후 클라이언트만 종료된 작업은 새 크레딧·연산을 쓰지 않고 이어받는다.
```bash
python3 scripts/generate-site-original-ost-acestep.py \
  --track midnight-storyboard \
  --resume-task <task-id> \
  --approve-generated --keep-source
```

기본 작업 대기 한도는 2,400초이며 `ACESTEP_MAX_WAIT_SECONDS`로 조정할 수 있다.
공개 전에 Node publisher와 자산 검증기를 반드시 통과한다.

## 게시 전 필수 증빙

- 공급자와 모델 버전, 프로젝트·song·task ID
- 생성 일시와 적용 플랜 또는 API license tier
- 원본 및 배포 파일 SHA-256
- 원본 입력·가사·참조 오디오 사용 권리
- 상업·동기화·스트리밍·앱 사용 범위
- 출력 길이, 코덱, sample rate, loudness, true peak
- 운영자 청음 승인과 비모사 확인
- 공개 URL, 크레딧 문구, Content Credentials 또는 provenance sidecar

무료 토큰을 다 쓰기 위한 생성은 하지 않는다. 실제 콘텐츠 필요성과 라이선스가 확인된 작업만 실행한다.
무료 체험에서 자동 유료 전환이 있는 경우 결제 정보를 넣거나 체험을 시작하지 않는다.

## 공식 확인 링크

- Adobe Generate Music: <https://www.adobe.com/products/firefly/features/ai-music-generator.html>
- ElevenLabs Music: <https://elevenlabs.io/music>
- Soundverse MCP: <https://www.soundverse.ai/mcp>
- Suno free-plan rights: <https://help.suno.com/en/articles/9601601>
- Udio credit limits: <https://help.udio.com/en/articles/10739134-credits-and-credit-limits>
- Udio download status: <https://help.udio.com/en/articles/12683565-changes-associated-with-the-universal-music-group-umg-partnership>
- Mubert Render license: <https://mubert.com/render/license>
- Stable Audio release notes: <https://platform.stability.ai/docs/release-notes>
- ACE-Step CLI: <https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/CLI.md>
- ACE-Step API: <https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md>
