import { Analytics } from "@vercel/analytics/react";
import { lazy, type ComponentType } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { HomePage } from "@/pages/HomePage";

/** Code-split a page that is a named export; the home page stays in the main bundle. */
function lazyPage<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
}

const AboutPage = lazyPage(() => import("@/pages/AboutPage"), "AboutPage");
const AccountPage = lazyPage(() => import("@/pages/AccountPage"), "AccountPage");
const AdminPage = lazyPage(() => import("@/pages/AdminPage"), "AdminPage");
const ActivityCatalogPage = lazyPage(() => import("@/pages/ActivityCatalogPage"), "ActivityCatalogPage");
const AuthCallbackPage = lazyPage(() => import("@/pages/AuthCallbackPage"), "AuthCallbackPage");
const BrandCatalogPage = lazyPage(() => import("@/pages/BrandCatalogPage"), "BrandCatalogPage");
const BrandsPage = lazyPage(() => import("@/pages/BrandsPage"), "BrandsPage");
const CatalogIndexPage = lazyPage(() => import("@/pages/CatalogIndexPage"), "CatalogIndexPage");
const CategoryCatalogPage = lazyPage(() => import("@/pages/CategoryCatalogPage"), "CategoryCatalogPage");
const HelpPage = lazyPage(() => import("@/pages/HelpPage"), "HelpPage");
const LoginPage = lazyPage(() => import("@/pages/LoginPage"), "LoginPage");
const NewArrivalsPage = lazyPage(() => import("@/pages/NewArrivalsPage"), "NewArrivalsPage");
const NotFoundPage = lazyPage(() => import("@/pages/NotFoundPage"), "NotFoundPage");
const ProductPage = lazyPage(() => import("@/pages/ProductPage"), "ProductPage");
const SearchPage = lazyPage(() => import("@/pages/SearchPage"), "SearchPage");
const SellPage = lazyPage(() => import("@/pages/SellPage"), "SellPage");
const SignupPage = lazyPage(() => import("@/pages/SignupPage"), "SignupPage");
const TradeDetailPage = lazyPage(() => import("@/pages/TradeDetailPage"), "TradeDetailPage");
const VerifyEmailPage = lazyPage(() => import("@/pages/VerifyEmailPage"), "VerifyEmailPage");

const legalPages = () => import("@/pages/LegalPages");
const AccessibilityPage = lazyPage(legalPages, "AccessibilityPage");
const BuyerProtectionPage = lazyPage(legalPages, "BuyerProtectionPage");
const CookiesPage = lazyPage(legalPages, "CookiesPage");
const FeesPage = lazyPage(legalPages, "FeesPage");
const LegalIndexPage = lazyPage(legalPages, "LegalIndexPage");
const PrivacyPage = lazyPage(legalPages, "PrivacyPage");
const ProhibitedItemsPage = lazyPage(legalPages, "ProhibitedItemsPage");
const SellerAgreementPage = lazyPage(legalPages, "SellerAgreementPage");
const ShippingReturnsPage = lazyPage(legalPages, "ShippingReturnsPage");
const TermsPage = lazyPage(legalPages, "TermsPage");

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="catalog" element={<CatalogIndexPage />} />
          <Route path="catalog/:departmentSlug" element={<CategoryCatalogPage />} />
          <Route path="new" element={<NewArrivalsPage />} />
          <Route path="brands" element={<BrandsPage />} />
          <Route path="brands/:brandSlug" element={<BrandCatalogPage />} />
          <Route path="shop/activity/:activitySlug" element={<ActivityCatalogPage />} />
          <Route path="product/:handle" element={<ProductPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="auth/callback" element={<AuthCallbackPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignupPage />} />
          <Route path="verify-email" element={<VerifyEmailPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="trade/:tradeId" element={<TradeDetailPage />} />
          <Route path="sell" element={<SellPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="legal" element={<LegalIndexPage />} />
          <Route path="legal/terms" element={<TermsPage />} />
          <Route path="legal/privacy" element={<PrivacyPage />} />
          <Route path="legal/cookies" element={<CookiesPage />} />
          <Route path="legal/buyer-protection" element={<BuyerProtectionPage />} />
          <Route path="legal/seller-agreement" element={<SellerAgreementPage />} />
          <Route path="legal/fees" element={<FeesPage />} />
          <Route path="legal/shipping-returns" element={<ShippingReturnsPage />} />
          <Route path="legal/prohibited-items" element={<ProhibitedItemsPage />} />
          <Route path="legal/accessibility" element={<AccessibilityPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <Analytics />
    </>
  );
}
