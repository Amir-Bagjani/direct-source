"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Button } from "@/shared/ui/button/button";
import { Dialog, DialogContent, DialogFooter } from "@/shared/ui/dialog/dialog";
import { closeModal, prepareModalHistory } from "./modal-history";
import type { ModalProps } from "./modal.types";

export function Modal({ children, labelledBy, name, closeOnBack = true }: ModalProps) {
  const t = useTranslations("common");
  const params = useSearchParams();
  const open = params.get("modal") === name;
  useEffect(() => {
    if (open && closeOnBack) prepareModalHistory();
  }, [open, closeOnBack]);
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeModal();
      }}
    >
      <DialogContent aria-labelledby={labelledBy} showCloseButton={false}>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={closeModal}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
