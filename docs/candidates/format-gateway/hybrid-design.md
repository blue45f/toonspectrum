# ToonStudio V12 — FormatGateway 외부 브러시 하이브리드 설계

- 기준일: 2026-08-09
- 대상: SUT/SUTG/Krita bundle/KPP/MYB
- 결합 원칙: 직접 parser + sandboxed provider + stable IR + opaque preservation + 선택형 원본 앱 verifier

## 1. 설계 결론

하나의 parser가 모든 포맷 의미를 안다고 가정하지 않는다. 공개 구조는 직접 읽고, 범용 container는 검증된 ZIP/SQLite provider에 맡기며, 비공개 의미는 원본 앱 검증 bridge가 증거를 제공하기 전까지 보존 상태로 둔다.

```text
ByteSource
  → format sniff / hard source limit / abort
  → immutable original payload hash + opaque source envelope
  → container island
      ├─ Krita: bounded ZIP32 → safe XML → manifest MD5 → resource inventory
      └─ CSP: SQLite header → sandboxed reader port → bounded typed snapshot
  → semantic island
      ├─ KPP parser / MYB parser
      └─ verified SUT field adapter
  → BrushProgramIR + rights + warnings + unsupported
  → Hokusai/libmypaint fidelity preview
  → optional Krita/CSP target-app verifier
```

문서 원본은 엔진 객체나 SQLite row가 아니라 `BrushProgramIR`과 source payload다. parser 결과는 “가져온 의미”, “그대로 보존한 항목”, “거부한 항목”을 구분한다.

## 2. Container island

### 2.1 Krita bundle

`readFormatZipArchive`가 container 소유자다. 중앙 디렉터리와 local header를 교차 확인하고, 각 resource를 요청 시점에만 inflate한다. parser는 아래 하드 경계보다 큰 값을 호출자가 올릴 수 없게 한다.

| 제한 | 값 |
| --- | ---: |
| archive | 128,000,000B |
| entries | 2,048 |
| entry compressed/uncompressed | 각 32,000,000B |
| total uncompressed | 192,000,000B |
| central directory | 4,000,000B |
| compression ratio | 100× |
| path/comment | 1,024B / 8,192B |
| manifest/meta | 2,000,000B / 512,000B |

암호화, ZIP64, data descriptor, symlink/path traversal 성격의 경로, 중복 정규 경로, CRC 불일치는 실패한다. raw-DEFLATE는 runtime adapter를 주입받아 브라우저 `DecompressionStream` 또는 검증된 Worker codec으로 교체할 수 있다.

### 2.2 CSP tool container

`csp-sut.ts`는 SQLite 구현을 정적으로 import하지 않는다. 아래 port만 신뢰 경계로 둔다.

```ts
type CspSutSqliteReader = (
  bytes: Uint8Array,
  context: {
    kind: "sut" | "sutg";
    maxTables: number;
    maxColumnsPerTable: number;
    maxRows: number;
    maxBlobBytes: number;
    maxTextCharacters: number;
    signal?: AbortSignal;
  },
) => Promise<CspSqliteSnapshot>;
```

제품 runtime은 `@sqlite.org/sqlite-wasm` 3.53.0-build1 전용 module Worker로 구현했다. 원본의 격리 복사본을 공식 `sqlite3_deserialize`의 `FREEONCLOSE | READONLY` 플래그로 열고 `query_only`/`trusted_schema=OFF` 연결 방어를 더한다. extension/load/write/네트워크 표면은 노출하지 않으며, table/column allowlist가 아니라 한도 내 전체 snapshot inventory를 내보낸 뒤 semantic adapter가 검증 subset만 선택한다. `sqlite3_db_readonly()`는 deserialized in-memory DB에서 0을 반환하지만 실제 UPDATE는 `SQLITE_READONLY`로 거부되고 export는 원본과 byte-equal임을 테스트로 고정했다. Node 24 `node:sqlite`는 독립 reference/fixture 생성기일 뿐 제품 의존성이 아니다.

reader가 없거나 죽으면 fallback은 “임의 JSON/바이너리 검색”이 아니라 `preserve-only`다. 폐쇄 포맷에서 추측 parser는 데이터 손실보다 위험하다.

제품 `/studio`는 MYB/KPP/SUT/SUTG/Krita bundle의 모든 drawable candidate를 `openProductBrushLibraryRepository().repository.putMany()` 한 경계로만 커밋한다. preserve-only 결과는 성공 상태를 만들지 않고 원본 불변·미지원 이유를 오류 표면에 표시한다. `LEGACY_DATA_MIGRATION=FALSE`이므로 기존 ToonStudio localStorage envelope는 기본 boot에서 읽지 않으며, 별도 `legacyDataPolicy: "import-explicit"` dev/test 호출만 이전 데이터 import를 허용한다.

## 3. Semantic island와 IR lowering

### 3.1 Krita

1. manifest 1.2와 meta version 1을 검증한다.
2. resource별 MD5와 ZIP CRC를 모두 통과해야 의미 parser에 전달한다.
3. `paintoppresets/*.kpp`는 KPP parser, `.myb`는 MYB v3 parser에 위임한다.
4. bundle 경로+resource bytes로 deterministic ID를 다시 발급한다. 서로 다른 bundle 경로의 같은 preset을 충돌 없이 구분한다.
5. 기존 parser의 `unmapped`/warning을 bundle path가 있는 구조화 issue로 승격한다.
6. 그 외 resource는 status=`preserved`; bundle 전체 bytes가 source payload에 남는다.

KPP parser가 현재 의미로 내리는 범위는 paintbrush의 spacing, round/auto brush diameter/hardness, opacity/flow sensor curve, 기본 blend/eraser 경고와 mypaintbrush의 위임 가능한 MYB payload다. bitmap mask, 미지원 sensor, Krita 고유 engine parameter는 추정하지 않는다.

### 3.2 CSP

SUT adapter는 column 이름을 NFKC/소문자/구분자 제거로 정규화한 뒤, 작은 검증 alias 집합에만 대응한다. direct-draw임이 확인되거나 실제 brush 필드가 존재하는 row만 후보가 된다. output process가 다른 row는 변환하지 않는다.

```text
name                       → BrushProgramIR.name
brush size                 → constant size mapping (0..1000px normalization reference)
PressureGraph v1           → pressure size curve
normalized opacity         → constant flow mapping
OpacityPressureGraph v1    → pressure flow curve
hardness / spacing         → round tip
normalized stabilization   → EMA stabilizer strength
author/license/url/email   → rights aggregate
```

브러시 크기가 1,000px를 넘으면 normalization warning을 남기며 10,000px 밖은 거부한다. hardness/opacity/stabilization은 `[0,1]`, spacing은 `[1,1000]`에서만 의미를 부여한다. 다른 scale을 자동 추정하지 않는다.

## 4. 손실·권리·원본 보존 계약

모든 성공 결과는 다음 세 층을 동시에 가진다.

```text
sourcePayload      원본 전체 bytes의 base64
stable IR/results  검증된 의미만
warnings/unsupported
                   근사·버전·미매핑·관계 미확인의 구조화 원장
```

- `warnings`: import는 유효하지만 사용자가 알아야 하는 fallback/근사/부재.
- `unsupported`: 존재는 확인했지만 의미 보존을 증명하지 못했거나 안전상 거부한 표면.
- hard error: container 무결성·보안 경계를 통과하지 못해 신뢰 가능한 inventory도 만들 수 없는 경우.

권리 정보는 bundle/SUT 결과에 독립 필드로 보존한다. 표시·Marketplace 등록·재배포는 `license`가 비어 있지 않다는 이유만으로 허용하지 않으며 별도 Rights BOM 정책이 판정한다.

## 5. 실행·렌더 하이브리드

```text
Imported BrushProgramIR
  → compileRasterBrush
      ├─ Hokusai-compatible mapping → actual stroke preview
      ├─ libmypaint-compatible MYB  → reference/parity lane
      └─ unmapped graph             → visible fidelity report
  → actual pressure sweep + rendered thumbnail
```

Krita/SUT parser가 렌더 엔진을 소유하지 않는다. `providerPreference`는 후보 힌트이며, 실제 renderer selection은 Brush Platform의 품질 게이트가 결정한다. import 성공과 렌더 fidelity 성공을 같은 상태로 합치지 않는다.

## 6. Worker와 취소

- ZIP inflate, XML, SQLite snapshot, MD5, base64 보존은 Worker에서 수행한다.
- `AbortSignal`은 archive read와 SQLite reader에 전달한다.
- 단일 file의 container owner는 하나다. 같은 bundle을 여러 engine이 동시에 inflate하지 않는다.
- 원본 base64는 장기적으로 CAS blob reference로 교체할 수 있으나, stable result에는 content hash와 원본 보존 상태가 남아야 한다.
- 압축 해제 후 resource를 renderer로 넘길 때 소형 KPP/MYB bytes만 복사한다. 전체 archive를 engine마다 복제하지 않는다.

## 7. 폴백과 승격

```text
Krita direct import 실패
  → source payload + failure report 보존
  → optional Krita ToonBridge validation/import
  → bridge도 없으면 inventory/preserve-only

SUT semantic adapter 실패 또는 reader 부재
  → SQLite header inspection + source payload
  → optional CSP official-app export helper
  → 검증된 새 field evidence가 쌓이면 adapter alias/version lane 승격
```

승격 PR에는 실제 앱/버전, source rights, raw parser result, reference stroke sheet, pressure/tilt sweep, deterministic result, unsupported 감소량이 필요하다. 한 asset에서 우연히 맞은 column 이름만으로 global alias를 추가하지 않는다.

## 8. 불변식

1. CSP 전체 parity를 주장하지 않는다.
2. 알 수 없는 resource/column/version을 버리지 않는다.
3. MD5·CRC·bounds를 통과하지 못한 bytes를 semantic parser에 넣지 않는다.
4. 외부 앱 engine 객체나 SQLite row를 프로젝트 원본으로 저장하지 않는다.
5. 결정적 ID는 파일 내용과 경로/row identity로 계산하며 시간·locale·random을 쓰지 않는다.
6. Krita GPL core와 연구용 GPL/AGPL parser 코드를 제품에 복사하거나 link하지 않는다.
7. authored fixture 외의 제3자 brush asset을 테스트 번들에 커밋하지 않는다.
