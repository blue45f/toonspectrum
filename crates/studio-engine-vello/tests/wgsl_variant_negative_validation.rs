//! Negative and deterministic mutation evidence for the V12 WGSL variant lane.
//!
//! The positive matrix proves that generated variants are accepted. This suite proves the
//! inverse safety property: malformed WGSL is rejected by either the WGSL frontend or Naga's
//! full WebGPU-baseline validator. The authored corpus is finite and committed; the mutation
//! matrix uses a fixed xorshift seed, eight committed positive controls, and seven guaranteed
//! invalid transformations (56 bounded cases).

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

const CORPUS_VERSION: u32 = 1;
const MUTATION_SEED: u32 = 0x5eed_c0de;
const FUZZ_CONTROL_COUNT: usize = 8;

fn negative_corpus_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/corpus/wgsl-variants-negative")
}

fn positive_corpus_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/corpus/wgsl-variants")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NegativeCorpusManifest {
    version: u32,
    mutation_seed: u32,
    cases: Vec<NegativeCase>,
}

#[derive(Debug, Deserialize)]
struct NegativeCase {
    file: String,
    category: String,
    description: String,
}

#[derive(Debug)]
enum Rejection {
    Parse(String),
    Validation(String),
}

impl Rejection {
    fn stage(&self) -> &'static str {
        match self {
            Self::Parse(_) => "parse",
            Self::Validation(_) => "validation",
        }
    }

    fn detail(&self) -> &str {
        match self {
            Self::Parse(detail) | Self::Validation(detail) => detail,
        }
    }
}

fn validate_source(source: &str) -> Result<(), Rejection> {
    let module = naga::front::wgsl::parse_str(source)
        .map_err(|error| Rejection::Parse(error.emit_to_string(source)))?;
    let mut validator = naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::default(),
    );
    validator
        .validate(&module)
        .map(|_| ())
        .map_err(|error| Rejection::Validation(format!("{error:?}")))
}

fn read_negative_manifest() -> NegativeCorpusManifest {
    let path = negative_corpus_dir().join("manifest.json");
    let text = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("cannot read {}: {error}", path.display()));
    serde_json::from_str(&text)
        .unwrap_or_else(|error| panic!("negative corpus manifest is invalid JSON: {error}"))
}

fn wgsl_file_names(dir: &Path) -> BTreeSet<String> {
    fs::read_dir(dir)
        .unwrap_or_else(|error| panic!("cannot list {}: {error}", dir.display()))
        .filter_map(|entry| {
            let name = entry.expect("corpus directory entry").file_name();
            let name = name.to_string_lossy().into_owned();
            name.ends_with(".wgsl").then_some(name)
        })
        .collect()
}

/// Every authored malformed shader must be rejected, and the manifest must be an exact inventory
/// of the corpus. A frontend/validator boundary change is acceptable; accidental acceptance is not.
#[test]
fn authored_negative_corpus_is_complete_and_rejected() {
    let dir = negative_corpus_dir();
    let manifest = read_negative_manifest();
    assert_eq!(
        manifest.version, CORPUS_VERSION,
        "negative corpus version drift"
    );
    assert_eq!(
        manifest.mutation_seed, MUTATION_SEED,
        "manifest and mutation test must use the same fixed seed"
    );
    assert!(
        manifest.cases.len() >= 16,
        "negative corpus must retain broad malformed-input coverage"
    );

    let listed: BTreeSet<String> = manifest
        .cases
        .iter()
        .map(|case| case.file.clone())
        .collect();
    assert_eq!(
        listed.len(),
        manifest.cases.len(),
        "negative corpus manifest must not contain duplicate files"
    );
    assert_eq!(
        listed,
        wgsl_file_names(&dir),
        "negative corpus manifest and on-disk WGSL set must match exactly"
    );

    let required_categories: BTreeSet<&str> = [
        "parse",
        "type",
        "address-space",
        "binding",
        "entrypoint",
        "workgroup",
        "resource",
        "numeric-edge",
    ]
    .into_iter()
    .collect();
    let actual_categories: BTreeSet<&str> = manifest
        .cases
        .iter()
        .map(|case| case.category.as_str())
        .collect();
    assert_eq!(
        actual_categories, required_categories,
        "negative corpus category coverage drift"
    );

    let mut rejected_by_stage: BTreeMap<&str, usize> = BTreeMap::new();
    let mut accepted = Vec::new();
    for case in &manifest.cases {
        assert!(
            !case.description.trim().is_empty(),
            "{} has no description",
            case.file
        );
        let path = dir.join(&case.file);
        let source = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("cannot read {}: {error}", path.display()));
        match validate_source(&source) {
            Ok(()) => accepted.push(format!("{} ({})", case.file, case.category)),
            Err(rejection) => {
                *rejected_by_stage.entry(rejection.stage()).or_default() += 1;
                println!(
                    "REJECT {} [{} via {}]\n{}",
                    case.file,
                    case.category,
                    rejection.stage(),
                    rejection.detail()
                );
            }
        }
    }

    assert!(
        accepted.is_empty(),
        "Naga accepted malformed authored variants:\n{}",
        accepted.join("\n")
    );
    println!(
        "negative WGSL corpus: {}/{} rejected ({rejected_by_stage:?})",
        manifest.cases.len(),
        manifest.cases.len()
    );
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
enum Mutation {
    UnknownAttribute,
    DuplicateBinding,
    MissingWorkgroupSize,
    ZeroWorkgroupDimension,
    ReadOnlyDestinationWrite,
    TexelTypeMismatch,
    U32LiteralOverflow,
}

const MUTATIONS: [Mutation; 7] = [
    Mutation::UnknownAttribute,
    Mutation::DuplicateBinding,
    Mutation::MissingWorkgroupSize,
    Mutation::ZeroWorkgroupDimension,
    Mutation::ReadOnlyDestinationWrite,
    Mutation::TexelTypeMismatch,
    Mutation::U32LiteralOverflow,
];

#[derive(Clone, Debug, Eq, PartialEq)]
struct MutationJob {
    file: String,
    mutation: Mutation,
}

#[derive(Clone, Copy)]
struct XorShift32(u32);

impl XorShift32 {
    fn new(seed: u32) -> Self {
        assert_ne!(seed, 0, "xorshift seed must be non-zero");
        Self(seed)
    }

    fn next(&mut self) -> u32 {
        let mut value = self.0;
        value ^= value << 13;
        value ^= value >> 17;
        value ^= value << 5;
        self.0 = value;
        value
    }
}

fn seeded_shuffle<T>(items: &mut [T], rng: &mut XorShift32) {
    for index in (1..items.len()).rev() {
        let swap_with = (rng.next() as usize) % (index + 1);
        items.swap(index, swap_with);
    }
}

fn mutation_schedule(seed: u32) -> Vec<MutationJob> {
    let mut files: Vec<String> = wgsl_file_names(&positive_corpus_dir())
        .into_iter()
        .collect();
    assert!(
        files.len() >= FUZZ_CONTROL_COUNT,
        "positive corpus must provide at least {FUZZ_CONTROL_COUNT} controls"
    );
    let mut rng = XorShift32::new(seed);
    seeded_shuffle(&mut files, &mut rng);
    files.truncate(FUZZ_CONTROL_COUNT);

    let mut mutations = MUTATIONS.to_vec();
    seeded_shuffle(&mut mutations, &mut rng);
    files
        .into_iter()
        .flat_map(|file| {
            mutations.iter().copied().map(move |mutation| MutationJob {
                file: file.clone(),
                mutation,
            })
        })
        .collect()
}

fn replace_required(source: &str, marker: &str, replacement: &str, mutation: Mutation) -> String {
    assert!(
        source.contains(marker),
        "positive control lacks marker for {mutation:?}: {marker}"
    );
    source.replacen(marker, replacement, 1)
}

fn apply_mutation(source: &str, mutation: Mutation) -> String {
    match mutation {
        Mutation::UnknownAttribute => format!("@studio_invalid_attribute(0)\n{source}"),
        Mutation::DuplicateBinding => replace_required(
            source,
            "@group(0) @binding(1)",
            "@group(0) @binding(0)",
            mutation,
        ),
        Mutation::MissingWorkgroupSize => {
            replace_required(source, "@compute @workgroup_size(64)", "@compute", mutation)
        }
        Mutation::ZeroWorkgroupDimension => replace_required(
            source,
            "@workgroup_size(64)",
            "@workgroup_size(0)",
            mutation,
        ),
        Mutation::ReadOnlyDestinationWrite => replace_required(
            source,
            "var<storage, read_write> dst",
            "var<storage, read> dst",
            mutation,
        ),
        Mutation::TexelTypeMismatch => replace_required(
            source,
            "let texel = src[i];",
            "let texel : vec4<u32> = src[i];",
            mutation,
        ),
        Mutation::U32LiteralOverflow => replace_required(source, "16384u", "4294967296u", mutation),
    }
}

/// The fixed-seed schedule must be reproducible, every unmodified control must remain valid, and
/// every bounded mutation must be rejected. This is mutation fuzzing, not an unbounded random run.
#[test]
fn seeded_mutations_reject_and_positive_controls_still_pass() {
    let schedule = mutation_schedule(MUTATION_SEED);
    assert_eq!(
        schedule,
        mutation_schedule(MUTATION_SEED),
        "seed replay drift"
    );
    assert_eq!(
        schedule.len(),
        FUZZ_CONTROL_COUNT * MUTATIONS.len(),
        "bounded mutation matrix size drift"
    );

    let unique_jobs: BTreeSet<(String, Mutation)> = schedule
        .iter()
        .map(|job| (job.file.clone(), job.mutation))
        .collect();
    assert_eq!(
        unique_jobs.len(),
        schedule.len(),
        "mutation schedule contains duplicates"
    );

    let selected_files: BTreeSet<&str> = schedule.iter().map(|job| job.file.as_str()).collect();
    assert_eq!(selected_files.len(), FUZZ_CONTROL_COUNT);
    let mut controls = BTreeMap::new();
    for file in selected_files {
        let path = positive_corpus_dir().join(file);
        let source = fs::read_to_string(&path).unwrap_or_else(|error| {
            panic!("cannot read positive control {}: {error}", path.display())
        });
        if let Err(rejection) = validate_source(&source) {
            panic!(
                "positive control {file} was rejected via {}: {}",
                rejection.stage(),
                rejection.detail()
            );
        }
        controls.insert(file.to_owned(), source);
    }

    let mut accepted = Vec::new();
    let mut rejected_by_stage: BTreeMap<&str, usize> = BTreeMap::new();
    for job in &schedule {
        let control = controls.get(&job.file).expect("selected positive control");
        let mutated = apply_mutation(control, job.mutation);
        assert_ne!(
            mutated, *control,
            "mutation {:?} made no change",
            job.mutation
        );
        match validate_source(&mutated) {
            Ok(()) => accepted.push(format!("{}::{:?}", job.file, job.mutation)),
            Err(rejection) => {
                *rejected_by_stage.entry(rejection.stage()).or_default() += 1;
            }
        }
    }

    assert!(
        accepted.is_empty(),
        "Naga accepted deterministic malformed mutations:\n{}",
        accepted.join("\n")
    );
    println!(
        "seeded WGSL mutation matrix: {}/{} rejected; seed={MUTATION_SEED:#010x}; controls={FUZZ_CONTROL_COUNT}; stages={rejected_by_stage:?}",
        schedule.len(),
        schedule.len()
    );
}
