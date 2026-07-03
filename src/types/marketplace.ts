export type Money = { amount: string; currencyCode: string };

export type SizeRow = {
  id: string;
  label: string;
  /** P2P size key — e.g. `US M 10`. Falls back to `label` when omitted. */
  canonicalLabel?: string;
  conversions?: {
    usMen: number | null;
    usWomen: number | null;
    eu: number;
    uk: number;
    cm: number;
    kr: number;
  } | null;
  lowestAsk: Money | null;
  highestBid: Money | null;
  lastSale: Money | null;
};

export type OrderBookSide = "ask" | "bid";

export type BookEntry = {
  id: string;
  price: Money;
  qty: number;
  side: OrderBookSide;
};
