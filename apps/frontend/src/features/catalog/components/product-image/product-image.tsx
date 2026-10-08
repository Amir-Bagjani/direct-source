import Image from "next/image";

export function ProductImage({
  src,
  alt,
  fallback,
}: {
  src: string | undefined;
  alt: string;
  fallback: string;
}) {
  return (
    <div className="relative aspect-square overflow-hidden bg-muted">
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
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
