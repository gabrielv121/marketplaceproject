import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchMyFavoriteHandles, toggleFavoriteProduct } from "@/lib/favorites";

export function useProductFavorites() {
  const { user } = useAuth();
  const [favoriteHandles, setFavoriteHandles] = useState<Set<string>>(() => new Set());
  const [favoriteBusyHandle, setFavoriteBusyHandle] = useState<string | null>(null);

  const refreshFavorites = useCallback(() => {
    if (!user) {
      setFavoriteHandles(new Set());
      return;
    }
    void fetchMyFavoriteHandles()
      .then((handles) => setFavoriteHandles(new Set(handles)))
      .catch(() => setFavoriteHandles(new Set()));
  }, [user]);

  useEffect(() => {
    refreshFavorites();
  }, [refreshFavorites]);

  const onToggleFavorite = user
    ? (productHandle: string, next: boolean) => {
        setFavoriteBusyHandle(productHandle);
        void toggleFavoriteProduct(productHandle, next)
          .then(() => {
            setFavoriteHandles((current) => {
              const updated = new Set(current);
              if (next) updated.add(productHandle);
              else updated.delete(productHandle);
              return updated;
            });
          })
          .finally(() => setFavoriteBusyHandle(null));
      }
    : undefined;

  return { favoriteHandles, favoriteBusyHandle, onToggleFavorite };
}
