/**
 * @name SpotifyLyricsStatus
 * @author mally
 * @description Sets your Discord custom status to the current synced lyric from Spotify, or a pause status when playback stops.
 * @version 1.0.0
 * @source https://lrclib.net
 */

module.exports = class SpotifyLyricsStatus {
    constructor() {
        this.name = "SpotifyLyricsStatus";
        this.interval = null;
        this.lastStatus = null;
        this.lastTrackKey = null;
        this.pauseTrack = null;
        this.lyrics = [];
        this.lyricsSource = null;
        this.fetchController = null;
        this.statusCooldownUntil = 0;
        this.spotifyState = null;
        this.spotifyStateListener = null;

        this.config = {
            tickMs: 1000,
            statusMinMs: 1000,
            lyricLeadMs: 0,
            maxStatusLength: 128,
            pausedPrefix: "\u23f8 Pause - ",
            noLyricsPrefix: "\u266b ",
            clearWhenNoSong: false
        };
    }

    start() {
        this.findModules();
        this.subscribeSpotifyState();
        this.interval = setInterval(() => this.tick(), this.config.tickMs);
        this.tick();
        BdApi.showToast("Spotify Lyrics Status started", { type: "success" });
    }

    stop() {
        clearInterval(this.interval);
        this.interval = null;

        if (this.fetchController) this.fetchController.abort();
        this.fetchController = null;
        this.unsubscribeSpotifyState();

        this.lyrics = [];
        this.lastTrackKey = null;
        this.lastStatus = null;
        this.pauseTrack = null;
        this.spotifyState = null;

        if (this.config.clearWhenNoSong) this.setCustomStatus("");
        BdApi.showToast("Spotify Lyrics Status stopped", { type: "info" });
    }

    findModules() {
        const wp = BdApi.Webpack;
        this.PresenceStore = wp.getStore?.("PresenceStore")
            || wp.getModule(m => m?.getLocalPresence && m?.getState);

        this.UserStore = wp.getStore?.("UserStore")
            || wp.getModule(m => m?.getCurrentUser && m?.getUser);

        this.HTTP = wp.getModule(wp.Filters.byProps("patch", "get", "post"));
        this.FluxDispatcher = wp.getModule(wp.Filters.byProps("subscribe", "unsubscribe", "dispatch"));
    }

    subscribeSpotifyState() {
        if (!this.FluxDispatcher?.subscribe || this.spotifyStateListener) return;

        this.spotifyStateListener = event => {
            if (!event?.track) {
                this.spotifyState = null;
                return;
            }

            this.spotifyState = {
                track: event.track,
                isPlaying: Boolean(event.isPlaying),
                position: Number(event.position || 0),
                updatedAt: Date.now()
            };
        };

        this.FluxDispatcher.subscribe("SPOTIFY_PLAYER_STATE", this.spotifyStateListener);
    }

    unsubscribeSpotifyState() {
        if (!this.FluxDispatcher?.unsubscribe || !this.spotifyStateListener) return;
        this.FluxDispatcher.unsubscribe("SPOTIFY_PLAYER_STATE", this.spotifyStateListener);
        this.spotifyStateListener = null;
    }

    async tick() {
        try {
            const stateTrack = this.trackFromSpotifyState();
            if (stateTrack) {
                if (!stateTrack.isPlaying) {
                    this.pauseTrack = stateTrack;
                    await this.handlePausedOrIdle();
                    return;
                }

                await this.handlePlayingTrack(stateTrack);
                return;
            }

            const activity = this.getSpotifyActivity();

            if (!activity) {
                await this.handlePausedOrIdle();
                return;
            }

            const track = this.trackFromActivity(activity);
            if (!track?.title || !track?.artist) return;

            await this.handlePlayingTrack(track);
        } catch (error) {
            console.error("[SpotifyLyricsStatus]", error);
        }
    }

    async handlePlayingTrack(track) {
        this.pauseTrack = track;
        const trackKey = this.getTrackKey(track);

        if (trackKey !== this.lastTrackKey) {
            this.lastTrackKey = trackKey;
            this.lastStatus = null;
            this.lyrics = [];
            this.lyricsSource = null;
            this.loadLyrics(track);
        }

        const line = this.getCurrentLyric(track.progressMs);
        const status = line || `${this.config.noLyricsPrefix}${track.title} - ${track.artist}`;
        await this.setCustomStatus(status);
    }

    getSpotifyActivity() {
        const localPresence = this.PresenceStore?.getLocalPresence?.()
            || this.PresenceStore?.getState?.()?.localPresence;

        const activities = localPresence?.activities || [];
        return activities.find(activity => {
            const name = String(activity?.name || "").toLowerCase();
            return activity?.type === 2 || name === "spotify";
        });
    }

    trackFromSpotifyState() {
        if (!this.spotifyState?.track) return null;

        const { track, isPlaying, position, updatedAt } = this.spotifyState;
        const artist = Array.isArray(track.artists)
            ? track.artists.map(item => item?.name).filter(Boolean).join(", ")
            : "";
        const progressMs = position + (isPlaying ? Date.now() - updatedAt : 0) + this.config.lyricLeadMs;

        return {
            title: this.cleanText(track.name),
            artist: this.cleanText(artist),
            album: this.cleanText(track.album?.name),
            syncId: track.id || "",
            durationMs: Number(track.duration || 0),
            progressMs: Math.max(0, progressMs),
            isPlaying
        };
    }

    trackFromActivity(activity) {
        const title = activity.details || activity.name;
        const artist = activity.state || "";
        const album = activity.assets?.large_text || "";
        const syncId = activity.sync_id || activity.metadata?.spotify_id || "";
        const startedAt = activity.timestamps?.start || null;
        const endsAt = activity.timestamps?.end || null;
        const now = Date.now();
        const durationMs = startedAt && endsAt ? Math.max(0, endsAt - startedAt) : 0;
        const progressMs = startedAt ? Math.max(0, now - startedAt + this.config.lyricLeadMs) : 0;

        return {
            title: this.cleanText(title),
            artist: this.cleanText(artist),
            album: this.cleanText(album),
            syncId,
            durationMs,
            progressMs
        };
    }

    async handlePausedOrIdle() {
        this.lastTrackKey = null;
        this.lyrics = [];

        if (this.pauseTrack?.title) {
            await this.setCustomStatus(`${this.config.pausedPrefix}${this.pauseTrack.title}`);
            return;
        }

        if (this.config.clearWhenNoSong) await this.setCustomStatus("");
    }

    async loadLyrics(track) {
        if (this.fetchController) this.fetchController.abort();
        this.fetchController = new AbortController();

        const params = new URLSearchParams({
            track_name: track.title,
            artist_name: track.artist
        });

        if (track.album) params.set("album_name", track.album);
        if (track.durationMs) params.set("duration", String(Math.round(track.durationMs / 1000)));

        try {
            const response = await fetch(`https://lrclib.net/api/get?${params}`, {
                signal: this.fetchController.signal,
                headers: {
                    "Accept": "application/json"
                }
            });

            if (!response.ok) throw new Error(`LRCLIB returned ${response.status}`);

            const data = await response.json();
            this.lyricsSource = data;
            this.lyrics = this.parseSyncedLyrics(data.syncedLyrics || data.synced_lyrics || "");
        } catch (error) {
            if (error.name !== "AbortError") {
                console.warn("[SpotifyLyricsStatus] Could not load synced lyrics", error);
                this.lyrics = [];
            }
        }
    }

    parseSyncedLyrics(raw) {
        return raw
            .split(/\r?\n/)
            .map(line => {
                const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
                if (!match) return null;

                const minutes = Number(match[1]);
                const seconds = Number(match[2]);
                const fraction = match[3] || "0";
                const millis = Number(fraction.padEnd(3, "0").slice(0, 3));
                const text = this.cleanLyric(match[4]);

                return { timeMs: minutes * 60000 + seconds * 1000 + millis, text };
            })
            .filter(line => line && line.text)
            .sort((a, b) => a.timeMs - b.timeMs);
    }

    getCurrentLyric(progressMs) {
        if (!this.lyrics.length) return "";

        let low = 0;
        let high = this.lyrics.length - 1;
        let current = -1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (this.lyrics[mid].timeMs <= progressMs) {
                current = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return current >= 0 ? this.lyrics[current].text : "";
    }

    async setCustomStatus(text) {
        const status = this.trimStatus(text);
        const now = Date.now();

        if (status === this.lastStatus || now < this.statusCooldownUntil) return;

        this.statusCooldownUntil = now + this.config.statusMinMs;
        this.lastStatus = status;

        const customStatus = status
            ? { text: status, expires_at: null }
            : null;

        const body = { custom_status: customStatus };

        if (this.HTTP?.patch) {
            await this.HTTP.patch({
                url: "/users/@me/settings",
                body
            });
            return;
        }

        throw new Error("Could not find Discord HTTP module.");
    }

    getTrackKey(track) {
        return [
            track.syncId,
            track.title.toLowerCase(),
            track.artist.toLowerCase(),
            Math.round((track.durationMs || 0) / 1000)
        ].join("|");
    }

    cleanLyric(value) {
        const text = this.cleanText(value)
            .replace(/\s*\[[^\]]+\]\s*/g, " ")
            .replace(/\s*\([^)]+instrumental[^)]*\)\s*/ig, " ");

        return text || "\u266a";
    }

    cleanText(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    trimStatus(value) {
        const text = this.cleanText(value);
        if (text.length <= this.config.maxStatusLength) return text;
        return `${text.slice(0, this.config.maxStatusLength - 1).trim()}...`;
    }
};

