"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Edit05 } from "@untitledui/icons";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Key } from "react-aria-components";
import { assignCallRep, getCallAnalysis, getCallAudioUrl, getCallTranscript, updateUtterance } from "@/app/actions/calls";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { SlideoutPanel } from "@/components/application/slideout-panel/slideout-panel";
import { Tabs } from "@/components/application/tabs/tabs";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { formatSeconds, PLAYBACK_URL_TTL_SEC, type Utterance } from "@/lib/calls";
import { cx } from "@/utils/cx";
import { CallAnalysisSection } from "./call-analysis";
import { DeleteCallButton, ReanalyzeButton, RetryButton, StatusBadge, type CallRow } from "./call-status";

// Refresh the signed URL a little before it expires.
const AUDIO_STALE_MS = PLAYBACK_URL_TTL_SEC * 1000 * 0.9;

const FIELD_CLASS =
    "w-full rounded-lg bg-primary px-3 py-2 text-sm text-primary shadow-xs ring-1 ring-primary outline-none ring-inset focus:ring-2 focus:ring-brand";

const NEW_REP = "__new";
const UNASSIGNED = "__none";

interface CallDetailPanelProps {
    call: CallRow;
    repNames: string[];
    hasActiveRubric: boolean;
    onClose: () => void;
}

export function CallDetailPanel({ call, repNames, hasActiveRubric, onClose }: CallDetailPanelProps) {
    const queryClient = useQueryClient();
    const [currentMs, setCurrentMs] = useState(0);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [tab, setTab] = useState<Key>(call.status === "DONE" ? "analysis" : "transcript");
    const audioRef = useRef<HTMLAudioElement>(null);
    const activeRef = useRef<HTMLDivElement>(null);

    // Separate from the transcript so a status change refetches only the transcript and playback isn't interrupted.
    const audio = useQuery({
        queryKey: ["call-audio", call.id],
        queryFn: async () => {
            const result = await getCallAudioUrl(call.id);
            if (!result.audioUrl) throw new Error(result.error);
            return result.audioUrl;
        },
        staleTime: AUDIO_STALE_MS,
        gcTime: AUDIO_STALE_MS,
    });

    // Keyed by status so the transcript is fetched again once transcription finishes. Otherwise it only changes through our own edits.
    const transcriptKey = ["call-transcript", call.id, call.status];
    const transcriptQuery = useQuery({
        queryKey: transcriptKey,
        queryFn: () => getCallTranscript(call.id),
        staleTime: Infinity,
        gcTime: Infinity,
        placeholderData: keepPreviousData,
    });

    const analysisQuery = useQuery({
        queryKey: ["call-analysis", call.id],
        queryFn: () => getCallAnalysis(call.id),
        enabled: call.status === "DONE",
        staleTime: Infinity,
        gcTime: Infinity,
    });

    // A re-analysis replaces the results, so drop the cached ones as soon as the call leaves DONE.
    useEffect(() => {
        if (call.status !== "DONE") queryClient.removeQueries({ queryKey: ["call-analysis", call.id] });
    }, [call.id, call.status, queryClient]);

    const isLoading = audio.isPending || transcriptQuery.isPending || analysisQuery.isLoading;
    const transcript = transcriptQuery.data;
    const activeIndex = transcript?.findLastIndex((u) => u.startMs <= currentMs) ?? -1;

    useEffect(() => {
        activeRef.current?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, tab]);

    const seek = (utteranceIndex: number) => {
        const u = transcript?.[utteranceIndex];
        if (!audioRef.current || !u) return;
        audioRef.current.currentTime = u.startMs / 1000;
        audioRef.current.play();
    };

    const saveLine = (index: number, text: string) => {
        queryClient.setQueryData<Utterance[] | null>(transcriptKey, (prev) => prev?.map((u, i) => (i === index ? { ...u, text } : u)));
        setEditingIndex(null);
    };

    return (
        <SlideoutPanel
            isOpen
            onClose={onClose}
            title={call.originalName}
            description={
                <p className="flex flex-wrap items-center gap-2 text-sm text-tertiary">
                    <StatusBadge status={call.status} attempt={call.analysisProgress?.attempt} />
                    {call.durationSec ? <span>{formatSeconds(call.durationSec)}</span> : null}
                    <span>Uploaded {call.createdAt.toLocaleString()}</span>
                </p>
            }
            footer={
                <>
                    <div className="ml-auto">
                        <DeleteCallButton call={call} />
                    </div>
                    {call.status === "FAILED" && call.failedStage !== "analyze" && <RetryButton callId={call.id} />}
                    {call.status === "DONE" && <ReanalyzeButton callId={call.id} />}
                </>
            }
        >
            {call.status === "FAILED" && call.failedStage !== "analyze" && (
                <p className="rounded-lg bg-error-primary p-4 text-sm text-error-primary">{call.errorDetail}</p>
            )}

            <RepField call={call} repNames={repNames} />

            {isLoading ? (
                <LoadingIndicator label="Loading call…" className="py-3 text-sm text-tertiary" />
            ) : (
                <>
                    {audio.isError ? (
                        <p className="text-sm text-error-primary">{audio.error.message}</p>
                    ) : (
                        // The negative margin and padding cancel out, but cover the body's top padding once pinned. z-20 clears the tabs' z-10.
                        <div className="sticky top-0 z-20 -mt-5 bg-primary pt-5 pb-2">
                            <audio
                                ref={audioRef}
                                src={audio.data}
                                controls
                                className="w-full"
                                onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
                            />
                        </div>
                    )}

                    <Tabs selectedKey={tab} onSelectionChange={setTab} className="gap-5">
                        <Tabs.List type="underline" fullWidth>
                            <Tabs.Item id="analysis" label="Analysis" />
                            <Tabs.Item id="transcript" label="Transcript" />
                        </Tabs.List>
                        <Tabs.Panel id="analysis" className="flex flex-col gap-4">
                            <CallAnalysisSection call={call} query={analysisQuery} hasActiveRubric={hasActiveRubric} onSeek={seek} />
                        </Tabs.Panel>
                        <Tabs.Panel id="transcript" className="flex flex-col gap-1">
                            {transcript ? (
                                transcript.map((u, i) => (
                                    <div key={u.i} ref={i === activeIndex ? activeRef : undefined} className="scroll-mt-24">
                                        {editingIndex === i ? (
                                            <EditLine
                                                callId={call.id}
                                                utterance={u}
                                                index={i}
                                                onSaved={(text) => saveLine(i, text)}
                                                onCancel={() => setEditingIndex(null)}
                                            />
                                        ) : (
                                            <TranscriptLine
                                                utterance={u}
                                                isActive={i === activeIndex}
                                                onSeek={() => seek(i)}
                                                onEdit={() => setEditingIndex(i)}
                                            />
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-tertiary">
                                    {call.status === "FAILED" ? "No transcript available." : "The transcript will appear when transcription finishes."}
                                </p>
                            )}
                        </Tabs.Panel>
                    </Tabs>
                </>
            )}
        </SlideoutPanel>
    );
}

function RepField({ call, repNames }: { call: CallRow; repNames: string[] }) {
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState("");
    const [error, setError] = useState<string>();
    const [pending, startTransition] = useTransition();

    const isKnown = (name: string) => repNames.some((n) => n.toLowerCase() === name.toLowerCase());
    const unknownRep = !call.rep && call.repName && !isKnown(call.repName) ? call.repName : null;

    const assign = (name: string) =>
        startTransition(async () => {
            const result = await assignCallRep(call.id, name);
            setError(result.error);
            if (!result.error) setIsAdding(false);
        });

    return (
        <section className="flex flex-col gap-1.5">
            {isAdding ? (
                <>
                    <label htmlFor="call-rep" className="text-sm font-medium text-secondary">
                        Rep
                    </label>
                    <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            assign(newName);
                        }}
                    >
                        <input
                            id="call-rep"
                            autoFocus
                            placeholder="Rep's name"
                            className={FIELD_CLASS}
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    e.stopPropagation();
                                    setIsAdding(false);
                                }
                            }}
                        />
                        <Button type="submit" size="sm" isLoading={pending} isDisabled={!newName.trim()}>
                            Add
                        </Button>
                        <Button size="sm" color="link-gray" onClick={() => setIsAdding(false)}>
                            Cancel
                        </Button>
                    </form>
                </>
            ) : (
                <Select
                    label="Rep"
                    size="sm"
                    value={call.rep?.name ?? UNASSIGNED}
                    isDisabled={pending}
                    onChange={(key) => (key === NEW_REP ? setIsAdding(true) : assign(key && key !== UNASSIGNED ? String(key) : ""))}
                >
                    <Select.Item id={UNASSIGNED} label="Unassigned" />
                    {unknownRep && <Select.Item id={unknownRep} label={`Add “${unknownRep}” as a new rep`} />}
                    {repNames.map((name) => (
                        <Select.Item key={name} id={name} label={name} />
                    ))}
                    <Select.Item id={NEW_REP} label="New rep…" />
                </Select>
            )}
            {unknownRep && (
                <p className="text-xs text-warning-primary">The rep introduced themselves as “{unknownRep}”, who isn&apos;t one of your reps yet.</p>
            )}
            {error && <p className="text-sm text-error-primary">{error}</p>}
        </section>
    );
}

function SpeakerTime({ utterance }: { utterance: Utterance }) {
    return (
        <span className="w-24 shrink-0 text-xs text-tertiary">
            <span className={cx("font-semibold", utterance.speaker === "A" ? "text-brand-secondary" : "text-secondary")}>
                Speaker {utterance.speaker}
            </span>
            <br />
            {formatSeconds(utterance.startMs / 1000)}
        </span>
    );
}

interface TranscriptLineProps {
    utterance: Utterance;
    isActive: boolean;
    onSeek: () => void;
    onEdit: () => void;
}

function TranscriptLine({ utterance, isActive, onSeek, onEdit }: TranscriptLineProps) {
    return (
        <div className={cx("group flex items-start gap-2 rounded-lg hover:bg-primary_hover", isActive && "bg-brand-primary")}>
            <button type="button" onClick={onSeek} className="flex flex-1 gap-4 px-3 py-2 text-left text-sm">
                <SpeakerTime utterance={utterance} />
                <span className="text-secondary">
                    {utterance.text}
                    {utterance.original && (
                        <span title={`Transcribed as: “${utterance.original}”`} className="ml-2 text-xs whitespace-nowrap text-tertiary underline decoration-dotted">
                            Auto-corrected
                        </span>
                    )}
                </span>
            </button>
            <Button
                size="sm"
                color="tertiary"
                iconLeading={<Edit05 data-icon />}
                aria-label="Edit line"
                onClick={onEdit}
                className="mt-1 mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            />
        </div>
    );
}

interface EditLineProps {
    callId: string;
    utterance: Utterance;
    index: number;
    onSaved: (text: string) => void;
    onCancel: () => void;
}

function EditLine({ callId, utterance, index, onSaved, onCancel }: EditLineProps) {
    const [text, setText] = useState(utterance.text);
    const [error, setError] = useState<string>();
    const [pending, startTransition] = useTransition();

    const save = () =>
        startTransition(async () => {
            const result = await updateUtterance(callId, index, text);
            if (result.error) return setError(result.error);
            onSaved(text.trim());
        });

    return (
        <div className="flex gap-4 rounded-lg bg-secondary px-3 py-2 text-sm">
            <SpeakerTime utterance={utterance} />
            <div className="flex flex-1 flex-col gap-2">
                <textarea
                    autoFocus
                    rows={3}
                    className={FIELD_CLASS}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        // Keep Esc from also closing the panel.
                        if (e.key === "Escape") {
                            e.stopPropagation();
                            onCancel();
                        }
                    }}
                />
                {error && <p className="text-error-primary">{error}</p>}
                <div className="flex items-center justify-end gap-2">
                    <Button size="sm" isLoading={pending} isDisabled={!text.trim() || text === utterance.text} onClick={save}>
                        Save
                    </Button>
                    <Button size="sm" color="link-gray" onClick={onCancel}>
                        Cancel
                    </Button>
                </div>
            </div>
        </div>
    );
}
