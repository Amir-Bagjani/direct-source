import Image from "next/image";
import { cn } from "@/shared/ui/cn";

export function ProductImage({
  src,
  alt,
  fallback,
  className,
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw",
  fit = "cover",
  loading = "lazy",
}: {
  src: string | undefined;
  alt: string;
  fallback: string;
  className?: string;
  sizes?: string;
  fit?: "cover" | "contain";
  loading?: "eager" | "lazy";
}) {
  return (
    <div className={cn("relative aspect-square overflow-hidden bg-muted", className)}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          loading={loading}
          className={fit === "contain" ? "object-contain" : "object-cover"}
          unoptimized
        />
      ) : (
        <div className="flex size-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {fallback}
        </div>
      )}
    </div>
  );
}
