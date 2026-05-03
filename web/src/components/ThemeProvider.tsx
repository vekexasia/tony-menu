"use client";

import { useEffect } from "react";
import { useRestaurantStore } from "@/stores/restaurantStore";
import { applyPalette, DEFAULT_PALETTE } from "@/lib/palettes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const palette = useRestaurantStore((s) => s.data?.theme?.palette);

  useEffect(() => {
    applyPalette(palette ?? DEFAULT_PALETTE);
  }, [palette]);

  return <>{children}</>;
}
