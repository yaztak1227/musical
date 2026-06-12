# Musical Fire TV

Thin Fire TV WebView wrapper for the Musical TV display route.

On normal launch, the app looks for a published Musical desktop server on the
same LAN by probing `http://<LAN-IP>:1422/api/app_status`. When it finds one, it
opens `http://<LAN-IP>:1422/tv` and stores that URL for the next launch.

## Build

Required local toolchain:

- Gradle 9.5.1 or newer
- Android Gradle Plugin 9.2.0
- Android SDK Platform 36
- Android SDK Build Tools 36.0.0

The local Android SDK is expected at:

```txt
/Users/takumi/Library/Android/sdk
```

If Android Studio or Gradle does not find it automatically, create `local.properties` from the example:

```bash
cp local.properties.example local.properties
```

```bash
cd apps/firetv
gradle :app:assembleDebug
```

APK output:

```txt
apps/firetv/app/build/outputs/apk/debug/app-debug.apk
```

## Install On Fire TV

Enable ADB debugging on Fire TV, then:

```bash
adb connect FIRE_TV_IP:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Launch

Start the Tauri desktop app on the desktop machine and enable LAN access.
The Fire TV app discovers the default local server port:

```bash
npm run tauri dev
```

For a forced development launch, pass the desktop TV URL:

```bash
adb shell am start \
  -n app.musical.firetv/.MainActivity \
  --es display_url "http://DESKTOP_LAN_IP:1422/tv"
```

For local playback testing, append an encoded `audioUrl` query parameter:

```bash
adb shell am start \
  -n app.musical.firetv/.MainActivity \
  --es display_url "http://DESKTOP_LAN_IP:1422/tv?audioUrl=ENCODED_AUDIO_STREAM_URL"
```

In the full handoff flow, the desktop app should provide `TvPlayerState.audioUrl` over the TV session protocol instead of relying on a query parameter.

For the current development machine this is usually:

```txt
http://192.168.1.82:1422/tv
```

The app also accepts the URL as a deep link:

```bash
adb shell am start \
  -a android.intent.action.VIEW \
  -d "musical-firetv://display?url=http%3A%2F%2FDESKTOP_LAN_IP%3A1420%2Ftv" \
  app.musical.firetv
```

## Configure Default URL At Build Time

```bash
gradle :app:assembleDebug -PtvDisplayUrl="http://DESKTOP_LAN_IP:1422/tv"
```

If no URL is provided by intent or build property, the app opens a built-in fallback URL.
