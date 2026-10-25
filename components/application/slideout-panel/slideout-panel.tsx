"use client";

import type { ReactNode } from "react";
import { XClose } from "@untitledui/icons";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";

interface SlideoutPanelProps {
    isOpen: boolean;
    /** Called for every way of closing: the X button, Esc, and clicking outside. */
    onClose: () => void;
    title: ReactNode;
    description?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
}

export const SlideoutPanel = ({ isOpen, onClose, title, description, footer, children }: SlideoutPanelProps) => (
    <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable className="fixed inset-0 z-50 bg-overlay/70">
        <Modal className="fixed inset-y-0 right-0 w-full max-w-3xl">
            <Dialog className="flex h-full flex-col bg-primary shadow-xl outline-none">
                <header className="flex items-start justify-between gap-4 border-b border-secondary px-6 py-4">
                    <div className="flex min-w-0 flex-col gap-1">
                        <Heading slot="title" className="text-lg font-semibold text-primary">
                            {title}
                        </Heading>
                        {description}
                    </div>
                    <Button color="tertiary" size="sm" iconLeading={<XClose data-icon />} aria-label="Close" onClick={onClose} />
                </header>
                {/* Children must not shrink, or a long body squashes media like <audio> down to zero height. */}
                <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 *:shrink-0">{children}</div>
                {footer && (
                    <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-secondary px-6 py-4">{footer}</footer>
                )}
            </Dialog>
        </Modal>
    </ModalOverlay>
);
