# Admin Web platform

Technical adapters for the administrator application live here. `http/` owns the common
request transport; future authentication, telemetry, environment and browser adapters may
be added when real code exists.

Platform code may support domains but must not contain administrator business rules or
import `src/domains`.
