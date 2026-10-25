export const CALL_BUCKET = "call-recordings";
export const PLAYBACK_URL_TTL_SEC = 60 * 60;

export const AUDIO_MIME_BY_EXT: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    webm: "audio/webm",
    flac: "audio/flac",
};

export const fileExt = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export type Utterance = { i: number; speaker: string; startMs: number; endMs: number; text: string };

export const formatSeconds = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
