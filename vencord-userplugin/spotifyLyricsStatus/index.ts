/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 mally
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { UserSettings } from "@api/UserSettings";
import { SpotifyStore } from "@plugins/spotifyControls/SpotifyStore";
import definePlugin, { OptionType, type PluginNative } from "@utils/types";
import type { Activity } from "@vencord/discord-types";
import { ActivityFlags, ActivityStatusDisplayType, ActivityType } from "@vencord/discord-types/enums";
import { ApplicationAssetUtils, Button, FluxDispatcher, React, showToast, Toasts, UserStore } from "@webpack/common";

const Native = VencordNative.pluginHelpers.SpotifyLyricsStatus as PluginNative<typeof import("./native")>;

const DEFAULT_SETTINGS = {
    lyricOffsetMs: 650,
    updateIntervalMs: 250,
    gapThresholdMs: 4000,
    maxStatusLength: 128,
    fontStyle: "normal",
    showWaitingDots: true,
    loadingText: "loading lyrics...",
    noLyricsText: "no synced lyrics",
    pausedPrefix: "Pause - ",
    usePlainLyricsFallback: false,
    enableRpc: true,
    rpcName: "Spotify",
    rpcShowWhenPaused: true,
    rpcShowAlbumArt: true
} as const;

type FontStyleId =
    | "normal"
    | "title"
    | "uppercase"
    | "lowercase"
    | "wide"
    | "fullwidth"
    | "mono"
    | "bold"
    | "italic"
    | "boldItalic"
    | "sans"
    | "sansItalic"
    | "sansBold"
    | "sansBoldItalic"
    | "serifBold"
    | "serifItalic"
    | "serifBoldItalic"
    | "script"
    | "scriptBold"
    | "fraktur"
    | "frakturBold"
    | "doubleStruck"
    | "smallCaps";

const FONT_OPTIONS: Array<{ label: string; value: FontStyleId; }> = [
    { label: "Normal", value: "normal" },
    { label: "Title Case", value: "title" },
    { label: "UPPERCASE", value: "uppercase" },
    { label: "Lowercase", value: "lowercase" },
    { label: "W i d e  S p a c i n g", value: "wide" },
    { label: "Ｆｕｌｌｗｉｄｔｈ", value: "fullwidth" },
    { label: "𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎", value: "mono" },
    { label: "𝐁𝐨𝐥𝐝", value: "bold" },
    { label: "𝐼𝑡𝑎𝑙𝑖𝑐", value: "italic" },
    { label: "𝑩𝒐𝒍𝒅 𝑰𝒕𝒂𝒍𝒊𝒄", value: "boldItalic" },
    { label: "𝖲𝖺𝗇𝗌", value: "sans" },
    { label: "𝘚𝘢𝘯𝘴 𝘐𝘵𝘢𝘭𝘪𝘤", value: "sansItalic" },
    { label: "𝗦𝗮𝗻𝘀 𝗕𝗼𝗹𝗱", value: "sansBold" },
    { label: "𝙎𝙖𝙣𝙨 𝘽𝙤𝙡𝙙 𝙄𝙩𝙖𝙡𝙞𝙘", value: "sansBoldItalic" },
    { label: "𝐒𝐞𝐫𝐢𝐟 𝐁𝐨𝐥𝐝", value: "serifBold" },
    { label: "𝑆𝑒𝑟𝑖𝑓 𝐼𝑡𝑎𝑙𝑖𝑐", value: "serifItalic" },
    { label: "𝑺𝒆𝒓𝒊𝒇 𝑩𝒐𝒍𝒅 𝑰𝒕𝒂𝒍𝒊𝒄", value: "serifBoldItalic" },
    { label: "𝓒𝓾𝓻𝓼𝓲𝓿𝓮", value: "script" },
    { label: "𝓒𝓾𝓻𝓼𝓲𝓿𝓮 𝓑𝓸𝓵𝓭", value: "scriptBold" },
    { label: "𝔉𝔯𝔞𝔨𝔱𝔲𝔯", value: "fraktur" },
    { label: "𝕱𝖗𝖆𝖐𝖙𝖚𝖗 𝕭𝖔𝖑𝖉", value: "frakturBold" },
    { label: "𝔻𝕠𝕦𝕓𝕝𝕖-𝕊𝕥𝕣𝕦𝕔𝕜", value: "doubleStruck" },
    { label: "ꜱᴍᴀʟʟ ᴄᴀᴘꜱ", value: "smallCaps" }
];

interface SpotifyArtist {
    name: string;
}

interface SpotifyAlbum {
    name: string;
    image?: {
        url?: string;
    };
    images?: Array<{
        url?: string;
    }>;
}

interface SpotifyShow {
    name?: string;
    publisher?: string;
    images?: Array<{
        url?: string;
    }>;
}

interface SpotifyTrack {
    id: string | null;
    name: string;
    duration: number;
    duration_ms?: number;
    type?: string;
    publisher?: string;
    description?: string;
    html_description?: string;
    images?: Array<{
        url?: string;
    }>;
    album?: SpotifyAlbum;
    artists?: SpotifyArtist[];
    show?: SpotifyShow;
}

interface SpotifyStateEvent {
    track: SpotifyTrack | null;
    isPlaying: boolean;
    position: number;
    receivedAt?: number;
}

interface NormalizedTrack {
    id: string;
    title: string;
    artist: string;
    album: string;
    albumImage: string;
    contentType: string;
    description: string;
    durationMs: number;
    progressMs: number;
    isPlaying: boolean;
}

interface LyricLine {
    timeMs: number;
    text: string;
}

interface ActiveLyricLine extends LyricLine {
    nextTimeMs?: number;
}

interface LrcLibResult {
    trackName?: string;
    artistName?: string;
    albumName?: string;
    duration?: number;
    plainLyrics?: string | null;
    syncedLyrics?: string | null;
    synced_lyrics?: string | null;
}

let interval: ReturnType<typeof setInterval> | undefined;
let spotifyState: SpotifyStateEvent | undefined;
let fetchController: AbortController | undefined;
let lyrics: LyricLine[] = [];
let lastTrackKey = "";
let loadingTrackKey = "";
let lastStatusText = "";
let lastRemoteStatusText: string | undefined;
let pendingRemoteStatusText = "";
let remoteStatusInFlight = false;
let remoteStatusTimer: ReturnType<typeof setTimeout> | undefined;
let nextRemoteStatusAt = 0;
let lastRpcKey = "";
let lastSpotifyPollAt = 0;
let spotifyPollInFlight = false;
let lastPlaybackPlaying: boolean | undefined;

const STATUS_SOCKET_ID = "SpotifyLyricsStatus";
const RPC_SOCKET_ID = "SpotifyLyricsStatusRpc";
const MIN_REMOTE_STATUS_INTERVAL_MS = 150;
const SPOTIFY_POLL_INTERVAL_MS = 1000;
const albumAssetCache = new Map<string, Promise<string | undefined>>();
const albumAssetResolved = new Map<string, string | undefined>();
const pluginAuthor = { name: "mally", id: 0n };

function updatePluginAuthor() {
    try {
        pluginAuthor.id = BigInt(UserStore.getCurrentUser()?.id ?? "0");
    } catch {
        pluginAuthor.id = 0n;
    }
}

function debugLog(message: string) {
    const promise = Native?.logDebug?.(message) as Promise<void> | undefined;
    void promise?.catch(() => void 0);
}

function logStatusUserSettings() {
    try {
        const statusSettings = Object.values(UserSettings ?? {})
            .filter(setting => setting?.userSettingsAPIGroup === "status")
            .map(setting => {
                let value: unknown;
                try {
                    value = setting.getSetting();
                } catch (error) {
                    value = stringifyError(error);
                }

                return {
                    name: setting.userSettingsAPIName,
                    value
                };
            });

        debugLog(`status user settings ${JSON.stringify(statusSettings)}`);
    } catch (error) {
        debugLog(`status user settings failed ${stringifyError(error)}`);
    }
}

function getStatusSetting(name: string) {
    return Object.values(UserSettings ?? {})
        .find(setting => setting?.userSettingsAPIGroup === "status" && setting.userSettingsAPIName === name);
}

function resetPluginDefaults() {
    Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
        (settings.store as Record<string, unknown>)[key] = value;
    });

    restartTimer();
    tick();
    showToast("Spotify Lyrics Status settings reset", Toasts.Type.SUCCESS);
}

const settings = definePluginSettings({
    fontStyle: {
        type: OptionType.SELECT,
        description: "Readable Discord-safe text style for lyric statuses.",
        options: FONT_OPTIONS.map(option => ({
            ...option,
            default: option.value === DEFAULT_SETTINGS.fontStyle
        }))
    },
    showWaitingDots: {
        type: OptionType.BOOLEAN,
        description: "Show dots during intros and long lyric gaps.",
        default: DEFAULT_SETTINGS.showWaitingDots
    },
    loadingText: {
        type: OptionType.STRING,
        description: "Text shown while lyrics load.",
        default: DEFAULT_SETTINGS.loadingText
    },
    noLyricsText: {
        type: OptionType.STRING,
        description: "Text shown when synced lyrics are not found.",
        default: DEFAULT_SETTINGS.noLyricsText
    },
    pausedPrefix: {
        type: OptionType.STRING,
        description: "Text before the song title while Spotify is paused.",
        default: DEFAULT_SETTINGS.pausedPrefix
    },
    usePlainLyricsFallback: {
        type: OptionType.BOOLEAN,
        description: "Use unsynced lyrics if synced lyrics are missing. This is less accurate.",
        default: DEFAULT_SETTINGS.usePlainLyricsFallback
    },
    enableRpc: {
        type: OptionType.BOOLEAN,
        description: "Show a Rich Presence card for the current Spotify song.",
        default: DEFAULT_SETTINGS.enableRpc
    },
    rpcName: {
        type: OptionType.STRING,
        description: "Rich Presence app name.",
        default: DEFAULT_SETTINGS.rpcName
    },
    rpcShowWhenPaused: {
        type: OptionType.BOOLEAN,
        description: "Keep the Rich Presence card visible while Spotify is paused.",
        default: DEFAULT_SETTINGS.rpcShowWhenPaused
    },
    rpcShowAlbumArt: {
        type: OptionType.BOOLEAN,
        description: "Show the song cover on Rich Presence.",
        default: DEFAULT_SETTINGS.rpcShowAlbumArt
    },
    resetToDefaults: {
        type: OptionType.COMPONENT,
        component: () => React.createElement(Button, {
            color: Button.Colors.RED,
            onClick: resetPluginDefaults
        }, "Reset Spotify Lyrics Status Defaults")
    }
});

function cleanText(value: unknown) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanDescription(value: unknown) {
    return cleanText(String(value ?? "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"));
}

function getStoredNumber(key: keyof typeof DEFAULT_SETTINGS, fallback: number) {
    const value = Number((settings.store as Record<string, unknown>)[key] ?? fallback);
    return Number.isFinite(value) ? value : fallback;
}

function truncateStatus(value: string) {
    const maxLength = Math.min(
        getStatusBubbleLimit(),
        Math.max(1, getStoredNumber("maxStatusLength", DEFAULT_SETTINGS.maxStatusLength))
    );
    const text = cleanText(value);
    return shortenToWords(text, maxLength);
}

function getStatusBubbleLimit() {
    switch (settings.store.fontStyle as FontStyleId) {
        case "wide":
        case "fullwidth":
            return 24;
        case "script":
        case "scriptBold":
        case "fraktur":
        case "frakturBold":
        case "doubleStruck":
        case "serifBoldItalic":
        case "sansBoldItalic":
            return 34;
        case "mono":
        case "bold":
        case "boldItalic":
        case "sansBold":
        case "serifBold":
            return 38;
        case "uppercase":
            return 42;
        case "smallCaps":
        case "italic":
        case "sans":
        case "sansItalic":
        case "serifItalic":
        case "title":
        case "lowercase":
        case "normal":
        default:
            return 46;
    }
}

function shortenToWords(text: string, maxLength: number) {
    const chars = [...text];
    if (chars.length <= maxLength) return text;

    const suffix = "...";
    const limit = Math.max(1, maxLength - suffix.length);
    const cut = chars.slice(0, limit).join("").trimEnd();
    const wordCut = cut.replace(/\s+\S*$/, "").trimEnd();
    const shortened = wordCut.length >= Math.floor(limit * 0.55) ? wordCut : cut;

    return `${shortened.replace(/[,.!?;:-]+$/, "")}${suffix}`;
}

const FONT_RANGES = {
    fullwidth: { upper: 0xff21, lower: 0xff41, digit: 0xff10 },
    mono: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 },
    bold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
    italic: { upper: 0x1d434, lower: 0x1d44e },
    boldItalic: { upper: 0x1d468, lower: 0x1d482 },
    sans: { upper: 0x1d5a0, lower: 0x1d5ba, digit: 0x1d7e2 },
    sansItalic: { upper: 0x1d608, lower: 0x1d622 },
    sansBold: { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec },
    sansBoldItalic: { upper: 0x1d63c, lower: 0x1d656 },
    serifBold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
    serifItalic: { upper: 0x1d434, lower: 0x1d44e },
    serifBoldItalic: { upper: 0x1d468, lower: 0x1d482 },
    script: { upper: 0x1d49c, lower: 0x1d4b6 },
    scriptBold: { upper: 0x1d4d0, lower: 0x1d4ea },
    fraktur: { upper: 0x1d504, lower: 0x1d51e },
    frakturBold: { upper: 0x1d56c, lower: 0x1d586 },
    doubleStruck: { upper: 0x1d538, lower: 0x1d552, digit: 0x1d7d8 }
} as const;

const FONT_EXCEPTIONS: Partial<Record<keyof typeof FONT_RANGES, Record<string, string>>> = {
    script: {
        B: "ℬ", E: "ℰ", F: "ℱ", H: "ℋ", I: "ℐ", L: "ℒ", M: "ℳ", R: "ℛ",
        e: "ℯ", g: "ℊ", o: "ℴ"
    },
    fraktur: {
        C: "ℭ", H: "ℌ", I: "ℑ", R: "ℜ", Z: "ℨ"
    },
    doubleStruck: {
        C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ"
    }
};

function styleAlphabet(value: string, style: keyof typeof FONT_RANGES) {
    const ranges = FONT_RANGES[style];
    const exceptions = FONT_EXCEPTIONS[style] ?? {};

    return [...value].map(char => {
        if (exceptions[char]) return exceptions[char];

        const code = char.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(ranges.upper + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(ranges.lower + code - 97);
        if ("digit" in ranges && code >= 48 && code <= 57) return String.fromCodePoint(ranges.digit + code - 48);
        if (style === "fullwidth" && char === " ") return " ";
        return char;
    }).join("");
}

function styleSmallCaps(value: string) {
    const letters: Record<string, string> = {
        a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ꜰ", g: "ɢ", h: "ʜ", i: "ɪ", j: "ᴊ",
        k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ", q: "ǫ", r: "ʀ", s: "ꜱ", t: "ᴛ",
        u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ"
    };

    return [...value.toLowerCase()].map(char => letters[char] ?? char).join("");
}

function applyFontStyle(value: string) {
    const text = cleanText(value);
    switch (settings.store.fontStyle as FontStyleId) {
        case "uppercase": return text.toUpperCase();
        case "lowercase": return text.toLowerCase();
        case "title": return text.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
        case "wide": return text.split("").join(" ");
        case "fullwidth": return styleAlphabet(text, "fullwidth");
        case "mono": return styleAlphabet(text, "mono");
        case "bold": return styleAlphabet(text, "bold");
        case "italic": return styleAlphabet(text, "italic");
        case "boldItalic": return styleAlphabet(text, "boldItalic");
        case "sans": return styleAlphabet(text, "sans");
        case "sansItalic": return styleAlphabet(text, "sansItalic");
        case "sansBold": return styleAlphabet(text, "sansBold");
        case "sansBoldItalic": return styleAlphabet(text, "sansBoldItalic");
        case "serifBold": return styleAlphabet(text, "serifBold");
        case "serifItalic": return styleAlphabet(text, "serifItalic");
        case "serifBoldItalic": return styleAlphabet(text, "serifBoldItalic");
        case "script": return styleAlphabet(text, "script");
        case "scriptBold": return styleAlphabet(text, "scriptBold");
        case "fraktur": return styleAlphabet(text, "fraktur");
        case "frakturBold": return styleAlphabet(text, "frakturBold");
        case "doubleStruck": return styleAlphabet(text, "doubleStruck");
        case "smallCaps": return styleSmallCaps(text);
        case "normal":
        default: return text;
    }
}

function formatStatus(value: string, styled = true) {
    return truncateStatus(styled ? applyFontStyle(value) : value);
}

function getTickMs() {
    return Math.max(150, getStoredNumber("updateIntervalMs", DEFAULT_SETTINGS.updateIntervalMs));
}

function restartTimer() {
    if (interval) clearInterval(interval);
    interval = setInterval(tick, getTickMs());
}

function getWaitingStatus() {
    return ".".repeat(Math.floor(Date.now() / 700) % 3 + 1);
}

function isWaitingStatus(status: string) {
    return /^\.{1,3}$/.test(status) || status === settings.store.loadingText || status === settings.store.noLyricsText;
}

function setProfileStatus(text: string) {
    const status = truncateStatus(text);
    const waitingStatus = isWaitingStatus(status);

    if (status === lastStatusText) return;
    lastStatusText = status;
    debugLog(`local status "${status}"`);

    if (waitingStatus) {
        clearPendingWaitingRemoteStatus();
    } else {
        setRemoteStatus(status, true);
    }

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: status ? {
            id: "custom",
            name: "Custom Status",
            state: status,
            type: ActivityType.CUSTOM_STATUS,
            flags: ActivityFlags.INSTANCE,
            created_at: Date.now()
        } satisfies Activity : null,
        socketId: STATUS_SOCKET_ID,
    });
}

function clearPendingWaitingRemoteStatus() {
    if (!isWaitingStatus(pendingRemoteStatusText)) return;

    pendingRemoteStatusText = lastRemoteStatusText ?? "";
    if (remoteStatusTimer) {
        clearTimeout(remoteStatusTimer);
        remoteStatusTimer = undefined;
    }
}

function setRemoteStatus(status: string, urgent = false) {
    pendingRemoteStatusText = status;
    scheduleRemoteStatusFlush(urgent);
}

function scheduleRemoteStatusFlush(urgent = false) {
    if (remoteStatusInFlight) return;

    if (urgent && remoteStatusTimer) {
        clearTimeout(remoteStatusTimer);
        remoteStatusTimer = undefined;
        nextRemoteStatusAt = 0;
    }

    if (remoteStatusTimer) return;

    const delay = Math.max(0, nextRemoteStatusAt - Date.now());
    if (urgent && delay === 0) {
        void flushRemoteStatus();
        return;
    }

    remoteStatusTimer = window.setTimeout(() => void flushRemoteStatus(), delay);
}

async function flushRemoteStatus() {
    if (remoteStatusInFlight) return;
    if (remoteStatusTimer) {
        clearTimeout(remoteStatusTimer);
        remoteStatusTimer = undefined;
    }

    const status = pendingRemoteStatusText;
    if (status === lastRemoteStatusText) return;

    remoteStatusInFlight = true;
    debugLog(`custom status update start "${status}"`);
    try {
        const customStatus = getStatusSetting("customStatus");
        if (!customStatus) throw new Error("status.customStatus setting was not found");

        await customStatus.updateSetting(status ? { text: status } : undefined);

        const expiresAtMs = getStatusSetting("statusExpiresAtMs");
        if (expiresAtMs) await expiresAtMs.updateSetting("0");

        const createdAtMs = getStatusSetting("statusCreatedAtMs");
        if (createdAtMs && status) await createdAtMs.updateSetting({ value: String(Date.now()) });

        lastRemoteStatusText = status;
        nextRemoteStatusAt = Date.now() + MIN_REMOTE_STATUS_INTERVAL_MS;
        debugLog(`custom status update ok "${status}"`);
    } catch (error) {
        nextRemoteStatusAt = Date.now() + getRetryAfterMs(error);
        debugLog(`custom status update failed "${status}" ${stringifyError(error)}`);
        console.warn("[SpotifyLyricsStatus] Discord rejected custom status update", error);
    } finally {
        remoteStatusInFlight = false;
        if (pendingRemoteStatusText !== lastRemoteStatusText) scheduleRemoteStatusFlush();
    }
}

function stringifyError(error: unknown) {
    if (error instanceof Error) return `${error.name}: ${error.message}`;

    const maybeError = error as { message?: unknown; status?: unknown; text?: unknown; body?: unknown; };
    if (maybeError?.message || maybeError?.status || maybeError?.text) {
        return `${String(maybeError.message ?? error)} status=${String(maybeError.status ?? "")} text=${String(maybeError.text ?? "")}`;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function getRetryAfterMs(error: unknown) {
    const maybeError = error as { retryAfter?: unknown; body?: { retry_after?: unknown; }; };
    const retryAfterSeconds = Number(maybeError.retryAfter ?? maybeError.body?.retry_after);
    return Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.ceil(retryAfterSeconds * 1000)
        : MIN_REMOTE_STATUS_INTERVAL_MS;
}

function clearRpc() {
    if (!lastRpcKey) return;
    lastRpcKey = "";
    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: null,
        socketId: RPC_SOCKET_ID,
    });
}

function getAlbumAsset(track: NormalizedTrack) {
    if (!settings.store.rpcShowAlbumArt || !track.albumImage) return undefined;
    if (albumAssetResolved.has(track.albumImage)) return albumAssetResolved.get(track.albumImage);

    if (!albumAssetCache.has(track.albumImage)) {
        albumAssetCache.set(track.albumImage, ApplicationAssetUtils.fetchAssetIds("0", [track.albumImage])
            .then(ids => {
                const asset = ids[0];
                albumAssetResolved.set(track.albumImage, asset);
                const current = getCurrentTrack();
                if (current && trackKey(current) === trackKey(track)) tick();
                return asset;
            })
            .catch(error => {
                console.warn("[SpotifyLyricsStatus] Could not fetch album art", error);
                albumAssetResolved.set(track.albumImage, undefined);
                return undefined;
            }));
    }

    return undefined;
}

function updateRpc(track: NormalizedTrack, paused = false) {
    if (!settings.store.enableRpc || (paused && !settings.store.rpcShowWhenPaused)) {
        clearRpc();
        return;
    }

    const largeImage = getAlbumAsset(track);
    const progressBucket = Math.floor(track.progressMs / 1000);
    const key = `${trackKey(track)}|${paused}|${largeImage ?? ""}|${progressBucket}`;
    if (key === lastRpcKey) return;
    lastRpcKey = key;

    const progress = Math.max(0, track.progressMs);
    const rpcName = settings.store.rpcName === "Spotify Lyrics"
        ? DEFAULT_SETTINGS.rpcName
        : settings.store.rpcName || DEFAULT_SETTINGS.rpcName;
    const activity: Activity = {
        application_id: "0",
        name: rpcName,
        details: paused ? `${settings.store.pausedPrefix}${track.title}` : track.title,
        state: getTrackSubtitle(track),
        type: ActivityType.LISTENING,
        timestamps: paused || !track.durationMs ? undefined : {
            start: Date.now() - progress,
            end: Date.now() - progress + track.durationMs
        },
        assets: largeImage ? {
            large_image: largeImage,
            large_text: track.album || track.title
        } : undefined,
        status_display_type: ActivityStatusDisplayType.DETAILS,
        flags: ActivityFlags.INSTANCE
    };

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity,
        socketId: RPC_SOCKET_ID,
    });
    debugLog(`rpc update ${paused ? "paused" : "playing"} "${track.title}" ${Math.round(track.progressMs)}ms`);
}

function getTrackSubtitle(track: NormalizedTrack) {
    if (track.album && track.artist) return `${track.artist} - ${track.album}`;
    return track.artist || track.album || spotifyContentLabel(track);
}

function getCurrentTrack(): NormalizedTrack | undefined {
    const stateAge = spotifyState?.receivedAt ? Date.now() - spotifyState.receivedAt : Number.POSITIVE_INFINITY;
    const useState = Boolean(spotifyState?.track && stateAge < 5000);
    const track: SpotifyTrack | null = useState ? spotifyState!.track : SpotifyStore.track ?? spotifyState?.track ?? null;
    if (!track) return undefined;

    const isPlaying = useState ? Boolean(spotifyState!.isPlaying) : Boolean(SpotifyStore.isPlaying);
    const rawPosition = useState
        ? Number(spotifyState!.position || 0) + (isPlaying ? Math.max(0, stateAge) : 0)
        : Number(SpotifyStore.position ?? 0);
    const position = rawPosition + getStoredNumber("lyricOffsetMs", DEFAULT_SETTINGS.lyricOffsetMs);
    const artists = track.artists?.map(artist => artist.name).filter(Boolean).join(", ") ?? "";
    const contentType = cleanText(track.type || (track.show ? "episode" : "track")).toLowerCase();
    const creator = artists || cleanText(track.show?.publisher || track.publisher);
    const collection = cleanText(track.album?.name || track.show?.name);
    const albumImage = cleanText(
        track.album?.image?.url
        || track.album?.images?.[0]?.url
        || track.show?.images?.[0]?.url
        || track.images?.[0]?.url
    );
    const description = cleanDescription(track.description || track.html_description);

    return {
        id: track.id ?? "",
        title: cleanText(track.name),
        artist: creator,
        album: collection,
        albumImage,
        contentType,
        description,
        durationMs: Number(track.duration || track.duration_ms || 0),
        progressMs: Math.max(0, position),
        isPlaying
    };
}

async function pollSpotifyPlayer(force = false) {
    const now = Date.now();
    if (spotifyPollInFlight || (!force && now - lastSpotifyPollAt < SPOTIFY_POLL_INTERVAL_MS)) return;

    const request = (SpotifyStore as unknown as {
        _req?: (method: "get", route: string) => Promise<{
            is_playing?: boolean;
            progress_ms?: number;
            item?: {
                id?: string;
                name?: string;
                duration_ms?: number;
                type?: string;
                publisher?: string;
                description?: string;
                html_description?: string;
                images?: Array<{ url?: string; height?: number; width?: number; }>;
                album?: {
                    name?: string;
                    images?: Array<{ url?: string; height?: number; width?: number; }>;
                };
                artists?: Array<{ name?: string; }>;
                show?: SpotifyShow;
            } | null;
        } | null>;
    })._req;

    if (!request) return;

    spotifyPollInFlight = true;
    lastSpotifyPollAt = now;

    try {
        const player = await request.call(SpotifyStore, "get", "/currently-playing");
        if (!player?.item) return;

        const image = player.item.album?.images?.[0];
        spotifyState = {
            track: {
                id: player.item.id ?? null,
                name: player.item.name ?? "",
                duration: Number(player.item.duration_ms || 0),
                duration_ms: Number(player.item.duration_ms || 0),
                type: player.item.type,
                publisher: player.item.publisher,
                description: player.item.description,
                html_description: player.item.html_description,
                album: {
                    name: player.item.album?.name ?? "",
                    image: image ? { url: image.url } : undefined,
                    images: player.item.album?.images
                },
                artists: player.item.artists?.map(artist => ({ name: artist.name ?? "" })) ?? [],
                show: player.item.show,
                images: player.item.images
            },
            isPlaying: Boolean(player.is_playing),
            position: Number(player.progress_ms || 0),
            receivedAt: Date.now()
        };

        debugLog(`spotify poll ${spotifyState.isPlaying ? "playing" : "paused"} "${spotifyState.track?.name ?? ""}" ${spotifyState.position}ms`);
        tick();
    } catch (error) {
        debugLog(`spotify poll failed ${stringifyError(error)}`);
    } finally {
        spotifyPollInFlight = false;
    }
}

function trackKey(track: NormalizedTrack) {
    return [
        track.contentType,
        track.id,
        track.title.toLowerCase(),
        track.artist.toLowerCase(),
        Math.round(track.durationMs / 1000)
    ].join("|");
}

function supportsSyncedLyrics(track: NormalizedTrack) {
    return !track.contentType || track.contentType === "track" || track.contentType === "song";
}

function spotifyContentLabel(track: NormalizedTrack) {
    switch (track.contentType) {
        case "episode": return "Podcast";
        case "show": return "Podcast";
        case "audiobook": return "Audiobook";
        case "chapter": return "Audiobook";
        default: return "Spotify";
    }
}

function nonSongStatus(track: NormalizedTrack) {
    if (track.description) {
        const chunks = splitLyricChunks(track.description);
        const chunkMs = Math.max(3500, Math.min(8000, Math.floor((track.durationMs || chunks.length * 5000) / chunks.length)));
        const index = Math.min(chunks.length - 1, Math.floor(track.progressMs / chunkMs));
        return formatStatus(chunks[index]);
    }

    const label = spotifyContentLabel(track);
    return track.artist ? `${label} - ${track.title}` : `${label} - ${track.title}`;
}

function parseSyncedLyrics(raw: string): LyricLine[] {
    return raw
        .split(/\r?\n/)
        .map(line => {
            const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
            if (!match) return null;

            const minutes = Number(match[1]);
            const seconds = Number(match[2]);
            const millis = Number((match[3] || "0").padEnd(3, "0").slice(0, 3));
            const text = cleanText(match[4]).replace(/\s*\[[^\]]+\]\s*/g, " ");
            return text ? { timeMs: minutes * 60000 + seconds * 1000 + millis, text } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a!.timeMs - b!.timeMs) as LyricLine[];
}

function parsePlainLyrics(raw: string, durationMs: number): LyricLine[] {
    const lines = raw.split(/\r?\n/).map(cleanText).filter(Boolean);
    if (!lines.length) return [];

    const usableDuration = Math.max(30000, durationMs || lines.length * 3500);
    const introMs = Math.min(16000, Math.max(8000, Math.round(usableDuration * 0.05)));
    const stepMs = Math.max(1800, Math.round((usableDuration - introMs) / lines.length));

    return lines.map((text, index) => ({
        timeMs: introMs + index * stepMs,
        text
    }));
}

async function nativeFetchJson<T>(url: string): Promise<{ status: number; data: T | null; }> {
    if (Native?.fetchJson) return await Native.fetchJson(url) as { status: number; data: T | null; };

    const response = await fetch(url, {
        signal: fetchController?.signal,
        headers: { Accept: "application/json" }
    });

    return {
        status: response.status,
        data: response.status === 404 ? null : await response.json()
    };
}

async function fetchLyrics(url: string): Promise<LrcLibResult | null> {
    const response = await nativeFetchJson<LrcLibResult>(url);
    if (response.status === 404) return null;
    if (response.status < 200 || response.status >= 300) throw new Error(`LRCLIB returned ${response.status}`);
    return response.data;
}

async function searchLyrics(track: NormalizedTrack): Promise<LrcLibResult | null> {
    const queries = [
        `${track.title} ${track.artist}`,
        `${stripFeatureText(track.title)} ${firstArtist(track.artist)}`,
        `${stripFeatureText(track.title)} ${track.artist}`
    ];

    for (const query of queries) {
        const params = new URLSearchParams({ q: query });
        const response = await nativeFetchJson<LrcLibResult[]>(`https://lrclib.net/api/search?${params}`);
        if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) continue;

        const match = response.data
            .filter(result => result.syncedLyrics || result.synced_lyrics || (settings.store.usePlainLyricsFallback && result.plainLyrics))
            .sort((a, b) => scoreLyricsResult(b, track) - scoreLyricsResult(a, track))[0];

        if (match) return match;
    }

    return null;
}

async function loadLyrics(track: NormalizedTrack) {
    fetchController?.abort();
    fetchController = new AbortController();

    const key = trackKey(track);
    const params = new URLSearchParams({
        track_name: track.title,
        artist_name: track.artist
    });

    if (track.album) params.set("album_name", track.album);
    if (track.durationMs) params.set("duration", String(Math.round(track.durationMs / 1000)));

    try {
        const exact = await fetchLyrics(`https://lrclib.net/api/get?${params}`);
        const exactSynced = parseSyncedLyrics(exact?.syncedLyrics ?? exact?.synced_lyrics ?? "");
        const found = exactSynced.length ? exact : await searchLyrics(track) ?? exact;
        const synced = exactSynced.length
            ? exactSynced
            : parseSyncedLyrics(found?.syncedLyrics ?? found?.synced_lyrics ?? "");
        const nextLyrics = synced.length || !settings.store.usePlainLyricsFallback
            ? synced
            : parsePlainLyrics(found?.plainLyrics ?? "", track.durationMs);

        if (loadingTrackKey !== key || key !== lastTrackKey) return;

        lyrics = nextLyrics;
        loadingTrackKey = "";
        tick();
    } catch (error) {
        if ((error as Error).name === "AbortError") return;
        console.warn("[SpotifyLyricsStatus] Could not load lyrics", error);
        if (loadingTrackKey === key && key === lastTrackKey) {
            lyrics = [];
            loadingTrackKey = "";
            tick();
        }
    }
}

function scoreLyricsResult(result: LrcLibResult, track: NormalizedTrack) {
    let score = 0;
    const resultTitle = cleanComparable(result.trackName);
    const resultArtist = cleanComparable(result.artistName);
    const resultAlbum = cleanComparable(result.albumName);
    const title = cleanComparable(track.title);
    const artist = cleanComparable(track.artist);
    const album = cleanComparable(track.album);

    if (resultTitle === title) score += 8;
    else if (resultTitle.includes(title) || title.includes(resultTitle)) score += 4;

    if (artist && resultArtist.includes(firstArtist(artist))) score += 4;
    if (album && resultAlbum === album) score += 2;

    if (track.durationMs && result.duration) {
        const diff = Math.abs(result.duration - Math.round(track.durationMs / 1000));
        if (diff <= 2) score += 4;
        else if (diff <= 8) score += 2;
    }

    return score;
}

function stripFeatureText(value: string) {
    return value
        .replace(/\s*[-(]\s*(feat\.?|ft\.?|with)\s+[^)\]-]+[)\]]?/ig, "")
        .replace(/\s*\([^)]*(remaster|sped up|slowed|nightcore|version)[^)]*\)/ig, "")
        .trim();
}

function firstArtist(value: string) {
    return cleanText(value).split(/,|&| x | feat\.?| ft\.?/i)[0]?.trim() ?? "";
}

function cleanComparable(value: unknown) {
    return stripFeatureText(cleanText(value))
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

function getLyricChunkLimit() {
    switch (settings.store.fontStyle as FontStyleId) {
        case "wide":
            return 13;
        case "fullwidth":
            return 20;
        default:
            return getStatusBubbleLimit();
    }
}

function splitLyricChunks(text: string) {
    const maxLength = Math.max(8, getLyricChunkLimit());
    const words = cleanText(text).split(" ").filter(Boolean);
    const chunks: string[] = [];
    let current = "";

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if ([...candidate].length <= maxLength) {
            current = candidate;
            continue;
        }

        if (current) chunks.push(current);

        if ([...word].length <= maxLength) {
            current = word;
            continue;
        }

        const letters = [...word];
        for (let index = 0; index < letters.length; index += maxLength) {
            chunks.push(letters.slice(index, index + maxLength).join(""));
        }
        current = "";
    }

    if (current) chunks.push(current);
    return chunks.length ? chunks : [cleanText(text)];
}

function chunkWeight(text: string) {
    return Math.max(1, [...cleanText(text)].filter(char => char !== " ").length);
}

function lyricPageForStatus(line: ActiveLyricLine, progressMs: number) {
    const chunks = splitLyricChunks(line.text);
    if (chunks.length <= 1) return formatStatus(chunks[0]);

    const lyricOffsetMs = Math.max(0, getStoredNumber("lyricOffsetMs", DEFAULT_SETTINGS.lyricOffsetMs));
    const lineDurationMs = Math.max(
        chunks.length * 1500,
        (line.nextTimeMs ?? line.timeMs + chunks.length * 2200) - line.timeMs
    );
    const elapsedMs = Math.max(0, progressMs - line.timeMs - lyricOffsetMs);
    const totalWeight = chunks.reduce((total, chunk) => total + chunkWeight(chunk), 0);

    let index = 0;
    let elapsedWeight = 0;

    for (let chunkIndex = 1; chunkIndex < chunks.length; chunkIndex++) {
        elapsedWeight += chunkWeight(chunks[chunkIndex - 1]);

        const sungThreshold = lineDurationMs * elapsedWeight / totalWeight;
        const readThreshold = chunkIndex * 1300;
        if (elapsedMs >= Math.max(sungThreshold, readThreshold)) {
            index = chunkIndex;
        }
    }

    return formatStatus(chunks[index]);
}

function lyricAt(progressMs: number): ActiveLyricLine | undefined {
    if (!lyrics.length) return undefined;

    if (progressMs < lyrics[0].timeMs) return undefined;

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

    if (current < 0) return undefined;

    const line = lyrics[current];
    const nextLine = lyrics[current + 1];
    const gapThresholdMs = Math.max(3000, getStoredNumber("gapThresholdMs", DEFAULT_SETTINGS.gapThresholdMs));

    if (settings.store.showWaitingDots && nextLine) {
        const gapMs = nextLine.timeMs - line.timeMs;
        if (gapMs >= gapThresholdMs) {
            const chunks = splitLyricChunks(line.text);
            const holdMs = Math.min(gapMs - 250, Math.max(2600, chunks.length * 900));
            if (progressMs >= line.timeMs + holdMs) return undefined;
        }
    }

    return {
        ...line,
        nextTimeMs: nextLine?.timeMs
    };
}

function tick() {
    void pollSpotifyPlayer();

    const track = getCurrentTrack();

    if (!track) {
        lastPlaybackPlaying = undefined;
        setProfileStatus("");
        clearRpc();
        return;
    }

    if (!track.isPlaying) {
        lastPlaybackPlaying = false;
        const pausedText = `${settings.store.pausedPrefix}${track.title}`;
        setProfileStatus(formatStatus(pausedText, false));
        updateRpc(track, true);
        return;
    }

    const resumedFromPause = lastPlaybackPlaying === false;
    lastPlaybackPlaying = true;

    const key = trackKey(track);
    if (key !== lastTrackKey) {
        lastTrackKey = key;
        lyrics = [];
        if (supportsSyncedLyrics(track)) {
            loadingTrackKey = key;
            void loadLyrics(track);
        } else {
            loadingTrackKey = "";
        }
    }

    updateRpc(track);

    if (!supportsSyncedLyrics(track)) {
        setProfileStatus(formatStatus(nonSongStatus(track)));
        return;
    }

    const lyric = lyricAt(track.progressMs);
    if (lyric) {
        setProfileStatus(lyricPageForStatus(lyric, track.progressMs));
        return;
    }

    if (settings.store.showWaitingDots) {
        if (resumedFromPause) {
            debugLog("play resumed before next lyric; clearing remote pause status");
            setRemoteStatus("", true);
        }
        setProfileStatus(getWaitingStatus());
    } else if (lastTrackKey === loadingTrackKey) {
        if (resumedFromPause) {
            debugLog("play resumed while loading lyrics; clearing remote pause status");
            setRemoteStatus("", true);
        }
        setProfileStatus(formatStatus(settings.store.loadingText, false));
    } else {
        if (resumedFromPause) {
            debugLog("play resumed with no lyric; clearing remote pause status");
            setRemoteStatus("", true);
        }
        setProfileStatus(formatStatus(settings.store.noLyricsText, false));
    }
}

function onSpotifyPlayerState(event: SpotifyStateEvent) {
    spotifyState = { ...event, receivedAt: Date.now() };
    debugLog(`spotify event ${event.isPlaying ? "playing" : "paused"} "${event.track?.name ?? ""}" ${event.position}ms`);
    tick();
}

updatePluginAuthor();

export default definePlugin({
    name: "SpotifyLyricsStatus",
    description: "Sets your profile status to synced Spotify lyrics and shows a Spotify song RPC.",
    authors: [pluginAuthor],
    tags: ["Spotify", "Media"],
    dependencies: ["SpotifyControls", "UserSettingsAPI"],
    settings,

    start() {
        updatePluginAuthor();
        FluxDispatcher.subscribe("SPOTIFY_PLAYER_STATE", onSpotifyPlayerState);
        restartTimer();
        logStatusUserSettings();
        setRemoteStatus("");
        void pollSpotifyPlayer(true);
        tick();
        showToast("SpotifyLyricsStatus started", Toasts.Type.SUCCESS);
    },

    stop() {
        if (interval) clearInterval(interval);
        if (remoteStatusTimer) clearTimeout(remoteStatusTimer);
        interval = undefined;
        remoteStatusTimer = undefined;
        FluxDispatcher.unsubscribe("SPOTIFY_PLAYER_STATE", onSpotifyPlayerState);
        fetchController?.abort();
        fetchController = undefined;
        spotifyState = undefined;
        lyrics = [];
        lastTrackKey = "";
        loadingTrackKey = "";
        lastPlaybackPlaying = undefined;
        setProfileStatus("");
        clearRpc();
    }
});
