// Copyright 2026 ToonSpectrum Studio.
//
// C bridge for google/ink brush-geometry (mesh) generation
// (ADR-0011 lane 3, V12 codex section 11.2 step 1: geometry/brush/stroke
// modules built to WASM; no Android mesh-rendering utilities).
//
// Compiled with emscripten against a directly-compiled subset of the
// upstream sources (ink/types, ink/color, ink/geometry, ink/brush,
// ink/strokes — tests/JNI/tessellator excluded, so no libtess2/Skia/proto).
//
// Contract:
// - imk_create/imk_destroy own the handle lifetime.
// - imk_generate is single-shot and deterministic: it feeds pre-modeled
//   points (stride 4 doubles: x, y, tSeconds, pressure; pressure < 0 means
//   "no pressure") through InProgressStroke with a PassthroughModel input
//   model (the points are already modeled by the ink-stroke-modeler lane,
//   so no second smoothing pass), then flattens the coat-0 MutableMesh.
// - Returns triangle count (>= 0) on success, or the negated
//   absl::StatusCode on failure (e.g. -3 = kInvalidArgument).
// - Outputs: positions (f32 x,y per vertex), surface-UV tex coords
//   (f32 u,v per vertex), triangle indices (u32 * 3 per triangle).

#include <array>
#include <cstddef>
#include <cstdint>
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

constexpr int kPointStride = 4;  // x, y, tSeconds, pressure

struct ImkHandle {
  InProgressStroke stroke;
  std::vector<float> positions;   // x, y per vertex
  std::vector<float> tex_coords;  // u, v per vertex (surface UV)
  std::vector<uint32_t> indices;  // 3 per triangle
};

int NegatedCode(const absl::Status& status) {
  return -static_cast<int>(status.code());
}

}  // namespace

extern "C" {

ImkHandle* imk_create() { return new (std::nothrow) ImkHandle(); }

void imk_destroy(ImkHandle* handle) { delete handle; }

int imk_point_stride() { return kPointStride; }

// Generates the stroke mesh for `point_count` pre-modeled input points.
// Returns the triangle count (>= 0) or the negated absl::StatusCode.
int imk_generate(ImkHandle* handle, const double* points, int point_count,
                 float brush_size, float brush_epsilon, float corner_rounding,
                 float pinch, float rotation_rad, float scale_x, float scale_y,
                 int pressure_to_size_enabled, float size_multiplier_min,
                 float size_multiplier_max) {
  if (handle == nullptr || points == nullptr || point_count <= 0) return -1;

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

  // Passthrough input model: the points were already modeled upstream by the
  // ink-stroke-modeler lane, so ink must not re-smooth them.
  absl::StatusOr<BrushFamily> family = BrushFamily::Create(
      tip, BrushPaint{}, BrushFamily::PassthroughModel{});
  if (!family.ok()) return NegatedCode(family.status());

  absl::StatusOr<Brush> brush =
      Brush::Create(*family, Color::Black(), brush_size, brush_epsilon);
  if (!brush.ok()) return NegatedCode(brush.status());

  StrokeInputBatch batch;
  const double t0 = points[2];
  for (int i = 0; i < point_count; ++i) {
    const double* p = points + static_cast<size_t>(i) * kPointStride;
    StrokeInput input;
    input.tool_type = StrokeInput::ToolType::kStylus;
    input.position = Point{static_cast<float>(p[0]), static_cast<float>(p[1])};
    input.elapsed_time = Duration32::Seconds(static_cast<float>(p[2] - t0));
    input.pressure = p[3] < 0 ? StrokeInput::kNoPressure
                              : static_cast<float>(p[3]);
    if (absl::Status status = batch.Append(input); !status.ok()) {
      return NegatedCode(status);
    }
  }

  InProgressStroke& stroke = handle->stroke;
  stroke.Start(*brush);  // noise_seed = 0: deterministic
  if (absl::Status status = stroke.EnqueueInputs(batch, StrokeInputBatch{});
      !status.ok()) {
    return NegatedCode(status);
  }
  stroke.FinishInputs();
  const Duration32 total =
      Duration32::Seconds(static_cast<float>(points[(point_count - 1) *
                                                    kPointStride + 2] - t0));
  if (absl::Status status = stroke.UpdateShape(total); !status.ok()) {
    return NegatedCode(status);
  }

  const MutableMesh& mesh = stroke.GetMesh(0);
  const uint32_t vertex_count = mesh.VertexCount();
  const uint32_t triangle_count = mesh.TriangleCount();
  handle->positions.clear();
  handle->tex_coords.clear();
  handle->indices.clear();
  handle->positions.reserve(vertex_count * 2);
  handle->tex_coords.reserve(vertex_count * 2);
  handle->indices.reserve(triangle_count * 3);
  for (uint32_t i = 0; i < vertex_count; ++i) {
    const Point position = mesh.VertexPosition(i);
    handle->positions.push_back(position.x);
    handle->positions.push_back(position.y);
    const Point uv = StrokeVertex::GetSurfaceUvFromMesh(mesh, i);
    handle->tex_coords.push_back(uv.x);
    handle->tex_coords.push_back(uv.y);
  }
  for (uint32_t i = 0; i < triangle_count; ++i) {
    const std::array<uint32_t, 3> triangle = mesh.TriangleIndices(i);
    handle->indices.push_back(triangle[0]);
    handle->indices.push_back(triangle[1]);
    handle->indices.push_back(triangle[2]);
  }
  return static_cast<int>(triangle_count);
}

int imk_vertex_count(const ImkHandle* handle) {
  return handle == nullptr ? -1
                           : static_cast<int>(handle->positions.size() / 2);
}

int imk_triangle_count(const ImkHandle* handle) {
  return handle == nullptr ? -1 : static_cast<int>(handle->indices.size() / 3);
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

}  // extern "C"
