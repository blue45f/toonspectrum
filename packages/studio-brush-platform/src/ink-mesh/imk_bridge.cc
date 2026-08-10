// Copyright 2026 ToonSpectrum Studio.
//
// C bridge for google/ink brush-geometry (mesh) generation
// (ADR-0011 lane 3, V12 codex section 11.2).
//
// This bridge exposes both:
//   * the retained single-shot `imk_generate` compatibility surface; and
//   * a stateful `InProgressStroke` surface that enqueues only new inputs and
//     emits deterministic retain-and-replace mesh deltas.
//
// The incremental path does not recreate or remesh the whole stroke. Google
// Ink owns the MutableMesh and extends/mutates its tail across calls to
// `EnqueueInputs()` + `UpdateShape()`. The bridge compares the resulting mesh
// with its previous flattened snapshot and exports only the changed tail.
//
// Input ABI (stride 6 doubles):
//   x, y, tSeconds, pressure, tiltRadians, orientationRadians.
// A negative optional value means "attribute not reported". Pressure, tilt,
// and orientation are preserved on every StrokeInput; Google Ink enforces
// attribute-presence consistency across the stroke.

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <new>
#include <vector>

#include "absl/status/status.h"
#include "absl/status/statusor.h"
#include "ink/brush/brush.h"
#include "ink/brush/brush_behavior.h"
#include "ink/brush/brush_family.h"
#include "ink/brush/brush_paint.h"
#include "ink/brush/brush_tip.h"
#include "ink/color/color.h"
#include "ink/geometry/angle.h"
#include "ink/geometry/mutable_mesh.h"
#include "ink/geometry/point.h"
#include "ink/strokes/in_progress_stroke.h"
#include "ink/strokes/input/stroke_input.h"
#include "ink/strokes/input/stroke_input_batch.h"
#include "ink/strokes/internal/stroke_vertex.h"
#include "ink/types/duration.h"

namespace {

using ::ink::Angle;
using ::ink::Brush;
using ::ink::BrushBehavior;
using ::ink::BrushFamily;
using ::ink::BrushPaint;
using ::ink::BrushTip;
using ::ink::Color;
using ::ink::Duration32;
using ::ink::InProgressStroke;
using ::ink::MutableMesh;
using ::ink::Point;
using ::ink::StrokeInput;
using ::ink::StrokeInputBatch;
using ::ink::strokes_internal::StrokeVertex;

constexpr int kPointStride = 6;
constexpr int kMaxPointsPerAppend = 65536;
constexpr int kMaxStrokePoints = 1000000;
constexpr float kHalfPi = 1.57079632679489661923f;
constexpr float kTwoPi = 6.28318530717958647692f;

enum class DeltaKind : int {
  kNoop = 0,
  kAppend = 1,
  kUpdate = 2,
};

struct ImkHandle {
  InProgressStroke stroke;

  // Full flattened snapshot. This is retained for the compatibility getters,
  // final parity checks, and common-prefix detection. Prefix bytes are reused.
  std::vector<float> positions;
  std::vector<float> tex_coords;
  std::vector<uint32_t> indices;

  // Replacement tails exported by the current protocol revision.
  std::vector<float> delta_positions;
  std::vector<float> delta_tex_coords;
  std::vector<uint32_t> delta_indices;

  uint32_t retained_vertex_count = 0;
  uint32_t retained_triangle_count = 0;
  uint32_t base_revision = 0;
  uint32_t revision = 0;
  DeltaKind delta_kind = DeltaKind::kNoop;

  bool active = false;
  bool finished = false;
  bool has_t0 = false;
  double t0_seconds = 0;
  double last_t_seconds = 0;
  int input_count = 0;
};

int NegatedCode(const absl::Status& status) {
  return -static_cast<int>(status.code());
}

int InvalidArgument() {
  return -static_cast<int>(absl::StatusCode::kInvalidArgument);
}

int FailedPrecondition() {
  return -static_cast<int>(absl::StatusCode::kFailedPrecondition);
}

int ResourceExhausted() {
  return -static_cast<int>(absl::StatusCode::kResourceExhausted);
}

bool IsOptionalValue(double value, double upper_bound) {
  return value == -1.0 ||
         (std::isfinite(value) && value >= 0.0 && value <= upper_bound);
}

bool ValidatePoint(const double* point) {
  if (!std::isfinite(point[0]) || !std::isfinite(point[1]) ||
      !std::isfinite(point[2])) {
    return false;
  }
  if (point[0] > std::numeric_limits<float>::max() ||
      point[0] < -std::numeric_limits<float>::max() ||
      point[1] > std::numeric_limits<float>::max() ||
      point[1] < -std::numeric_limits<float>::max()) {
    return false;
  }
  return IsOptionalValue(point[3], 1.0) &&
         IsOptionalValue(point[4], static_cast<double>(kHalfPi)) &&
         IsOptionalValue(point[5], static_cast<double>(kTwoPi));
}

absl::StatusOr<Brush> CreateBrush(
    float brush_size, float brush_epsilon, float corner_rounding, float pinch,
    float rotation_rad, float scale_x, float scale_y,
    int pressure_to_size_enabled, float size_multiplier_min,
    float size_multiplier_max, int tilt_to_rotation_enabled,
    float tilt_rotation_min, float tilt_rotation_max) {
  BrushTip tip;
  tip.scale = {scale_x, scale_y};
  tip.corner_rounding = corner_rounding;
  tip.pinch = pinch;
  tip.rotation = Angle::Radians(rotation_rad);
  if (pressure_to_size_enabled != 0) {
    tip.behaviors.push_back(BrushBehavior{
        .nodes = {
            BrushBehavior::SourceNode{
                .source = BrushBehavior::Source::kNormalizedPressure,
                .source_value_range = {0.f, 1.f},
            },
            BrushBehavior::TargetNode{
                .target = BrushBehavior::Target::kSizeMultiplier,
                .target_modifier_range = {size_multiplier_min,
                                          size_multiplier_max},
            },
        }});
  }
  if (tilt_to_rotation_enabled != 0) {
    tip.behaviors.push_back(BrushBehavior{
        .nodes = {
            BrushBehavior::SourceNode{
                .source = BrushBehavior::Source::kTiltInRadians,
                .source_value_range = {0.f, kHalfPi},
            },
            BrushBehavior::TargetNode{
                .target = BrushBehavior::Target::kRotationOffsetInRadians,
                .target_modifier_range = {tilt_rotation_min,
                                          tilt_rotation_max},
            },
        }});
  }

  absl::StatusOr<BrushFamily> family = BrushFamily::Create(
      tip, BrushPaint{}, BrushFamily::PassthroughModel{});
  if (!family.ok()) return family.status();
  return Brush::Create(*family, Color::Black(), brush_size, brush_epsilon);
}

void ClearProtocolState(ImkHandle& handle) {
  handle.positions.clear();
  handle.tex_coords.clear();
  handle.indices.clear();
  handle.delta_positions.clear();
  handle.delta_tex_coords.clear();
  handle.delta_indices.clear();
  handle.retained_vertex_count = 0;
  handle.retained_triangle_count = 0;
  handle.base_revision = 0;
  handle.revision = 0;
  handle.delta_kind = DeltaKind::kNoop;
  handle.has_t0 = false;
  handle.t0_seconds = 0;
  handle.last_t_seconds = 0;
  handle.input_count = 0;
}

int BeginStroke(ImkHandle& handle, float brush_size, float brush_epsilon,
                float corner_rounding, float pinch, float rotation_rad,
                float scale_x, float scale_y, int pressure_to_size_enabled,
                float size_multiplier_min, float size_multiplier_max,
                int tilt_to_rotation_enabled, float tilt_rotation_min,
                float tilt_rotation_max) {
  absl::StatusOr<Brush> brush = CreateBrush(
      brush_size, brush_epsilon, corner_rounding, pinch, rotation_rad, scale_x,
      scale_y, pressure_to_size_enabled, size_multiplier_min,
      size_multiplier_max, tilt_to_rotation_enabled, tilt_rotation_min,
      tilt_rotation_max);
  if (!brush.ok()) return NegatedCode(brush.status());

  handle.stroke.Start(*brush, /*noise_seed=*/0);
  ClearProtocolState(handle);
  handle.active = true;
  handle.finished = false;
  return 0;
}

uint32_t FindCommonVertexPrefix(const ImkHandle& handle,
                                const MutableMesh& mesh) {
  const uint32_t old_count =
      static_cast<uint32_t>(handle.positions.size() / 2);
  const uint32_t limit = std::min(old_count, mesh.VertexCount());
  for (uint32_t i = 0; i < limit; ++i) {
    const Point position = mesh.VertexPosition(i);
    const Point uv = StrokeVertex::GetSurfaceUvFromMesh(mesh, i);
    if (handle.positions[i * 2] != position.x ||
        handle.positions[i * 2 + 1] != position.y ||
        handle.tex_coords[i * 2] != uv.x ||
        handle.tex_coords[i * 2 + 1] != uv.y) {
      return i;
    }
  }
  return limit;
}

uint32_t FindCommonTrianglePrefix(const ImkHandle& handle,
                                  const MutableMesh& mesh) {
  const uint32_t old_count =
      static_cast<uint32_t>(handle.indices.size() / 3);
  const uint32_t limit = std::min(old_count, mesh.TriangleCount());
  for (uint32_t i = 0; i < limit; ++i) {
    const std::array<uint32_t, 3> triangle = mesh.TriangleIndices(i);
    if (handle.indices[i * 3] != triangle[0] ||
        handle.indices[i * 3 + 1] != triangle[1] ||
        handle.indices[i * 3 + 2] != triangle[2]) {
      return i;
    }
  }
  return limit;
}

void BuildDelta(ImkHandle& handle) {
  const MutableMesh& mesh = handle.stroke.GetMesh(0);
  const uint32_t old_vertex_count =
      static_cast<uint32_t>(handle.positions.size() / 2);
  const uint32_t old_triangle_count =
      static_cast<uint32_t>(handle.indices.size() / 3);
  const uint32_t vertex_count = mesh.VertexCount();
  const uint32_t triangle_count = mesh.TriangleCount();

  const uint32_t retained_vertices = FindCommonVertexPrefix(handle, mesh);
  const uint32_t retained_triangles = FindCommonTrianglePrefix(handle, mesh);

  handle.delta_positions.clear();
  handle.delta_tex_coords.clear();
  handle.delta_indices.clear();
  handle.delta_positions.reserve((vertex_count - retained_vertices) * 2);
  handle.delta_tex_coords.reserve((vertex_count - retained_vertices) * 2);
  handle.delta_indices.reserve((triangle_count - retained_triangles) * 3);

  handle.positions.resize(static_cast<size_t>(vertex_count) * 2);
  handle.tex_coords.resize(static_cast<size_t>(vertex_count) * 2);
  for (uint32_t i = retained_vertices; i < vertex_count; ++i) {
    const Point position = mesh.VertexPosition(i);
    const Point uv = StrokeVertex::GetSurfaceUvFromMesh(mesh, i);
    handle.positions[i * 2] = position.x;
    handle.positions[i * 2 + 1] = position.y;
    handle.tex_coords[i * 2] = uv.x;
    handle.tex_coords[i * 2 + 1] = uv.y;
    handle.delta_positions.push_back(position.x);
    handle.delta_positions.push_back(position.y);
    handle.delta_tex_coords.push_back(uv.x);
    handle.delta_tex_coords.push_back(uv.y);
  }

  handle.indices.resize(static_cast<size_t>(triangle_count) * 3);
  for (uint32_t i = retained_triangles; i < triangle_count; ++i) {
    const std::array<uint32_t, 3> triangle = mesh.TriangleIndices(i);
    handle.indices[i * 3] = triangle[0];
    handle.indices[i * 3 + 1] = triangle[1];
    handle.indices[i * 3 + 2] = triangle[2];
    handle.delta_indices.push_back(triangle[0]);
    handle.delta_indices.push_back(triangle[1]);
    handle.delta_indices.push_back(triangle[2]);
  }

  const bool changed = retained_vertices != vertex_count ||
                       retained_triangles != triangle_count ||
                       old_vertex_count != vertex_count ||
                       old_triangle_count != triangle_count;
  handle.delta_kind =
      !changed
          ? DeltaKind::kNoop
          : (retained_vertices == old_vertex_count &&
                     retained_triangles == old_triangle_count
                 ? DeltaKind::kAppend
                 : DeltaKind::kUpdate);
  handle.retained_vertex_count = retained_vertices;
  handle.retained_triangle_count = retained_triangles;
  handle.base_revision = handle.revision;
  ++handle.revision;
}

int AppendPoints(ImkHandle& handle, const double* points, int point_count,
                 bool finish) {
  if (!handle.active || handle.finished) return FailedPrecondition();
  if (points == nullptr || point_count <= 0 ||
      point_count > kMaxPointsPerAppend) {
    return InvalidArgument();
  }
  if (handle.input_count > kMaxStrokePoints - point_count) {
    return ResourceExhausted();
  }

  StrokeInputBatch batch;
  const bool first_append = !handle.has_t0;
  const double candidate_t0 = first_append ? points[2] : handle.t0_seconds;
  if (!std::isfinite(candidate_t0)) return InvalidArgument();

  for (int i = 0; i < point_count; ++i) {
    const double* point = points + static_cast<size_t>(i) * kPointStride;
    if (!ValidatePoint(point)) return InvalidArgument();
    const double elapsed = point[2] - candidate_t0;
    if (!std::isfinite(elapsed) || elapsed < 0.0 ||
        elapsed > std::numeric_limits<float>::max()) {
      return InvalidArgument();
    }
    StrokeInput input;
    input.tool_type = StrokeInput::ToolType::kStylus;
    input.position = Point{static_cast<float>(point[0]),
                           static_cast<float>(point[1])};
    input.elapsed_time = Duration32::Seconds(static_cast<float>(elapsed));
    input.pressure = point[3] < 0
                         ? StrokeInput::kNoPressure
                         : static_cast<float>(point[3]);
    input.tilt = point[4] < 0 ? StrokeInput::kNoTilt
                              : Angle::Radians(static_cast<float>(point[4]));
    input.orientation =
        point[5] < 0
            ? StrokeInput::kNoOrientation
            : Angle::Radians(static_cast<float>(point[5]));
    if (absl::Status status = batch.Append(input); !status.ok()) {
      return NegatedCode(status);
    }
  }

  if (absl::Status status =
          handle.stroke.EnqueueInputs(batch, StrokeInputBatch{});
      !status.ok()) {
    return NegatedCode(status);
  }
  if (finish) handle.stroke.FinishInputs();
  const double last_t = points[static_cast<size_t>(point_count - 1) *
                                   kPointStride +
                               2];
  if (absl::Status status = handle.stroke.UpdateShape(
          Duration32::Seconds(static_cast<float>(last_t - candidate_t0)));
      !status.ok()) {
    return NegatedCode(status);
  }

  if (first_append) {
    handle.t0_seconds = candidate_t0;
    handle.has_t0 = true;
  }
  handle.last_t_seconds = last_t;
  handle.input_count += point_count;
  handle.finished = finish;
  BuildDelta(handle);
  return static_cast<int>(handle.delta_indices.size() / 3);
}

int FinishStroke(ImkHandle& handle) {
  if (!handle.active || handle.finished || !handle.has_t0) {
    return FailedPrecondition();
  }
  handle.stroke.FinishInputs();
  if (absl::Status status = handle.stroke.UpdateShape(Duration32::Seconds(
          static_cast<float>(handle.last_t_seconds - handle.t0_seconds)));
      !status.ok()) {
    return NegatedCode(status);
  }
  handle.finished = true;
  BuildDelta(handle);
  return static_cast<int>(handle.delta_indices.size() / 3);
}

int TrackedVectorBytes(const ImkHandle& handle) {
  size_t bytes = 0;
  bytes += handle.positions.capacity() * sizeof(float);
  bytes += handle.tex_coords.capacity() * sizeof(float);
  bytes += handle.indices.capacity() * sizeof(uint32_t);
  bytes += handle.delta_positions.capacity() * sizeof(float);
  bytes += handle.delta_tex_coords.capacity() * sizeof(float);
  bytes += handle.delta_indices.capacity() * sizeof(uint32_t);
  return static_cast<int>(std::min(
      bytes, static_cast<size_t>(std::numeric_limits<int>::max())));
}

}  // namespace

extern "C" {

ImkHandle* imk_create() { return new (std::nothrow) ImkHandle(); }

void imk_destroy(ImkHandle* handle) { delete handle; }

int imk_point_stride() { return kPointStride; }

int imk_max_points_per_append() { return kMaxPointsPerAppend; }

int imk_max_stroke_points() { return kMaxStrokePoints; }

int imk_begin(ImkHandle* handle, float brush_size, float brush_epsilon,
              float corner_rounding, float pinch, float rotation_rad,
              float scale_x, float scale_y, int pressure_to_size_enabled,
              float size_multiplier_min, float size_multiplier_max,
              int tilt_to_rotation_enabled, float tilt_rotation_min,
              float tilt_rotation_max) {
  if (handle == nullptr) return FailedPrecondition();
  return BeginStroke(*handle, brush_size, brush_epsilon, corner_rounding, pinch,
                     rotation_rad, scale_x, scale_y,
                     pressure_to_size_enabled, size_multiplier_min,
                     size_multiplier_max, tilt_to_rotation_enabled,
                     tilt_rotation_min, tilt_rotation_max);
}

int imk_append(ImkHandle* handle, const double* points, int point_count) {
  if (handle == nullptr) return FailedPrecondition();
  return AppendPoints(*handle, points, point_count, /*finish=*/false);
}

int imk_finish(ImkHandle* handle) {
  if (handle == nullptr) return FailedPrecondition();
  return FinishStroke(*handle);
}

void imk_cancel(ImkHandle* handle) {
  if (handle == nullptr) return;
  handle->stroke.Clear();
  ClearProtocolState(*handle);
  handle->active = false;
  handle->finished = true;
}

// Compatibility single-shot surface. It intentionally uses the exact same
// Begin/Append implementation as the incremental API so final parity is a
// direct property of update partitioning rather than duplicate geometry code.
int imk_generate(ImkHandle* handle, const double* points, int point_count,
                 float brush_size, float brush_epsilon, float corner_rounding,
                 float pinch, float rotation_rad, float scale_x, float scale_y,
                 int pressure_to_size_enabled, float size_multiplier_min,
                 float size_multiplier_max, int tilt_to_rotation_enabled,
                 float tilt_rotation_min, float tilt_rotation_max) {
  if (handle == nullptr || points == nullptr || point_count <= 0 ||
      point_count > kMaxStrokePoints) {
    return InvalidArgument();
  }
  int status = BeginStroke(*handle, brush_size, brush_epsilon, corner_rounding,
                           pinch, rotation_rad, scale_x, scale_y,
                           pressure_to_size_enabled, size_multiplier_min,
                           size_multiplier_max, tilt_to_rotation_enabled,
                           tilt_rotation_min, tilt_rotation_max);
  if (status < 0) return status;
  // The compatibility surface may exceed the live per-append cap, but remains
  // bounded by kMaxStrokePoints. Chunk it without exposing intermediate deltas.
  int offset = 0;
  while (offset < point_count) {
    const int count = std::min(kMaxPointsPerAppend, point_count - offset);
    const bool finish = offset + count == point_count;
    status = AppendPoints(
        *handle, points + static_cast<size_t>(offset) * kPointStride, count,
        finish);
    if (status < 0) return status;
    offset += count;
  }
  return static_cast<int>(handle->indices.size() / 3);
}

int imk_vertex_count(const ImkHandle* handle) {
  return handle == nullptr ? -1
                           : static_cast<int>(handle->positions.size() / 2);
}

int imk_triangle_count(const ImkHandle* handle) {
  return handle == nullptr ? -1
                           : static_cast<int>(handle->indices.size() / 3);
}

const float* imk_positions_ptr(const ImkHandle* handle) {
  return handle == nullptr ? nullptr : handle->positions.data();
}

const float* imk_tex_coords_ptr(const ImkHandle* handle) {
  return handle == nullptr ? nullptr : handle->tex_coords.data();
}

const uint32_t* imk_indices_ptr(const ImkHandle* handle) {
  return handle == nullptr ? nullptr : handle->indices.data();
}

int imk_delta_kind(const ImkHandle* handle) {
  return handle == nullptr ? -1 : static_cast<int>(handle->delta_kind);
}

int imk_delta_base_revision(const ImkHandle* handle) {
  return handle == nullptr ? -1 : static_cast<int>(handle->base_revision);
}

int imk_delta_revision(const ImkHandle* handle) {
  return handle == nullptr ? -1 : static_cast<int>(handle->revision);
}

int imk_delta_retained_vertex_count(const ImkHandle* handle) {
  return handle == nullptr
             ? -1
             : static_cast<int>(handle->retained_vertex_count);
}

int imk_delta_retained_triangle_count(const ImkHandle* handle) {
  return handle == nullptr
             ? -1
             : static_cast<int>(handle->retained_triangle_count);
}

int imk_delta_vertex_count(const ImkHandle* handle) {
  return handle == nullptr
             ? -1
             : static_cast<int>(handle->delta_positions.size() / 2);
}

int imk_delta_triangle_count(const ImkHandle* handle) {
  return handle == nullptr
             ? -1
             : static_cast<int>(handle->delta_indices.size() / 3);
}

const float* imk_delta_positions_ptr(const ImkHandle* handle) {
  return handle == nullptr ? nullptr : handle->delta_positions.data();
}

const float* imk_delta_tex_coords_ptr(const ImkHandle* handle) {
  return handle == nullptr ? nullptr : handle->delta_tex_coords.data();
}

const uint32_t* imk_delta_indices_ptr(const ImkHandle* handle) {
  return handle == nullptr ? nullptr : handle->delta_indices.data();
}

int imk_input_count(const ImkHandle* handle) {
  return handle == nullptr ? -1 : handle->input_count;
}

int imk_tracked_vector_bytes(const ImkHandle* handle) {
  return handle == nullptr ? -1 : TrackedVectorBytes(*handle);
}

}  // extern "C"
