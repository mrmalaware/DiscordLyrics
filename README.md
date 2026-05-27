<p align="center">
  <img src="assets/banner.svg" alt="DiscordLyrics banner" width="100%">
</p>

# DiscordLyrics

DiscordLyrics turns Spotify playback into a live Discord custom status. When synced lyrics are available, your status follows the current line. When playback pauses, it shows the last song instead of going blank.

## Downloads

| Client | Download | Install |
|--------|----------|---------|
| BetterDiscord | [SpotifyLyricsStatus.plugin.js](https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/SpotifyLyricsStatus.plugin.js) | Drop the file into your BetterDiscord plugins folder. |
| Vencord | [vencord-spotifyLyricsStatus.zip](https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/vencord-spotifyLyricsStatus.zip) | Extract `spotifyLyricsStatus` into `Vencord/src/userplugins/`, then rebuild Vencord. |

Release downloads are attached under the latest GitHub release.

## Features

- Live synced lyric status from Spotify playback.
- Pause fallback using the last detected track.
- LRCLIB lyric lookup with synced lyric support.
- Rate-limit friendly status updates.
- Separate BetterDiscord and Vencord builds.

## BetterDiscord Setup

1. Download `SpotifyLyricsStatus.plugin.js`.
2. Move it into your BetterDiscord plugins folder.
3. Reload Discord with `Ctrl+R`.
4. Enable `SpotifyLyricsStatus`.
5. Make sure Spotify is connected to Discord and visible as your activity.

## Vencord Setup

1. Download `vencord-spotifyLyricsStatus.zip`.
2. Extract the `spotifyLyricsStatus` folder.
3. Copy it into:

   ```text
   Vencord/src/userplugins/spotifyLyricsStatus
   ```

4. From the Vencord source folder, rebuild:

   ```bash
   pnpm build
   ```

5. Reinstall or inject your custom Vencord build, restart Discord, then enable `SpotifyLyricsStatus`.

## Notes

- Some songs do not have synced lyrics in LRCLIB. Those fall back to `Song - Artist`.
- Discord custom statuses are short, so long lyric lines are trimmed.
- Keep Discord, Spotify, BetterDiscord, and Vencord updated for best compatibility.
