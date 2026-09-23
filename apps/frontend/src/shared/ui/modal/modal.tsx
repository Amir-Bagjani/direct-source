"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Button } from "@/shared/ui/button/button";
import { closeModal, prepareModalHistory } from "./modal-history";
import type { ModalProps } from "./modal.types";

export function Modal({ children, labelledBy, name, closeOnBack = true }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const t = useTranslations("common");
  const params = useSearchParams();
  const open = params.get("modal") === name;
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (closeOnBack) prepareModalHistory();
    element.showModal();
    return () => {
      element.close();
      trigger?.focus();
    };
  }, [open, closeOnBack]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        closeModal();
      }}
    >
      <Button className="dialog-close" variant="secondary" onClick={closeModal}>
        {t("close")}
      </Button>
      {children}
    </dialog>
  );
}
