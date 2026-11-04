import { expect, test, type Page } from "@playwright/test";

const productLinks = (page: Page) => page.locator('a[href^="/product/"]');

/** Vercel functions (sitemap, bot previews) only exist on deployed builds, not `vite dev`. */
const servesApi = (baseURL: string | undefined) => !/localhost|127\.0\.0\.1/.test(baseURL ?? "");

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("home page shows products without script errors", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/VRNA/);
  await expect(productLinks(page).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("search returns results and suggestions", async ({ page }) => {
  await page.goto("/search?q=jordan");
  await expect(page.getByText(/\d+ results? for "jordan"/)).toBeVisible();
  await expect(productLinks(page).first()).toBeVisible();

  const box = page.getByRole("combobox", { name: "Search products" });
  await box.fill("");
  await box.pressSequentially("dunk low", { delay: 30 });
  await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible();
});

test("product page loads with sizes and a buy panel", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/search?q=jordan");
  const first = productLinks(page).first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page).toHaveURL(/\/product\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Lowest ask", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Size", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("sitemap lists product pages", async ({ request, baseURL }, testInfo) => {
  test.skip(!servesApi(baseURL), "needs a deployed build");
  test.skip(testInfo.project.name !== "desktop", "HTTP only; one device is enough");
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  expect(xml).toContain("<urlset");
  expect(xml).toMatch(/<loc>https:\/\/vrna\.io\/product\/[^<]+<\/loc>/);
});

test("crawlers get product tags and structured data", async ({ request, baseURL }, testInfo) => {
  test.skip(!servesApi(baseURL), "needs a deployed build");
  test.skip(testInfo.project.name !== "desktop", "HTTP only; one device is enough");
  const xml = await (await request.get("/sitemap.xml")).text();
  const path = xml.match(/<loc>https:\/\/vrna\.io(\/product\/[^<]+)<\/loc>/)?.[1];
  expect(path).toBeTruthy();
  const res = await request.get(path!, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('property="og:title"');
  const ld = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
  expect(ld).toBeTruthy();
  expect(JSON.parse(ld!)["@type"]).toBe("Product");
});
