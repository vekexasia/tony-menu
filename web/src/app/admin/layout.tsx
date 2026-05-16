import { Suspense } from "react";
import "./admin.css";
import { AdminI18nProvider } from "./AdminI18nProvider";
import AdminContent from "./AdminContent";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Font Awesome — hoisted by Next.js to <head> */}
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
        crossOrigin="anonymous"
        referrerPolicy="no-referrer"
      />
      <AdminI18nProvider>
        <Suspense fallback={
          <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div className="text-gray-500">…</div>
          </div>
        }>
          <AdminContent>{children}</AdminContent>
        </Suspense>
      </AdminI18nProvider>
    </>
  );
}
