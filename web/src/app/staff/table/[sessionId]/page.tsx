import { StaffGate } from "@/components/staff/StaffGate";
import { TableDetail } from "@/components/staff/TableDetail";

export default async function StaffTablePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <StaffGate>
      <TableDetail sessionId={sessionId} />
    </StaffGate>
  );
}
