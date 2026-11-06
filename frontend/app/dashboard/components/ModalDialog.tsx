"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { InterfaceIcon } from "./InterfaceIcon";

export default function ModalDialog({
  title,
  onClose,
  children,
  actions,
  returnFocusRef,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous =
      returnFocusRef?.current ?? (document.activeElement as HTMLElement | null);
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [returnFocusRef]);

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        if (event.key !== "Tab") return;
        const elements = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex='0']",
          ),
        ].filter(
          (element) =>
            element.getClientRects().length > 0 && !element.closest("[hidden]"),
        );
        const first = elements[0],
          last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      className="workspace-modal"
    >
      <header className="workspace-modal-header">
        <h2 id={titleId} className="min-w-0 text-base font-semibold">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button
            type="button"
            className="app-icon-button"
            aria-label="Fechar janela"
            onClick={onClose}
          >
            <InterfaceIcon name="close" className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="workspace-modal-body">{children}</div>
    </dialog>,
    document.body,
  );
}
