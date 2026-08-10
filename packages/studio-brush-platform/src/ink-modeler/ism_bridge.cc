// Copyright 2026 ToonSpectrum Studio.
//
// C bridge for google/ink-stroke-modeler (ADR-0009 / ADR-0011 lane 3 PoC).
// Compiled with emscripten against the upstream static archives; exposes a
// minimal handle-based extern "C" surface so the wasm module can be driven
// from TypeScript without C++ name mangling or absl types at the boundary.
//
// Contract:
// - ism_create/ism_destroy own the StrokeModeler lifetime.
// - ism_reset applies StrokeModelParams (0 on success, absl StatusCode else).
// - ism_update feeds one raw input (down/move/up) and flattens the appended
//   Results into a double buffer (stride ism_result_stride()):
//   [x, y, tSeconds, pressure, vx, vy] per modeled point.
// - Prediction is intentionally not exposed: the PoC contract is "no
//   predicted extension" so outputs stay replayable/deterministic.

#include <cstddef>
#include <new>
#include <vector>

#include "absl/status/status.h"
#include "ink_stroke_modeler/params.h"
#include "ink_stroke_modeler/stroke_modeler.h"
#include "ink_stroke_modeler/types.h"

namespace {

using ::ink::stroke_model::DisabledPredictorParams;
using ::ink::stroke_model::Duration;
using ::ink::stroke_model::Input;
using ::ink::stroke_model::Result;
using ::ink::stroke_model::StrokeEndPredictorParams;
using ::ink::stroke_model::StrokeModeler;
using ::ink::stroke_model::StrokeModelParams;
using ::ink::stroke_model::Time;

constexpr int kResultStride = 6;  // x, y, tSeconds, pressure, vx, vy

struct IsmHandle {
  StrokeModeler modeler;
  std::vector<Result> scratch;
  std::vector<double> out;
};

}  // namespace

extern "C" {

IsmHandle* ism_create() { return new (std::nothrow) IsmHandle(); }

void ism_destroy(IsmHandle* handle) { delete handle; }

int ism_result_stride() { return kResultStride; }

// Returns 0 on success; otherwise the raw absl::StatusCode value of the
// parameter-validation failure (e.g. 3 = kInvalidArgument).
int ism_reset(IsmHandle* handle, double min_output_rate,
              double end_of_stroke_stopping_distance, int wobble_enabled,
              double wobble_timeout_seconds, double wobble_speed_floor,
              double wobble_speed_ceiling, double spring_mass_constant,
              double drag_constant, int prediction_enabled) {
  if (handle == nullptr) return -1;
  StrokeModelParams params{
      .wobble_smoother_params{
          .is_enabled = wobble_enabled != 0,
          .timeout = Duration(wobble_timeout_seconds),
          .speed_floor = static_cast<float>(wobble_speed_floor),
          .speed_ceiling = static_cast<float>(wobble_speed_ceiling)},
      .position_modeler_params{
          .spring_mass_constant = static_cast<float>(spring_mass_constant),
          .drag_constant = static_cast<float>(drag_constant),
          // Mirror upstream stroke_modeler_test.cc kDefaultParams: disabled,
          // with an explicitly valid sampling window.
          .loop_contraction_mitigation_params =
              {.is_enabled = false,
               .speed_lower_bound = -1,
               .speed_upper_bound = -1,
               .interpolation_strength_at_speed_lower_bound = -1,
               .interpolation_strength_at_speed_upper_bound = -1,
               .min_speed_sampling_window = Duration(0)}},
      .sampling_params{.min_output_rate = min_output_rate,
                       .end_of_stroke_stopping_distance =
                           static_cast<float>(end_of_stroke_stopping_distance),
                       .end_of_stroke_max_iterations = 20},
      .stylus_state_modeler_params{.use_stroke_normal_projection = false},
  };
  if (prediction_enabled != 0) {
    params.prediction_params = StrokeEndPredictorParams{};
  } else {
    params.prediction_params = DisabledPredictorParams{};
  }
  const absl::Status status = handle->modeler.Reset(params);
  return status.ok() ? 0 : static_cast<int>(status.code());
}

// event_type: 0 = down, 1 = move, 2 = up. Returns the number of modeled
// results appended for this input (>= 0), or the negated absl::StatusCode
// on malformed input (e.g. -3 = kInvalidArgument, decreasing time).
int ism_update(IsmHandle* handle, int event_type, double x, double y,
               double t_seconds, double pressure) {
  if (handle == nullptr) return -1;
  const Input input{
      .event_type = event_type == 0   ? Input::EventType::kDown
                    : event_type == 2 ? Input::EventType::kUp
                                      : Input::EventType::kMove,
      .position = {static_cast<float>(x), static_cast<float>(y)},
      .time = Time(t_seconds),
      .pressure = static_cast<float>(pressure),
  };
  handle->scratch.clear();
  const absl::Status status = handle->modeler.Update(input, handle->scratch);
  if (!status.ok()) return -static_cast<int>(status.code());
  handle->out.clear();
  handle->out.reserve(handle->scratch.size() * kResultStride);
  for (const Result& result : handle->scratch) {
    handle->out.push_back(result.position.x);
    handle->out.push_back(result.position.y);
    handle->out.push_back(result.time.Value());
    handle->out.push_back(result.pressure);
    handle->out.push_back(result.velocity.x);
    handle->out.push_back(result.velocity.y);
  }
  return static_cast<int>(handle->scratch.size());
}

// Pointer (byte offset into wasm linear memory) of the flattened doubles
// written by the most recent successful ism_update on this handle.
const double* ism_results_ptr(const IsmHandle* handle) {
  return handle == nullptr ? nullptr : handle->out.data();
}

}  // extern "C"
