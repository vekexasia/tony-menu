"use client";

import { useSearchParams } from "next/navigation";
import { StaffGate } from "@/components/staff/StaffGate";
import { TableDetail } from "@/components/staff/TableDetail";

export default function StaffTablePage() {
  const sessionId = useSearchParams().get("sessionId");
  return (
    <StaffGate>
      {sessionId ? <TableDetail sessionId={sessionId} /> : <main className="p-6 text-sm text-red-700">Missing sessionId</main>}
    </StaffGate>
  );
}
