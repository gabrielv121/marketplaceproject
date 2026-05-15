const EVENT = "exch-recent-views";
const MAX = 28;

export type RecentView = {
  handle: string;
  title: string;
  imageUrl: string | null;
  at: number;
};

function key(userId: string | undefined): string {
  return userId ? `exch_recent_v1_${userId}` : "exch_recent_v1_guest";
}

export function getRecentViews(userId: string | undefined): RecentView[] {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is RecentView => x && typeof (x as RecentView).handle === "string")
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function recordProductView(
  userId: string | undefined,
  item: { handle: string; title: string; featuredImageUrl: string | null },
): void {
  try {
    const cur = getRecentViews(userId).filter((v) => v.handle !== item.handle);
    const next: RecentView[] = [
      { handle: item.handle, title: item.title, imageUrl: item.featuredImageUrl, at: Date.now() },
      ...cur,
    ].slice(0, MAX);
    localStorage.setItem(key(userId), JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore quota / private mode */
  }
}

export function subscribeRecentViews(cb: () => void): () => void {
  const fn = () => cb();
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
