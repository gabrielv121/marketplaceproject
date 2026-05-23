import { Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AboutPage } from "@/pages/AboutPage";
import { AccountPage } from "@/pages/AccountPage";
import { AdminPage } from "@/pages/AdminPage";
import { ActivityCatalogPage } from "@/pages/ActivityCatalogPage";
import { BrandCatalogPage } from "@/pages/BrandCatalogPage";
import { BrandsPage } from "@/pages/BrandsPage";
import { CatalogIndexPage } from "@/pages/CatalogIndexPage";
import { CategoryCatalogPage } from "@/pages/CategoryCatalogPage";
import { HelpPage } from "@/pages/HelpPage";
import { HomePage } from "@/pages/HomePage";
import {
  AccessibilityPage,
  BuyerProtectionPage,
  CookiesPage,
  FeesPage,
  LegalIndexPage,
  PrivacyPage,
  ProhibitedItemsPage,
  SellerAgreementPage,
  ShippingReturnsPage,
  TermsPage,
} from "@/pages/LegalPages";
import { LoginPage } from "@/pages/LoginPage";
import { NewArrivalsPage } from "@/pages/NewArrivalsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ProductPage } from "@/pages/ProductPage";
import { SearchPage } from "@/pages/SearchPage";
import { SellPage } from "@/pages/SellPage";
import { SignupPage } from "@/pages/SignupPage";
import { TradeDetailPage } from "@/pages/TradeDetailPage";

export default function App() {
  return (
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
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
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
  );
}
