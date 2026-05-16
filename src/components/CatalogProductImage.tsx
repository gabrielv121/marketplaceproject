import { useEffect, useMemo, useState } from "react";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import { pickBestProductImageUrl, isStockxPlaceholderImageUrl } from "@/lib/catalog-image-quality";
import { resolveFeaturedImageUrl } from "@/lib/catalog-images";

type Props = {
  product: Pick<CatalogProductSummary, "handle" | "featuredImageUrl" | "imageGallery" | "title">;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
};

function fallbackChain(product: Props["product"], failed: Set<string>): string | null {
  const candidates = [
    pickBestProductImageUrl(product.featuredImageUrl, product.imageGallery),
    product.featuredImageUrl?.trim(),
    ...(product.imageGallery ?? []).map((u) => u?.trim()),
    resolveFeaturedImageUrl({ ...product, featuredImageUrl: null, imageGallery: [] }),
  ].filter((u): u is string => Boolean(u));
  return (
    candidates.find((u) => !failed.has(u) && !isStockxPlaceholderImageUrl(u)) ??
    candidates.find((u) => !failed.has(u)) ??
    null
  );
}

export function CatalogProductImage({ product, alt, className, loading = "lazy" }: Props) {
  const initial = useMemo(() => resolveFeaturedImageUrl(product), [product]);
  const [src, setSrc] = useState<string | null>(initial);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setFailed(new Set());
    setSrc(resolveFeaturedImageUrl(product));
  }, [product.handle, product.featuredImageUrl, product.imageGallery]);

  if (!src) return null;

  return (
    <img
      src={src}
      alt={alt ?? product.title}
      className={className}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => {
        const nextFailed = new Set(failed);
        nextFailed.add(src);
        const next = fallbackChain(product, nextFailed);
        if (next && !nextFailed.has(next)) setSrc(next);
        else setSrc(null);
        setFailed(nextFailed);
      }}
    />
  );
}
