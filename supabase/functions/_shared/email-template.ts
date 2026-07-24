/** Branded HTML + plain-text order emails (matches app dark theme + purple accent). */

const BRAND = {
  name: "VRNA",
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

export type RelatedEmailProduct = {
  title: string;
  brand?: string | null;
  handle: string;
  imageUrl?: string | null;
  productUrl: string;
};

export type OrderDetailRow = { label: string; value: string; emphasis?: boolean };

export type OrderEmailContent = {
  preheader: string;
  headline: string;
  paragraphs: string[];
  product: EmailProductCard;
  orderRows?: OrderDetailRow[];
  relatedProducts?: RelatedEmailProduct[];
  cta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
};

function brandWordmarkHtml(homeUrl: string, fontSize = "28px"): string {
  return `<a href="${escapeHtml(homeUrl)}" style="font-size:${fontSize};font-weight:700;letter-spacing:-0.02em;color:${BRAND.text};text-decoration:none;line-height:1;">V<span style="color:${BRAND.accent};font-weight:800;">R</span>NA</a>`;
}

function emailSupportFooterHtml(homeUrl: string, note: string): string {
  const year = new Date().getFullYear();
  return `<td align="center" style="padding:24px 8px 8px;border-top:1px solid ${BRAND.border};">
    <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:${BRAND.text};">Need help?</p>
    <p style="margin:0 0 8px;font-size:13px;color:${BRAND.muted};">Our team is here for you.</p>
    <p style="margin:0 0 24px;font-size:13px;">
      <a href="mailto:support@vrna.io" style="color:${BRAND.accent};text-decoration:underline;">support@vrna.io</a>
    </p>
    ${brandWordmarkHtml(homeUrl, "20px")}
    <p style="margin:16px 0 0;font-size:11px;line-height:1.5;color:#52525b;">
      © ${year} ${BRAND.name}. All rights reserved.<br />
      ${escapeHtml(note)}
    </p>
  </td>`;
}

function isSafeImageUrl(url: string | null | undefined): url is string {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function productImageHtml(product: Pick<EmailProductCard, "title" | "imageUrl">, size = 120): string {
  const alt = escapeHtml(product.title);
  if (isSafeImageUrl(product.imageUrl)) {
    return `<img src="${escapeHtml(product.imageUrl)}" alt="${alt}" width="${size}" height="${size}" style="display:block;width:${size}px;height:${size}px;object-fit:contain;border-radius:8px;background:${BRAND.surface2};" />`;
  }
  return `<div style="display:block;width:${size}px;height:${size}px;border-radius:8px;background:${BRAND.surface2};border:1px solid ${BRAND.border};line-height:${size}px;text-align:center;font-size:18px;font-weight:700;color:${BRAND.accent};">VRNA</div>`;
}

function orderRowsHtml(rows: OrderDetailRow[]): string {
  if (!rows.length) return "";
  const cells = rows
    .map((row) => {
      const valueStyle = row.emphasis
        ? `padding:10px 0 8px;font-size:15px;color:${BRAND.text};font-weight:700;vertical-align:top;border-top:1px solid ${BRAND.border};`
        : `padding:8px 0;font-size:14px;color:${BRAND.text};font-weight:500;vertical-align:top;`;
      const labelStyle = row.emphasis
        ? `padding:10px 0 8px;font-size:13px;color:${BRAND.text};font-weight:700;width:140px;vertical-align:top;border-top:1px solid ${BRAND.border};`
        : `padding:8px 0;font-size:13px;color:${BRAND.muted};width:140px;vertical-align:top;`;
      return `
      <tr>
        <td style="${labelStyle}">${escapeHtml(row.label)}</td>
        <td style="${valueStyle}">${escapeHtml(row.value)}</td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px;border-top:1px solid ${BRAND.border};">${cells}</table>`;
}

function orderRowsText(rows: OrderDetailRow[]): string {
  if (!rows.length) return "";
  return rows.map((r) => `${r.label}: ${r.value}`).join("\n");
}

function relatedProductsHtml(products: RelatedEmailProduct[]): string {
  if (!products.length) return "";
  const rows = products
    .map(
      (p) => `
      <tr>
        <td style="padding:12px 0;border-top:1px solid ${BRAND.border};width:72px;vertical-align:middle;">
          <a href="${escapeHtml(p.productUrl)}" style="text-decoration:none;">${productImageHtml(p, 64)}</a>
        </td>
        <td style="padding:12px 0 12px 14px;border-top:1px solid ${BRAND.border};vertical-align:middle;">
          ${p.brand?.trim() ? `<p style="margin:0 0 4px;font-size:11px;letter-spacing:0.06em;color:${BRAND.accent};text-transform:uppercase;">${escapeHtml(p.brand.trim())}</p>` : ""}
          <p style="margin:0;font-size:14px;font-weight:600;line-height:1.35;">
            <a href="${escapeHtml(p.productUrl)}" style="color:${BRAND.text};text-decoration:none;">${escapeHtml(p.title)}</a>
          </p>
        </td>
      </tr>`,
    )
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:28px;">
      <tr>
        <td style="padding:0 0 12px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.12em;color:${BRAND.accent};text-transform:uppercase;">You may also like</p>
        </td>
      </tr>
      <tr>
        <td>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px;padding:4px 16px;">
            ${rows}
          </table>
        </td>
      </tr>
    </table>`;
}

export function renderOrderEmail(content: OrderEmailContent): { html: string; text: string } {
  const {
    preheader,
    headline,
    paragraphs,
    product,
    orderRows = [],
    relatedProducts = [],
    cta,
    secondaryCta,
  } = content;
  const homeUrl = product.siteUrl.replace(/\/$/, "");
  const brandLine = product.brand?.trim()
    ? `${escapeHtml(product.brand)} · Size ${escapeHtml(product.sizeLabel)}`
    : `Size ${escapeHtml(product.sizeLabel)}`;

  const introHtml = paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(p)}</p>`)
    .join("");

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
        <tr>
          <td style="border-radius:10px;background:${BRAND.accent};">
            <a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</a>
          </td>
        </tr>
      </table>`
    : "";

  const secondaryHtml = secondaryCta
    ? `<p style="margin:0 0 12px;font-size:13px;"><a href="${escapeHtml(secondaryCta.href)}" style="color:${BRAND.accent};text-decoration:underline;">${escapeHtml(secondaryCta.label)}</a></p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;padding:0;background:#000000;font-family:'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#000000;padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;">
          <tr>
            <td style="padding:0 4px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size:12px;color:#71717a;">${BRAND.name} order update</td>
                  <td align="right" style="font-size:12px;">
                    <a href="${escapeHtml(homeUrl)}" style="color:#71717a;text-decoration:underline;">View in browser</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 0 24px;">
              ${brandWordmarkHtml(homeUrl, "28px")}
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 8px;">
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;color:${BRAND.text};">${escapeHtml(headline)}</h1>
              ${introHtml}
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px;">
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
              ${relatedProductsHtml(relatedProducts)}
            </td>
          </tr>
          <tr>
            ${emailSupportFooterHtml(homeUrl, `You received this email about activity on your ${BRAND.name} account.`)}
          </tr>
        </table>
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
  if (relatedProducts.length) {
    textParts.push("", "You may also like");
    for (const related of relatedProducts) {
      textParts.push(`${related.title}: ${related.productUrl}`);
    }
  }

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
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(p)}</p>`)
    .join("");

  const otpHtml = otpCode
    ? `<p style="margin:16px 0 0;font-size:13px;color:${BRAND.muted};">Or enter this code:</p>
       <p style="margin:8px 0 0;font-size:22px;font-weight:700;letter-spacing:0.2em;color:${BRAND.text};">${escapeHtml(otpCode)}</p>`
    : "";

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
        <tr>
          <td style="border-radius:10px;background:${BRAND.accent};">
            <a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</a>
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
<body style="margin:0;padding:0;background:#000000;font-family:'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#000000;padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">
          <tr>
            <td align="center" style="padding:8px 0 24px;">
              ${brandWordmarkHtml(homeUrl, "28px")}
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 8px;">
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;color:${BRAND.text};">${escapeHtml(headline)}</h1>
              ${introHtml}
              ${ctaHtml}
              ${otpHtml}
            </td>
          </tr>
          <tr>
            ${emailSupportFooterHtml(homeUrl, "If you did not request this, you can ignore this email.")}
          </tr>
        </table>
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

const WELCOME_FEATURES: { title: string; body: string; glyph: string }[] = [
  { title: "BUY", body: "Shop the hottest sneakers at the best prices.", glyph: "B" },
  { title: "SELL", body: "List your sneakers in minutes and reach more buyers.", glyph: "S" },
  { title: "BID", body: "Place bids on rare pairs and win your grails.", glyph: "D" },
  { title: "AUTHENTIC", body: "Every item is authenticated by our experts.", glyph: "A" },
  { title: "TRACK", body: "Track every step of your order in real time.", glyph: "T" },
];

export type WelcomeEmailContent = {
  preheader: string;
  /** Small purple eyebrow above the hero headline */
  eyebrow?: string;
  headline: string;
  paragraphs: string[];
  cta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  siteUrl: string;
};

/** Full welcome / onboarding email — mockup-inspired layout with official wordmark. */
export function renderWelcomeEmail(content: WelcomeEmailContent): { html: string; text: string } {
  const {
    preheader,
    eyebrow = "WELCOME TO VRNA",
    headline,
    paragraphs,
    cta,
    secondaryCta,
    siteUrl,
  } = content;
  const homeUrl = siteUrl.replace(/\/$/, "");
  const year = new Date().getFullYear();

  const introHtml = paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(p)}</p>`)
    .join("");

  const ctaHtml = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 12px;">
      <tr>
        <td style="border-radius:10px;background:${BRAND.accent};">
          <a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</a>
        </td>
      </tr>
    </table>`;

  const secondaryHtml = secondaryCta
    ? `<p style="margin:0 0 8px;font-size:13px;"><a href="${escapeHtml(secondaryCta.href)}" style="color:${BRAND.accent};text-decoration:underline;">${escapeHtml(secondaryCta.label)}</a></p>`
    : "";

  const featureRows = WELCOME_FEATURES.map(
    (f) => `
      <tr>
        <td style="padding:10px 0;vertical-align:top;width:48px;">
          <div style="width:40px;height:40px;border-radius:10px;background:${BRAND.surface2};border:1px solid ${BRAND.border};text-align:center;line-height:40px;font-size:14px;font-weight:800;color:${BRAND.accent};">${f.glyph}</div>
        </td>
        <td style="padding:10px 0 10px 12px;vertical-align:top;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:0.06em;color:${BRAND.text};">${f.title}</p>
          <p style="margin:0;font-size:13px;line-height:1.45;color:${BRAND.muted};">${escapeHtml(f.body)}</p>
        </td>
      </tr>`,
  ).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;padding:0;background:#000000;font-family:'DM Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#000000;padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;">
          <tr>
            <td style="padding:0 4px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size:12px;color:#71717a;">Welcome to ${BRAND.name}</td>
                  <td align="right" style="font-size:12px;">
                    <a href="${escapeHtml(homeUrl)}" style="color:#71717a;text-decoration:underline;">View in browser</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 0 28px;">
              ${brandWordmarkHtml(homeUrl, "32px")}
              <p style="margin:10px 0 0;font-size:11px;letter-spacing:0.14em;color:${BRAND.muted};text-transform:uppercase;">Sneakers · Marketplace · Community</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 28px;">
              <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.12em;color:${BRAND.accent};text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
              <h1 style="margin:0 0 16px;font-size:28px;line-height:1.25;font-weight:700;color:${BRAND.text};">${escapeHtml(headline)}</h1>
              ${introHtml}
              ${ctaHtml}
              ${secondaryHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="border-top:1px solid ${BRAND.border};font-size:0;line-height:0;">&nbsp;</td>
                  <td width="1%" style="padding:0 14px;white-space:nowrap;font-size:11px;font-weight:700;letter-spacing:0.12em;color:${BRAND.accent};text-transform:uppercase;">What you can do</td>
                  <td style="border-top:1px solid ${BRAND.border};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                ${featureRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:14px;">
                <tr>
                  <td style="padding:28px 24px;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;color:${BRAND.accent};text-transform:uppercase;">The VRNA experience</p>
                    <h2 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.text};">Built for the culture.</h2>
                    <p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.muted};">
                      VRNA connects sneakerheads worldwide through a secure, transparent, and premium marketplace.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 0 20px;border-top:1px solid ${BRAND.border};">
              <p style="margin:20px 0 6px;font-size:14px;font-weight:700;color:${BRAND.text};">Need help?</p>
              <p style="margin:0 0 8px;font-size:13px;color:${BRAND.muted};">Our team is here for you.</p>
              <p style="margin:0 0 24px;font-size:13px;">
                <a href="mailto:support@vrna.io" style="color:${BRAND.accent};text-decoration:underline;">support@vrna.io</a>
              </p>
              ${brandWordmarkHtml(homeUrl, "20px")}
              <p style="margin:16px 0 0;font-size:11px;line-height:1.5;color:#52525b;">
                © ${year} ${BRAND.name}. All rights reserved.<br />
                This email was sent to you because you created an account on ${BRAND.name}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    BRAND.name,
    "Sneakers · Marketplace · Community",
    "—".repeat(28),
    eyebrow,
    headline,
    "",
    ...paragraphs,
    "",
    `${cta.label}: ${cta.href}`,
  ];
  if (secondaryCta) textParts.push(`${secondaryCta.label}: ${secondaryCta.href}`);
  textParts.push(
    "",
    "What you can do",
    ...WELCOME_FEATURES.map((f) => `${f.title}: ${f.body}`),
    "",
    "The VRNA experience — Built for the culture.",
    "VRNA connects sneakerheads worldwide through a secure, transparent, and premium marketplace.",
    "",
    "Need help? support@vrna.io",
    `© ${year} ${BRAND.name}. All rights reserved.`,
  );

  return { html, text: textParts.join("\n") };
}
