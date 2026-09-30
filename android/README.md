# ABS MOTS Android

**ABS MOTS** Android app for the ABS MOTs & Auto Repairs **admin desk only**. It opens the live admin login at https://www.absmotsauto.co.uk/admin.

Same workshop desk as the Windows and Mac apps. Sign in with the workshop email and password.

## Download

https://www.absmotsauto.co.uk/admin/download/android

Install the APK (not from Play Store):

1. Open the link on the phone.
2. If Android asks, allow Chrome (or Files) to install unknown apps.
3. Open **ABS-Workshop-Desk.apk** and tap Install.
4. Open **ABS MOTS** and sign in.

## Build

GitHub Actions builds the APK on each change under `android/` and publishes it with the Windows and Mac installers.

Locally, from this folder, with JDK 17 and the Android SDK:

```
gradle assembleRelease
```

The signed APK is `app/build/outputs/apk/release/app-release.apk`.
