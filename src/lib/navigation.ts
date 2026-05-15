import { useCallback } from "react";
import type { Location } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";

export function returnPath(location: Location): string {
  return location.pathname + location.search;
}

/** Pass on `<Link state={...}>` so a detail page can return here. */
export function returnToState(location: Location): { from: string } {
  return { from: returnPath(location) };
}

export function canNavigateBack(): boolean {
  if (typeof window === "undefined") return false;
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === "number" && idx > 0;
}

export function useNavigateBack(fallback = "/") {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const from = (location.state as { from?: string } | null)?.from;
    if (typeof from === "string" && from.startsWith("/") && from !== location.pathname) {
      navigate(from);
      return;
    }
    if (canNavigateBack()) {
      navigate(-1);
      return;
    }
    navigate(fallback);
  }, [navigate, location.state, location.pathname, fallback]);
}
