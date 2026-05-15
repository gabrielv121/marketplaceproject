import type { BookEntry, Money, SizeRow } from "@/types/marketplace";

function money(amount: string, currencyCode = "USD"): Money {
  return { amount, currencyCode };
}

function randomAround(base: number, spread: number): string {
  const v = base + (Math.random() - 0.5) * spread * 2;
  return Math.max(1, Math.round(v)).toFixed(0);
}

const SIZES = ["US 7", "US 7.5", "US 8", "US 8.5", "US 9", "US 9.5", "US 10", "US 10.5", "US 11"];

export function buildMockSizeRows(handle: string, currency = "USD"): SizeRow[] {
  let seed = 0;
  for (let i = 0; i < handle.length; i++) seed += handle.charCodeAt(i);
  const base = 120 + (seed % 80);

  return SIZES.map((label, i) => {
    const offset = (seed + i * 7) % 25;
    const ask = Number(randomAround(base + offset, 15));
    const bid = Math.max(1, ask - 8 - (i % 5));
    const last = Math.max(1, ask - 3 - (i % 3));
    return {
      id: `${handle}-${label}`,
      label,
      lowestAsk: money(String(ask), currency),
      highestBid: money(String(bid), currency),
      lastSale: money(String(last), currency),
    };
  });
}

export function buildMockOrderBook(lowestAskAmount: number, currency = "USD"): { asks: BookEntry[]; bids: BookEntry[] } {
  const asks: BookEntry[] = [];
  const bids: BookEntry[] = [];
  for (let i = 0; i < 6; i++) {
    asks.push({
      id: `ask-${i}`,
      side: "ask",
      qty: 1 + (i % 3),
      price: money(String(lowestAskAmount + i * 2), currency),
    });
  }
  for (let i = 0; i < 6; i++) {
    bids.push({
      id: `bid-${i}`,
      side: "bid",
      qty: 1 + ((i + 1) % 4),
      price: money(String(Math.max(1, lowestAskAmount - 10 - i * 3)), currency),
    });
  }
  return { asks: asks.reverse(), bids };
}
