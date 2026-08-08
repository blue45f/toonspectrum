/*
 * json-c bypass for the ToonSpectrum emscripten build of libmypaint v1.6.1.
 *
 * mypaint-brush.c hard-includes <json.h> and uses json-c for exactly two
 * things: (1) an empty json_object owned by every MyPaintBrush, and (2)
 * mypaint_brush_from_string(), the .myb JSON parser. ADR-0011 lane 11
 * deliberately ships WITHOUT the JSON parser: `.myb` parsing already lives in
 * TypeScript (packages/studio-format-gateway/src/myb.ts) and the bridge
 * programs brushes exclusively through the injection API
 * (mypaint_brush_set_base_value / set_mapping_n / set_mapping_point), so
 * compiling json-c into the wasm would be dead weight.
 *
 * Honesty contract: json_tokener_parse always returns NULL here, which makes
 * mypaint_brush_from_string() return FALSE (its documented failure path — no
 * undefined behavior, no crash). The bridge does not export from_string; if a
 * future consumer needs it, link real json-c instead of widening these stubs.
 */
#ifndef TOONSPECTRUM_JSON_C_BYPASS_H
#define TOONSPECTRUM_JSON_C_BYPASS_H

#include <stdlib.h>

/* mypaint-brush.c gates its obj_get() compat wrapper on this. */
#define JSON_C_MAJOR_VERSION 0
#define JSON_C_MINOR_VERSION 99

typedef struct json_object json_object;

typedef enum {
  json_type_null,
  json_type_boolean,
  json_type_double,
  json_type_int,
  json_type_object,
  json_type_array,
  json_type_string
} json_type;

/* The one live allocation: MyPaintBrush owns an (empty) brush_json object. */
static inline json_object *json_object_new_object(void) {
  return (json_object *)calloc(1, sizeof(char));
}

static inline int json_object_put(json_object *obj) {
  free(obj);
  return 1;
}

/* Parser disabled by design: from_string() takes its FALSE branch. */
static inline json_object *json_tokener_parse(const char *string) {
  (void)string;
  return NULL;
}

static inline int json_object_is_type(const json_object *obj, json_type type) {
  (void)obj;
  (void)type;
  return 0;
}

static inline int json_object_object_get_ex(const json_object *obj,
                                            const char *key,
                                            json_object **value) {
  (void)obj;
  (void)key;
  if (value != NULL) {
    *value = NULL;
  }
  return 0;
}

static inline json_object *json_object_object_get(const json_object *obj,
                                                  const char *key) {
  (void)obj;
  (void)key;
  return NULL;
}

static inline double json_object_get_double(const json_object *obj) {
  (void)obj;
  return 0.0;
}

static inline int json_object_get_int(const json_object *obj) {
  (void)obj;
  return 0;
}

static inline int json_object_array_length(const json_object *obj) {
  (void)obj;
  return 0;
}

static inline json_object *json_object_array_get_idx(const json_object *obj,
                                                     int index) {
  (void)obj;
  (void)index;
  return NULL;
}

/*
 * Zero-iteration foreach: declares the loop variables the caller's body
 * expects, but both conditions are immediately false so the body (which would
 * need real json data) never runs.
 */
#define json_object_object_foreach(obj, key, val)                              \
  for (char *key = ((void)(obj), (char *)0); key != (char *)0;)                \
    for (json_object *val = (json_object *)0; val != (json_object *)0;)

#endif /* TOONSPECTRUM_JSON_C_BYPASS_H */
