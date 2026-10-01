//! Sumi 브러시 엔진 C-ABI wasm 커널(확장 레인 `wasm-cpu`).
//!
//! TS 참조(`src/engine/raster/{coverage,tile-binning,fine-raster}.ts`, `texture/{sampling,paper-grain}.ts`,
//! `core/rng.ts`)와 **같은 연산 순서**로 쓴다. TS는 f64 중간값에 특정 지점만 `Math.fround`를 적용하므로
//! 여기서도 f64로 계산하고 같은 지점에서 `as f32`로 절단한다(정수 해시는 비트 동일, 초월함수는 libm 차이로 ulp 수준 오차 가능).
//!
//! 메모리 소유권: 호스트가 `sk_alloc`으로 dab 버퍼(64 B·n)·CSR·타일 출력(4 KiB)·질감을 할당하고 포인터를 넘긴다.
//! `unsafe`는 포인터 역참조 함수에만 있고, 안전 조건은 각 함수 주석에 적는다. panic 경로는 두지 않는다(범위 밖은 0/건너뜀).
//!
//! 범위: dry-stamp·airbrush·spray·bristle·hatch-halftone·eraser·smudge(호스트가 운반 색 `pick`을 계산해 넘긴다)·
//! wet-flow(습식 타일에 물·안료 투입). 임파스토 높이 밀기(`pushHeightField`)는 타일을 가로지르는 dab 순서 패스라
//! 이 타일 커널의 범위 밖이다(호스트가 임파스토 프로그램을 거부한다). 습식 시뮬레이션(stepWet)·bake·합성은 호스트(TS)가 한다.

use std::alloc::{alloc_zeroed, dealloc, Layout};

/// ABI 버전. `src/engine/wasm/kernel-abi.ts`의 SUMI_KERNEL_ABI_VERSION과 같아야 한다.
pub const ABI_VERSION: u32 = 1;
const DAB_FLOATS: usize = 16;
const TILE_SIZE: usize = 16;
const TILE_PIXELS: usize = 256;
const PI: f64 = std::f64::consts::PI;
const DEP_AIRBRUSH: u32 = 1;
const DEP_SPRAY: u32 = 2;
const DEP_HATCH_HALFTONE: u32 = 4;
const DEP_WET_FLOW: u32 = 8;
const FLAG_ERASE: u32 = 1 << 16;
const FLAG_SMUDGE: u32 = 1 << 17;
const TIP_ROUND: u32 = 0;
const FILTER_NEAREST: u32 = 0;
const FILTER_BILINEAR: u32 = 1;
const FILTER_ANISOTROPIC: u32 = 3;
const SMUDGE_STRENGTH: f64 = 0.7;
/// 서브픽셀 경계(raster/coverage.ts SUBPIXEL_RADIUS).
const SUBPIXEL_RADIUS: f64 = 0.5;
/// 곡률 보정 κ/24(raster/coverage.ts CURVATURE_AA_CORRECTION). 둘레 전체에서 π/12 px²를 뺀다.
const CURVATURE_AA_CORRECTION: f64 = 1.0 / 24.0;

/// 파라미터 블록(f64 배열) 인덱스 — kernel-abi.ts SK_PARAM과 같다. TS는 f64로 계산하므로 f64로 받는다.
const P_FILTER_MODE: usize = 0;
const P_TIP_TILE: usize = 1;
const P_TIP_LEVELS: usize = 2;
const P_PAPER_ENABLED: usize = 3;
const P_PAPER_SCALE: usize = 4;
const P_PAPER_ROTATION: usize = 5;
const P_PAPER_SIZE: usize = 6;
const P_EDGE_ENABLED: usize = 7;
const P_EDGE_LEN: usize = 8;
const PARAM_FLOATS: usize = 16;
/// 습식 풀 타일 레이아웃(wet/state.ts WET_CH): water, vx, vy, pigment r·g·b·mass, height, fixed r·g·b·mass = 12채널.
const WET_FLOATS_PER_TILE: usize = 12 * TILE_PIXELS;
const WET_CH_WATER: usize = 0;
const WET_CH_PIGMENT_R: usize = 3;

#[no_mangle]
pub extern "C" fn sk_abi_version() -> u32 {
    ABI_VERSION
}

/// 16 B 정렬 0 초기화 블록. 0 바이트 요청은 널(0)을 돌려준다.
#[no_mangle]
pub extern "C" fn sk_alloc(bytes: u32) -> *mut u8 {
    if bytes == 0 {
        return std::ptr::null_mut();
    }
    match Layout::from_size_align(bytes as usize, 16) {
        // 안전: 유효한 Layout이며 반환 포인터는 호스트가 sk_free로만 해제한다.
        Ok(layout) => unsafe { alloc_zeroed(layout) },
        Err(_) => std::ptr::null_mut(),
    }
}

/// `sk_alloc`이 돌려준 포인터만, 같은 bytes로 해제한다. 안전 조건: (ptr, bytes)가 sk_alloc 호출과 일치.
#[no_mangle]
pub extern "C" fn sk_free(ptr: *mut u8, bytes: u32) {
    if ptr.is_null() || bytes == 0 {
        return;
    }
    if let Ok(layout) = Layout::from_size_align(bytes as usize, 16) {
        // 안전: 호출자가 sk_alloc의 (ptr, bytes)를 그대로 넘긴다는 계약.
        unsafe { dealloc(ptr, layout) };
    }
}

// ---- 해시 (core/rng.ts 미러, 정수 연산 비트 동일) ----
fn lowbias32(v: u32) -> u32 {
    let mut x = v;
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846ca68b);
    x ^= x >> 16;
    x
}

fn hash_u32(x: u32, y: u32, seed: u32) -> u32 {
    let sx = lowbias32(seed ^ 0x9e3779b9);
    let hx = lowbias32(sx ^ x);
    lowbias32(hx ^ y.wrapping_mul(0x85ebca6b) ^ 0x27d4eb2f)
}

fn hash_noise_2d(x: i32, y: i32, seed: u32) -> f32 {
    (hash_u32(x as u32, y as u32, seed) as f64 * 2.3283064365386963e-10) as f32
}

/// `sk_hash_noise`: TS `hashNoise2D` 미러(테스트 벡터 대조용).
#[no_mangle]
pub extern "C" fn sk_hash_noise(x: i32, y: i32, seed: u32) -> f32 {
    hash_noise_2d(x, y, seed)
}

// ---- dab 뷰 ----
#[derive(Clone, Copy)]
struct Dab {
    x: f32,
    y: f32,
    rx: f32,
    ry: f32,
    angle: f32,
    hardness: f32,
    flow: f32,
    shape_exp: f32,
    r: f32,
    g: f32,
    b: f32,
    a: f32,
    tip_kind: u32,
    seed: u32,
    grain: f32,
    wet: f32,
    /// TS `unpackDab`은 (flags & 0xffff) / 65535를 f64로 둔다(f32로 접지 않는다).
    pigment_mass: f64,
    flags: u32,
    deposition: u32,
}

fn dab_at(dabs: &[f32], i: usize) -> Option<Dab> {
    let base = i * DAB_FLOATS;
    if base + DAB_FLOATS > dabs.len() {
        return None;
    }
    let tip_seed = dabs[base + 12].to_bits();
    let flags = dabs[base + 15].to_bits();
    Some(Dab {
        x: dabs[base],
        y: dabs[base + 1],
        rx: dabs[base + 2],
        ry: dabs[base + 3],
        angle: dabs[base + 4],
        hardness: dabs[base + 5],
        flow: dabs[base + 6],
        shape_exp: dabs[base + 7],
        r: dabs[base + 8],
        g: dabs[base + 9],
        b: dabs[base + 10],
        a: dabs[base + 11],
        tip_kind: tip_seed >> 24,
        seed: tip_seed & 0x00ff_ffff,
        grain: dabs[base + 13],
        wet: dabs[base + 14],
        pigment_mass: (flags & 0xffff) as f64 / 65535.0,
        flags,
        deposition: flags >> 24,
    })
}

// ---- 커버리지 (raster/coverage.ts 미러) ----
fn clamp01(v: f64) -> f64 {
    if v < 0.0 {
        0.0
    } else if v > 1.0 {
        1.0
    } else {
        v
    }
}

fn normalized_distance(dx: f64, dy: f64, angle: f64, rx: f64, ry: f64, n: f64) -> f32 {
    let c = angle.cos();
    let s = angle.sin();
    let u = dx * c + dy * s;
    let v = -dx * s + dy * c;
    let au = (u / rx).abs();
    let av = (v / ry).abs();
    if n == 2.0 {
        return (au * au + av * av).sqrt() as f32;
    }
    (au.powf(n) + av.powf(n)).powf(1.0 / n) as f32
}

fn coverage(dx: f64, dy: f64, rx: f64, ry: f64, angle: f64, hardness: f64, shape_exp: f64, deposition: u32) -> f32 {
    let rmin = rx.min(ry);
    if rmin <= 0.0 {
        return 0.0;
    }
    if rmin <= SUBPIXEL_RADIUS {
        let area = (PI * rx * ry).min(1.0);
        let kx = 1.0 - dx.abs();
        let ky = 1.0 - dy.abs();
        if kx <= 0.0 || ky <= 0.0 {
            return 0.0;
        }
        return (area * kx * ky) as f32;
    }
    let dn = normalized_distance(dx, dy, angle, rx, ry, shape_exp) as f64;
    if deposition == DEP_AIRBRUSH {
        return (-2.0 * dn * dn).exp() as f32;
    }
    // TS: dpx = fround((dn − 1)·rmin + κ/24/rmin), cov = fround(clamp((−dpx + 0.5)/feather)).
    let dpx = ((dn - 1.0) * rmin + CURVATURE_AA_CORRECTION / rmin) as f32 as f64;
    let feather = (1.0f64).max((1.0 - hardness) * rmin);
    clamp01((-dpx + 0.5) / feather) as f32
}

/// `superellipseCoverage` 미러. 인자는 TS와 같은 f32 값, 내부는 f64.
#[no_mangle]
pub extern "C" fn sk_coverage(dx: f32, dy: f32, rx: f32, ry: f32, angle: f32, hardness: f32, shape_exp: f32, deposition: u32) -> f32 {
    coverage(dx as f64, dy as f64, rx as f64, ry as f64, angle as f64, hardness as f64, shape_exp as f64, deposition)
}

// ---- 타일 범위 (raster/tile-binning.ts 미러) ----
// TS는 두 곳에서 AABB 반경을 계산하고 합 순서가 다르다: 비닝(`boundsOfPacked`)은 ((max + feather) + scatter) + 1,
// 래스터 컬링(`dabExtentPx`)은 (max + (feather + scatter)) + 1. f64 결합 순서까지 그대로 미러한다.
fn feather_only(d: &Dab) -> f64 {
    let rmin = (d.rx as f64).min(d.ry as f64);
    (1.0f64).max((1.0 - d.hardness as f64) * rmin)
}

fn scatter_px(d: &Dab) -> f64 {
    if d.deposition == DEP_AIRBRUSH || d.deposition == DEP_SPRAY {
        (d.rx as f64).max(d.ry as f64)
    } else {
        0.0
    }
}

/// 비닝용 반경(`boundsOfPacked`).
fn bin_extent_px(d: &Dab) -> f64 {
    (d.rx as f64).max(d.ry as f64) + feather_only(d) + scatter_px(d) + 1.0
}

/// 래스터 컬링용 반경(`dabExtentPx` = max + dabFeatherPx + 1, dabFeatherPx = feather + scatter).
fn extent_px(d: &Dab) -> f64 {
    (d.rx as f64).max(d.ry as f64) + (feather_only(d) + scatter_px(d)) + 1.0
}

fn tile_bounds(d: &Dab, tiles_x: i64, tiles_y: i64) -> Option<(i64, i64, i64, i64)> {
    let e = bin_extent_px(d);
    let x0 = (((d.x as f64 - e) / TILE_SIZE as f64).floor() as i64).max(0);
    let y0 = (((d.y as f64 - e) / TILE_SIZE as f64).floor() as i64).max(0);
    let x1 = (((d.x as f64 + e) / TILE_SIZE as f64).floor() as i64).min(tiles_x - 1);
    let y1 = (((d.y as f64 + e) / TILE_SIZE as f64).floor() as i64).min(tiles_y - 1);
    if x1 < x0 || y1 < y0 {
        return None;
    }
    Some((x0, y0, x1, y1))
}

/// CSR 비닝(`binDabs` 미러). refs는 타일 내 dab 인덱스 오름차순.
/// 입력: dabs(n·16 f32). 출력: counts(tile_count), offsets(tile_count+1), refs(refs_cap), dirty(tile_count), out(3: dirty_count, total_refs, overflow_dabs).
/// 반환 0 = 성공, 1 = 포인터 널/길이 불일치, 2 = refs 총수 > refs_cap(refs 미기록, out은 채움).
/// 안전 조건: 각 포인터가 명시된 길이만큼 유효한 메모리를 가리킨다(호스트가 sk_alloc으로 만든 블록).
#[no_mangle]
pub extern "C" fn sk_bin_dabs(
    dabs: *const f32,
    n: u32,
    tiles_x: u32,
    tiles_y: u32,
    max_tiles_per_dab: u32,
    counts: *mut u32,
    offsets: *mut u32,
    refs: *mut u32,
    refs_cap: u32,
    dirty: *mut u32,
    out: *mut u32,
) -> u32 {
    if dabs.is_null() || counts.is_null() || offsets.is_null() || refs.is_null() || dirty.is_null() || out.is_null() {
        return 1;
    }
    if tiles_x == 0 || tiles_y == 0 {
        return 1;
    }
    let tile_count = (tiles_x as usize) * (tiles_y as usize);
    let n = n as usize;
    // 안전: 호출자 계약대로 길이를 신뢰한다(위 주석).
    let dabs = unsafe { std::slice::from_raw_parts(dabs, n * DAB_FLOATS) };
    let counts = unsafe { std::slice::from_raw_parts_mut(counts, tile_count) };
    let offsets = unsafe { std::slice::from_raw_parts_mut(offsets, tile_count + 1) };
    let refs = unsafe { std::slice::from_raw_parts_mut(refs, refs_cap as usize) };
    let dirty = unsafe { std::slice::from_raw_parts_mut(dirty, tile_count) };
    let out = unsafe { std::slice::from_raw_parts_mut(out, 3) };
    for c in counts.iter_mut() {
        *c = 0;
    }
    let tx = tiles_x as i64;
    let ty = tiles_y as i64;
    let mut overflow = 0u32;
    let mut bounds: Vec<Option<(i64, i64, i64, i64)>> = Vec::with_capacity(n);
    for i in 0..n {
        let d = match dab_at(dabs, i) {
            Some(d) => d,
            None => {
                bounds.push(None);
                continue;
            }
        };
        let b = match tile_bounds(&d, tx, ty) {
            Some(b) => b,
            None => {
                bounds.push(None);
                continue;
            }
        };
        let span = ((b.2 - b.0 + 1) * (b.3 - b.1 + 1)) as u64;
        if span > max_tiles_per_dab as u64 {
            overflow += 1;
            bounds.push(None);
            continue;
        }
        bounds.push(Some(b));
        for yy in b.1..=b.3 {
            let row = yy as usize * tiles_x as usize;
            for xx in b.0..=b.2 {
                counts[row + xx as usize] += 1;
            }
        }
    }
    let mut total = 0u32;
    let mut dirty_count = 0u32;
    for t in 0..tile_count {
        offsets[t] = total;
        let c = counts[t];
        total = total.wrapping_add(c);
        if c > 0 {
            dirty[dirty_count as usize] = t as u32;
            dirty_count += 1;
        }
    }
    offsets[tile_count] = total;
    out[0] = dirty_count;
    out[1] = total;
    out[2] = overflow;
    if total as usize > refs.len() {
        return 2;
    }
    let mut cursor: Vec<u32> = vec![0; tile_count];
    for (i, b) in bounds.iter().enumerate() {
        let b = match b {
            Some(b) => *b,
            None => continue,
        };
        for yy in b.1..=b.3 {
            let row = yy as usize * tiles_x as usize;
            for xx in b.0..=b.2 {
                let t = row + xx as usize;
                refs[(offsets[t] + cursor[t]) as usize] = i as u32;
                cursor[t] += 1;
            }
        }
    }
    0
}

// ---- 팁 샘플링 (texture/sampling.ts 미러, 아틀라스 레벨 연결 배열) ----
struct Atlas<'a> {
    data: &'a [f32],
    tile: usize,
    levels: usize,
}

impl<'a> Atlas<'a> {
    fn level_size(&self, level: usize) -> usize {
        (self.tile >> level).max(1)
    }
    fn level_offset(&self, level: usize) -> usize {
        let mut off = 0usize;
        for l in 0..level {
            let n = self.level_size(l);
            off += n * 8 * n;
        }
        off
    }
    fn texel(&self, kind: usize, level: usize, x: i64, y: i64) -> f64 {
        let n = self.level_size(level) as i64;
        let cx = x.clamp(0, n - 1) as usize;
        let cy = y.clamp(0, n - 1) as usize;
        let width = n as usize * 8;
        let idx = self.level_offset(level) + cy * width + kind * n as usize + cx;
        *self.data.get(idx).unwrap_or(&0.0) as f64
    }
    fn nearest(&self, kind: usize, level: usize, u: f64, v: f64) -> f64 {
        let n = self.level_size(level) as f64;
        self.texel(kind, level, (u * n).floor() as i64, (v * n).floor() as i64)
    }
    fn bilinear(&self, kind: usize, level: usize, u: f64, v: f64) -> f64 {
        let n = self.level_size(level);
        if n == 1 {
            return self.texel(kind, level, 0, 0);
        }
        let fx = u * n as f64 - 0.5;
        let fy = v * n as f64 - 0.5;
        let x0 = fx.floor();
        let y0 = fy.floor();
        let tx = fx - x0;
        let ty = fy - y0;
        let x0 = x0 as i64;
        let y0 = y0 as i64;
        let a = self.texel(kind, level, x0, y0);
        let b = self.texel(kind, level, x0 + 1, y0);
        let c = self.texel(kind, level, x0, y0 + 1);
        let d = self.texel(kind, level, x0 + 1, y0 + 1);
        let top = a + (b - a) * tx;
        let bottom = c + (d - c) * tx;
        top + (bottom - top) * ty
    }
    fn trilinear(&self, kind: usize, u: f64, v: f64, lod: f64) -> f64 {
        let max_lod = (self.levels - 1) as f64;
        let l = if lod < 0.0 { 0.0 } else if lod > max_lod { max_lod } else { lod };
        let l0 = l.floor();
        let l1 = (l0 + 1.0).min(max_lod);
        let t = l - l0;
        let a = self.bilinear(kind, l0 as usize, u, v);
        if t <= 0.0 || l1 == l0 {
            return a;
        }
        let b = self.bilinear(kind, l1 as usize, u, v);
        a + (b - a) * t
    }
    fn sample(&self, kind: usize, u: f64, v: f64, lod: f64, filter: u32, aniso: Option<(f64, f64, f64)>) -> f64 {
        if !(0.0..1.0).contains(&u) || !(0.0..1.0).contains(&v) {
            return 0.0;
        }
        match filter {
            // TS levelAt: 레벨 인덱스를 마지막 레벨로 clamp한다(작은 dab의 lod가 체인 길이를 넘는다).
            FILTER_NEAREST => self.nearest(kind, round_half_up(lod).min(self.levels - 1), u, v),
            FILTER_BILINEAR => self.bilinear(kind, round_half_up(lod).min(self.levels - 1), u, v),
            FILTER_ANISOTROPIC => match aniso {
                Some((du, dv, ratio)) if ratio > 1.0 => {
                    let ratio = ratio.min(16.0);
                    let level = (lod.floor().max(0.0) as usize).min(self.levels - 1);
                    let base = self.level_size(level) as f64;
                    let span = ratio / base;
                    let mut sum = 0.0;
                    for i in 0..4 {
                        let o = (-0.375 + 0.25 * i as f64) * span;
                        let su = u + du * o;
                        let sv = v + dv * o;
                        if !(0.0..1.0).contains(&su) || !(0.0..1.0).contains(&sv) {
                            continue;
                        }
                        sum += self.trilinear(kind, su, sv, lod);
                    }
                    sum / 4.0
                }
                _ => self.trilinear(kind, u, v, lod),
            },
            _ => self.trilinear(kind, u, v, lod),
        }
    }
}

/// JS Math.round 미러(비음수 lod 전제).
fn round_half_up(x: f64) -> usize {
    (x + 0.5).floor().max(0.0) as usize
}

fn lod_for(px_per_texel: f64) -> f64 {
    if !(px_per_texel > 0.0) {
        return 0.0;
    }
    let lod = -px_per_texel.log2();
    if lod < 0.0 {
        0.0
    } else {
        lod
    }
}

// ---- 종이 bump 샘플 (texture/paper-grain.ts samplePaper/sampleChannel 미러) ----
fn wrap(i: i64, size: i64) -> usize {
    (((i % size) + size) % size) as usize
}

fn sample_bump(field: &[f32], size: usize, x: f64, y: f64, scale: f64, rotation: f64, bilinear: bool) -> f64 {
    let sc = if scale > 0.0 { scale } else { 1.0 };
    let c = rotation.cos();
    let s = rotation.sin();
    let tx = (x * c - y * s) / sc;
    let ty = (x * s + y * c) / sc;
    let n = size as i64;
    let at = |xx: usize, yy: usize| -> f64 { *field.get(yy * size + xx).unwrap_or(&0.0) as f64 };
    if !bilinear {
        return at(wrap(tx.floor() as i64, n), wrap(ty.floor() as i64, n));
    }
    let fx = tx - 0.5;
    let fy = ty - 0.5;
    let x0 = fx.floor();
    let y0 = fy.floor();
    let sx = fx - x0;
    let sy = fy - y0;
    let xa = wrap(x0 as i64, n);
    let xb = wrap(x0 as i64 + 1, n);
    let ya = wrap(y0 as i64, n);
    let yb = wrap(y0 as i64 + 1, n);
    let a = at(xa, ya);
    let b = at(xb, ya);
    let c2 = at(xa, yb);
    let d = at(xb, yb);
    let top = a + (b - a) * sx;
    let bottom = c2 + (d - c2) * sx;
    top + (bottom - top) * sy
}

fn eval_curve(curve: &[f64], t: f64) -> f64 {
    let n = curve.len();
    if n == 0 {
        return 0.0;
    }
    if n == 1 {
        return curve[0];
    }
    let clamped = clamp01(t);
    let scaled = clamped * (n - 1) as f64;
    let lower = scaled.floor() as usize;
    let upper = (lower + 1).min(n - 1);
    let frac = scaled - lower as f64;
    let lo = curve[lower];
    let hi = curve[upper];
    lo + (hi - lo) * frac
}

/// 타일 1개 래스터(`rasterizeTile` 미러, 임파스토 높이 패스 제외).
/// - dabs: n·16 f32, refs: 타일의 dab 인덱스(오름차순), ref_count개
/// - params: PARAM_FLOATS f64(SK_PARAM 인덱스), tip_atlas: 레벨 연결 f32(널이면 round 외 팁은 마스크 1),
///   paper: bump 필드 size² f32(널 또는 paper_enabled 0이면 그레인 생략), curve: edge_len f64
/// - pick: smudge 운반 색(dab_count·4 f32, premultiplied; 널이면 smudge 플래그가 있어도 일반 dab처럼 그린다 — CPU와 같다)
/// - wet_tile: 습식 풀 타일(12 채널 × 256 f32, 채널 순서 = WET_CH; 널이면 습식 투입 생략). wet-flow dab가 물·안료를 투입한다
/// - stroke_tile: 1024 f32(rgba premultiplied, read-modify-write)
/// 반환: 기여한 dab 수(smudge 운반 색 알파 0으로 건너뛴 dab 제외). 안전 조건: 포인터 길이 계약(위).
#[no_mangle]
pub extern "C" fn sk_raster_tile(
    tile: u32,
    tiles_x: u32,
    dabs: *const f32,
    dab_count: u32,
    refs: *const u32,
    ref_count: u32,
    params: *const f64,
    tip_atlas: *const f32,
    tip_atlas_floats: u32,
    paper: *const f32,
    curve: *const f64,
    pick: *const f32,
    wet_tile: *mut f32,
    stroke_tile: *mut f32,
) -> u32 {
    if dabs.is_null() || refs.is_null() || params.is_null() || stroke_tile.is_null() || tiles_x == 0 {
        return 0;
    }
    // 안전: 호출자 계약대로 길이를 신뢰한다.
    let dabs = unsafe { std::slice::from_raw_parts(dabs, dab_count as usize * DAB_FLOATS) };
    let refs = unsafe { std::slice::from_raw_parts(refs, ref_count as usize) };
    let params = unsafe { std::slice::from_raw_parts(params, PARAM_FLOATS) };
    let tile_out = unsafe { std::slice::from_raw_parts_mut(stroke_tile, TILE_PIXELS * 4) };
    let pick_s: &[f32] = if pick.is_null() { &[] } else { unsafe { std::slice::from_raw_parts(pick, dab_count as usize * 4) } };
    let mut no_wet: [f32; 0] = [];
    let wet_s: &mut [f32] = if wet_tile.is_null() {
        &mut no_wet
    } else {
        unsafe { std::slice::from_raw_parts_mut(wet_tile, WET_FLOATS_PER_TILE) }
    };
    let filter = params[P_FILTER_MODE] as u32;
    let tip_tile = (params[P_TIP_TILE] as usize).max(1);
    let tip_levels = (params[P_TIP_LEVELS] as usize).max(1);
    let paper_enabled = params[P_PAPER_ENABLED] != 0.0 && !paper.is_null();
    let paper_size = (params[P_PAPER_SIZE] as usize).max(1);
    let paper_scale = params[P_PAPER_SCALE];
    let paper_rot = params[P_PAPER_ROTATION];
    let edge_enabled = params[P_EDGE_ENABLED] != 0.0 && !curve.is_null();
    let edge_len = params[P_EDGE_LEN] as usize;
    let atlas = if tip_atlas.is_null() || tip_atlas_floats == 0 {
        None
    } else {
        Some(Atlas { data: unsafe { std::slice::from_raw_parts(tip_atlas, tip_atlas_floats as usize) }, tile: tip_tile, levels: tip_levels })
    };
    let paper_field: &[f32] = if paper_enabled { unsafe { std::slice::from_raw_parts(paper, paper_size * paper_size) } } else { &[] };
    let curve_s: &[f64] = if edge_enabled && edge_len > 0 { unsafe { std::slice::from_raw_parts(curve, edge_len) } } else { &[] };
    let use_curve = edge_enabled && !curve_s.is_empty();
    let bilinear_paper = filter != FILTER_NEAREST;
    let tx = (tile % tiles_x) as f64;
    let ty = (tile / tiles_x) as f64;
    let px0 = tx * TILE_SIZE as f64;
    let py0 = ty * TILE_SIZE as f64;
    let mut hits = 0u32;
    for &ri in refs {
        let d = match dab_at(dabs, ri as usize) {
            Some(d) => d,
            None => continue,
        };
        let idx = ri as usize;
        // smudge 운반 색: `dab.smudge && smudgeColors`일 때만(널이면 일반 dab). 알파 0이면 dab 전체를 건너뛴다.
        let smudge_pick: Option<[f32; 4]> = if d.flags & FLAG_SMUDGE != 0 && pick_s.len() >= (idx + 1) * 4 {
            Some([pick_s[idx * 4], pick_s[idx * 4 + 1], pick_s[idx * 4 + 2], pick_s[idx * 4 + 3]])
        } else {
            None
        };
        if let Some(p) = smudge_pick {
            if p[3] <= 0.0 {
                continue;
            }
        }
        hits += 1;
        let e = extent_px(&d);
        let rx = d.rx as f64;
        let ry = d.ry as f64;
        let rmin = rx.min(ry);
        let rmax = rx.max(ry);
        let use_mask = d.tip_kind != TIP_ROUND && atlas.is_some();
        let lod = if use_mask { lod_for((2.0 * rmin) / tip_tile as f64) } else { 0.0 };
        let aniso_ratio = rmax / rmin.max(1e-3);
        let c = (d.angle as f64).cos();
        let s = (d.angle as f64).sin();
        let aniso = if aniso_ratio > 1.01 { Some((if rx >= ry { 1.0 } else { 0.0 }, if rx >= ry { 0.0 } else { 1.0 }, aniso_ratio)) } else { None };
        let world_aligned = d.deposition == DEP_HATCH_HALFTONE;
        let is_spray = d.deposition == DEP_SPRAY;
        let wet_factor = if d.deposition == DEP_WET_FLOW { 1.0 - 0.6 * d.wet as f64 } else { 1.0 };
        let erase = d.flags & FLAG_ERASE != 0;
        // 수채 계열(습식 상태가 있는 wet-flow): 색은 획 레이어가 아니라 습식 층의 안료 질량이 들고 있다(표시 시점 합성).
        // CPU `rasterizeTile`의 `wetOnly`와 같다 — 이 dab는 획 레이어에 쓰지 않고 습식 풀에만 투입한다.
        let wet_only = !wet_s.is_empty() && d.deposition == DEP_WET_FLOW;
        // 안료 색(unpremultiplied 선형) — 습식 투입용.
        let pr = if d.a > 0.0 { d.r as f64 / d.a as f64 } else { 0.0 };
        let pg = if d.a > 0.0 { d.g as f64 / d.a as f64 } else { 0.0 };
        let pb = if d.a > 0.0 { d.b as f64 / d.a as f64 } else { 0.0 };
        for ly in 0..TILE_SIZE {
            let py = py0 + ly as f64 + 0.5;
            let dy = py - d.y as f64;
            if dy > e || dy < -e {
                continue;
            }
            for lx in 0..TILE_SIZE {
                let px = px0 + lx as f64 + 0.5;
                let dx = px - d.x as f64;
                if dx > e || dx < -e {
                    continue;
                }
                let mut cov = coverage(dx, dy, rx, ry, d.angle as f64, d.hardness as f64, d.shape_exp as f64, d.deposition) as f64;
                if cov <= 0.0 {
                    continue;
                }
                if use_curve {
                    cov = eval_curve(curve_s, cov) as f32 as f64;
                }
                let mut m = 1.0;
                if let (true, Some(atlas)) = (use_mask, atlas.as_ref()) {
                    let (u, v) = if world_aligned {
                        let pu = px / (2.0 * rx);
                        let pv = py / (2.0 * ry);
                        (pu - pu.floor(), pv - pv.floor())
                    } else {
                        let lu = dx * c + dy * s;
                        let lv = -dx * s + dy * c;
                        ((lu / rx) * 0.5 + 0.5, (lv / ry) * 0.5 + 0.5)
                    };
                    m = atlas.sample(d.tip_kind as usize, u, v, lod, filter, aniso);
                    if m <= 0.0 {
                        continue;
                    }
                }
                let mut grain_resp = 1.0;
                if d.grain > 0.0 && paper_enabled {
                    let bump = sample_bump(paper_field, paper_size, px, py, paper_scale, paper_rot, bilinear_paper);
                    grain_resp = (1.0 - d.grain as f64 * (1.0 - bump)) as f32 as f64;
                }
                if is_spray {
                    let h = hash_noise_2d(px.floor() as i32, py.floor() as i32, d.seed) as f64;
                    if h > 0.3 * cov + 0.1 {
                        continue;
                    }
                    cov = 1.0;
                }
                let alpha = (cov * m * grain_resp * d.flow as f64) as f32 as f64;
                if alpha <= 0.0 {
                    continue;
                }
                let o = (ly * TILE_SIZE + lx) * 4;
                let (sr, sg, sb, sa) = if erase {
                    (0.0f32, 0.0f32, 0.0f32, alpha as f32)
                } else if let Some(p) = smudge_pick {
                    let sm = (alpha * SMUDGE_STRENGTH) as f32 as f64;
                    ((p[0] as f64 * sm) as f32, (p[1] as f64 * sm) as f32, (p[2] as f64 * sm) as f32, (p[3] as f64 * sm) as f32)
                } else {
                    let w = (alpha * wet_factor) as f32 as f64;
                    ((d.r as f64 * w) as f32, (d.g as f64 * w) as f32, (d.b as f64 * w) as f32, (d.a as f64 * w) as f32)
                };
                if !wet_only {
                    let k_inv = (1.0 - sa as f64) as f32 as f64;
                    tile_out[o] = (sr as f64 + tile_out[o] as f64 * k_inv) as f32;
                    tile_out[o + 1] = (sg as f64 + tile_out[o + 1] as f64 * k_inv) as f32;
                    tile_out[o + 2] = (sb as f64 + tile_out[o + 2] as f64 * k_inv) as f32;
                    tile_out[o + 3] = (sa as f64 + tile_out[o + 3] as f64 * k_inv) as f32;
                }
                if !wet_s.is_empty() && d.deposition == DEP_WET_FLOW {
                    let local = ly * TILE_SIZE + lx;
                    wet_s[WET_CH_WATER * TILE_PIXELS + local] = (wet_s[WET_CH_WATER * TILE_PIXELS + local] as f64 + d.wet as f64 * cov) as f32;
                    let mass = (d.pigment_mass * cov * m) as f32 as f64;
                    let mi = (WET_CH_PIGMENT_R + 3) * TILE_PIXELS + local;
                    wet_s[mi] = (wet_s[mi] as f64 + mass) as f32;
                    let ri2 = WET_CH_PIGMENT_R * TILE_PIXELS + local;
                    wet_s[ri2] = (wet_s[ri2] as f64 + pr * mass) as f32;
                    let gi = (WET_CH_PIGMENT_R + 1) * TILE_PIXELS + local;
                    wet_s[gi] = (wet_s[gi] as f64 + pg * mass) as f32;
                    let bi = (WET_CH_PIGMENT_R + 2) * TILE_PIXELS + local;
                    wet_s[bi] = (wet_s[bi] as f64 + pb * mass) as f32;
                }
            }
        }
    }
    hits
}
