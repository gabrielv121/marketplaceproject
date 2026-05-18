import { useEffect, useMemo, useState } from "react";
import { fetchLatestSalesByHandle } from "@/lib/p2p";
import { isP2pConfigured } from "@/lib/supabase";
import type { Money } from "@/types/marketplace";

export function useProductLastSales(handles: string[]): Map<string, Money | null> {
  const [salesByHandle, setSalesByHandle] = useState<Map<string, Money | null>>(() => new Map());
  const handleKey = useMemo(() => [...new Set(handles.filter(Boolean))].sort().join("\0"), [handles]);

  useEffect(() => {
    const unique = handleKey ? handleKey.split("\0") : [];
    if (!isP2pConfigured() || !unique.length) {
      setSalesByHandle(new Map());
      return;
    }
    let cancelled = false;
    void fetchLatestSalesByHandle(unique).then((map) => {
      if (!cancelled) setSalesByHandle(map);
    });
    return () => {
      cancelled = true;
    };
  }, [handleKey]);

  return salesByHandle;
}
