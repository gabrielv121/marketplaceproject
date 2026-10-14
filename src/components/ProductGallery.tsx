import { useEffect, useMemo, useState } from "react";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import { productSlideSources } from "@/lib/product-gallery";
import styles from "@/pages/ProductPage.module.css";

type Props = {
  product: Pick<CatalogProductSummary, "handle" | "featuredImageUrl" | "imageGallery" | "title">;
};

function probeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve(img.naturalWidth > 20);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export function ProductGallery({ product }: Props) {
  const sources = useMemo(() => productSlideSources(product), [product]);
  const [slides, setSlides] = useState<string[]>(sources.known);
  const [index, setIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  useEffect(() => {
    setSlides(sources.known);
    setIndex(0);
    if (sources.extras.length === 0) return;
    let cancelled = false;
    void Promise.all(sources.extras.map(async (url) => ((await probeImage(url)) ? url : null))).then((results) => {
      if (cancelled) return;
      const found = results.filter((url): url is string => Boolean(url));
      if (found.length === 0) return;
      setSlides((current) => {
        const seen = new Set(current);
        const next = [...current];
        for (const url of found) {
          if (seen.has(url) || next.length >= 8) continue;
          seen.add(url);
          next.push(url);
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [sources]);

  if (slides.length === 0) return <div className={styles.ph} />;

  const count = slides.length;
  const current = slides[Math.min(index, count - 1)];
  const go = (delta: number) => setIndex((value) => (value + delta + count) % count);

  return (
    <div className={styles.gallery}>
      <div
        className={styles.galleryStage}
        onTouchStart={(event) => setTouchStart(event.changedTouches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          if (touchStart == null || count < 2) return;
          const delta = (event.changedTouches[0]?.clientX ?? touchStart) - touchStart;
          if (delta > 40) go(-1);
          else if (delta < -40) go(1);
          setTouchStart(null);
        }}
      >
        <img
          src={current}
          alt={`${product.title}, photo ${Math.min(index, count - 1) + 1} of ${count}`}
          className={styles.image}
          referrerPolicy="no-referrer"
          onError={() => {
            setSlides((currentSlides) => currentSlides.filter((url) => url !== current));
            setIndex(0);
          }}
        />
        {count > 1 ? (
          <>
            <button type="button" className={`${styles.galleryNav} ${styles.galleryNavPrev}`} onClick={() => go(-1)} aria-label="Previous photo">
              ‹
            </button>
            <button type="button" className={`${styles.galleryNav} ${styles.galleryNavNext}`} onClick={() => go(1)} aria-label="Next photo">
              ›
            </button>
          </>
        ) : null}
      </div>
      {count > 1 ? (
        <div className={styles.dots} role="tablist" aria-label="Product photos">
          {slides.map((url, dotIndex) => (
            <button
              key={url}
              type="button"
              role="tab"
              aria-selected={dotIndex === index}
              aria-label={`Photo ${dotIndex + 1}`}
              className={dotIndex === index ? `${styles.dot} ${styles.dotOn}` : styles.dot}
              onClick={() => setIndex(dotIndex)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
