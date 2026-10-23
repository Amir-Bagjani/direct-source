"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button/button";
import { ProductImage } from "../product-image/product-image";

export function ProductGallery({ name, images }: { name: string; images: string[] }) {
  const t = useTranslations("catalog");
  const format = useFormatter();
  const [index, setIndex] = useState(0);
  return (
    <section aria-label={t("gallery.title")} className="grid content-start gap-4">
      <ProductImage
        src={images[index] ?? images[0]}
        alt={name}
        fallback={t("imageFallback")}
        fit="contain"
        loading="eager"
        className="aspect-[4/3]"
        sizes="(min-width: 1024px) 50vw, 100vw"
      />
      {images.length > 1 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              disabled={index === 0}
              onClick={() => setIndex((current) => current - 1)}
            >
              {t("gallery.previous")}
            </Button>
            <p role="status" className="text-sm text-muted-foreground">
              {t("gallery.position", {
                index: format.number(index + 1),
                total: format.number(images.length),
              })}
            </p>
            <Button
              variant="outline"
              disabled={index === images.length - 1}
              onClick={() => setIndex((current) => current + 1)}
            >
              {t("gallery.next")}
            </Button>
          </div>
          <div
            role="group"
            aria-label={t("gallery.thumbnails")}
            className="flex gap-3 overflow-x-auto pb-2"
          >
            {images.map((src, position) => (
              <Button
                key={`${position}-${src}`}
                variant={position === index ? "default" : "outline"}
                className="size-20 shrink-0 overflow-hidden p-1"
                aria-label={t("gallery.select", { number: format.number(position + 1) })}
                aria-pressed={position === index}
                onClick={() => setIndex(position)}
              >
                <ProductImage src={src} alt="" fallback="" className="size-full" sizes="80px" />
              </Button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
