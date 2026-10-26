"use client";

import type { ReactNode } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    confirmLabel: string;
    isDestructive?: boolean;
    /** Locks the dialog while the confirmed action runs. */
    isPending?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    children: ReactNode;
}

export function ConfirmDialog({ isOpen, title, confirmLabel, isDestructive, isPending, onConfirm, onCancel, children }: ConfirmDialogProps) {
    return (
        <ModalOverlay
            isOpen={isOpen}
            onOpenChange={(open) => !open && onCancel()}
            isDismissable={!isPending}
            isKeyboardDismissDisabled={isPending}
            className={({ isEntering, isExiting }) =>
                cx(
                    "fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4",
                    isEntering && "duration-150 ease-out animate-in fade-in",
                    isExiting && "duration-100 ease-in animate-out fade-out",
                )
            }
        >
            <Modal
                className={({ isEntering, isExiting }) =>
                    cx(
                        "w-full max-w-md",
                        isEntering && "duration-150 ease-out animate-in zoom-in-95",
                        isExiting && "duration-100 ease-in animate-out zoom-out-95",
                    )
                }
            >
                <Dialog role="alertdialog" className="flex flex-col gap-4 rounded-xl bg-primary p-6 shadow-xl outline-none">
                    <Heading slot="title" className="text-lg font-semibold text-primary">
                        {title}
                    </Heading>
                    <div className="text-sm text-tertiary">{children}</div>
                    <div className="flex justify-end gap-3">
                        <Button color="secondary" size="md" isDisabled={isPending} onClick={onCancel}>
                            Go back
                        </Button>
                        <Button
                            color={isDestructive ? "primary-destructive" : "primary"}
                            size="md"
                            isLoading={isPending}
                            showTextWhileLoading
                            onClick={onConfirm}
                        >
                            {confirmLabel}
                        </Button>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}
