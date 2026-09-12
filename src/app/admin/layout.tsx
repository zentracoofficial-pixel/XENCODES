import { requireAdmin } from "@/lib/admin";
import { AdminSidebar, AdminTopBar } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-screen bg-secondary/30">
      <AdminSidebar adminEmail={admin.email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar />
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
