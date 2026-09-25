# ToonSpectrum Mobile

`apps/mobile` owns the Capacitor Android and iOS wrapper for ToonStudio.
The application loads the reviewed ToonStudio web origin and keeps native project,
launch shell, icon resources, Capacitor configuration, and native permission checks
inside one workspace package.

## Commands

```sh
pnpm --filter @toonspectrum/mobile typecheck
pnpm --filter @toonspectrum/mobile verify:native-media
pnpm --filter @toonspectrum/mobile sync
pnpm --filter @toonspectrum/mobile doctor
pnpm --filter @toonspectrum/mobile android:build
pnpm --filter @toonspectrum/mobile ios:prepare
```

A build or sync is not a production deployment. Store signing, release upload,
production origin changes, and native permission changes require separate review.

## Ownership

```text
android/             Android native project
ios/                 iOS native project
shell/               minimal launch and offline web shell
resources/           source icons and splash inputs
capacitor.config.ts  mobile runtime and origin policy
scripts/             mobile-specific validation
```
