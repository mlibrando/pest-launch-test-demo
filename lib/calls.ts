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

/** `original` holds the transcribed text when the intro correction changed it. */
export type Utterance = { i: number; speaker: string; startMs: number; endMs: number; text: string; original?: string };
export type Quote = { utterance: number; quote: string };

export const formatSeconds = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

export const CATEGORIES = ["SALES", "RETENTION", "SERVICE", "NOT_SCORABLE"] as const;
export type Category = (typeof CATEGORIES)[number];

export const OUTCOMES_BY_CATEGORY: Record<Category, string[]> = {
    SALES: ["BOOKED", "NOT_BOOKED"],
    RETENTION: ["SAVED", "LOST"],
    SERVICE: ["RESOLVED", "UNRESOLVED"],
    NOT_SCORABLE: [],
};

export function categoryForCallType(callType: string): Category {
    if (/sales/i.test(callType)) return "SALES";
    if (/retention/i.test(callType)) return "RETENTION";
    return "SERVICE";
}

export const ANALYSIS_FAILED_MESSAGE = "We're unable to provide analysis at this time. Please retry another time or consider uploading another call.";

export type Tier = "GOLD" | "GREEN" | "BELOW";
export type AnalysisProgress = { stage: "classifying" | "assessing"; attempt: number };
