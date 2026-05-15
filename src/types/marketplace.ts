export type Money = { amount: string; currencyCode: string };

export type SizeRow = {
  id: string;
  label: string;
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
