# Repository tools

`tools/` contains non-production utilities used to create, inspect, package, or
automate product assets and workflows. Product applications must not import tool
source at runtime.

```text
automation/   external workflow definitions and operational automation
media/        deterministic media and film authoring tools
blender/      Blender extension and asset pipeline utilities
toonbridge/   local DCC bridge and command adapters
```

Executable product applications belong under `apps/`; cross-application tests
and benchmarks belong under `tests/`.
