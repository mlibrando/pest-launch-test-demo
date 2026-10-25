"use client";

import { useState, useTransition, type ReactNode } from "react";
import { CheckCircle, ChevronDown } from "@untitledui/icons";
import { ConfirmDialog } from "@/components/application/confirm-dialog/confirm-dialog";
import { SlideoutPanel } from "@/components/application/slideout-panel/slideout-panel";
import { activateRubricSet, saveRubricDraft, type RubricActionState } from "@/app/actions/rubrics";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import {
    isPlaceholderResolved,
    unresolvedItems,
    type Criterion,
    type PlaceholderValue,
    type RubricData,
} from "@/lib/rubrics";
import { cx } from "@/utils/cx";

const FIELD_CLASS =
    "w-full rounded-lg bg-primary px-3 py-2 text-sm text-primary shadow-xs ring-1 ring-primary outline-none ring-inset focus:ring-2 focus:ring-brand";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface DraftReviewPanelProps {
    id: string;
    version: number;
    initialData: RubricData;
    documentNames: string[];
    companyName: string;
    isOpen: boolean;
    onClose: () => void;
    onActivated: () => void;
}

export function DraftReviewPanel({ id, version, initialData, documentNames, companyName, isOpen, onClose, onActivated }: DraftReviewPanelProps) {
    const [data, setData] = useState(initialData);
    const [dirty, setDirty] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<"discard" | "activate" | null>(null);
    const [error, setError] = useState<string>();
    const [pending, startTransition] = useTransition();

    const unresolved = unresolvedItems(data);

    const update = (fn: (d: RubricData) => RubricData) => {
        setDirty(true);
        setData(fn);
    };

    const updateCriterion = (scorecardIndex: number, criterionIndex: number, patch: Partial<Criterion>) =>
        update((d) => ({
            ...d,
            scorecards: d.scorecards.map((sc, i) =>
                i !== scorecardIndex
                    ? sc
                    : { ...sc, criteria: sc.criteria.map((c, j) => (j !== criterionIndex ? c : { ...c, ...patch })) },
            ),
        }));

    const updatePlaceholder = (token: string, patch: PlaceholderValue) =>
        update((d) => ({
            ...d,
            placeholderValues: { ...d.placeholderValues, [token]: { ...d.placeholderValues?.[token], ...patch } },
        }));

    const updateConflict = (index: number, patch: Partial<RubricData["conflicts"][number]>) =>
        update((d) => ({ ...d, conflicts: d.conflicts.map((c, i) => (i !== index ? c : { ...c, ...patch })) }));

    const run = (action: () => Promise<RubricActionState>, onSuccess: () => void) =>
        startTransition(async () => {
            const result = await action();
            setError(result?.error);
            if (!result?.error) onSuccess();
        });

    const close = () => {
        setData(initialData);
        setDirty(false);
        setEditing(null);
        setConfirm(null);
        setError(undefined);
        onClose();
    };

    const activate = () => {
        setConfirm(null);
        run(() => activateRubricSet(id), onActivated);
    };

    // Shows placeholder tokens in criterion text as their filled-in value, highlighted, so the reviewer sees the effect.
    const tokenPattern = data.placeholders.length ? new RegExp(`(${data.placeholders.map(escapeRegExp).join("|")})`) : null;
    const preview = (text: string): ReactNode =>
        tokenPattern
            ? text.split(tokenPattern).map((part, i) => {
                  if (!data.placeholders.includes(part)) return part;
                  const v = data.placeholderValues?.[part];
                  const filled = !v?.varies && v?.value?.trim();
                  return (
                      <mark
                          key={i}
                          className={cx(
                              "rounded px-0.5",
                              filled ? "bg-success-secondary text-success-primary" : v?.varies ? "bg-secondary text-secondary" : "bg-warning-secondary text-warning-primary",
                          )}
                      >
                          {filled || part}
                      </mark>
                  );
              })
            : text;

    const criteriaUsing = (token: string) =>
        data.scorecards.flatMap((sc) =>
            sc.criteria.filter((c) => [c.label, c.qualityBar, c.appliesWhen].some((t) => t?.includes(token))).map((c) => c.label),
        );

    const resolveTotal = data.placeholders.length + data.conflicts.length;

    const requestClose = () => (dirty ? setConfirm("discard") : close());

    return (
        <SlideoutPanel
            isOpen={isOpen}
            onClose={requestClose}
            title={`Review draft v${version}`}
            description={
                <>
                    <p className="text-sm text-tertiary">From {documentNames.join(", ")}</p>
                    {resolveTotal > 0 && (
                        <div className="pt-1">
                            <ResolvePill count={unresolved.length} />
                        </div>
                    )}
                </>
            }
            footer={
                <>
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
                    <Button
                        size="md"
                        isDisabled={dirty || pending}
                        onClick={() => (unresolved.length ? setConfirm("activate") : activate())}
                    >
                        {unresolved.length ? `Activate (${unresolved.length} unresolved)` : "Activate"}
                    </Button>
                </>
            }
        >
            {resolveTotal > 0 && (
                <section className="rounded-lg ring-1 ring-secondary">
                    <h3 className="border-b border-secondary px-4 py-3 text-md font-semibold text-primary">
                        To resolve{" "}
                        <span className="font-normal text-tertiary">
                            · {resolveTotal - unresolved.length} of {resolveTotal} done
                        </span>
                    </h3>
                    <ul className="divide-y divide-secondary">
                        {data.placeholders.map((token) => (
                            <li key={token}>
                                <PlaceholderRow
                                    token={token}
                                    value={data.placeholderValues?.[token]}
                                    usedIn={criteriaUsing(token)}
                                    suggestion={/business|company/i.test(token) ? companyName : undefined}
                                    onChange={(patch) => updatePlaceholder(token, patch)}
                                />
                            </li>
                        ))}
                        {data.conflicts.map((conflict, i) => (
                            <li key={i}>
                                <ConflictRow conflict={conflict} onChange={(patch) => updateConflict(i, patch)} />
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {data.policies.length > 0 && (
                <div className="rounded-lg bg-secondary p-4 text-sm">
                    <p className="mb-2 font-semibold text-primary">Policies</p>
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-secondary">
                        {data.policies.map((p, i) => (
                            <li key={i}>
                                {p.rule && preview(p.rule)} <span className="text-tertiary">({p.sourceRef})</span>
                            </li>
                        ))}
                    </ul>
                </div>
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
                                        preview={preview}
                                        onToggle={() => setEditing(editing === key ? null : key)}
                                        onChange={(patch) => updateCriterion(s, c, patch)}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}

            <ConfirmDialog
                isOpen={confirm === "discard"}
                title="Discard unsaved changes?"
                confirmLabel="Discard"
                isDestructive
                onConfirm={close}
                onCancel={() => setConfirm(null)}
            >
                Your edits since the last save will be lost.
            </ConfirmDialog>
            <ConfirmDialog
                isOpen={confirm === "activate"}
                title="Activate with unresolved items?"
                confirmLabel="Activate anyway"
                onConfirm={activate}
                onCancel={() => setConfirm(null)}
            >
                <p>The grader will use this rubric as-is. Still unresolved:</p>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                    {unresolved.map((item, i) => (
                        <li key={i}>{item}</li>
                    ))}
                </ul>
            </ConfirmDialog>
        </SlideoutPanel>
    );
}

interface PlaceholderRowProps {
    token: string;
    value?: PlaceholderValue;
    usedIn: string[];
    suggestion?: string;
    onChange: (patch: PlaceholderValue) => void;
}

function PlaceholderRow({ token, value, usedIn, suggestion, onChange }: PlaceholderRowProps) {
    return (
        <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <ResolvedIcon resolved={isPlaceholderResolved(value)} />
                    <code>{token}</code>
                </span>
                {usedIn.length > 0 && (
                    <Tooltip title={`Used in ${usedIn.length} criteria`} description={usedIn.join(", ")}>
                        <TooltipTrigger className="text-sm text-tertiary underline decoration-dotted">
                            Used in {usedIn.length} criteria
                        </TooltipTrigger>
                    </Tooltip>
                )}
            </div>
            <div className="flex items-center gap-4">
                <Input
                    size="sm"
                    aria-label={`Value for ${token}`}
                    placeholder={suggestion ?? "Value to use"}
                    value={value?.value ?? ""}
                    isDisabled={value?.varies}
                    onChange={(v) => onChange({ value: v })}
                    className="flex-1"
                />
                <label className="flex shrink-0 items-center gap-2 text-sm text-secondary">
                    <input type="checkbox" checked={Boolean(value?.varies)} onChange={(e) => onChange({ varies: e.target.checked })} />
                    Varies per call
                </label>
            </div>
            {suggestion && !value?.value && !value?.varies && (
                <div>
                    <Button color="link-color" size="sm" onClick={() => onChange({ value: suggestion })}>
                        Use “{suggestion}”
                    </Button>
                </div>
            )}
        </div>
    );
}

interface ConflictRowProps {
    conflict: RubricData["conflicts"][number];
    onChange: (patch: Partial<RubricData["conflicts"][number]>) => void;
}

function ConflictRow({ conflict, onChange }: ConflictRowProps) {
    if (conflict.resolved) {
        return (
            <div className="flex items-start gap-2 px-4 py-3 text-sm">
                <ResolvedIcon resolved />
                <p className="min-w-0 flex-1 text-secondary">
                    {conflict.question || conflict.description} <span className="text-tertiary">— {conflict.answer}</span>
                </p>
                <Button color="link-gray" size="sm" onClick={() => onChange({ resolved: false })}>
                    Reopen
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 px-4 py-3 text-sm">
            <div className="flex items-start gap-2">
                <ResolvedIcon resolved={false} />
                <div className="flex flex-col gap-1">
                    <p className="text-secondary">{conflict.description}</p>
                    <p className="font-semibold text-primary">{conflict.question}</p>
                </div>
            </div>
            <Input
                size="sm"
                aria-label="Your answer"
                placeholder="Your answer…"
                value={conflict.answer ?? ""}
                onChange={(v) => onChange({ answer: v })}
            />
            <div className="flex items-center gap-4">
                <Button color="secondary" size="sm" isDisabled={!conflict.answer?.trim()} onClick={() => onChange({ resolved: true })}>
                    Mark resolved
                </Button>
                <Button color="link-gray" size="sm" onClick={() => onChange({ answer: "Not an issue", resolved: true })}>
                    Not an issue
                </Button>
            </div>
        </div>
    );
}

interface CriterionRowProps {
    criterion: Criterion;
    isEditing: boolean;
    preview: (text: string) => ReactNode;
    onToggle: () => void;
    onChange: (patch: Partial<Criterion>) => void;
}

function CriterionRow({ criterion, isEditing, preview, onToggle, onChange }: CriterionRowProps) {
    return (
        <div className={cx(isEditing && "bg-secondary")}>
            <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-primary_hover">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-primary">{preview(criterion.label)}</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-tertiary ring-1 ring-secondary">
                            {criterion.quadrant}
                        </span>
                    </div>
                    {!isEditing && <p className="line-clamp-2 text-sm text-tertiary">{preview(criterion.qualityBar)}</p>}
                    {!isEditing && criterion.appliesWhen && (
                        <p className="text-xs text-tertiary">
                            Only when {preview(criterion.appliesWhen)}
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

export function ResolvePill({ count }: { count: number }) {
    return (
        <span
            className={cx(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                count > 0 ? "bg-warning-primary text-warning-primary" : "bg-success-secondary text-success-primary",
            )}
        >
            {count > 0 ? `${count} to resolve` : "All resolved"}
        </span>
    );
}

function ResolvedIcon({ resolved }: { resolved: boolean }) {
    return resolved ? (
        <CheckCircle className="size-4 shrink-0 text-fg-success-primary" />
    ) : (
        <span className="size-4 shrink-0 rounded-full border-2 border-fg-warning-primary" />
    );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
    return (
        <label className={cx("flex flex-col gap-1.5 text-sm font-medium text-secondary", className)}>
            {label}
            {children}
        </label>
    );
}
