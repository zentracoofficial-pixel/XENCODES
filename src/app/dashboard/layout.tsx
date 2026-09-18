import { requireActiveUser } from "@/lib/session";
import { DashboardSidebar, DashboardTopBar } from "./dashboard-nav";

/**
 * Runs before every dashboard page. See requireActiveUser(): this is what
 * stops a suspended or deleted account from continuing to use a session
 * issued before that happened, since the proxy only ever checked the JWT.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireActiveUser();

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopBar />
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-9">
          <div className="mx-auto w-full max-w-4xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
