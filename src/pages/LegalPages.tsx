import { Link } from "react-router-dom";
import styles from "./StaticPages.module.css";

type LegalSection = {
  title: string;
  body: string[];
};

type LegalPageContent = {
  title: string;
  intro: string;
  sections: LegalSection[];
};

const UPDATED = "May 13, 2026";

const LEGAL_LINKS = [
  { to: "/legal/terms", label: "Terms of Service", desc: "Account, marketplace, and platform rules." },
  { to: "/legal/privacy", label: "Privacy Policy", desc: "How account, purchase, and device data is handled." },
  { to: "/legal/cookies", label: "Cookie Policy", desc: "Cookies, local storage, analytics, and preferences." },
  { to: "/legal/buyer-protection", label: "Buyer Protection", desc: "What buyers can expect when purchases are completed." },
  { to: "/legal/seller-agreement", label: "Seller Agreement", desc: "Seller listing, fulfillment, payout, and conduct rules." },
  { to: "/legal/fees", label: "Fees and Payouts", desc: "Marketplace fees, Stripe fees, taxes, and payout timing." },
  { to: "/legal/shipping-returns", label: "Shipping and Returns", desc: "Shipping expectations, cancellations, and return cases." },
  { to: "/legal/prohibited-items", label: "Prohibited Items", desc: "Items and behavior not allowed on EXCH." },
  { to: "/legal/accessibility", label: "Accessibility", desc: "Accessibility goals and how to report issues." },
];

const PAGES: Record<string, LegalPageContent> = {
  terms: {
    title: "Terms of Service",
    intro:
      "These terms explain the rules for using EXCH. as a buyer, seller, or visitor. This template text should be reviewed by counsel before production use.",
    sections: [
      {
        title: "Using EXCH.",
        body: [
          "You must provide accurate account information and keep your login secure. You are responsible for activity on your account.",
          "You may not use EXCH. for fraud, abuse, spam, scraping, interference with the service, or any activity that violates applicable law.",
        ],
      },
      {
        title: "Marketplace role",
        body: [
          "EXCH. provides marketplace tools for product discovery, listings, bids, checkout, and account management. Unless stated otherwise, EXCH. is not the seller of peer-listed items.",
          "Peer transactions may use Stripe Connect or another payment provider. Payment provider terms also apply.",
        ],
      },
      {
        title: "Listings and trades",
        body: [
          "Sellers are responsible for accurate item details, condition, size, authenticity, availability, and timely fulfillment.",
          "Buyers are responsible for reviewing listing details, completing checkout promptly, and keeping shipping and payment information current.",
        ],
      },
      {
        title: "Changes and termination",
        body: [
          "We may update features, policies, or these terms as the marketplace evolves.",
          "We may suspend or close accounts that create risk, violate policy, or harm other users.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro:
      "This policy describes the categories of information EXCH. may collect and how that information is used to operate the marketplace.",
    sections: [
      {
        title: "Information we collect",
        body: [
          "Account information such as email, display name, username, phone number, seller profile details, and authentication metadata.",
          "Marketplace activity such as listings, bids, trades, favorites, recently viewed items, shipping addresses, payment status, support messages, and device/browser data.",
        ],
      },
      {
        title: "How information is used",
        body: [
          "To provide accounts, checkout, fraud prevention, seller payouts, customer support, notifications, personalization, and marketplace safety.",
          "To improve products, debug issues, enforce policies, and comply with legal obligations.",
        ],
      },
      {
        title: "Sharing",
        body: [
          "We share information with service providers needed to operate the marketplace, including Supabase, Stripe, hosting, analytics, email, and shipping tools.",
          "Buyer and seller information may be shared as needed to complete a transaction, prevent fraud, or resolve disputes.",
        ],
      },
      {
        title: "Your choices",
        body: [
          "You can update account details in your account page. Some data must be retained for legal, security, tax, or dispute reasons.",
          "Contact support to request access, correction, deletion, or export where required by applicable law.",
        ],
      },
    ],
  },
  cookies: {
    title: "Cookie Policy",
    intro: "EXCH. uses cookies and browser storage to keep the app signed in, remember preferences, and improve the product.",
    sections: [
      {
        title: "Types of storage",
        body: [
          "Essential storage keeps you signed in, secures sessions, remembers recent views, and supports checkout flows.",
          "Preference storage may remember display settings, size preferences, favorite items, and account choices.",
        ],
      },
      {
        title: "Analytics and performance",
        body: [
          "If analytics are enabled, they may help us understand page performance, errors, and feature usage.",
          "Payment providers and embedded third-party services may set their own cookies under their own policies.",
        ],
      },
      {
        title: "Managing cookies",
        body: [
          "You can clear cookies and local storage in your browser. Some parts of EXCH. may stop working until you sign in again.",
        ],
      },
    ],
  },
  "buyer-protection": {
    title: "Buyer Protection",
    intro: "Buyer protection explains the baseline expectations for peer purchases completed through EXCH.",
    sections: [
      {
        title: "Covered purchases",
        body: [
          "Protection generally applies to eligible purchases paid through EXCH. checkout, not off-platform payments or private arrangements.",
          "The order must be associated with your signed-in account and a recorded trade.",
        ],
      },
      {
        title: "Potential issues",
        body: [
          "Examples include item not shipped, materially different item, wrong size, counterfeit claims, or damaged goods.",
          "Buyers may be asked for photos, packaging details, tracking information, and prompt communication.",
        ],
      },
      {
        title: "Resolution",
        body: [
          "EXCH. may request more information, hold payouts, cancel trades, issue refunds, or restrict accounts depending on the case.",
          "Payment provider dispute rules may also apply.",
        ],
      },
    ],
  },
  "seller-agreement": {
    title: "Seller Agreement",
    intro: "These seller rules apply when you list items, accept payment, and receive payouts through EXCH.",
    sections: [
      {
        title: "Seller responsibilities",
        body: [
          "List only items you own or are authorized to sell. Listings must be accurate, available, authentic, and lawful.",
          "Ship promptly, package items securely, and provide valid tracking when required.",
        ],
      },
      {
        title: "Payouts",
        body: [
          "Sellers must complete Stripe Connect onboarding or another supported payout setup before receiving payout funds.",
          "Payouts may be delayed, reversed, or held for refunds, disputes, suspected fraud, policy violations, or payment provider requirements.",
        ],
      },
      {
        title: "Seller level",
        body: [
          "Seller level starts at Level 1. Future levels may consider fulfillment speed, cancellation rate, disputes, completed sales, and account standing.",
        ],
      },
    ],
  },
  fees: {
    title: "Fees and Payouts",
    intro: "This page explains the fee categories that may apply to marketplace orders and seller payouts.",
    sections: [
      {
        title: "Buyer charges",
        body: [
          "Buyers may pay item price, shipping, taxes, payment processing costs, marketplace fees, and any applicable duties or local charges.",
          "The final amount should be shown during checkout before payment is submitted.",
        ],
      },
      {
        title: "Seller deductions",
        body: [
          "EXCH. charges a 9% marketplace fee on the item sale price, deducted from the seller payout before funds are released.",
          "Seller payouts may also be reduced by payment processing costs, refunds, chargebacks, prepaid inbound shipping labels, adjustments, or tax withholding where applicable.",
          "Stripe Connect payout timing depends on account status, region, risk checks, and Stripe settings.",
        ],
      },
      {
        title: "Changes",
        body: [
          "Fees may change as payment, shipping, tax, or marketplace features evolve. Any production fee schedule should be displayed before checkout or listing.",
        ],
      },
    ],
  },
  "shipping-returns": {
    title: "Shipping and Returns",
    intro: "Shipping and returns rules help buyers and sellers understand fulfillment expectations.",
    sections: [
      {
        title: "Shipping",
        body: [
          "Sellers should ship within the stated handling window and use trackable shipping when required.",
          "Buyers must provide an accurate shipping address before checkout. Address mistakes can delay or prevent delivery.",
        ],
      },
      {
        title: "Cancellations",
        body: [
          "Orders may be cancelled if payment fails, the seller cannot fulfill, fraud risk is detected, or a policy violation occurs.",
          "Listings reserved for checkout may be released if payment is not completed within the required time.",
        ],
      },
      {
        title: "Returns",
        body: [
          "Peer marketplace sales may be final unless the item is not received, materially different, damaged, counterfeit, or otherwise covered by buyer protection.",
          "Return eligibility, shipping cost responsibility, and refund timing depend on the case and payment provider rules.",
        ],
      },
    ],
  },
  "prohibited-items": {
    title: "Prohibited Items",
    intro: "Some items and behavior are not allowed on EXCH. to keep the marketplace safe and compliant.",
    sections: [
      {
        title: "Not allowed",
        body: [
          "Counterfeit goods, stolen goods, recalled items, illegal goods, regulated goods without authorization, hazardous materials, weapons, and items that infringe intellectual property.",
          "Misleading listings, manipulated prices, fake bids, off-platform payment steering, harassment, fraud, or attempts to avoid marketplace protections.",
        ],
      },
      {
        title: "Enforcement",
        body: [
          "EXCH. may remove listings, cancel trades, hold payouts, restrict features, or close accounts that violate policy.",
          "When required, EXCH. may preserve records or cooperate with payment providers, platforms, or law enforcement.",
        ],
      },
    ],
  },
  accessibility: {
    title: "Accessibility",
    intro: "EXCH. aims to provide a marketplace experience that is usable by as many people as possible.",
    sections: [
      {
        title: "Our goal",
        body: [
          "We aim for clear navigation, keyboard access, readable contrast, semantic markup, and useful labels for interactive controls.",
          "Accessibility is an ongoing process as new features, marketplace flows, and payment integrations are added.",
        ],
      },
      {
        title: "Feedback",
        body: [
          "If something is difficult to use, contact support with the page, browser, device, and assistive technology details if available.",
          "We will use feedback to prioritize improvements and fix issues.",
        ],
      },
    ],
  },
};

function LegalArticle({ page }: { page: LegalPageContent }) {
  return (
    <article className={`${styles.article} ${styles.legalArticle}`}>
      <p className={styles.breadcrumb}>
        <Link to="/legal">Legal</Link>
      </p>
      <h1 className={styles.h1}>{page.title}</h1>
      <p className={styles.updated}>Last updated: {UPDATED}</p>
      <p className={styles.p}>{page.intro}</p>
      <p className={styles.notice}>
        This is marketplace template policy text and is not legal advice. Have a qualified attorney review it before using it
        in production.
      </p>
      {page.sections.map((section) => (
        <section key={section.title} className={styles.section}>
          <h2 className={styles.h2}>{section.title}</h2>
          {section.body.map((body) => (
            <p key={body} className={styles.p}>
              {body}
            </p>
          ))}
        </section>
      ))}
      <p className={styles.p}>
        Questions? Visit <Link to="/help">Help</Link> or return to the <Link to="/legal">Legal hub</Link>.
      </p>
    </article>
  );
}

export function LegalIndexPage() {
  return (
    <article className={`${styles.article} ${styles.legalArticle}`}>
      <h1 className={styles.h1}>Legal center</h1>
      <p className={styles.p}>
        Policies for buyers, sellers, checkout, privacy, payouts, shipping, and marketplace safety.
      </p>
      <p className={styles.notice}>
        These pages are starter policies for the EXCH. template. Review and customize them before launch.
      </p>
      <div className={styles.legalGrid}>
        {LEGAL_LINKS.map((link) => (
          <Link key={link.to} to={link.to} className={styles.legalCard}>
            <strong>{link.label}</strong>
            <span>{link.desc}</span>
          </Link>
        ))}
      </div>
    </article>
  );
}

export function TermsPage() {
  return <LegalArticle page={PAGES.terms} />;
}

export function PrivacyPage() {
  return <LegalArticle page={PAGES.privacy} />;
}

export function CookiesPage() {
  return <LegalArticle page={PAGES.cookies} />;
}

export function BuyerProtectionPage() {
  return <LegalArticle page={PAGES["buyer-protection"]} />;
}

export function SellerAgreementPage() {
  return <LegalArticle page={PAGES["seller-agreement"]} />;
}

export function FeesPage() {
  return <LegalArticle page={PAGES.fees} />;
}

export function ShippingReturnsPage() {
  return <LegalArticle page={PAGES["shipping-returns"]} />;
}

export function ProhibitedItemsPage() {
  return <LegalArticle page={PAGES["prohibited-items"]} />;
}

export function AccessibilityPage() {
  return <LegalArticle page={PAGES.accessibility} />;
}
