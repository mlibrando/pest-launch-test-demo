"use client";

import { useState, useTransition } from "react";
import { ChevronDown, XClose } from "@untitledui/icons";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { activateRubricSet, saveRubricDraft, type RubricActionState } from "@/app/actions/rubrics";
import { Button } from "@/components/base/buttons/button";
import type { Criterion, RubricData } from "@/lib/rubrics";
import { cx } from "@/utils/cx";

const FIELD_CLASS =
    "w-full rounded-lg bg-primary px-3 py-2 text-sm text-primary shadow-xs ring-1 ring-primary outline-none ring-inset focus:ring-2 focus:ring-brand";

interface DraftReviewPanelProps {
    id: string;
    version: number;
    initialData: RubricData;
    documentNames: string[];
    isOpen: boolean;
    onClose: () => void;
    onActivated: () => void;
}

export function DraftReviewPanel({ id, version, initialData, documentNames, isOpen, onClose, onActivated }: DraftReviewPanelProps) {
    const [data, setData] = useState(initialData);
    const [dirty, setDirty] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const [error, setError] = useState<string>();
    const [pending, startTransition] = useTransition();

    const updateCriterion = (scorecardIndex: number, criterionIndex: number, patch: Partial<Criterion>) => {
        setDirty(true);
        setData((d) => ({
            ...d,
            scorecards: d.scorecards.map((sc, i) =>
                i !== scorecardIndex
                    ? sc
                    : { ...sc, criteria: sc.criteria.map((c, j) => (j !== criterionIndex ? c : { ...c, ...patch })) },
            ),
        }));
    };

    const run = (action: () => Promise<RubricActionState>, onSuccess: () => void) =>
        startTransition(async () => {
            const result = await action();
            setError(result?.error);
            if (!result?.error) onSuccess();
        });

    const requestClose = () => {
        if (dirty) {
            if (!window.confirm("Discard unsaved changes?")) return;
            setData(initialData);
            setDirty(false);
        }
        setEditing(null);
        setError(undefined);
        onClose();
    };

    return (
        <ModalOverlay
            isOpen={isOpen}
            onOpenChange={(open) => !open && requestClose()}
            isDismissable
            className="fixed inset-0 z-50 bg-overlay/70"
        >
            <Modal className="fixed inset-y-0 right-0 w-full max-w-3xl">
                <Dialog className="flex h-full flex-col bg-primary shadow-xl outline-none">
                    <header className="flex items-start justify-between gap-4 border-b border-secondary px-6 py-4">
                        <div className="flex flex-col gap-1">
                            <Heading slot="title" className="text-lg font-semibold text-primary">
                                Review draft v{version}
                            </Heading>
                            <p className="text-sm text-tertiary">From {documentNames.join(", ")}</p>
                            <div className="flex gap-2 pt-1">
                                <CountPill count={data.conflicts.length} label="conflict" />
                                <CountPill count={data.placeholders.length} label="placeholder" />
                            </div>
                        </div>
                        <Button color="tertiary" size="sm" iconLeading={<XClose data-icon />} aria-label="Close" onClick={requestClose} />
                    </header>

                    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
                        {data.conflicts.length > 0 && (
                            <Notice title="Conflicts to review" tone="warning">
                                {data.conflicts.map((c, i) => (
                                    <li key={i}>
                                        {c.description} <span className="font-semibold">{c.question}</span>
                                    </li>
                                ))}
                            </Notice>
                        )}
                        {data.placeholders.length > 0 && (
                            <Notice title="Unfilled placeholders" tone="warning">
                                {data.placeholders.map((p, i) => (
                                    <li key={i}>{p}</li>
                                ))}
                            </Notice>
                        )}
                        {data.policies.length > 0 && (
                            <Notice title="Policies" tone="neutral">
                                {data.policies.map((p, i) => (
                                    <li key={i}>
                                        {p.rule} <span className="text-tertiary">({p.sourceRef})</span>
                                    </li>
                                ))}
                            </Notice>
                        )}

                        {data.scorecards.map((scorecard, s) => (
                            <section key={s} className="flex flex-col gap-2">
                                <h3 className="text-md font-semibold text-primary">
                                    {scorecard.callType}{" "}
                                    <span className="font-normal text-tertiary">
                                        · {scorecard.criteria.length} criteria · gold {scorecard.thresholds.gold ?? "–"} · green{" "}
                                        {scorecard.thresholds.green ?? "–"}
                                    </span>
                                </h3>
                                <ul className="divide-y divide-secondary rounded-lg ring-1 ring-secondary">
                                    {scorecard.criteria.map((criterion, c) => {
                                        const key = `${s}:${criterion.id}`;
                                        return (
                                            <li key={key}>
                                                <CriterionRow
                                                    criterion={criterion}
                                                    isEditing={editing === key}
                                                    onToggle={() => setEditing(editing === key ? null : key)}
                                                    onChange={(patch) => updateCriterion(s, c, patch)}
                                                />
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        ))}
                    </div>

                    <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-secondary px-6 py-4">
                        <p className="mr-auto text-sm">
                            {error ? (
                                <span className="text-error-primary">{error}</span>
                            ) : (
                                dirty && <span className="text-warning-primary">Unsaved changes. Save before activating.</span>
                            )}
                        </p>
                        <Button
                            color="secondary"
                            size="md"
                            isDisabled={!dirty || pending}
                            onClick={() => run(() => saveRubricDraft(id, data), () => setDirty(false))}
                        >
                            Save changes
                        </Button>
                        <Button size="md" isDisabled={dirty || pending} onClick={() => run(() => activateRubricSet(id), onActivated)}>
                            Activate
                        </Button>
                    </footer>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

interface CriterionRowProps {
    criterion: Criterion;
    isEditing: boolean;
    onToggle: () => void;
    onChange: (patch: Partial<Criterion>) => void;
}

function CriterionRow({ criterion, isEditing, onToggle, onChange }: CriterionRowProps) {
    return (
        <div className={cx(isEditing && "bg-secondary")}>
            <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-primary_hover">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-primary">{criterion.label}</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-tertiary ring-1 ring-secondary">
                            {criterion.quadrant}
                        </span>
                    </div>
                    {!isEditing && <p className="line-clamp-2 text-sm text-tertiary">{criterion.qualityBar}</p>}
                    {!isEditing && criterion.appliesWhen && (
                        <p className="text-xs text-tertiary">
                            Only when {criterion.appliesWhen}
                            {criterion.ifNotApplicable && ` · otherwise ${criterion.ifNotApplicable.replace("_", " ")}`}
                        </p>
                    )}
                </div>
                <ChevronDown className={cx("mt-0.5 size-5 shrink-0 text-fg-quaternary transition", isEditing && "rotate-180")} />
            </button>

            {isEditing && (
                <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
                    <p className="text-xs text-tertiary md:col-span-2">
                        <code>{criterion.id}</code> · {criterion.sourceRef}
                    </p>
                    <Field label="Label">
                        <input className={FIELD_CLASS} value={criterion.label} onChange={(e) => onChange({ label: e.target.value })} />
                    </Field>
                    <Field label="Quadrant">
                        <input className={FIELD_CLASS} value={criterion.quadrant} onChange={(e) => onChange({ quadrant: e.target.value })} />
                    </Field>
                    <Field label="Quality bar" className="md:col-span-2">
                        <textarea
                            className={FIELD_CLASS}
                            rows={4}
                            value={criterion.qualityBar}
                            onChange={(e) => onChange({ qualityBar: e.target.value })}
                        />
                    </Field>
                    <Field label="Applies when">
                        <input
                            className={FIELD_CLASS}
                            value={criterion.appliesWhen ?? ""}
                            placeholder="Always"
                            onChange={(e) => onChange({ appliesWhen: e.target.value || undefined })}
                        />
                    </Field>
                    <Field label="If not applicable">
                        <select
                            className={FIELD_CLASS}
                            value={criterion.ifNotApplicable ?? ""}
                            onChange={(e) => onChange({ ifNotApplicable: (e.target.value || undefined) as Criterion["ifNotApplicable"] })}
                        >
                            <option value="">—</option>
                            <option value="auto_pass">Auto pass</option>
                            <option value="exclude">Exclude</option>
                        </select>
                    </Field>
                </div>
            )}
        </div>
    );
}

function CountPill({ count, label }: { count: number; label: string }) {
    return (
        <span
            className={cx(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                count > 0 ? "bg-warning-primary text-warning-primary" : "bg-secondary text-tertiary",
            )}
        >
            {count} {label}
            {count === 1 ? "" : "s"}
        </span>
    );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
    return (
        <label className={cx("flex flex-col gap-1.5 text-sm font-medium text-secondary", className)}>
            {label}
            {children}
        </label>
    );
}

function Notice({ title, tone, children }: { title: string; tone: "warning" | "neutral"; children: React.ReactNode }) {
    return (
        <div className={cx("rounded-lg p-4 text-sm", tone === "warning" ? "bg-warning-primary" : "bg-secondary")}>
            <p className="mb-2 font-semibold text-primary">{title}</p>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-secondary">{children}</ul>
        </div>
    );
}
