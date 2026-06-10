# Release signing (Google Play)

Release builds (AAB/APK) are signed with a dedicated **upload keystore**, not the
Android debug keystore.

## Where things live

| What | Location | In git? |
|---|---|---|
| Upload keystore (`.jks`) | `Desktop/Teardrop-Release-Keystore/teardrop-upload.jks` | ❌ never |
| Password + full details | `Desktop/Teardrop-Release-Keystore/KEYSTORE-CREDENTIALS.txt` | ❌ never |
| Gradle credentials | `android/keystore.properties` | ❌ gitignored |
| Signing wiring | `android/app/build.gradle` | ❌ (the whole `android/` folder is gitignored) |

> ⚠️ The keystore file and its password are **secrets** and are deliberately kept
> out of this repository. Keep a backup (password manager / cloud / USB). With
> Play App Signing the upload key can be reset via Play Console support if lost —
> but back it up anyway.

## Key details

- **Alias:** `teardrop-upload`
- **Type:** PKCS12, RSA 2048, valid ~27 years (until 2053)
- **SHA-1:** `8C:03:4B:9D:6D:FA:68:2F:D5:39:0F:37:6A:41:D2:C9:F9:08:08:B9`
- **SHA-256:** `3B:C5:CE:F9:10:19:63:92:CE:26:F6:35:0B:B7:5B:F6:BE:36:80:2D:43:8B:0E:3A:85:C5:26:9E:30:38:65:09`

(Fingerprints are not secret — they are used to register the app in Google Cloud
/ Firebase. The password is **not** stored here.)

## How gradle picks it up

`android/app/build.gradle` loads `android/keystore.properties`:

```properties
storeFile=.../teardrop-upload.jks
storePassword=...
keyAlias=teardrop-upload
keyPassword=...
```

If that file is absent (a fresh checkout without the keystore), release builds
fall back to debug signing so local dev still works.

## Build commands

From `android/`, with `JAVA_HOME` pointing at a JDK 17+ (e.g. the Android Studio
JBR):

- **AAB for Play Store:** `./gradlew bundleRelease`
  → `app/build/outputs/bundle/release/app-release.aab`
- **APK for sideload testing:** `./gradlew assembleRelease`
  → `app/build/outputs/apk/release/app-release.apk`

## ⚠️ Google Sign-In + Play App Signing

With Play App Signing (the default), Google **re-signs** the app with their own
key. After the first upload, copy the **app signing** SHA-1 from
*Play Console → Test and release → App integrity → App signing* and add it (plus
the upload SHA-1 above) to your Google Cloud OAuth client / Firebase — otherwise
Google login fails for Play Store installs.

## If you ever re-run `expo prebuild`

That regenerates `android/` and wipes the signing wiring. Re-add the
`keystore.properties` loading + `signingConfigs.release` block to
`android/app/build.gradle`, or move signing into an Expo config plugin / EAS
credentials.
