import { createSessionClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { GlobalBotToggle } from "@/components/dashboard/GlobalBotToggle";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Leer estado de bot_global_enabled
  const { data: setting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "bot_global_enabled")
    .single();

  const isGlobalEnabled = setting ? Boolean(setting.value) : true;

  return (
    <div className="min-h-screen bg-white flex">
      <Sidebar userEmail={user?.email} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-[#E5E5E5] px-6 flex items-center justify-between bg-white shrink-0">
          <div>
            <h2 className="text-[14px] font-semibold text-[#0A0A0A]">
              Panel de Control
            </h2>
          </div>
          <GlobalBotToggle initialEnabled={isGlobalEnabled} />
        </header>

        <main className="flex-1 flex min-h-0 bg-white">{children}</main>
      </div>
    </div>
  );
}
