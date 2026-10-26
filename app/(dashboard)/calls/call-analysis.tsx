"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "@untitledui/icons";
import type { UseQueryResult } from "@tanstack/react-query";
import { Button as AriaButton, Disclosure, DisclosurePanel, Heading } from "react-aria-components";
import type { CallAnalysis } from "@/app/actions/calls";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { ANALYSIS_FAILED_MESSAGE, humanize, type Quote } from "@/lib/calls";
import { cx } from "@/utils/cx";
import { BADGE_CLASS, RetryButton, TierBadge, type CallRow } from "./call-status";

type Criterion = CallAnalysis["criteria"][number];

const RESULT: Record<string, { label: string; className: string }> = {
    PASS: { label: "Pass", className: "bg-success-secondary text-success-primary" },
    AUTO_PASS: { label: "Auto-pass", className: "bg-success-secondary text-success-primary" },
    FAIL: { label: "Fail", className: "bg-error-secondary text-error-primary" },
    NA: { label: "Not applicable", className: "bg-secondary text-tertiary" },
};

const resultKey = (c: Criterion) => (c.source === "AUTO_PASS" ? "AUTO_PASS" : c.result);

interface CallAnalysisSectionProps {
    call: CallRow;
    query: UseQueryResult<CallAnalysis | null>;
    hasActiveRubric: boolean;
    onSeek: (utteranceIndex: number) => void;
}

export function CallAnalysisSection({ call, query, hasActiveRubric, onSeek }: CallAnalysisSectionProps) {
    if (call.status === "FAILED" && call.failedStage === "analyze") {
        return (
            <div className="flex items-start justify-between gap-4 rounded-lg bg-error-primary p-4 text-sm text-error-primary">
                <p>{ANALYSIS_FAILED_MESSAGE}</p>
                <RetryButton callId={call.id} />
            </div>
        );
    }
    if (call.status === "TRANSCRIBED") {
        return hasActiveRubric ? (
            <LoadingIndicator label="Waiting to be analyzed…" className="text-sm text-tertiary" />
        ) : (
            <p className="text-sm text-tertiary">Analysis starts once a rubric set is active.</p>
        );
    }
    if (call.status === "ANALYZING") {
        return (
            <LoadingIndicator
                label={call.analysisProgress?.stage === "assessing" ? "Scoring the call…" : "Classifying the call…"}
                className="text-sm text-tertiary"
            />
        );
    }
    if (call.status === "FAILED") return <p className="text-sm text-tertiary">No analysis available.</p>;
    if (call.status !== "DONE") return <p className="text-sm text-tertiary">Analysis starts once the call is transcribed.</p>;

    const analysis = query.data;
    return query.isError ? (
        <p className="text-sm text-error-primary">{query.error.message}</p>
    ) : analysis ? (
        <AnalysisResult analysis={analysis} onSeek={onSeek} />
    ) : (
        <p className="text-sm text-tertiary">No analysis available.</p>
    );
}

function AnalysisResult({ analysis, onSeek }: { analysis: CallAnalysis; onSeek: (utteranceIndex: number) => void }) {
    const quadrants = Map.groupBy(analysis.criteria, (c) => c.quadrant);
    const details = [
        ["Customer", analysis.details?.customerName],
        ["Pest type", analysis.details?.pestType],
        ["Service requested", analysis.details?.serviceRequested],
        ["Price quoted", analysis.details?.priceQuoted],
        ["Follow-up", analysis.details?.followUp],
    ].filter((d): d is [string, string] => Boolean(d[1]));

    return (
        <>
            <div className="flex flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2 text-sm text-secondary">
                    {analysis.scorecard && <span className="font-semibold text-primary">{analysis.scorecard}</span>}
                    {analysis.maxPoints ? (
                        <span>
                            {analysis.points}/{analysis.maxPoints} ({analysis.score}%)
                        </span>
                    ) : (
                        <span className="text-tertiary">Not scored</span>
                    )}
                    {analysis.tier && <TierBadge tier={analysis.tier} />}
                </p>
                <p className="text-sm text-tertiary">
                    {[analysis.category, analysis.outcome].filter((v) => v !== null).map(humanize).join(" · ")}
                    {analysis.outcomeReason && ` · ${analysis.outcomeReason}`}
                </p>
            </div>

            {analysis.summary && <p className="text-sm text-secondary">{analysis.summary}</p>}

            {details.length > 0 && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    {details.map(([label, value]) => (
                        <div key={label} className="contents">
                            <dt className="text-tertiary">{label}</dt>
                            <dd className="text-secondary">{value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {[...quadrants].map(([quadrant, criteria]) => (
                <Quadrant key={quadrant} name={quadrant || "Criteria"} criteria={criteria} onSeek={onSeek} />
            ))}

            {analysis.policyViolations.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-semibold text-warning-primary">Policy flags</h4>
                    {analysis.policyViolations.map((v, i) => (
                        <div key={i} className="flex flex-col gap-1 rounded-lg bg-warning-primary p-3">
                            <p className="text-sm font-medium text-warning-primary">{v.rule}</p>
                            <p className="text-sm text-secondary">{v.explanation}</p>
                            <Quotes quotes={v.quotes} onSeek={onSeek} />
                        </div>
                    ))}
                </div>
            )}

            {analysis.coaching && (
                <div className="grid gap-4 sm:grid-cols-2">
                    {(
                        [
                            ["Strengths", analysis.coaching.strengths],
                            ["Improvements", analysis.coaching.improvements],
                        ] as const
                    ).map(([title, notes]) => (
                        <div key={title} className="flex flex-col gap-1">
                            <h4 className="text-sm font-semibold text-primary">{title}</h4>
                            {notes.length === 0 && <p className="text-sm text-tertiary">None noted.</p>}
                            {notes.map(({ text, utterance }, i) =>
                                utterance === null ? (
                                    <p key={i} className="px-2 py-1 text-sm text-secondary">
                                        {text}
                                    </p>
                                ) : (
                                    <SeekButton key={i} onClick={() => onSeek(utterance)}>
                                        {text}
                                    </SeekButton>
                                ),
                            )}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}

function Quadrant({ name, criteria, onSeek }: { name: string; criteria: Criterion[]; onSeek: (utteranceIndex: number) => void }) {
    const scored = criteria.map(resultKey).filter((r) => r !== "NA");
    const passed = scored.filter((r) => r !== "FAIL").length;

    return (
        <Disclosure defaultExpanded={passed < scored.length}>
            {({ isExpanded }) => (
                <>
                    <Heading level={4}>
                        <AriaButton
                            slot="trigger"
                            className="flex w-full items-center gap-2 rounded-md text-left text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                            {name}
                            {scored.length > 0 && (
                                <span className="font-medium text-tertiary">
                                    {passed}/{scored.length}
                                </span>
                            )}
                            <ChevronDown className={cx("ml-auto size-5 shrink-0 text-fg-quaternary transition", isExpanded && "rotate-180")} />
                        </AriaButton>
                    </Heading>
                    <DisclosurePanel>
                        <div className="flex flex-col gap-2 pt-2">
                            {criteria.map((c) => (
                                <div key={c.criterionId} className="flex flex-col gap-1 rounded-lg p-3 ring-1 ring-secondary">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-sm font-medium text-primary">{c.label}</p>
                                        <span className={cx(BADGE_CLASS, RESULT[resultKey(c)].className)}>{RESULT[resultKey(c)].label}</span>
                                    </div>
                                    {c.rationale && <p className="text-sm text-tertiary">{c.rationale}</p>}
                                    <Quotes quotes={c.quotes} onSeek={onSeek} />
                                </div>
                            ))}
                        </div>
                    </DisclosurePanel>
                </>
            )}
        </Disclosure>
    );
}

function Quotes({ quotes, onSeek }: { quotes: Quote[]; onSeek: (utteranceIndex: number) => void }) {
    return quotes.map((q, i) => (
        <SeekButton key={i} onClick={() => onSeek(q.utterance)} className="italic">
            “{q.quote}”
        </SeekButton>
    ));
}

function SeekButton({ onClick, className, children }: { onClick: () => void; className?: string; children: ReactNode }) {
    return (
        <button
            type="button"
            title="Play from here"
            onClick={onClick}
            className={cx("rounded-md px-2 py-1 text-left text-sm text-secondary outline-none hover:bg-primary_hover focus-visible:ring-2 focus-visible:ring-brand", className)}
        >
            {children}
        </button>
    );
}
