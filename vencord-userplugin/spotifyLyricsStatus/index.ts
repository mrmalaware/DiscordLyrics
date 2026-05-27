/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 mally
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

interface SpotifyArtist {
    name: string;
}

interface SpotifyAlbum {
    name: string;
}

interface SpotifyTrack {
    id: string | null;
    name: string;
    duration: number;
    album?: SpotifyAlbum;
    artists?: SpotifyArtist[];
}

interface SpotifyStateEvent {
    track: SpotifyTrack | null;
    isPlaying: boolean;
    position: number;
}

interface LyricLine {
    timeMs: number;
    text: string;
}

const Spotify = findByPropsLazy("getPlayerState", "getTrack");
const HTTP = findByPropsLazy("patch", "get", "post");

const TICK_MS = 1000;
const MAX_STATUS_LENGTH = 128;
const PAUSED_PREFIX = "\u23f8 Pause - ";
const NO_LYRICS_PREFIX = "\u266b ";

let interval: ReturnType<typeof setInterval> | undefined;
let lastStatus = "";
let lastTrackKey = "";
let lastTrack: NormalizedTrack | undefined;
let lyrics: LyricLine[] = [];
let fetchController: AbortController | undefined;
let spotifyState: SpotifyStateEvent | undefined;

interface NormalizedTrack {
    id: string;
    title: string;
    artist: string;
    album: string;
    durationMs: number;
    progressMs: number;
    isPlaying: boolean;
}

function cleanText(value: unknown) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function trimStatus(value: string) {
    const text = cleanText(value);
    return text.length <= MAX_STATUS_LENGTH
        ? text
        : `${text.slice(0, MAX_STATUS_LENGTH - 1).trim()}...`;
}

function getCurrentTrack(): NormalizedTrack | undefined {
    const track: SpotifyTrack | null = Spotify.getTrack?.() ?? spotifyState?.track ?? null;
    if (!track) return undefined;

    const playerState = Spotify.getPlayerState?.();
    const isPlaying = Boolean(playerState?.isPlaying ?? spotifyState?.isPlaying);
    const position = Number(playerState?.position ?? spotifyState?.position ?? 0);
    const artists = track.artists?.map(artist => artist.name).filter(Boolean).join(", ") ?? "";

    return {
        id: track.id ?? "",
        title: cleanText(track.name),
        artist: cleanText(artists),
        album: cleanText(track.album?.name),
        durationMs: Number(track.duration || 0),
        progressMs: Math.max(0, position),
        isPlaying
    };
}

function trackKey(track: NormalizedTrack) {
    return [
        track.id,
        track.title.toLowerCase(),
        track.artist.toLowerCase(),
        Math.round(track.durationMs / 1000)
    ].join("|");
}

function parseSyncedLyrics(raw: string): LyricLine[] {
    return raw
        .split(/\r?\n/)
        .map(line => {
            const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
            if (!match) return null;

            const minutes = Number(match[1]);
            const seconds = Number(match[2]);
            const fraction = match[3] || "0";
            const millis = Number(fraction.padEnd(3, "0").slice(0, 3));
            const text = cleanText(match[4]).replace(/\s*\[[^\]]+\]\s*/g, " ");

            return text ? { timeMs: minutes * 60000 + seconds * 1000 + millis, text } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a!.timeMs - b!.timeMs) as LyricLine[];
}

async function loadLyrics(track: NormalizedTrack) {
    fetchController?.abort();
    fetchController = new AbortController();

    const params = new URLSearchParams({
        track_name: track.title,
        artist_name: track.artist
    });

    if (track.album) params.set("album_name", track.album);
    if (track.durationMs) params.set("duration", String(Math.round(track.durationMs / 1000)));

    try {
        const response = await fetch(`https://lrclib.net/api/get?${params}`, {
            signal: fetchController.signal,
            headers: { Accept: "application/json" }
        });

        if (!response.ok) throw new Error(`LRCLIB returned ${response.status}`);

        const data = await response.json();
        lyrics = parseSyncedLyrics(data.syncedLyrics ?? data.synced_lyrics ?? "");
    } catch (error) {
        if ((error as Error).name !== "AbortError") {
            console.warn("[SpotifyLyricsStatus] Could not load synced lyrics", error);
            lyrics = [];
        }
    }
}

function lyricAt(progressMs: number) {
    if (!lyrics.length) return "";

    let low = 0;
    let high = lyrics.length - 1;
    let current = -1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lyrics[mid].timeMs <= progressMs) {
            current = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return current >= 0 ? lyrics[current].text : "";
}

function setCustomStatus(text: string) {
    const status = trimStatus(text);
    if (status === lastStatus) return;

    lastStatus = status;
    HTTP.patch({
        url: "/users/@me/settings",
        body: {
            custom_status: status
                ? { text: status, expires_at: null }
                : null
        }
    });
}

function tick() {
    const track = getCurrentTrack();

    if (!track) {
        if (lastTrack) setCustomStatus(`${PAUSED_PREFIX}${lastTrack.title}`);
        return;
    }

    lastTrack = track;

    if (!track.isPlaying) {
        setCustomStatus(`${PAUSED_PREFIX}${track.title}`);
        return;
    }

    const key = trackKey(track);
    if (key !== lastTrackKey) {
        lastTrackKey = key;
        lastStatus = "";
        lyrics = [];
        void loadLyrics(track);
    }

    setCustomStatus(lyricAt(track.progressMs) || `${NO_LYRICS_PREFIX}${track.title} - ${track.artist}`);
}

function onSpotifyPlayerState(event: SpotifyStateEvent) {
    spotifyState = event;
    tick();
}

export default definePlugin({
    name: "SpotifyLyricsStatus",
    description: "Sets your custom status to the current synced lyric from Spotify, or a pause status when paused.",
    authors: [{ name: "mally", id: 0n }],
    tags: ["Spotify", "Media"],

    start() {
        FluxDispatcher.subscribe("SPOTIFY_PLAYER_STATE", onSpotifyPlayerState);
        interval = setInterval(tick, TICK_MS);
        tick();
    },

    stop() {
        if (interval) clearInterval(interval);
        interval = undefined;
        FluxDispatcher.unsubscribe("SPOTIFY_PLAYER_STATE", onSpotifyPlayerState);
        fetchController?.abort();
        fetchController = undefined;
        spotifyState = undefined;
        lyrics = [];
        lastTrackKey = "";
        lastStatus = "";
    }
});

