import { Sidebar } from "@/components/application/sidebar/sidebar";
import { CLIENT_NAME, USER_NAME } from "@/lib/account";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-dvh bg-secondary">
            <Sidebar clientName={CLIENT_NAME} userName={USER_NAME} />
            <main className="min-w-0 flex-1 p-8">{children}</main>
        </div>
    );
}
