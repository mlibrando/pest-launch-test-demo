"use client";

import { useRef, useState, useTransition, type Ref } from "react";
import { UploadCloud02 } from "@untitledui/icons";
import { prepareCallUploads, saveUploadedCalls } from "@/app/actions/calls";
import { LoadingOverlay } from "@/components/application/loading-indicator/loading-indicator";
import { Button } from "@/components/base/buttons/button";
import { AUDIO_MIME_BY_EXT } from "@/lib/calls";

const ACCEPT = Object.keys(AUDIO_MIME_BY_EXT)
    .map((ext) => `.${ext}`)
    .join(",");

function useCallUpload() {
    const [fileCount, setFileCount] = useState(0);
    const [error, setError] = useState<string>();
    const [pending, startTransition] = useTransition();

    const upload = (files: File[]) =>
        startTransition(async () => {
            setError(undefined);
            setFileCount(files.length);
            const prepared = await prepareCallUploads(files.map((f) => f.name));
            if (!prepared.uploads) return setError(prepared.error);

            const results = await Promise.all(
                prepared.uploads.map(async (upload, i) => {
                    const res = await fetch(upload.signedUrl, {
                        method: "PUT",
                        headers: { "content-type": upload.contentType },
                        body: files[i],
                    });
                    return res.ok ? upload : null;
                }),
            );
            const uploaded = results.filter((u) => u !== null);
            const failed = files.length - uploaded.length;

            const saved = uploaded.length ? await saveUploadedCalls(uploaded) : {};
            setError(saved.error ?? (failed ? `${failed} of ${files.length} files failed to upload.` : undefined));
        });

    const pendingLabel = `Uploading ${fileCount} file${fileCount === 1 ? "" : "s"}…`;
    return { upload, pending, pendingLabel, error };
}

function AudioFileInput({ ref, onFiles, disabled }: { ref?: Ref<HTMLInputElement>; onFiles: (files: File[]) => void; disabled: boolean }) {
    return (
        <input
            ref={ref}
            type="file"
            accept={ACCEPT}
            multiple
            disabled={disabled}
            className="sr-only"
            onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) onFiles(files);
            }}
        />
    );
}

export function UploadCallsButton() {
    const inputRef = useRef<HTMLInputElement>(null);
    const { upload, pending, pendingLabel, error } = useCallUpload();

    return (
        <div className="flex flex-col items-end gap-1">
            <Button size="md" iconLeading={<UploadCloud02 data-icon />} isDisabled={pending} onClick={() => inputRef.current?.click()}>
                Upload calls
            </Button>
            <AudioFileInput ref={inputRef} onFiles={upload} disabled={pending} />
            {error && <p className="text-sm text-error-primary">{error}</p>}
            {pending && <LoadingOverlay label={pendingLabel} />}
        </div>
    );
}

export function UploadCallsEmptyState() {
    const { upload, pending, pendingLabel, error } = useCallUpload();

    return (
        <label className="m-6 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-primary px-6 py-12 text-center hover:bg-primary_hover">
            <UploadCloud02 className="size-8 text-fg-quaternary" />
            <span className="text-lg font-semibold text-secondary">No calls yet. Upload recordings</span>
            <span className="text-sm text-tertiary">{Object.keys(AUDIO_MIME_BY_EXT).join(", ")} · one or more files</span>
            {error && <span className="text-sm text-error-primary">{error}</span>}
            <AudioFileInput onFiles={upload} disabled={pending} />
            {pending && <LoadingOverlay label={pendingLabel} />}
        </label>
    );
}
