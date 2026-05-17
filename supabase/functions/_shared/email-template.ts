/** Branded HTML + plain-text order emails (matches app dark theme + purple accent). */

const BRAND = {
  name: "EXCH.",
  bg: "#0a0a0b",
  surface: "#141416",
  surface2: "#1c1c1f",
  border: "#2a2a2e",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  accent: "#9d00ff",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatMoney(cents: number | null | undefined, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents ?? 0) / 100);
}

export function formatOrderId(tradeId: string): string {
  return `#${tradeId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export type EmailProductCard = {
  title: string;
  brand?: string | null;
  handle: string;
  sizeLabel: string;
  imageUrl?: string | null;
  productUrl: string;
  siteUrl: string;
};

export type OrderDetailRow = { label: string; value: string };

export type OrderEmailContent = {
  preheader: string;
  headline: string;
  paragraphs: string[];
  product: EmailProductCard;
  orderRows?: OrderDetailRow[];
  cta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
};

function isSafeImageUrl(url: string | null | undefined): url is string {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function productImageHtml(product: EmailProductCard): string {
  const alt = escapeHtml(product.title);
  if (isSafeImageUrl(product.imageUrl)) {
    return `<img src="${escapeHtml(product.imageUrl)}" alt="${alt}" width="120" height="120" style="display:block;width:120px;height:120px;object-fit:contain;border-radius:8px;background:#1c1c1f;" />`;
  }
  return '<div style="display:block;width:120px;height:120px;border-radius:8px;background:#1c1c1f;border:1px solid #2a2a2e;line-height:120px;text-align:center;font-size:22px;font-weight:700;color:#9d00ff;">EXCH.</div>';
}

function orderRowsHtml(rows: OrderDetailRow[]): string {
  if (!rows.length) return "";
  const cells = rows
    .map(
      (row) => `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#a1a1aa;width:120px;vertical-align:top;">${escapeHtml(row.label)}</td>
        <td style="padding:8px 0;font-size:14px;color:#f4f4f5;font-weight:500;vertical-align:top;">${escapeHtml(row.value)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:4px;border-top:1px solid #2a2a2e;padding-top:4px;">${cells}</table>`;
}

function orderRowsText(rows: OrderDetailRow[]): string {
  if (!rows.length) return "";
  return rows.map((r) => `${r.label}: ${r.value}`).join("\n");
}

export function renderOrderEmail(content: OrderEmailContent): { html: string; text: string } {
  const { preheader, headline, paragraphs, product, orderRows = [], cta, secondaryCta } = content;
  const brandLine = product.brand?.trim()
    ? `${escapeHtml(product.brand)} · Size ${escapeHtml(product.sizeLabel)}`
    : `Size ${escapeHtml(product.sizeLabel)}`;

  const introHtml = paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#f4f4f5;">${escapeHtml(p)}</p>`)
    .join("");

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
        <tr>
          <td style="border-radius:8px;background:${BRAND.accent};">
            <a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</a>
          </td>
        </tr>
      </table>`
    : "";

  const secondaryHtml = secondaryCta
    ? `<p style="margin:0 0 20px;font-size:13px;"><a href="${escapeHtml(secondaryCta.href)}" style="color:#9d00ff;text-decoration:underline;">${escapeHtml(secondaryCta.label)}</a></p>`
    : "";

  const homeUrl = product.siteUrl.replace(/\/$/, "");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 20px;border-bottom:1px solid ${BRAND.border};">
              <a href="${escapeHtml(homeUrl)}" style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.text};text-decoration:none;">${BRAND.name}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.text};">${escapeHtml(headline)}</h1>
              ${introHtml}
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px;background:${BRAND.surface2};border:1px solid ${BRAND.border};border-radius:10px;">
                <tr>
                  <td style="padding:16px;width:120px;vertical-align:top;">
                    ${productImageHtml(product)}
                  </td>
                  <td style="padding:16px 16px 16px 0;vertical-align:top;">
                    <p style="margin:0 0 6px;font-size:16px;font-weight:600;line-height:1.35;color:${BRAND.text};">
                      <a href="${escapeHtml(product.productUrl)}" style="color:${BRAND.text};text-decoration:none;">${escapeHtml(product.title)}</a>
                    </p>
                    <p style="margin:0 0 4px;font-size:13px;color:${BRAND.muted};">${brandLine}</p>
                    ${orderRowsHtml(orderRows)}
                  </td>
                </tr>
              </table>
              ${ctaHtml}
              ${secondaryHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;background:${BRAND.surface2};border-top:1px solid ${BRAND.border};">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">
                Verified resale on ${BRAND.name} — payments held until authentication and delivery.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-size:11px;color:#52525b;text-align:center;">
          You received this email about activity on your ${BRAND.name} account.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    BRAND.name,
    "—".repeat(24),
    headline,
    "",
    ...paragraphs,
    "",
    product.title,
    product.brand ? `${product.brand} · Size ${product.sizeLabel}` : `Size ${product.sizeLabel}`,
    orderRowsText(orderRows),
    "",
    product.productUrl,
  ];
  if (cta) textParts.push("", `${cta.label}: ${cta.href}`);
  if (secondaryCta) textParts.push(`${secondaryCta.label}: ${secondaryCta.href}`);

  return { html, text: textParts.filter(Boolean).join("\n") };
}

export type AuthEmailContent = {
  preheader: string;
  headline: string;
  paragraphs: string[];
  cta?: { label: string; href: string };
  otpCode?: string;
  siteUrl: string;
};

/** Branded auth emails (signup, magic link, password reset) — no product card. */
export function renderAuthEmail(content: AuthEmailContent): { html: string; text: string } {
  const { preheader, headline, paragraphs, cta, otpCode, siteUrl } = content;
  const homeUrl = siteUrl.replace(/\/$/, "");

  const introHtml = paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#f4f4f5;">${escapeHtml(p)}</p>`)
    .join("");

  const otpHtml = otpCode
    ? `<p style="margin:16px 0 0;font-size:13px;color:#a1a1aa;">Or enter this code:</p>
       <p style="margin:8px 0 0;font-size:22px;font-weight:700;letter-spacing:0.2em;color:#f4f4f5;">${escapeHtml(otpCode)}</p>`
    : "";

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
        <tr>
          <td style="border-radius:8px;background:${BRAND.accent};">
            <a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</a>
          </td>
        </tr>
      </table>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 20px;border-bottom:1px solid ${BRAND.border};">
              <a href="${escapeHtml(homeUrl)}" style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.text};text-decoration:none;">${BRAND.name}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.text};">${escapeHtml(headline)}</h1>
              ${introHtml}
              ${ctaHtml}
              ${otpHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;background:${BRAND.surface2};border-top:1px solid ${BRAND.border};">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">
                If you did not request this, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;font-size:11px;color:#52525b;text-align:center;">
          Account email from ${BRAND.name}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [BRAND.name, "—".repeat(24), headline, "", ...paragraphs];
  if (cta) textParts.push("", `${cta.label}: ${cta.href}`);
  if (otpCode) textParts.push("", `Code: ${otpCode}`);

  return { html, text: textParts.join("\n") };
}
