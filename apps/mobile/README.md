# ToonStudio Mobile

`apps/mobile`은 ToonStudio의 Capacitor Android/iOS wrapper를 소유한다. 검토된 Web origin을 로드하며
native project, launch/offline shell, icon·splash source, Capacitor 설정과 권한 검사를 한 workspace에 둔다.

## 명령

```sh
pnpm --filter @toonstudio/mobile typecheck
pnpm --filter @toonstudio/mobile verify:native-media
pnpm --filter @toonstudio/mobile sync
pnpm --filter @toonstudio/mobile doctor
pnpm --filter @toonstudio/mobile android:build
pnpm --filter @toonstudio/mobile ios:prepare
```

빌드·sync는 운영 배포가 아니다. Store signing, release upload, 운영 origin과 native permission 변경은
별도 검토가 필요하다.

## 소유권

```text
android/             Android native project
ios/                 iOS native project
shell/               최소 launch·offline Web shell
resources/           icon·splash 원본
capacitor.config.ts  mobile runtime과 origin 정책
scripts/             mobile 전용 검증
```
