import { SITE_URL, escapeXml, restGet } from "./_catalog";
import { BLOCKED_CATALOG_HANDLES } from "../src/lib/blocked-catalog-handles";

export const config = { runtime: "edge" };

const PAGE_SIZE = 1000;
const MAX_PRODUCTS = 45000;

const STATIC_PATHS = [
  "/",
  "/catalog",
  "/catalog/men",
  "/catalog/women",
  "/catalog/kids",
  "/catalog/accessories",
  "/new",
  "/brands",
  "/shop/activity/soccer",
  "/shop/activity/football",
  "/shop/activity/basketball",
  "/shop/activity/running",
  "/shop/activity/training",
  "/shop/activity/tennis",
  "/sell",
  "/help",
  "/about",
  "/legal/terms",
  "/legal/privacy",
  "/legal/buyer-protection",
  "/legal/fees",
  "/legal/shipping-returns",
];

type Row = { handle: string; updated_at: string | null };

const LISTABLE = "published=eq.true&has_photo=eq.true&tags=cs.%7Bkicksdb%7D";

async function productPage(offset: number, count: boolean): Promise<{ rows: Row[]; total: number | null }> {
  const res = await restGet(
    `catalog_products?select=handle,updated_at&${LISTABLE}&order=handle.asc&offset=${offset}&limit=${PAGE_SIZE}`,
    { count },
  );
  const rows = (await res.json()) as Row[];
  const range = res.headers.get("content-range");
  const total = count && range ? Number(range.split("/")[1]) || null : null;
  return { rows, total };
}

export default async function handler(): Promise<Response> {
  try {
    const first = await productPage(0, true);
    const total = Math.min(first.total ?? first.rows.length, MAX_PRODUCTS);
    const offsets: number[] = [];
    for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) offsets.push(offset);
    const rest = await Promise.all(offsets.map((offset) => productPage(offset, false)));
    const products = [first, ...rest].flatMap((p) => p.rows).filter((r) => !BLOCKED_CATALOG_HANDLES.has(r.handle));

    const urls = [
      ...STATIC_PATHS.map((path) => `  <url><loc>${SITE_URL}${path}</loc></url>`),
      ...products.map((row) => {
        const loc = `${SITE_URL}/product/${encodeURIComponent(row.handle)}`;
        const lastmod = row.updated_at ? `<lastmod>${row.updated_at.slice(0, 10)}</lastmod>` : "";
        return `  <url><loc>${escapeXml(loc)}</loc>${lastmod}</url>`;
      }),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new Response("Sitemap unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
