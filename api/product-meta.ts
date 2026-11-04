import { SITE_URL, escapeXml, restGet, rpcPost } from "./_catalog";

export const config = { runtime: "edge" };

type ProductRow = {
  handle: string;
  title: string;
  brand: string | null;
  featured_image_url: string | null;
  image_gallery: string[] | null;
  price_min: number | string | null;
};

const SEO_BLOCK = /<!-- seo:start -->[\s\S]*?<!-- seo:end -->/;

async function loadProduct(handle: string): Promise<ProductRow | null> {
  const res = await restGet(
    `catalog_products?select=handle,title,brand,featured_image_url,image_gallery,price_min&published=eq.true&handle=eq.${encodeURIComponent(handle)}&limit=1`,
  );
  const rows = (await res.json()) as ProductRow[];
  return rows[0] ?? null;
}

/** StockX thumbnails are 140px wide; ask its image CDN for a 1200x630 JPEG that fits link previews. */
function previewImage(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname !== "images.stockx.com") return raw;
    for (const key of ["w", "h", "dpr", "trim", "fm", "q", "auto"]) u.searchParams.delete(key);
    u.searchParams.set("fit", "fill");
    u.searchParams.set("bg", "FFFFFF");
    u.searchParams.set("w", "1200");
    u.searchParams.set("h", "630");
    u.searchParams.set("fm", "jpg");
    u.searchParams.set("q", "85");
    return u.toString();
  } catch {
    return raw;
  }
}

/** Some StockX photos only exist at the stored size; keep the original if the large one 404s. */
async function workingPreviewImage(photo: string): Promise<string> {
  const large = previewImage(photo);
  if (large === photo) return photo;
  try {
    const res = await fetch(large, { method: "HEAD" });
    return res.ok ? large : photo;
  } catch {
    return photo;
  }
}

type PlatformOfferRow = { quantity_available: number; size_prices: Record<string, number> | null };
type ListingRow = { price_cents: number };

/** Every buyable ask on the page: in-stock VRNA size prices plus active peer listings. */
async function loadAskCents(handle: string): Promise<number[]> {
  const [offers, listings] = await Promise.all([
    rpcPost<PlatformOfferRow[]>("list_platform_offer", { p_product_handle: handle }).catch(() => []),
    rpcPost<ListingRow[]>("list_active_listings", { p_product_handle: handle }).catch(() => []),
  ]);
  const cents: number[] = [];
  for (const offer of offers) {
    if (offer.quantity_available > 0) cents.push(...Object.values(offer.size_prices ?? {}));
  }
  cents.push(...listings.map((l) => l.price_cents));
  return cents.filter((c) => Number.isFinite(c) && c > 0);
}

/** schema.org Product markup so Google can show price and availability in results. */
function productJsonLd(p: ProductRow, image: string, url: string, description: string, askCents: number[]): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    image: [image],
    description,
    url,
    sku: p.handle,
  };
  if (p.brand) data.brand = { "@type": "Brand", name: p.brand };
  if (askCents.length) {
    data.offers = {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: (Math.min(...askCents) / 100).toFixed(2),
      highPrice: (Math.max(...askCents) / 100).toFixed(2),
      offerCount: askCents.length,
      availability: "https://schema.org/InStock",
      url,
    };
  }
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

function productTags(p: ProductRow, image: string, askCents: number[]): string {
  const url = `${SITE_URL}/product/${encodeURIComponent(p.handle)}`;
  const price = askCents.length ? Math.min(...askCents) / 100 : Number(p.price_min);
  const title = `${p.title} | VRNA`;
  const description = [
    `Shop the ${p.title} on VRNA.`,
    Number.isFinite(price) && price > 0 ? `From $${Math.round(price)}.` : "",
    "Every item verified before it ships.",
  ]
    .filter(Boolean)
    .join(" ");
  const t = escapeXml(title);
  const d = escapeXml(description);
  const img = escapeXml(image);
  return [
    "<!-- seo:start -->",
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${escapeXml(url)}" />`,
    `<meta property="og:site_name" content="VRNA" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:url" content="${escapeXml(url)}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    p.brand ? `<meta property="product:brand" content="${escapeXml(p.brand)}" />` : "",
    productJsonLd(p, image, url, description, askCents),
    "<!-- seo:end -->",
  ]
    .filter(Boolean)
    .join("\n    ");
}

export default async function handler(request: Request): Promise<Response> {
  const reqUrl = new URL(request.url);
  const handle = (reqUrl.searchParams.get("handle") ?? "").trim().toLowerCase();
  const shell = await fetch(new URL("/index.html", reqUrl.origin));
  let html = await shell.text();
  let status = 200;
  try {
    const product = handle ? await loadProduct(handle) : null;
    if (product) {
      const photo = product.featured_image_url || product.image_gallery?.find(Boolean);
      const [image, askCents] = await Promise.all([
        photo ? workingPreviewImage(photo) : Promise.resolve(`${SITE_URL}/apple-touch-icon.png`),
        loadAskCents(product.handle),
      ]);
      const tags = productTags(product, image, askCents);
      html = html.replace(SEO_BLOCK, () => tags);
    }
    else status = 404;
  } catch {
    // Fall back to the default tags in index.html.
  }
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
