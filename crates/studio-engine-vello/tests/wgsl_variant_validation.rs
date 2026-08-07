//! V12 lane 5 (`WESL_SHADER_PLATFORM`) 재개 게이트 2단계 — Naga(네이티브)
//! validation 매트릭스.
//!
//! `packages/studio-engine-registry/src/__tests__/wgsl-variants-corpus.test.ts`
//! 가 방출·드리프트 게이트하는 커밋 코퍼스(`tests/corpus/wgsl-variants/`)의
//! 모든 `.wgsl` variant 를 `naga::front::wgsl` 로 파싱하고
//! `naga::valid::Validator`(ValidationFlags::all + 기본 Capabilities = WebGPU
//! 베이스라인)로 검증한다 — 파일별 결과를 집계해 실패 0 을 게이트한다.
//! 매니페스트(manifest.json) ↔ 디렉터리 파일 집합 일치(누락/고아)도 함께
//! 검증해, 네이티브 매트릭스가 브라우저 컴파일 게이트와 항상 같은 대상을
//! 보게 한다.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

fn corpus_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/corpus/wgsl-variants")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CorpusManifest {
    variant_count: usize,
    variants: Vec<ManifestVariant>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestVariant {
    variant_key: String,
    file: String,
}

fn read_manifest(dir: &Path) -> CorpusManifest {
    let path = dir.join("manifest.json");
    let text = fs::read_to_string(&path).unwrap_or_else(|error| {
        panic!(
            "cannot read {} ({error}) — regenerate the corpus with \
             REGEN_WGSL_VARIANT_CORPUS=1 (wgsl-variants-corpus.test.ts)",
            path.display()
        )
    });
    serde_json::from_str(&text)
        .unwrap_or_else(|error| panic!("manifest.json is not valid corpus JSON: {error}"))
}

fn wgsl_files(dir: &Path) -> BTreeSet<String> {
    fs::read_dir(dir)
        .unwrap_or_else(|error| {
            panic!(
                "cannot list corpus dir {} ({error}) — regenerate with \
                 REGEN_WGSL_VARIANT_CORPUS=1 (wgsl-variants-corpus.test.ts)",
                dir.display()
            )
        })
        .filter_map(|entry| {
            let name = entry.expect("corpus dir entry").file_name();
            let name = name.to_string_lossy().into_owned();
            name.ends_with(".wgsl").then_some(name)
        })
        .collect()
}

/// 매니페스트와 디스크 파일 집합이 정확히 일치해야 한다(누락/고아 0).
#[test]
fn corpus_manifest_matches_wgsl_file_set() {
    let dir = corpus_dir();
    let manifest = read_manifest(&dir);
    assert_eq!(
        manifest.variant_count,
        manifest.variants.len(),
        "manifest variantCount must equal its variant list length"
    );
    for variant in &manifest.variants {
        assert_eq!(
            variant.file,
            format!("{}.wgsl", variant.variant_key),
            "manifest file name must be derived from variantKey"
        );
    }

    let listed: BTreeSet<String> =
        manifest.variants.iter().map(|variant| variant.file.clone()).collect();
    assert_eq!(
        listed.len(),
        manifest.variants.len(),
        "manifest must not list duplicate variant files"
    );

    let on_disk = wgsl_files(&dir);
    let missing: Vec<&String> = listed.difference(&on_disk).collect();
    let orphans: Vec<&String> = on_disk.difference(&listed).collect();
    assert!(
        missing.is_empty() && orphans.is_empty(),
        "corpus drift — missing on disk: {missing:?}, orphans not in manifest: {orphans:?} \
         (regenerate with REGEN_WGSL_VARIANT_CORPUS=1)"
    );
}

/// Naga validation 매트릭스 — 코퍼스의 모든 variant 가 파싱+검증을 통과해야
/// 한다(실패 0 게이트). 파일별 결과를 로그로 남긴다.
#[test]
fn every_wgsl_variant_passes_naga_validation() {
    let dir = corpus_dir();
    let manifest = read_manifest(&dir);
    let files = wgsl_files(&dir);
    assert!(!files.is_empty(), "corpus must not be empty");
    assert_eq!(
        files.len(),
        manifest.variant_count,
        "validation matrix must cover exactly the manifest's variant set"
    );

    let mut failures: Vec<String> = Vec::new();
    let mut passed = 0usize;
    for name in &files {
        let path = dir.join(name);
        let source = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("cannot read {}: {error}", path.display()));
        let module = match naga::front::wgsl::parse_str(&source) {
            Ok(module) => module,
            Err(error) => {
                let rendered = error.emit_to_string(&source);
                println!("PARSE FAIL {name}\n{rendered}");
                failures.push(format!("{name}: parse error: {rendered}"));
                continue;
            }
        };
        let mut validator = naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::default(),
        );
        match validator.validate(&module) {
            Ok(_info) => {
                passed += 1;
                println!("OK {name}");
            }
            Err(error) => {
                println!("VALIDATION FAIL {name}\n{error:?}");
                failures.push(format!("{name}: validation error: {error:?}"));
            }
        }
    }

    println!(
        "naga validation matrix: {passed}/{} valid (naga {})",
        files.len(),
        naga_version()
    );
    assert!(
        failures.is_empty(),
        "naga validation matrix failures ({}/{}):\n{}",
        failures.len(),
        files.len(),
        failures.join("\n")
    );
}

/// Cargo.lock 이 핀한 naga 버전 — 매트릭스 로그·ADR 실측 표기의 근거.
fn naga_version() -> &'static str {
    // build-time 상수는 노출되지 않으므로 Cargo.lock 에서 읽는다(테스트 전용).
    // 실패 시에도 매트릭스 자체는 유효하므로 표기만 "unknown" 으로 남긴다.
    static VERSION: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    VERSION
        .get_or_init(|| {
            let lock = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.lock");
            let Ok(text) = fs::read_to_string(lock) else {
                return "unknown".to_owned();
            };
            let mut lines = text.lines();
            while let Some(line) = lines.next() {
                if line.trim() == "name = \"naga\"" {
                    if let Some(version_line) = lines.next() {
                        if let Some(version) = version_line
                            .trim()
                            .strip_prefix("version = \"")
                            .and_then(|rest| rest.strip_suffix('"'))
                        {
                            return version.to_owned();
                        }
                    }
                }
            }
            "unknown".to_owned()
        })
        .as_str()
}
