import AdminTableDetailPage from "@/components/admin/pages/AdminTableDetailPage";

export default async function AdminTableRoute({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  return <AdminTableDetailPage tableId={tableId} />;
}
