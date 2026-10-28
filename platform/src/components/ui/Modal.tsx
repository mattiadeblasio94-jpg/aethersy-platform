import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Nasconde la X: utile per i flussi guidati (es. ConnectionModal). */
  hideClose?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  hideClose = false,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border border-secondary/20 bg-bg-card shadow-glow",
            "data-[state=open]:animate-fade-in",
            SIZE_CLASSES[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-secondary/10 px-5 py-4">
            <div>
              <Dialog.Title className="font-display text-lg font-semibold text-text-primary">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-sm text-text-secondary">
                  {description}
                </Dialog.Description>
              )}
            </div>
            {!hideClose && (
              <Dialog.Close
                aria-label="Chiudi"
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Dialog.Close>
            )}
          </div>

          {children && <div className="px-5 py-4">{children}</div>}

          {footer && (
            <div className="flex items-center justify-end gap-3 border-t border-secondary/10 px-5 py-4">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
