"use client";

import { useActionState, useState } from "react";
import { ClipboardCheck, UploadCloud02, XClose } from "@untitledui/icons";
import { Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from "react-aria-components";
import { uploadRubricDocuments, type RubricActionState } from "@/app/actions/rubrics";
import { Button } from "@/components/base/buttons/button";
import { unresolvedItems, type RubricData } from "@/lib/rubrics";
import { cx } from "@/utils/cx";
import { DraftReviewPanel, ResolvePill } from "./draft-review";

interface RubricSet {
    id: string;
    version: number;
    createdAt: Date;
    data: RubricData;
    documentNames: string[];
}

interface RubricSetsModalProps {
    activeSet: RubricSet | null;
    draft: RubricSet | null;
    versions: { id: string; version: number; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; createdAt: Date }[];
}

const STATUS_CLASS = {
    DRAFT: "bg-brand-secondary text-brand-secondary",
    ACTIVE: "bg-success-secondary text-success-primary",
    ARCHIVED: "bg-secondary text-tertiary",
};

export function RubricSetsModal({ activeSet, draft, versions }: RubricSetsModalProps) {
    const [modalOpen, setModalOpen] = useState(false);
    const [reviewOpen, setReviewOpen] = useState(false);

    return (
        <>
            <DialogTrigger isOpen={modalOpen} onOpenChange={setModalOpen}>
                <Button size="md" color="secondary" iconLeading={<ClipboardCheck data-icon />}>
                    Rubric Sets
                </Button>
                <ModalOverlay isDismissable className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4">
                    <Modal className="w-full max-w-2xl">
                        <Dialog className="flex max-h-[85dvh] flex-col rounded-xl bg-primary shadow-xl outline-none">
                            {({ close }) => (
                                <>
                                    <div className="flex items-center justify-between border-b border-secondary px-6 py-4">
                                        <Heading slot="title" className="text-lg font-semibold text-primary">
                                            Rubric Sets
                                        </Heading>
                                        <Button color="tertiary" size="sm" iconLeading={<XClose data-icon />} aria-label="Close" onClick={close} />
                                    </div>
                                    <div className="flex flex-col gap-6 overflow-y-auto px-6 py-5">
                                        {draft && (
                                            <DraftRow
                                                set={draft}
                                                onReview={() => {
                                                    setModalOpen(false);
                                                    setReviewOpen(true);
                                                }}
                                            />
                                        )}
                                        {activeSet && <ActiveSetSummary set={activeSet} />}
                                        <UploadForm hasRubricSet={Boolean(activeSet || draft)} />
                                        {versions.length > 0 && <VersionList versions={versions} />}
                                    </div>
                                </>
                            )}
                        </Dialog>
                    </Modal>
                </ModalOverlay>
            </DialogTrigger>

            {draft && (
                <DraftReviewPanel
                    key={draft.id}
                    id={draft.id}
                    version={draft.version}
                    initialData={draft.data}
                    documentNames={draft.documentNames}
                    isOpen={reviewOpen}
                    onClose={() => setReviewOpen(false)}
                    onActivated={() => {
                        // Back to the modal so the newly active set is visible.
                        setReviewOpen(false);
                        setModalOpen(true);
                    }}
                />
            )}
        </>
    );
}

function DraftRow({ set, onReview }: { set: RubricSet; onReview: () => void }) {
    const criteriaCount = set.data.scorecards.reduce((n, sc) => n + sc.criteria.length, 0);
    return (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-brand-primary p-4 ring-1 ring-brand">
            <div className="flex flex-col gap-1">
                <p className="text-md font-semibold text-primary">Draft v{set.version} ready for review</p>
                <p className="flex items-center gap-2 text-sm text-tertiary">
                    {set.data.scorecards.length} scorecards · {criteriaCount} criteria
                    <ResolvePill count={unresolvedItems(set.data).length} />
                </p>
            </div>
            <Button size="md" onClick={onReview}>
                Review
            </Button>
        </section>
    );
}

function ActiveSetSummary({ set }: { set: RubricSet }) {
    return (
        <section className="flex flex-col gap-4">
            <div>
                <p className="text-md font-semibold text-primary">
                    Active: v{set.version}{" "}
                    <span className="font-normal text-tertiary">· created {set.createdAt.toLocaleDateString()}</span>
                </p>
                <p className="text-sm text-tertiary">From {set.documentNames.join(", ")}</p>
            </div>
            {set.data.scorecards.map((scorecard, i) => (
                <div key={i} className="rounded-lg p-4 ring-1 ring-secondary">
                    <p className="mb-2 text-sm font-semibold text-primary">
                        {scorecard.callType}{" "}
                        <span className="font-normal text-tertiary">
                            · {scorecard.criteria.length} criteria · gold {scorecard.thresholds.gold ?? "–"} · green{" "}
                            {scorecard.thresholds.green ?? "–"}
                        </span>
                    </p>
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-secondary">
                        {scorecard.criteria.map((c) => (
                            <li key={c.id}>{c.label}</li>
                        ))}
                    </ul>
                </div>
            ))}
        </section>
    );
}

function UploadForm({ hasRubricSet }: { hasRubricSet: boolean }) {
    const [fileNames, setFileNames] = useState<string[]>([]);
    const [state, action, pending] = useActionState(async (prev: RubricActionState, formData: FormData) => {
        const result = await uploadRubricDocuments(prev, formData);
        // React resets the file input after the action; keep the list in sync.
        if (!result?.error) setFileNames([]);
        return result;
    }, undefined);

    return (
        <form action={action} className="flex flex-col gap-3">
            {/* The label opens the file picker; the input itself stays hidden. */}
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-primary px-6 py-8 text-center hover:bg-primary_hover">
                <UploadCloud02 className="size-8 text-fg-quaternary" />
                <span className="text-lg font-semibold text-secondary">
                    {hasRubricSet ? "Upload new rubric documents" : "No rubric sets found. Please upload your rubric documents."}
                </span>
                <span className="text-sm text-tertiary">PDF or DOCX, one or more files</span>
                <input
                    type="file"
                    name="files"
                    accept=".pdf,.docx"
                    multiple
                    disabled={pending}
                    className="sr-only"
                    onChange={(e) => setFileNames(Array.from(e.target.files ?? [], (f) => f.name))}
                />
            </label>

            {fileNames.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-secondary">{fileNames.join(", ")}</p>
                    <Button type="submit" size="md" isLoading={pending} showTextWhileLoading>
                        {pending ? "Extracting… this can take a few minutes" : "Upload and extract"}
                    </Button>
                </div>
            )}
            {state?.error && <p className="text-sm text-error-primary">{state.error}</p>}
            {state?.draftVersion && (
                <p className="text-sm text-success-primary">
                    Draft v{state.draftVersion} created. Click Review above to check and activate it.
                </p>
            )}
        </form>
    );
}

function VersionList({ versions }: { versions: RubricSetsModalProps["versions"] }) {
    return (
        <section>
            <h3 className="mb-2 text-md font-semibold text-primary">Versions</h3>
            <ul className="divide-y divide-secondary">
                {versions.map((v) => (
                    <li key={v.id} className="flex items-center gap-4 py-2.5 text-sm">
                        <span className="w-12 font-semibold text-primary">v{v.version}</span>
                        <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLASS[v.status])}>
                            {v.status.toLowerCase()}
                        </span>
                        <span className="text-tertiary">{v.createdAt.toLocaleString()}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
