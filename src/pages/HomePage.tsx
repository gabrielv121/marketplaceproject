import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HomeSection } from "@/components/HomeSection";
import { ProductGrid } from "@/components/ProductGrid";
import { ProductRail } from "@/components/ProductRail";
import { useAuth } from "@/context/AuthContext";
import { DEPARTMENTS } from "@/lib/catalog-taxonomy";
import { loadCatalogProducts } from "@/lib/catalog-products";
import {
  ACTIVITY_COVER,
  pickByRail,
  pickFeaturedAccessoriesRail,
  pickFeaturedApparel,
  pickFeaturedDesignerRail,
  pickNewAtExch,
  pickRecommended,
  pickTrendingSneakers,
  resolveRecentProducts,
  SHOP_ACTIVITIES,
} from "@/lib/home-feed";
import { getRecentViews, subscribeRecentViews } from "@/lib/recently-viewed";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import styles from "./HomePage.module.css";

const N = 6;

export function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const [all, setAll] = useState<CatalogProductSummary[]>([]);
  const [recent, setRecent] = useState(() => getRecentViews(user?.id));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { products, error: err } = await loadCatalogProducts({ limit: 400 });
      if (!cancelled) {
        setAll(products);
        setError(err);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setRecent(getRecentViews(user?.id));
    return subscribeRecentViews(() => {
      setRecent(getRecentViews(user?.id));
    });
  }, [user?.id]);

  const signedIn = Boolean(user?.email);

  const rails = useMemo(() => {
    if (!all.length) return null;
    const recentHandles = recent.map((r) => r.handle);
    const recentProducts = resolveRecentProducts(all, recent);
    // Trending = top footwear by sort; Recommended must not repeat the same six (same sort made them identical).
    const trending = pickTrendingSneakers(all, N, recentHandles);
    const trendingHandles = trending.map((p) => p.handle);
    const recommendedExclude = [...(signedIn ? recentHandles : []), ...trendingHandles];
    const recommendedPool = pickRecommended(all, recommendedExclude, N);
    const apparel = pickFeaturedApparel(all, N, recentHandles);
    const designer = pickFeaturedDesignerRail(all, N, recentHandles);
    const popular = pickByRail(all, "popular-local", N, recentHandles);
    const below = pickByRail(all, "below-retail", N, recentHandles);
    const accessories = pickFeaturedAccessoriesRail(all, N, recentHandles);
    const newAt = pickNewAtExch(all, 6);
    return {
      recentProducts,
      recommended: recommendedPool,
      trending,
      apparel,
      designer,
      popular,
      below,
      accessories,
      newAt,
    };
  }, [all, recent, signedIn]);

  return (
    <div>
      <section className={styles.hero}>
        <p className={styles.kicker}>EXCH.</p>
        <h1 className={styles.h1}>Buy first. Sell anytime.</h1>
        <p className={styles.lead}>
          One account for shopping and listing. Home rails mirror a StockX-style layout; wire tags and `catalog_products` in
          Supabase when you move off the bundled seed.
        </p>
      </section>

      <section className={styles.deptSection} aria-labelledby="dept-heading">
        <h2 id="dept-heading" className={styles.sectionTitle}>
          Shop by department
        </h2>
        <ul className={styles.deptRow}>
          {DEPARTMENTS.map((d) => (
            <li key={d.slug}>
              <Link to={`/catalog/${d.slug}`} className={styles.deptPill}>
                {d.title}
              </Link>
            </li>
          ))}
          <li>
            <Link to="/new" className={styles.deptPillSecondary}>
              New arrivals
            </Link>
          </li>
          <li>
            <Link to="/brands" className={styles.deptPillSecondary}>
              Brands
            </Link>
          </li>
          <li>
            <Link to="/account" className={styles.deptPillSecondary}>
              Account
            </Link>
          </li>
        </ul>
      </section>

      {error ? (
        <p className={styles.warn} role="status">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className={styles.muted}>Loading your feed…</p>
      ) : rails ? (
        <>
          {!authLoading && signedIn ? (
            <HomeSection
              variant="market"
              title="Recently viewed"
              titleInfo="Items you opened on this device. Cleared if you remove browser data."
              action={{ label: "See all →", to: "/catalog" }}
            >
              <div className={styles.recentToolbar}>
                <button
                  type="button"
                  className={styles.clearRecent}
                  onClick={() => {
                    try {
                      localStorage.removeItem(user?.id ? `exch_recent_v1_${user.id}` : "exch_recent_v1_guest");
                      window.dispatchEvent(new CustomEvent("exch-recent-views"));
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  Clear history
                </button>
              </div>
              <div className={styles.railOuter}>
                {rails.recentProducts.length ? (
                  <ProductRail products={rails.recentProducts.slice(0, 6)} />
                ) : (
                  <p className={styles.emptyRail}>Browse the catalog — items you click will show up here.</p>
                )}
              </div>
            </HomeSection>
          ) : null}

          <HomeSection
            variant="market"
            title="Recommended for you"
            subtitle={signedIn ? "Outside your recent history." : "Curated from the catalog."}
            titleInfo="Same ranking rules as the rest of the home feed, but excludes the six pairs in Trending sneakers so this row is not a duplicate."
            action={{ label: "See all →", to: "/catalog" }}
          >
            <ProductGrid products={rails.recommended} emptyMessage="Nothing to recommend yet." layout="homeSix" />
          </HomeSection>

          <HomeSection
            variant="market"
            title="Trending sneakers"
            titleInfo="Footwear only. Jordan, Nike and collabs (e.g. Travis Scott, Dior) preferred; then Yeezy, UGG, Balenciaga ahead of generic Adidas."
            action={{ label: "See all →", to: "/catalog/men" }}
          >
            <ProductGrid products={rails.trending} layout="homeSix" />
          </HomeSection>

          <HomeSection
            variant="market"
            title="Featured apparel"
            titleInfo="Clothing only — jackets, hoodies, pants, etc. Shoes never appear here."
            action={{ label: "See all →", to: "/catalog/women" }}
          >
            <ProductGrid products={rails.apparel} layout="homeSix" />
          </HomeSection>

          <HomeSection
            variant="market"
            title="Designer & avant-garde"
            subtitle="Rick Owens, Margiela, Guidi, and more."
            titleInfo="Tagged home-featured-designer in catalog_products."
            action={{ label: "Browse brands →", to: "/brands" }}
          >
            <ProductGrid products={rails.designer} layout="homeSix" emptyMessage="Designer picks loading soon." />
          </HomeSection>

          <HomeSection
            id="shop-activity"
            variant="market"
            title="Shop by activity"
            titleInfo="Jump into a sport — products filter by activity-* tags."
            action={{ label: "See all →", to: "/catalog" }}
          >
            <ul className={styles.activityGridStockx}>
              {SHOP_ACTIVITIES.map((a) => (
                <li key={a.slug}>
                  <Link to={`/shop/activity/${a.slug}`} className={styles.activityTile}>
                    <div className={styles.activityImageShell}>
                      <img
                        src={ACTIVITY_COVER[a.slug]}
                        alt=""
                        className={styles.activityImg}
                        onError={(e) => {
                          e.currentTarget.classList.add(styles.activityImgBroken);
                        }}
                      />
                    </div>
                    <span className={styles.activityTileLabel}>{a.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </HomeSection>

          <HomeSection
            variant="market"
            title="Most popular around you"
            titleInfo="Editorial mix for now — swap for geo, velocity, or sales."
            action={{ label: "See all →", to: "/new" }}
          >
            <ProductGrid products={rails.popular} layout="homeSix" />
          </HomeSection>

          <HomeSection
            variant="market"
            title="Below retail price"
            titleInfo="Tagged deals and value picks."
            action={{ label: "See all →", to: "/catalog" }}
          >
            <ProductGrid products={rails.below} layout="homeSix" />
          </HomeSection>

          <HomeSection
            variant="market"
            title="Featured accessories"
            titleInfo="Bags, hats, watches, and add-ons — not sneakers or apparel."
            action={{ label: "See all →", to: "/catalog/accessories" }}
          >
            <ProductGrid products={rails.accessories} layout="homeSix" />
          </HomeSection>

          <HomeSection
            variant="market"
            title="New at EXCH."
            subtitle="Fresh drops on the marketplace."
            titleInfo="Uses home-new-at-exch tags when set; otherwise fills from newest picks."
            action={{ label: "See all →", to: "/new" }}
          >
            <ProductGrid products={rails.newAt} layout="homeSix" />
          </HomeSection>
        </>
      ) : null}
    </div>
  );
}
