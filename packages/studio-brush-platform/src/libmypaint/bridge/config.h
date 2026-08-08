/*
 * Minimal config.h for the ToonSpectrum emscripten build of libmypaint.
 *
 * ADR-0011 lane 11: libmypaint v1.6.1 (2768251dacce3939136c839aeca413f4aa4241d0)
 * is compiled directly with emcc instead of running autogen.sh/configure —
 * the autotools feature probe would only toggle gettext/glib/OpenMP/json-c,
 * all of which are deliberately OFF in this build:
 *
 * - HAVE_GETTEXT undefined  → mypaint-brush-settings.c falls back to identity
 *   macros; the dgettext(Domain, String) macro discards its Domain argument,
 *   so GETTEXT_PACKAGE never needs a definition.
 * - MYPAINT_CONFIG_USE_GLIB 0 → mypaint-glib-compat.h supplies gboolean etc.
 * - No _OPENMP             → single-threaded tile processing (wasm target).
 * - json-c                 → bypassed entirely; see json.h in this directory.
 */
#ifndef TOONSPECTRUM_LIBMYPAINT_CONFIG_H
#define TOONSPECTRUM_LIBMYPAINT_CONFIG_H

#define MYPAINT_CONFIG_USE_GLIB 0

/* Version reported by the bridge (source tag + short commit). */
#define TOONSPECTRUM_LIBMYPAINT_VERSION "libmypaint 1.6.1+2768251d (emcc)"

#endif /* TOONSPECTRUM_LIBMYPAINT_CONFIG_H */
