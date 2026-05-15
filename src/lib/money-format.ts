import type { Money } from "@/types/marketplace";

export function formatMoney(m: Money): string {
  const n = Number(m.amount);
  if (Number.isNaN(n)) return m.amount;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: m.currencyCode,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${m.currencyCode} ${m.amount}`;
  }
}
