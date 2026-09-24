"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
import { DialogTitle, DialogDescription, DialogHeader } from "@/shared/ui/dialog/dialog";
import { Modal } from "@/shared/ui/modal/modal";
import { openModal } from "@/shared/ui/modal/modal-history";

export function AboutMarketplace() {
  const t = useTranslations("home");
  return (
    <>
      <Button className="justify-self-start" onClick={() => openModal("about")}>
        {t("about")}
      </Button>
      <Modal name="about" labelledBy="about-heading">
        <DialogHeader>
          <DialogTitle id="about-heading">{t("about")}</DialogTitle>
          <DialogDescription>{t("aboutBody")}</DialogDescription>
        </DialogHeader>
      </Modal>
    </>
  );
}
