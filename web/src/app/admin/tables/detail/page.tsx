"use client";

import { useSearchParams } from "next/navigation";
import AdminTableDetailPage from "@/components/admin/pages/AdminTableDetailPage";

export default function AdminTableDetailRoute() {
  const tableId = useSearchParams().get("tableId");
  if (!tableId) return <main className="p-6 text-sm text-red-700">Missing tableId</main>;
  return <AdminTableDetailPage tableId={tableId} />;
}
