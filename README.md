# ABS Workshop Desk

The ABS MOTs & Auto Repairs admin desk as an app. It opens
https://www.absmotsauto.co.uk/admin in its own window; staff sign in with their
workshop email and password.

| App | Download |
| --- | --- |
| Windows | https://www.absmotsauto.co.uk/admin/download/windows |
| Android | https://www.absmotsauto.co.uk/admin/download/android |

Every build is installed, opened and checked before it is published: Windows on
a Windows machine (`.github/workflows/windows.yml`), Android on an Android
emulator (`.github/workflows/android.yml`). The Android signing key is held in
the repository's encrypted secrets, never in the code.
