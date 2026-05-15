import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AuthBar } from "@/components/AuthBar";
import { SetupBanner } from "@/components/SetupBanner";
import {
  IconClose,
  IconGrid,
  IconHelp,
  IconHome,
  IconInfo,
  IconLayers,
  IconMenu,
  IconSearch,
  IconShirt,
  IconSparkles,
  IconTag,
} from "@/components/HeaderIcons";
import styles from "./Layout.module.css";

const navCls = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink;

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const MAIN_NAV: NavItem[] = [
  { to: "/catalog", label: "Catalog", end: true, icon: IconGrid },
  { to: "/catalog/men", label: "Men", icon: IconShirt },
  { to: "/catalog/women", label: "Women", icon: IconShirt },
  { to: "/catalog/kids", label: "Kids", icon: IconShirt },
  { to: "/catalog/accessories", label: "Accessories", icon: IconLayers },
  { to: "/new", label: "New", icon: IconSparkles },
  { to: "/brands", label: "Brands", icon: IconTag },
  { to: "/help", label: "Help", icon: IconHelp },
  { to: "/about", label: "About", icon: IconInfo },
];

const MOBILE_SITEMAP: NavItem[] = [
  { to: "/", label: "Home", end: true, icon: IconHome },
  { to: "/search", label: "Search", icon: IconSearch },
  ...MAIN_NAV,
];

const MQ_WIDE = "(min-width: 900px)";

export function Layout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [wide, setWide] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MQ_WIDE).matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia(MQ_WIDE);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (wide) setMenuOpen(false);
  }, [wide]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || wide) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen, wide]);

  const mobileMenuOpen = menuOpen && !wide;

  return (
    <div className={styles.shell}>
      {mobileMenuOpen ? (
        <>
          <button
            type="button"
            className={styles.menuBackdropFixed}
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div
            id="mobile-nav"
            className={styles.mobileMenuSheet}
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
          >
            <div className={styles.mobileMenuTop}>
              <NavLink to="/" className={styles.logo} end onClick={() => setMenuOpen(false)}>
                EXCH<span className={styles.logoAccent}>.</span>
              </NavLink>
              <button
                type="button"
                className={`${styles.menuBtn} ${styles.menuBtnOpen}`}
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                <IconClose width={22} height={22} />
              </button>
            </div>
            <nav className={styles.mobileMenuNav} aria-label="Main">
                {MOBILE_SITEMAP.map(({ to, label, end, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      isActive ? `${styles.dropdownLink} ${styles.dropdownLinkActive}` : styles.dropdownLink
                    }
                    end={end}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className={styles.dropdownIconShelf}>
                      <Icon width={18} height={18} strokeWidth={2} />
                    </span>
                    <span className={styles.dropdownLabel}>{label}</span>
                  </NavLink>
                ))}
              </nav>
            <div className={styles.mobileMenuAuth}>
              <AuthBar variant="menu" onDismiss={() => setMenuOpen(false)} />
            </div>
          </div>
        </>
      ) : null}

      <header className={mobileMenuOpen ? `${styles.header} ${styles.headerMenuOpen}` : styles.header}>
        <div className={styles.headerBar}>
          <NavLink to="/" className={styles.logo} end onClick={() => setMenuOpen(false)}>
            EXCH<span className={styles.logoAccent}>.</span>
          </NavLink>

          <nav className={styles.desktopNav} aria-label="Main">
            {MAIN_NAV.map(({ to, label, end }) => (
              <NavLink key={to} to={to} className={navCls} end={end}>
                {label}
              </NavLink>
            ))}
          </nav>

          <div className={styles.headerActions}>
            {wide ? (
              <NavLink
                to="/search"
                className={({ isActive }) =>
                  isActive ? `${styles.actionIconLink} ${styles.actionIconLinkActive}` : styles.actionIconLink
                }
                aria-label="Search products"
                title="Search"
              >
                <IconSearch width={20} height={20} />
              </NavLink>
            ) : null}
            {wide ? <AuthBar variant="header" /> : null}
            <div className={styles.menuAnchor}>
              <button
                type="button"
                className={menuOpen ? `${styles.menuBtn} ${styles.menuBtnOpen}` : styles.menuBtn}
                aria-expanded={menuOpen}
                aria-controls="mobile-nav"
                aria-haspopup="true"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMenuOpen((o) => !o)}
              >
                {menuOpen ? <IconClose width={22} height={22} /> : <IconMenu width={22} height={22} />}
              </button>

            </div>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <SetupBanner />
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <p>
          EXCH. marketplace template. P2P asks, bids, trades, and payments use Supabase and Stripe Connect.
        </p>
        <nav className={styles.footerLinks} aria-label="Legal">
          <Link to="/legal">Legal</Link>
          <Link to="/legal/terms">Terms</Link>
          <Link to="/legal/privacy">Privacy</Link>
          <Link to="/legal/cookies">Cookies</Link>
          <Link to="/legal/buyer-protection">Buyer Protection</Link>
          <Link to="/legal/seller-agreement">Seller Agreement</Link>
          <Link to="/legal/fees">Fees</Link>
          <Link to="/legal/shipping-returns">Shipping & Returns</Link>
          <Link to="/legal/prohibited-items">Prohibited Items</Link>
          <Link to="/legal/accessibility">Accessibility</Link>
        </nav>
      </footer>
    </div>
  );
}
