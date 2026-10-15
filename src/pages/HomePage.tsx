import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HomeSection } from "@/components/HomeSection";
import { ProductGrid } from "@/components/ProductGrid";
import { ProductRail } from "@/components/ProductRail";
import { useAuth } from "@/context/AuthContext";
import { DEPARTMENTS } from "@/lib/catalog-taxonomy";
import { loadCatalogProducts } from "@/lib/catalog-products";
import { fetchNewestCatalogProducts } from "@/lib/catalog-supabase";
import { fetchMyAddresses, fetchMyBids } from "@/lib/account-data";
import { fetchCatalogDemandScores } from "@/lib/catalog-demand";
import { fetchMyFavoriteHandles } from "@/lib/favorites";
import {
  ACTIVITY_COVER,
  apparelRotationStep,
  designerRailWindow,
  designerRotationStep,
  msUntilNextApparelSlot,
  msUntilNextDesignerSlot,
  msUntilNextRecommendedSlot,
  msUntilNextTrendingSlot,
  msUntilNextTwiceDailySlot,
  locationWindowStep,
  pickNewAtExch,
  rankBelowRetail,
  rankFeaturedApparel,
  rankDesignerProducts,
  rankFeaturedAccessories,
  rankPopularLocal,
  rankRecommendedProducts,
  rankTrendingSneakers,
  twiceDailyRotationStep,
  recommendedRotationStep,
  trendingRotationStep,
  resolveRecentProducts,
  SHOP_ACTIVITIES,
  type TasteSeed,
} from "@/lib/home-feed";
import { getRecentViews, subscribeRecentViews } from "@/lib/recently-viewed";
import { getSupabase } from "@/lib/supabase";
import type { CatalogProductSummary } from "@/lib/catalog-product";
import styles from "./HomePage.module.css";

const N = 6;

function guestPlace(): { key: string; label: string } {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
    const label = zone.split("/").pop()?.replace(/_/g, " ") || "your area";
    return { key: zone, label };
  } catch {
    return { key: "local", label: "your area" };
  }
}

export function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const [all, setAll] = useState<CatalogProductSummary[]>([]);
  const [recent, setRecent] = useState(() => getRecentViews(user?.id));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demand, setDemand] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [designerStep, setDesignerStep] = useState(() => designerRotationStep());
  const [recommendedStep, setRecommendedStep] = useState(() => recommendedRotationStep());
  const [trendingStep, setTrendingStep] = useState(() => trendingRotationStep());
  const [apparelStep, setApparelStep] = useState(() => apparelRotationStep());
  const [twiceDailyStep, setTwiceDailyStep] = useState(() => twiceDailyRotationStep());
  const [savedHandles, setSavedHandles] = useState<string[]>([]);
  const [bidHandles, setBidHandles] = useState<string[]>([]);
  const [newest, setNewest] = useState<CatalogProductSummary[]>([]);
  const [place, setPlace] = useState(guestPlace);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { products, error: err } = await loadCatalogProducts({ limit: 3000 });
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
    let cancelled = false;
    let timer = 0;
    const loadNewest = () => {
      void fetchNewestCatalogProducts(24).then((rows) => {
        if (!cancelled && rows?.length) setNewest(rows);
      });
    };
    loadNewest();

    const sb = getSupabase();
    const channel = sb?.channel("catalog-new-at-vrna");
    channel?.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "catalog_products" },
      () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          loadNewest();
          void fetchCatalogDemandScores().then((scores) => {
            if (!cancelled) setDemand(scores);
          });
        }, 400);
      },
    );
    channel?.subscribe();
    const onFocus = () => loadNewest();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      if (sb && channel) void sb.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchCatalogDemandScores().then((scores) => {
        if (!cancelled) setDemand(scores);
      });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setPlace(guestPlace());
      return;
    }
    let cancelled = false;
    void fetchMyAddresses()
      .then((rows) => {
        if (cancelled) return;
        const address = rows.find((row) => row.is_default) ?? rows[0];
        if (!address) {
          setPlace(guestPlace());
          return;
        }
        const city = address.city.trim();
        const region = address.region.trim();
        const country = address.country.trim();
        const key = [city, region, country].filter(Boolean).join("|").toLowerCase();
        const label = city || region || country || guestPlace().label;
        setPlace(key ? { key, label } : guestPlace());
      })
      .catch(() => {
        if (!cancelled) setPlace(guestPlace());
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setDesignerStep(designerRotationStep());
        schedule();
      }, msUntilNextDesignerSlot());
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setRecommendedStep(recommendedRotationStep());
        schedule();
      }, msUntilNextRecommendedSlot());
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setTrendingStep(trendingRotationStep());
        schedule();
      }, msUntilNextTrendingSlot());
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setApparelStep(apparelRotationStep());
        schedule();
      }, msUntilNextApparelSlot());
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setTwiceDailyStep(twiceDailyRotationStep());
        schedule();
      }, msUntilNextTwiceDailySlot());
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user) {
      setSavedHandles([]);
      setBidHandles([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      fetchMyFavoriteHandles().catch(() => [] as string[]),
      fetchMyBids()
        .then((rows) => rows.map((row) => row.product_handle))
        .catch(() => [] as string[]),
    ]).then(([favorites, bids]) => {
      if (cancelled) return;
      setSavedHandles(favorites);
      setBidHandles(bids);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
    const used = new Set<string>(signedIn ? recentHandles : []);

    const tasteSeeds: TasteSeed[] = [
      ...savedHandles.map((handle) => ({ handle, weight: 6 })),
      ...bidHandles.map((handle) => ({ handle, weight: 5 })),
      ...recent.map((view, index) => ({ handle: view.handle, weight: Math.max(1, 4 - index * 0.2) })),
    ];
    const recommendedRail = rankRecommendedProducts(all, tasteSeeds, [...used]);
    designerRailWindow(recommendedRail.ranked, recommendedRail.taste, 0, N).forEach((p) => used.add(p.handle));

    const trendingRanked = rankTrendingSneakers(all, [...used]);
    designerRailWindow(trendingRanked, new Map(), 0, N).forEach((p) => used.add(p.handle));

    // Accessories before apparel / popular — few SKUs and easily crowded out by hoodies + popular-local tag.
    const accessoriesRanked = rankFeaturedAccessories(all, [...used]);
    designerRailWindow(accessoriesRanked, new Map(), 0, N).forEach((p) => used.add(p.handle));

    const apparelRanked = rankFeaturedApparel(all, [...used]);
    designerRailWindow(apparelRanked, new Map(), apparelStep, N).forEach((p) => used.add(p.handle));

    const designerRanked = rankDesignerProducts(all, demand, [...used]);
    designerRailWindow(designerRanked, demand, 0, N).forEach((p) => used.add(p.handle));

    const popularRanked = rankPopularLocal(all, demand, [...used]);
    const popularVisible = designerRailWindow(popularRanked, new Map(), locationWindowStep(place.key), N);
    popularVisible.forEach((p) => used.add(p.handle));

    const belowRanked = rankBelowRetail(all, [...used]);
    designerRailWindow(belowRanked, new Map(), 0, N).forEach((p) => used.add(p.handle));

    const newAt = pickNewAtExch(newest.length ? newest : all, 6, [...used]);

    return {
      recentProducts,
      recommendedRanked: recommendedRail.ranked,
      recommendedTaste: recommendedRail.taste,
      recommendedPersonalized: recommendedRail.personalized,
      trendingRanked,
      apparelRanked,
      designerRanked,
      popular: popularVisible,
      belowRanked,
      accessoriesRanked,
      newAt,
    };
  }, [all, apparelStep, bidHandles, demand, newest, place.key, recent, savedHandles, signedIn]);

  const recommendedProducts = useMemo(
    () =>
      rails
        ? designerRailWindow(rails.recommendedRanked, rails.recommendedTaste, recommendedStep, N)
        : [],
    [rails, recommendedStep],
  );

  const apparelProducts = useMemo(
    () => (rails ? designerRailWindow(rails.apparelRanked, new Map(), apparelStep, N) : []),
    [rails, apparelStep],
  );

  const trendingProducts = useMemo(
    () => (rails ? designerRailWindow(rails.trendingRanked, new Map(), trendingStep, N) : []),
    [rails, trendingStep],
  );

  const belowProducts = useMemo(
    () => (rails ? designerRailWindow(rails.belowRanked, new Map(), twiceDailyStep, N) : []),
    [rails, twiceDailyStep],
  );

  const accessoryProducts = useMemo(
    () => (rails ? designerRailWindow(rails.accessoriesRanked, new Map(), twiceDailyStep, N) : []),
    [rails, twiceDailyStep],
  );

  const designerProducts = useMemo(
    () => (rails ? designerRailWindow(rails.designerRanked, demand, designerStep, N) : []),
    [rails, demand, designerStep],
  );

  return (
    <div>
      <section className={styles.hero}>
        <p className={styles.kicker}>VRNA</p>
        <h1 className={styles.h1}>Buy first. Sell anytime.</h1>
        <p className={styles.lead}>
          One account for shopping and listing. Each home row mixes brands and styles. Every order is verified by VRNA
          before delivery.
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
            subtitle={
              rails.recommendedPersonalized
                ? "Matched to what you browse, save, and bid on."
                : "Curated from the catalog until you browse."
            }
            titleInfo="Follows your brands and styles. The row changes every two days, and the closest matches stay up front."
            action={{ label: "See all →", to: "/catalog" }}
          >
            <ProductGrid products={recommendedProducts} emptyMessage="Nothing to recommend yet." layout="homeSix" />
          </HomeSection>

          <HomeSection
            variant="market"
            title="Trending sneakers"
            titleInfo="Popular footwear from leading brands and collaborations. The row changes once a week."
            action={{ label: "See all →", to: "/search?q=sneakers" }}
          >
            <ProductGrid products={trendingProducts} layout="homeSix" />
          </HomeSection>

          <HomeSection
            variant="market"
            title="Featured apparel"
            titleInfo="Streetwear and collabs, mixed across brands. The row changes every day at midnight."
            action={{ label: "See all →", to: "/search?q=apparel" }}
          >
            <ProductGrid products={apparelProducts} layout="homeSix" />
          </HomeSection>

          <HomeSection
            variant="market"
            title="Designer & avant-garde"
            titleInfo="The row changes over time. Pieces people are viewing, saving, or bidding on stay up front."
            action={{ label: "See all →", to: "/search?q=designer" }}
          >
            <ProductGrid products={designerProducts} layout="homeSix" emptyMessage="Designer picks loading soon." />
          </HomeSection>

          <HomeSection
            id="shop-activity"
            variant="market"
            title="Shop by activity"
            titleInfo="Shop gear organized by sport and activity."
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
            subtitle={place.label ? `Popular in ${place.label}` : undefined}
            titleInfo="Follows what people are viewing, saving, and bidding on, and changes with your area."
            action={{ label: "See all →", to: "/catalog" }}
          >
            <ProductGrid products={rails.popular} layout="homeSix" />
          </HomeSection>

          <HomeSection
            variant="market"
            title="Below retail price"
            titleInfo="Listings priced below typical market value. The row changes twice a day."
            action={{ label: "See all →", to: "/search?q=below-retail" }}
          >
            <ProductGrid products={belowProducts} layout="homeSix" />
          </HomeSection>

          <HomeSection
            variant="market"
            title="Featured accessories"
            titleInfo="Bags, hats, watches, and add-ons — not sneakers or apparel. The row changes twice a day."
            action={{ label: "See all →", to: "/catalog/accessories" }}
          >
            <ProductGrid products={accessoryProducts} layout="homeSix" />
          </HomeSection>

          <HomeSection
            variant="market"
            title="New at VRNA"
            subtitle="Fresh drops on the marketplace."
            titleInfo="Swaps in as soon as new products arrive from the catalog."
            action={{ label: "See all →", to: "/new" }}
          >
            <ProductGrid products={rails.newAt} layout="homeSix" />
          </HomeSection>
        </>
      ) : null}
    </div>
  );
}
