import { Sidebar } from "@/components/application/sidebar/sidebar";

// Fixed placeholders
const USER_NAME = "Admin";
const CLIENT_NAME = "ABC Pest Busters";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-dvh bg-secondary">
            <Sidebar clientName={CLIENT_NAME} userName={USER_NAME} />
            <main className="min-w-0 flex-1 p-8">{children}</main>
        </div>
    );
}
