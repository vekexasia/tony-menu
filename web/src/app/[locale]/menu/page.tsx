import { Suspense } from "react";
import MenuPageClient from "./MenuPageClient";
import { LoadingScreen } from "@/components/ui/StatusScreen";

// Wrap in Suspense because MenuPageClient uses useSearchParams()
export default function MenuPage() {
  return (
    <Suspense
      fallback={<LoadingScreen />}
    >
      <MenuPageClient />
    </Suspense>
  );
}
