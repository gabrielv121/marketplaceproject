import { useEffect, useMemo, useRef, useState } from "react";
import type { RecentSaleRow } from "@/lib/p2p";
import { moneyFromCents } from "@/lib/p2p";
import { formatMoney } from "@/lib/money-format";
import { priceSeries, type PriceHistoryRow, type PricePoint } from "@/lib/price-history";
import { sizeLabelsMatch } from "@/lib/size-labels";
import styles from "./PriceHistoryChart.module.css";

const RANGES = [
  ["1M", 30],
  ["3M", 90],
  ["1Y", 365],
  ["All", null],
] as const;

type RangeKey = (typeof RANGES)[number][0];

const DAY_MS = 86_400_000;
const HEIGHT = 150;
const PAD_Y = 14;

function dayMs(day: string): number {
  return Date.parse(`${day.slice(0, 10)}T00:00:00Z`);
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function valueAt(points: PricePoint[], ms: number): number | null {
  let value: number | null = null;
  for (const p of points) {
    if (dayMs(p.day) > ms) break;
    value = p.cents;
  }
  return value;
}

export function PriceHistoryChart({
  rows,
  sales,
  sizeLabel,
  sizeDisplay,
  currency,
}: {
  rows: PriceHistoryRow[];
  sales: RecentSaleRow[];
  sizeLabel: string;
  sizeDisplay: string;
  currency: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState<RangeKey>("3M");
  const [allSizes, setAllSizes] = useState(false);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const hasData = rows.length > 0 || sales.length > 0;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasData]);

  const sizeRows = useMemo(
    () => (sizeLabel ? rows.filter((r) => sizeLabelsMatch(r.size_label, sizeLabel)) : []),
    [rows, sizeLabel],
  );
  const useAll = allSizes || sizeRows.length === 0;
  const points = useMemo(() => priceSeries(useAll ? rows : sizeRows), [useAll, rows, sizeRows]);
  const scopedSales = useMemo(
    () => (useAll ? sales : sales.filter((s) => sizeLabelsMatch(s.size_label, sizeLabel))),
    [useAll, sales, sizeLabel],
  );

  const todayMs = dayMs(new Date().toISOString());
  const firstMs = Math.min(
    points.length ? dayMs(points[0].day) : todayMs,
    ...scopedSales.map((s) => dayMs(s.sold_at)),
  );
  const rangeDays = RANGES.find(([key]) => key === range)?.[1] ?? null;
  const startMs = Math.min(
    todayMs,
    rangeDays == null ? firstMs : Math.max(firstMs, todayMs - rangeDays * DAY_MS),
  );
  // Today gets a full-day slot so a series that starts today still draws as a line.
  const endMs = todayMs + DAY_MS;

  const visible = useMemo(() => {
    const out: { ms: number; cents: number | null }[] = [{ ms: startMs, cents: valueAt(points, startMs) }];
    for (const p of points) {
      const ms = dayMs(p.day);
      if (ms > startMs && ms < endMs) out.push({ ms, cents: p.cents });
    }
    return out;
  }, [points, startMs, endMs]);

  const visibleSales = scopedSales
    .map((s) => ({ ms: dayMs(s.sold_at), cents: s.price_cents }))
    .filter((s) => s.ms >= startMs && s.ms < endMs);

  if (!hasData) return null;

  const values = [...visible.map((p) => p.cents), ...visibleSales.map((s) => s.cents)].filter(
    (c): c is number => c != null,
  );
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 1;
  if (lo === hi) {
    lo = Math.max(0, lo * 0.9);
    hi = hi * 1.1 || 1;
  }

  const x = (ms: number) => ((ms - startMs) / (endMs - startMs || 1)) * width;
  const y = (cents: number) => PAD_Y + (1 - (cents - lo) / (hi - lo)) * (HEIGHT - PAD_Y * 2);

  let path = "";
  for (let i = 0; i < visible.length; i++) {
    const p = visible[i];
    if (p.cents == null) continue;
    const nextMs = visible[i + 1]?.ms ?? endMs;
    const prev = visible[i - 1];
    path += `${prev && prev.cents != null ? "L" : "M"}${x(p.ms).toFixed(1)},${y(p.cents).toFixed(1)}`;
    path += `L${x(nextMs).toFixed(1)},${y(p.cents).toFixed(1)}`;
  }

  const latest = visible[visible.length - 1]?.cents ?? null;
  const firstValue = visible.find((p) => p.cents != null)?.cents ?? null;
  const shownMs = hoverMs ?? todayMs;
  const shownCents = hoverMs == null ? latest : valueAt(points, hoverMs);
  const change =
    hoverMs == null && latest != null && firstValue != null && firstValue !== latest
      ? Math.round(((latest - firstValue) / firstValue) * 1000) / 10
      : null;
  const money = (cents: number) => formatMoney(moneyFromCents(cents, currency));

  const onPointer = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || !width) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const ms = startMs + ratio * (endMs - startMs);
    setHoverMs(Math.floor(ms / DAY_MS) * DAY_MS);
  };

  return (
    <section className={styles.chart} aria-label="Price history">
      <div className={styles.head}>
        <div>
          <p className={styles.label}>Lowest ask {useAll ? "· all sizes" : `· ${sizeDisplay}`}</p>
          <p className={styles.value}>
            {shownCents != null ? money(shownCents) : "No ask"}
            {change != null ? (
              <span className={change < 0 ? styles.down : styles.up}>
                {change > 0 ? "+" : ""}
                {change}%
              </span>
            ) : null}
          </p>
          <p className={styles.date}>{hoverMs == null || hoverMs >= todayMs ? "Today" : shortDate(shownMs)}</p>
        </div>
        <div className={styles.controls}>
          {sizeRows.length ? (
            <div className={styles.toggle} role="group" aria-label="Sizes">
              <button type="button" className={!allSizes ? styles.on : undefined} onClick={() => setAllSizes(false)}>
                This size
              </button>
              <button type="button" className={allSizes ? styles.on : undefined} onClick={() => setAllSizes(true)}>
                All
              </button>
            </div>
          ) : null}
          <div className={styles.toggle} role="group" aria-label="Time range">
            {RANGES.map(([key]) => (
              <button key={key} type="button" className={range === key ? styles.on : undefined} onClick={() => setRange(key)}>
                {key}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        ref={wrapRef}
        className={styles.plot}
        onPointerMove={(e) => onPointer(e.clientX)}
        onPointerDown={(e) => onPointer(e.clientX)}
        onPointerLeave={() => setHoverMs(null)}
      >
        {width > 0 ? (
          <svg width={width} height={HEIGHT} role="img" aria-label="Lowest ask over time">
            <line x1={0} x2={width} y1={y(hi)} y2={y(hi)} className={styles.grid} />
            <line x1={0} x2={width} y1={y(lo)} y2={y(lo)} className={styles.grid} />
            {path ? <path d={path} className={styles.line} /> : null}
            {visibleSales.map((s, i) => (
              <circle key={i} cx={x(s.ms)} cy={y(s.cents)} r={3.5} className={styles.sale} />
            ))}
            {hoverMs != null ? (
              <line x1={x(hoverMs)} x2={x(hoverMs)} y1={0} y2={HEIGHT} className={styles.cursor} />
            ) : null}
          </svg>
        ) : null}
        {values.length ? (
          <>
            <span className={styles.axisTop}>{money(hi)}</span>
            <span className={styles.axisBottom}>{money(lo)}</span>
          </>
        ) : null}
      </div>
      <div className={styles.foot}>
        <span>{startMs >= todayMs ? "Tracking started today" : shortDate(startMs)}</span>
        {visibleSales.length ? (
          <span className={styles.legend}>
            <i className={styles.saleDot} /> Sales
          </span>
        ) : null}
        <span>Today</span>
      </div>
    </section>
  );
}
