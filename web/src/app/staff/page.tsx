import { StaffGate } from "@/components/staff/StaffGate";
import { FloorView } from "@/components/staff/FloorView";

export default function StaffPage() {
  return (
    <StaffGate>
      <FloorView />
    </StaffGate>
  );
}
