import { DashboardNav } from "./dashboard-nav";
import { Container } from "@/components/ui/container";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/30">
      <DashboardNav />
      <main className="flex-1 py-10">
        <Container>{children}</Container>
      </main>
    </div>
  );
}
