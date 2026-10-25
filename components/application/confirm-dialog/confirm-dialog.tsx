"use client";

import type { ReactNode } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    confirmLabel: string;
    isDestructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    children: ReactNode;
}

export function ConfirmDialog({ isOpen, title, confirmLabel, isDestructive, onConfirm, onCancel, children }: ConfirmDialogProps) {
    return (
        <ModalOverlay
            isOpen={isOpen}
            onOpenChange={(open) => !open && onCancel()}
            isDismissable
            className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4"
        >
            <Modal className="w-full max-w-md">
                <Dialog role="alertdialog" className="flex flex-col gap-4 rounded-xl bg-primary p-6 shadow-xl outline-none">
                    <Heading slot="title" className="text-lg font-semibold text-primary">
                        {title}
                    </Heading>
                    <div className="text-sm text-tertiary">{children}</div>
                    <div className="flex justify-end gap-3">
                        <Button color="secondary" size="md" onClick={onCancel}>
                            Go back
                        </Button>
                        <Button color={isDestructive ? "primary-destructive" : "primary"} size="md" onClick={onConfirm}>
                            {confirmLabel}
                        </Button>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}
