"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
import { Modal } from "@/shared/ui/modal/modal";
import { openModal } from "@/shared/ui/modal/modal-history";

export function AboutMarketplace() {
  const t = useTranslations("home");
  return (
    <>
      <Button onClick={() => openModal("about")}>{t("about")}</Button>
      <Modal name="about" labelledBy="about-heading">
        <h2 id="about-heading">{t("about")}</h2>
        <p>{t("aboutBody")}</p>
      </Modal>
    </>
  );
}
