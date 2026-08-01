/** Public contact addresses (Cloudflare Email Routing → inbox). */
export const CONTACT_EMAILS = [
  {
    address: "support@vrna.io",
    label: "Support",
    blurb: "Orders, verification, shipping, and account help",
  },
  {
    address: "seller@vrna.io",
    label: "Sellers",
    blurb: "Listings, payouts, and Stripe Connect questions",
  },
  {
    address: "contact@vrna.io",
    label: "Contact",
    blurb: "General questions and partnerships",
  },
  {
    address: "hello@vrna.io",
    label: "Hello",
    blurb: "Press, feedback, and everything else",
  },
] as const;

export const SUPPORT_EMAIL = CONTACT_EMAILS[0].address;
