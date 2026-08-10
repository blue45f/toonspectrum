//! toon-vello fork track guard (V12 §5.1): the vendored wgpu tree is a product
//! asset, not a scratchpad.
//!
//! `crates/vendor/wgpu-toon` is crates.io wgpu 29.0.4 plus TOON-PATCH 0001.
//! Every file in it is pinned by `UPSTREAM.sha256`, so an undeclared edit —
//! the classic way a "temporary" fork silently grows a second life — fails
//! here instead of shipping. Legitimate patch work updates the manifest and
//! `PATCHES/0001-webgpu-handle-adoption.patch` in the same commit.
//!
//! Runs on both build tracks (it does not touch the `fabric` feature), which
//! is the point: track A must notice vendor drift too.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

fn vendor_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("crates/ dir")
        .join("vendor")
        .join("wgpu-toon")
}

fn sha256_hex(bytes: &[u8]) -> String {
    // Self-contained FIPS 180-4 SHA-256: this gate must not depend on a crypto
    // crate landing in the wasm artifact's dependency graph.
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    let mut message = bytes.to_vec();
    let bit_len = (bytes.len() as u64) * 8;
    message.push(0x80);
    while message.len() % 64 != 56 {
        message.push(0);
    }
    message.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in message.chunks_exact(64) {
        let mut w = [0u32; 64];
        for (index, word) in w.iter_mut().take(16).enumerate() {
            let base = index * 4;
            *word = u32::from_be_bytes([
                chunk[base],
                chunk[base + 1],
                chunk[base + 2],
                chunk[base + 3],
            ]);
        }
        for index in 16..64 {
            let s0 = w[index - 15].rotate_right(7)
                ^ w[index - 15].rotate_right(18)
                ^ (w[index - 15] >> 3);
            let s1 = w[index - 2].rotate_right(17)
                ^ w[index - 2].rotate_right(19)
                ^ (w[index - 2] >> 10);
            w[index] = w[index - 16]
                .wrapping_add(s0)
                .wrapping_add(w[index - 7])
                .wrapping_add(s1);
        }
        let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) =
            (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]);
        for index in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[index])
                .wrapping_add(w[index]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
        for (slot, value) in h.iter_mut().zip([a, b, c, d, e, f, g, hh]) {
            *slot = slot.wrapping_add(value);
        }
    }
    h.iter().map(|word| format!("{word:08x}")).collect()
}

fn manifest() -> BTreeMap<String, String> {
    let text = fs::read_to_string(vendor_root().join("UPSTREAM.sha256"))
        .expect("crates/vendor/wgpu-toon/UPSTREAM.sha256 is missing");
    let mut pins = BTreeMap::new();
    for line in text.lines() {
        let line = line.trim_end();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let (hash, path) = line
            .split_once("  ")
            .unwrap_or_else(|| panic!("unparseable manifest line: {line}"));
        pins.insert(path.to_string(), hash.to_string());
    }
    pins
}

fn walk(dir: &Path, root: &Path, out: &mut Vec<String>) {
    for entry in fs::read_dir(dir).expect("readable vendor dir") {
        let path = entry.expect("readable dir entry").path();
        let relative = path
            .strip_prefix(root)
            .expect("path under vendor root")
            .to_string_lossy()
            .replace('\\', "/");
        // PATCHES/ and the manifest itself are fork bookkeeping, not vendored
        // source, so they are deliberately outside the pinned set.
        if relative == "PATCHES" || relative == "UPSTREAM.sha256" {
            continue;
        }
        if path.is_dir() {
            walk(&path, root, out);
        } else {
            out.push(relative);
        }
    }
}

#[test]
fn vendored_wgpu_matches_its_pinned_manifest() {
    let root = vendor_root();
    let pins = manifest();
    let mut present = Vec::new();
    walk(&root, &root, &mut present);
    present.sort();

    let mut drift = Vec::new();
    for relative in &present {
        let actual = sha256_hex(&fs::read(root.join(relative)).expect("readable vendored file"));
        match pins.get(relative) {
            None => drift.push(format!("{relative}: present but unpinned")),
            Some(expected) if expected != &actual => {
                drift.push(format!("{relative}: {expected} -> {actual}"));
            }
            Some(_) => {}
        }
    }
    for pinned in pins.keys() {
        if !present.contains(pinned) {
            drift.push(format!("{pinned}: pinned but missing"));
        }
    }

    assert!(
        drift.is_empty(),
        "crates/vendor/wgpu-toon drifted from UPSTREAM.sha256 — every deviation from crates.io \
         wgpu 29.0.4 must be a declared TOON-PATCH hunk. Update the patch file and the manifest \
         together, or revert:\n  {}",
        drift.join("\n  ")
    );
}

#[test]
fn patch_file_documents_every_touched_file() {
    let patch = fs::read_to_string(
        vendor_root()
            .join("PATCHES")
            .join("0001-webgpu-handle-adoption.patch"),
    )
    .expect("TOON-PATCH 0001 is missing");
    // The patch is the human-readable half of the pin: it must cover exactly
    // the files Cargo.toml's comment (and UPSTREAM.sha256's header) claim.
    for touched in [
        "a/Cargo.toml",
        "a/src/lib.rs",
        "a/src/backend/webgpu.rs",
        "a/src/api/device.rs",
        "a/src/api/queue.rs",
        "a/src/api/texture.rs",
    ] {
        assert!(
            patch.contains(touched),
            "TOON-PATCH 0001 does not mention {touched}"
        );
    }
    assert!(
        patch.contains("76e8840e1ba2881d4cbb18d2147627a56af426ff064c0401eb0c8410c6325d07"),
        "TOON-PATCH 0001 must record the upstream .crate sha256 it applies to"
    );
}
