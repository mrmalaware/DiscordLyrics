# Changelog

## 1.0.2

- Fixed source client selection so choosing Vencord can no longer fall back into an Equicord or Dorian source folder.
- Added a safer installer flow with auto-detect or manual client selection.
- Added fresh source download support when the selected client source folder is missing.
- Fixed installer behavior so failed builds and failed injections stop immediately instead of continuing with stale output.
- Fixed Discord reinstall flow to rebuild, inject, and relaunch Discord after installation.
- Improved Discord relaunch handling so launch errors do not falsely mark a completed install as failed.

## 1.0.0

- Added BetterDiscord plugin support.
- Added Vencord userplugin support.
- Added Spotify activity detection.
- Added synced lyric lookup through LRCLIB.
- Added release packaging for both supported clients.
